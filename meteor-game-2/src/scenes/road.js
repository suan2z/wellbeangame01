import * as THREE from 'three';
import {
  ROAD_WIDTH, ROAD_HALF, SEGMENT_LEN, SEGMENT_COUNT, TRACK_LEN, BAND_NEAR, BAND_FAR,
} from '../constants.js';

const BUILDING_COLORS = [0x2a3a55, 0x33445f, 0x252e44, 0x3a4866, 0x2e3a52, 0x40364f];
const ACCENT_COLORS = [0x4cc2ff, 0xff5b8a, 0xffd24c, 0x9b6bff];
const ROAD_COLOR = 0x2b2b34;
const RUBBLE_COLOR = 0x161416;   // 무너진 길/잔해 (불 없음, 어두운 회색)
const RUBBLE_BUILDING = 0x14131a;
const SIDE_START = ROAD_HALF + 3;
const SIDE_END = ROAD_HALF + 46;
const BUILDINGS_PER_SIDE = 4;

function rand(a, b) { return a + Math.random() * (b - a); }

// 일직선 길 + 좌우 도시. 구획을 플레이어 주변에 유지(재활용)해 끝없는 길을 만든다.
// collapseZ 보다 안쪽(-Z)은 거대 운석에 무너진 길(잔해) — 불 연출 없이 어둡게 가라앉음.
export class RoadSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.segments = [];
    this._rubble = new THREE.Color(RUBBLE_COLOR);
    this._rubbleB = new THREE.Color(RUBBLE_BUILDING);
    this._fresh = new THREE.Color(ROAD_COLOR);

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = this._buildSegment();
      // -Z(화면 안쪽)으로 길게 깔고, 일부는 +Z(카메라 뒤)에 둔다
      seg.group.position.z = BAND_NEAR - i * SEGMENT_LEN;
      this.segments.push(seg);
      this.group.add(seg.group);
      this._randomizeSegment(seg);
    }

    // 붕괴 경계 표식 (길 가로지르는 잔해 턱)
    const edgeGeo = new THREE.BoxGeometry(ROAD_WIDTH + 1, 0.8, 1.4);
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x3a3640 });
    this.edge = new THREE.Mesh(edgeGeo, edgeMat);
    this.edge.position.y = 0.25;
    scene.add(this.edge);
  }

  _buildSegment() {
    const group = new THREE.Group();

    const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.6, SEGMENT_LEN);
    const roadMat = new THREE.MeshLambertMaterial({ color: ROAD_COLOR });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.y = -0.3;
    group.add(road);

    const dashes = [];
    for (let d = 0; d < 2; d++) {
      const dashGeo = new THREE.BoxGeometry(0.5, 0.05, SEGMENT_LEN * 0.32);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd24c });
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(0, 0.04, -SEGMENT_LEN / 4 + d * (SEGMENT_LEN / 2));
      group.add(dash);
      dashes.push(dash);
    }

    const curbs = [];
    for (const sx of [-1, 1]) {
      const curbGeo = new THREE.BoxGeometry(0.6, 0.5, SEGMENT_LEN);
      const curbMat = new THREE.MeshLambertMaterial({ color: 0x4a4a58 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(sx * (ROAD_HALF - 0.3), 0.05, 0);
      group.add(curb);
      curbs.push(curb);
    }

    const buildings = [];
    for (const sx of [-1, 1]) {
      for (let b = 0; b < BUILDINGS_PER_SIDE; b++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2a3a55 }));
        group.add(mesh);
        const acc = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), new THREE.MeshBasicMaterial({ color: 0x4cc2ff }));
        group.add(acc);
        buildings.push({ mesh, acc, side: sx });
      }
    }

    return { group, road, roadMat, dashes, curbs, buildings, ruin: 0 };
  }

  // 건물 높이/위치/색 재생성 — "동일 패턴" + 붕괴 상태 초기화
  _randomizeSegment(seg) {
    seg.ruin = 0;
    seg.roadMat.color.setHex(ROAD_COLOR);
    for (const d of seg.dashes) d.visible = true;

    for (const b of seg.buildings) {
      const w = rand(5, 12);
      const d = rand(6, 14);
      const h = rand(10, 64);
      const x = b.side * rand(SIDE_START + w / 2, SIDE_END);
      const z = rand(-SEGMENT_LEN / 2 + d, SEGMENT_LEN / 2 - d);
      const color = BUILDING_COLORS[(Math.random() * BUILDING_COLORS.length) | 0];
      b.fw = w; b.fd = d; b.fh = h; b.fx = x; b.fz = z; b.fcolor = color;
      b.mesh.scale.set(w, h, d);
      b.mesh.position.set(x, h / 2, z);
      b.mesh.rotation.set(0, 0, 0);
      b.mesh.material.color.setHex(color);
      b.mesh.visible = true;
      if (Math.random() < 0.55) {
        b.hasAcc = true;
        const acolor = ACCENT_COLORS[(Math.random() * ACCENT_COLORS.length) | 0];
        b.acc.scale.set(w * 0.82, 0.6, d * 0.82);
        b.acc.position.set(x, h + 0.3, z);
        b.acc.material.color.setHex(acolor);
        b.acc.visible = true;
      } else {
        b.hasAcc = false;
        b.acc.visible = false;
      }
    }
  }

  // 무너짐 진행도(ruin 0~1)를 구획에 적용 — 가라앉고 기울며 어두운 잔해로 (불 없음)
  _applyRuin(seg) {
    const c = seg.ruin;
    seg.roadMat.color.copy(this._fresh).lerp(this._rubble, c);
    if (c > 0.5) for (const d of seg.dashes) d.visible = false;
    for (const b of seg.buildings) {
      const sy = b.fh * (1 - 0.78 * c);
      b.mesh.scale.y = sy;
      b.mesh.position.y = sy / 2;
      b.mesh.rotation.z = b.side * 0.4 * c;
      b.mesh.material.color.setHex(b.fcolor);
      b.mesh.material.color.lerp(this._rubbleB, c);
      if (b.hasAcc) b.acc.visible = c < 0.25;
    }
  }

  // playerZ 주변으로 구획 재활용, collapseZ 보다 안쪽 구획은 무너뜨림
  update(dt, playerZ, collapseZ) {
    const k = Math.min(1, 2.5 * dt);
    for (const seg of this.segments) {
      let recycled = false;
      if (seg.group.position.z > playerZ + BAND_NEAR) {
        seg.group.position.z -= TRACK_LEN;
        this._randomizeSegment(seg);
        recycled = true;
      } else if (seg.group.position.z < playerZ - BAND_FAR) {
        seg.group.position.z += TRACK_LEN;
        this._randomizeSegment(seg);
        recycled = true;
      }
      const destroyed = seg.group.position.z < collapseZ;
      const target = destroyed ? 1 : 0;
      if (recycled) seg.ruin = target;
      else seg.ruin += (target - seg.ruin) * k;
      this._applyRuin(seg);
    }
    this.edge.position.z = collapseZ;
  }

  reset() {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.group.position.z = BAND_NEAR - i * SEGMENT_LEN;
      this._randomizeSegment(seg);
      this._applyRuin(seg);
    }
  }
}
