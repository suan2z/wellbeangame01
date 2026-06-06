// Web Audio API 즉석 합성 — 에셋 파일 없음, 오프라인 동작
const MUTE_KEY = 'meteor-dash:muted';

export default class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.muted = this._loadMuted();
  }

  _loadMuted() {
    try { return globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
  }
  setMuted(m) {
    this.muted = m;
    try { globalThis.localStorage?.setItem(MUTE_KEY, m ? '1' : '0'); } catch {}
  }
  toggle() { this.setMuted(!this.muted); return this.muted; }

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
  _tone(freq, dur, { type = 'square', vol = 0.12, slideTo = null } = {}) {
    if (this.muted) return;
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
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
  _noise(dur, vol = 0.18, { type = 'white', filter = null } = {}) {
    if (this.muted) return;
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        let v = Math.random() * 2 - 1;
        if (type === 'brown') { last = (last + 0.03 * v) / 1.03; v = last * 3.5; }
        data[i] = v;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = src;
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.value = filter.freq || 800;
        src.connect(f); node = f;
      }
      node.connect(gain).connect(ctx.destination);
      src.start(t0);
    } catch {}
  }

  // 경고 신호 (작은 운석 텔레그래프)
  warning() {
    if (this._throttle('warn', 120)) this._tone(880, 0.12, { type: 'square', vol: 0.05, slideTo: 660 });
  }
  // 운석 떨어지는 휘파람 (낙하 시작)
  whoosh() {
    if (this._throttle('whoosh', 80)) this._tone(540, 0.5, { type: 'sawtooth', vol: 0.06, slideTo: 90 });
  }
  // 작은 운석 충돌 폭발 (지면 임팩트)
  impact() {
    if (this._throttle('impact', 50)) {
      this._noise(0.4, 0.3, { type: 'brown', filter: { type: 'lowpass', freq: 500 } });
      this._tone(80, 0.45, { type: 'sawtooth', vol: 0.18, slideTo: 30 });
    }
  }
  // 거대 운석 예고 사이렌
  siren() {
    if (this._throttle('siren', 400)) {
      this._tone(440, 0.5, { type: 'sawtooth', vol: 0.08, slideTo: 620 });
      this._tone(330, 0.5, { type: 'square', vol: 0.05, slideTo: 470 });
    }
  }
  // 거대 운석 강타 (길 전체 파괴)
  bigImpact() {
    if (this._throttle('big', 200)) {
      this._noise(1.1, 0.42, { type: 'brown', filter: { type: 'lowpass', freq: 320 } });
      this._tone(60, 1.0, { type: 'sawtooth', vol: 0.22, slideTo: 22 });
      this._tone(120, 0.7, { type: 'square', vol: 0.12, slideTo: 40 });
    }
  }
  // 발걸음 (가벼움)
  footstep() {
    if (this._throttle('foot', 110)) this._tone(180, 0.06, { type: 'square', vol: 0.04, slideTo: 100 });
  }
  // 게임 오버 (강한 임팩트 + 하강음)
  gameOver() {
    this._noise(0.5, 0.35, { type: 'brown', filter: { type: 'lowpass', freq: 400 } });
    this._tone(220, 0.9, { type: 'sawtooth', vol: 0.15, slideTo: 55 });
  }
  // UI 버튼 클릭
  click() { this._tone(660, 0.06, { type: 'triangle', vol: 0.1, slideTo: 880 }); }
}
