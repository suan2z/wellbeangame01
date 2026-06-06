import * as THREE from 'three';
import { RoadSystem } from './scenes/road.js';
import { Player } from './objects/player.js';
import { MeteorSystem } from './systems/meteors.js';
import { ChaseCamera } from './systems/camera.js';
import { EffectSystem } from './systems/effects.js';
import { Joystick } from './ui/joystick.js';
import { JumpButton } from './ui/jumpbutton.js';
import { HUD } from './ui/hud.js';
import Sfx from './sfx.js';
import {
  ROAD_HALF, ROAD_WIDTH,
  COLLAPSE_INITIAL_GAP, COLLAPSE_CREEP, COLLAPSE_CREEP_GROWTH,
  GIANT_INTERVAL, GIANT_TELEGRAPH, GIANT_STEP, GIANT_SAFE,
} from './constants.js';

const PLAYER_RADIUS = 0.7;

export class Game {
  constructor(root) {
    this.root = root;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a14);
    root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0a14, 120, 260);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.gameOver = false;

    this.sfx = new Sfx();

    this.setupLights();
    this.setupGround();

    this.road = new RoadSystem(this.scene);
    this.effects = new EffectSystem(this.scene);
    this.player = new Player(this.scene);
    this.player.onStep = () => this.sfx.footstep();
    this.chase = new ChaseCamera(this.camera, this.player.mesh);

    this.meteors = new MeteorSystem(this.scene, this.player.mesh);
    this.meteors.onImpact = (x, y, z, radius) => {
      this.effects.explode(x, y, z, 1.0 + (radius - 1) * 0.4);
      this.sfx.impact();
    };
    this.meteors.onTelegraph = () => this.sfx.warning();
    this.meteors.onFallStart = () => this.sfx.whoosh();
    this.meteors.onGiantImpact = (x, z) => this.onGiantImpact(x, z);

    // 붕괴 경계 (z<collapseZ 는 무너진 길). 안개 너머에서 시작해 +Z로 전진.
    this.collapseZ = this.player.mesh.position.z - COLLAPSE_INITIAL_GAP;
    this._giantAccum = 0;

    this.joystick = new Joystick(root, () => this.sfx.resume());
    this.jumpBtn = new JumpButton(root, () => {
      this.player.jump();
      this.sfx.resume();
      this.sfx.whoosh();
    });
    this.hud = new HUD(root, this.sfx);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x99bbff, 0x202040, 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);
  }

  setupGround() {
    // 도시 너머 빈 공간을 메우는 거대 바닥
    const geo = new THREE.PlaneGeometry(1400, 1400);
    const mat = new THREE.MeshLambertMaterial({ color: 0x191922 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.62;
    this.ground = ground;
    this.scene.add(ground);
  }

  handleResize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.joystick.handleResize(w, h);
  }

  start() { this.tick(); }

  onGiantImpact(x, z) {
    // 붕괴 경계를 거대 운석 착지점까지 전진 (플레이어 쪽으로)
    this.collapseZ = Math.max(this.collapseZ, z);
    // 길 전체 폭 대폭발
    for (let i = -2; i <= 2; i++) {
      this.effects.explode(i * (ROAD_HALF / 2), 1.5, z + (Math.random() - 0.5) * 5, 2.2);
    }
    this.sfx.bigImpact();
    this.chase.shake(1.8);
  }

  tick = () => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.gameOver) {
      this.elapsed += dt;

      const input = this.joystick.getInput();
      this.player.update(dt, input);

      const pz = this.player.mesh.position.z;

      // 붕괴 경계 평상시 전진(creep)
      this.collapseZ += (COLLAPSE_CREEP + this.elapsed * COLLAPSE_CREEP_GROWTH) * dt;

      // 5초마다 거대 운석 — 길 전방(경계보다 플레이어 쪽으로 한 칸)에 강타
      this._giantAccum += dt;
      if (this._giantAccum >= GIANT_INTERVAL) {
        this._giantAccum -= GIANT_INTERVAL;
        const giantZ = Math.min(this.collapseZ + GIANT_STEP, pz - GIANT_SAFE);
        this.meteors.launchGiant(giantZ, GIANT_TELEGRAPH);
        this.sfx.siren();
      }

      this.meteors.update(dt, this.elapsed);
      this.road.update(dt, pz, this.collapseZ);
      this.chase.update(dt);
      this.effects.update(dt);
      this.jumpBtn.update(dt);

      // 붕괴에 휩쓸림 (무너진 길에 닿음)
      if (pz <= this.collapseZ) {
        this.triggerGameOver('🏙️ 무너지는 길에 휩쓸렸다');
      } else {
        this.checkCollisions();
      }

      this.hud.setTime(this.elapsed);
      this.hud.setScore(Math.floor(this.elapsed * 10));
    } else {
      this.effects.update(dt);
      this.chase.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  };

  checkCollisions() {
    const pPos = this.player.mesh.position;
    const pcy = pPos.y + 0.9;
    for (const m of this.meteors.active) {
      if (m.telegraph > 0) continue;
      const dx = m.mesh.position.x - pPos.x;
      const dy = m.mesh.position.y - pcy;
      const dz = m.mesh.position.z - pPos.z;
      const sum = m.radius + PLAYER_RADIUS;
      if (dx * dx + dy * dy + dz * dz < sum * sum) {
        this.triggerGameOver('☄️ 운석에 맞았다');
        return;
      }
    }
  }

  triggerGameOver(cause) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.sfx.gameOver();
    const p = this.player.mesh.position;
    this.effects.explode(p.x, 1, p.z, 1.5);
    this.hud.showGameOver(this.elapsed, () => {
      this.sfx.click();
      this.restart();
    }, cause);
  }

  restart() {
    this.elapsed = 0;
    this.gameOver = false;
    this._giantAccum = 0;
    this.player.reset();
    this.meteors.reset();
    this.effects.reset();
    this.road.reset();
    this.collapseZ = this.player.mesh.position.z - COLLAPSE_INITIAL_GAP;
    this.hud.hideGameOver();
  }
}
