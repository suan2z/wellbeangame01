import * as THREE from 'three';

// 플레이어 앞·위(카메라 쪽 +Z)에서 화면 위쪽(-Z, 멀리=재앙)을 내려다본다.
// 플레이어는 카메라를 향해 달려오고, 등 뒤(위)로 화염벽·거대 운석이 보인다.
const OFFSET = new THREE.Vector3(0, 14, 24);
const LOOK = new THREE.Vector3(0, 2, -20);
const FOLLOW_LERP = 7;
const X_FOLLOW = 0.35; // 플레이어 좌우 추적 비율(부분 추적 → 길 전체 가시)

export class ChaseCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.shakeAmt = 0;
    this._sync(true);
  }

  shake(amount) { this.shakeAmt = Math.min(2.5, this.shakeAmt + amount); }

  _desired(out) {
    out.set(this.target.position.x * X_FOLLOW + OFFSET.x, OFFSET.y, OFFSET.z);
    return out;
  }

  _sync(instant) {
    this._desired(this._pos);
    this.camera.position.copy(this._pos);
    this._look.set(this.target.position.x * X_FOLLOW, LOOK.y, LOOK.z);
    this.camera.lookAt(this._look);
  }

  update(dt) {
    this._desired(this._pos);
    const k = Math.min(1, FOLLOW_LERP * dt);
    this.camera.position.lerp(this._pos, k);

    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.max(0, 1 - 6 * dt);
    }

    this._look.set(this.target.position.x * X_FOLLOW, LOOK.y, LOOK.z);
    this.camera.lookAt(this._look);
  }
}
