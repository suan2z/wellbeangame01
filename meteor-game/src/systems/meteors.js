import * as THREE from 'three';

const FALL_SPEED_BASE = 18;

// 4 티어: small(현재 기본) → medium → large → huge
// weight 합 = 1.0 (가중 랜덤 스폰), count 합 = 48 (풀 크기)
const TIERS = [
  { name: 'small',  rMin: 0.7, rMax: 1.0, count: 24, weight: 0.50, color: 0x886a4a, emissive: 0x331a00 },
  { name: 'medium', rMin: 1.3, rMax: 1.7, count: 14, weight: 0.27, color: 0x8a5e3a, emissive: 0x3a1500 },
  { name: 'large',  rMin: 2.0, rMax: 2.5, count: 7,  weight: 0.15, color: 0x995030, emissive: 0x501800 },
  { name: 'huge',   rMin: 2.9, rMax: 3.5, count: 3,  weight: 0.08, color: 0xaa4525, emissive: 0x661500 },
];

function rand(a, b) { return a + Math.random() * (b - a); }

function pickTierIndex() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < TIERS.length; i++) {
    acc += TIERS[i].weight;
    if (r < acc) return i;
  }
  return 0;
}

export class MeteorSystem {
  constructor(scene, arenaRadius) {
    this.scene = scene;
    this.arenaRadius = arenaRadius;
    this.active = [];
    this.pools = TIERS.map(() => []);
    this.spawnAccum = 0;
    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t];
      for (let i = 0; i < tier.count; i++) {
        const r = rand(tier.rMin, tier.rMax);
        const geo = new THREE.IcosahedronGeometry(r, 0);
        const pos = geo.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const f = 1 + (Math.random() - 0.5) * 0.25;
          pos.setX(j, pos.getX(j) * f);
          pos.setY(j, pos.getY(j) * f);
          pos.setZ(j, pos.getZ(j) * f);
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ color: tier.color, emissive: tier.emissive, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        const m = { mesh, radius: r, tier: t, fallSpeed: FALL_SPEED_BASE, telegraph: 0, dropY: 0, rotX: 0, rotZ: 0 };

        const shGeo = new THREE.RingGeometry(r * 0.9, r * 1.05, 24);
        const shMat = new THREE.MeshBasicMaterial({ color: 0xff5577, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
        const shadow = new THREE.Mesh(shGeo, shMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.08;
        shadow.visible = false;
        scene.add(shadow);
        m.shadow = shadow;
        this.pools[t].push(m);
      }
    }
  }

  spawnInterval(elapsed) {
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
        m.shadow.material.opacity = THREE.MathUtils.clamp((1 - m.telegraph / 1.2) * 0.8, 0.2, 0.8);
        if (m.telegraph <= 0) {
          m.mesh.visible = true;
          m.shadow.material.opacity = 0.85;
          if (this.onFallStart) this.onFallStart();
        }
      } else {
        m.mesh.position.y -= m.fallSpeed * dt;
        m.mesh.rotation.x += m.rotX * dt;
        m.mesh.rotation.z += m.rotZ * dt;
        if (m.mesh.position.y <= m.radius) {
          if (this.onImpact) this.onImpact(m.mesh.position.x, m.radius, m.mesh.position.z, m.radius);
          this.recycle(m);
          this.active.splice(i, 1);
        }
      }
    }
  }

  pickFromPool() {
    let t = pickTierIndex();
    for (let attempt = 0; attempt < TIERS.length; attempt++) {
      if (this.pools[t].length > 0) return this.pools[t].pop();
      t = (t + 1) % TIERS.length;
    }
    return null;
  }

  spawnOne(elapsed) {
    const m = this.pickFromPool();
    if (!m) return;
    const r = rand(2, this.arenaRadius - 8);
    const angle = rand(0, Math.PI * 2);
    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;
    m.mesh.position.set(tx, 40, tz);
    m.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    // 큰 운석은 살짝 더 느리게 (반응 시간 확보 + 드라마틱한 낙하)
    const speedBias = 1 - m.tier * 0.07;
    m.fallSpeed = (FALL_SPEED_BASE + Math.min(elapsed * 0.4, 14)) * speedBias;
    m.telegraph = 1.2;
    m.rotX = rand(-2.5, 2.5);
    m.rotZ = rand(-2.5, 2.5);
    m.mesh.visible = false;
    m.shadow.position.set(tx, 0.08, tz);
    m.shadow.material.opacity = 0;
    m.shadow.visible = true;
    this.active.push(m);
    if (this.onTelegraph) this.onTelegraph();
  }

  recycle(m) {
    m.mesh.visible = false;
    m.shadow.visible = false;
    this.pools[m.tier].push(m);
  }

  reset() {
    for (const m of this.active) this.recycle(m);
    this.active.length = 0;
    this.spawnAccum = 0;
  }
}
