import * as THREE from 'three';
import { PLAYER_X_LIMIT } from '../constants.js';

const STEER_SPEED = 16;   // 좌우 이동 속도
const BANK = 0.35;        // 조향 시 기울임
const BASE_FACING = Math.PI; // 카메라(+Z)를 바라봄 — 도망치며 앞모습이 보임

// 캐릭터: 토르소 + 머리 + 양다리 + 양팔. 항상 전방(-Z)으로 질주.
// 조이스틱 X로 좌우 이동, 점프로 회피. (전진은 자동 — 월드가 스크롤된다)
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();

    this.upper = new THREE.Group();
    this.mesh.add(this.upper);

    const torsoGeo = new THREE.CapsuleGeometry(0.36, 0.7, 6, 10);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0xe0e8ff });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.15;
    this.upper.add(torso);

    const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf2d8b8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;
    this.upper.add(head);

    const faceGeo = new THREE.BoxGeometry(0.12, 0.04, 0.04);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 1.88, -0.28); // 전방(-Z)을 바라봄
    this.upper.add(face);

    this.armL = this._limb(0.13, 0.6, 0xe0e8ff);
    this.armL.position.set(-0.4, 1.55, 0);
    this.upper.add(this.armL);
    this.armR = this._limb(0.13, 0.6, 0xe0e8ff);
    this.armR.position.set(0.4, 1.55, 0);
    this.upper.add(this.armR);

    this.legL = this._limb(0.16, 0.7, 0x3a4a66);
    this.legL.position.set(-0.18, 0.7, 0);
    this.mesh.add(this.legL);
    this.legR = this._limb(0.16, 0.7, 0x3a4a66);
    this.legR.position.set(0.18, 0.7, 0);
    this.mesh.add(this.legR);

    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    this.footRing = new THREE.Mesh(ringGeo, ringMat);
    this.footRing.rotation.x = -Math.PI / 2;
    this.footRing.position.y = 0.06;
    this.mesh.add(this.footRing);

    scene.add(this.mesh);
    this.mesh.rotation.y = BASE_FACING;

    this.animTime = 0;
    this.lastStep = -1;
    this.onStep = null;

    // jump (수직 회피 도약)
    this.jumpActive = false;
    this.jumpTime = 0;
    this.jumpDuration = 0.6;
    this.jumpPeak = 2.6;
  }

  get airborne() { return this.jumpActive; }

  jump() {
    if (this.jumpActive) return;
    this.jumpActive = true;
    this.jumpTime = 0;
  }

  _limb(radius, length, color) {
    const geo = new THREE.CylinderGeometry(radius, radius * 0.85, length, 10);
    geo.translate(0, -length / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    return new THREE.Mesh(geo, mat);
  }

  // input.x: 좌(-1)~우(+1) 조향. runFactor: 질주 강도(애니 속도용)
  update(dt, input, runFactor = 1) {
    const steer = THREE.MathUtils.clamp(input.x, -1, 1);
    this.mesh.position.x += steer * STEER_SPEED * dt;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
    // 조향 시 몸을 살짝 기울이고 진행 방향으로 약간 비틀기 (카메라를 바라본 채)
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, steer * BANK, Math.min(1, 10 * dt));
    this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, BASE_FACING + steer * 0.25, Math.min(1, 10 * dt));

    if (this.jumpActive) {
      const t = this.jumpTime / this.jumpDuration;
      if (t >= 1) {
        this.jumpActive = false;
        this.mesh.position.y = 0;
      } else {
        this.mesh.position.y = Math.sin(t * Math.PI) * this.jumpPeak;
        this.jumpTime += dt;
      }
    }

    this._animate(dt, runFactor);
  }

  _animate(dt, runFactor) {
    if (this.jumpActive) {
      const t = this.jumpTime / this.jumpDuration;
      const pose = Math.sin(t * Math.PI);
      const armUp = -Math.PI * 0.9 * pose;
      this.armL.rotation.x = armUp;
      this.armR.rotation.x = armUp;
      this.armL.rotation.z = 0.4 * pose;
      this.armR.rotation.z = -0.4 * pose;
      // 다리 모으기
      this.legL.rotation.x = -0.3 * pose;
      this.legR.rotation.x = 0.3 * pose;
      this.legL.rotation.z = 0;
      this.legR.rotation.z = 0;
      this.upper.position.y = 0;
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -0.05, Math.min(1, 12 * dt));
      return;
    }
    // 항상 질주
    const stepFreq = 11 + runFactor * 5;
    this.animTime += dt * stepFreq;
    const swing = Math.sin(this.animTime) * 0.55;
    this.legL.rotation.x =  swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.9;
    this.armR.rotation.x =  swing * 0.9;
    this.armL.rotation.z =  0.12;
    this.armR.rotation.z = -0.12;
    this.upper.position.y = Math.abs(Math.sin(this.animTime)) * 0.12;
    this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -0.16, Math.min(1, 8 * dt));

    const stepIndex = Math.floor((this.animTime + Math.PI / 2) / Math.PI);
    if (stepIndex !== this.lastStep) {
      this.lastStep = stepIndex;
      if (this.onStep) this.onStep();
    }
  }

  reset() {
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, BASE_FACING, 0);
    this.animTime = 0;
    this.lastStep = -1;
    this.jumpActive = false;
    this.jumpTime = 0;
    this.upper.position.set(0, 0, 0);
    this.upper.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
  }
}
