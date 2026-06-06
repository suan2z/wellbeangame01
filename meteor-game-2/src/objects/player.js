import * as THREE from 'three';
import { PLAYER_X_LIMIT } from '../constants.js';

const MOVE_SPEED = 9;
const TURN_LERP = 12;

// 운석피하기1과 동일한 캐릭터/조작: 조이스틱으로 자유 이동, 점프(회피 대시).
// 차이점: 원형 경기장 제한 대신 좌우(X)만 길 폭으로 제한, 앞뒤(Z)는 자유.
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();

    this.upper = new THREE.Group();
    this.upper.position.y = 0;
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
    face.position.set(0, 1.88, 0.28);
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

    this.facing = 0;
    this.animTime = 0;
    this.idleTime = 0;
    this.lastStep = -1;
    this.onStep = null;

    this.jumpActive = false;
    this.jumpTime = 0;
    this.jumpDuration = 0.32;
    this.jumpInitialSpeed = 38;
    this.jumpPeak = 1.5;
    this.jumpDirX = 0;
    this.jumpDirZ = 0;
  }

  jump() {
    if (this.jumpActive) return;
    this.jumpActive = true;
    this.jumpTime = 0;
    this.jumpDirX = Math.sin(this.facing);
    this.jumpDirZ = Math.cos(this.facing);
  }

  _limb(radius, length, color) {
    const geo = new THREE.CylinderGeometry(radius, radius * 0.85, length, 10);
    geo.translate(0, -length / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    return new THREE.Mesh(geo, mat);
  }

  // minZ: 이보다 안쪽(-Z, 무너진 길)으로는 못 들어가게 막음(붕괴 경계)
  update(dt, input, minZ = -Infinity) {
    const { x, y } = input;
    const mag = Math.min(1, Math.hypot(x, y));
    let speedFactor = 0;
    if (mag > 0.05) {
      const dirX = x / mag;
      const dirZ = y / mag;
      const speed = MOVE_SPEED * mag;
      speedFactor = mag;
      this.mesh.position.x += dirX * speed * dt;
      this.mesh.position.z += dirZ * speed * dt;
      this.facing = Math.atan2(dirX, dirZ);
    }
    if (this.jumpActive) {
      const t = this.jumpTime / this.jumpDuration;
      if (t >= 1) {
        this.jumpActive = false;
        this.mesh.position.y = 0;
      } else {
        const speed = this.jumpInitialSpeed * (1 - t);
        this.mesh.position.x += this.jumpDirX * speed * dt;
        this.mesh.position.z += this.jumpDirZ * speed * dt;
        this.mesh.position.y = Math.sin(t * Math.PI) * this.jumpPeak;
        this.jumpTime += dt;
      }
    }
    // 좌우(X)는 길 폭으로 제한, 무너진 길(minZ)보다 안쪽으로는 못 감
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
    if (this.mesh.position.z < minZ) this.mesh.position.z = minZ;

    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, TURN_LERP * dt);

    this._animate(dt, speedFactor);
  }

  _animate(dt, speedFactor) {
    if (this.jumpActive) {
      const t = this.jumpTime / this.jumpDuration;
      const pose = Math.sin(t * Math.PI);
      const armUp = -Math.PI * pose;
      this.armL.rotation.x = armUp;
      this.armR.rotation.x = armUp;
      this.armL.rotation.z = 0.4 * pose;
      this.armR.rotation.z = -0.4 * pose;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.legL.rotation.z = 0.18 * pose;
      this.legR.rotation.z = -0.18 * pose;
      this.upper.position.y = 0;
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -0.05 * pose, Math.min(1, 12 * dt));
      this.upper.rotation.z = 0;
      return;
    }
    const stepFreq = 9 + speedFactor * 4;
    if (speedFactor > 0.05) {
      this.animTime += dt * stepFreq;
      const swing = Math.sin(this.animTime) * (0.35 + speedFactor * 0.25);
      this.legL.rotation.x =  swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.9;
      this.armR.rotation.x =  swing * 0.9;
      this.armL.rotation.z =  0.12;
      this.armR.rotation.z = -0.12;
      this.upper.position.y = Math.abs(Math.sin(this.animTime)) * (0.06 + speedFactor * 0.08);
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -0.12 - speedFactor * 0.08, Math.min(1, 8 * dt));
      this.upper.rotation.z = Math.sin(this.animTime) * 0.04;
      const stepIndex = Math.floor((this.animTime + Math.PI / 2) / Math.PI);
      if (stepIndex !== this.lastStep) {
        this.lastStep = stepIndex;
        if (this.onStep) this.onStep();
      }
    } else {
      this.idleTime += dt;
      const ease = Math.min(1, 6 * dt);
      this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0, ease);
      this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0, ease);
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0, ease);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, ease);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.05, ease);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.05, ease);
      this.upper.position.y = Math.sin(this.idleTime * 2.2) * 0.025;
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, 0, ease);
      this.upper.rotation.z = THREE.MathUtils.lerp(this.upper.rotation.z, 0, ease);
    }
  }

  reset() {
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.facing = 0;
    this.animTime = 0;
    this.idleTime = 0;
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
