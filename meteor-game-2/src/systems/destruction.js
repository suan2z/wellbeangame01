import * as THREE from 'three';
import {
  ROAD_HALF, LEAD_START, LEAD_MAX, LEAD_REGEN, LEAD_DEAD,
} from '../constants.js';

const WALL_HALF = ROAD_HALF + 50;   // 화염벽 폭(도시까지 덮음)
const FLAME_COUNT = 26;

function rand(a, b) { return a + Math.random() * (b - a); }

// 플레이어 뒤(+Z)에서 쫓아오는 파괴의 화염벽.
// lead = 플레이어(z=0)와 화염벽 사이 거리. 달리면 회복(+Z로 물러남),
// 거대 운석 충돌마다 surge로 확 다가온다. lead<=0 → 따라잡힘(게임오버).
export class DestructionWall {
  constructor(scene) {
    this.scene = scene;
    this.lead = LEAD_START;
    this.group = new THREE.Group();
    scene.add(this.group);

    // 뒤쪽 소실 지대(검게 탄 바닥)
    const groundGeo = new THREE.PlaneGeometry(WALL_HALF * 2, 400);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x0a0604 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0.02, 200); // 화염벽 뒤로 길게
    this.group.add(this.ground);

    // 메인 발광 벽
    const wallGeo = new THREE.PlaneGeometry(WALL_HALF * 2, 22);
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1e, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.wall = new THREE.Mesh(wallGeo, wallMat);
    this.wall.position.y = 9;
    this.group.add(this.wall);

    // 개별 화염 quad (플리커)
    this.flames = [];
    const flameGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < FLAME_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffd24c : (i % 3 === 1 ? 0xff7a2a : 0xff3010),
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(flameGeo, mat);
      const x = -WALL_HALF + (i / (FLAME_COUNT - 1)) * WALL_HALF * 2;
      m.position.set(x + rand(-2, 2), 0, rand(-1.5, 1.5));
      this.group.add(m);
      this.flames.push({ mesh: m, baseX: m.position.x, w: rand(5, 10), h: rand(8, 18), phase: rand(0, Math.PI * 2), speed: rand(4, 8) });
    }

    this._t = 0;
    this._sync();
  }

  get wallZ() { return this.lead; }
  // HUD용 위험도 0(안전)~1(위급)
  get danger() { return THREE.MathUtils.clamp(1 - this.lead / LEAD_MAX, 0, 1); }

  surge(amount) {
    this.lead -= amount;
  }

  _sync() {
    this.group.position.z = this.lead;
  }

  // 반환: true면 플레이어가 화염벽에 삼켜짐(게임오버)
  update(dt) {
    this._t += dt;
    this.lead = Math.min(LEAD_MAX, this.lead + LEAD_REGEN * dt);
    this._sync();

    for (const f of this.flames) {
      const flick = 0.7 + 0.3 * Math.sin(this._t * f.speed + f.phase);
      const h = f.h * flick;
      f.mesh.scale.set(f.w, h, 1);
      f.mesh.position.y = h / 2;
      f.mesh.position.x = f.baseX + Math.sin(this._t * 1.5 + f.phase) * 1.2;
      f.mesh.material.opacity = 0.7 + 0.3 * flick;
    }
    // 위급할수록 벽이 더 밝게
    this.wall.material.opacity = 0.4 + 0.35 * this.danger;

    return this.lead <= LEAD_DEAD;
  }

  reset() {
    this.lead = LEAD_START;
    this._sync();
  }
}
