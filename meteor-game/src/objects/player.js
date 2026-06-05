import * as THREE from 'three';

const MOVE_SPEED = 9;
const TURN_LERP = 12;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();
    // 몸통 — 캡슐
    const bodyGeo = new THREE.CapsuleGeometry(0.45, 1.0, 6, 10);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe0e8ff });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.95;
    this.mesh.add(body);
    // 머리
    const headGeo = new THREE.SphereGeometry(0.35, 16, 12);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf2d8b8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.95;
    this.mesh.add(head);
    // 정면 표식 (방향 인지용 작은 파랑 박스)
    const faceGeo = new THREE.BoxGeometry(0.15, 0.05, 0.05);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 1.95, 0.32);
    this.mesh.add(face);
    // 발 밑 지면 마커
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    this.footRing = new THREE.Mesh(ringGeo, ringMat);
    this.footRing.rotation.x = -Math.PI / 2;
    this.footRing.position.y = 0.06;
    this.mesh.add(this.footRing);

    scene.add(this.mesh);
    this.facing = 0; // y-rotation target
  }

  update(dt, input, arenaRadius) {
    const { x, y } = input; // joystick X/Y in [-1, 1]
    const mag = Math.min(1, Math.hypot(x, y));
    if (mag > 0.05) {
      const dirX = x / mag;
      const dirZ = y / mag; // 드래그 위 = 화면 안쪽(forward, -Z 방향)
      const speed = MOVE_SPEED * mag;
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
  }

  reset() {
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.facing = 0;
  }
}
