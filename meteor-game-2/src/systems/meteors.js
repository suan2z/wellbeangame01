import * as THREE from 'three';
import { ROAD_HALF, PLAYER_X_LIMIT } from '../constants.js';

const FALL_SPEED_BASE = 22;
const SPAWN_Y = 46;
// 캐릭터 조준 운석 간격
const AIMED_INTERVAL_MIN = 1.4;
const AIMED_INTERVAL_MAX = 2.4;

const TIERS = [
  { name: 'small',  rMin: 0.7, rMax: 1.0, count: 22, weight: 0.6, detail: 0, color: 0x886a4a, emissive: 0x331a00 },
  { name: 'medium', rMin: 1.6, rMax: 2.3, count: 14, weight: 0.4, detail: 0, color: 0x8a5e3a, emissive: 0x3a1500 },
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
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.active = [];
    this.pools = TIERS.map(() => []);
    this.spawnAccum = 0;
    this._aimedAccum = 0;
    this._aimedInterval = rand(AIMED_INTERVAL_MIN, AIMED_INTERVAL_MAX);

    this.onImpact = null;       // (x,y,z,scale) 작은 운석 지면 충돌
    this.onTelegraph = null;
    this.onFallStart = null;
    this.onGiantImpact = null;  // (x,z) 거대 운석 강타

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
        const m = { mesh, radius: r, tier: t, vy: FALL_SPEED_BASE, telegraph: 0, rotX: 0, rotZ: 0, giant: false };

        const shGeo = new THREE.RingGeometry(r * 0.9, r * 1.05, 24);
        const shMat = new THREE.MeshBasicMaterial({ color: 0xff5577, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
        const shadow = new THREE.Mesh(shGeo, shMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.09;
        shadow.visible = false;
        scene.add(shadow);
        m.shadow = shadow;
        this.pools[t].push(m);
      }
    }

    this._buildGiant();
  }

  _buildGiant() {
    const r = ROAD_HALF; // 길 전체 폭을 덮는 크기
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const f = 1 + (Math.random() - 0.5) * 0.2;
      pos.setX(j, pos.getX(j) * f);
      pos.setY(j, pos.getY(j) * f);
      pos.setZ(j, pos.getZ(j) * f);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xaa4525, emissive: 0x661500, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.scene.add(mesh);

    // 길 전체를 가로지르는 빨강 예고 띠
    const telGeo = new THREE.PlaneGeometry(ROAD_HALF * 2 + 6, r * 2.2);
    const telMat = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const tel = new THREE.Mesh(telGeo, telMat);
    tel.rotation.x = -Math.PI / 2;
    tel.position.y = 0.12;
    tel.visible = false;
    this.scene.add(tel);

    this.giant = { mesh, tel, radius: r, state: 'idle', telegraph: 0, telegraphMax: 1, vy: 0, x: 0, z: 0 };
  }

  spawnInterval(elapsed) {
    return Math.max(0.35, 1.0 - elapsed * 0.01);
  }

  pickFromPool() {
    let t = pickTierIndex();
    for (let attempt = 0; attempt < TIERS.length; attempt++) {
      if (this.pools[t].length > 0) return this.pools[t].pop();
      t = (t + 1) % TIERS.length;
    }
    return null;
  }

  // 길 위 한 점(tx, tz)에 작은 운석을 떨어뜨림
  spawnAt(tx, tz, elapsed, telegraph = 1.0) {
    const m = this.pickFromPool();
    if (!m) return;
    m.giant = false;
    m.mesh.position.set(tx, SPAWN_Y, tz);
    m.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    m.vy = FALL_SPEED_BASE + Math.min(elapsed * 0.3, 12);
    m.telegraph = telegraph;
    m.telegraphMax = telegraph;
    m.rotX = rand(-2.5, 2.5);
    m.rotZ = rand(-2.5, 2.5);
    m.mesh.visible = false;
    m.shadow.position.set(tx, 0.09, tz);
    m.shadow.material.opacity = 0;
    m.shadow.visible = true;
    this.active.push(m);
    if (this.onTelegraph) this.onTelegraph();
  }

  spawnOne(elapsed) {
    const x = rand(-PLAYER_X_LIMIT, PLAYER_X_LIMIT);
    // 플레이어 주변~진행 방향(화면 아래, +Z) 구간에 낙하
    const z = rand(-4, 16);
    this.spawnAt(x, z, elapsed);
  }

  spawnAimed(elapsed) {
    if (!this.player) { this.spawnOne(elapsed); return; }
    const px = THREE.MathUtils.clamp(this.player.position.x + rand(-2, 2), -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
    this.spawnAt(px, this.player.position.z + rand(-2, 8), elapsed);
  }

  // 거대 운석 발사 — 플레이어 뒤(targetZ, 화염벽 위치)로 길 전체 강타
  launchGiant(targetZ, telegraph) {
    const g = this.giant;
    if (g.state !== 'idle') return;
    g.x = 0;
    g.z = targetZ;
    g.state = 'telegraph';
    g.telegraph = telegraph;
    g.telegraphMax = telegraph;
    g.tel.position.set(0, 0.12, targetZ);
    g.tel.material.opacity = 0;
    g.tel.visible = true;
    g.mesh.position.set(0, SPAWN_Y + 30, targetZ);
    g.mesh.visible = false;
  }

  _updateGiant(dt) {
    const g = this.giant;
    if (g.state === 'idle') return;
    if (g.state === 'telegraph') {
      g.telegraph -= dt;
      const k = 1 - g.telegraph / g.telegraphMax;
      g.tel.material.opacity = 0.25 + 0.5 * Math.abs(Math.sin(k * Math.PI * 6));
      if (g.telegraph <= 0) {
        g.state = 'falling';
        g.mesh.visible = true;
        g.vy = 70;
        if (this.onFallStart) this.onFallStart();
      }
    } else if (g.state === 'falling') {
      g.mesh.position.y -= g.vy * dt;
      g.mesh.rotation.x += dt * 1.2;
      g.mesh.rotation.z += dt * 0.8;
      if (g.mesh.position.y <= g.radius) {
        g.mesh.visible = false;
        g.tel.visible = false;
        g.state = 'idle';
        if (this.onGiantImpact) this.onGiantImpact(g.x, g.z);
      }
    }
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

    this._updateGiant(dt);

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
    const g = this.giant;
    g.state = 'idle';
    g.mesh.visible = false;
    g.tel.visible = false;
  }
}
