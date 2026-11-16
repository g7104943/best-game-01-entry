// Lumen Reef: every tuning number, colour and gameplay constant in one place.
// The playfield is a fixed 1280x720 logical lagoon; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave. Beating its boss saves the reef and wins the game. */
export const FINAL_WAVE = 10;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 5,
  fireInterval: 0.24,
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletLife: 1.1,
  bulletRadius: 5,
  dashSpeed: 950,
  dashTime: 0.16,
  dashCooldown: 2.2,
  invulnerable: 1.0,
  magnetRadius: 110,
  pickupRadius: 26,
};

export const BULLET = { pool: 96, pierceBase: 0 };

export const ENEMY_BULLET = { pool: 64, radius: 7, speed: 230, life: 4 };

/** Glimmers (experience) needed to rise from `level` to the next one. */
export function xpForLevel(level) {
  return 5 + (level - 1) * 4;
}

export const WAVE = {
  /** Seconds of calm between waves, while the banner shows. */
  breather: 3.0,
  /** Base foes in wave 1; each later wave adds two more. */
  baseCount: 6,
  perWave: 2,
  /** Seconds between spawns at wave 1; shrinks 6% a wave, down to the floor. */
  spawnInterval: 1.1,
  spawnScale: 0.94,
  minSpawnInterval: 0.35,
  /** Foes alive at once, before the director waits. */
  maxAlive: 14,
  /** Score bonus for clearing a wave, times the wave number. */
  clearBonus: 50,
  /** Score bonus for saving the reef. */
  victoryBonus: 1000,
};

export const BOSS = {
  waves: [5, 10],
  radius: 46,
  hp: 55,
  hpFinal: 110,
  speed: 62,
  touchDamage: 2,
  score: 500,
  scoreFinal: 1000,
  glimmers: 12,
  burstInterval: 3.0,
  burstShots: 8,
  spawnInterval: 6,
  spawnBatch: 2,
};

/** How many of each thing can exist at once; pools are allocated once, at boot. */
export const POOLS = { enemies: 64, particles: 420, floaters: 24, pickups: 64 };

/** The lagoon at night: deep indigo water, warm lantern gold, coral and teal life. */
export const PALETTE = {
  backdrop: '#050b18',
  waterTop: '#0e2742',
  waterMid: '#0a1a30',
  waterDeep: '#060e1c',
  ray: 'rgba(96, 168, 224, 0.075)',
  reef: '#081426',
  reefEdge: '#16304e',
  coral: '#ff6b8a',
  anemone: '#ffb84d',
  glowPlant: '#4de3a5',
  mote: '#9fd8ff',
  player: '#ffd76a',
  playerBody: '#ffdf8e',
  playerFin: '#f4b942',
  lure: '#fff3c4',
  bullet: '#ffe89a',
  bulletCore: '#ffffff',
  nibbler: '#6b4fd8',
  spitter: '#2ec4b6',
  splitter: '#f4a259',
  dasher: '#ef476f',
  mini: '#8d6ff0',
  boss: '#3b2a6d',
  bossCore: '#ff5d8f',
  bossEye: '#ffd166',
  enemyBullet: '#c86bff',
  glimmer: '#6ef3ff',
  heart: '#ff5d73',
  heartEmpty: '#33283f',
  text: '#eaf6ff',
  muted: '#8fb0cc',
  panel: '#0d1f36',
  panelEdge: '#2a4a6b',
  card: '#12294a',
  cardEdge: '#3d6a9e',
  gold: '#ffd76a',
  danger: '#ff5d5d',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

/** Where the best score and the mute choice are kept between visits (this browser only). */
export const BEST_KEY = 'lumen-reef.best';
export const MUTE_KEY = 'lumen-reef.muted';
