import * as THREE from 'three';

const FALL_SPEED_BASE = 18;
const SPAWN_Y = 40;
// 대각선 낙하: vz/vy 비율. 0.5 → 수직에서 약 26.6° 기울어진 궤도
// 운석이 화면 뒤쪽(−Z, 멀리)에서 시작해 캐릭터쪽(+Z 방향)으로 다가오며 떨어짐
const DIAGONAL_SLOPE = 0.5;
// 캐릭터 조준 운석 간격 (2~3초마다 1회)
const AIMED_INTERVAL_MIN = 2.0;
const AIMED_INTERVAL_MAX = 3.0;

// 살보(volley) 폭격: 60초 이후 8~12초마다 캐릭터 주변 원형으로 6발 동시 낙하
const SALVO_START = 60.0;
const SALVO_INTERVAL_MIN = 8.0;
const SALVO_INTERVAL_MAX = 12.0;
const SALVO_COUNT = 6;
const SALVO_RADIUS_MIN = 4;
const SALVO_RADIUS_MAX = 12;
const SALVO_TELEGRAPH = 1.5; // 조금 더 긴 예고 시간 (회피 윈도우 확보)

const TIERS = [
  { name: 'small',  rMin: 0.7, rMax: 1.0, count: 24, weight: 0.50, detail: 0, color: 0x886a4a, emissive: 0x331a00 },
  { name: 'medium', rMin: 1.8, rMax: 2.5, count: 14, weight: 0.27, detail: 0, color: 0x8a5e3a, emissive: 0x3a1500 },
  { name: 'large',  rMin: 3.5, rMax: 5.0, count: 8,  weight: 0.16, detail: 1, color: 0x995030, emissive: 0x501800 },
  { name: 'huge',   rMin: 7.0, rMax: 10.0, count: 2, weight: 0.07, detail: 1, color: 0xaa4525, emissive: 0x661500 },
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
  constructor(scene, arenaRadius, player) {
    this.scene = scene;
    this.arenaRadius = arenaRadius;
    this.player = player;
    this.active = [];
    this.pools = TIERS.map(() => []);
    this.spawnAccum = 0;
    this._aimedAccum = 0;
    this._aimedInterval = rand(AIMED_INTERVAL_MIN, AIMED_INTERVAL_MAX);
    this._salvoAccum = 0;
    this._salvoInterval = rand(SALVO_INTERVAL_MIN, SALVO_INTERVAL_MAX);
    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t];
      for (let i = 0; i < tier.count; i++) {
        const r = rand(tier.rMin, tier.rMax);
        const geo = new THREE.IcosahedronGeometry(r, tier.detail);
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
        const m = { mesh, radius: r, tier: t, vy: FALL_SPEED_BASE, vz: 0, telegraph: 0, rotX: 0, rotZ: 0 };

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

    this._aimedAccum += dt;
    if (this._aimedAccum >= this._aimedInterval) {
      this._aimedAccum = 0;
      this._aimedInterval = rand(AIMED_INTERVAL_MIN, AIMED_INTERVAL_MAX);
      this.spawnAimed(elapsed);
    }

    if (elapsed >= SALVO_START) {
      this._salvoAccum += dt;
      if (this._salvoAccum >= this._salvoInterval) {
        this._salvoAccum = 0;
        this._salvoInterval = rand(SALVO_INTERVAL_MIN, SALVO_INTERVAL_MAX);
        this.spawnSalvo(elapsed);
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      if (m.telegraph > 0) {
        m.telegraph -= dt;
        m.shadow.material.opacity = THREE.MathUtils.clamp((1 - m.telegraph / m.telegraphMax) * 0.8, 0.2, 0.8);
        if (m.telegraph <= 0) {
          m.mesh.visible = true;
          m.shadow.material.opacity = 0.85;
          if (this.onFallStart) this.onFallStart();
        }
      } else {
        m.mesh.position.y -= m.vy * dt;
        m.mesh.position.z += m.vz * dt;
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

  pickFromPool(tierStart) {
    // tierStart 지정 시 그 인덱스부터 우선 시도 (살보용 small/medium 강제)
    let t = tierStart !== undefined ? tierStart : pickTierIndex();
    for (let attempt = 0; attempt < TIERS.length; attempt++) {
      if (this.pools[t].length > 0) return this.pools[t].pop();
      t = (t + 1) % TIERS.length;
    }
    return null;
  }

  spawnAt(tx, tz, elapsed, telegraph = 1.2, m = null) {
    if (!m) m = this.pickFromPool();
    if (!m) return;
    // 임팩트 지점(tx, 0, tz)을 정확히 맞추도록 spawn z를 뒤로(−Z) 밀어둠
    // dz = (낙하 거리) × slope. 낙하 거리는 SPAWN_Y → radius.
    const dz = (SPAWN_Y - m.radius) * DIAGONAL_SLOPE;
    m.mesh.position.set(tx, SPAWN_Y, tz - dz);
    m.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    const speedBias = 1 - m.tier * 0.07;
    const fall = (FALL_SPEED_BASE + Math.min(elapsed * 0.4, 14)) * speedBias;
    m.vy = fall;
    m.vz = fall * DIAGONAL_SLOPE;
    m.telegraph = telegraph;
    m.telegraphMax = telegraph;
    m.rotX = rand(-2.5, 2.5);
    m.rotZ = rand(-2.5, 2.5);
    m.mesh.visible = false;
    m.shadow.position.set(tx, 0.08, tz);
    m.shadow.material.opacity = 0;
    m.shadow.visible = true;
    this.active.push(m);
    if (this.onTelegraph) this.onTelegraph();
  }

  spawnOne(elapsed) {
    const r = rand(2, this.arenaRadius - 8);
    const angle = rand(0, Math.PI * 2);
    this.spawnAt(Math.cos(angle) * r, Math.sin(angle) * r, elapsed);
  }

  spawnAimed(elapsed) {
    if (!this.player) { this.spawnOne(elapsed); return; }
    this.spawnAt(this.player.position.x, this.player.position.z, elapsed);
  }

  // 살보(volley) 폭격: 캐릭터 주변 원형으로 small/medium 운석 6발 동시 낙하
  spawnSalvo(elapsed) {
    if (!this.player) return;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (let i = 0; i < SALVO_COUNT; i++) {
      // 살보는 small(0) 또는 medium(1) 티어로 제한 → 회피 공간 확보
      const tier = Math.random() < 0.7 ? 0 : 1;
      const m = this.pickFromPool(tier);
      if (!m) continue;
      const angle = (i / SALVO_COUNT) * Math.PI * 2 + rand(-0.25, 0.25);
      const dist = rand(SALVO_RADIUS_MIN, SALVO_RADIUS_MAX);
      const tx = px + Math.cos(angle) * dist;
      const tz = pz + Math.sin(angle) * dist;
      this.spawnAt(tx, tz, elapsed, SALVO_TELEGRAPH, m);
    }
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
    this._aimedAccum = 0;
    this._aimedInterval = rand(AIMED_INTERVAL_MIN, AIMED_INTERVAL_MAX);
    this._salvoAccum = 0;
    this._salvoInterval = rand(SALVO_INTERVAL_MIN, SALVO_INTERVAL_MAX);
  }
}
