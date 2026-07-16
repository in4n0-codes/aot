// Procedural SFX — no assets, everything synthesized via WebAudio (the show's
// actual audio is copyrighted, so these are original approximations of the
// ODM gas hiss and a blade slice). The AudioContext must be created from a
// user gesture (the deploy click).
let ctx = null;

export function initAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(dur) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// ---- ODM gas: a continuous pressurised hiss/jet that swells while boosting ----
let gasNodes = null;
export function setGas(on) {
  if (!ctx) return;
  if (!gasNodes) {
    if (!on) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.2); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.5;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(ctx.destination);
    src.start();
    gasNodes = { gain };
  }
  const t = ctx.currentTime;
  gasNodes.gain.gain.cancelScheduledValues(t);
  // Fast attack when the jet fires, quick release when it stops.
  gasNodes.gain.gain.setTargetAtTime(on ? 0.14 : 0.0, t, on ? 0.02 : 0.06);
}

// ---- Deep ground rumble for the colossal's arrival ----
export function playRumble(dur = 9) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur); src.loop = false;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 1.6);
  g.gain.setValueAtTime(0.5, t + dur - 2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + dur);
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 34;
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.22, t + 1.8);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(og).connect(ctx.destination);
  o.start(t); o.stop(t + dur);
}

// ---- Lightning strike: sharp crack, then rolling thunder ----
export function playThunder() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const crack = ctx.createBufferSource(); crack.buffer = noiseBuffer(0.12);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.85, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  crack.connect(hp).connect(cg).connect(ctx.destination);
  crack.start(t); crack.stop(t + 0.14);
  const roll = ctx.createBufferSource(); roll.buffer = noiseBuffer(2.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(90, t + 2.4);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
  roll.connect(lp).connect(rg).connect(ctx.destination);
  roll.start(t); roll.stop(t + 2.6);
}

// ---- The kick: a massive stone-shattering boom ----
export function playImpact() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(22, t + 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 1.05);
  const crash = ctx.createBufferSource(); crash.buffer = noiseBuffer(0.9);
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass';
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(200, t + 0.8);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.55, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  crash.connect(bp).connect(cg).connect(ctx.destination);
  crash.start(t); crash.stop(t + 0.9);
}

// ---- Blade slice: metallic shing + a downward swish + a wet chunk ----
export function playSlashHit() {
  if (!ctx) return;
  const t = ctx.currentTime;

  // Steel ring: two detuned high tones sliding down, very fast decay.
  for (const f of [3200, 4700]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.17);
  }

  // Swish: band-passed noise sweeping high→low — the blade cutting through.
  const swish = ctx.createBufferSource(); swish.buffer = noiseBuffer(0.14);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.3;
  bp.frequency.setValueAtTime(4400, t);
  bp.frequency.exponentialRampToValueAtTime(700, t + 0.1);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.42, t + 0.005);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  swish.connect(bp).connect(sg).connect(ctx.destination);
  swish.start(t); swish.stop(t + 0.14);

  // Wet chunk: low thud for the flesh.
  const thud = ctx.createOscillator(), tg = ctx.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(150, t);
  thud.frequency.exponentialRampToValueAtTime(55, t + 0.13);
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.33, t + 0.008);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  thud.connect(tg).connect(ctx.destination);
  thud.start(t); thud.stop(t + 0.18);
}
