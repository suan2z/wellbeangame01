import * as THREE from 'three';

// 캐릭터 화면 3/5 위치(상단 기준 60%) + 틸트 완화 (하늘 더 보이도록)
const OFFSET = new THREE.Vector3(0, 8, 14);
const LOOK_AHEAD = new THREE.Vector3(0, 3.5, 0);
const FOLLOW_LERP = 6;

export class ChaseCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this._tmp = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.camera.position.copy(this.target.position).add(OFFSET);
    this.camera.lookAt(this.target.position.clone().add(LOOK_AHEAD));
  }

  update(dt) {
    this._tmp.copy(this.target.position).add(OFFSET);
    const k = Math.min(1, FOLLOW_LERP * dt);
    this.camera.position.lerp(this._tmp, k);
    this._look.copy(this.target.position).add(LOOK_AHEAD);
    this.camera.lookAt(this._look);
  }
}
