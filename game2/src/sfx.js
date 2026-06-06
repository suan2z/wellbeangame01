// Web Audio API 기반 즉석 합성 효과음 — 에셋 파일 불필요, 오프라인 동작.
// Lane Defense 2: 게이트 / 콤보 / 에어스트라이크 / 코인 사운드 추가.
const MUTE_KEY = 'lane-defense-2:muted';

export default class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.muted = this._loadMuted();
  }

  _loadMuted() {
    try { return globalThis.localStorage?.getItem(MUTE_KEY) === '1'; }
    catch { return false; }
  }

  setMuted(m) {
    this.muted = m;
    try { globalThis.localStorage?.setItem(MUTE_KEY, m ? '1' : '0'); } catch {}
  }

  toggle() { this.setMuted(!this.muted); return this.muted; }

  // 사용자 제스처(첫 터치) 후 호출해 오디오 잠금 해제
  resume() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  }

  _throttle(key, ms) {
    const now = Date.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  _tone(freq, dur, { type = 'square', vol = 0.12, slideTo = null, delay = 0 } = {}) {
    if (this.muted) return;
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch {}
  }

  _noise(dur, vol = 0.18, delay = 0) {
    if (this.muted) return;
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(gain).connect(ctx.destination);
      src.start(t0);
    } catch {}
  }

  shoot()      { if (this._throttle('shoot', 70)) this._tone(740, 0.05, { type: 'square',   vol: 0.035 }); }
  enemyDeath() { if (this._throttle('ed', 22))   this._tone(320, 0.08, { type: 'square',   vol: 0.06, slideTo: 120 }); }
  bossShoot()  { if (this._throttle('bs', 80))   this._tone(180, 0.08, { type: 'sawtooth', vol: 0.05, slideTo: 90 }); }
  bossHit()    { if (this._throttle('bh', 45))   this._tone(160, 0.05, { type: 'square',   vol: 0.05 }); }
  bossAppear() { this._tone(200, 0.5,  { type: 'sawtooth', vol: 0.12, slideTo: 460 }); }
  bossDeath()  { this._noise(0.5, 0.25); this._tone(120, 0.5, { type: 'sawtooth', vol: 0.15, slideTo: 40 }); }
  squadGain()  { this._tone(520, 0.1,  { type: 'triangle', vol: 0.1,  slideTo: 880 }); }
  squadLoss()  { this._tone(440, 0.15, { type: 'square',   vol: 0.1,  slideTo: 160 }); }
  pickup()     { this._tone(660, 0.08, { type: 'triangle', vol: 0.1,  slideTo: 990 }); }
  gameOver()   { this._tone(440, 0.8,  { type: 'sawtooth', vol: 0.15, slideTo: 110 }); }

  // ── Lane Defense 2 신규 ──
  coin()       { if (this._throttle('coin', 30)) this._tone(1180, 0.06, { type: 'triangle', vol: 0.06, slideTo: 1560 }); }
  gate()       { this._tone(330, 0.12, { type: 'triangle', vol: 0.12, slideTo: 660 });
                 this._tone(660, 0.14, { type: 'triangle', vol: 0.10, slideTo: 990, delay: 0.06 }); }
  // 콤보 마일스톤 — 높을수록 더 높은 톤
  combo(level) {
    const f = 520 + Math.min(level, 12) * 70;
    this._tone(f, 0.09, { type: 'square', vol: 0.07, slideTo: f * 1.4 });
  }
  // 에어스트라이크 — 발사 휘파람 + 폭발 연쇄
  airstrike() {
    this._tone(900, 0.25, { type: 'sawtooth', vol: 0.08, slideTo: 200 });
    for (let i = 0; i < 5; i++) this._noise(0.18, 0.22, 0.12 + i * 0.07);
    this._tone(90, 0.6, { type: 'sawtooth', vol: 0.14, slideTo: 40, delay: 0.12 });
  }
  ready()      { this._tone(720, 0.08, { type: 'triangle', vol: 0.09, slideTo: 1080 }); }
}
