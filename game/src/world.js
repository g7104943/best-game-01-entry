// The simulation: one fixed-step world holding the tiles, the player, the
// enemies, the boss and everything that flies, falls or explodes. The loop
// in main.js feeds it input and a fixed dt; it answers with event flags the
// loop turns into screens and sounds.
import {
  BOSS_LEVEL,
  CHUNK_ROWS,
  DRAFT_EVERY,
  GRAVITY,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  ROWS_PER_LEVEL,
  TILE,
  VIEW_H,
  WORLD_W,
} from './config.js';
import { createRandom } from './random.js';
import {
  T_BEDROCK,
  T_BOULDER,
  T_CRYSTAL,
  T_DIRT,
  T_EMPTY,
  T_GAS,
  T_LAVA,
  T_METAL,
  T_ORE,
  T_ROCK,
  T_WATER,
  TILE_DEF,
  createTiles,
  ensureRows,
  isDiggable,
  isSolid,
  levelOf,
  rowOfLevel,
  setTile,
  tileAt,
} from './tiles.js';
import { createParticles, addShake, burst, dirtBurst, emberDrift, explosionBurst, floatText, pickupBurst, sparkBurst, updateParticles } from './particles.js';
import { baseStats } from './upgrades.js';
import { createBoss, createEnemy, damageBoss, hurtEnemy, updateBoss, updateEnemy } from './enemies.js';

export const EVENT_NONE = 0;
export const EVENT_DRAFT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_LEVEL = 8;
export const EVENT_BOSS = 16;

export function createWorld(seed, difficulty, audio) {
  const rand = createRandom(seed);
  const tiles = createTiles();
  const shaftState = { x: 16 };
  ensureRows(tiles, 40, rand, shaftState);
  const stats = baseStats(difficulty);
  const world = {
    seed,
    rand,
    difficulty,
    audio,
    tiles,
    shaftState,
    damage: new Map(),
    particles: createParticles(),
    stats,
    owned: {},
    player: {
      x: 16 * TILE + TILE / 2,
      y: 2 * TILE,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      hull: stats.maxHull,
      heat: 0,
      bombs: stats.bombs,
      iframe: 0,
      venting: 0,
      dead: false,
      coyote: 0,
      jumpBuffer: 0,
      jumpCut: false,
      drillTime: 0,
      drillTarget: null,
      drillTick: 0,
      lavaAcc: 0,
    },
    enemies: [],
    projectiles: [],
    bombs: [],
    pickups: [],
    boulders: [],
    pendingBooms: [],
    boss: null,
    bossSpawned: false,
    bossDefeated: false,
    arenaSealed: false,
    cameraY: -20,
    level: 1,
    maxLevel: 1,
    nextDraftLevel: DRAFT_EVERY,
    draftPending: false,
    score: 0,
    ore: 0,
    gems: 0,
    kills: 0,
    time: 0,
    endless: false,
    victoryTimer: 0,
    deathTimer: 0,
    spawnTimer: 2,
    digSoundTimer: 0,
    freeRerolls: 1,
    arenaTop: rowOfLevel(BOSS_LEVEL) * TILE,
  };
  world.damagePlayer = (amount, kx, ky, opts) => damagePlayer(world, amount, kx, ky, opts);
  world.spawnProjectile = (x, y, vx, vy, kind, damage) => {
    world.projectiles.push({ x, y, vx, vy, kind, damage, life: 4, radius: kind === 'glob' ? 12 : 8 });
  };
  world.spawnBossAdds = () => {
    for (let i = 0; i < 2; i += 1) {
      if (world.enemies.length >= 8) return;
      const gx = (6 + i * 18) * TILE;
      world.enemies.push(createEnemy('grub', gx, world.arenaTop + 11 * TILE, difficulty, world.rand));
    }
  };
  world.spawnRockRain = () => {
    for (let i = 0; i < 3; i += 1) {
      const x = (3 + world.rand.next() * 26) * TILE;
      world.boulders.push({ x, y: world.arenaTop + TILE, vy: 0, size: 30, rock: true });
      burst(world.particles, x, world.arenaTop + TILE, { count: 5, speed: 60, life: 0.5, size: 4, colors: ['#7d7a86'], gravity: 200 });
    }
  };
  world.onEnemyKilled = (e) => {
    world.kills += 1;
    addScore(world, ENEMY_SCORE[e.kind] ?? 20);
    burst(world.particles, e.x, e.y - e.height / 2, { count: 14, speed: 180, life: 0.6, size: 5, colors: ENEMY_COLORS[e.kind], gravity: 500 });
    floatText(world.particles, e.x, e.y - e.height - 8, `+${Math.round((ENEMY_SCORE[e.kind] ?? 20) * world.stats.scoreMult)}`, '#ffd76a');
    dropLoot(world, e.x, e.y - 10, e.kind);
    world.audio.enemyDie();
  };
  world.onBossKilled = () => {
    world.bossDefeated = true;
    world.victoryTimer = 1.4;
    addScore(world, 2000);
    addShake(world.particles, 0.8);
    explosionBurst(world.particles, world.boss.x, world.boss.y);
    world.audio.explosion();
    for (let i = 0; i < 8; i += 1) {
      world.pickups.push({ x: world.boss.x + (world.rand.next() - 0.5) * 200, y: world.boss.y + (world.rand.next() - 0.5) * 80, vx: (world.rand.next() - 0.5) * 120, vy: -80, kind: 'gem', value: 1, life: 20 });
    }
    for (let i = 0; i < 2; i += 1) {
      world.pickups.push({ x: world.boss.x + (world.rand.next() - 0.5) * 160, y: world.boss.y, vx: 0, vy: -60, kind: 'heart', value: 1, life: 20 });
    }
    // Carve the way down for endless mode through the arena floor.
    const floorRow = rowOfLevel(BOSS_LEVEL) + ROWS_PER_LEVEL - 1;
    for (let x = 14; x <= 17; x += 1) setTile(world.tiles, x, floorRow, T_EMPTY);
    for (let x = 14; x <= 17; x += 1) setTile(world.tiles, x, floorRow + 1, T_EMPTY);
  };
  return world;
}

const ENEMY_SCORE = { grub: 25, bat: 20, imp: 60, golem: 150 };
const ENEMY_COLORS = {
  grub: ['#9dbb6a', '#7a9a4e', '#c4d98a'],
  bat: ['#8a7bb8', '#6a5a98', '#a89ad0'],
  imp: ['#ff7a3c', '#ff5252', '#ffb347'],
  golem: ['#7d7a86', '#9a97a3', '#5d5a66'],
};

export function addScore(world, points) {
  world.score += Math.round(points * world.stats.scoreMult);
}

function dropLoot(world, x, y, kind) {
  const rand = world.rand;
  const oreCount = kind === 'golem' ? 4 : kind === 'imp' ? 2 : 1;
  for (let i = 0; i < oreCount; i += 1) {
    world.pickups.push({ x: x + rand.range(-14, 14), y, vx: rand.range(-70, 70), vy: rand.range(-160, -40), kind: 'ore', value: 1, life: 14 });
  }
  if (rand.chance(0.12 * world.stats.gemLuck)) {
    world.pickups.push({ x, y, vx: rand.range(-50, 50), vy: -120, kind: 'gem', value: 1, life: 14 });
  }
  if (rand.chance(kind === 'golem' ? 0.5 : 0.06)) {
    world.pickups.push({ x, y, vx: 0, vy: -100, kind: 'heart', value: 1, life: 14 });
  }
  if (rand.chance(0.1)) {
    world.pickups.push({ x, y, vx: 0, vy: -100, kind: 'bomb', value: 1, life: 14 });
  }
}

function damagePlayer(world, amount, kx, ky, opts) {
  const p = world.player;
  if (p.dead) return;
  if (!opts?.ignoreIframe && p.iframe > 0) return;
  const dealt = Math.max(1, Math.round(amount * world.stats.armor));
  p.hull -= dealt;
  p.iframe = opts?.iframe ?? 0.8;
  if (kx) p.vx += kx;
  if (ky) p.vy += ky;
  addShake(world.particles, 0.35);
  burst(world.particles, p.x, p.y - 18, { count: 8, speed: 160, life: 0.5, size: 4, colors: ['#ff5252', '#ff8a7a'], gravity: 300 });
  floatText(world.particles, p.x, p.y - 48, `-${dealt}`, '#ff6a5a');
  world.audio.hurt();
  if (p.hull <= 0) {
    if (world.stats.revive) {
      world.stats.revive = false;
      p.hull = Math.round(world.stats.maxHull * 0.5);
      p.iframe = 2;
      floatText(world.particles, p.x, p.y - 60, 'SECOND WIND!', '#8dff9e');
      burst(world.particles, p.x, p.y - 18, { count: 24, speed: 220, life: 0.8, size: 5, colors: ['#8dff9e', '#ffffff'], gravity: 100, glow: true });
      world.audio.draft();
    } else {
      p.dead = true;
      p.hull = 0;
      world.deathTimer = 1.1;
      explosionBurst(world.particles, p.x, p.y - 18);
      world.audio.explosion();
    }
  }
}

function tileCenter(x, y) {
  return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
}

function breakTile(world, x, y, silent) {
  const tile = tileAt(world.tiles, x, y);
  if (!isDiggable(tile)) return false;
  setTile(world.tiles, x, y, T_EMPTY);
  world.damage.delete(`${x},${y}`);
  const c = tileCenter(x, y);
  if (tile === T_GAS) {
    world.pendingBooms.push({ x: c.x, y: c.y, timer: 0.35, radius: 1, damage: 30, chain: true });
    burst(world.particles, c.x, c.y, { count: 6, speed: 80, life: 0.4, size: 5, colors: ['#c4d98a', '#9dbb6a'], gravity: -100 });
    return true;
  }
  const kind = tile === T_CRYSTAL || tile === T_METAL ? 'gem' : tile === T_ROCK || tile === T_BOULDER ? 'rock' : 'dirt';
  dirtBurst(world.particles, c.x, c.y, kind);
  if (!silent) world.audio.breakTile();
  const rand = world.rand;
  if (tile === T_CRYSTAL) {
    const n = rand.chance(0.5) ? 2 : 1;
    for (let i = 0; i < n; i += 1) world.pickups.push({ x: c.x, y: c.y, vx: rand.range(-60, 60), vy: rand.range(-140, -40), kind: 'gem', value: 1, life: 16 });
  } else if (tile === T_ORE) {
    for (let i = 0; i < 2; i += 1) world.pickups.push({ x: c.x, y: c.y, vx: rand.range(-60, 60), vy: rand.range(-140, -40), kind: 'ore', value: 1, life: 16 });
    if (rand.chance(0.15 * world.stats.gemLuck)) world.pickups.push({ x: c.x, y: c.y, vx: 0, vy: -100, kind: 'gem', value: 1, life: 16 });
  } else if (tile === T_METAL) {
    for (let i = 0; i < 4; i += 1) world.pickups.push({ x: c.x, y: c.y, vx: rand.range(-70, 70), vy: rand.range(-150, -40), kind: 'ore', value: 1, life: 16 });
    if (rand.chance(0.4 * world.stats.gemLuck)) world.pickups.push({ x: c.x, y: c.y, vx: 0, vy: -100, kind: 'gem', value: 1, life: 16 });
  } else if (tile === T_DIRT && rand.chance(0.08)) {
    world.pickups.push({ x: c.x, y: c.y, vx: 0, vy: -80, kind: 'ore', value: 1, life: 16 });
  }
  releaseBoulders(world, x, y);
  return true;
}

function releaseBoulders(world, x, y) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -3; dy <= 0; dy += 1) {
      const bx = x + dx;
      const by = y + dy;
      if (tileAt(world.tiles, bx, by) === T_BOULDER && tileAt(world.tiles, bx, by + 1) === T_EMPTY) {
        setTile(world.tiles, bx, by, T_EMPTY);
        world.boulders.push({ x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2, vy: 0, size: 34, rock: false });
      }
    }
  }
}

export function explode(world, x, y, radiusTiles, damage) {
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  for (let dy = -radiusTiles; dy <= radiusTiles; dy += 1) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radiusTiles + 1) continue;
      const tile = tileAt(world.tiles, cx + dx, cy + dy);
      if (tile === T_BEDROCK) continue;
      if (isDiggable(tile)) breakTile(world, cx + dx, cy + dy, true);
    }
  }
  const radiusPx = radiusTiles * TILE + 30;
  for (const e of world.enemies) {
    if (!e.dead && Math.hypot(e.x - x, e.y - e.height / 2 - y) < radiusPx) {
      hurtEnemy(world, e, damage, Math.sign(e.x - x) * 200, -180);
    }
  }
  if (world.boss && !world.boss.dead) {
    const boss = world.boss;
    if (Math.hypot(boss.x - x, boss.y - y) < radiusPx + 40) damageBoss(world, boss, damage * 0.7);
  }
  const p = world.player;
  if (!p.dead && Math.hypot(p.x - x, p.y - 18 - y) < radiusPx) {
    damagePlayer(world, 16, Math.sign(p.x - x) * 300, -320, { ignoreIframe: false, iframe: 0.5 });
  }
  explosionBurst(world.particles, x, y);
  world.audio.explosion();
}

function playerTileAt(world, px, py) {
  return tileAt(world.tiles, Math.floor(px / TILE), Math.floor(py / TILE));
}

function updatePlayer(world, input, dt) {
  const p = world.player;
  const stats = world.stats;
  if (p.dead) {
    // The body stays where it fell: no drifting through the floor while the
    // death timer runs, and no depth credit for a corpse.
    p.vx = 0;
    p.vy = 0;
    return;
  }
  p.iframe = Math.max(0, p.iframe - dt);
  p.venting = Math.max(0, p.venting - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

  const axis = input.axis();
  const speed = MOVE_SPEED * stats.moveSpeed * (p.hull < stats.maxHull * 0.3 && stats.adrenaline > 0 ? 1 + 0.2 * stats.adrenaline : 1);
  const inWater = playerTileAt(world, p.x, p.y - 10) === T_WATER;
  const targetVx = axis * speed * (inWater ? 0.75 : 1);
  p.vx += (targetVx - p.vx) * Math.min(1, dt * 14);
  if (axis !== 0) p.facing = axis;

  if (input.jumpHeld()) p.jumpBuffer = 0.12;
  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = -JUMP_SPEED;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.jumpCut = false;
  }
  if (!input.jumpHeld() && p.vy < -180 && !p.jumpCut) {
    p.vy *= 0.55;
    p.jumpCut = true;
  }

  p.vy += GRAVITY * dt * (inWater ? 0.55 : 1);
  p.vy = Math.min(p.vy, 900);

  // Horizontal move with tile collision.
  const hw = PLAYER_W / 2;
  let nx = p.x + p.vx * dt;
  const blocked = { left: false, right: false };
  if (p.vx > 0) {
    const edge = nx + hw;
    if (isSolid(playerTileAt(world, edge, p.y - 6)) || isSolid(playerTileAt(world, edge, p.y - PLAYER_H + 6)) || isSolid(playerTileAt(world, edge, p.y - PLAYER_H / 2))) {
      nx = Math.floor(edge / TILE) * TILE - hw - 0.01;
      blocked.right = true;
    }
  } else if (p.vx < 0) {
    const edge = nx - hw;
    if (isSolid(playerTileAt(world, edge, p.y - 6)) || isSolid(playerTileAt(world, edge, p.y - PLAYER_H + 6)) || isSolid(playerTileAt(world, edge, p.y - PLAYER_H / 2))) {
      nx = Math.floor(edge / TILE + 1) * TILE + hw + 0.01;
      blocked.left = true;
    }
  }
  p.x = Math.max(TILE + hw, Math.min((WORLD_W - 1) * TILE - hw, nx));

  // Vertical move with tile collision.
  let ny = p.y + p.vy * dt;
  p.onGround = false;
  if (p.vy >= 0) {
    if (isSolid(playerTileAt(world, p.x - hw + 4, ny)) || isSolid(playerTileAt(world, p.x + hw - 4, ny))) {
      ny = Math.floor(ny / TILE) * TILE;
      p.vy = 0;
      p.onGround = true;
      p.coyote = 0.1;
    }
  } else if (isSolid(playerTileAt(world, p.x - hw + 4, ny - PLAYER_H)) || isSolid(playerTileAt(world, p.x + hw - 4, ny - PLAYER_H))) {
    ny = Math.floor((ny - PLAYER_H) / TILE + 1) * TILE + PLAYER_H;
    p.vy = 0;
  }
  p.y = ny;

  updateDrilling(world, input, dt, blocked);
  updateHazards(world, dt, inWater);

  // Bombs.
  if ((input.bombPressed() || input.state.rightDown) && p.bombs > 0 && !world.bombHeld) {
    world.bombHeld = true;
    p.bombs -= 1;
    world.bombs.push({ x: p.x, y: p.y - 20, fuse: 1.2 });
    world.audio.bombPlace();
  }
  if (!input.bombPressed() && !input.state.rightDown) world.bombHeld = false;
}

function drillTargetFor(world, input, blocked) {
  const p = world.player;
  // Mouse-aimed drilling wins when the button is held on a nearby tile.
  if (input.state.mouseDown) {
    const wx = input.state.mouseX;
    const wy = input.state.mouseY + world.cameraY;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    const tile = tileAt(world.tiles, tx, ty);
    const reach = 90 + (world.stats.drillReach - 1) * 40;
    if (isDiggable(tile) && Math.hypot(wx - p.x, wy - (p.y - 18)) < reach) {
      return { x: tx, y: ty, dirX: Math.sign(wx - p.x), dirY: Math.sign(wy - (p.y - 18)) };
    }
  }
  // Dig down: sample the whole body width, so standing on a one-tile
  // ledge still finds the rock underfoot.
  if (input.digDownHeld()) {
    const ty = Math.floor((p.y + 2) / TILE);
    for (const sx of [p.x, p.x - PLAYER_W / 2 + 4, p.x + PLAYER_W / 2 - 4]) {
      const tx = Math.floor(sx / TILE);
      if (isDiggable(tileAt(world.tiles, tx, ty))) return { x: tx, y: ty, dirX: 0, dirY: 1 };
    }
  }
  // Dig sideways by pushing.
  const axis = input.axis();
  if (axis !== 0 && ((axis > 0 && blocked.right) || (axis < 0 && blocked.left))) {
    const hw = PLAYER_W / 2;
    const edgeX = p.x + axis * (hw + 4);
    for (const sampleY of [p.y - 8, p.y - PLAYER_H / 2, p.y - PLAYER_H + 8]) {
      const tx = Math.floor(edgeX / TILE);
      const ty = Math.floor(sampleY / TILE);
      if (isDiggable(tileAt(world.tiles, tx, ty))) return { x: tx, y: ty, dirX: axis, dirY: 0 };
    }
  }
  // Dig up while jumping into a ceiling: the whole body width, as below.
  if (input.digUpHeld()) {
    const ty = Math.floor((p.y - PLAYER_H - 2) / TILE);
    for (const sx of [p.x, p.x - PLAYER_W / 2 + 4, p.x + PLAYER_W / 2 - 4]) {
      const tx = Math.floor(sx / TILE);
      if (isDiggable(tileAt(world.tiles, tx, ty))) return { x: tx, y: ty, dirX: 0, dirY: -1 };
    }
  }
  return null;
}

function applyDrillDamage(world, tx, ty, dps, dt) {
  const tile = tileAt(world.tiles, tx, ty);
  if (!isDiggable(tile)) return false;
  const key = `${tx},${ty}`;
  const hp = TILE_DEF[tile].hp;
  const dealt = (world.damage.get(key) ?? 0) + dps * dt;
  if (dealt >= hp) {
    breakTile(world, tx, ty, false);
  } else {
    world.damage.set(key, dealt);
  }
  return true;
}

function updateDrilling(world, input, dt, blocked) {
  const p = world.player;
  const stats = world.stats;
  const target = p.venting > 0 ? null : drillTargetFor(world, input, blocked);
  p.drillTarget = target;
  // The drill spins whenever the player is working it — chewing a tile, or
  // holding the aim on open air — and anything caught in front of it is
  // chewed too. Heat only builds while a tile is actually being cut.
  const spinning = p.venting <= 0 && (input.state.mouseDown || input.digDownHeld() || input.digUpHeld() || (input.axis() !== 0 && (blocked.left || blocked.right)));
  if (!target && !spinning) {
    p.drillTime = 0;
    return;
  }
  p.drillTime += dt;
  if (target) {
    const adrenaline = p.hull < stats.maxHull * 0.3 && stats.adrenaline > 0 ? 1 + 0.2 * stats.adrenaline : 1;
    const dps = 2.3 * stats.drillDamage * stats.drillSpeed * adrenaline;
    const hit = applyDrillDamage(world, target.x, target.y, dps, dt);
    if (hit && stats.drillReach >= 2) {
      applyDrillDamage(world, target.x + target.dirX, target.y + target.dirY, dps * 0.6, dt);
    }
    p.heat = Math.min(stats.maxHeat, p.heat + 7 * world.difficulty.heatGain * dt);
    const c = tileCenter(target.x, target.y);
    if (Math.random() < dt * 18) sparkBurst(world.particles, c.x, c.y);
    world.digSoundTimer -= dt;
    if (world.digSoundTimer <= 0) {
      world.digSoundTimer = 0.18;
      world.audio.dig();
    }
  }
  // The drill chews enemies and the boss caught in front of the player.
  p.drillTick -= dt;
  if (p.drillTick <= 0) {
    p.drillTick = 0.15;
    const cx = p.x;
    const cy = p.y - 18;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - cx, e.y - e.height / 2 - cy);
      if (d < 64) hurtEnemy(world, e, 5 * stats.drillDamage * stats.enemyDrill, Math.sign(e.x - cx) * 60, -40);
    }
    const boss = world.boss;
    if (boss && !boss.dead) {
      const hd = Math.hypot(boss.x - cx, boss.y - cy);
      if (hd < 70) damageBoss(world, boss, 5 * stats.drillDamage * stats.enemyDrill);
    }
  }
}

function updateHazards(world, dt, inWater) {
  const p = world.player;
  const stats = world.stats;
  const feetTile = playerTileAt(world, p.x, p.y - 4);
  const bodyTile = playerTileAt(world, p.x, p.y - 20);
  if (feetTile === T_LAVA || bodyTile === T_LAVA) {
    p.heat = Math.min(stats.maxHeat, p.heat + 30 * world.difficulty.heatGain * dt);
    p.lavaAcc += dt;
    if (p.lavaAcc > 0.25) {
      p.lavaAcc = 0;
      damagePlayer(world, Math.round(5 * stats.lavaArmor), 0, -120, { ignoreIframe: true, iframe: 0 });
    }
    if (Math.random() < dt * 20) emberDrift(world.particles, p.x + (Math.random() - 0.5) * 24, p.y - 6);
  } else {
    p.lavaAcc = 0;
  }
  if (inWater) {
    p.heat = Math.max(0, p.heat - 60 * dt);
    if (Math.random() < dt * 8) {
      burst(world.particles, p.x + (Math.random() - 0.5) * 20, p.y - 10, { count: 1, speed: 20, life: 0.7, size: 3, colors: ['#7fc4ff', '#bfe6ff'], gravity: -120, drag: 0.98 });
    }
  } else if (!p.drillTarget) {
    p.heat = Math.max(0, p.heat - 11 * stats.heatCool * dt);
  }
  if (p.heat >= stats.maxHeat && p.venting <= 0) {
    p.venting = 1.5;
    p.heat = stats.maxHeat * 0.55;
    damagePlayer(world, 5, 0, 0, { ignoreIframe: true, iframe: 0 });
    floatText(world.particles, p.x, p.y - 56, 'OVERHEAT!', '#ff9d4d');
    burst(world.particles, p.x, p.y - 30, { count: 14, speed: 90, life: 0.8, size: 6, colors: ['#dddddd', '#aaaaaa'], gravity: -160, drag: 0.95 });
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const pk = world.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) {
      world.pickups.splice(i, 1);
      continue;
    }
    pk.vy += 900 * dt;
    pk.vy = Math.min(pk.vy, 500);
    const nx = pk.x + pk.vx * dt;
    if (!isSolid(playerTileAt(world, nx, pk.y))) pk.x = nx;
    else pk.vx = 0;
    const ny = pk.y + pk.vy * dt;
    if (!isSolid(playerTileAt(world, pk.x, ny + 6))) pk.y = ny;
    else {
      pk.y = Math.floor((ny + 6) / TILE) * TILE - 6;
      pk.vy = 0;
      pk.vx *= 0.9;
    }
    const dx = p.x - pk.x;
    const dy = p.y - 18 - pk.y;
    const dist = Math.hypot(dx, dy);
    if (!p.dead && dist < world.stats.magnet) {
      pk.x += (dx / dist) * 320 * dt;
      pk.y += (dy / dist) * 320 * dt;
    }
    if (!p.dead && dist < 30) {
      world.pickups.splice(i, 1);
      if (pk.kind === 'ore') {
        world.ore += 1;
        addScore(world, 10);
        pickupBurst(world.particles, pk.x, pk.y, '#ffb347');
        world.audio.pickup();
      } else if (pk.kind === 'gem') {
        world.gems += 1;
        addScore(world, 50);
        pickupBurst(world.particles, pk.x, pk.y, '#7fe7ff');
        world.audio.gem();
      } else if (pk.kind === 'heart') {
        p.hull = Math.min(world.stats.maxHull, p.hull + 20);
        floatText(world.particles, p.x, p.y - 50, '+20 HULL', '#8dff9e');
        pickupBurst(world.particles, pk.x, pk.y, '#8dff9e');
        world.audio.pickup();
      } else if (pk.kind === 'bomb') {
        p.bombs = Math.min(world.stats.maxBombs, p.bombs + 1);
        floatText(world.particles, p.x, p.y - 50, '+1 BOMB', '#ffd76a');
        pickupBurst(world.particles, pk.x, pk.y, '#ffd76a');
        world.audio.pickup();
      }
    }
  }
}

function updateBombs(world, dt) {
  for (let i = world.bombs.length - 1; i >= 0; i -= 1) {
    const b = world.bombs[i];
    b.fuse -= dt;
    if (Math.random() < dt * 10) sparkBurst(world.particles, b.x, b.y - 8);
    if (b.fuse <= 0) {
      world.bombs.splice(i, 1);
      const radius = world.stats.bombPower >= 2 ? 2 : 1;
      explode(world, b.x, b.y, radius, Math.round(45 * world.stats.bombPower));
    }
  }
  for (let i = world.pendingBooms.length - 1; i >= 0; i -= 1) {
    const boom = world.pendingBooms[i];
    boom.timer -= dt;
    if (boom.timer <= 0) {
      world.pendingBooms.splice(i, 1);
      explode(world, boom.x, boom.y, boom.radius, boom.damage);
    }
  }
}

function updateBoulders(world, dt) {
  const p = world.player;
  for (let i = world.boulders.length - 1; i >= 0; i -= 1) {
    const b = world.boulders[i];
    b.vy += 1400 * dt;
    b.vy = Math.min(b.vy, 800);
    const ny = b.y + b.vy * dt;
    const half = b.size / 2;
    // Crush the player.
    if (!p.dead && Math.abs(b.x - p.x) < half + PLAYER_W / 2 && ny + half > p.y - PLAYER_H && ny - half < p.y) {
      damagePlayer(world, Math.round(25 * world.stats.crushArmor), 0, 120, { ignoreIframe: false, iframe: 0.6 });
      dirtBurst(world.particles, b.x, ny, 'rock');
      world.boulders.splice(i, 1);
      continue;
    }
    let landed = false;
    for (const e of world.enemies) {
      if (!e.dead && Math.abs(b.x - e.x) < half + e.width / 2 && ny + half > e.y - e.height && ny - half < e.y) {
        hurtEnemy(world, e, 40, 0, 0);
      }
    }
    if (isSolid(playerTileAt(world, b.x - half + 4, ny + half)) || isSolid(playerTileAt(world, b.x + half - 4, ny + half))) {
      landed = true;
    }
    if (landed) {
      const tx = Math.floor(b.x / TILE);
      const ty = Math.floor((ny + half) / TILE) - 1;
      if (!b.rock && tileAt(world.tiles, tx, ty) === T_EMPTY) {
        setTile(world.tiles, tx, ty, T_BOULDER);
      } else {
        dirtBurst(world.particles, b.x, ny, 'rock');
        addShake(world.particles, 0.2);
      }
      world.boulders.splice(i, 1);
    } else {
      b.y = ny;
    }
  }
}

function updateProjectiles(world, dt) {
  const p = world.player;
  for (let i = world.projectiles.length - 1; i >= 0; i -= 1) {
    const pr = world.projectiles[i];
    pr.life -= dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    if (pr.kind === 'glob') pr.vy += 160 * dt;
    let dead = pr.life <= 0;
    if (isSolid(playerTileAt(world, pr.x, pr.y))) {
      burst(world.particles, pr.x, pr.y, { count: 6, speed: 120, life: 0.4, size: 4, colors: ['#ff7a3c', '#ff5252'], gravity: 200, glow: true });
      dead = true;
    }
    if (!dead && !p.dead && Math.hypot(pr.x - p.x, pr.y - (p.y - 18)) < pr.radius + 15) {
      damagePlayer(world, pr.damage, Math.sign(pr.vx) * 200, -120);
      dead = true;
    }
    if (dead) world.projectiles.splice(i, 1);
    else if (Math.random() < dt * 20) emberDrift(world.particles, pr.x, pr.y);
  }
}

function updateSpawning(world, dt) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  world.spawnTimer = 2.2;
  const cap = Math.min(9, 3 + Math.floor(world.level / 4));
  if (world.enemies.length >= cap) return;
  if (world.boss && !world.boss.dead) return;
  const p = world.player;
  const rand = world.rand;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = rand.range(0, Math.PI * 2);
    const dist = rand.range(320, 640);
    const tx = Math.floor((p.x + Math.cos(angle) * dist) / TILE);
    const ty = Math.floor((p.y - 18 + Math.sin(angle) * dist) / TILE);
    if (tx < 2 || tx >= WORLD_W - 2 || ty < 3) continue;
    if (tileAt(world.tiles, tx, ty) !== T_EMPTY) continue;
    const level = world.level + (world.endless ? Math.floor((world.level - BOSS_LEVEL) * 0.5) : 0);
    let kind = 'grub';
    const roll = rand.next();
    if (level >= 20 && roll < 0.2) kind = 'golem';
    else if (level >= 13 && roll < 0.45) kind = 'imp';
    else if (level >= 5 && roll < 0.7) kind = 'bat';
    if (kind !== 'bat' && tileAt(world.tiles, tx, ty + 1) === T_EMPTY) continue;
    const e = createEnemy(kind, tx * TILE + TILE / 2, (ty + 1) * TILE, world.difficulty, rand);
    if (world.endless && world.level > BOSS_LEVEL) {
      const scale = 1 + (world.level - BOSS_LEVEL) * 0.08;
      e.hp = Math.round(e.hp * scale);
      e.maxHp = e.hp;
      e.damage = Math.round(e.damage * scale);
    }
    world.enemies.push(e);
    return;
  }
}

function updateBossTrigger(world) {
  if (world.bossSpawned || world.bossDefeated) return EVENT_NONE;
  const playerRow = Math.floor(world.player.y / TILE);
  if (playerRow >= rowOfLevel(BOSS_LEVEL) + 1 && world.level >= BOSS_LEVEL) {
    world.bossSpawned = true;
    world.boss = createBoss(world);
    world.audio.roar();
    addShake(world.particles, 0.6);
    // Seal the shaft behind the player: the fight is fought here.
    if (!world.arenaSealed) {
      world.arenaSealed = true;
      for (let x = 13; x <= 18; x += 1) {
        setTile(world.tiles, x, rowOfLevel(BOSS_LEVEL) - 1, T_BEDROCK);
        setTile(world.tiles, x, rowOfLevel(BOSS_LEVEL), T_BEDROCK);
      }
    }
    return EVENT_BOSS;
  }
  return EVENT_NONE;
}

function updateLevel(world) {
  let events = EVENT_NONE;
  if (world.player.dead) return events;
  const row = Math.max(0, Math.floor(world.player.y / TILE));
  const level = levelOf(row);
  if (level > world.maxLevel) {
    world.maxLevel = level;
    world.level = level;
    addScore(world, 100 * level);
    world.player.bombs = Math.min(world.stats.maxBombs, world.player.bombs + 1);
    floatText(world.particles, world.player.x, world.player.y - 60, `LEVEL ${level}`, '#ffd76a');
    world.audio.levelUp();
    events |= EVENT_LEVEL;
    if (level >= world.nextDraftLevel && level < BOSS_LEVEL) {
      world.nextDraftLevel += DRAFT_EVERY;
      world.draftPending = true;
      events |= EVENT_DRAFT;
    } else if (world.endless && level >= world.nextDraftLevel) {
      world.nextDraftLevel += DRAFT_EVERY;
      world.draftPending = true;
      events |= EVENT_DRAFT;
    }
  }
  return events;
}

/** One fixed step of the world. Returns event flags for the loop. */
export function stepWorld(world, input, dt) {
  let events = EVENT_NONE;
  world.time += dt;
  const p = world.player;

  updatePlayer(world, input, dt);

  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const e = world.enemies[i];
    if (e.dead) {
      world.enemies.splice(i, 1);
      continue;
    }
    updateEnemy(world, e, dt);
    // Contact damage.
    if (!p.dead && p.iframe <= 0 && Math.abs(e.x - p.x) < (e.width + PLAYER_W) / 2 - 4 && e.y > p.y - PLAYER_H - 4 && e.y - e.height < p.y) {
      damagePlayer(world, Math.round(e.damage * world.difficulty.enemyDamage), Math.sign(p.x - e.x) * 260, -200);
    }
  }

  if (world.boss) updateBoss(world, world.boss, dt);

  updatePickups(world, dt);
  updateBombs(world, dt);
  updateBoulders(world, dt);
  updateProjectiles(world, dt);
  updateSpawning(world, dt);
  updateParticles(world.particles, dt);

  events |= updateLevel(world);
  events |= updateBossTrigger(world);

  // Grow the world ahead of the camera.
  const needRow = Math.floor((world.cameraY + VIEW_H) / TILE) + CHUNK_ROWS;
  ensureRows(world.tiles, needRow, world.rand, world.shaftState);

  // Camera follows the player down.
  const targetY = Math.max(-20, p.y - VIEW_H * 0.45);
  world.cameraY += (targetY - world.cameraY) * Math.min(1, dt * 5);

  // Ambient embers from lava in view.
  if (Math.random() < dt * 6) {
    const topRow = Math.floor(world.cameraY / TILE);
    for (let tries = 0; tries < 4; tries += 1) {
      const tx = 1 + Math.floor(Math.random() * (WORLD_W - 2));
      const ty = topRow + Math.floor(Math.random() * 18);
      if (tileAt(world.tiles, tx, ty) === T_LAVA) {
        emberDrift(world.particles, tx * TILE + 20, ty * TILE + 10);
        break;
      }
    }
  }

  if (world.victoryTimer > 0) {
    world.victoryTimer -= dt;
    if (world.victoryTimer <= 0) events |= EVENT_WIN;
  }
  if (world.deathTimer > 0) {
    world.deathTimer -= dt;
    if (world.deathTimer <= 0) events |= EVENT_OVER;
  }
  return events;
}

export function startEndless(world) {
  world.endless = true;
  world.nextDraftLevel = Math.floor(world.maxLevel / DRAFT_EVERY + 1) * DRAFT_EVERY;
  world.player.hull = world.stats.maxHull;
  world.player.heat = 0;
  world.victoryTimer = 0;
}
