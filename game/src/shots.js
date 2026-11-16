// The screenshot scenes behind ?shot=title|play|choice|end. Each one plays the
// real rules forward from a fresh world for a fixed time, steered by a simple
// autopilot, so every frame is what a real game looks like and the same seed
// always gives the same frame. The play pilot kites, gathers and shoots; the
// end pilot drifts and never fires, so the gloom catches it.

import { FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { KIND_BOSS } from './enemies.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_CHOICE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { rollUpgrades, takeUpgrade } from './upgrades.js';

const TITLE_SECONDS = 6;
const PLAY_SECONDS = 60;
const FIGHT_SECONDS = 25;
const CHOICE_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 600;
const FLEE_RANGE = 175;
const GATHER_RANGE = 380;

/** The nearest active foe to the player, preferring the boss. */
function nearestFoe(state) {
  if (state.boss !== null && state.boss.active) return state.boss;
  let best = null;
  let bestDist = Infinity;
  for (const foe of state.foes) {
    if (!foe.active) continue;
    const dist = Math.hypot(foe.x - state.player.x, foe.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = foe;
    }
  }
  return best;
}

function nearestPickup(state) {
  let best = null;
  let bestDist = Infinity;
  for (const pickup of state.pickups) {
    if (!pickup.active) continue;
    const dist = Math.hypot(pickup.x - state.player.x, pickup.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = pickup;
    }
  }
  return best;
}

/** A competent pilot: flee what is close, gather glimmers, kite the rest. */
function pilotPlay(state) {
  const player = state.player;
  const foe = nearestFoe(state);
  let moveX = 0;
  let moveY = 0;
  let dash = false;
  if (foe !== null) {
    const dx = player.x - foe.x;
    const dy = player.y - foe.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist < FLEE_RANGE) {
      // Escape on a curve: away from the foe, bending sideways, so the
      // flight does not pin the fish against a wall.
      moveX = (dx / dist) * 0.85 + (-dy / dist) * 0.5;
      moveY = (dy / dist) * 0.85 + (dx / dist) * 0.5;
      if (dist < 95 && player.dashCooldown <= 0) dash = true;
    } else {
      // Strafe around the foe at mid range, drifting toward glimmers.
      const pickup = nearestPickup(state);
      if (pickup !== null && Math.hypot(pickup.x - player.x, pickup.y - player.y) < GATHER_RANGE) {
        moveX = (pickup.x - player.x) / Math.max(1, Math.hypot(pickup.x - player.x, pickup.y - player.y));
        moveY = (pickup.y - player.y) / Math.max(1, Math.hypot(pickup.x - player.x, pickup.y - player.y));
      } else {
        moveX = (-dy / dist) * 0.9;
        moveY = (dx / dist) * 0.9;
        if (dist > 340) {
          moveX += (foe.x - player.x) / dist * 0.5;
          moveY += (foe.y - player.y) / dist * 0.5;
        }
      }
    }
  } else {
    const pickup = nearestPickup(state);
    if (pickup !== null) {
      const dist = Math.max(1, Math.hypot(pickup.x - player.x, pickup.y - player.y));
      moveX = (pickup.x - player.x) / dist;
      moveY = (pickup.y - player.y) / dist;
    }
  }
  const len = Math.hypot(moveX, moveY);
  if (len > 1) {
    moveX /= len;
    moveY /= len;
  }
  // A gentle pull toward the middle keeps the fight in view.
  const centreX = FIELD.width / 2 - player.x;
  const centreY = FIELD.height / 2 - player.y;
  const centreDist = Math.hypot(centreX, centreY);
  if (centreDist > 240) {
    const pull = Math.min(0.9, (centreDist - 240) / 250);
    moveX += (centreX / centreDist) * pull;
    moveY += (centreY / centreDist) * pull;
    const total = Math.hypot(moveX, moveY);
    if (total > 1) {
      moveX /= total;
      moveY /= total;
    }
  }
  const aim = foe === null ? { x: player.x + 100, y: player.y } : { x: foe.x, y: foe.y };
  return { move: { x: moveX, y: moveY }, aim, firing: foe !== null, dash };
}

/** A hapless pilot: drifts toward the middle, never fires, never dashes. */
function pilotEnd(state) {
  const player = state.player;
  const dx = FIELD.width / 2 - player.x;
  const dy = FIELD.height / 2 - player.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const speed = Math.min(1, dist / 200);
  return {
    move: { x: (dx / dist) * speed * 0.4, y: (dy / dist) * speed * 0.4 },
    aim: { x: player.x + 100, y: player.y },
    firing: false,
    dash: false,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the
 * best score to show, and any upgrade choices to offer.
 */
export function stageShot(name, world, seed) {
  const stagingRandom = createRandom((seed ^ 0x5f3a) >>> 0);
  world.reset();
  if (name !== 'play' && name !== 'choice' && name !== 'end') {
    for (let index = 0; index < TITLE_SECONDS / STEP; index += 1) {
      world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, firing: false, dash: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, choices: null };
  }

  if (name === 'end') {
    // Fight well for a while, gathering a real score, then stop fighting and
    // let the gloom close in: the end screen shows a run that happened.
    for (let index = 0; index < FIGHT_SECONDS / STEP; index += 1) {
      world.step(STEP, pilotPlay(world.state), false);
      if (world.state.pendingLevels > 0) {
        const choices = rollUpgrades(stagingRandom, world.state.mods, 3);
        if (choices.length > 0) takeUpgrade(choices[0], world.state.mods, world.state.player);
        world.state.pendingLevels -= 1;
      }
      if (world.state.over) break;
    }
    for (let index = 0; index < END_LIMIT_SECONDS / STEP && !world.state.over; index += 1) {
      const events = world.step(STEP, pilotEnd(world.state), false);
      if (events & (EVENT_OVER | EVENT_WIN)) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score, choices: null };
  }

  if (name === 'choice') {
    for (let index = 0; index < CHOICE_LIMIT_SECONDS / STEP; index += 1) {
      world.step(STEP, pilotPlay(world.state), false);
      if (world.state.pendingLevels > 0) break;
      if (world.state.over) break;
    }
    const choices = rollUpgrades(stagingRandom, world.state.mods, 3);
    return { screen: SCREEN_CHOICE, best: world.state.score, choices };
  }

  // Play: two passes over the same seeded run. The first finds the liveliest
  // frame; the second replays deterministically to exactly that frame, so the
  // cover always shows the fight at its best.
  for (const seconds of [PLAY_SECONDS, 26, 18]) {
    const survey = surveyRun(world, stagingRandom, seconds);
    if (!survey.alive && survey.bestSteps < 12 * 60) continue;
    world.reset();
    const replayRandom = createRandom((seed ^ 0x5f3a) >>> 0);
    for (let index = 0; index < survey.bestSteps; index += 1) {
      world.step(STEP, pilotPlay(world.state), false);
      if (world.state.pendingLevels > 0) {
        const choices = rollUpgrades(replayRandom, world.state.mods, 3);
        if (choices.length > 0) takeUpgrade(choices[0], world.state.mods, world.state.player);
        world.state.pendingLevels -= 1;
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score, choices: null };
  }
  return { screen: SCREEN_PLAY, best: world.state.score, choices: null };
}

/**
 * Play a run with the pilot, scoring every frame after the opening seconds,
 * and report the liveliest step and whether the pilot survived the horizon.
 */
function surveyRun(world, stagingRandom, seconds) {
  world.reset();
  let bestSteps = 0;
  let bestScore = -1;
  let steps = 0;
  for (let index = 0; index < seconds / STEP; index += 1) {
    const events = world.step(STEP, pilotPlay(world.state), false);
    steps += 1;
    if (world.state.pendingLevels > 0) {
      const choices = rollUpgrades(stagingRandom, world.state.mods, 3);
      if (choices.length > 0) takeUpgrade(choices[0], world.state.mods, world.state.player);
      world.state.pendingLevels -= 1;
    }
    if (events & (EVENT_OVER | EVENT_WIN)) return { bestSteps, bestScore, alive: false };
    if (world.state.elapsed > 10) {
      const score = frameScore(world.state);
      if (score > bestScore) {
        bestScore = score;
        bestSteps = steps;
      }
    }
  }
  return { bestSteps, bestScore, alive: true };
}

/** How lively a frame is: foes and bolts around, the player near the middle. A frame at the edge scores a fraction of a central one, however busy, and a frame with fewer than four foes never wins over a crowded one. */
function frameScore(state) {
  const player = state.player;
  let foes = 0;
  for (const foe of state.foes) if (foe.active) foes += 1;
  let bolts = 0;
  for (const bullet of state.bullets) if (bullet.active) bolts += 1;
  let glimmers = 0;
  for (const pickup of state.pickups) if (pickup.active) glimmers += 1;
  const centreDist = Math.hypot(player.x - FIELD.width / 2, player.y - FIELD.height / 2);
  const centred = centreDist < 180 ? 1 : centreDist < 300 ? 0.6 : 0.25;
  const crowd = foes >= 4 ? foes * 3 : foes * 0.5;
  return (crowd + Math.min(bolts, 4) + glimmers) * centred;
}
