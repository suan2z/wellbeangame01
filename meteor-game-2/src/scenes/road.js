import * as THREE from 'three';
import {
  ROAD_WIDTH, ROAD_HALF, SEGMENT_LEN, SEGMENT_COUNT, TRACK_LEN, NEAR_Z,
} from '../constants.js';

const FAR_Z = NEAR_Z - TRACK_LEN; // 이보다 더 멀어지면(-Z) 재생성

const BUILDING_COLORS = [0x2a3a55, 0x33445f, 0x252e44, 0x3a4866, 0x2e3a52, 0x40364f];
const ACCENT_COLORS = [0x4cc2ff, 0xff5b8a, 0xffd24c, 0x9b6bff];
const ROAD_COLOR = 0x2b2b34;
const BURNT_ROAD = 0x140d0a;
const SIDE_START = ROAD_HALF + 3;   // 인도/건물 시작 x
const SIDE_END = ROAD_HALF + 46;    // 도시 깊이
const BUILDINGS_PER_SIDE = 4;

function rand(a, b) { return a + Math.random() * (b - a); }

// 일직선 길 + 좌우 도시. 구획(segment)을 +Z로 스크롤시키며 카메라 뒤로 넘어가면
// 맨 앞(-Z)으로 재배치하고 건물을 같은 패턴으로 다시 생성 → 끝없는 길.
export class RoadSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.segments = [];

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = this._buildSegment();
      seg.group.position.z = NEAR_Z - i * SEGMENT_LEN;
      this.segments.push(seg);
      this.group.add(seg.group);
      this._randomizeSegment(seg);
    }
  }

  _buildSegment() {
    const group = new THREE.Group();

    // 길바닥
    const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.6, SEGMENT_LEN);
    const roadMat = new THREE.MeshLambertMaterial({ color: ROAD_COLOR });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.y = -0.3;
    group.add(road);

    // 중앙 차선 점선 (구획당 2개)
    const dashes = [];
    for (let d = 0; d < 2; d++) {
      const dashGeo = new THREE.BoxGeometry(0.5, 0.05, SEGMENT_LEN * 0.32);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd24c });
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(0, 0.04, -SEGMENT_LEN / 4 + d * (SEGMENT_LEN / 2));
      group.add(dash);
      dashes.push(dash);
    }

    // 좌우 연석(curb)
    const curbs = [];
    for (const sx of [-1, 1]) {
      const curbGeo = new THREE.BoxGeometry(0.6, 0.5, SEGMENT_LEN);
      const curbMat = new THREE.MeshLambertMaterial({ color: 0x4a4a58 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(sx * (ROAD_HALF - 0.3), 0.05, 0);
      group.add(curb);
      curbs.push(curb);
    }

    // 좌우 건물
    const buildings = [];
    for (const sx of [-1, 1]) {
      for (let b = 0; b < BUILDINGS_PER_SIDE; b++) {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
        // 옥상 네온 액센트
        const accGeo = new THREE.BoxGeometry(1, 0.6, 1);
        const accMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff });
        const acc = new THREE.Mesh(accGeo, accMat);
        group.add(acc);
        buildings.push({ mesh, acc, side: sx, baseColor: 0x2a3a55 });
      }
    }

    return { group, road, roadMat, dashes, curbs, buildings, burning: false };
  }

  // 건물 높이/위치/색을 새로 굴림 — "동일 패턴" 재생성
  _randomizeSegment(seg) {
    seg.burning = false;
    seg.roadMat.color.setHex(ROAD_COLOR);
    for (const d of seg.dashes) d.visible = true;

    for (const b of seg.buildings) {
      const w = rand(5, 12);
      const d = rand(6, 14);
      const h = rand(10, 64);
      const x = b.side * rand(SIDE_START + w / 2, SIDE_END);
      const z = rand(-SEGMENT_LEN / 2 + d, SEGMENT_LEN / 2 - d);
      const color = BUILDING_COLORS[(Math.random() * BUILDING_COLORS.length) | 0];
      b.baseColor = color;
      b.mesh.scale.set(w, h, d);
      b.mesh.position.set(x, h / 2, z);
      b.mesh.rotation.set(0, 0, 0);
      b.mesh.material.color.setHex(color);
      b.mesh.visible = true;
      // 옥상 액센트
      if (Math.random() < 0.55) {
        const acolor = ACCENT_COLORS[(Math.random() * ACCENT_COLORS.length) | 0];
        b.acc.scale.set(w * 0.82, 0.6, d * 0.82);
        b.acc.position.set(x, h + 0.3, z);
        b.acc.material.color.setHex(acolor);
        b.acc.visible = true;
      } else {
        b.acc.visible = false;
      }
      b.h = h;
      b.collapse = 0; // 0=온전, 1=완전 붕괴
    }
  }

  // wallZ보다 뒤(+Z)에 있는 구획을 불태우고 무너뜨린다.
  _applyDestruction(seg, dt) {
    if (!seg.burning) {
      seg.burning = true;
      seg.roadMat.color.setHex(BURNT_ROAD);
      for (const d of seg.dashes) d.visible = false;
    }
    // 건물 붕괴 진행
    for (const b of seg.buildings) {
      if (!b.mesh.visible) continue;
      b.collapse = Math.min(1, b.collapse + dt * 0.9);
      const c = b.collapse;
      // 가라앉으며 기울고 검게 그을림
      b.mesh.scale.y = b.h * (1 - c * 0.75);
      b.mesh.position.y = (b.h * (1 - c * 0.75)) / 2;
      b.mesh.rotation.z = b.side * c * 0.35;
      const col = b.mesh.material.color;
      col.setHex(b.baseColor);
      col.lerp(new THREE.Color(0x1a1010), c);
      if (b.acc.visible) b.acc.visible = c < 0.3;
    }
  }

  // dt: 프레임 시간, scrollDist: 이번 프레임 이동량(월드는 -Z로 흘러감),
  // wallZ: 화염벽 z(음수). 이보다 더 멀리(-Z) 간 구획은 화염에 파괴된다.
  update(dt, scrollDist, wallZ) {
    for (const seg of this.segments) {
      seg.group.position.z -= scrollDist;
      if (seg.group.position.z < FAR_Z) {
        seg.group.position.z += TRACK_LEN;
        this._randomizeSegment(seg);
      }
      if (seg.group.position.z < wallZ) {
        this._applyDestruction(seg, dt);
      }
    }
  }

  reset() {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.group.position.z = NEAR_Z - i * SEGMENT_LEN;
      this._randomizeSegment(seg);
    }
  }
}
