import * as THREE from 'three';

const BUILDING_COLORS = [0x2a3a55, 0x33445f, 0x252e44, 0x3a4866, 0x2e3a52];
const ACCENT_COLOR = 0x4cc2ff;

// 절차적 박스 빌딩 배치 — 경기장 바깥쪽으로만, 안쪽은 비워둠
export function buildCity(scene, arenaRadius) {
  const group = new THREE.Group();
  const buildings = [];

  const ringStart = arenaRadius + 8;
  const ringEnd = arenaRadius + 90;
  // shared geometry/material strategy: simple per-instance is OK for ~200 boxes
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = THREE.MathUtils.lerp(ringStart, ringEnd, Math.pow(Math.random(), 0.6));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    const w = THREE.MathUtils.randFloat(6, 14);
    const d = THREE.MathUtils.randFloat(6, 14);
    const h = THREE.MathUtils.randFloat(10, 60) * (1 + (r - ringStart) / (ringEnd - ringStart) * 0.5);

    const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    group.add(m);
    buildings.push(m);

    // top accent (네온 조명 느낌)
    if (Math.random() < 0.4) {
      const accGeo = new THREE.BoxGeometry(w * 0.8, 0.5, d * 0.8);
      const accMat = new THREE.MeshBasicMaterial({ color: ACCENT_COLOR });
      const acc = new THREE.Mesh(accGeo, accMat);
      acc.position.set(x, h + 0.3, z);
      acc.rotation.y = m.rotation.y;
      group.add(acc);
    }
  }

  scene.add(group);
  return { group, buildings };
}
