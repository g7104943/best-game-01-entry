// Keyboard and mouse state, read fresh every frame. Menu clicks are queued
// as events so a click is never eaten by a screen change mid-frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_REROLL = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  const clicks = [];
  const input = {
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    rightDown: false,
    actions: 0,
  };

  function toGame(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  }

  function onKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') input.actions |= ACTION_CONFIRM;
    if (e.code === 'KeyP' || e.code === 'Escape') input.actions |= ACTION_PAUSE;
    if (e.code === 'KeyR') input.actions |= ACTION_REROLL;
    if (e.code === 'KeyM') input.actions |= ACTION_MUTE;
    if (e.code === 'Digit1') input.choice = 0;
    if (e.code === 'Digit2') input.choice = 1;
    if (e.code === 'Digit3') input.choice = 2;
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMove(e) {
    const p = toGame(e);
    input.mouseX = p.x;
    input.mouseY = p.y;
  }

  function onDown(e) {
    const p = toGame(e);
    input.mouseX = p.x;
    input.mouseY = p.y;
    if (e.button === 2) {
      input.rightDown = true;
    } else {
      input.mouseDown = true;
      clicks.push({ x: p.x, y: p.y });
    }
  }

  function onUp(e) {
    if (e.button === 2) input.rightDown = false;
    else input.mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    state: input,
    down(code) {
      return keys.has(code);
    },
    axis() {
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    jumpHeld() {
      return keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space');
    },
    digDownHeld() {
      return keys.has('ArrowDown') || keys.has('KeyS');
    },
    digUpHeld() {
      return keys.has('ArrowUp') || keys.has('KeyW');
    },
    bombPressed() {
      return keys.has('KeyE') || keys.has('KeyQ') || keys.has('KeyK');
    },
    takeActions() {
      const a = input.actions;
      input.actions = 0;
      return a;
    },
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    takeChoice() {
      const c = input.choice;
      input.choice = undefined;
      return c;
    },
    clear() {
      keys.clear();
      clicks.length = 0;
      input.actions = 0;
      input.choice = undefined;
      input.mouseDown = false;
      input.rightDown = false;
    },
  };
}
