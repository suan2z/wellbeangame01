import * as THREE from 'three';

const MOVE_SPEED = 9;
const TURN_LERP = 12;

// 캐릭터: 토르소 + 머리 + 양다리 + 양팔 + 발 밑 링
// 이동 시 다리/팔 스윙, 상체 약간 앞 기울이기, 가벼운 상하 바운스
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();

    // 상체 그룹 (애니메이션 시 살짝 회전/바운스)
    this.upper = new THREE.Group();
    this.upper.position.y = 0;
    this.mesh.add(this.upper);

    // 토르소
    const torsoGeo = new THREE.CapsuleGeometry(0.36, 0.7, 6, 10);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0xe0e8ff });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.15;
    this.upper.add(torso);

    // 머리
    const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf2d8b8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;
    this.upper.add(head);

    // 정면 표식
    const faceGeo = new THREE.BoxGeometry(0.12, 0.04, 0.04);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 1.88, 0.28);
    this.upper.add(face);

    // 양팔 (어깨에서 피벗)
    this.armL = this._limb(0.13, 0.6, 0xe0e8ff);
    this.armL.position.set(-0.4, 1.55, 0);
    this.upper.add(this.armL);
    this.armR = this._limb(0.13, 0.6, 0xe0e8ff);
    this.armR.position.set(0.4, 1.55, 0);
    this.upper.add(this.armR);

    // 양다리 (엉덩이에서 피벗)
    this.legL = this._limb(0.16, 0.7, 0x3a4a66);
    this.legL.position.set(-0.18, 0.7, 0);
    this.mesh.add(this.legL);
    this.legR = this._limb(0.16, 0.7, 0x3a4a66);
    this.legR.position.set(0.18, 0.7, 0);
    this.mesh.add(this.legR);

    // 발 밑 링
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
    this.onStep = null; // callback for footstep sfx
  }

  _limb(radius, length, color) {
    // 위쪽 끝(0)에서 아래로 -length 만큼 뻗는 막대. 피벗이 위쪽이라 다리/팔 회전 자연스러움.
    const geo = new THREE.CylinderGeometry(radius, radius * 0.85, length, 10);
    geo.translate(0, -length / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    return new THREE.Mesh(geo, mat);
  }

  update(dt, input, arenaRadius) {
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
    // arena bound clamp
    const r = Math.hypot(this.mesh.position.x, this.mesh.position.z);
    const limit = arenaRadius - 1;
    if (r > limit) {
      const k = limit / r;
      this.mesh.position.x *= k;
      this.mesh.position.z *= k;
    }
    // smooth turn
    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, TURN_LERP * dt);

    this._animate(dt, speedFactor);
  }

  _animate(dt, speedFactor) {
    // 이동 강도에 따라 보폭/주기 변동
    const stepFreq = 9 + speedFactor * 4; // rad/s 기준
    if (speedFactor > 0.05) {
      this.animTime += dt * stepFreq;
      const swing = Math.sin(this.animTime) * (0.35 + speedFactor * 0.25);
      this.legL.rotation.x =  swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.9;
      this.armR.rotation.x =  swing * 0.9;
      this.armL.rotation.z =  0.12;
      this.armR.rotation.z = -0.12;
      // 상체 살짝 앞으로 기울고 위아래 바운스
      this.upper.position.y = Math.abs(Math.sin(this.animTime)) * (0.06 + speedFactor * 0.08);
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -0.12 - speedFactor * 0.08, Math.min(1, 8 * dt));
      this.upper.rotation.z = Math.sin(this.animTime) * 0.04;
      // 발걸음 사운드: 다리가 가장 뒤로 갔을 때마다
      const stepIndex = Math.floor((this.animTime + Math.PI / 2) / Math.PI);
      if (stepIndex !== this.lastStep) {
        this.lastStep = stepIndex;
        if (this.onStep) this.onStep();
      }
    } else {
      // 대기: 가볍게 호흡
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
    this.upper.position.set(0, 0, 0);
    this.upper.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
  }
}
