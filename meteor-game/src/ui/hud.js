export class HUD {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed; top: 18px; left: 0; right: 0;
      text-align: center; color: #ffffff;
      font-family: 'JetBrains Mono', monospace; font-weight: bold;
      pointer-events: none; z-index: 12;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    `;
    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText = 'font-size: 32px; letter-spacing: 2px;';
    this.scoreEl = document.createElement('div');
    this.scoreEl.style.cssText = 'font-size: 16px; opacity: 0.85; margin-top: 4px;';
    this.el.appendChild(this.timeEl);
    this.el.appendChild(this.scoreEl);
    root.appendChild(this.el);

    this.gameOverEl = null;
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

  setScore(score) {
    this.scoreEl.textContent = `SCORE ${score}`;
  }

  showGameOver(seconds, onRestart) {
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
    title.style.cssText = 'font-size: 48px; font-weight: bold; color: #ff5577; margin-bottom: 12px;';
    const total = Math.floor(seconds * 100);
    const sec = Math.floor(total / 100);
    const cs  = total % 100;
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    const ccs = cs.toString().padStart(2, '0');
    const time = document.createElement('div');
    time.textContent = `생존 시간: ${mm}:${ss}.${ccs}`;
    time.style.cssText = 'font-size: 22px; color: #ffe066; margin-bottom: 24px;';
    const btn = document.createElement('button');
    btn.textContent = '▶ 다시하기';
    btn.style.cssText = `
      background: rgba(76, 194, 255, 0.25);
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
