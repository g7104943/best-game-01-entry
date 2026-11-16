// The mountain's tiles and how a world is grown from a seed.
//
// A world is a grid WORLD_W tiles wide and as tall as the player digs. Rows
// are generated in chunks as the camera descends, in depth bands: topsoil,
// rock, crystal, deep rock and magma. Every chunk keeps a winding open shaft
// so the way down is never sealed, and caverns, ore, lava, water, gas and
// boulders are scattered by band. Level 30 is the Core Wyrm's arena.
import { BOSS_LEVEL, CHUNK_ROWS, ROWS_PER_LEVEL, TILE, WORLD_W } from './config.js';

export const T_EMPTY = 0;
export const T_DIRT = 1;
export const T_ROCK = 2;
export const T_HARD = 3;
export const T_CRYSTAL = 4;
export const T_ORE = 5;
export const T_METAL = 6;
export const T_BEDROCK = 7;
export const T_LAVA = 8;
export const T_WATER = 9;
export const T_GAS = 10;
export const T_BOULDER = 11;

export const TILE_DEF = {
  [T_EMPTY]: { hp: 0, solid: false },
  [T_DIRT]: { hp: 1, solid: true, drill: 1 },
  [T_ROCK]: { hp: 2, solid: true, drill: 1 },
  [T_HARD]: { hp: 3, solid: true, drill: 1 },
  [T_CRYSTAL]: { hp: 2, solid: true, drill: 1 },
  [T_ORE]: { hp: 2, solid: true, drill: 1 },
  [T_METAL]: { hp: 4, solid: true, drill: 1 },
  [T_BEDROCK]: { hp: Infinity, solid: true, drill: 0 },
  [T_LAVA]: { hp: 0, solid: false },
  [T_WATER]: { hp: 0, solid: false },
  [T_GAS]: { hp: 1, solid: true, drill: 1 },
  [T_BOULDER]: { hp: 2, solid: true, drill: 1 },
};

export function isSolid(tile) {
  return TILE_DEF[tile].solid;
}

export function isDiggable(tile) {
  return TILE_DEF[tile].drill > 0;
}

/** Depth band of a row: 0 topsoil, 1 rock, 2 crystal, 3 deep, 4 magma. */
export function bandOf(row) {
  const level = Math.floor(row / ROWS_PER_LEVEL) + 1;
  if (level <= 4) return 0;
  if (level <= 10) return 1;
  if (level <= 17) return 2;
  if (level <= 24) return 3;
  return 4;
}

export function levelOf(row) {
  return Math.floor(row / ROWS_PER_LEVEL) + 1;
}

export function rowOfLevel(level) {
  return (level - 1) * ROWS_PER_LEVEL;
}

/** Create the tile store: an array of rows, each a Uint8Array of WORLD_W. */
export function createTiles() {
  return { rows: [], generated: 0 };
}

export function tileAt(tiles, x, y) {
  if (x < 0 || x >= WORLD_W) return T_BEDROCK;
  if (y < 0) return T_EMPTY;
  if (y >= tiles.rows.length) return T_ROCK;
  return tiles.rows[y][x];
}

export function setTile(tiles, x, y, tile) {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= tiles.rows.length) return;
  tiles.rows[y][x] = tile;
}

function fillRow(tiles, y, rand) {
  const band = bandOf(y);
  const row = new Uint8Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x += 1) {
    if (x === 0 || x === WORLD_W - 1) {
      row[x] = T_BEDROCK;
      continue;
    }
    const roll = rand.next();
    if (band === 0) {
      row[x] = roll < 0.78 ? T_DIRT : roll < 0.9 ? T_ROCK : roll < 0.96 ? T_ORE : T_DIRT;
    } else if (band === 1) {
      row[x] = roll < 0.45 ? T_DIRT : roll < 0.8 ? T_ROCK : roll < 0.88 ? T_ORE : roll < 0.93 ? T_CRYSTAL : T_GAS;
    } else if (band === 2) {
      row[x] = roll < 0.22 ? T_DIRT : roll < 0.58 ? T_ROCK : roll < 0.72 ? T_CRYSTAL : roll < 0.83 ? T_ORE : roll < 0.9 ? T_HARD : T_GAS;
    } else if (band === 3) {
      row[x] = roll < 0.34 ? T_ROCK : roll < 0.6 ? T_HARD : roll < 0.72 ? T_METAL : roll < 0.82 ? T_CRYSTAL : roll < 0.9 ? T_ORE : T_GAS;
    } else {
      row[x] = roll < 0.3 ? T_HARD : roll < 0.55 ? T_ROCK : roll < 0.68 ? T_METAL : roll < 0.8 ? T_CRYSTAL : roll < 0.88 ? T_ORE : T_GAS;
    }
  }
  tiles.rows[y] = row;
}

function carveBlob(tiles, cx, cy, radius, rand, liquid) {
  // The arena is sacred ground: no cavern or pool may eat its shell.
  const arenaTop = rowOfLevel(BOSS_LEVEL);
  const arenaBottom = arenaTop + ROWS_PER_LEVEL;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 1 || x >= WORLD_W - 1 || y < 3 || y >= tiles.rows.length) continue;
      if (y >= arenaTop && y < arenaBottom) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius + rand.range(-0.6, 0.6)) {
        tiles.rows[y][x] = liquid !== undefined && y === cy + radius ? liquid : T_EMPTY;
      }
    }
  }
}

function carveShaft(tiles, fromRow, toRow, rand, shaftX) {
  let x = shaftX;
  for (let y = fromRow; y < toRow; y += 1) {
    if (rand.chance(0.35)) x = Math.max(2, Math.min(WORLD_W - 3, x + rand.pick([-1, 1])));
    const width = rand.chance(0.3) ? 3 : 2;
    for (let dx = 0; dx < width; dx += 1) {
      const tx = x + dx;
      if (tx > 0 && tx < WORLD_W - 1 && y >= 3) tiles.rows[y][tx] = T_EMPTY;
    }
  }
  return x;
}

function sprinkle(tiles, fromRow, toRow, rand) {
  const band = bandOf(fromRow);
  for (let y = fromRow; y < toRow; y += 1) {
    for (let x = 1; x < WORLD_W - 1; x += 1) {
      const tile = tiles.rows[y][x];
      if (tile !== T_ROCK && tile !== T_HARD && tile !== T_DIRT) continue;
      const roll = rand.next();
      if (roll < 0.012) tiles.rows[y][x] = T_BOULDER;
      else if (band >= 3 && roll < 0.02) tiles.rows[y][x] = T_GAS;
    }
  }
  // Caverns with room to fight in, one or two per chunk.
  const caverns = rand.int(1, 2);
  for (let i = 0; i < caverns; i += 1) {
    const cx = rand.int(4, WORLD_W - 5);
    const cy = rand.int(fromRow + 2, toRow - 3);
    carveBlob(tiles, cx, cy, rand.int(2, 3), rand);
  }
  // Lava pools deep down, water pockets in the middle bands.
  if (band >= 3 && rand.chance(0.8)) {
    const cx = rand.int(4, WORLD_W - 5);
    const cy = rand.int(fromRow + 3, toRow - 3);
    carveBlob(tiles, cx, cy, rand.int(2, 3), rand, T_LAVA);
  }
  if ((band === 1 || band === 2) && rand.chance(0.7)) {
    const cx = rand.int(4, WORLD_W - 5);
    const cy = rand.int(fromRow + 3, toRow - 3);
    carveBlob(tiles, cx, cy, 2, rand, T_WATER);
  }
}

/** The boss arena: a wide open cavern with a bedrock shell, pillars and lava. */
function buildArena(tiles, rand) {
  const top = rowOfLevel(BOSS_LEVEL);
  const bottom = top + ROWS_PER_LEVEL;
  for (let y = top; y < bottom; y += 1) {
    const row = new Uint8Array(WORLD_W);
    for (let x = 0; x < WORLD_W; x += 1) {
      if (x === 0 || x === WORLD_W - 1 || y === bottom - 1) row[x] = T_BEDROCK;
      else if (y === top && x > 2 && x < WORLD_W - 3) row[x] = T_ROCK;
      else row[x] = T_EMPTY;
    }
    tiles.rows[y] = row;
  }
  // Rock pillars to hide behind, lava pools at the floor's edges.
  for (const px of [6, 13, 19, 26]) {
    const height = rand.int(3, 5);
    for (let i = 0; i < height; i += 1) tiles.rows[bottom - 2 - i][px] = T_HARD;
  }
  for (let x = 2; x <= 5; x += 1) tiles.rows[bottom - 2][x] = T_LAVA;
  for (let x = WORLD_W - 6; x <= WORLD_W - 3; x += 1) tiles.rows[bottom - 2][x] = T_LAVA;
  for (let x = 2; x < WORLD_W - 2; x += 1) {
    if (rand.chance(0.3)) tiles.rows[bottom - 2][x] = T_CRYSTAL;
  }
  // The shaft above the arena stays open so the player drops in.
  for (let y = top - 2; y < top; y += 1) {
    for (let x = 14; x <= 17; x += 1) tiles.rows[y][x] = T_EMPTY;
  }
}

/**
 * Grow the world until row `uptoRow` exists. Returns the arena's top row when
 * the boss level was generated, else -1. Generation is deterministic per seed.
 */
export function ensureRows(tiles, uptoRow, rand, shaftState) {
  let arenaTop = -1;
  while (tiles.generated <= uptoRow) {
    const from = tiles.generated;
    const to = Math.min(from + CHUNK_ROWS, uptoRow + 1);
    for (let y = from; y < to; y += 1) {
      if (y < 3) {
        // The surface: open sky, then a dirt cap the shaft starts in.
        const row = new Uint8Array(WORLD_W);
        for (let x = 0; x < WORLD_W; x += 1) row[x] = x === 0 || x === WORLD_W - 1 ? T_BEDROCK : y < 2 ? T_EMPTY : T_DIRT;
        tiles.rows[y] = row;
      } else {
        fillRow(tiles, y, rand);
      }
    }
    tiles.generated = to;
    const arenaRow = rowOfLevel(BOSS_LEVEL);
    if (from <= arenaRow && arenaRow < to) {
      buildArena(tiles, rand);
      arenaTop = arenaRow;
      // The arena writes rows past this chunk's end; the next chunk must
      // start after the arena, or its fill would overwrite the arena floor.
      tiles.generated = Math.max(to, arenaRow + ROWS_PER_LEVEL);
      // The rows above the arena in this chunk still need their shaft.
      if (from < arenaRow && from >= 3) {
        shaftState.x = carveShaft(tiles, from, arenaRow, rand, shaftState.x);
        sprinkle(tiles, from, arenaRow, rand);
      }
    } else if (from >= 3) {
      shaftState.x = carveShaft(tiles, Math.max(from, 3), to, rand, shaftState.x);
      sprinkle(tiles, Math.max(from, 3), to, rand);
    }
  }
  return arenaTop;
}

export function rowToY(row) {
  return row * TILE;
}
