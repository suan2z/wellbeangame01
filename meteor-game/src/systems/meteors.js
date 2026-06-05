import * as THREE from 'three';

const POOL_SIZE = 48;
const FALL_SPEED_BASE = 18;

function rand(a, b) { return a + Math.random() * (b - a); }

export class MeteorSystem {
  constructor(scene, arenaRadius) {
    this.scene = scene;
    this.arenaRadius = arenaRadius;
    this.active = [];
    this.pool = [];
    this.shadowPool = [];
    this.spawnAccum = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const r = rand(0.7, 2.0);
      const geo = new THREE.IcosahedronGeometry(r, 0);
      // jitter vertices for irregular meteor look
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const f = 1 + (Math.random() - 0.5) * 0.25;
        pos.setX(j, pos.getX(j) * f);
        pos.setY(j, pos.getY(j) * f);
        pos.setZ(j, pos.getZ(j) * f);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: 0x886a4a, emissive: 0x331a00, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      const m = { mesh, radius: r, fallSpeed: FALL_SPEED_BASE, telegraph: 0, dropY: 0, rotX: 0, rotZ: 0 };
      this.pool.push(m);

      // shadow indicator (ground circle)
      const shGeo = new THREE.RingGeometry(r * 0.9, r * 1.05, 24);
      const shMat = new THREE.MeshBasicMaterial({ color: 0xff5577, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
      const shadow = new THREE.Mesh(shGeo, shMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.08;
      shadow.visible = false;
      scene.add(shadow);
      m.shadow = shadow;
    }
  }

  spawnInterval(elapsed) {
    // 시간 흐를수록 점점 자주
    return Math.max(0.18, 0.9 - elapsed * 0.012);
  }

  update(dt, elapsed) {
    this.spawnAccum += dt;
    const interval = this.spawnInterval(elapsed);
    while (this.spawnAccum >= interval) {
      this.spawnAccum -= interval;
      this.spawnOne(elapsed);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      if (m.telegraph > 0) {
        m.telegraph -= dt;
        m.shadow.material.opacity = THREE.MathUtils.clamp((1 - m.telegraph / 0.9) * 0.8, 0.2, 0.8);
        if (m.telegraph <= 0) {
          m.mesh.visible = true;
          m.shadow.material.opacity = 0.85;
        }
      } else {
        m.mesh.position.y -= m.fallSpeed * dt;
        m.mesh.rotation.x += m.rotX * dt;
        m.mesh.rotation.z += m.rotZ * dt;
        if (m.mesh.position.y <= m.radius) {
          this.recycle(m);
          this.active.splice(i, 1);
        }
      }
    }
  }

  spawnOne(elapsed) {
    const m = this.pool.pop();
    if (!m) return;
    // 캐릭터 주변(±arena) 범위에서 X/Z 선택
    const r = rand(2, this.arenaRadius - 8);
    const angle = rand(0, Math.PI * 2);
    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;
    m.mesh.position.set(tx, 70, tz);
    m.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    m.fallSpeed = FALL_SPEED_BASE + Math.min(elapsed * 0.4, 14);
    m.telegraph = 0.9; // 0.9s 동안 그림자만 보이고 떨어지지 않음
    m.rotX = rand(-2.5, 2.5);
    m.rotZ = rand(-2.5, 2.5);
    m.mesh.visible = false;
    m.shadow.position.set(tx, 0.08, tz);
    m.shadow.material.opacity = 0;
    m.shadow.visible = true;
    this.active.push(m);
  }

  recycle(m) {
    m.mesh.visible = false;
    m.shadow.visible = false;
    this.pool.push(m);
  }

  reset() {
    for (const m of this.active) this.recycle(m);
    this.active.length = 0;
    this.spawnAccum = 0;
  }
}
