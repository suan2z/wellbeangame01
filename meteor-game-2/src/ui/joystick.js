// 화면 하단 가상 조이스틱 (좌우 조향 — x축 사용)
export class Joystick {
  constructor(root, onActivate = null) {
    this.root = root;
    this.onActivate = onActivate;
    this.x = 0;
    this.y = 0;
    this.activePointer = null;
    this.center = { x: 0, y: 0 };
    this.maxRadius = 60;

    this.base = document.createElement('div');
    this.base.style.cssText = `
      position: fixed; left: calc(50% - 73px); bottom: 30px;
      width: 140px; height: 140px;
      border-radius: 50%;
      background: rgba(76, 194, 255, 0.15);
      border: 3px solid rgba(76, 194, 255, 0.45);
      pointer-events: none; touch-action: none;
      z-index: 10;
    `;
    this.knob = document.createElement('div');
    this.knob.style.cssText = `
      position: absolute; left: 50%; top: 50%;
      width: 64px; height: 64px;
      margin: -32px 0 0 -32px;
      border-radius: 50%;
      background: rgba(76, 194, 255, 0.55);
      box-shadow: 0 0 16px rgba(76, 194, 255, 0.5);
      transition: transform 0.05s linear;
    `;
    this.base.appendChild(this.knob);
    root.appendChild(this.base);

    this.touchZone = document.createElement('div');
    this.touchZone.style.cssText = `
      position: fixed; left: 0; bottom: 0;
      width: 100%; height: 50%;
      z-index: 9; touch-action: none;
    `;
    root.appendChild(this.touchZone);

    this.touchZone.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  handleResize(/* w, h */) {}

  onDown = (e) => {
    if (this.activePointer !== null) return;
    this.activePointer = e.pointerId;
    this.center.x = e.clientX;
    this.center.y = e.clientY;
    this.update(e.clientX, e.clientY);
    if (this.onActivate) this.onActivate();
  };

  onMove = (e) => {
    if (this.activePointer !== e.pointerId) return;
    this.update(e.clientX, e.clientY);
  };

  onUp = (e) => {
    if (this.activePointer !== e.pointerId) return;
    this.activePointer = null;
    this.x = 0;
    this.y = 0;
    this.knob.style.transform = 'translate(0, 0)';
  };

  update(cx, cy) {
    const dx = cx - this.center.x;
    const dy = cy - this.center.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(this.maxRadius, dist);
    const nx = (dist > 0 ? dx / dist : 0) * clamped;
    const ny = (dist > 0 ? dy / dist : 0) * clamped;
    this.x = nx / this.maxRadius;
    this.y = ny / this.maxRadius;
    this.base.style.left = (this.center.x - 70) + 'px';
    this.base.style.top  = (this.center.y - 70) + 'px';
    this.base.style.bottom = 'auto';
    this.knob.style.transform = `translate(${nx}px, ${ny}px)`;
  }

  getInput() {
    return { x: this.x, y: this.y };
  }
}
