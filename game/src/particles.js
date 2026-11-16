// Particles, floating text and screen shake: every bit of feedback the game
// gives when the world breaks, the player is hit or something explodes. One
// pooled list, no allocation in the hot loop beyond small objects.
export function createParticles() {
  return { list: [], trauma: 0, texts: [] };
}

export function addShake(particles, amount) {
  particles.trauma = Math.min(1, particles.trauma + amount);
}

export function shakeOffset(particles) {
  const mag = particles.trauma * particles.trauma * 16;
  if (mag < 0.1) return { x: 0, y: 0 };
  return { x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag };
}

export function burst(particles, x, y, opts) {
  const count = opts.count ?? 10;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (opts.speed ?? 120) * (0.3 + Math.random() * 0.9);
    particles.list.push({
      x,
      y,
      vx: Math.cos(angle) * speed + (opts.vx ?? 0),
      vy: Math.sin(angle) * speed + (opts.vy ?? 0),
      life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.7),
      maxLife: opts.life ?? 0.6,
      size: (opts.size ?? 4) * (0.6 + Math.random() * 0.8),
      color: opts.colors ? opts.colors[Math.floor(Math.random() * opts.colors.length)] : '#ffffff',
      gravity: opts.gravity ?? 500,
      drag: opts.drag ?? 0.98,
      glow: opts.glow ?? false,
    });
  }
  if (particles.list.length > 900) particles.list.splice(0, particles.list.length - 900);
}

export function floatText(particles, x, y, text, color) {
  particles.texts.push({ x, y, text, color: color ?? '#ffffff', life: 1.1, maxLife: 1.1 });
  if (particles.texts.length > 40) particles.texts.shift();
}

export function updateParticles(particles, dt) {
  particles.trauma = Math.max(0, particles.trauma - dt * 1.6);
  const list = particles.list;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = particles.texts.length - 1; i >= 0; i -= 1) {
    const t = particles.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) particles.texts.splice(i, 1);
  }
}

const DIRT_COLORS = ['#8a5a33', '#6e4525', '#a06a3c', '#5a3a20'];
const ROCK_COLORS = ['#7d7a86', '#5d5a66', '#9a97a3', '#4a4852'];
const SPARK_COLORS = ['#ffd76a', '#ffb347', '#fff3b0'];
const EMBER_COLORS = ['#ff7a3c', '#ff9d4d', '#ff5252'];
const GEM_COLORS = ['#7fe7ff', '#b78bff', '#8dff9e'];

export function dirtBurst(particles, x, y, tileKind) {
  const colors = tileKind === 'rock' ? ROCK_COLORS : tileKind === 'gem' ? GEM_COLORS : DIRT_COLORS;
  burst(particles, x, y, { count: 12, speed: 150, life: 0.7, size: 5, colors, gravity: 700 });
}

export function sparkBurst(particles, x, y) {
  burst(particles, x, y, { count: 8, speed: 220, life: 0.35, size: 3, colors: SPARK_COLORS, gravity: 200, glow: true });
}

export function explosionBurst(particles, x, y) {
  burst(particles, x, y, { count: 26, speed: 320, life: 0.7, size: 7, colors: EMBER_COLORS, gravity: 300, glow: true });
  burst(particles, x, y, { count: 12, speed: 90, life: 1.2, size: 10, colors: ['#555055', '#3a3438'], gravity: -60, drag: 0.94 });
  addShake(particles, 0.55);
}

export function emberDrift(particles, x, y) {
  burst(particles, x, y, { count: 2, speed: 30, life: 1.6, size: 3, colors: EMBER_COLORS, gravity: -70, drag: 0.99, glow: true });
}

export function pickupBurst(particles, x, y, color) {
  burst(particles, x, y, { count: 8, speed: 110, life: 0.5, size: 3, colors: [color, '#ffffff'], gravity: -40, glow: true });
}
