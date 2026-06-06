// 점프 버튼: 캐릭터를 전방(현재 facing 방향)으로 빠르게 짧은 거리 이동.
// 1초 쿨타임 + 원형 파이 sweep으로 잔여 시간 시각화.
export class JumpButton {
  constructor(root, onJump) {
    this.root = root;
    this.onJump = onJump;
    this.cooldownMax = 1.0;
    this.cooldown = 0;

    this.btn = document.createElement('div');
    this.btn.style.cssText = `
      position: fixed;
      left: 50px; bottom: 200px;
      width: 96px; height: 96px;
      border-radius: 50%;
      background: rgba(255, 180, 80, 0.35);
      border: 3px solid rgba(255, 205, 110, 0.9);
      box-shadow: 0 0 22px rgba(255, 180, 80, 0.55);
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
    this.btn.textContent = 'JUMP';

    // 쿨타임 파이 오버레이 (conic-gradient sweep)
    this.cd = document.createElement('div');
    this.cd.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(rgba(0, 0, 0, 0.55) 0deg, transparent 0deg);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s;
    `;
    this.btn.appendChild(this.cd);

    root.appendChild(this.btn);

    this.btn.addEventListener('pointerdown', this.onDown);
  }

  onDown = (e) => {
    e.stopPropagation();
    if (this.cooldown > 0) return;
    if (this.onJump) this.onJump();
    this.cooldown = this.cooldownMax;
    this._flash();
  };

  _flash() {
    this.btn.style.transform = 'scale(1.18)';
    setTimeout(() => { this.btn.style.transform = 'scale(1)'; }, 110);
  }

  update(dt) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      const remaining = this.cooldown / this.cooldownMax; // 1 → 0
      const deg = remaining * 360;
      this.cd.style.background = `conic-gradient(rgba(0,0,0,0.55) ${deg}deg, transparent ${deg}deg)`;
      this.cd.style.opacity = '1';
      this.btn.style.background = 'rgba(140, 140, 140, 0.30)';
      this.btn.style.borderColor = 'rgba(160, 160, 160, 0.7)';
      this.btn.style.boxShadow = 'none';
      if (this.cooldown <= 0) {
        // 쿨타임 종료 — 다시 활성 상태로
        this.cd.style.opacity = '0';
        this.btn.style.background = 'rgba(255, 180, 80, 0.35)';
        this.btn.style.borderColor = 'rgba(255, 205, 110, 0.9)';
        this.btn.style.boxShadow = '0 0 22px rgba(255, 180, 80, 0.55)';
      }
    }
  }
}
