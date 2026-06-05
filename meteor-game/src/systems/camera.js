import * as THREE from 'three';

const OFFSET = new THREE.Vector3(0, 7.5, 11);
const LOOK_AHEAD = new THREE.Vector3(0, 1.2, 0);
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
