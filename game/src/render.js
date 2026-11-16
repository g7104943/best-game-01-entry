// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 lagoon is scaled to fit the window and centred. The reef is painted
// once to an offscreen canvas; the water, light rays, motes, creatures, HUD
// and panels are drawn fresh every frame. Nothing here changes the world.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND_BOSS, KIND_DASHER, KIND_MINI, KIND_NIBBLER, KIND_SPITTER, KIND_SPLITTER } from './enemies.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CHOICE = 'choice';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The three upgrade cards: same rects for drawing and for click tests. */
export function choiceLayout() {
  const width = 300;
  const height = 330;
  const gap = 28;
  const total = width * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 196;
  return [0, 1, 2].map((index) => ({ x: x0 + index * (width + gap), y, width, height }));
}

function heartPath(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y + size * 0.32);
  context.bezierCurveTo(x - size * 0.55, y - size * 0.28, x - size * 0.28, y - size * 0.75, x, y - size * 0.3);
  context.bezierCurveTo(x + size * 0.28, y - size * 0.75, x + size * 0.55, y - size * 0.28, x, y + size * 0.32);
  context.closePath();
}

function starPath(context, x, y, outer, inner, points = 5) {
  context.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (index / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

/** The little glyph on an upgrade card, drawn from its icon key. */
function drawIcon(context, icon, x, y, size, color) {
  context.save();
  context.translate(x, y);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (icon === 'fins') {
    context.beginPath();
    context.moveTo(-size * 0.5, size * 0.3);
    context.quadraticCurveTo(-size * 0.1, -size * 0.5, size * 0.5, -size * 0.4);
    context.quadraticCurveTo(size * 0.2, 0, size * 0.5, size * 0.4);
    context.quadraticCurveTo(0, size * 0.1, -size * 0.5, size * 0.3);
    context.fill();
  } else if (icon === 'bolt') {
    context.beginPath();
    context.moveTo(size * 0.1, -size * 0.55);
    context.lineTo(-size * 0.35, size * 0.1);
    context.lineTo(-size * 0.02, size * 0.1);
    context.lineTo(-size * 0.1, size * 0.55);
    context.lineTo(size * 0.35, -size * 0.1);
    context.lineTo(size * 0.02, -size * 0.1);
    context.closePath();
    context.fill();
  } else if (icon === 'star') {
    starPath(context, 0, 0, size * 0.55, size * 0.24);
    context.fill();
  } else if (icon === 'twin') {
    context.beginPath();
    context.arc(-size * 0.28, 0, size * 0.26, 0, Math.PI * 2);
    context.arc(size * 0.28, 0, size * 0.26, 0, Math.PI * 2);
    context.fill();
  } else if (icon === 'reach') {
    context.beginPath();
    context.moveTo(-size * 0.5, 0);
    context.lineTo(size * 0.3, 0);
    context.moveTo(size * 0.05, -size * 0.28);
    context.lineTo(size * 0.35, 0);
    context.lineTo(size * 0.05, size * 0.28);
    context.stroke();
    context.beginPath();
    context.arc(-size * 0.5, 0, size * 0.12, 0, Math.PI * 2);
    context.fill();
  } else if (icon === 'net') {
    context.beginPath();
    context.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * 0.07, 0, Math.PI * 2);
    context.fill();
  } else if (icon === 'scales') {
    heartPath(context, 0, size * 0.1, size * 0.8);
    context.fill();
  } else if (icon === 'dash') {
    for (let index = -1; index <= 1; index += 1) {
      context.beginPath();
      context.moveTo(index * size * 0.3 - size * 0.12, -size * 0.35);
      context.lineTo(index * size * 0.3 + size * 0.18, 0);
      context.lineTo(index * size * 0.3 - size * 0.12, size * 0.35);
      context.stroke();
    }
  } else if (icon === 'pierce') {
    context.beginPath();
    context.arc(0, 0, size * 0.34, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.55, 0);
    context.lineTo(size * 0.55, 0);
    context.moveTo(size * 0.3, -size * 0.2);
    context.lineTo(size * 0.55, 0);
    context.lineTo(size * 0.3, size * 0.2);
    context.stroke();
  } else if (icon === 'luck') {
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      context.beginPath();
      context.arc(Math.cos(angle) * size * 0.22, Math.sin(angle) * size * 0.22, size * 0.22, 0, Math.PI * 2);
      context.fill();
    }
  } else if (icon === 'wind') {
    context.beginPath();
    context.arc(0, 0, size * 0.4, Math.PI * 0.2, Math.PI * 1.4);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * 0.22, Math.PI * 1.1, Math.PI * 2.1);
    context.stroke();
    context.beginPath();
    context.arc(size * 0.3, -size * 0.28, size * 0.08, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * size * 0.5;
      const py = Math.sin(angle) * size * 0.5;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * 0.14, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const fonts = new Map();
  const decorRandom = createRandom(20261115);
  const reefCanvas = document.createElement('canvas');
  const motes = [];
  for (let index = 0; index < 80; index += 1) {
    motes.push({
      x: decorRandom.range(0, FIELD.width),
      y: decorRandom.range(0, FIELD.height),
      size: decorRandom.range(1, 2.6),
      phase: decorRandom.range(0, Math.PI * 2),
      speed: decorRandom.range(4, 14),
    });
  }

  function paintReef() {
    reefCanvas.width = FIELD.width;
    reefCanvas.height = FIELD.height;
    const reef = reefCanvas.getContext('2d');
    reef.fillStyle = PALETTE.reef;
    reef.beginPath();
    reef.moveTo(0, FIELD.height);
    let x = 0;
    let y = FIELD.height - 46;
    reef.lineTo(0, y);
    while (x < FIELD.width) {
      const nextX = Math.min(FIELD.width, x + decorRandom.range(90, 220));
      const nextY = FIELD.height - decorRandom.range(28, 96);
      reef.quadraticCurveTo((x + nextX) / 2, y - 34, nextX, nextY);
      x = nextX;
      y = nextY;
    }
    reef.lineTo(FIELD.width, FIELD.height);
    reef.closePath();
    reef.fill();
    reef.strokeStyle = PALETTE.reefEdge;
    reef.lineWidth = 3;
    reef.stroke();
    // Coral branches, anemones and glow plants along the reef top.
    for (let index = 0; index < 26; index += 1) {
      const px = decorRandom.range(30, FIELD.width - 30);
      const py = FIELD.height - decorRandom.range(20, 70);
      const kind = decorRandom.int(0, 2);
      if (kind === 0) {
        reef.strokeStyle = PALETTE.coral;
        reef.lineWidth = 5;
        reef.lineCap = 'round';
        reef.beginPath();
        reef.moveTo(px, py);
        reef.quadraticCurveTo(px - 8, py - 18, px - 16, py - 30);
        reef.moveTo(px, py);
        reef.quadraticCurveTo(px + 6, py - 22, px + 14, py - 38);
        reef.moveTo(px, py - 10);
        reef.quadraticCurveTo(px, py - 26, px + 2, py - 44);
        reef.stroke();
      } else if (kind === 1) {
        reef.fillStyle = PALETTE.anemone;
        for (let dot = 0; dot < 6; dot += 1) {
          reef.beginPath();
          reef.arc(px + decorRandom.range(-12, 12), py - decorRandom.range(0, 14), 2.6, 0, Math.PI * 2);
          reef.fill();
        }
      } else {
        reef.strokeStyle = PALETTE.glowPlant;
        reef.lineWidth = 3;
        reef.beginPath();
        reef.moveTo(px, py);
        reef.quadraticCurveTo(px - 6, py - 20, px - 2, py - 34);
        reef.moveTo(px + 8, py);
        reef.quadraticCurveTo(px + 10, py - 16, px + 16, py - 28);
        reef.stroke();
        reef.fillStyle = PALETTE.glowPlant;
        reef.beginPath();
        reef.arc(px - 2, py - 34, 3, 0, Math.PI * 2);
        reef.arc(px + 16, py - 28, 3, 0, Math.PI * 2);
        reef.fill();
      }
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.ratio = ratio;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight = 400) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawWater(time) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.waterTop);
    gradient.addColorStop(0.55, PALETTE.waterMid);
    gradient.addColorStop(1, PALETTE.waterDeep);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Slow light rays from the surface.
    context.save();
    context.fillStyle = PALETTE.ray;
    for (let index = 0; index < 5; index += 1) {
      const sway = Math.sin(time * 0.14 + index * 1.7) * 46;
      const rx = 130 + index * 260 + sway;
      context.beginPath();
      context.moveTo(rx, -20);
      context.lineTo(rx + 90, -20);
      context.lineTo(rx + 190, FIELD.height + 20);
      context.lineTo(rx + 60, FIELD.height + 20);
      context.closePath();
      context.fill();
    }
    context.restore();
    context.drawImage(reefCanvas, 0, 0);
    // Drifting plankton motes.
    for (const mote of motes) {
      const twinkle = 0.35 + 0.3 * Math.sin(time * 0.9 + mote.phase);
      const my = (mote.y + time * mote.speed) % FIELD.height;
      context.globalAlpha = twinkle;
      context.fillStyle = PALETTE.mote;
      context.beginPath();
      context.arc(mote.x, my, mote.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawGlow(x, y, radius, color, alpha) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawPlayer(player, time) {
    const blink = player.invulnerable > 0 && Math.floor(time * 14) % 2 === 0;
    if (blink) context.globalAlpha = 0.45;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.face);
    if (Math.cos(player.face) < 0) context.scale(1, -1);
    const wag = Math.sin(player.tailPhase) * 0.35;
    // Tail fin, wagging.
    context.fillStyle = PALETTE.playerFin;
    context.beginPath();
    context.moveTo(-9, 0);
    context.quadraticCurveTo(-24, -13 - wag * 15, -33, -15 - wag * 19);
    context.quadraticCurveTo(-26, 0, -33, 15 + wag * 19);
    context.quadraticCurveTo(-24, 13 + wag * 15, -9, 0);
    context.fill();
    // Body.
    context.fillStyle = PALETTE.playerBody;
    context.beginPath();
    context.ellipse(0, 0, 19, 12, 0, 0, Math.PI * 2);
    context.fill();
    // Dorsal fin.
    context.fillStyle = PALETTE.playerFin;
    context.beginPath();
    context.moveTo(-4, -11);
    context.quadraticCurveTo(2, -21, 10, -12);
    context.closePath();
    context.fill();
    // Belly stripe.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.ellipse(2, 4, 13, 5.5, 0, 0, Math.PI * 2);
    context.fill();
    // Eye.
    context.fillStyle = '#101826';
    context.beginPath();
    context.arc(9, -3.5, 3.6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(10, -4.5, 1.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.globalAlpha = 1;
    // The lure: a stalk over the head and a glowing orb.
    const lureX = player.x + Math.cos(player.face - 0.7) * 20;
    const lureY = player.y + Math.sin(player.face - 0.7) * 20;
    context.strokeStyle = PALETTE.playerFin;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.face) * 10, player.y + Math.sin(player.face) * 10 - 6);
    context.quadraticCurveTo(lureX, lureY - 8, lureX, lureY);
    context.stroke();
    drawGlow(lureX, lureY, 26, 'rgba(255, 243, 196, 0.85)', 0.8);
    context.fillStyle = PALETTE.lure;
    context.beginPath();
    context.arc(lureX, lureY, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawFoe(foe, time) {
    context.save();
    context.translate(foe.x, foe.y);
    const pulse = 1 + Math.sin(time * 4 + foe.phase) * 0.05;
    context.scale(pulse, pulse);
    if (foe.kind === KIND_NIBBLER || foe.kind === KIND_MINI) {
      context.fillStyle = foe.kind === KIND_MINI ? PALETTE.mini : PALETTE.nibbler;
      context.beginPath();
      context.arc(0, 0, foe.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#241a4d';
      context.beginPath();
      context.arc(0, foe.radius * 0.35, foe.radius * 0.55, 0, Math.PI);
      context.fill();
      // Fangs.
      context.fillStyle = '#ffffff';
      for (let index = -1; index <= 1; index += 1) {
        context.beginPath();
        context.moveTo(index * foe.radius * 0.3 - 3, foe.radius * 0.35);
        context.lineTo(index * foe.radius * 0.3 + 3, foe.radius * 0.35);
        context.lineTo(index * foe.radius * 0.3, foe.radius * 0.35 + 7);
        context.closePath();
        context.fill();
      }
      drawEyes(foe, -0.4);
    } else if (foe.kind === KIND_SPITTER) {
      context.fillStyle = PALETTE.spitter;
      context.beginPath();
      context.arc(0, 0, foe.radius, 0, Math.PI * 2);
      context.fill();
      // The spit sac swells as the shot nears.
      const sac = foe.radius * (0.35 + 0.3 * Math.max(0, 1 - foe.fireTimer / 2.3));
      context.fillStyle = '#7ef0dd';
      context.beginPath();
      context.arc(Math.cos(foe.face) * foe.radius * 0.4, Math.sin(foe.face) * foe.radius * 0.4, sac, 0, Math.PI * 2);
      context.fill();
      drawEyes(foe, -0.4);
    } else if (foe.kind === KIND_SPLITTER) {
      context.fillStyle = PALETTE.splitter;
      context.beginPath();
      context.arc(0, 0, foe.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#c96f2e';
      context.beginPath();
      context.arc(-7, -5, 7, 0, Math.PI * 2);
      context.arc(8, 4, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffe1b8';
      context.beginPath();
      context.arc(-7, -5, 3, 0, Math.PI * 2);
      context.arc(8, 4, 2.5, 0, Math.PI * 2);
      context.fill();
      drawEyes(foe, -0.45);
    } else if (foe.kind === KIND_DASHER) {
      context.rotate(foe.face);
      context.fillStyle = PALETTE.dasher;
      context.beginPath();
      context.moveTo(foe.radius + 6, 0);
      context.quadraticCurveTo(0, -foe.radius * 0.8, -foe.radius, 0);
      context.quadraticCurveTo(0, foe.radius * 0.8, foe.radius + 6, 0);
      context.fill();
      context.fillStyle = '#ff8fa8';
      context.beginPath();
      context.moveTo(-foe.radius, 0);
      context.lineTo(-foe.radius - 12, -8);
      context.lineTo(-foe.radius - 12, 8);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(foe.radius * 0.4, -3, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#101826';
      context.beginPath();
      context.arc(foe.radius * 0.4 + 1, -3, 1.6, 0, Math.PI * 2);
      context.fill();
      context.rotate(-foe.face);
      // Telegraph ring: it is about to lunge.
      if (foe.state === 1) {
        context.globalAlpha = 0.5 + 0.4 * Math.sin(time * 18);
        context.strokeStyle = '#ffd166';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, foe.radius + 9, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      }
    } else if (foe.kind === KIND_BOSS) {
      // The Maw: a vast dark bulk, a ring of teeth, a glowing core.
      context.fillStyle = PALETTE.boss;
      context.beginPath();
      context.arc(0, 0, foe.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#241a4d';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, foe.radius - 4, 0, Math.PI * 2);
      context.stroke();
      const teeth = 12;
      context.fillStyle = '#ffffff';
      for (let index = 0; index < teeth; index += 1) {
        const angle = (index / teeth) * Math.PI * 2 + time * 0.15;
        const tx = Math.cos(angle) * (foe.radius - 8);
        const ty = Math.sin(angle) * (foe.radius - 8);
        context.beginPath();
        context.moveTo(tx - 6, ty - 6);
        context.lineTo(tx + 6, ty + 6);
        context.lineTo(Math.cos(angle) * (foe.radius - 24), Math.sin(angle) * (foe.radius - 24));
        context.closePath();
        context.fill();
      }
      drawGlow(0, 0, foe.radius * 0.6, 'rgba(255, 93, 143, 0.5)', 0.8);
      context.fillStyle = PALETTE.bossCore;
      context.beginPath();
      context.arc(0, 0, foe.radius * 0.3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.bossEye;
      context.beginPath();
      context.arc(-foe.radius * 0.42, -foe.radius * 0.42, 6, 0, Math.PI * 2);
      context.arc(foe.radius * 0.42, -foe.radius * 0.42, 6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Hit flash: a white veil over the foe.
    if (foe.flash > 0) {
      context.globalAlpha = Math.min(0.85, foe.flash * 9);
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(foe.x, foe.y, foe.radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    // A small health bar over a wounded foe (the boss gets the big bar).
    if (foe.kind !== KIND_BOSS && foe.hp < foe.maxHp) {
      const width = foe.radius * 2;
      context.fillStyle = 'rgba(10, 20, 36, 0.8)';
      context.fillRect(foe.x - width / 2, foe.y - foe.radius - 12, width, 5);
      context.fillStyle = PALETTE.danger;
      context.fillRect(foe.x - width / 2, foe.y - foe.radius - 12, width * (foe.hp / foe.maxHp), 5);
    }
  }

  function drawEyes(foe, lift) {
    const spread = foe.radius * 0.42;
    const ey = foe.radius * lift;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(-spread, ey, foe.radius * 0.2, 0, Math.PI * 2);
    context.arc(spread, ey, foe.radius * 0.2, 0, Math.PI * 2);
    context.fill();
    const lookX = Math.cos(foe.face) * 2;
    const lookY = Math.sin(foe.face) * 2;
    context.fillStyle = '#101826';
    context.beginPath();
    context.arc(-spread + lookX, ey + lookY, foe.radius * 0.1, 0, Math.PI * 2);
    context.arc(spread + lookX, ey + lookY, foe.radius * 0.1, 0, Math.PI * 2);
    context.fill();
  }

  function drawHud(state, best, muted) {
    const player = state.player;
    context.textBaseline = 'top';
    // Hearts.
    for (let index = 0; index < player.maxHp; index += 1) {
      context.fillStyle = index < player.hp ? PALETTE.heart : PALETTE.heartEmpty;
      heartPath(context, 34 + index * 30, 34, 24);
      context.fill();
    }
    // Experience bar and level.
    const barWidth = 220;
    context.fillStyle = 'rgba(10, 20, 36, 0.75)';
    context.fillRect(24, 56, barWidth, 12);
    context.fillStyle = PALETTE.glimmer;
    context.fillRect(24, 56, barWidth * Math.min(1, state.xp / state.xpNeed), 12);
    text(`Lv ${state.level}`, 24, 74, 18, PALETTE.text, 'left', 700);
    // Wave and foes.
    text(state.wave === 0 ? 'The reef is quiet' : `Wave ${state.wave} / 10`, FIELD.width / 2, 18, 26, PALETTE.text, 'center', 700);
    if (state.wave > 0 && state.waveState === 'active') {
      text(`Foes left: ${state.foesLeft}`, FIELD.width / 2, 48, 18, PALETTE.muted, 'center');
    }
    // Score.
    text(`Score ${state.score}`, FIELD.width - 24, 18, 26, PALETTE.text, 'right', 700);
    text(`Best ${best}`, FIELD.width - 24, 48, 18, PALETTE.muted, 'right');
    // Dash readiness.
    const dashReady = player.dashCooldown <= 0;
    const dashMax = PLAYER.dashCooldown * state.mods.dashCooldownMul;
    const dashFill = dashReady ? 1 : 1 - player.dashCooldown / dashMax;
    context.fillStyle = 'rgba(10, 20, 36, 0.75)';
    context.fillRect(24, FIELD.height - 40, 120, 12);
    context.fillStyle = dashReady ? PALETTE.gold : PALETTE.muted;
    context.fillRect(24, FIELD.height - 40, 120 * Math.max(0, dashFill), 12);
    text(dashReady ? 'Dash ready [Shift]' : 'Dashing…', 24, FIELD.height - 66, 16, dashReady ? PALETTE.text : PALETTE.muted, 'left');
    // Hints and mute state.
    text(muted ? 'Sound off [M]  ·  Pause [P]' : 'Sound on [M]  ·  Pause [P]', FIELD.width - 24, FIELD.height - 34, 16, PALETTE.muted, 'right');
    // Boss bar.
    if (state.boss !== null && state.boss.active) {
      const boss = state.boss;
      const width = 520;
      const x = (FIELD.width - width) / 2;
      const y = 84;
      text(state.wave >= 10 ? 'THE MAW OF THE DEEP' : 'THE MAW', FIELD.width / 2, y - 24, 20, PALETTE.bossCore, 'center', 700);
      context.fillStyle = 'rgba(10, 20, 36, 0.8)';
      context.fillRect(x, y, width, 14);
      context.fillStyle = PALETTE.bossCore;
      context.fillRect(x, y, width * Math.max(0, boss.hp / boss.maxHp), 14);
    }
  }

  function drawBanner(state, screen) {
    if (state.bannerTimer <= 0) return;
    if (screen === SCREEN_CHOICE || screen === SCREEN_PAUSED) return;
    const alpha = Math.min(1, state.bannerTimer / 0.6);
    context.globalAlpha = alpha;
    context.textBaseline = 'alphabetic';
    text(state.banner, FIELD.width / 2, 200, 54, PALETTE.text, 'center', 700);
    text(state.bannerSub, FIELD.width / 2, 238, 22, PALETTE.muted, 'center');
    context.globalAlpha = 1;
  }

  function drawPanel(x, y, width, height) {
    context.fillStyle = 'rgba(6, 12, 24, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
    context.stroke();
  }

  function drawTitle(state, best) {
    drawPanel(290, 118, 700, 484);
    context.textBaseline = 'alphabetic';
    drawGlow(FIELD.width / 2, 190, 130, 'rgba(255, 215, 106, 0.35)', 0.9);
    text('LUMEN REEF', FIELD.width / 2, 208, 64, PALETTE.gold, 'center', 800);
    text('A lantern-fish tale of the Glow Reef', FIELD.width / 2, 244, 22, PALETTE.muted, 'center');
    const lines = [
      'The gloom is rising. Swim, shoot, and gather glimmers.',
      'Level up, choose boons, and hold the reef for 10 waves.',
      '',
      'Move  WASD / Arrows      Aim  Mouse      Shoot  Click / Space',
      'Dash  Shift / Right-click      Pause  P      Sound  M',
      '',
      'Defeat the Maw of the Deep to save the reef.',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, 292 + index * 30, 20, index < 2 ? PALETTE.text : PALETTE.muted, 'center');
    });
    text(`Best score ${best}`, FIELD.width / 2, 500, 22, PALETTE.text, 'center', 700);
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 3);
    context.globalAlpha = pulse;
    text('Click or press Space to dive in', FIELD.width / 2, 556, 26, PALETTE.gold, 'center', 700);
    context.globalAlpha = 1;
  }

  function drawPaused() {
    drawPanel(390, 230, 500, 260);
    context.textBaseline = 'alphabetic';
    text('Paused', FIELD.width / 2, 316, 46, PALETTE.text, 'center', 700);
    text('The gloom waits for no fish — but it waits for you.', FIELD.width / 2, 356, 19, PALETTE.muted, 'center');
    text('Press P to keep swimming', FIELD.width / 2, 412, 24, PALETTE.gold, 'center', 700);
    text('R restarts the run', FIELD.width / 2, 448, 18, PALETTE.muted, 'center');
  }

  function drawChoice(state, choices, mouse) {
    context.fillStyle = 'rgba(6, 12, 24, 0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    drawGlow(FIELD.width / 2, 150, 120, 'rgba(110, 243, 255, 0.3)', 0.9);
    text(`Level ${state.level}!`, FIELD.width / 2, 140, 46, PALETTE.glimmer, 'center', 800);
    text('Choose a boon', FIELD.width / 2, 178, 24, PALETTE.text, 'center');
    const rects = choiceLayout();
    choices.forEach((upgrade, index) => {
      const rect = rects[index];
      const hovered = mouse !== null && mouse.x >= rect.x && mouse.x <= rect.x + rect.width && mouse.y >= rect.y && mouse.y <= rect.y + rect.height;
      context.fillStyle = hovered ? '#1a3a63' : PALETTE.card;
      context.strokeStyle = hovered ? PALETTE.gold : PALETTE.cardEdge;
      context.lineWidth = hovered ? 3 : 2;
      context.beginPath();
      context.roundRect(rect.x, rect.y, rect.width, rect.height, 16);
      context.fill();
      context.stroke();
      const cx = rect.x + rect.width / 2;
      drawGlow(cx, rect.y + 78, 52, 'rgba(255, 215, 106, 0.3)', 0.8);
      drawIcon(context, upgrade.icon, cx, rect.y + 78, 56, PALETTE.gold);
      text(upgrade.name, cx, rect.y + 158, 27, PALETTE.text, 'center', 700);
      wrapText(upgrade.blurb, cx, rect.y + 196, 20, PALETTE.muted, 250);
      text(`[${index + 1}]`, cx, rect.y + rect.height - 26, 20, PALETTE.gold, 'center', 700);
    });
    text('Click a card or press 1, 2 or 3', FIELD.width / 2, 576, 20, PALETTE.muted, 'center');
  }

  function wrapText(value, x, y, size, color, maxWidth) {
    const words = value.split(' ');
    const lines = [''];
    context.font = `${size}px ${FONT}`;
    for (const word of words) {
      const trial = lines[lines.length - 1] === '' ? word : `${lines[lines.length - 1]} ${word}`;
      if (context.measureText(trial).width > maxWidth && lines[lines.length - 1] !== '') lines.push(word);
      else lines[lines.length - 1] = trial;
    }
    lines.forEach((line, index) => {
      text(line, x, y + index * (size + 8), size, color, 'center');
    });
  }

  function drawEnd(state, best, won) {
    drawPanel(340, 150, 600, 420);
    context.textBaseline = 'alphabetic';
    if (won) {
      drawGlow(FIELD.width / 2, 220, 140, 'rgba(255, 215, 106, 0.4)', 0.9);
      text('THE REEF IS SAVED!', FIELD.width / 2, 240, 48, PALETTE.gold, 'center', 800);
      text('The Maw is gone. The reef glows again.', FIELD.width / 2, 280, 21, PALETTE.text, 'center');
    } else {
      text('The light fades…', FIELD.width / 2, 240, 48, PALETTE.text, 'center', 800);
      text('The gloom takes the reef — this time.', FIELD.width / 2, 280, 21, PALETTE.muted, 'center');
    }
    text(`Score ${state.score}`, FIELD.width / 2, 348, 34, PALETTE.text, 'center', 700);
    text(`Best ${best}`, FIELD.width / 2, 388, 22, PALETTE.muted, 'center');
    text(`Wave ${Math.max(1, state.wave)}  ·  ${state.kills} foes beaten  ·  Level ${state.level}`, FIELD.width / 2, 424, 20, PALETTE.muted, 'center');
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 3);
    context.globalAlpha = pulse;
    text('Press Space or click to swim again', FIELD.width / 2, 512, 25, PALETTE.gold, 'center', 700);
    context.globalAlpha = 1;
  }

  function drawVignette(state, screen) {
    const gradient = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
    );
    gradient.addColorStop(0, 'rgba(3, 6, 14, 0)');
    gradient.addColorStop(1, 'rgba(3, 6, 14, 0.55)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 60, 70, ${state.flash * 0.28})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_PLAY && state.player.hp === 1 && !state.over) {
      const pulse = 0.1 + 0.08 * Math.sin(state.time * 6);
      context.fillStyle = `rgba(255, 60, 70, ${pulse})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  /** Paint one frame: the lagoon, the creatures, the HUD, then the screen's panel. */
  function draw(state, screen, ui) {
    const shake = state.shake * 9;
    const shakeX = shake === 0 ? 0 : (Math.random() * 2 - 1) * shake;
    const shakeY = shake === 0 ? 0 : (Math.random() * 2 - 1) * shake;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawWater(state.time);
    // The player's lantern light, under the creatures.
    context.save();
    context.globalCompositeOperation = 'lighter';
    drawGlow(state.player.x, state.player.y, 230, 'rgba(255, 215, 106, 0.16)', 1);
    context.restore();
    // Glimmers.
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(pickup.age * 5) * 2;
      const spin = pickup.age * 2.4;
      drawGlow(pickup.x, pickup.y + bob, 22, 'rgba(110, 243, 255, 0.5)', 0.8);
      context.save();
      context.translate(pickup.x, pickup.y + bob);
      context.rotate(spin);
      context.fillStyle = PALETTE.glimmer;
      context.fillRect(-6, -6, 12, 12);
      context.fillStyle = '#ffffff';
      context.fillRect(-3, -3, 6, 6);
      context.restore();
    }
    // Enemy globs.
    for (const glob of state.enemyBullets) {
      if (!glob.active) continue;
      drawGlow(glob.x, glob.y, 22, 'rgba(200, 107, 255, 0.55)', 0.9);
      context.fillStyle = PALETTE.enemyBullet;
      context.beginPath();
      context.arc(glob.x, glob.y, ENEMY_BULLET_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(glob.x, glob.y, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    for (const foe of state.foes) {
      if (foe.active) drawFoe(foe, state.time);
    }
    // Orbiting shield shards.
    for (let index = 0; index < state.mods.shields; index += 1) {
      const angle = state.shieldAngle + (index / state.mods.shields) * Math.PI * 2;
      const sx = state.player.x + Math.cos(angle) * 48;
      const sy = state.player.y + Math.sin(angle) * 48;
      drawGlow(sx, sy, 20, 'rgba(110, 243, 255, 0.5)', 0.8);
      context.save();
      context.translate(sx, sy);
      context.rotate(angle * 2);
      context.fillStyle = PALETTE.glimmer;
      context.fillRect(-6, -6, 12, 12);
      context.restore();
    }
    if (!state.over) drawPlayer(state.player, state.time);
    // Bolts.
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.strokeStyle = 'rgba(255, 232, 154, 0.5)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.03, bullet.y - bullet.vy * 0.03);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
      drawGlow(bullet.x, bullet.y, 22, 'rgba(255, 232, 154, 0.6)', 0.9);
      context.fillStyle = PALETTE.bulletCore;
      context.beginPath();
      context.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Particles, additively for glow.
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
    // Floating texts.
    context.textBaseline = 'alphabetic';
    for (const floater of state.floaters) {
      if (!floater.active) continue;
      context.globalAlpha = Math.min(1, floater.life / (floater.maxLife * 0.6));
      text(floater.text, floater.x, floater.y, floater.size, floater.color, 'center', 700);
    }
    context.globalAlpha = 1;
    drawVignette(state, screen);
    if (screen !== SCREEN_TITLE) drawHud(state, ui.best, ui.muted);
    drawBanner(state, screen);
    if (screen === SCREEN_TITLE) drawTitle(state, ui.best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_CHOICE && ui.choices !== null) drawChoice(state, ui.choices, ui.mouse);
    else if (screen === SCREEN_OVER) drawEnd(state, ui.best, false);
    else if (screen === SCREEN_WIN) drawEnd(state, ui.best, true);
  }

  const ENEMY_BULLET_RADIUS = 7;

  paintReef();
  resize();
  window.addEventListener('resize', resize);

  return {
    draw,
    /** Map a client (CSS pixel) point to field coordinates. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * view.ratio;
      const py = (clientY - rect.top) * view.ratio;
      return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
    },
  };
}
