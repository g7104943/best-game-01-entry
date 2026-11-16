// The gloom: five foe kinds plus the boss, their stats, how each one moves and
// attacks, and the wave director that decides what arrives each wave. Behaviour
// lives here; the world owns the pools and calls steerEnemy with callbacks for
// the things a foe can cause (spit a glob, burst, call for help).

import { BOSS, FIELD, WAVE } from './config.js';

export const KIND_NIBBLER = 0;
export const KIND_SPITTER = 1;
export const KIND_SPLITTER = 2;
export const KIND_DASHER = 3;
export const KIND_MINI = 4;
export const KIND_BOSS = 5;

/** Base stats per kind; the wave scales health and speed from these. */
export const ENEMY_DEFS = {
  [KIND_NIBBLER]: { radius: 16, hp: 2, speed: 105, touch: 1, score: 10, glimmers: 1 },
  [KIND_SPITTER]: { radius: 18, hp: 3, speed: 85, touch: 1, score: 25, glimmers: 2 },
  [KIND_SPLITTER]: { radius: 22, hp: 4, speed: 70, touch: 1, score: 30, glimmers: 2, splitsInto: KIND_MINI, splitCount: 2 },
  [KIND_DASHER]: { radius: 14, hp: 2, speed: 120, touch: 1, score: 20, glimmers: 1 },
  [KIND_MINI]: { radius: 10, hp: 1, speed: 165, touch: 1, score: 5, glimmers: 1 },
  [KIND_BOSS]: { radius: BOSS.radius, hp: BOSS.hp, speed: BOSS.speed, touch: BOSS.touchDamage, score: BOSS.score, glimmers: BOSS.glimmers },
};

/** Health and speed growth with the wave; speed growth is capped so foes stay fair. */
export function scaledStats(kind, wave, finalWave) {
  const def = ENEMY_DEFS[kind];
  const hpMul = 1 + 0.09 * (wave - 1);
  const speedMul = Math.min(1.3, 1 + 0.02 * (wave - 1));
  if (kind === KIND_BOSS) {
    return {
      hp: wave >= finalWave ? BOSS.hpFinal : BOSS.hp,
      speed: def.speed,
      score: wave >= finalWave ? BOSS.scoreFinal : BOSS.score,
    };
  }
  return { hp: Math.round(def.hp * hpMul), speed: def.speed * speedMul, score: def.score };
}

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Steer one foe for a step. `ctx` carries the player, the clock, the random
 * source and the callbacks a foe uses to attack: spit(x, y, angle),
 * burst(x, y, count, speed) and summon(kind, x, y). The foe's velocity is
 * written back onto it; the world moves it and keeps it in the field.
 */
export function steerEnemy(foe, dt, ctx) {
  const player = ctx.player;
  const dx = player.x - foe.x;
  const dy = player.y - foe.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / dist;
  const ny = dy / dist;
  foe.flash = Math.max(0, foe.flash - dt);

  if (foe.kind === KIND_NIBBLER || foe.kind === KIND_MINI) {
    const wobble = Math.sin(ctx.time * 3 + foe.phase) * 0.45;
    const px = -ny * wobble;
    const py = nx * wobble;
    foe.vx = (nx + px) * foe.speed;
    foe.vy = (ny + py) * foe.speed;
    foe.face = Math.atan2(foe.vy, foe.vx);
    return;
  }

  if (foe.kind === KIND_SPITTER) {
    // Holds a ring around the player, strafing, and spits globs.
    const want = 270;
    const toward = dist > want + 30 ? 1 : dist < want - 30 ? -1 : 0;
    const strafe = foe.strafeDir;
    foe.vx = (nx * toward + -ny * strafe * 0.8) * foe.speed;
    foe.vy = (ny * toward + nx * strafe * 0.8) * foe.speed;
    foe.face = Math.atan2(dy, dx);
    foe.fireTimer -= dt;
    if (foe.fireTimer <= 0 && dist < 520) {
      foe.fireTimer = 2.3;
      ctx.spit(foe.x, foe.y, Math.atan2(dy, dx));
    }
    return;
  }

  if (foe.kind === KIND_SPLITTER) {
    foe.vx = nx * foe.speed;
    foe.vy = ny * foe.speed;
    foe.face = Math.atan2(dy, dx);
    return;
  }

  if (foe.kind === KIND_DASHER) {
    foe.stateTimer -= dt;
    if (foe.state === 0) {
      // Roam: drift toward the player until close enough to strike.
      foe.vx = nx * foe.speed;
      foe.vy = ny * foe.speed;
      foe.face = Math.atan2(dy, dx);
      if (dist < 300 && foe.stateTimer <= 0) {
        foe.state = 1;
        foe.stateTimer = 0.5;
      }
    } else if (foe.state === 1) {
      // Telegraph: nearly still, locking the lunge line. The renderer rings it.
      foe.vx *= 0.8;
      foe.vy *= 0.8;
      foe.face = Math.atan2(dy, dx);
      if (foe.stateTimer <= 0) {
        foe.state = 2;
        foe.stateTimer = 0.42;
        foe.lungeX = nx;
        foe.lungeY = ny;
      }
    } else if (foe.state === 2) {
      // Lunge: fast and straight.
      foe.vx = foe.lungeX * 540;
      foe.vy = foe.lungeY * 540;
      if (foe.stateTimer <= 0) {
        foe.state = 3;
        foe.stateTimer = 0.7;
      }
    } else {
      // Recover: slow, then roam again.
      foe.vx = nx * foe.speed * 0.4;
      foe.vy = ny * foe.speed * 0.4;
      if (foe.stateTimer <= 0) {
        foe.state = 0;
        foe.stateTimer = 0.6;
      }
    }
    return;
  }

  if (foe.kind === KIND_BOSS) {
    const enraged = foe.hp < foe.maxHp * 0.3;
    foe.vx = nx * foe.speed * (enraged ? 1.35 : 1);
    foe.vy = ny * foe.speed * (enraged ? 1.35 : 1);
    foe.face = Math.atan2(dy, dx);
    foe.fireTimer -= dt;
    if (foe.fireTimer <= 0) {
      foe.fireTimer = enraged ? BOSS.burstInterval * 0.65 : BOSS.burstInterval;
      ctx.burst(foe.x, foe.y, BOSS.burstShots, enraged ? 230 : 190);
    }
    foe.summonTimer -= dt;
    if (foe.summonTimer <= 0) {
      foe.summonTimer = BOSS.spawnInterval;
      for (let index = 0; index < BOSS.spawnBatch; index += 1) {
        ctx.summon(KIND_NIBBLER, foe.x, foe.y);
      }
    }
  }
}

/**
 * The wave director: builds each wave's roster, then hands kinds out on a
 * timer while the field has room. Boss waves open with the boss itself, then
 * a trickle of nibblers keeps the pressure on.
 */
export function createDirector(random) {
  let queue = [];
  let timer = 0;
  let wave = 0;
  let total = 0;

  function planWave(number) {
    const kinds = [];
    if (BOSS.waves.includes(number)) {
      kinds.push(KIND_BOSS);
      const trickle = 3 + Math.floor(number / 2);
      for (let index = 0; index < trickle; index += 1) kinds.push(KIND_NIBBLER);
      return kinds;
    }
    const count = WAVE.baseCount + WAVE.perWave * (number - 1);
    for (let index = 0; index < count; index += 1) {
      const roll = random.next();
      if (number >= 4 && roll < 0.22) kinds.push(KIND_SPITTER);
      else if (number >= 3 && roll < 0.42) kinds.push(KIND_SPLITTER);
      else if (number >= 2 && roll < 0.64) kinds.push(KIND_DASHER);
      else kinds.push(KIND_NIBBLER);
    }
    return kinds;
  }

  function spawnInterval() {
    return Math.max(WAVE.minSpawnInterval, WAVE.spawnInterval * WAVE.spawnScale ** (wave - 1));
  }

  return {
    beginWave(number) {
      wave = number;
      queue = planWave(number);
      total = queue.length;
      timer = 0.4;
    },
    /** The next kind to spawn this step, or null when the director waits. */
    nextSpawn(dt, alive) {
      if (queue.length === 0) return null;
      if (alive >= WAVE.maxAlive && queue[0] !== KIND_BOSS) return null;
      timer -= dt;
      if (timer > 0) return null;
      timer = spawnInterval();
      return queue.shift();
    },
    remaining() {
      return queue.length;
    },
    total() {
      return total;
    },
    isBossWave() {
      return BOSS.waves.includes(wave);
    },
  };
}

/** A spawn point on the field's edge, at least 240px from the player. */
export function edgeSpawn(random, player) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const side = random.int(0, 3);
    const along = random.range(40, side % 2 === 0 ? FIELD.width - 40 : FIELD.height - 40);
    const point =
      side === 0
        ? { x: along, y: 30 }
        : side === 1
          ? { x: FIELD.width - 30, y: along }
          : side === 2
            ? { x: along, y: FIELD.height - 30 }
            : { x: 30, y: along };
    if (distance(point.x, point.y, player.x, player.y) >= 240) return point;
  }
  return { x: FIELD.width / 2, y: 30 };
}
