/**
 * Procedural audio engine using the Web Audio API.
 * Generates all game sounds synthetically — no audio files required.
 * Works alongside (or instead of) Phaser's audio system.
 */

let _ctx: AudioContext | null = null;
let _master: GainNode | null = null;
let _sfxBus: GainNode | null = null;
let _musicBus: GainNode | null = null;
let _muted = false;
let _masterVol = 0.8;
let _sfxVol = 0.85;
let _musicVol = 0.32;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      _master = _ctx.createGain();
      _master.connect(_ctx.destination);
      _sfxBus = _ctx.createGain();
      _sfxBus.connect(_master);
      _musicBus = _ctx.createGain();
      _musicBus.connect(_master);
      applyGains();
    }
    if (_ctx.state === "suspended") void _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

function applyGains(): void {
  if (_master) _master.gain.value = _muted ? 0 : _masterVol;
  if (_sfxBus) _sfxBus.gain.value = _sfxVol;
  if (_musicBus) _musicBus.gain.value = _musicVol;
}

export function synthSetMuted(muted: boolean): void {
  _muted = muted;
  applyGains();
}

export function synthUnlock(): void {
  const c = getCtx();
  if (c?.state === "suspended") void c.resume();
}

// ── Primitive helpers ──

function playOsc(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  t: number,
  dur: number,
  gain: number,
  freqEnd?: number,
): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
  }
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function playNoise(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  gain: number,
  lowpass?: number,
): void {
  const bufLen = Math.ceil(c.sampleRate * Math.min(dur, 2));
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    src.connect(g);
    g.connect(f);
    f.connect(dest);
  } else {
    src.connect(g);
    g.connect(dest);
  }
  src.start(t);
  src.stop(t + dur + 0.01);
}

// ── SFX ──

export function sfxAttack(weaponType = "bullet"): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  if (weaponType === "rocket") {
    playOsc(c, _sfxBus, 160, "sawtooth", t, 0.2, 0.22, 55);
    playNoise(c, _sfxBus, t, 0.15, 0.16, 600);
  } else if (weaponType === "bomb") {
    playOsc(c, _sfxBus, 90, "sine", t, 0.22, 0.38, 28);
    playNoise(c, _sfxBus, t, 0.14, 0.22, 280);
  } else {
    // bullet
    playOsc(c, _sfxBus, 1200, "square", t, 0.06, 0.18, 160);
    playOsc(c, _sfxBus, 600, "sawtooth", t, 0.05, 0.09, 80);
  }
}

export function sfxExplosion(intensity = 1.0): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  const v = Math.min(intensity, 1.0);
  playOsc(c, _sfxBus, 65, "sine", t, 0.55, 0.65 * v, 12);
  playOsc(c, _sfxBus, 170, "sawtooth", t, 0.22, 0.38 * v, 35);
  playNoise(c, _sfxBus, t, 0.38, 0.52 * v, 1400);
  playNoise(c, _sfxBus, t + 0.05, 0.55, 0.28 * v, 280);
}

export function sfxHit(): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  playOsc(c, _sfxBus, 280, "sawtooth", t, 0.14, 0.38, 55);
  playNoise(c, _sfxBus, t, 0.11, 0.32, 800);
}

export function sfxPickup(): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    playOsc(c, _sfxBus!, freq, "sine", t + i * 0.065, 0.2, 0.28 - i * 0.02);
  });
}

export function sfxKill(): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  let offset = 0;
  notes.forEach((freq, i) => {
    const dur = i === 3 ? 0.28 : 0.08;
    playOsc(c, _sfxBus!, freq, "square", t + offset, dur, 0.2 - i * 0.02);
    offset += dur * 0.82;
  });
}

export function sfxRespawn(): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  playOsc(c, _sfxBus, 200, "sine", t, 0.5, 0.32, 1200);
  playOsc(c, _sfxBus, 300, "triangle", t + 0.1, 0.38, 0.18, 1800);
}

export function sfxCountdown(isGo = false): void {
  const c = getCtx();
  if (!c || !_sfxBus) return;
  const t = c.currentTime;
  if (isGo) {
    [523.25, 659.25, 783.99].forEach((freq) =>
      playOsc(c, _sfxBus!, freq, "sine", t, 0.55, 0.2),
    );
    playOsc(c, _sfxBus, 1046.5, "square", t + 0.05, 0.45, 0.16);
  } else {
    playOsc(c, _sfxBus, 880, "sine", t, 0.13, 0.32);
    playOsc(c, _sfxBus, 1760, "sine", t, 0.07, 0.14);
  }
}

// ── Background music ──

const BPM = 128;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

let _musicPlaying = false;
let _musicScheduler: ReturnType<typeof setTimeout> | null = null;
let _nextBarAt = 0;

function scheduleBar(
  c: AudioContext,
  bus: GainNode,
  start: number,
): void {
  // Kick on beats 1 & 3
  [0, BEAT * 2].forEach((off) => {
    playOsc(c, bus, 75, "sine", start + off, 0.32, 0.38, 22);
    playNoise(c, bus, start + off, 0.05, 0.12, 220);
  });

  // Snare on 2 & 4
  [BEAT, BEAT * 3].forEach((off) => {
    playNoise(c, bus, start + off, 0.1, 0.13, 3500);
    playOsc(c, bus, 200, "triangle", start + off, 0.09, 0.07, 120);
  });

  // 16th-note hi-hats
  for (let i = 0; i < 16; i++) {
    const vol = i % 4 === 0 ? 0.08 : 0.035;
    playNoise(c, bus, start + i * (BEAT / 4), 0.025, vol, 9000);
  }

  // Bass line (C2)
  const bass = [65.41, 65.41, 73.42, 65.41, 73.42, 65.41, 82.41, 65.41];
  bass.forEach((freq, i) => {
    playOsc(c, bus, freq, "sawtooth", start + i * (BEAT / 2), BEAT * 0.42, 0.15);
  });

  // Pad chords (root + fifth, subtle)
  [
    [130.81, 196.0],
    [130.81, 196.0],
    [146.83, 220.0],
    [130.81, 196.0],
  ].forEach(([r, fifth], i) => {
    playOsc(c, bus, r, "triangle", start + i * BEAT, BEAT * 0.82, 0.055);
    playOsc(c, bus, fifth, "triangle", start + i * BEAT, BEAT * 0.82, 0.035);
  });
}

export function startMusic(): void {
  if (_musicPlaying) return;
  const c = getCtx();
  if (!c || !_musicBus) return;
  _musicPlaying = true;
  _nextBarAt = c.currentTime + 0.08;
  const bus = _musicBus;

  function tick() {
    if (!_musicPlaying || !c) return;
    const now = c.currentTime;
    while (_nextBarAt < now + BAR * 2) {
      scheduleBar(c, bus, _nextBarAt);
      _nextBarAt += BAR;
    }
    _musicScheduler = setTimeout(tick, BAR * 500);
  }
  tick();
}

export function stopMusic(): void {
  _musicPlaying = false;
  if (_musicScheduler !== null) {
    clearTimeout(_musicScheduler);
    _musicScheduler = null;
  }
}
