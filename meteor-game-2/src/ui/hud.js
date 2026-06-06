export class HUD {
  constructor(root, sfx = null) {
    this.root = root;
    this.sfx = sfx;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed; top: 18px; left: 0; right: 0;
      text-align: center; color: #ffffff;
      font-family: 'JetBrains Mono', monospace; font-weight: bold;
      pointer-events: none; z-index: 12;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    `;
    this.distEl = document.createElement('div');
    this.distEl.style.cssText = 'font-size: 32px; letter-spacing: 2px;';
    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText = 'font-size: 16px; opacity: 0.85; margin-top: 4px;';
    this.el.appendChild(this.distEl);
    this.el.appendChild(this.timeEl);
    root.appendChild(this.el);

    // 위험도 게이지 (화염벽 거리) — 하단 가로 바
    this.dangerWrap = document.createElement('div');
    this.dangerWrap.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%); bottom: 8px;
      width: 200px; height: 10px; border-radius: 6px;
      background: rgba(255,255,255,0.15); overflow: hidden;
      border: 1.5px solid rgba(255,255,255,0.3);
      pointer-events: none; z-index: 12;
    `;
    this.dangerFill = document.createElement('div');
    this.dangerFill.style.cssText = `
      position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
      background: linear-gradient(90deg, #ffd24c, #ff6a2a, #ff2010);
      transition: width 0.1s linear;
    `;
    this.dangerWrap.appendChild(this.dangerFill);
    root.appendChild(this.dangerWrap);

    this.dangerLabel = document.createElement('div');
    this.dangerLabel.textContent = '🔥 추격';
    this.dangerLabel.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: bold;
      color: #ffd0b0; text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      pointer-events: none; z-index: 12;
    `;
    root.appendChild(this.dangerLabel);

    this.gameOverEl = null;

    if (this.sfx) {
      this.muteBtn = document.createElement('div');
      this.muteBtn.style.cssText = `
        position: fixed; right: 18px; top: 18px;
        padding: 6px 12px; font-family: 'JetBrains Mono', monospace;
        font-size: 14px; color: #ffffffcc; font-weight: bold;
        border: 1.5px solid rgba(255,255,255,0.35); border-radius: 6px;
        background: rgba(0,0,0,0.35); cursor: pointer; z-index: 13;
        touch-action: manipulation;
      `;
      const refresh = () => { this.muteBtn.textContent = this.sfx.muted ? '🔇 소리 OFF' : '🔊 소리 ON'; };
      refresh();
      this.muteBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.sfx.resume();
        this.sfx.toggle();
        refresh();
      });
      root.appendChild(this.muteBtn);
    }
  }

  setDistance(meters) {
    this.distEl.textContent = `${Math.floor(meters)} m`;
  }

  setTime(seconds) {
    const total = Math.floor(seconds * 100);
    const sec = Math.floor(total / 100);
    const cs  = total % 100;
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    const ccs = cs.toString().padStart(2, '0');
    this.timeEl.textContent = `TIME ${mm}:${ss}.${ccs}`;
  }

  // danger 0(안전)~1(위급)
  setDanger(danger) {
    this.dangerFill.style.width = `${Math.round(danger * 100)}%`;
  }

  showGameOver(meters, seconds, cause, onRestart) {
    if (this.gameOverEl) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.65); color: #fff;
      font-family: 'JetBrains Mono', monospace; z-index: 20;
    `;
    const title = document.createElement('div');
    title.textContent = 'GAME OVER';
    title.style.cssText = 'font-size: 48px; font-weight: bold; color: #ff5577; margin-bottom: 8px;';
    const causeEl = document.createElement('div');
    causeEl.textContent = cause || '';
    causeEl.style.cssText = 'font-size: 15px; color: #ffb0b0; margin-bottom: 16px;';
    const dist = document.createElement('div');
    dist.textContent = `질주 거리: ${Math.floor(meters)} m`;
    dist.style.cssText = 'font-size: 24px; color: #ffe066; margin-bottom: 4px;';
    const sec = Math.floor(seconds);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    const time = document.createElement('div');
    time.textContent = `생존 시간: ${mm}:${ss}`;
    time.style.cssText = 'font-size: 18px; color: #ffd0a0; margin-bottom: 24px;';
    const btn = document.createElement('button');
    btn.textContent = '▶ 다시하기';
    btn.style.cssText = `
      background: rgba(255, 140, 60, 0.25);
      color: #fff; border: 3px solid #fff;
      padding: 18px 36px; font-size: 24px;
      font-family: inherit; font-weight: bold;
      border-radius: 12px; cursor: pointer;
      animation: blink 0.9s linear infinite alternate;
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes blink { from { opacity: 1; } to { opacity: 0.55; } }';
    document.head.appendChild(style);
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onRestart();
    });
    wrap.appendChild(title);
    wrap.appendChild(causeEl);
    wrap.appendChild(dist);
    wrap.appendChild(time);
    wrap.appendChild(btn);
    this.root.appendChild(wrap);
    this.gameOverEl = wrap;
  }

  hideGameOver() {
    if (this.gameOverEl) {
      this.gameOverEl.remove();
      this.gameOverEl = null;
    }
  }
}
