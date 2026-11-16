// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, level-up choice, game over and victory.
//
// ?seed=N fixes the run. ?shot=title|play|choice|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, MUTE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS,
  EVENT_DASH,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_LEVELUP,
  EVENT_OVER,
  EVENT_PICKUP,
  EVENT_REVIVE,
  EVENT_SHOT,
  EVENT_WAVE,
  EVENT_WIN,
} from './world.js';
import {
  ACTION_CHOICE_1,
  ACTION_CHOICE_2,
  ACTION_CHOICE_3,
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  SCREEN_CHOICE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  choiceLayout,
  createRenderer,
} from './render.js';
import { rollUpgrades, takeUpgrade } from './upgrades.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const choiceRandom = createRandom((seed ^ 0x5f3a) >>> 0);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readStored(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be off (private windows): the value then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, seed);
  const ui = { best: scene.best, muted: false, choices: scene.choices, mouse: null };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  input.setFieldTransform((clientX, clientY) => renderer.toField(clientX, clientY));
  const audio = createAudio(readStored(MUTE_KEY, '0') === '1');
  let screen = SCREEN_TITLE;
  let best = Number.parseInt(readStored(BEST_KEY, '0'), 10) || 0;
  let choices = null;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function toggleMute() {
    audio.setMuted(!audio.isMuted());
    writeStored(MUTE_KEY, audio.isMuted() ? '1' : '0');
  }

  function startGame() {
    world.reset();
    choices = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Survive 10 waves and defeat the Maw.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      writeStored(BEST_KEY, String(best));
    }
    announce(won ? `The reef is saved! Score ${world.state.score}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function offerChoices() {
    choices = rollUpgrades(choiceRandom, world.state.mods, 3);
    screen = SCREEN_CHOICE;
    announce(`Level ${world.state.level}. Choose a boon.`);
  }

  function choose(index) {
    if (choices === null || index >= choices.length) return;
    takeUpgrade(choices[index], world.state.mods, world.state.player);
    world.state.pendingLevels -= 1;
    audio.choose();
    if (world.state.pendingLevels > 0) {
      offerChoices();
    } else {
      choices = null;
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** Where bolts fly: the mouse when it has moved, else the nearest foe. */
  function aimTarget() {
    if (input.hasPointer()) return input.aimPoint();
    const player = world.state.player;
    let target = null;
    let bestDist = Infinity;
    for (const foe of world.state.foes) {
      if (!foe.active) continue;
      const dist = Math.hypot(foe.x - player.x, foe.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        target = foe;
      }
    }
    if (target !== null) return { x: target.x, y: target.y };
    return { x: player.x + Math.cos(player.face) * 120, y: player.y + Math.sin(player.face) * 120 };
  }

  function playSounds(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_KILL) audio.die(false);
    if (events & EVENT_PICKUP) audio.pickup(world.state.combo);
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_WAVE) audio.waveStart();
    if (events & EVENT_BOSS) audio.bossRoar();
    if (events & EVENT_LEVELUP) audio.levelUp();
    if (events & EVENT_REVIVE) audio.levelUp();
    if (events & EVENT_WIN) audio.victory();
    else if (events & EVENT_OVER) audio.gameOver();
  }

  /** Route one-shot presses for the current screen; returns the flags taken, so the loop can spend the dash press on its first step. */
  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) toggleMute();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        startGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_RESTART) startGame();
      else if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_CHOICE) {
      if (actions & ACTION_CHOICE_1) choose(0);
      else if (actions & ACTION_CHOICE_2) choose(1);
      else if (actions & ACTION_CHOICE_3) choose(2);
      for (const click of input.takeClicks()) {
        const rects = choiceLayout();
        for (let index = 0; index < rects.length; index += 1) {
          const rect = rects[index];
          if (click.x >= rect.x && click.x <= rect.x + rect.width && click.y >= rect.y && click.y <= rect.y + rect.height) {
            choose(index);
            break;
          }
        }
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
        audio.click();
        startGame();
      }
    }
    if (screen !== SCREEN_CHOICE) input.takeClicks();
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, firing: false, dash: false }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      // Dash is a one-shot press: spend it on the first step of the frame.
      let pendingDash = actions & ACTION_DASH;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        const controls = {
          move: input.moveVector(),
          aim: aimTarget(),
          firing: input.firing(),
          dash: Boolean(pendingDash),
        };
        pendingDash = 0;
        const events = world.step(STEP, controls, false);
        playSounds(events);
        if (events & EVENT_WIN) endGame(true);
        else if (events & EVENT_OVER) endGame(false);
        else if (world.state.pendingLevels > 0) offerChoices();
        accumulator -= STEP;
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else {
      accumulator = 0;
    }
    const mouse = input.hasPointer() ? input.aimPoint() : null;
    renderer.draw(world.state, screen, { best, muted: audio.isMuted(), choices, mouse });
  }

  // Leaving the tab pauses a running game rather than letting the gloom close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Reef. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
