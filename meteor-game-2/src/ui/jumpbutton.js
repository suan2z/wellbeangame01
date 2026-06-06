// 점프 컨트롤: 우측 하단 점프 버튼. 쿨타임 공유.
const ACTIVE_BG = 'rgba(255, 180, 80, 0.35)';
const ACTIVE_BORDER = 'rgba(255, 205, 110, 0.9)';
const ACTIVE_SHADOW = '0 0 22px rgba(255, 180, 80, 0.55)';
const DIM_BG = 'rgba(140, 140, 140, 0.30)';
const DIM_BORDER = 'rgba(160, 160, 160, 0.7)';

export class JumpButton {
  constructor(root, onJump) {
    this.root = root;
    this.onJump = onJump;
    this.cooldownMax = 0.9;
    this.cooldown = 0;
    this.btns = [this._createBtn('left')];
    for (const b of this.btns) root.appendChild(b.el);
  }

  _createBtn(side) {
    const posCss = side === 'left' ? 'left: 30px;' : 'right: 30px;';
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      ${posCss} bottom: 52px;
      width: 96px; height: 96px;
      border-radius: 50%;
      background: ${ACTIVE_BG};
      border: 3px solid ${ACTIVE_BORDER};
      box-shadow: ${ACTIVE_SHADOW};
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      z-index: 12;
      overflow: hidden;
      transition: transform 0.12s ease-out, background 0.15s, border-color 0.15s, box-shadow 0.15s;
    `;
    el.textContent = 'JUMP';

    const cd = document.createElement('div');
    cd.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(rgba(0, 0, 0, 0.55) 0deg, transparent 0deg);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s;
    `;
    el.appendChild(cd);

    el.addEventListener('pointerdown', this.onDown);
    return { el, cd };
  }

  onDown = (e) => {
    e.stopPropagation();
    if (this.cooldown > 0) return;
    if (this.onJump) this.onJump();
    this.cooldown = this.cooldownMax;
    this._flash();
  };

  _flash() {
    for (const b of this.btns) {
      b.el.style.transform = 'scale(1.18)';
    }
    setTimeout(() => {
      for (const b of this.btns) b.el.style.transform = 'scale(1)';
    }, 110);
  }

  update(dt) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      const remaining = this.cooldown / this.cooldownMax;
      const deg = remaining * 360;
      const sweep = `conic-gradient(rgba(0,0,0,0.55) ${deg}deg, transparent ${deg}deg)`;
      for (const b of this.btns) {
        b.cd.style.background = sweep;
        b.cd.style.opacity = '1';
        b.el.style.background = DIM_BG;
        b.el.style.borderColor = DIM_BORDER;
        b.el.style.boxShadow = 'none';
      }
      if (this.cooldown <= 0) {
        for (const b of this.btns) {
          b.cd.style.opacity = '0';
          b.el.style.background = ACTIVE_BG;
          b.el.style.borderColor = ACTIVE_BORDER;
          b.el.style.boxShadow = ACTIVE_SHADOW;
        }
      }
    }
  }
}
