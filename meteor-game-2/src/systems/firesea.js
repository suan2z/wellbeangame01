import * as THREE from 'three';

// 거대 운석 폭발 지점에 남는 붉은 불바다 글로우.
// 한 개를 재사용 — 새 폭발이 일어나면 그 위치로 옮겨가며(이전 것 교체) 다음 폭발까지 붉게 감돈다.
const FLAME_COUNT = 26;
const FLAME_COLORS = [0xffe0a0, 0xff7a2a, 0xff3010, 0xffd24c];

function rand(a, b) { return a + Math.random() * (b - a); }

export class FireSea {
  constructor(scene, halfX, halfZ) {
    this.halfX = halfX;
    this.halfZ = halfZ;
    this.t = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // 바닥 발광 (불바다 면)
    const glowGeo = new THREE.PlaneGeometry(halfX * 2, halfZ * 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff3a12, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.16;
    this.group.add(this.glow);

    // 일렁이는 불꽃 quad들
    this.flames = [];
    const flameGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < FLAME_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: FLAME_COLORS[i % FLAME_COLORS.length],
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(flameGeo, mat);
      this.group.add(m);
      this.flames.push({ mesh: m, bx: 0, bz: 0, w: 1, h: 1, phase: rand(0, Math.PI * 2), speed: rand(4, 9) });
    }

    // 주변을 붉게 물들이는 점광
    this.light = new THREE.PointLight(0xff4014, 0, 160, 2);
    this.light.position.set(0, 7, 0);
    this.group.add(this.light);
  }

  // 폭발 지점(x, z)으로 옮겨 붉게 점화 (이전 불바다는 자연히 교체됨)
  ignite(x, z) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.t = 0;
    for (const f of this.flames) {
      f.bx = rand(-this.halfX, this.halfX);
      f.bz = rand(-this.halfZ, this.halfZ);
      f.w = rand(4, 11);
      f.h = rand(6, 18);
      f.phase = rand(0, Math.PI * 2);
      f.speed = rand(4, 9);
      f.mesh.position.set(f.bx, 0, f.bz);
    }
  }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const base = 0.85 + 0.15 * Math.sin(this.t * 3.0);
    this.glow.material.opacity = 0.45 * base;
    this.light.intensity = (1.6 + 0.5 * Math.sin(this.t * 4.0)) * base;
    for (const f of this.flames) {
      const flick = 0.6 + 0.4 * Math.sin(this.t * f.speed + f.phase);
      const h = f.h * flick;
      f.mesh.scale.set(f.w, h, 1);
      f.mesh.position.y = h / 2;
      f.mesh.material.opacity = (0.55 + 0.35 * flick) * base;
    }
  }

  reset() {
    this.group.visible = false;
  }
}
