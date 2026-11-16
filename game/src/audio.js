// Every sound in Lumen Reef, synthesised live with WebAudio: no audio files,
// no network, nothing to load. Short blips and sweeps for actions, a soft
// generative pad for music. Everything no-ops until the first gesture unlocks
// the context, and every call is guarded, so a browser without audio still
// plays the game.

const NOTE_NAMES = [0, 3, 5, 7, 10, 12, 15];
const BASE_FREQ = 220;

function noteFrequency(step) {
  return BASE_FREQ * 2 ** (step / 12);
}

export function createAudio(startMuted) {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = startMuted;
  let unlocked = false;
  let musicTimer = null;
  let musicStep = 0;
  let lastShotAt = 0;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  /** Call from a user gesture: starts the context and the music. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    if (!unlocked) {
      unlocked = true;
      startMusic();
    }
  }

  function tone({ freq, end = null, duration, type = 'sine', gain = 0.2, delay = 0, music = false }) {
    if (context === null || muted) return;
    try {
      const at = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, at);
      if (end !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(gain, at + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(envelope);
      envelope.connect(music ? musicGain : master);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.05);
    } catch {
      // A failed blip never stops the game.
    }
  }

  function noise({ duration, gain = 0.15, frequency = 1200, delay = 0 }) {
    if (context === null || muted) return;
    try {
      const at = context.currentTime + delay;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(gain, at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(master);
      source.start(at);
    } catch {
      // A failed whoosh never stops the game.
    }
  }

  /** A slow underwater drift: a soft chord, then sparse pentatonic notes. */
  function startMusic() {
    if (musicTimer !== null || context === null) return;
    musicTimer = setInterval(() => {
      if (muted || context.state !== 'running') return;
      const step = NOTE_NAMES[musicStep % NOTE_NAMES.length];
      tone({ freq: noteFrequency(step), duration: 1.6, type: 'sine', gain: 0.12, music: true });
      if (musicStep % 4 === 0) {
        tone({ freq: noteFrequency(step) / 2, duration: 3.2, type: 'triangle', gain: 0.1, music: true });
        tone({ freq: noteFrequency(step + 7) / 2, duration: 3.2, type: 'sine', gain: 0.07, music: true });
      }
      musicStep += 1;
    }, 900);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock,
    stopMusic,
    isMuted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
      if (master !== null && context !== null) master.gain.value = muted ? 0 : 0.9;
    },
    shoot() {
      if (context === null) return;
      const now = context.currentTime;
      if (now - lastShotAt < 0.05) return;
      lastShotAt = now;
      tone({ freq: 920, end: 540, duration: 0.07, type: 'triangle', gain: 0.1 });
    },
    hit() {
      tone({ freq: 240, end: 120, duration: 0.08, type: 'square', gain: 0.08 });
    },
    die(big) {
      tone({ freq: big ? 300 : 520, end: 90, duration: big ? 0.5 : 0.22, type: 'sawtooth', gain: 0.12 });
      noise({ duration: big ? 0.4 : 0.15, gain: 0.12, frequency: 900 });
    },
    pickup(combo) {
      const step = Math.min(combo, 12);
      tone({ freq: noteFrequency(12 + step), duration: 0.14, type: 'sine', gain: 0.16 });
      tone({ freq: noteFrequency(19 + step), duration: 0.18, type: 'sine', gain: 0.08, delay: 0.04 });
    },
    levelUp() {
      [0, 4, 7, 12].forEach((step, index) => {
        tone({ freq: noteFrequency(12 + step), duration: 0.3, type: 'triangle', gain: 0.16, delay: index * 0.09 });
      });
    },
    hurt() {
      tone({ freq: 160, end: 50, duration: 0.25, type: 'sawtooth', gain: 0.2 });
      noise({ duration: 0.2, gain: 0.14, frequency: 500 });
    },
    dash() {
      noise({ duration: 0.18, gain: 0.1, frequency: 2600 });
    },
    bossRoar() {
      tone({ freq: 90, end: 55, duration: 1.1, type: 'sawtooth', gain: 0.22 });
      tone({ freq: 135, end: 80, duration: 1.1, type: 'square', gain: 0.08, delay: 0.1 });
    },
    waveStart() {
      tone({ freq: noteFrequency(7), duration: 0.25, type: 'triangle', gain: 0.12 });
      tone({ freq: noteFrequency(12), duration: 0.35, type: 'triangle', gain: 0.12, delay: 0.12 });
    },
    choose() {
      tone({ freq: noteFrequency(12), duration: 0.16, type: 'triangle', gain: 0.16 });
      tone({ freq: noteFrequency(16), duration: 0.22, type: 'triangle', gain: 0.14, delay: 0.07 });
    },
    click() {
      tone({ freq: 700, duration: 0.06, type: 'sine', gain: 0.1 });
    },
    victory() {
      [0, 4, 7, 12, 16, 19, 24].forEach((step, index) => {
        tone({ freq: noteFrequency(12 + step), duration: 0.4, type: 'triangle', gain: 0.16, delay: index * 0.11 });
      });
    },
    gameOver() {
      [12, 10, 7, 3, 0].forEach((step, index) => {
        tone({ freq: noteFrequency(step), duration: 0.42, type: 'triangle', gain: 0.14, delay: index * 0.16 });
      });
    },
  };
}
