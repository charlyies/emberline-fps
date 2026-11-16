// Synthesised WebAudio sound only — no audio files. Every effect is built from
// oscillators and filtered noise, per weapon where it matters.
export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function noiseBurst(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ensure() || muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }
  function tone(freq, dur, type = 'sine', gainVal = 0.2, slideTo = null, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    shoot(kind) {
      if (kind === 'sniper') { noiseBurst(0.28, 900, 0.9); tone(160, 0.18, 'sawtooth', 0.25, 50); }
      else if (kind === 'rifle') { noiseBurst(0.14, 1600, 0.7); tone(190, 0.09, 'square', 0.16, 70); }
      else if (kind === 'smg') { noiseBurst(0.09, 2200, 0.5); tone(240, 0.06, 'square', 0.12, 90); }
      else { noiseBurst(0.11, 1400, 0.6); tone(170, 0.08, 'square', 0.15, 60); }
    },
    enemyShoot(dist) { const v = Math.max(0.08, 0.5 - dist * 0.008); noiseBurst(0.1, 1200, v); },
    dryFire() { tone(900, 0.04, 'square', 0.1); },
    reload() { tone(500, 0.05, 'square', 0.12); tone(700, 0.05, 'square', 0.12, null, 0.35); tone(900, 0.06, 'square', 0.14, null, 0.7); },
    hit() { tone(1200, 0.06, 'sine', 0.25); },
    kill() { tone(880, 0.09, 'sine', 0.25); tone(1320, 0.14, 'sine', 0.25, null, 0.09); },
    hurt() { tone(140, 0.15, 'sawtooth', 0.25, 70); },
    step() { noiseBurst(0.05, 500, 0.12); },
    enemyStep(dist) { const v = Math.max(0.03, 0.22 - dist * 0.02); noiseBurst(0.05, 400, v); },
    tick() { tone(1000, 0.05, 'square', 0.1); },
    captureTick() { tone(1000, 0.07, 'sine', 0.2); },
    captureDone() { tone(660, 0.12, 'sine', 0.25); tone(990, 0.2, 'sine', 0.25, null, 0.12); },
    roundStart() { tone(440, 0.15, 'square', 0.18); tone(660, 0.25, 'square', 0.18, null, 0.15); },
    roundWin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, null, i * 0.13)); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.2, null, i * 0.16)); },
    buy() { tone(740, 0.07, 'sine', 0.2); tone(1108, 0.1, 'sine', 0.2, null, 0.07); },
    denied() { tone(220, 0.12, 'square', 0.18, 160); },
    throwGrenade() { noiseBurst(0.12, 3000, 0.25, 'highpass'); },
    contact() { tone(520, 0.07, 'square', 0.12); tone(660, 0.07, 'square', 0.12, null, 0.09); },
    explosion(dist) {
      // Deep boom that carries: loud up close, a dull thump from across the yard.
      const v = Math.max(0.15, 1 - dist * 0.02);
      noiseBurst(0.5, 320, v);
      tone(90, 0.4, 'sine', 0.5 * v, 35);
      tone(55, 0.55, 'triangle', 0.4 * v, 28, 0.05);
    },
  };
}
