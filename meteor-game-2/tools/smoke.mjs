// 헤드리스 스모크 테스트 — 렌더러/DOM 없이 시뮬레이션 루프만 검증.
import * as THREE from 'three';
import { RoadSystem } from '../src/scenes/road.js';
import { Player } from '../src/objects/player.js';
import { MeteorSystem } from '../src/systems/meteors.js';
import { EffectSystem } from '../src/systems/effects.js';
import {
  COLLAPSE_INITIAL_GAP, COLLAPSE_CREEP, COLLAPSE_CREEP_GROWTH,
  GIANT_INTERVAL, GIANT_TELEGRAPH, GIANT_STEP, GIANT_SAFE, PLAYER_X_LIMIT,
} from '../src/constants.js';

const scene = new THREE.Scene();
const road = new RoadSystem(scene);
const effects = new EffectSystem(scene);
const player = new Player(scene);
const meteors = new MeteorSystem(scene, player.mesh);

let giantImpacts = 0, smallImpacts = 0;
let collapseZ = player.mesh.position.z - COLLAPSE_INITIAL_GAP;
meteors.onImpact = () => { smallImpacts++; };
meteors.onGiantImpact = (x, z) => { giantImpacts++; collapseZ = Math.max(collapseZ, z); };

let elapsed = 0, giantAccum = 0, recycles = 0, deaths = 0;
const dt = 1 / 60;
const origRand = road._randomizeSegment.bind(road);
road._randomizeSegment = (seg) => { recycles++; origRand(seg); };

for (let frame = 0; frame < 2400; frame++) { // 40초
  elapsed += dt;
  // 플레이어: +Z로 후퇴(도망)하며 좌우로 흔들기
  const input = { x: Math.sin(elapsed * 1.4) * 0.6, y: 0.6 };
  player.update(dt, input);
  const pz = player.mesh.position.z;

  collapseZ += (COLLAPSE_CREEP + elapsed * COLLAPSE_CREEP_GROWTH) * dt;

  giantAccum += dt;
  if (giantAccum >= GIANT_INTERVAL) {
    giantAccum -= GIANT_INTERVAL;
    const giantZ = Math.min(collapseZ + GIANT_STEP, pz - GIANT_SAFE);
    meteors.launchGiant(giantZ, GIANT_TELEGRAPH);
  }
  meteors.update(dt, elapsed);
  road.update(dt, pz, collapseZ);
  effects.update(dt);

  if (pz <= collapseZ) deaths++;

  if (Number.isNaN(player.mesh.position.x)) throw new Error('player.x NaN @' + frame);
  if (Number.isNaN(collapseZ)) throw new Error('collapseZ NaN @' + frame);
  if (Math.abs(player.mesh.position.x) > PLAYER_X_LIMIT + 0.001) throw new Error('player out of road: ' + player.mesh.position.x);
}

const gap = (player.mesh.position.z - collapseZ).toFixed(1);
console.log('frames simulated : 2400 (40s)');
console.log('player z final   :', player.mesh.position.z.toFixed(1), '(retreated +Z)');
console.log('collapseZ final  :', collapseZ.toFixed(1), '| gap to player:', gap);
console.log('giant impacts    :', giantImpacts, '(expected ~7-8 @5s)');
console.log('small impacts    :', smallImpacts);
console.log('segment recycles :', recycles, '(>0 = 끝없는 길 작동)');
console.log('collapse caught   :', deaths, 'frames (0 = 후퇴로 생존)');
console.log('player.x final   :', player.mesh.position.x.toFixed(2), '(|x| <=', PLAYER_X_LIMIT + ')');
console.log('\nOK — no runtime errors, no NaN, bounds respected.');
