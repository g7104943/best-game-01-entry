// The screenshot scenes behind ?shot=start|draft|cover|victory|end. Each one
// plays the real rules forward from a fresh world with a simple autopilot,
// exactly as the starter does: the frame is what a real game looks like, and
// the same seed always gives the same frame. The cover and victory scenes
// grant the staged run a strong drafted build (through the same applyUpgrade
// the draft screen uses) so the autopilot can reach the boss and beat it;
// every pixel is still the game's own simulation and renderer.
import { BOSS_LEVEL, STEP, TILE, VIEW_H } from './config.js';
import { T_EMPTY, T_LAVA, isDiggable, tileAt } from './tiles.js';
import { createWorld, EVENT_BOSS, EVENT_DRAFT, EVENT_OVER, EVENT_WIN, stepWorld } from './world.js';
import { applyUpgrade, rollDraft, UPGRADE_POOL } from './upgrades.js';
import { SCREEN_DRAFT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const MAX_STEPS = 60 * 900;

function fakeInput() {
  const state = { mouseDown: false, rightDown: false, mouseX: 640, mouseY: 360 };
  return {
    state,
    axisValue: 0,
    jump: false,
    down: false,
    up: false,
    bomb: false,
    axis() {
      return this.axisValue;
    },
    jumpHeld() {
      return this.jump;
    },
    digDownHeld() {
      return this.down;
    },
    digUpHeld() {
      return this.up;
    },
    bombPressed() {
      return this.bomb;
    },
  };
}

function tileBelow(world) {
  const p = world.player;
  return tileAt(world.tiles, Math.floor(p.x / TILE), Math.floor((p.y + 2) / TILE));
}

function nearestEnemy(world, maxDist) {
  const p = world.player;
  let best = null;
  let bestD = maxDist;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Steer the pilot: dig down, skirt lava, rest when hot, fight when close. */
function pilotDig(world, input, memory) {
  const p = world.player;
  input.axisValue = 0;
  input.jump = false;
  input.down = false;
  input.up = false;
  input.bomb = false;
  input.state.mouseDown = false;

  // Rest the drill when it is about to overheat.
  if (p.heat > world.stats.maxHeat * 0.82) {
    memory.resting = true;
  }
  if (memory.resting) {
    if (p.heat < world.stats.maxHeat * 0.4) memory.resting = false;
    else return;
  }

  // Fight anything close: aim the drill at it.
  const foe = nearestEnemy(world, 90);
  if (foe) {
    input.state.mouseDown = true;
    input.state.mouseX = foe.x;
    input.state.mouseY = foe.y - foe.height / 2 - world.cameraY;
    input.axisValue = foe.x > p.x ? 1 : -1;
    return;
  }

  const below = tileBelow(world);
  if (below === T_LAVA) {
    // Skirt the lava: dig sideways toward the nearer open column.
    const left = tileAt(world.tiles, Math.floor(p.x / TILE) - 2, Math.floor((p.y + 2) / TILE));
    const right = tileAt(world.tiles, Math.floor(p.x / TILE) + 2, Math.floor((p.y + 2) / TILE));
    input.axisValue = left === T_EMPTY ? -1 : right === T_EMPTY ? 1 : memory.side;
    if (world.rand.next() < 0.01) memory.side *= -1;
    return;
  }
  if (isDiggable(below)) {
    input.down = true;
    return;
  }
  if (below === T_EMPTY) {
    // Falling or walking: head for the shaft the world carved (near centre).
    const shaftX = 16 * TILE;
    if (Math.abs(p.x - shaftX) > 60 && p.onGround) {
      input.axisValue = p.x < shaftX ? 1 : -1;
    }
    return;
  }
  // Bedrock below: dig sideways.
  input.axisValue = memory.side;
  if (world.rand.next() < 0.005) memory.side *= -1;
}

/** Fight the wyrm: close in to drill, dodge the telegraph, bomb often. */
function pilotBoss(world, input, memory) {
  const p = world.player;
  const boss = world.boss;
  input.axisValue = 0;
  input.jump = false;
  input.down = false;
  input.up = false;
  input.bomb = false;
  input.state.mouseDown = false;
  if (!boss || boss.dead) return;

  const dx = boss.x - p.x;
  const dist = Math.hypot(dx, boss.y - (p.y - 18));
  memory.bombCd = Math.max(0, (memory.bombCd ?? 0) - STEP);
  memory.strafe = (memory.strafe ?? 0) - STEP;
  if (memory.strafe <= 0) {
    memory.strafe = 0.5;
    memory.strafeDir = (memory.strafeDir ?? 1) * -1;
  }

  // Hurt and hearts on the floor: go and get them before fighting on.
  if (p.hull < world.stats.maxHull * 0.35) {
    let heart = null;
    let heartD = 1e9;
    for (const pk of world.pickups) {
      if (pk.kind !== 'heart') continue;
      const d = Math.abs(pk.x - p.x) + Math.abs(pk.y - p.y);
      if (d < heartD) {
        heartD = d;
        heart = pk;
      }
    }
    if (heart) {
      input.axisValue = heart.x > p.x ? 1 : -1;
      if (heart.y < p.y - 80) input.jump = true;
      return;
    }
  }

  if (boss.state === 'windup' || boss.state === 'charge') {
    // Get out of the line: run perpendicular and jump the charge.
    input.axisValue = dx > 0 ? -1 : 1;
    if (boss.state === 'charge' && Math.abs(dx) < 200) input.jump = true;
    return;
  }
  if (boss.state === 'spit') {
    // Strafe while the globs fly: a moving target is hard to hit.
    input.axisValue = memory.strafeDir;
    if (dist < 70) {
      input.state.mouseDown = true;
      input.state.mouseX = boss.x;
      input.state.mouseY = boss.y - world.cameraY;
    }
  } else if (dist > 70) {
    input.axisValue = dx > 0 ? 1 : -1;
    if (boss.y < p.y - 90) input.jump = true;
  } else if (dist < 45) {
    // Back out of contact range but stay inside drill reach.
    input.axisValue = dx > 0 ? -1 : 1;
  } else {
    input.state.mouseDown = true;
    input.state.mouseX = boss.x;
    input.state.mouseY = boss.y - world.cameraY;
  }
  if (dist < 150 && p.bombs > 0 && memory.bombCd <= 0) {
    input.bomb = true;
    memory.bombCd = 2.5;
  }
}

function grantBuild(world, ids) {
  for (const id of ids) {
    const def = UPGRADE_POOL.find((u) => u.id === id);
    if (def) applyUpgrade(world.stats, world.owned, def);
  }
  world.player.hull = world.stats.maxHull;
  world.player.bombs = world.stats.maxBombs;
}

function autoDraft(world) {
  if (world.player.dead) return;
  const options = rollDraft(world.rand, world.owned, 3);
  if (options.length > 0) {
    const pick = options[0];
    applyUpgrade(world.stats, world.owned, pick);
    if (world.stats.heal) {
      world.player.hull = Math.min(world.stats.maxHull, world.player.hull + world.stats.heal);
      world.stats.heal = 0;
    }
  }
  world.draftPending = false;
}

function runPilot(world, input, mode, stopWhen, autoPick = true) {
  const memory = { side: 1, resting: false, bombCd: 0 };
  let bossSince = -1;
  let crossed = null;
  const trail = [];
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (world.boss && !world.boss.dead) pilotBoss(world, input, memory);
    else pilotDig(world, input, memory);
    const events = stepWorld(world, input, STEP);
    const row = Math.floor(world.player.y / TILE);
    trail.push(`${step}:y${Math.round(world.player.y)} r${row} vy${Math.round(world.player.vy)} g${world.player.onGround ? 1 : 0} gen${world.tiles.generated} ft${tileAt(world.tiles, Math.floor(world.player.x / TILE), row)}`);
    if (trail.length > 10) trail.shift();
    if (!crossed && row >= 360) {
      const px = Math.floor(world.player.x / TILE);
      const col = [];
      for (let y = 355; y <= 365; y += 1) col.push(`${y}:${tileAt(world.tiles, px, y)}`);
      crossed = { step, x: Math.round(world.player.x), y: Math.round(world.player.y), vy: Math.round(world.player.vy), col: col.join(' '), trail: trail.join(' | ') };
    }
    if (events & EVENT_DRAFT && autoPick) autoDraft(world);
    if (events & EVENT_BOSS) bossSince = world.time;
    if (events & EVENT_OVER) return { outcome: 'dead', steps: step, crossed };
    if (events & EVENT_WIN) return { outcome: 'win', steps: step, crossed };
    const stop = stopWhen(world, step, bossSince);
    if (stop) return { outcome: 'staged', steps: step, crossed };
  }
  return { outcome: 'timeout', steps: MAX_STEPS, crossed };
}

export function stageShot(name, world, ui) {
  const input = fakeInput();
  if (name === 'draft') {
    const result = runPilot(world, input, 'draft', (w) => w.draftPending, false);
    if (result.outcome === 'dead') return { screen: SCREEN_OVER, world };
    ui.draftOptions = rollDraft(world.rand, world.owned, 3);
    ui.draftOwned = world.owned;
    ui.freeRerolls = world.freeRerolls;
    return { screen: SCREEN_DRAFT, world };
  }
  if (name === 'end') {
    // A hurried run that stands in the lava: a genuine defeat screen.
    for (let step = 0; step < MAX_STEPS; step += 1) {
      input.axisValue = 0;
      input.jump = false;
      input.down = true;
      input.up = false;
      input.bomb = false;
      input.state.mouseDown = false;
      const events = stepWorld(world, input, STEP);
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, world };
      if (events & EVENT_DRAFT) autoDraft(world);
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, world };
    }
    return { screen: SCREEN_OVER, world };
  }
  if (name === 'cover' || name === 'victory') {
    grantBuild(world, ['bit', 'bit', 'turbo', 'hull', 'hull', 'sinks', 'coolant', 'powerdrill', 'satchel', 'bigbombs', 'skin', 'secondwind', 'plating', 'frame']);
    if (name === 'cover') {
      const result = runPilot(world, input, 'cover', (w, step, bossSince) => {
        if (!w.boss || w.boss.dead) return false;
        const fightTime = bossSince < 0 ? 0 : w.time - bossSince;
        // The boss must be in frame with the player for the cover.
        const inView = Math.abs(w.boss.x - w.player.x) < 480 && Math.abs(w.boss.y - w.player.y) < 300;
        if (!inView || fightTime < 4) return false;
        const exciting = w.boss.state === 'charge' || w.boss.state === 'spit' || w.boss.state === 'windup';
        return exciting || fightTime > 20;
      });
      console.log('[stage] cover run:', result.outcome, 'steps', result.steps, 'level', world.level, 'hull', Math.round(world.player.hull), 'boss', world.boss ? `${Math.round(world.boss.hp)}hp ${world.boss.state}` : 'none', 'crossed', JSON.stringify(result.crossed));
      if (result.outcome === 'dead' || result.outcome === 'timeout') {
        // Fall back to a fresh world staged at a busy mid-game depth.
        const fresh = createWorld(world.seed + 1, world.difficulty, world.audio);
        grantBuild(fresh, ['bit', 'turbo', 'hull', 'magnet']);
        const freshInput = fakeInput();
        const fallback = runPilot(fresh, freshInput, 'cover', (w) => w.level >= 12);
        console.log('[stage] cover fallback:', fallback.outcome, 'steps', fallback.steps, 'level', fresh.level, 'hull', Math.round(fresh.player.hull));
        return { screen: SCREEN_PLAY, world: fresh };
      }
      return { screen: SCREEN_PLAY, world };
    }
    const result = runPilot(world, input, 'victory', () => false);
    console.log('[stage] victory run:', result.outcome, 'steps', result.steps, 'level', world.level, 'hull', Math.round(world.player.hull), 'boss', world.boss ? `${Math.round(world.boss.hp)}hp phase ${world.boss.phase} ${world.boss.state}` : 'none', 'crossed', JSON.stringify(result.crossed));
    if (result.outcome === 'win') return { screen: SCREEN_WIN, world };
    return { screen: SCREEN_OVER, world };
  }
  // 'start' and anything else: the title over the fresh world.
  world.cameraY = -20;
  return { screen: SCREEN_TITLE, world };
}
