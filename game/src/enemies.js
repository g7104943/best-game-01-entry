// The mountain's creatures and the Core Wyrm. Enemies are plain data the
// world updates; each type has one small AI. The boss is a head plus a trail
// of segments that follow its recorded path, with three phases: charges,
// then magma spit and summons, then an enraged rain of ceiling rock.
import { BOSS_HP, BOSS_SEGMENTS, ENEMY_TYPES, TILE } from './config.js';
import { T_EMPTY, T_LAVA, isSolid, rowOfLevel, tileAt } from './tiles.js';
import { burst, floatText } from './particles.js';

export function createEnemy(kind, x, y, difficulty, rand) {
  const def = ENEMY_TYPES[kind];
  const r = rand ?? Math;
  const next = typeof r.next === 'function' ? () => r.next() : () => Math.random();
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    width: def.width,
    height: def.height,
    hp: Math.round(def.hp * difficulty.enemyHp),
    maxHp: Math.round(def.hp * difficulty.enemyHp),
    damage: def.damage,
    speed: def.speed,
    facing: next() < 0.5 ? -1 : 1,
    attackCd: 0,
    spitCd: 1 + next(),
    wobble: next() * Math.PI * 2,
    flash: 0,
    dead: false,
    onGround: false,
  };
}

function tileAtPx(world, px, py) {
  return tileAt(world.tiles, Math.floor(px / TILE), Math.floor(py / TILE));
}

function solidAtPx(world, px, py) {
  return isSolid(tileAtPx(world, px, py));
}

function moveWithCollision(world, e, dt, gravity) {
  e.vy += gravity * dt;
  const nextX = e.x + e.vx * dt;
  const hw = e.width / 2;
  const top = e.y - e.height + 4;
  const bottom = e.y - 2;
  if (e.vx > 0 && (solidAtPx(world, nextX + hw, top) || solidAtPx(world, nextX + hw, bottom) || solidAtPx(world, nextX + hw, e.y - e.height / 2))) {
    e.x = Math.floor((nextX + hw) / TILE) * TILE - hw - 0.01;
    e.vx = 0;
    e.hitWall = true;
  } else if (e.vx < 0 && (solidAtPx(world, nextX - hw, top) || solidAtPx(world, nextX - hw, bottom) || solidAtPx(world, nextX - hw, e.y - e.height / 2))) {
    e.x = Math.floor((nextX - hw) / TILE + 1) * TILE + hw + 0.01;
    e.vx = 0;
    e.hitWall = true;
  } else {
    e.x = nextX;
    e.hitWall = false;
  }
  const nextY = e.y + e.vy * dt;
  e.onGround = false;
  if (e.vy >= 0) {
    if (solidAtPx(world, e.x - hw + 3, nextY) || solidAtPx(world, e.x + hw - 3, nextY)) {
      e.y = Math.floor(nextY / TILE) * TILE;
      e.vy = 0;
      e.onGround = true;
    } else {
      e.y = nextY;
    }
  } else if (solidAtPx(world, e.x - hw + 3, nextY - e.height) || solidAtPx(world, e.x + hw - 3, nextY - e.height)) {
    e.y = Math.floor((nextY - e.height) / TILE + 1) * TILE + e.height;
    e.vy = 0;
  } else {
    e.y = nextY;
  }
}

function damageEnemy(world, e, amount, kx, ky) {
  e.hp -= amount;
  e.flash = 0.12;
  if (kx) e.vx += kx;
  if (ky) e.vy += ky;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    world.onEnemyKilled(e);
  }
}

export function hurtEnemy(world, e, amount, kx, ky) {
  damageEnemy(world, e, amount, kx, ky);
}

function updateGrub(world, e, dt) {
  const player = world.player;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  if (Math.abs(dx) < 320 && Math.abs(dy) < 120) e.facing = dx > 0 ? 1 : -1;
  e.vx = e.facing * e.speed;
  if (e.hitWall) e.facing *= -1;
  // Turn at ledges so grubs patrol their floor instead of walking off.
  const aheadX = e.x + e.facing * (e.width / 2 + 6);
  if (e.onGround && !solidAtPx(world, aheadX, e.y + 6)) e.facing *= -1;
  moveWithCollision(world, e, dt, 1500);
  if (tileAtPx(world, e.x, e.y - 4) === T_LAVA) damageEnemy(world, e, 30 * dt, 0, 0);
}

function updateBat(world, e, dt) {
  const player = world.player;
  e.wobble += dt * 6;
  const dx = player.x - e.x;
  const dy = player.y - e.height / 2 - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist < 420) {
    e.vx += ((dx / dist) * e.speed - e.vx) * Math.min(1, dt * 3);
    e.vy += ((dy / dist) * e.speed * 0.8 - e.vy) * Math.min(1, dt * 3);
  } else {
    e.vx += Math.cos(e.wobble) * 20 * dt;
    e.vy += Math.sin(e.wobble * 0.7) * 16 * dt;
    e.vx *= 0.995;
    e.vy *= 0.995;
  }
  const nx = e.x + e.vx * dt;
  const ny = e.y + e.vy * dt;
  if (!solidAtPx(world, nx, ny - e.height / 2)) {
    e.x = nx;
    e.y = ny;
  } else {
    e.vx *= -0.6;
    e.vy *= -0.6;
  }
  e.facing = e.vx >= 0 ? 1 : -1;
}

function updateImp(world, e, dt) {
  const player = world.player;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 260 && e.onGround) {
    e.facing = dx > 0 ? -1 : 1;
    e.vx = e.facing * e.speed;
  } else if (dist < 520) {
    e.facing = dx > 0 ? 1 : -1;
    e.vx = 0;
  } else {
    e.vx = e.facing * e.speed * 0.5;
    if (e.hitWall) e.facing *= -1;
  }
  moveWithCollision(world, e, dt, 1500);
  e.spitCd -= dt;
  if (e.spitCd <= 0 && dist < 520 && Math.abs(dy) < 220) {
    e.spitCd = 2.6;
    const speed = 260;
    world.spawnProjectile(e.x, e.y - e.height - 4, (dx / dist) * speed, (dy / dist) * speed - 30, 'fire', Math.round(12 * world.difficulty.enemyDamage));
    world.audio.spit?.();
  }
  if (tileAtPx(world, e.x, e.y - 4) === T_LAVA) damageEnemy(world, e, 30 * dt, 0, 0);
}

function updateGolem(world, e, dt) {
  const player = world.player;
  const dx = player.x - e.x;
  if (Math.abs(dx) < 480 && Math.abs(player.y - e.y) < 160) {
    e.facing = dx > 0 ? 1 : -1;
    e.vx = e.facing * e.speed;
  } else {
    e.vx = 0;
  }
  if (e.hitWall && e.onGround) e.vy = -520;
  moveWithCollision(world, e, dt, 1500);
  if (e.onGround && Math.abs(e.vx) > 1 && Math.random() < dt * 2) {
    burst(world.particles, e.x, e.y, { count: 3, speed: 60, life: 0.4, size: 4, colors: ['#7d7a86', '#5d5a66'], gravity: 300 });
  }
}

export function updateEnemy(world, e, dt) {
  e.attackCd = Math.max(0, e.attackCd - dt);
  e.flash = Math.max(0, e.flash - dt);
  if (e.kind === 'grub') updateGrub(world, e, dt);
  else if (e.kind === 'bat') updateBat(world, e, dt);
  else if (e.kind === 'imp') updateImp(world, e, dt);
  else if (e.kind === 'golem') updateGolem(world, e, dt);
}

// ---------------------------------------------------------------- boss ----

export function createBoss(world) {
  const arenaTop = rowOfLevel(30) * TILE;
  const arenaBottom = arenaTop + 12 * TILE;
  const boss = {
    x: 640,
    y: arenaTop + 200,
    vx: 0,
    vy: 0,
    hp: Math.round(BOSS_HP * world.difficulty.enemyHp),
    maxHp: Math.round(BOSS_HP * world.difficulty.enemyHp),
    phase: 1,
    state: 'roam',
    timer: 2.2,
    history: [],
    segments: BOSS_SEGMENTS,
    targetX: 640,
    targetY: arenaTop + 200,
    chargeX: 0,
    chargeY: 0,
    flash: 0,
    stun: 0,
    spitCd: 4,
    summonCd: 8,
    rainCd: 5,
    arenaTop,
    arenaBottom,
    dead: false,
    deathTimer: 0,
    roarPlayed: false,
  };
  for (let i = 0; i < 220; i += 1) boss.history.push({ x: boss.x, y: boss.y });
  return boss;
}

export function bossSegmentPos(boss, index) {
  const at = Math.min(boss.history.length - 1, index * 10);
  return boss.history[at];
}

function bossSpeed(boss) {
  return boss.phase === 1 ? 175 : boss.phase === 2 ? 215 : 265;
}

function setPhase(world, boss, phase) {
  boss.phase = phase;
  boss.stun = 1.2;
  boss.state = 'roam';
  boss.timer = 1.4;
  world.audio.roar();
  burst(world.particles, boss.x, boss.y, { count: 30, speed: 300, life: 0.8, size: 7, colors: ['#ff7a3c', '#ff5252', '#ffd76a'], gravity: 200, glow: true });
  floatText(world.particles, boss.x, boss.y - 60, phase === 2 ? 'THE WYRM RAGES!' : 'THE WYRM IS ENRAGED!', '#ff6a4d');
  // The mountain relents for a breath: hearts scatter for the climb back.
  for (let i = 0; i < 2; i += 1) {
    world.pickups.push({
      x: boss.x + (world.rand.next() - 0.5) * 260,
      y: boss.arenaBottom - 2 * TILE,
      vx: 0,
      vy: -60,
      kind: 'heart',
      value: 1,
      life: 25,
    });
  }
}

export function damageBoss(world, boss, amount) {
  if (boss.dead) return;
  const dealt = boss.stun > 0 ? amount * 2 : amount;
  boss.hp -= dealt;
  boss.flash = 0.1;
  floatText(world.particles, boss.x + (Math.random() - 0.5) * 60, boss.y - 40, String(Math.round(dealt)), '#ffd76a');
  const frac = boss.hp / boss.maxHp;
  if (boss.phase === 1 && frac <= 0.66) setPhase(world, boss, 2);
  else if (boss.phase === 2 && frac <= 0.33) setPhase(world, boss, 3);
  if (boss.hp <= 0) {
    boss.dead = true;
    boss.deathTimer = 1.4;
    world.onBossKilled();
  }
}

function steerBoss(boss, tx, ty, dt, speed) {
  const dx = tx - boss.x;
  const dy = ty - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const want = Math.min(dist * 4, speed);
  boss.vx += ((dx / dist) * want - boss.vx) * Math.min(1, dt * 2.2);
  boss.vy += ((dy / dist) * want - boss.vy) * Math.min(1, dt * 2.2);
}

export function updateBoss(world, boss, dt) {
  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.dead) {
    boss.deathTimer -= dt;
    if (Math.random() < dt * 20) {
      const seg = bossSegmentPos(boss, Math.floor(Math.random() * boss.segments));
      burst(world.particles, seg.x, seg.y, { count: 6, speed: 200, life: 0.6, size: 6, colors: ['#ff7a3c', '#ffd76a'], gravity: 200, glow: true });
    }
    return;
  }
  const player = world.player;
  const minX = 2 * TILE + 30;
  const maxX = (32 - 2) * TILE - 30;
  const minY = boss.arenaTop + 50;
  const maxY = boss.arenaBottom - 2 * TILE - 20;

  if (boss.stun > 0) {
    boss.stun -= dt;
    boss.vx *= 0.9;
    boss.vy *= 0.9;
  } else if (boss.state === 'roam') {
    boss.timer -= dt;
    const wobble = Math.sin(world.time * 2.2) * 60;
    steerBoss(boss, boss.targetX + wobble * 0.4, boss.targetY + wobble * 0.3, dt, bossSpeed(boss));
    if (Math.hypot(boss.targetX - boss.x, boss.targetY - boss.y) < 50 || boss.timer <= 0) {
      const rand = world.rand;
      boss.targetX = Math.max(minX, Math.min(maxX, player.x + (rand.next() - 0.5) * 320));
      boss.targetY = Math.max(minY, Math.min(maxY, player.y - 60 + (rand.next() - 0.5) * 200));
      boss.timer = 1.6 + rand.next() * 1.4;
      if (rand.next() < 0.55) {
        boss.state = 'windup';
        boss.timer = 0.7;
        boss.vx *= 0.3;
        boss.vy *= 0.3;
      }
    }
    boss.spitCd -= dt;
    if (boss.phase >= 2 && boss.spitCd <= 0) {
      boss.spitCd = boss.phase === 2 ? 5.5 : 4;
      boss.state = 'spit';
      boss.timer = 0.9;
      boss.spitDone = false;
    }
    boss.summonCd -= dt;
    if (boss.phase === 2 && boss.summonCd <= 0) {
      boss.summonCd = 11;
      world.spawnBossAdds();
    }
    boss.rainCd -= dt;
    if (boss.phase === 3 && boss.rainCd <= 0) {
      boss.rainCd = 4.5;
      world.spawnRockRain();
    }
  } else if (boss.state === 'windup') {
    boss.timer -= dt;
    boss.vx *= 0.85;
    boss.vy *= 0.85;
    boss.chargeX = player.x;
    boss.chargeY = player.y - 18;
    if (boss.timer <= 0) {
      boss.state = 'charge';
      boss.timer = 0.85;
      const dx = boss.chargeX - boss.x;
      const dy = boss.chargeY - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      boss.vx = (dx / dist) * 540;
      boss.vy = (dy / dist) * 540;
      world.audio.roar();
    }
  } else if (boss.state === 'charge') {
    boss.timer -= dt;
    burst(world.particles, boss.x, boss.y, { count: 2, speed: 80, life: 0.4, size: 5, colors: ['#7d7a86', '#9a97a3'], gravity: 100 });
    if (boss.timer <= 0 || boss.x < minX || boss.x > maxX || boss.y < minY || boss.y > maxY) {
      boss.state = 'roam';
      boss.timer = 1.2;
      boss.vx *= 0.25;
      boss.vy *= 0.25;
    }
  } else if (boss.state === 'spit') {
    boss.timer -= dt;
    boss.vx *= 0.85;
    boss.vy *= 0.85;
    if (!boss.spitDone && boss.timer <= 0.55) {
      boss.spitDone = true;
      const dx = player.x - boss.x;
      const dy = player.y - 18 - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      for (let i = -1; i <= 1; i += 1) {
        const angle = Math.atan2(dy, dx) + i * 0.22;
        world.spawnProjectile(boss.x, boss.y, Math.cos(angle) * 250, Math.sin(angle) * 250, 'glob', Math.round(12 * world.difficulty.enemyDamage));
      }
    }
    if (boss.timer <= 0) {
      boss.state = 'roam';
      boss.timer = 1.4;
    }
  }

  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;
  boss.x = Math.max(minX, Math.min(maxX, boss.x));
  boss.y = Math.max(minY, Math.min(maxY, boss.y));
  boss.history.unshift({ x: boss.x, y: boss.y });
  if (boss.history.length > 220) boss.history.pop();

  // Contact damage against the player.
  if (player.iframe <= 0) {
    const headDist = Math.hypot(player.x - boss.x, player.y - 18 - boss.y);
    let hit = headDist < 52;
    if (!hit) {
      for (let i = 1; i < boss.segments; i += 1) {
        const seg = bossSegmentPos(boss, i);
        if (Math.hypot(player.x - seg.x, player.y - 18 - seg.y) < 40) {
          hit = true;
          break;
        }
      }
    }
    if (hit) world.damagePlayer(Math.round(20 * world.difficulty.enemyDamage), Math.sign(player.x - boss.x) * 320, -260);
  }
}
