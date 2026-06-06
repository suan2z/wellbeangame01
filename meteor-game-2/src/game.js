import * as THREE from 'three';
import { RoadSystem } from './scenes/road.js';
import { Player } from './objects/player.js';
import { MeteorSystem } from './systems/meteors.js';
import { ChaseCamera } from './systems/camera.js';
import { EffectSystem } from './systems/effects.js';
import { DestructionWall } from './systems/destruction.js';
import { Joystick } from './ui/joystick.js';
import { JumpButton } from './ui/jumpbutton.js';
import { HUD } from './ui/hud.js';
import Sfx from './sfx.js';
import {
  ROAD_HALF, RUN_SPEED_BASE, RUN_SPEED_GROWTH,
  GIANT_INTERVAL, GIANT_TELEGRAPH, GIANT_IMPACT_Z, GIANT_SURGE_BASE, GIANT_SURGE_GROWTH,
} from './constants.js';

const PLAYER_RADIUS = 0.7;

export class Game {
  constructor(root) {
    this.root = root;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a0d0a);
    root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a0d0a, 90, 250);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 600);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.distance = 0;
    this.gameOver = false;

    this.sfx = new Sfx();

    this.setupLights();
    this.setupBackdrop();

    this.road = new RoadSystem(this.scene);
    this.effects = new EffectSystem(this.scene);
    this.destruction = new DestructionWall(this.scene);
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
    const hemi = new THREE.HemisphereLight(0xffb890, 0x301810, 0.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd0a0, 0.8);
    sun.position.set(20, 70, 40);
    this.scene.add(sun);
    // 등 뒤 화염의 붉은 반사광
    this.fireLight = new THREE.PointLight(0xff5520, 0.0, 120, 2);
    this.fireLight.position.set(0, 8, 16);
    this.scene.add(this.fireLight);
  }

  setupBackdrop() {
    // 도시 너머 빈 공간을 메우는 거대 바닥
    const geo = new THREE.PlaneGeometry(1200, 1200);
    const mat = new THREE.MeshLambertMaterial({ color: 0x15121a });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
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
    // 길 전체 폭에 걸친 대폭발
    for (let i = -2; i <= 2; i++) {
      this.effects.explode(x + i * (ROAD_HALF / 2), 1.5, z + (Math.random() - 0.5) * 6, 2.4);
    }
    this.sfx.bigImpact();
    this.chase.shake(2.2);
    const surge = GIANT_SURGE_BASE + this.elapsed * GIANT_SURGE_GROWTH;
    this.destruction.surge(surge);
  }

  tick = () => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.gameOver) {
      this.elapsed += dt;
      const runSpeed = RUN_SPEED_BASE + this.elapsed * RUN_SPEED_GROWTH;
      const scrollDist = runSpeed * dt;
      this.distance += scrollDist;

      const input = this.joystick.getInput();
      this.player.update(dt, input, 1);

      this.road.update(dt, scrollDist, this.destruction.wallZ);

      // 5초마다 거대 운석 발사 (현재 화염벽 위치를 강타)
      this._giantAccum += dt;
      if (this._giantAccum >= GIANT_INTERVAL) {
        this._giantAccum -= GIANT_INTERVAL;
        // 화면 위(-Z, 전방·멀리)에 강타 → 지나온 도시 파괴
        this.meteors.launchGiant(-GIANT_IMPACT_Z, GIANT_TELEGRAPH);
        this.sfx.siren();
      }

      this.meteors.update(dt, this.elapsed);

      const engulfed = this.destruction.update(dt);

      // 등 뒤 화염 반사광 (가까울수록 강함)
      this.fireLight.intensity = 0.4 + this.destruction.danger * 2.2;
      this.fireLight.position.z = this.destruction.wallZ;

      this.chase.update(dt);
      this.effects.update(dt);
      this.jumpBtn.update(dt);

      if (engulfed) {
        this.triggerGameOver('🔥 파괴의 화염에 삼켜졌다');
      } else {
        this.checkCollisions();
      }

      this.hud.setDistance(this.distance);
      this.hud.setTime(this.elapsed);
      this.hud.setDanger(this.destruction.danger);
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
      if (m.mesh.position.y > 6) continue;
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
    this.effects.explode(p.x, 1, p.z, 1.6);
    this.hud.showGameOver(this.distance, this.elapsed, cause, () => {
      this.sfx.click();
      this.restart();
    });
  }

  restart() {
    this.elapsed = 0;
    this.distance = 0;
    this.gameOver = false;
    this._giantAccum = 0;
    this.player.reset();
    this.meteors.reset();
    this.effects.reset();
    this.destruction.reset();
    this.road.reset();
    this.hud.hideGameOver();
  }
}
