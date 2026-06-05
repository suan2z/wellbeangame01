import * as THREE from 'three';
import { buildCity } from './scenes/city.js';
import { Player } from './objects/player.js';
import { MeteorSystem } from './systems/meteors.js';
import { ChaseCamera } from './systems/camera.js';
import { Joystick } from './ui/joystick.js';
import { HUD } from './ui/hud.js';

const ARENA_RADIUS = 90;

export class Game {
  constructor(root) {
    this.root = root;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a14);
    this.renderer.shadowMap.enabled = false;
    root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0a14, 120, 260);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.gameOver = false;
    this.score = 0;

    this.setupLights();
    this.setupGround();
    this.city = buildCity(this.scene, ARENA_RADIUS);
    this.player = new Player(this.scene);
    this.chase = new ChaseCamera(this.camera, this.player.mesh);
    this.meteors = new MeteorSystem(this.scene, ARENA_RADIUS);
    this.joystick = new Joystick(root);
    this.hud = new HUD(root);

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
    const groundGeo = new THREE.CircleGeometry(ARENA_RADIUS + 20, 64);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x222230 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // arena boundary ring
    const ringGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.3, ARENA_RADIUS + 0.3, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.scene.add(ring);

    // subtle grid lines on ground (helps motion feel)
    const grid = new THREE.GridHelper(ARENA_RADIUS * 2, 30, 0x444466, 0x222244);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  handleResize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.joystick.handleResize(w, h);
  }

  start() {
    this.tick();
  }

  tick = () => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.gameOver) {
      this.elapsed += dt;
      const input = this.joystick.getInput();
      this.player.update(dt, input, ARENA_RADIUS);
      this.chase.update(dt);
      this.meteors.update(dt, this.elapsed);
      this.checkCollisions();
      this.hud.setTime(this.elapsed);
      this.hud.setScore(Math.floor(this.elapsed * 10));
    }
    this.renderer.render(this.scene, this.camera);
  };

  checkCollisions() {
    const pPos = this.player.mesh.position;
    const pRadius = 0.7;
    for (const m of this.meteors.active) {
      const dx = m.mesh.position.x - pPos.x;
      const dy = m.mesh.position.y - (pPos.y + 0.9);
      const dz = m.mesh.position.z - pPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const sum = m.radius + pRadius;
      if (distSq < sum * sum) {
        this.triggerGameOver();
        return;
      }
    }
  }

  triggerGameOver() {
    this.gameOver = true;
    this.hud.showGameOver(this.elapsed, () => {
      this.restart();
    });
  }

  restart() {
    this.elapsed = 0;
    this.gameOver = false;
    this.player.reset();
    this.meteors.reset();
    this.hud.hideGameOver();
  }
}
