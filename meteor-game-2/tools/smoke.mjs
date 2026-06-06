// 헤드리스 스모크 테스트 — 렌더러/DOM 없이 시뮬레이션 루프만 검증.
import * as THREE from 'three';
import { RoadSystem } from '../src/scenes/road.js';
import { Player } from '../src/objects/player.js';
import { MeteorSystem } from '../src/systems/meteors.js';
import { DestructionWall } from '../src/systems/destruction.js';
import { EffectSystem } from '../src/systems/effects.js';
import {
  RUN_SPEED_BASE, RUN_SPEED_GROWTH, GIANT_INTERVAL, GIANT_TELEGRAPH,
  GIANT_IMPACT_Z, GIANT_SURGE_BASE, GIANT_SURGE_GROWTH, LEAD_MAX, ROAD_HALF,
} from '../src/constants.js';

const scene = new THREE.Scene();
const road = new RoadSystem(scene);
const effects = new EffectSystem(scene);
const destruction = new DestructionWall(scene);
const player = new Player(scene);
const meteors = new MeteorSystem(scene, player.mesh);

let giantImpacts = 0, smallImpacts = 0;
meteors.onImpact = () => { smallImpacts++; };
meteors.onGiantImpact = (x, z) => {
  giantImpacts++;
  destruction.surge(GIANT_SURGE_BASE + elapsed * GIANT_SURGE_GROWTH);
};

let elapsed = 0, distance = 0, giantAccum = 0;
const dt = 1 / 60;
let minLead = Infinity, maxLead = -Infinity, recycles = 0;

// road recycle 카운트용 훅
const origRand = road._randomizeSegment.bind(road);
road._randomizeSegment = (seg) => { recycles++; origRand(seg); };

// 시뮬레이션 입력: 좌우로 왔다갔다
for (let frame = 0; frame < 1800; frame++) { // 30초
  elapsed += dt;
  const runSpeed = RUN_SPEED_BASE + elapsed * RUN_SPEED_GROWTH;
  const scrollDist = runSpeed * dt;
  distance += scrollDist;

  const input = { x: Math.sin(elapsed * 1.3), y: 0 };
  player.update(dt, input, 1);
  road.update(dt, scrollDist, destruction.wallZ);

  giantAccum += dt;
  if (giantAccum >= GIANT_INTERVAL) {
    giantAccum -= GIANT_INTERVAL;
    meteors.launchGiant(GIANT_IMPACT_Z, GIANT_TELEGRAPH);
  }
  meteors.update(dt, elapsed);
  destruction.update(dt);
  effects.update(dt);

  minLead = Math.min(minLead, destruction.lead);
  maxLead = Math.max(maxLead, destruction.lead);

  // 무결성 체크
  if (Number.isNaN(player.mesh.position.x)) throw new Error('player.x NaN @frame ' + frame);
  if (Number.isNaN(distance)) throw new Error('distance NaN');
  if (Number.isNaN(destruction.lead)) throw new Error('lead NaN');
  if (Math.abs(player.mesh.position.x) > ROAD_HALF) throw new Error('player out of road bounds: ' + player.mesh.position.x);
}

console.log('frames simulated : 1800 (30s)');
console.log('distance (m)     :', distance.toFixed(1));
console.log('small impacts    :', smallImpacts);
console.log('giant impacts    :', giantImpacts, '(expected ~5-6)');
console.log('segment recycles :', recycles, '(>0 means endless road works)');
console.log('lead range       :', minLead.toFixed(1), '→', maxLead.toFixed(1), '(max', LEAD_MAX + ')');
console.log('active meteors   :', meteors.active.length);
console.log('player.x final   :', player.mesh.position.x.toFixed(2));
console.log('\nOK — no runtime errors, no NaN, bounds respected.');
