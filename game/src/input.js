// Keyboard and mouse, read by the loop. Held keys give a steering vector;
// the mouse gives an aim point in field coordinates and a held fire button.
// One-shot presses (confirm, pause, mute, dash, upgrade choices) are queued as
// bit flags and taken once, so a press between two frames is never lost and
// never counted twice. Clicks are also queued with their field coordinates,
// so menus and upgrade cards can be clicked.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_DASH = 8;
export const ACTION_CHOICE_1 = 16;
export const ACTION_CHOICE_2 = 32;
export const ACTION_CHOICE_3 = 64;
export const ACTION_RESTART = 128;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const FIRE = new Set(['Space']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const DASH = new Set(['ShiftLeft', 'ShiftRight']);
const RESTART = new Set(['KeyR']);
const CHOICES = new Map([
  ['Digit1', ACTION_CHOICE_1],
  ['Digit2', ACTION_CHOICE_2],
  ['Digit3', ACTION_CHOICE_3],
  ['Numpad1', ACTION_CHOICE_1],
  ['Numpad2', ACTION_CHOICE_2],
  ['Numpad3', ACTION_CHOICE_3],
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let clicks = [];
  let mouseDown = false;
  let mouseSeen = false;
  let mouseClientX = 0;
  let mouseClientY = 0;
  let toField = (x, y) => ({ x, y });

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (FIRE.has(event.code)) {
      held.add(event.code);
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (CHOICES.has(event.code)) {
      if (!event.repeat) actions |= CHOICES.get(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    mouseSeen = true;
    mouseClientX = event.clientX;
    mouseClientY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseSeen = true;
    mouseClientX = event.clientX;
    mouseClientY = event.clientY;
    if (event.button === 2) {
      actions |= ACTION_DASH;
      return;
    }
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_CONFIRM;
      clicks.push(toField(event.clientX, event.clientY));
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  return {
    /** The renderer sets this after each resize, so clicks map to field pixels. */
    setFieldTransform(transform) {
      toField = transform;
    },
    /** Steering vector from held keys, normalised so diagonals match cardinals. */
    moveVector() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        if (LEFT.has(code)) x -= 1;
        else if (RIGHT.has(code)) x += 1;
        else if (UP.has(code)) y -= 1;
        else if (DOWN.has(code)) y += 1;
      }
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    /** True while the fire button or Space is held. */
    firing() {
      return mouseDown || held.has('Space');
    },
    /** The mouse aim point in field coordinates. */
    aimPoint() {
      return toField(mouseClientX, mouseClientY);
    },
    /** True once the pointer has moved or clicked over the game. */
    hasPointer() {
      return mouseSeen;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Clicks since the last call, each {x, y} in field coordinates. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
  };
}
