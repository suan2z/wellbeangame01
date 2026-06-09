import * as THREE from 'three';

// 운석 임팩트 시 폭발: 파편 입자 + 충격파 링 + 섬광 + 잔류 크레이터
const PARTICLE_POOL = 280;
const RING_POOL = 20;
const FLASH_POOL = 14;
const CRATER_POOL = 18;

const PARTICLE_LIFETIME = 0.9;
const RING_LIFETIME = 0.55;
const FLASH_LIFETIME = 0.18;
const CRATER_LIFETIME = 4.0;

const GRAVITY = -30;

function rand(a, b) { return a + Math.random() * (b - a); }

export class EffectSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.rings = [];
    this.flashes = [];
    this.craters = [];

    const partGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffa84a, emissive: 0x401200, transparent: true });
      const m = new THREE.Mesh(partGeo, mat);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
    }

    for (let i = 0; i < RING_POOL; i++) {
      const ringGeo = new THREE.RingGeometry(0.9, 1.1, 48);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, side: THREE.DoubleSide, transparent: true, opacity: 0 });
      const r = new THREE.Mesh(ringGeo, mat);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      scene.add(r);
      this.rings.push({ mesh: r, life: 0, max: 1, startR: 1, endR: 6 });
    }

    const flashGeo = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < FLASH_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffe0, transparent: true, opacity: 0 });
      const f = new THREE.Mesh(flashGeo, mat);
      f.visible = false;
      scene.add(f);
      this.flashes.push({ mesh: f, life: 0, max: 1, size: 1 });
    }

    for (let i = 0; i < CRATER_POOL; i++) {
      const craterGeo = new THREE.CircleGeometry(1, 24);
      const mat = new THREE.MeshBasicMaterial({ color: 0x2a1a0a, transparent: true, opacity: 0 });
      const c = new THREE.Mesh(craterGeo, mat);
      c.rotation.x = -Math.PI / 2;
      c.visible = false;
      scene.add(c);
      this.craters.push({ mesh: c, life: 0, max: 1 });
    }
  }

  _spawnParticle(x, y, z, scale, color) {
    const p = this.particles.find((q) => !q.mesh.visible);
    if (!p) return;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    const angle = rand(0, Math.PI * 2);
    const speed = rand(6, 13) * scale;
    const lift  = rand(8, 16) * scale;
    p.vx = Math.cos(angle) * speed;
    p.vz = Math.sin(angle) * speed;
    p.vy = lift;
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    const s = rand(0.7, 1.4) * scale;
    p.mesh.scale.set(s, s, s);
    p.life = 0;
    p.max = PARTICLE_LIFETIME;
    p.mesh.visible = true;
  }

  _spawnRing(x, y, z, scale) {
    const r = this.rings.find((q) => !q.mesh.visible);
    if (!r) return;
    r.mesh.position.set(x, y + 0.05, z);
    r.life = 0;
    r.max = RING_LIFETIME;
    r.startR = 1.0;
    r.endR = 6.0 * scale;
    r.mesh.material.opacity = 0.85;
    r.mesh.scale.set(r.startR, r.startR, 1);
    r.mesh.visible = true;
  }

  _spawnFlash(x, y, z, scale) {
    const f = this.flashes.find((q) => !q.mesh.visible);
    if (!f) return;
    f.mesh.position.set(x, y, z);
    f.life = 0;
    f.max = FLASH_LIFETIME;
    f.size = 1.4 * scale;
    f.mesh.material.opacity = 1;
    f.mesh.scale.set(0.6, 0.6, 0.6);
    f.mesh.visible = true;
  }

  _spawnCrater(x, y, z, scale) {
    const c = this.craters.find((q) => !q.mesh.visible);
    if (!c) return;
    c.mesh.position.set(x, 0.07, z);
    c.life = 0;
    c.max = CRATER_LIFETIME;
    const s = 1.5 * scale;
    c.mesh.scale.set(s, s, 1);
    c.mesh.material.opacity = 0.85;
    c.mesh.visible = true;
  }

  explode(x, y, z, scale = 1.0) {
    const n = Math.round(12 + scale * 6);
    for (let i = 0; i < n; i++) {
      const color = i % 3 === 0 ? 0xfff1c0 : (i % 3 === 1 ? 0xff7a2a : 0x553322);
      this._spawnParticle(x, y, z, scale, color);
    }
    this._spawnRing(x, y, z, scale);
    this._spawnFlash(x, y, z, scale);
    this._spawnCrater(x, y, z, scale);
  }

  update(dt) {
    for (const p of this.particles) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.mesh.visible = false; continue; }
      p.vy += GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.y = 0.1;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.z += dt * 4;
      const k = 1 - p.life / p.max;
      p.mesh.material.opacity = Math.min(1, k * 1.3);
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life += dt;
      if (r.life >= r.max) { r.mesh.visible = false; continue; }
      const t = r.life / r.max;
      const size = r.startR + (r.endR - r.startR) * t;
      r.mesh.scale.set(size, size, 1);
      r.mesh.material.opacity = 0.85 * (1 - t);
    }
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life += dt;
      if (f.life >= f.max) { f.mesh.visible = false; continue; }
      const t = f.life / f.max;
      const s = THREE.MathUtils.lerp(0.6, f.size, t);
      f.mesh.scale.set(s, s, s);
      f.mesh.material.opacity = 1 - t;
    }
    for (const c of this.craters) {
      if (!c.mesh.visible) continue;
      c.life += dt;
      if (c.life >= c.max) { c.mesh.visible = false; continue; }
      const t = c.life / c.max;
      c.mesh.material.opacity = 0.85 * (1 - t);
    }
  }

  reset() {
    [...this.particles, ...this.rings, ...this.flashes, ...this.craters].forEach((o) => {
      o.mesh.visible = false;
    });
  }
}
