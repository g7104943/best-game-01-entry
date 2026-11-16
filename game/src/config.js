// Every tuning number for COREBREAK lives here: the grid, the physics, the
// three difficulties, the scoring and the draft pool's shape. Nothing in the
// simulation hard-codes a balance number of its own.

export const TILE = 40;
export const WORLD_W = 32;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;
export const CHUNK_ROWS = 16;
export const ROWS_PER_LEVEL = 12;
export const BOSS_LEVEL = 30;
export const DRAFT_EVERY = 5;
export const BEST_KEY = 'corebreak.best';
export const DEPTH_KEY = 'corebreak.bestDepth';

export const GRAVITY = 1900;
export const MOVE_SPEED = 250;
export const JUMP_SPEED = 640;
export const PLAYER_W = 30;
export const PLAYER_H = 36;

export const DIFFICULTIES = {
  surveyor: {
    id: 'surveyor',
    name: 'SURVEYOR',
    blurb: 'A gentle descent. For learning the mountain.',
    enemyHp: 0.7,
    enemyDamage: 0.7,
    heatGain: 0.7,
    startHull: 120,
    scoreMult: 1,
  },
  prospector: {
    id: 'prospector',
    name: 'PROSPECTOR',
    blurb: 'The mountain as it is. The intended climb.',
    enemyHp: 1,
    enemyDamage: 1,
    heatGain: 1,
    startHull: 100,
    scoreMult: 1.5,
  },
  helldiver: {
    id: 'helldiver',
    name: 'HELLDIVER',
    blurb: 'Thin hull, hot drill, angry rock. For glory.',
    enemyHp: 1.4,
    enemyDamage: 1.3,
    heatGain: 1.3,
    startHull: 80,
    scoreMult: 2,
  },
};

export const ENEMY_TYPES = {
  grub: { hp: 22, damage: 8, score: 25, speed: 55, width: 30, height: 20 },
  bat: { hp: 14, damage: 6, score: 20, speed: 105, width: 28, height: 18 },
  imp: { hp: 34, damage: 10, score: 60, speed: 45, width: 30, height: 30 },
  golem: { hp: 95, damage: 16, score: 150, speed: 32, width: 44, height: 48 },
};

export const BOSS_HP = 620;
export const BOSS_SEGMENTS = 9;
