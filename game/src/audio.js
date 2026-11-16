// All sound is synthesized with WebAudio: no assets, no files. Short effects
// are oscillators and filtered noise; the music is a small step sequencer
// whose intensity follows the depth and the boss fight. The context starts on
// the first user gesture, and M toggles mute.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: false,
    musicTimer: null,
    step: 0,
    intensity: 0,
    started: false,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = 0.16;
      audio.musicGain.connect(audio.master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, when) {
    if (!ensure()) return;
    const t = audio.ctx.currentTime + (when ?? 0);
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type ?? 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ensure()) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = type ?? 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
  }

  const BASS = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
  const ARPS = [
    [220, 261.63, 329.63, 261.63],
    [220, 261.63, 329.63, 392],
    [246.94, 293.66, 369.99, 293.66],
    [196, 246.94, 293.66, 246.94],
  ];

  function musicStep() {
    if (!audio.ctx || audio.muted) return;
    const bar = Math.floor(audio.step / 4) % BASS.length;
    const beat = audio.step % 4;
    const t = audio.ctx.currentTime;
    const bass = audio.ctx.createOscillator();
    const bassGain = audio.ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.value = BASS[bar];
    bassGain.gain.setValueAtTime(0.5, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    bass.connect(bassGain);
    bassGain.connect(audio.musicGain);
    bass.start(t);
    bass.stop(t + 0.34);
    if (audio.intensity > 0.25) {
      const arp = audio.ctx.createOscillator();
      const arpGain = audio.ctx.createGain();
      arp.type = 'sine';
      arp.frequency.value = ARPS[bar % ARPS.length][beat];
      arpGain.gain.setValueAtTime(0.22 + audio.intensity * 0.2, t);
      arpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      arp.connect(arpGain);
      arpGain.connect(audio.musicGain);
      arp.start(t);
      arp.stop(t + 0.24);
    }
    if (audio.intensity > 0.7 && beat === 2) {
      const hat = audio.ctx.createOscillator();
      const hatGain = audio.ctx.createGain();
      hat.type = 'square';
      hat.frequency.value = 1200;
      hatGain.gain.setValueAtTime(0.05, t);
      hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      hat.connect(hatGain);
      hatGain.connect(audio.musicGain);
      hat.start(t);
      hat.stop(t + 0.06);
    }
    audio.step += 1;
  }

  return {
    unlock() {
      if (ensure() && audio.ctx.state === 'suspended') audio.ctx.resume();
      if (!audio.started) {
        audio.started = true;
        audio.musicTimer = setInterval(musicStep, 240);
      }
    },
    setIntensity(v) {
      audio.intensity = Math.max(0, Math.min(1, v));
    },
    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      return audio.muted;
    },
    get mutedNow() {
      return audio.muted;
    },
    dig() {
      noise(0.07, 0.25, 900, 'lowpass');
    },
    breakTile() {
      noise(0.16, 0.4, 1400, 'lowpass');
      tone(140, 0.12, 'triangle', 0.2, 60);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.25, 1320);
    },
    gem() {
      tone(1174, 0.1, 'sine', 0.25, 1760);
      tone(1760, 0.14, 'sine', 0.18, 2349, 0.07);
    },
    hurt() {
      tone(220, 0.18, 'sawtooth', 0.3, 90);
      noise(0.1, 0.2, 500, 'lowpass');
    },
    explosion() {
      noise(0.5, 0.55, 300, 'lowpass');
      tone(90, 0.4, 'sine', 0.5, 35);
    },
    bombPlace() {
      tone(320, 0.08, 'square', 0.2, 200);
    },
    enemyDie() {
      tone(330, 0.15, 'square', 0.22, 70);
    },
    spit() {
      tone(500, 0.12, 'sawtooth', 0.15, 180);
    },
    draft() {
      tone(523, 0.12, 'sine', 0.25);
      tone(659, 0.12, 'sine', 0.25, 0, 0.1);
      tone(784, 0.2, 'sine', 0.25, 0, 0.2);
    },
    pick() {
      tone(784, 0.1, 'sine', 0.28, 1046);
      tone(1046, 0.16, 'sine', 0.22, 0, 0.08);
    },
    click() {
      tone(660, 0.05, 'square', 0.12);
    },
    roar() {
      tone(70, 0.7, 'sawtooth', 0.4, 45);
      noise(0.6, 0.3, 250, 'lowpass');
    },
    victory() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'sine', 0.28, 0, i * 0.13));
    },
    defeat() {
      [392, 370, 349, 311].forEach((f, i) => tone(f, 0.35, 'triangle', 0.25, 0, i * 0.22));
    },
    levelUp() {
      tone(587, 0.1, 'sine', 0.25, 880);
    },
  };
}
