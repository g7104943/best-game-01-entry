// The game's rules and state, with no drawing and no browser in it: the player,
// bullets, foes, glimmer pickups, particles, waves, collisions, score, levels
// and the win and loss conditions. step() advances one fixed step and returns
// what happened as bit flags, so the caller can play sounds and switch screens
// without the world knowing about them. Pools are allocated once, at boot.

import { BOSS, ENEMY_BULLET, FIELD, FINAL_WAVE, PLAYER, POOLS, WAVE, xpForLevel } from './config.js';
import { createRandom } from './random.js';
import {
  ENEMY_DEFS,
  KIND_BOSS,
  KIND_MINI,
  KIND_NIBBLER,
  KIND_SPLITTER,
  createDirector,
  edgeSpawn,
  scaledStats,
  steerEnemy,
} from './enemies.js';
import { freshModifiers } from './upgrades.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_LEVELUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_BOSS = 32;
export const EVENT_WIN = 64;
export const EVENT_KILL = 128;
export const EVENT_DASH = 256;
export const EVENT_REVIVE = 512;
export const EVENT_SHOT = 1024;

function makeBullet() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 1, pierce: 0, crit: false, hit: [] };
}

function makeFoe() {
  return {
    active: false, id: 0, kind: KIND_NIBBLER, x: 0, y: 0, vx: 0, vy: 0,
    hp: 1, maxHp: 1, radius: 10, speed: 100, face: 0, state: 0, stateTimer: 0,
    fireTimer: 0, summonTimer: 0, strafeDir: 1, phase: 0, flash: 0,
    lungeX: 0, lungeY: 0, touch: 1, score: 0, glimmers: 0, shieldTimer: 0,
  };
}

export function createWorld(seed) {
  let random = createRandom(seed);
  let director = createDirector(random);
  let foeId = 1;

  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, face: 0,
    fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashX: 1, dashY: 0,
    invulnerable: 0, tailPhase: 0,
  };
  const mods = freshModifiers();
  const bullets = [];
  for (let index = 0; index < 96; index += 1) bullets.push(makeBullet());
  const enemyBullets = [];
  for (let index = 0; index < ENEMY_BULLET.pool; index += 1) {
    enemyBullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  }
  const foes = [];
  for (let index = 0; index < POOLS.enemies; index += 1) foes.push(makeFoe());
  const pickups = [];
  for (let index = 0; index < POOLS.pickups; index += 1) {
    pickups.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, age: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOLS.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0 });
  }
  const floaters = [];
  for (let index = 0; index < POOLS.floaters; index += 1) {
    floaters.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, color: '#fff', size: 20 });
  }

  const state = {
    player, mods, bullets, enemyBullets, foes, pickups, particles, floaters,
    score: 0, level: 1, xp: 0, xpNeed: xpForLevel(1), pendingLevels: 0,
    wave: 0, waveState: 'breather', breatherTimer: 1.0, elapsed: 0, time: 0,
    kills: 0, combo: 0, comboTimer: 0, shake: 0, flash: 0,
    banner: '', bannerSub: '', bannerTimer: 0, over: false, won: false,
    boss: null, shieldAngle: 0, foesLeft: 0,
  };

  function reset() {
    // Re-seed, so the same seed always replays the same run: the screenshot
    // staging can survey a run, then replay to its liveliest frame.
    random = createRandom(seed);
    director = createDirector(random);
    foeId = 1;
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.face = -Math.PI / 2;
    player.fireTimer = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    const fresh = freshModifiers();
    for (const key of Object.keys(fresh)) mods[key] = fresh[key];
    for (const bullet of bullets) bullet.active = false;
    for (const glob of enemyBullets) glob.active = false;
    for (const foe of foes) foe.active = false;
    for (const pickup of pickups) pickup.active = false;
    for (const particle of particles) particle.active = false;
    for (const floater of floaters) floater.active = false;
    state.score = 0;
    state.level = 1;
    state.xp = 0;
    state.xpNeed = xpForLevel(1);
    state.pendingLevels = 0;
    state.wave = 0;
    state.waveState = 'breather';
    state.breatherTimer = 1.0;
    state.elapsed = 0;
    state.time = 0;
    state.kills = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = 'The reef is quiet…';
    state.bannerSub = 'Something stirs in the deep';
    state.bannerTimer = 1.6;
    state.over = false;
    state.won = false;
    state.boss = null;
    state.shieldAngle = 0;
    state.foesLeft = 0;
  }

  function aliveFoes() {
    let count = 0;
    for (const foe of foes) if (foe.active) count += 1;
    return count;
  }

  function burst(x, y, color, count, speed, life, size) {
    let made = 0;
    for (const particle of particles) {
      if (made >= count) break;
      if (particle.active) continue;
      const angle = random.range(0, Math.PI * 2);
      const power = random.range(0.3, 1) * speed;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * power;
      particle.vy = Math.sin(angle) * power;
      particle.life = particle.maxLife = random.range(0.5, 1) * life;
      particle.size = random.range(0.6, 1.4) * size;
      particle.color = color;
      particle.drag = 3;
      made += 1;
    }
  }

  function addFloater(x, y, text, color, size) {
    for (const floater of floaters) {
      if (floater.active) continue;
      floater.active = true;
      floater.x = x;
      floater.y = y;
      floater.text = text;
      floater.life = floater.maxLife = 0.9;
      floater.color = color;
      floater.size = size;
      return;
    }
  }

  function spawnFoe(kind, x, y) {
    for (const foe of foes) {
      if (foe.active) continue;
      const def = ENEMY_DEFS[kind];
      const stats = scaledStats(kind, Math.max(1, state.wave), FINAL_WAVE);
      foe.active = true;
      foe.id = foeId;
      foeId += 1;
      foe.kind = kind;
      foe.x = x;
      foe.y = y;
      foe.vx = 0;
      foe.vy = 0;
      foe.hp = foe.maxHp = stats.hp;
      foe.radius = def.radius;
      foe.speed = stats.speed;
      foe.state = 0;
      foe.stateTimer = random.range(0.2, 0.8);
      foe.fireTimer = random.range(1.2, 2.2);
      foe.summonTimer = BOSS.spawnInterval;
      foe.strafeDir = random.sign();
      foe.phase = random.range(0, Math.PI * 2);
      foe.flash = 0;
      foe.shieldTimer = 0;
      foe.touch = def.touch;
      foe.score = stats.score;
      foe.glimmers = def.glimmers;
      if (kind === KIND_BOSS) state.boss = foe;
      return foe;
    }
    return null;
  }

  function spawnPickup(x, y, value) {
    for (const pickup of pickups) {
      if (pickup.active) continue;
      const angle = random.range(0, Math.PI * 2);
      const power = random.range(50, 170);
      pickup.active = true;
      pickup.x = x;
      pickup.y = y;
      pickup.vx = Math.cos(angle) * power;
      pickup.vy = Math.sin(angle) * power;
      pickup.value = value;
      pickup.age = 0;
      return;
    }
  }

  function spit(x, y, angle) {
    for (const glob of enemyBullets) {
      if (glob.active) continue;
      glob.active = true;
      glob.x = x;
      glob.y = y;
      glob.vx = Math.cos(angle) * ENEMY_BULLET.speed;
      glob.vy = Math.sin(angle) * ENEMY_BULLET.speed;
      glob.life = ENEMY_BULLET.life;
      return;
    }
  }

  function damageFoe(foe, damage, fromX, fromY, events) {
    foe.hp -= damage;
    foe.flash = 0.09;
    if (foe.kind !== KIND_BOSS) {
      const dx = foe.x - fromX;
      const dy = foe.y - fromY;
      const dist = Math.max(1, Math.hypot(dx, dy));
      foe.x += (dx / dist) * 5;
      foe.y += (dy / dist) * 5;
    }
    if (foe.hp > 0) return events;
    foe.active = false;
    state.kills += 1;
    state.score += foe.score;
    addFloater(foe.x, foe.y - foe.radius, `+${foe.score}`, '#ffd76a', 20);
    const colors = { 0: '#8d6ff0', 1: '#2ec4b6', 2: '#f4a259', 3: '#ef476f', 4: '#8d6ff0', 5: '#ff5d8f' };
    burst(foe.x, foe.y, colors[foe.kind] ?? '#fff', foe.kind === KIND_BOSS ? 60 : 16, foe.kind === KIND_BOSS ? 320 : 220, 0.6, 3.5);
    for (let index = 0; index < foe.glimmers; index += 1) spawnPickup(foe.x, foe.y, 1);
    if (foe.kind === KIND_SPLITTER) {
      for (let index = 0; index < 2; index += 1) {
        const mini = spawnFoe(KIND_MINI, foe.x + random.range(-14, 14), foe.y + random.range(-14, 14));
        if (mini !== null) {
          mini.hp = mini.maxHp = 1;
        }
      }
    }
    if (foe.kind === KIND_BOSS) {
      state.boss = null;
      state.shake = Math.min(1, state.shake + 0.8);
      burst(foe.x, foe.y, '#ffd76a', 40, 380, 0.9, 4);
      if (state.wave >= FINAL_WAVE) {
        state.won = true;
        state.score += WAVE.victoryBonus;
        return events | EVENT_WIN;
      }
    }
    return events | EVENT_KILL;
  }

  function damagePlayer(damage, fromX, fromY) {
    if (player.invulnerable > 0 || state.over) return 0;
    player.hp -= damage;
    player.invulnerable = PLAYER.invulnerable;
    state.flash = 0.7;
    state.shake = Math.min(1, state.shake + 0.55);
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    player.vx += (dx / dist) * 260;
    player.vy += (dy / dist) * 260;
    burst(player.x, player.y, '#ff5d73', 14, 240, 0.5, 3);
    if (player.hp > 0) return EVENT_HIT;
    if (mods.revive) {
      mods.revive = false;
      player.hp = 3;
      player.invulnerable = 2;
      for (const glob of enemyBullets) glob.active = false;
      burst(player.x, player.y, '#6ef3ff', 46, 340, 0.9, 4);
      addFloater(player.x, player.y - 30, 'SECOND WIND!', '#6ef3ff', 26);
      return EVENT_REVIVE;
    }
    state.over = true;
    burst(player.x, player.y, '#ffd76a', 50, 300, 1.1, 4);
    return EVENT_OVER;
  }

  function fireBolts(aimX, aimY) {
    const base = Math.atan2(aimY - player.y, aimX - player.x);
    const count = mods.projectiles;
    const spread = 0.14;
    let fired = false;
    for (let index = 0; index < count; index += 1) {
      for (const bullet of bullets) {
        if (bullet.active) continue;
        const offset = (index - (count - 1) / 2) * spread;
        const angle = base + offset + random.range(-0.012, 0.012);
        const speed = PLAYER.bulletSpeed * mods.bulletSpeedMul;
        bullet.active = true;
        bullet.x = player.x + Math.cos(angle) * 20;
        bullet.y = player.y + Math.sin(angle) * 20;
        bullet.vx = Math.cos(angle) * speed;
        bullet.vy = Math.sin(angle) * speed;
        bullet.life = PLAYER.bulletLife * mods.bulletLifeMul;
        bullet.damage = PLAYER.bulletDamage + mods.damage;
        bullet.pierce = mods.pierce;
        bullet.crit = random.chance(mods.critChance);
        bullet.hit.length = 0;
        fired = true;
        break;
      }
    }
    if (fired) {
      burst(player.x + Math.cos(base) * 22, player.y + Math.sin(base) * 22, '#ffe89a', 2, 60, 0.18, 2.5);
    }
    return fired;
  }

  function beginWave(number) {
    state.wave = number;
    state.waveState = 'active';
    director.beginWave(number);
    const bossWave = BOSS.waves.includes(number);
    if (number >= FINAL_WAVE) {
      state.banner = 'The Maw of the Deep';
      state.bannerSub = 'Defeat it to save the reef';
    } else if (bossWave) {
      state.banner = 'The Maw stirs…';
      state.bannerSub = 'Something huge approaches';
    } else {
      state.banner = `Wave ${number}`;
      state.bannerSub = number === 1 ? 'The gloom is coming' : `${director.total()} foes in the dark`;
    }
    state.bannerTimer = 2.2;
  }

  function ambientStep(dt) {
    // The title screen's living backdrop: Pip drifts in a slow circle while a
    // few nibblers wander. Nothing fights, nothing scores.
    state.time += dt;
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;
    const targetX = cx + Math.cos(state.time * 0.24) * 190;
    const targetY = cy + Math.sin(state.time * 0.31) * 110;
    player.vx = (targetX - player.x) * 1.6;
    player.vy = (targetY - player.y) * 1.6;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.face = Math.atan2(player.vy, player.vx);
    player.tailPhase += dt * 6;
    if (aliveFoes() < 4 && random.chance(dt * 0.5)) {
      const point = edgeSpawn(random, player);
      spawnFoe(KIND_NIBBLER, point.x, point.y);
    }
    for (const foe of foes) {
      if (!foe.active) continue;
      const wanderX = cx + Math.cos(state.time * 0.2 + foe.phase) * 320;
      const wanderY = cy + Math.sin(state.time * 0.26 + foe.phase) * 200;
      const dx = wanderX - foe.x;
      const dy = wanderY - foe.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      foe.vx = (dx / dist) * foe.speed * 0.45;
      foe.vy = (dy / dist) * foe.speed * 0.45;
      foe.x += foe.vx * dt;
      foe.y += foe.vy * dt;
      foe.face = Math.atan2(foe.vy, foe.vx);
    }
    updateAmbientParticles(dt);
  }

  function updateAmbientParticles(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      const drag = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    for (const floater of floaters) {
      if (!floater.active) continue;
      floater.life -= dt;
      floater.y -= 34 * dt;
      if (floater.life <= 0) floater.active = false;
    }
  }

  function step(dt, controls, harmless) {
    if (harmless) {
      ambientStep(dt);
      return 0;
    }
    let events = 0;
    state.time += dt;
    state.elapsed += dt;
    state.shake = Math.max(0, state.shake - dt * 2.2);
    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
    state.shieldAngle += dt * 2.6;
    player.tailPhase += dt * (6 + Math.hypot(player.vx, player.vy) / 60);

    // Waves: breathe, then fight; clearing the field ends the wave.
    if (state.waveState === 'breather') {
      state.breatherTimer -= dt;
      if (state.breatherTimer <= 0) {
        beginWave(state.wave + 1);
        events |= EVENT_WAVE;
        if (BOSS.waves.includes(state.wave)) events |= EVENT_BOSS;
      }
    } else if (director.remaining() === 0 && aliveFoes() === 0 && !state.over && !state.won) {
      const bonus = WAVE.clearBonus * state.wave;
      state.score += bonus;
      addFloater(FIELD.width / 2, FIELD.height / 2 - 60, `Wave clear  +${bonus}`, '#ffd76a', 26);
      state.waveState = 'breather';
      state.breatherTimer = WAVE.breather;
      state.banner = `Wave ${state.wave} clear`;
      state.bannerSub = 'Catch your breath';
      state.bannerTimer = 1.8;
    }

    // Spawning.
    const kind = director.nextSpawn(dt, aliveFoes());
    if (kind !== null) {
      if (kind === KIND_BOSS) {
        const point = edgeSpawn(random, player);
        spawnFoe(kind, point.x, point.y);
      } else {
        const point = edgeSpawn(random, player);
        spawnFoe(kind, point.x, point.y);
      }
    }

    // The player: steer, dash, aim, shoot.
    const speed = PLAYER.speed * mods.speedMul;
    const targetVx = controls.move.x * speed;
    const targetVy = controls.move.y * speed;
    const blend = 1 - Math.exp(-14 * dt);
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
      if (random.chance(dt * 40)) burst(player.x, player.y, '#9fd8ff', 1, 40, 0.3, 2);
    } else {
      player.vx += (targetVx - player.vx) * blend;
      player.vy += (targetVy - player.vy) * blend;
    }
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (controls.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      let dx = controls.move.x;
      let dy = controls.move.y;
      if (dx === 0 && dy === 0) {
        dx = controls.aim.x - player.x;
        dy = controls.aim.y - player.y;
      }
      const len = Math.hypot(dx, dy) || 1;
      player.dashX = dx / len;
      player.dashY = dy / len;
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown * mods.dashCooldownMul;
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
      events |= EVENT_DASH;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    player.face = Math.atan2(controls.aim.y - player.y, controls.aim.x - player.x);

    player.fireTimer -= dt;
    if (controls.firing && player.fireTimer <= 0 && !state.over) {
      if (fireBolts(controls.aim.x, controls.aim.y)) {
        player.fireTimer = PLAYER.fireInterval / mods.fireMul;
        events |= EVENT_SHOT;
      }
    }

    // Foes: steer, move, separate, touch.
    const steerCtx = {
      player,
      time: state.time,
      random,
      spit,
      burst: (x, y, count, speedValue) => {
        const offset = random.range(0, Math.PI * 2);
        for (let index = 0; index < count; index += 1) {
          const angle = offset + (index / count) * Math.PI * 2;
          for (const glob of enemyBullets) {
            if (glob.active) continue;
            glob.active = true;
            glob.x = x;
            glob.y = y;
            glob.vx = Math.cos(angle) * speedValue;
            glob.vy = Math.sin(angle) * speedValue;
            glob.life = ENEMY_BULLET.life;
            break;
          }
        }
      },
      summon: (summonKind, x, y) => {
        const angle = random.range(0, Math.PI * 2);
        spawnFoe(summonKind, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60);
      },
    };
    for (const foe of foes) {
      if (!foe.active) continue;
      foe.shieldTimer = Math.max(0, foe.shieldTimer - dt);
      steerEnemy(foe, dt, steerCtx);
      foe.x = Math.min(FIELD.width - foe.radius, Math.max(foe.radius, foe.x + foe.vx * dt));
      foe.y = Math.min(FIELD.height - foe.radius, Math.max(foe.radius, foe.y + foe.vy * dt));
    }
    for (let a = 0; a < foes.length; a += 1) {
      const first = foes[a];
      if (!first.active) continue;
      for (let b = a + 1; b < foes.length; b += 1) {
        const second = foes[b];
        if (!second.active) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const dist = Math.hypot(dx, dy);
        const min = (first.radius + second.radius) * 0.8;
        if (dist > 0.01 && dist < min) {
          const push = (min - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          first.x -= nx * push;
          first.y -= ny * push;
          second.x += nx * push;
          second.y += ny * push;
        }
      }
    }
    for (const foe of foes) {
      if (!foe.active) continue;
      const dist = Math.hypot(foe.x - player.x, foe.y - player.y);
      if (dist < foe.radius + PLAYER.radius - 2) {
        const dealt = damagePlayer(foe.touch, foe.x, foe.y);
        events |= dealt;
        if (dealt !== 0) {
          foe.x += ((foe.x - player.x) / Math.max(1, dist)) * 26;
          foe.y += ((foe.y - player.y) / Math.max(1, dist)) * 26;
        }
      }
    }

    // Orbiting shield shards wound foes they touch.
    for (let index = 0; index < mods.shields; index += 1) {
      const angle = state.shieldAngle + (index / mods.shields) * Math.PI * 2;
      const sx = player.x + Math.cos(angle) * 48;
      const sy = player.y + Math.sin(angle) * 48;
      for (const foe of foes) {
        if (!foe.active || foe.shieldTimer > 0) continue;
        if (Math.hypot(foe.x - sx, foe.y - sy) < foe.radius + 12) {
          foe.shieldTimer = 0.55;
          events |= damageFoe(foe, 1, sx, sy, 0);
          burst(sx, sy, '#6ef3ff', 5, 160, 0.3, 2.5);
        }
      }
    }

    // Bolts: fly, fade, strike foes.
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      for (const foe of foes) {
        if (!foe.active || bullet.hit.includes(foe.id)) continue;
        const dist = Math.hypot(foe.x - bullet.x, foe.y - bullet.y);
        if (dist >= foe.radius + PLAYER.bulletRadius) continue;
        bullet.hit.push(foe.id);
        const damage = bullet.crit ? bullet.damage * 2 : bullet.damage;
        if (bullet.crit) addFloater(foe.x, foe.y - foe.radius - 8, 'CRIT', '#ff9d5c', 18);
        const before = foe.hp;
        events |= damageFoe(foe, damage, bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02, 0);
        if (foe.hp < before) burst(bullet.x, bullet.y, '#ffe89a', 4, 170, 0.25, 2.5);
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          bullet.active = false;
        }
        break;
      }
    }

    // Enemy globs: fly, fade, strike the player.
    for (const glob of enemyBullets) {
      if (!glob.active) continue;
      glob.life -= dt;
      glob.x += glob.vx * dt;
      glob.y += glob.vy * dt;
      if (glob.life <= 0 || glob.x < -20 || glob.x > FIELD.width + 20 || glob.y < -20 || glob.y > FIELD.height + 20) {
        glob.active = false;
        continue;
      }
      if (Math.hypot(glob.x - player.x, glob.y - player.y) < ENEMY_BULLET.radius + PLAYER.radius - 2) {
        glob.active = false;
        events |= damagePlayer(1, glob.x, glob.y);
      }
    }

    // Glimmers: drift, magnetise, collect.
    const magnet = PLAYER.magnetRadius * mods.magnetMul;
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      pickup.age += dt;
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < magnet) {
        const pull = 1100 * (1 - dist / (magnet + 1));
        pickup.vx += (dx / Math.max(1, dist)) * pull * dt * 4;
        pickup.vy += (dy / Math.max(1, dist)) * pull * dt * 4;
      } else {
        pickup.vx *= Math.max(0, 1 - 3.2 * dt);
        pickup.vy *= Math.max(0, 1 - 3.2 * dt);
      }
      const speedValue = Math.hypot(pickup.vx, pickup.vy);
      const cap = 460;
      if (speedValue > cap) {
        pickup.vx = (pickup.vx / speedValue) * cap;
        pickup.vy = (pickup.vy / speedValue) * cap;
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      if (dist < PLAYER.pickupRadius && !state.over) {
        pickup.active = false;
        state.xp += pickup.value;
        state.combo += 1;
        state.comboTimer = 1.4;
        events |= EVENT_PICKUP;
        burst(pickup.x, pickup.y, '#6ef3ff', 4, 90, 0.3, 2);
        while (state.xp >= state.xpNeed) {
          state.xp -= state.xpNeed;
          state.level += 1;
          state.xpNeed = xpForLevel(state.level);
          state.pendingLevels += 1;
          events |= EVENT_LEVELUP;
        }
      }
    }

    updateAmbientParticles(dt);
    state.foesLeft = aliveFoes() + director.remaining();
    return events;
  }

  reset();
  return { state, reset, step, aliveFoes };
}
