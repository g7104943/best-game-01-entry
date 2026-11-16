// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, draft, game over and victory.
//
// ?seed=N fixes the world. ?shot=start|draft|cover|victory|end (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot. window.__game exposes read-only state
// for playtesting.
import { BEST_KEY, DEPTH_KEY, DIFFICULTIES, STEP } from './config.js';
import { createWorld, EVENT_BOSS, EVENT_DRAFT, EVENT_LEVEL, EVENT_OVER, EVENT_WIN, startEndless, stepWorld } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_REROLL, createInput } from './input.js';
import { createRenderer, SCREEN_DRAFT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { applyUpgrade, rollDraft, UPGRADE_POOL } from './upgrades.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

const ui = {
  screen: SCREEN_TITLE,
  hits: [],
  mouseX: 0,
  mouseY: 0,
  best: 0,
  bestDepth: 0,
  selectedDifficulty: 'prospector',
  difficulties: [DIFFICULTIES.surveyor, DIFFICULTIES.prospector, DIFFICULTIES.helldiver],
  draftOptions: [],
  draftOwned: {},
  freeRerolls: 1,
  upgradeDefs: UPGRADE_POOL,
  muted: false,
};

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}

ui.best = readNumber(BEST_KEY);
ui.bestDepth = readNumber(DEPTH_KEY);

function announce(message) {
  status.textContent = message;
}

function saveBest(world) {
  if (world.score > ui.best) {
    ui.best = world.score;
    saveNumber(BEST_KEY, ui.best);
  }
  if (world.maxLevel > ui.bestDepth) {
    ui.bestDepth = world.maxLevel;
    saveNumber(DEPTH_KEY, ui.bestDepth);
  }
}

function openDraft(world) {
  ui.draftOptions = rollDraft(world.rand, world.owned, 3);
  ui.draftOwned = world.owned;
  ui.freeRerolls = world.freeRerolls;
  ui.screen = SCREEN_DRAFT;
  audio.draft();
  announce('Choose an upgrade.');
}

function pickDraft(world, index) {
  const option = ui.draftOptions[index];
  if (!option) return;
  applyUpgrade(world.stats, world.owned, option);
  if (world.stats.heal) {
    world.player.hull = Math.min(world.stats.maxHull, world.player.hull + world.stats.heal);
    world.stats.heal = 0;
  }
  world.draftPending = false;
  world.freeRerolls = 1;
  ui.screen = SCREEN_PLAY;
  audio.pick();
  announce(`${option.name} installed.`);
}

function rerollDraft(world) {
  if (ui.freeRerolls > 0) {
    ui.freeRerolls -= 1;
    world.freeRerolls = ui.freeRerolls;
  } else if (world.ore >= 30) {
    world.ore -= 30;
  } else {
    return;
  }
  ui.draftOptions = rollDraft(world.rand, world.owned, 3);
  audio.click();
}

function hitAt(x, y) {
  for (let i = ui.hits.length - 1; i >= 0; i -= 1) {
    const h = ui.hits[i];
    if (!h.disabled && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}

function runShot(name) {
  const difficulty = name === 'victory' ? DIFFICULTIES.surveyor : DIFFICULTIES.prospector;
  let world = createWorld(seed, difficulty, audio);
  const staged = stageShot(name, world, ui);
  world = staged.world;
  ui.screen = staged.screen;
  ui.draftOwned = world.owned;
  let painted = 0;
  function paint() {
    renderer.draw(world, ui);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__game = {
        screen: ui.screen,
        level: world.level,
        score: world.score,
        hull: Math.round(world.player.hull),
        boss: world.boss ? { hp: Math.round(world.boss.hp), phase: world.boss.phase, state: world.boss.state } : null,
        draftPending: world.draftPending,
        hits: ui.hits.map((h) => h.id),
      };
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let world = createWorld(seed, DIFFICULTIES[ui.selectedDifficulty], audio);
  let accumulator = 0;
  let last = performance.now();

  function startRun(difficultyId) {
    const runSeed = params.has('seed') ? seed : Math.floor(Math.random() * 4294967296);
    world = createWorld(runSeed, DIFFICULTIES[difficultyId], audio);
    ui.selectedDifficulty = difficultyId;
    ui.screen = SCREEN_PLAY;
    accumulator = 0;
    input.clear();
    announce(`Digging. ${DIFFICULTIES[difficultyId].name} difficulty.`);
  }

  function handleClicks() {
    for (const click of input.takeClicks()) {
      audio.unlock();
      const hit = hitAt(click.x, click.y);
      if (!hit) {
        if (ui.screen === SCREEN_TITLE) audio.click();
        continue;
      }
      audio.click();
      const [kind, arg] = hit.id.split(':');
      if (kind === 'diff') {
        ui.selectedDifficulty = arg;
      } else if (hit.id === 'start') {
        startRun(ui.selectedDifficulty);
      } else if (hit.id === 'resume') {
        ui.screen = SCREEN_PLAY;
      } else if (hit.id === 'restart') {
        startRun(ui.selectedDifficulty);
      } else if (hit.id === 'endless') {
        startEndless(world);
        ui.screen = SCREEN_PLAY;
        announce('Endless descent. The deep goes on.');
      } else if (hit.id === 'reroll') {
        rerollDraft(world);
      } else if (kind === 'draft') {
        pickDraft(world, Number(arg));
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      ui.muted = audio.toggleMute();
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (ui.screen === SCREEN_TITLE) startRun(ui.selectedDifficulty);
      else if (ui.screen === SCREEN_OVER) startRun(ui.selectedDifficulty);
      else if (ui.screen === SCREEN_WIN) {
        startEndless(world);
        ui.screen = SCREEN_PLAY;
      } else if (ui.screen === SCREEN_PAUSED) ui.screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (ui.screen === SCREEN_PLAY) {
        ui.screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (ui.screen === SCREEN_PAUSED) {
        ui.screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_REROLL) {
      if (ui.screen === SCREEN_DRAFT) rerollDraft(world);
      else if (ui.screen === SCREEN_OVER || ui.screen === SCREEN_WIN) startRun(ui.selectedDifficulty);
    }
    const choice = input.takeChoice();
    if (choice !== undefined) {
      if (ui.screen === SCREEN_DRAFT) pickDraft(world, choice);
      else if (ui.screen === SCREEN_TITLE && ui.difficulties[choice]) {
        startRun(ui.difficulties[choice].id);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    ui.mouseX = input.state.mouseX;
    ui.mouseY = input.state.mouseY;
    handleClicks();
    handleActions();
    if (ui.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const events = stepWorld(world, input, STEP);
        accumulator -= STEP;
        if (events & EVENT_DRAFT && !world.player.dead) openDraft(world);
        if (events & EVENT_BOSS) announce('The Core Wyrm wakes!');
        if (events & EVENT_LEVEL && world.level === 29) announce('The wyrm stirs below.');
        if (events & EVENT_OVER) {
          saveBest(world);
          ui.screen = SCREEN_OVER;
          audio.defeat();
          announce(`The mountain claims you. Score ${world.score}.`);
          break;
        }
        if (events & EVENT_WIN) {
          saveBest(world);
          ui.screen = SCREEN_WIN;
          audio.victory();
          announce(`Victory! Score ${world.score}.`);
          break;
        }
        if (ui.screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
      if (ui.screen === SCREEN_TITLE) {
        // The title drifts slowly down the fresh shaft behind the menu.
        world.cameraY = -20 + (Math.sin(now / 9000) * 0.5 + 0.5) * 120;
        world.time += 1 / 60;
      }
    }
    const depthFrac = Math.min(1, world.level / 30);
    audio.setIntensity(world.boss && !world.boss.dead ? 0.9 : 0.15 + depthFrac * 0.5);
    renderer.draw(world, ui);
    window.__game = {
      screen: ui.screen,
      level: world.level,
      maxLevel: world.maxLevel,
      score: world.score,
      hull: Math.round(world.player.hull),
      heat: Math.round(world.player.heat),
      ore: world.ore,
      gems: world.gems,
      kills: world.kills,
      draftPending: world.draftPending,
      endless: world.endless,
      boss: world.boss ? { hp: Math.round(world.boss.hp), phase: world.boss.phase, state: world.boss.state, dead: world.boss.dead } : null,
      player: { x: Math.round(world.player.x), y: Math.round(world.player.y) },
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.screen === SCREEN_PLAY) {
      ui.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Corebreak. Choose a difficulty and start digging.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
