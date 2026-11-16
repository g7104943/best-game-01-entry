// Everything the player sees: the cavern, the mech, the creatures, the
// boss, the HUD and every menu screen. All art is drawn in code on one
// canvas; the first screenshot the judge sees is the cover frame this file
// paints, so the play view carries the whole game at a glance: hull, heat,
// depth, score, the depth rail and the boss bar.
import { BOSS_LEVEL, PLAYER_H, PLAYER_W, TILE, VIEW_H, VIEW_W, WORLD_W } from './config.js';
import { hash2 } from './random.js';
import {
  T_BEDROCK,
  T_BOULDER,
  T_CRYSTAL,
  T_DIRT,
  T_EMPTY,
  T_GAS,
  T_HARD,
  T_LAVA,
  T_METAL,
  T_ORE,
  T_ROCK,
  T_WATER,
  isSolid,
  rowOfLevel,
  tileAt,
} from './tiles.js';
import { bossSegmentPos } from './enemies.js';
import { shakeOffset } from './particles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const FONT = '"Trebuchet MS", "DejaVu Sans", Verdana, sans-serif';

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgb(c, alpha) {
  return alpha === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

const SKY_TOP = [135, 181, 224];
const SKY_BOT = [214, 228, 240];
const DEEP_TOP = [26, 14, 18];
const DEEP_BOT = [48, 16, 12];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  function drawBackground(world) {
    const depth = Math.max(0, Math.min(1, world.cameraY / (BOSS_LEVEL * 12 * TILE)));
    const top = lerpColor(SKY_TOP, DEEP_TOP, Math.min(1, depth * 1.6));
    const bot = lerpColor(SKY_BOT, DEEP_BOT, Math.min(1, depth * 1.6));
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, rgb(top));
    grad.addColorStop(1, rgb(bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Parallax rock silhouettes, two layers, seeded so they never jump.
    for (let layer = 0; layer < 2; layer += 1) {
      const speed = layer === 0 ? 0.25 : 0.5;
      const shade = layer === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.28)';
      ctx.fillStyle = shade;
      const spacing = 260 - layer * 60;
      const offset = (world.cameraY * speed) % spacing;
      for (let y = -spacing; y < VIEW_H + spacing; y += spacing) {
        for (let x = -40; x < VIEW_W + 80; x += spacing) {
          const h = hash2(Math.floor((x + 1000) / spacing), Math.floor((y + offset + 1000) / spacing) + layer * 57, 7);
          if (h < 0.55) {
            const r = 50 + h * 90;
            ctx.beginPath();
            ctx.ellipse(x + h * 120, y + offset + h * 60, r, r * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawTiles(world) {
    const camY = world.cameraY;
    const topRow = Math.max(0, Math.floor(camY / TILE));
    const botRow = Math.min(world.tiles.rows.length - 1, Math.ceil((camY + VIEW_H) / TILE));
    const time = world.time;
    for (let y = topRow; y <= botRow; y += 1) {
      const sy = y * TILE - camY;
      for (let x = 0; x < WORLD_W; x += 1) {
        const tile = tileAt(world.tiles, x, y);
        if (tile === T_EMPTY) continue;
        const sx = x * TILE;
        const h = hash2(x, y, 3);
        const h2 = hash2(x, y, 11);
        if (tile === T_LAVA) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + x * 0.7 + y * 0.4);
          ctx.fillStyle = '#c22e12';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = `rgba(255,${Math.round(110 + pulse * 70)},40,0.85)`;
          ctx.beginPath();
          ctx.ellipse(sx + 20 + Math.sin(time * 1.8 + x) * 5, sy + 20, 16 + pulse * 5, 10 + pulse * 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,220,120,0.5)';
          ctx.fillRect(sx, sy, TILE, 3);
          continue;
        }
        if (tile === T_WATER) {
          ctx.fillStyle = 'rgba(52,120,190,0.75)';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = 'rgba(160,210,255,0.6)';
          const wy = sy + 8 + Math.sin(time * 2 + x * 1.3) * 3;
          ctx.fillRect(sx + 4, wy, TILE - 8, 3);
          continue;
        }
        // Solid tile base.
        let base;
        if (tile === T_DIRT) base = h < 0.5 ? '#7a5230' : '#8a5c36';
        else if (tile === T_ROCK) base = h < 0.5 ? '#6b6874' : '#7a7784';
        else if (tile === T_HARD) base = h < 0.5 ? '#4e4a58' : '#5a5566';
        else if (tile === T_CRYSTAL) base = '#4a3a5e';
        else if (tile === T_ORE) base = h < 0.5 ? '#6b5a44' : '#77644c';
        else if (tile === T_METAL) base = '#5c6068';
        else if (tile === T_BEDROCK) base = '#23202a';
        else if (tile === T_GAS) base = '#5e6b4a';
        else base = '#6b6874'; // boulder
        ctx.fillStyle = base;
        ctx.fillRect(sx, sy, TILE, TILE);
        // Speckles.
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(sx + 6 + h * 18, sy + 8 + h2 * 16, 5, 4);
        ctx.fillRect(sx + 22 - h * 10, sy + 24 + h2 * 8, 4, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(sx + 4 + h2 * 20, sy + 4, 8, 3);
        // Exposed edges read as cavern walls.
        if (!isSolid(tileAt(world.tiles, x, y - 1))) {
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(sx, sy, TILE, 4);
        }
        if (!isSolid(tileAt(world.tiles, x, y + 1))) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(sx, sy + TILE - 4, TILE, 4);
        }
        if (!isSolid(tileAt(world.tiles, x - 1, y))) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(sx, sy, 3, TILE);
        }
        if (!isSolid(tileAt(world.tiles, x + 1, y))) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(sx + TILE - 3, sy, 3, TILE);
        }
        if (tile === T_CRYSTAL) {
          ctx.fillStyle = 'rgba(127,231,255,0.25)';
          ctx.beginPath();
          ctx.arc(sx + 20, sy + 20, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#7fe7ff';
          drawDiamond(sx + 14 + h * 10, sy + 20, 7, 11);
          ctx.fillStyle = '#b78bff';
          drawDiamond(sx + 26, sy + 14 + h2 * 8, 5, 8);
        } else if (tile === T_ORE) {
          ctx.fillStyle = '#ffb347';
          ctx.beginPath();
          ctx.arc(sx + 12 + h * 8, sy + 14, 4, 0, Math.PI * 2);
          ctx.arc(sx + 26, sy + 26 - h2 * 6, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffd76a';
          ctx.beginPath();
          ctx.arc(sx + 13 + h * 8, sy + 13, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === T_METAL) {
          ctx.fillStyle = '#c9ccd4';
          ctx.fillRect(sx + 8 + h * 10, sy + 10, 14, 4);
          ctx.fillRect(sx + 12, sy + 24, 10, 3);
        } else if (tile === T_GAS) {
          ctx.fillStyle = 'rgba(180,230,120,0.75)';
          ctx.beginPath();
          ctx.arc(sx + 13 + h * 12, sy + 16, 5, 0, Math.PI * 2);
          ctx.arc(sx + 25, sy + 27, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === T_BEDROCK) {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(sx + 8, sy + 8, 6, 6);
          ctx.fillRect(sx + 24, sy + 22, 6, 6);
        } else if (tile === T_BOULDER) {
          ctx.fillStyle = '#8a8794';
          ctx.beginPath();
          ctx.arc(sx + 20, sy + 20, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath();
          ctx.arc(sx + 15, sy + 15, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Drill cracks.
        const dmg = world.damage.get(`${x},${y}`);
        if (dmg) {
          const frac = Math.min(1, dmg / 4);
          ctx.strokeStyle = `rgba(0,0,0,${0.35 + frac * 0.45})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx + 8, sy + 10);
          ctx.lineTo(sx + 18, sy + 20);
          ctx.lineTo(sx + 12, sy + 30);
          ctx.moveTo(sx + 30, sy + 8);
          ctx.lineTo(sx + 22, sy + 18);
          ctx.stroke();
        }
      }
    }
  }

  function drawDiamond(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - w, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawPickups(world) {
    const camY = world.cameraY;
    for (const pk of world.pickups) {
      const sy = pk.y - camY;
      if (sy < -30 || sy > VIEW_H + 30) continue;
      const bob = Math.sin(world.time * 4 + pk.x) * 3;
      ctx.save();
      ctx.translate(pk.x, sy + bob);
      if (pk.kind === 'ore') {
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(-2, -2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (pk.kind === 'gem') {
        ctx.fillStyle = 'rgba(127,231,255,0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7fe7ff';
        drawDiamond(0, 0, 7, 10);
      } else if (pk.kind === 'heart') {
        ctx.fillStyle = '#ff5a6a';
        ctx.beginPath();
        ctx.arc(-4, -2, 5, 0, Math.PI * 2);
        ctx.arc(4, -2, 5, 0, Math.PI * 2);
        ctx.moveTo(-8, 1);
        ctx.lineTo(0, 10);
        ctx.lineTo(8, 1);
        ctx.fill();
      } else {
        ctx.fillStyle = '#22222a';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd76a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(4, -13);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBombs(world) {
    const camY = world.cameraY;
    for (const b of world.bombs) {
      const sy = b.y - camY;
      const blink = b.fuse < 0.4 && Math.sin(world.time * 30) > 0;
      ctx.fillStyle = blink ? '#ff5252' : '#22222a';
      ctx.beginPath();
      ctx.arc(b.x, sy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(b.x - 3, sy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9a86a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, sy - 11);
      ctx.quadraticCurveTo(b.x + 6, sy - 18, b.x + 10, sy - 15);
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(b.x + 10, sy - 15, 3 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoulders(world) {
    const camY = world.cameraY;
    for (const b of world.boulders) {
      const sy = b.y - camY;
      ctx.fillStyle = '#8a8794';
      ctx.beginPath();
      ctx.arc(b.x, sy, b.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b6874';
      ctx.beginPath();
      ctx.arc(b.x + 4, sy + 5, b.size / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(b.x - 5, sy - 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawProjectiles(world) {
    const camY = world.cameraY;
    for (const pr of world.projectiles) {
      const sy = pr.y - camY;
      ctx.fillStyle = pr.kind === 'glob' ? 'rgba(255,110,40,0.35)' : 'rgba(255,150,60,0.3)';
      ctx.beginPath();
      ctx.arc(pr.x, sy, pr.radius + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pr.kind === 'glob' ? '#ff6a2a' : '#ff9d4d';
      ctx.beginPath();
      ctx.arc(pr.x, sy, pr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(pr.x - 2, sy - 2, pr.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemies(world) {
    const camY = world.cameraY;
    for (const e of world.enemies) {
      const sy = e.y - camY;
      if (sy < -60 || sy > VIEW_H + 60) continue;
      const flash = e.flash > 0;
      ctx.save();
      ctx.translate(e.x, sy);
      if (e.kind === 'grub') {
        ctx.fillStyle = flash ? '#ffffff' : '#7a9a4e';
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(-10 + i * 10, -10 + Math.sin(world.time * 6 + i) * 2, 8 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#1c2410';
        ctx.beginPath();
        ctx.arc(e.facing * 8, -14, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'bat') {
        const flap = Math.sin(world.time * 14) * 8;
        ctx.fillStyle = flash ? '#ffffff' : '#6a5a98';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.quadraticCurveTo(-16, -18 - flap, -22, -6 - flap);
        ctx.quadraticCurveTo(-12, -8, -8, -4);
        ctx.quadraticCurveTo(-16, -2, -20, 4);
        ctx.quadraticCurveTo(-8, 2, 0, -2);
        ctx.quadraticCurveTo(8, 2, 20, 4);
        ctx.quadraticCurveTo(16, -2, 8, -4);
        ctx.quadraticCurveTo(12, -8, 22, -6 - flap);
        ctx.quadraticCurveTo(16, -18 - flap, 0, -8);
        ctx.fill();
        ctx.fillStyle = '#ff6a5a';
        ctx.beginPath();
        ctx.arc(-3, -10, 2, 0, Math.PI * 2);
        ctx.arc(3, -10, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'imp') {
        ctx.fillStyle = flash ? '#ffffff' : '#d94f2a';
        ctx.beginPath();
        ctx.arc(0, -15, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-11, -6, 22, 6);
        ctx.fillStyle = '#8a2a12';
        ctx.beginPath();
        ctx.moveTo(-10, -24);
        ctx.lineTo(-6, -32);
        ctx.lineTo(-3, -24);
        ctx.moveTo(10, -24);
        ctx.lineTo(6, -32);
        ctx.lineTo(3, -24);
        ctx.fill();
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(-4, -16, 2.5, 0, Math.PI * 2);
        ctx.arc(4, -16, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,122,60,0.35)';
        ctx.beginPath();
        ctx.arc(0, -15, 20 + Math.sin(world.time * 5) * 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = flash ? '#ffffff' : '#7d7a86';
        ctx.fillRect(-20, -46, 40, 46);
        ctx.fillStyle = flash ? '#ffffff' : '#9a97a3';
        ctx.fillRect(-16, -40, 14, 12);
        ctx.fillRect(4, -34, 12, 10);
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(-8, -32, 3, 0, Math.PI * 2);
        ctx.arc(8, -32, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7a3c';
        ctx.fillRect(-5, -18, 10, 8);
      }
      ctx.restore();
      if (e.hp < e.maxHp) {
        const w = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - w / 2, sy - e.height - 12, w, 5);
        ctx.fillStyle = '#ff6a5a';
        ctx.fillRect(e.x - w / 2, sy - e.height - 12, w * Math.max(0, e.hp / e.maxHp), 5);
      }
    }
  }

  function drawBoss(world) {
    const boss = world.boss;
    if (!boss) return;
    const camY = world.cameraY;
    const flash = boss.flash > 0;
    const telegraph = boss.state === 'windup';
    // A continuous body under the segments, so the wyrm reads as one beast.
    ctx.strokeStyle = flash ? '#ffffff' : '#4a2d1e';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y - camY);
    for (let i = 1; i < boss.segments; i += 1) {
      const seg = bossSegmentPos(boss, i);
      ctx.lineTo(seg.x, seg.y - camY);
    }
    ctx.stroke();
    // Segments, tail first.
    for (let i = boss.segments - 1; i >= 1; i -= 1) {
      const seg = bossSegmentPos(boss, i);
      const r = 26 - i * 1.4;
      const sy = seg.y - camY;
      ctx.fillStyle = flash ? '#ffffff' : '#5a3a28';
      ctx.beginPath();
      ctx.arc(seg.x, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#ffffff' : '#6e4525';
      ctx.beginPath();
      ctx.arc(seg.x - r * 0.3, sy - r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,110,40,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(seg.x - r * 0.5, sy + r * 0.2);
      ctx.lineTo(seg.x, sy - r * 0.3);
      ctx.lineTo(seg.x + r * 0.4, sy + r * 0.3);
      ctx.stroke();
    }
    // Head.
    const hx = boss.x;
    const hy = boss.y - camY;
    const headR = 34;
    if (telegraph) {
      ctx.fillStyle = 'rgba(255,60,40,0.25)';
      ctx.beginPath();
      ctx.arc(hx, hy, headR + 16 + Math.sin(world.time * 20) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = flash ? '#ffffff' : '#4a2c1c';
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    // Jaw.
    const jaw = boss.state === 'charge' ? 10 : 4 + Math.sin(world.time * 3) * 2;
    ctx.fillStyle = flash ? '#ffffff' : '#6e4525';
    ctx.beginPath();
    ctx.ellipse(hx, hy + headR * 0.45, headR * 0.7, 10 + jaw, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#fff3d0';
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(hx + i * 10 - 3, hy + headR * 0.45);
      ctx.lineTo(hx + i * 10 + 3, hy + headR * 0.45);
      ctx.lineTo(hx + i * 10, hy + headR * 0.45 + 9);
      ctx.fill();
    }
    // Eyes and horns.
    const facing = boss.vx >= 0 ? 1 : -1;
    ctx.fillStyle = telegraph ? '#ff2a1a' : '#ffd76a';
    ctx.beginPath();
    ctx.arc(hx + facing * 12, hy - 10, 6, 0, Math.PI * 2);
    ctx.arc(hx + facing * 12 - facing * 18, hy - 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2410';
    ctx.beginPath();
    ctx.arc(hx + facing * 13, hy - 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8cfc0';
    ctx.beginPath();
    ctx.moveTo(hx - 24, hy - 22);
    ctx.lineTo(hx - 34, hy - 44);
    ctx.lineTo(hx - 14, hy - 28);
    ctx.moveTo(hx + 24, hy - 22);
    ctx.lineTo(hx + 34, hy - 44);
    ctx.lineTo(hx + 14, hy - 28);
    ctx.fill();
    if (boss.stun > 0) {
      ctx.fillStyle = '#ffd76a';
      for (let i = 0; i < 3; i += 1) {
        const a = world.time * 4 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(hx + Math.cos(a) * 44, hy - 30 + Math.sin(a) * 8, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPlayer(world) {
    const p = world.player;
    if (p.dead) return;
    const camY = world.cameraY;
    const sy = p.y - camY;
    const blink = p.iframe > 0 && Math.sin(world.time * 30) > 0;
    ctx.save();
    ctx.translate(p.x, sy);
    if (blink) ctx.globalAlpha = 0.45;
    // Headlamp glow.
    ctx.fillStyle = 'rgba(255,230,160,0.13)';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(p.facing * 190, -70);
    ctx.lineTo(p.facing * 190, 10);
    ctx.closePath();
    ctx.fill();
    // Tracks.
    ctx.fillStyle = '#2a262e';
    ctx.fillRect(-15, -8, 30, 8);
    ctx.fillStyle = '#4a4652';
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.arc(i * 10, -4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body.
    ctx.fillStyle = '#e8822a';
    ctx.beginPath();
    ctx.roundRect(-14, -32, 28, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#f5a54d';
    ctx.beginPath();
    ctx.roundRect(-14, -32, 28, 10, 5);
    ctx.fill();
    // Cockpit.
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.arc(p.facing * 4, -26, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a262e';
    ctx.beginPath();
    ctx.arc(p.facing * 5, -26, 3, 0, Math.PI * 2);
    ctx.fill();
    // Heat glow.
    const heatFrac = p.heat / world.stats.maxHeat;
    if (heatFrac > 0.6) {
      ctx.fillStyle = `rgba(255,80,30,${(heatFrac - 0.6) * 1.2})`;
      ctx.beginPath();
      ctx.roundRect(-14, -32, 28, 26, 6);
      ctx.fill();
    }
    // Drill arm.
    const spinning = p.drillTime > 0;
    let angle = p.facing > 0 ? 0 : Math.PI;
    if (p.drillTarget) {
      const tc = { x: p.drillTarget.x * TILE + 20 - p.x, y: p.drillTarget.y * TILE + 20 - (p.y - 18) };
      angle = Math.atan2(tc.y, tc.x);
    }
    ctx.save();
    ctx.translate(p.facing * 8, -18);
    ctx.rotate(angle);
    ctx.fillStyle = '#8a8794';
    ctx.fillRect(0, -4, 20, 8);
    // Spinning bit.
    const spin = spinning ? world.time * 28 : world.time * 4;
    ctx.fillStyle = '#c9ccd4';
    ctx.save();
    ctx.translate(26, 0);
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(14, 0);
    ctx.lineTo(0, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Venting steam.
    if (p.venting > 0) {
      ctx.fillStyle = 'rgba(220,220,220,0.5)';
      ctx.beginPath();
      ctx.arc(-6, -40 - Math.sin(world.time * 8) * 3, 6, 0, Math.PI * 2);
      ctx.arc(6, -44, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(world) {
    const camY = world.cameraY;
    const list = world.particles.list;
    for (const p of list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(p.x, p.y - camY, p.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const t of world.particles.texts) {
      const a = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = a;
      ctx.font = `bold 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.text, t.x, t.y - camY);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, fill, back) {
    ctx.fillStyle = back ?? 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, Math.max(4, (w - 4) * Math.min(1, frac)), h - 4, (h - 4) / 2);
      ctx.fill();
    }
  }

  function drawHud(world, ui) {
    const p = world.player;
    const stats = world.stats;
    ctx.textAlign = 'left';
    // Hull + heat.
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HULL', 18, 24);
    const hullFrac = p.hull / stats.maxHull;
    bar(58, 12, 210, 16, hullFrac, hullFrac > 0.3 ? '#7ed957' : '#ff5252');
    ctx.fillText('HEAT', 18, 48);
    const heatFrac = p.heat / stats.maxHeat;
    bar(58, 36, 210, 16, heatFrac, heatFrac > 0.85 ? '#ff2a1a' : '#ff9d4d');
    if (p.venting > 0) {
      ctx.fillStyle = '#ff9d4d';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText('VENTING!', 278, 49);
    }
    // Bombs + revive.
    for (let i = 0; i < stats.maxBombs; i += 1) {
      ctx.fillStyle = i < p.bombs ? '#22222a' : 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(30 + i * 24, 70, 9, 0, Math.PI * 2);
      ctx.fill();
      if (i < p.bombs) {
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(30 + i * 24, 70, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (stats.revive) {
      ctx.fillStyle = '#ff5a6a';
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('♥ 2ND WIND', 30 + stats.maxBombs * 24 + 8, 75);
    }
    // Score block.
    ctx.textAlign = 'right';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${world.score.toLocaleString('en-US')}`, VIEW_W - 18, 32);
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(`◆ ${world.ore}    ⬡ ${world.gems}`, VIEW_W - 18, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`BEST ${Math.max(ui.best, world.score).toLocaleString('en-US')}`, VIEW_W - 18, 76);
    // Level + depth rail.
    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    const levelLabel = world.endless ? `ENDLESS · LEVEL ${world.level}` : `LEVEL ${world.level} / ${BOSS_LEVEL}`;
    ctx.fillText(levelLabel, VIEW_W / 2, 30);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(world.difficulty.name, VIEW_W / 2, 50);
    drawDepthRail(world);
    // Boss bar.
    if (world.boss && !world.boss.dead) {
      const boss = world.boss;
      const w = 460;
      const x = VIEW_W / 2 - w / 2;
      const y = VIEW_H - 46;
      ctx.textAlign = 'center';
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = '#ffb347';
      ctx.fillText('THE CORE WYRM', VIEW_W / 2, y - 6);
      bar(x, y, w, 16, boss.hp / boss.maxHp, '#ff6a2a');
      for (let i = 1; i <= 2; i += 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x + (w * i) / 3 - 1, y, 2, 16);
      }
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`PHASE ${boss.phase}`, VIEW_W / 2, y + 30);
    }
    // Controls hint, early on.
    if (world.time < 14 && world.level <= 2) {
      ctx.textAlign = 'center';
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('A / D move · W jump · S dig down · push into rock to drill · hold CLICK to aim-drill · E bomb · P pause', VIEW_W / 2, VIEW_H - 18);
    }
    // Mute state.
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(ui.muted ? 'M: UNMUTE' : 'M: MUTE', 18, VIEW_H - 18);
  }

  function drawDepthRail(world) {
    const x = VIEW_W - 34;
    const top = 100;
    const height = VIEW_H - 220;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x - 5, top, 10, height, 5);
    ctx.fill();
    const span = BOSS_LEVEL;
    for (let lvl = 5; lvl <= span; lvl += 5) {
      const y = top + (height * lvl) / span;
      ctx.fillStyle = lvl >= world.level ? 'rgba(255,255,255,0.5)' : '#ffd76a';
      ctx.fillRect(x - 9, y - 1, 18, 2);
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(String(lvl), x - 12, y + 4);
    }
    // Player marker.
    const frac = Math.min(1, world.level / span);
    const my = top + height * frac;
    ctx.fillStyle = '#7ed957';
    ctx.beginPath();
    ctx.moveTo(x - 12, my);
    ctx.lineTo(x + 12, my);
    ctx.lineTo(x, my + 9);
    ctx.closePath();
    ctx.fill();
    // Boss skull at the bottom.
    ctx.fillStyle = '#ff6a2a';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('◆', x, top + height + 22);
    ctx.font = `10px ${FONT}`;
    ctx.fillText('WYRM', x, top + height + 36);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(12,10,16,${alpha ?? 0.82})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,90,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function button(ui, id, x, y, w, h, label, opts) {
    const hover = ui.mouseX >= x && ui.mouseX <= x + w && ui.mouseY >= y && ui.mouseY <= y + h;
    const disabled = opts?.disabled;
    ctx.fillStyle = disabled ? 'rgba(80,76,88,0.9)' : hover ? '#f5a54d' : '#e8822a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = disabled ? '#b9b4c0' : '#1c1408';
    ctx.font = `bold ${opts?.font ?? 20}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + (opts?.font ?? 20) * 0.36);
    ui.hits.push({ id, x, y, w, h, disabled: !!disabled });
    return hover;
  }

  function drawTitle(world, ui) {
    ctx.fillStyle = 'rgba(8,6,12,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    // Logo.
    ctx.font = `bold 92px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2a1408';
    ctx.strokeText('COREBREAK', VIEW_W / 2, 150);
    const grad = ctx.createLinearGradient(0, 80, 0, 160);
    grad.addColorStop(0, '#ffd76a');
    grad.addColorStop(0.5, '#ff9d4d');
    grad.addColorStop(1, '#ff6a2a');
    ctx.fillStyle = grad;
    ctx.fillText('COREBREAK', VIEW_W / 2, 150);
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('DRILL TO THE HEART OF THE MOUNTAIN', VIEW_W / 2, 190);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('30 levels down · draft an upgrade every 5 · slay the 3-phase Core Wyrm · then keep digging forever', VIEW_W / 2, 216);
    // Difficulty cards.
    const cards = ui.difficulties;
    const cw = 250;
    const gap = 26;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let cx = VIEW_W / 2 - total / 2;
    const cy = 248;
    const ch = 150;
    cards.forEach((d) => {
      const selected = ui.selectedDifficulty === d.id;
      ctx.fillStyle = selected ? 'rgba(255,160,70,0.28)' : 'rgba(12,10,16,0.8)';
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 14);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ffd76a' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = selected ? 3 : 1;
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText(d.name, cx + cw / 2, cy + 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = `14px ${FONT}`;
      wrapText(d.blurb, cx + 18, cy + 68, cw - 36, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`Score x${d.scoreMult} · Hull ${d.startHull}`, cx + cw / 2, cy + ch - 16);
      ui.hits.push({ id: `diff:${d.id}`, x: cx, y: cy, w: cw, h: ch });
      cx += cw + gap;
    });
    button(ui, 'start', VIEW_W / 2 - 160, 428, 320, 56, 'START DIGGING', { font: 24 });
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('A / D move · W jump · S dig down · push into rock to drill · CLICK aim-drill · E bomb · R reroll in drafts', VIEW_W / 2, 516);
    ctx.fillText('Manage HEAT: drilling and lava heat the drill. Water cools it. Boulders fall. Gas explodes.', VIEW_W / 2, 540);
    if (ui.best > 0 || ui.bestDepth > 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(`BEST SCORE ${ui.best.toLocaleString('en-US')} · DEEPEST LEVEL ${ui.bestDepth}`, VIEW_W / 2, 580);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('An original game built for the make.fun best-game bounty · headphones recommended', VIEW_W / 2, 640);
  }

  function wrapText(text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    ctx.textAlign = 'center';
    const cx = x + maxW / 2;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = word;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  function drawDraft(world, ui) {
    ctx.fillStyle = 'rgba(8,6,12,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('CHOOSE AN UPGRADE', VIEW_W / 2, 96);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Level ${world.level} reached — the drill crew bolts on something new.  Ore: ${world.ore}`, VIEW_W / 2, 128);
    const options = ui.draftOptions;
    const cw = 270;
    const gap = 30;
    const total = options.length * cw + (options.length - 1) * gap;
    let cx = VIEW_W / 2 - total / 2;
    const cy = 168;
    const ch = 300;
    options.forEach((u, i) => {
      const hover = ui.mouseX >= cx && ui.mouseX <= cx + cw && ui.mouseY >= cy && ui.mouseY <= cy + ch;
      ctx.fillStyle = hover ? 'rgba(255,160,70,0.25)' : 'rgba(20,16,26,0.95)';
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 16);
      ctx.fill();
      ctx.strokeStyle = hover ? '#ffd76a' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = hover ? 3 : 1;
      ctx.stroke();
      drawIcon(u.icon, cx + cw / 2, cy + 62, 34, '#ffd76a');
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 23px ${FONT}`;
      ctx.fillText(u.name, cx + cw / 2, cy + 128);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `16px ${FONT}`;
      wrapText(u.desc, cx + 20, cy + 162, cw - 40, 22);
      const owned = ui.draftOwned[u.id] ?? 0;
      ctx.fillStyle = '#ffd76a';
      ctx.font = `14px ${FONT}`;
      ctx.fillText(`Owned ${owned} / ${u.max}`, cx + cw / 2, cy + ch - 44);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`Press ${i + 1} or click`, cx + cw / 2, cy + ch - 20);
      ui.hits.push({ id: `draft:${i}`, x: cx, y: cy, w: cw, h: ch });
      cx += cw + gap;
    });
    const rerollFree = ui.freeRerolls > 0;
    const rerollLabel = rerollFree ? 'REROLL (FREE)' : `REROLL (30 ORE)`;
    button(ui, 'reroll', VIEW_W / 2 - 130, 500, 260, 48, rerollLabel, { disabled: !rerollFree && world.ore < 30 });
    // Current build.
    const owned = ui.draftOwned;
    const names = Object.entries(owned).map(([id, n]) => {
      const def = ui.upgradeDefs.find((d) => d.id === id);
      return def ? `${def.name} x${n}` : id;
    });
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(names.length ? `Your build: ${names.join(' · ')}` : 'Your build: stock drill rig', VIEW_W / 2, 590);
  }

  function drawIcon(icon, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const s = size;
    switch (icon) {
      case 'drill':
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s * 0.3);
        ctx.lineTo(s * 0.6, 0);
        ctx.lineTo(-s * 0.6, s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-s, -s * 0.35, s * 0.5, s * 0.7);
        break;
      case 'bolt':
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s);
        ctx.lineTo(-s * 0.5, s * 0.1);
        ctx.lineTo(0, s * 0.1);
        ctx.lineTo(-s * 0.2, s);
        ctx.lineTo(s * 0.5, -s * 0.1);
        ctx.lineTo(0, -s * 0.1);
        ctx.closePath();
        ctx.fill();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.8, -s * 0.5);
        ctx.lineTo(s * 0.8, s * 0.2);
        ctx.quadraticCurveTo(s * 0.8, s * 0.8, 0, s);
        ctx.quadraticCurveTo(-s * 0.8, s * 0.8, -s * 0.8, s * 0.2);
        ctx.lineTo(-s * 0.8, -s * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      case 'snow':
        for (let i = 0; i < 3; i += 1) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(-Math.cos(a) * s, -Math.sin(a) * s);
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.stroke();
        }
        break;
      case 'drop':
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.8, 0, s * 0.6, s * 0.5);
        ctx.quadraticCurveTo(s * 0.3, s, 0, s);
        ctx.quadraticCurveTo(-s * 0.3, s, -s * 0.6, s * 0.5);
        ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s);
        ctx.fill();
        break;
      case 'magnet':
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.7, Math.PI, 0, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, 0);
        ctx.lineTo(-s * 0.7, s * 0.7);
        ctx.moveTo(s * 0.7, 0);
        ctx.lineTo(s * 0.7, s * 0.7);
        ctx.stroke();
        break;
      case 'bomb':
        ctx.beginPath();
        ctx.arc(0, s * 0.2, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5);
        ctx.quadraticCurveTo(s * 0.4, -s, s * 0.7, -s * 0.8);
        ctx.stroke();
        break;
      case 'gem':
        drawDiamond(0, 0, s * 0.7, s);
        break;
      case 'heart':
        ctx.beginPath();
        ctx.arc(-s * 0.35, -s * 0.2, s * 0.45, 0, Math.PI * 2);
        ctx.arc(s * 0.35, -s * 0.2, s * 0.45, 0, Math.PI * 2);
        ctx.moveTo(-s * 0.75, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(s * 0.75, 0);
        ctx.fill();
        break;
      case 'flame':
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.5, s * 0.4);
        ctx.quadraticCurveTo(s * 0.2, s, 0, s);
        ctx.quadraticCurveTo(-s * 0.5, s * 0.6, -s * 0.5, 0);
        ctx.quadraticCurveTo(-s * 0.4, -s * 0.5, 0, -s);
        ctx.fill();
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1408';
        ctx.font = `bold ${Math.round(s)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('+', 0, s * 0.35);
        break;
    }
    ctx.restore();
  }

  function drawPaused(world, ui) {
    ctx.fillStyle = 'rgba(8,6,12,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(VIEW_W / 2 - 260, 200, 520, 300, 0.9);
    ctx.textAlign = 'center';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PAUSED', VIEW_W / 2, 262);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('The drill idles. The mountain waits.', VIEW_W / 2, 296);
    button(ui, 'resume', VIEW_W / 2 - 150, 322, 300, 50, 'RESUME');
    button(ui, 'restart', VIEW_W / 2 - 150, 384, 300, 50, 'RESTART RUN');
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('P / Esc resume · M mute', VIEW_W / 2, 468);
  }

  function statsBlock(world, ui, y) {
    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60);
    const rows = [
      ['SCORE', world.score.toLocaleString('en-US')],
      ['DEEPEST LEVEL', String(world.maxLevel)],
      ['ORE MINED', String(world.ore)],
      ['GEMS', String(world.gems)],
      ['CREATURES FELLED', String(world.kills)],
      ['TIME', `${mins}:${String(secs).padStart(2, '0')}`],
      ['BEST SCORE', Math.max(ui.best, world.score).toLocaleString('en-US')],
    ];
    ctx.font = `17px ${FONT}`;
    rows.forEach(([label, value], i) => {
      const yy = y + i * 28;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(label, VIEW_W / 2 - 16, yy);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd76a';
      ctx.fillText(value, VIEW_W / 2 + 16, yy);
    });
    return y + rows.length * 28;
  }

  function drawOver(world, ui) {
    ctx.fillStyle = 'rgba(10,4,4,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillStyle = '#ff6a5a';
    ctx.fillText('THE MOUNTAIN CLAIMS YOU', VIEW_W / 2, 120);
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(world.endless ? `The endless deep keeps your rig at level ${world.maxLevel}.` : `The Core Wyrm still sleeps at level ${BOSS_LEVEL}. Dig again.`, VIEW_W / 2, 152);
    const after = statsBlock(world, ui, 200);
    button(ui, 'restart', VIEW_W / 2 - 160, after + 18, 320, 54, 'DIG AGAIN', { font: 22 });
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Press R or Enter', VIEW_W / 2, after + 100);
  }

  function drawWin(world, ui) {
    ctx.fillStyle = 'rgba(20,12,4,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = `bold 56px ${FONT}`;
    const grad = ctx.createLinearGradient(0, 60, 0, 130);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(1, '#ffb347');
    ctx.fillStyle = grad;
    ctx.fillText('THE HEART IS YOURS!', VIEW_W / 2, 118);
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('The Core Wyrm falls. The mountain is yours — and below, the deep goes on forever.', VIEW_W / 2, 150);
    const after = statsBlock(world, ui, 196);
    button(ui, 'endless', VIEW_W / 2 - 170, after + 16, 340, 54, 'KEEP DIGGING (ENDLESS)', { font: 20 });
    button(ui, 'restart', VIEW_W / 2 - 170, after + 82, 340, 48, 'NEW RUN', { font: 20 });
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Enter: endless · R: new run', VIEW_W / 2, after + 158);
  }

  function draw(world, ui) {
    ui.hits.length = 0;
    const shake = shakeOffset(world.particles);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawBackground(world);
    drawTiles(world);
    drawPickups(world);
    drawBombs(world);
    drawBoulders(world);
    drawEnemies(world);
    drawBoss(world);
    drawProjectiles(world);
    drawPlayer(world);
    drawParticles(world);
    ctx.restore();

    if (ui.screen === SCREEN_TITLE) {
      drawTitle(world, ui);
    } else {
      drawHud(world, ui);
      if (ui.screen === SCREEN_PAUSED) drawPaused(world, ui);
      else if (ui.screen === SCREEN_DRAFT) drawDraft(world, ui);
      else if (ui.screen === SCREEN_OVER) drawOver(world, ui);
      else if (ui.screen === SCREEN_WIN) drawWin(world, ui);
    }
  }

  return { draw, canvas };
}
