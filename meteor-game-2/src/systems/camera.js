import * as THREE from 'three';

// 운석피하기1과 동일한 카메라: 낮은 시점 + 거의 수평(틸트 약간) → 하늘 가시 + 캐릭터 화면 중상단.
// 뒤(+Z)에서 화면 안쪽(-Z)을 비춘다. 거대 운석 충돌 시 흔들림(shake) 추가.
const OFFSET = new THREE.Vector3(0, 4, 14);
const LOOK_AHEAD = new THREE.Vector3(0, 3.5, 0);
const FOLLOW_LERP = 6;

export class ChaseCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this._tmp = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.shakeAmt = 0;
    this.camera.position.copy(this.target.position).add(OFFSET);
    this.camera.lookAt(this.target.position.clone().add(LOOK_AHEAD));
  }

  shake(amount) { this.shakeAmt = Math.min(2.5, this.shakeAmt + amount); }

  update(dt) {
    this._tmp.copy(this.target.position).add(OFFSET);
    const k = Math.min(1, FOLLOW_LERP * dt);
    this.camera.position.lerp(this._tmp, k);

    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.max(0, 1 - 6 * dt);
    }

    this._look.copy(this.target.position).add(LOOK_AHEAD);
    this.camera.lookAt(this._look);
  }
}
