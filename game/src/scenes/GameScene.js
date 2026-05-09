import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H - 140;
const PLAYER_SPEED = 800;
const BULLET_SPEED = 700;
const BULLET_INTERVAL = 180;
const ENEMY_SPEED = 140;
const ENEMY_SPAWN_INTERVAL = 700;
const HISCORE_KEY = 'lane-defense:hiscore';

const LANE_COUNT = 3;
const LANE_W = WORLD_W / LANE_COUNT;
const LANE_X = [LANE_W * 0.5, LANE_W * 1.5, LANE_W * 2.5];

const FIREPOWER_MAX = 16;
const GATE_SPEED = 110;
const GATE_SPAWN_INTERVAL = 6000;
const GATE_PANEL_W = LANE_W * 0.9;
const GATE_PANEL_H = 80;

const GATE_OP_POOL = [
  { op: 'add', value: 1, label: '+1', color: 0x3ad27a },
  { op: 'add', value: 2, label: '+2', color: 0x3ad27a },
  { op: 'mul', value: 2, label: '×2', color: 0x4cc2ff },
];

function applyOp(power, op, value) {
  const next = op === 'mul' ? power * value : power + value;
  return Phaser.Math.Clamp(Math.floor(next), 1, FIREPOWER_MAX);
}

function laneFromPointerX(x) {
  const idx = Math.floor(x / LANE_W);
  return Phaser.Math.Clamp(idx, 0, LANE_COUNT - 1);
}

function loadHiScore() {
  try {
    const raw = globalThis.localStorage?.getItem(HISCORE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveHiScore(score) {
  try {
    globalThis.localStorage?.setItem(HISCORE_KEY, String(score));
  } catch {}
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.makeTriangleTexture('tex_player', 48, 48, 0x4cc2ff);
    this.makeRectTexture('tex_bullet', 6, 18, 0xffe066);
    this.makeCircleTexture('tex_enemy', 22, 0xff5577);
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    this.makeRectTexture('tex_panel_add', GATE_PANEL_W, GATE_PANEL_H, 0x3ad27a);
    this.makeRectTexture('tex_panel_mul', GATE_PANEL_W, GATE_PANEL_H, 0x4cc2ff);
  }

  makeTriangleTexture(key, w, h, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillTriangle(0, h, w / 2, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeRectTexture(key, w, h, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeCircleTexture(key, radius, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  create() {
    this.score = 0;
    this.hiScore = loadHiScore();
    this.gameOver = false;
    this.currentLane = 1;
    this.firepower = 1;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x141532);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      this.add.image(x, y, 'tex_star').setAlpha(Phaser.Math.FloatBetween(0.2, 0.6));
    }

    for (let i = 1; i < LANE_COUNT; i++) {
      this.add.rectangle(LANE_W * i, WORLD_H / 2, 2, WORLD_H, 0xffffff, 0.08);
    }
    this.laneHighlight = this.add.rectangle(
      LANE_X[this.currentLane], WORLD_H / 2,
      LANE_W, WORLD_H,
      0x4cc2ff, 0.05,
    );

    this.player = this.physics.add.sprite(LANE_X[this.currentLane], PLAYER_Y, 'tex_player');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(40, 40);

    this.targetX = this.player.x;

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.panels = this.physics.add.group();

    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.panels, this.onPlayerHitPanel, null, this);

    this.input.on('pointerdown', this.onPointer, this);
    this.input.on('pointermove', this.onPointer, this);

    this.scoreText = this.add.text(20, 20, 'SCORE 0', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffffff',
    });

    this.hiScoreText = this.add.text(WORLD_W - 20, 20, `BEST ${this.hiScore}`, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffe066',
    }).setOrigin(1, 0);

    this.powerText = this.add.text(WORLD_W / 2, 24, `POWER ${this.firepower}`, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#4cc2ff',
    }).setOrigin(0.5, 0);

    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 50, '터치한 레인으로 이동 · 게이트 통과로 강해진다', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff80',
    }).setOrigin(0.5);

    this.shootEvent = this.time.addEvent({
      delay: BULLET_INTERVAL,
      loop: true,
      callback: this.shoot,
      callbackScope: this,
    });

    this.spawnEvent = this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL,
      loop: true,
      callback: this.spawnEnemy,
      callbackScope: this,
    });

    this.gateEvent = this.time.addEvent({
      delay: GATE_SPAWN_INTERVAL,
      loop: true,
      callback: this.spawnGate,
      callbackScope: this,
    });
  }

  onPointer(pointer) {
    if (!pointer.isDown) return;
    const lane = laneFromPointerX(pointer.x);
    if (lane !== this.currentLane) {
      this.currentLane = lane;
      this.targetX = LANE_X[lane];
      this.laneHighlight.x = LANE_X[lane];
    }
    if (this.hintText.alpha > 0) {
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
    }
  }

  shoot() {
    if (this.gameOver) return;
    const n = this.firepower;
    const spreadStep = 10;
    const totalWidth = (n - 1) * spreadStep;
    const startX = this.player.x - totalWidth / 2;
    for (let i = 0; i < n; i++) {
      const bullet = this.bullets.create(startX + i * spreadStep, this.player.y - 24, 'tex_bullet');
      bullet.body.setVelocity(0, -BULLET_SPEED);
    }
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const lane = Phaser.Math.Between(0, LANE_COUNT - 1);
    const enemy = this.enemies.create(LANE_X[lane], -30, 'tex_enemy');
    const speed = ENEMY_SPEED + Math.min(this.score * 2, 200);
    enemy.body.setVelocity(0, speed);
    enemy.setData('hp', 1);
  }

  spawnGate() {
    if (this.gameOver) return;
    const lanes = Phaser.Utils.Array.Shuffle([0, 1, 2]).slice(0, 2);
    const optionPool = Phaser.Utils.Array.Shuffle([...GATE_OP_POOL]).slice(0, 2);
    const gateId = `g${this.time.now}`;

    lanes.forEach((lane, i) => {
      const def = optionPool[i];
      const tex = def.op === 'mul' ? 'tex_panel_mul' : 'tex_panel_add';
      const panel = this.panels.create(LANE_X[lane], -GATE_PANEL_H / 2, tex);
      panel.body.setVelocity(0, GATE_SPEED);
      panel.setData('gateId', gateId);
      panel.setData('op', def.op);
      panel.setData('value', def.value);
      panel.setAlpha(0.85);

      const label = this.add.text(panel.x, panel.y, def.label, {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      panel.label = label;
    });
  }

  onBulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    const hp = enemy.getData('hp') - 1;
    if (hp <= 0) {
      enemy.destroy();
      this.score += 1;
      this.scoreText.setText(`SCORE ${this.score}`);
      if (this.score > this.hiScore) {
        this.hiScore = this.score;
        this.hiScoreText.setText(`BEST ${this.hiScore}`);
      }
    } else {
      enemy.setData('hp', hp);
    }
  }

  onPlayerHit() {
    if (this.gameOver) return;
    this.endGame();
  }

  onPlayerHitPanel(_player, panel) {
    if (this.gameOver) return;
    if (!panel.active) return;
    const op = panel.getData('op');
    const value = panel.getData('value');
    const gateId = panel.getData('gateId');

    const before = this.firepower;
    this.firepower = applyOp(this.firepower, op, value);
    this.powerText.setText(`POWER ${this.firepower}`);
    if (this.firepower !== before) {
      this.tweens.add({
        targets: this.powerText,
        scale: { from: 1.6, to: 1 },
        duration: 250,
      });
    }

    this.panels.getChildren().slice().forEach((p) => {
      if (p.getData('gateId') === gateId) {
        if (p.label) p.label.destroy();
        p.destroy();
      }
    });
  }

  endGame() {
    this.gameOver = true;
    this.shootEvent.remove();
    this.spawnEvent.remove();
    this.gateEvent.remove();
    this.physics.pause();

    saveHiScore(this.hiScore);
    const newRecord = this.score > 0 && this.score === this.hiScore;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 80, 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ff5577',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, `점수: ${this.score}`, {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 20, `최고: ${this.hiScore}`, {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffe066',
    }).setOrigin(0.5);
    if (newRecord) {
      this.add.text(WORLD_W / 2, WORLD_H / 2 + 60, '★ 신기록! ★', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#4cc2ff',
      }).setOrigin(0.5);
    }

    const btn = this.add.text(WORLD_W / 2, WORLD_H / 2 + 110, '[ 다시하기 ]', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#4cc2ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.scene.restart());
  }

  update(_, deltaMs) {
    if (this.gameOver) return;
    const dt = deltaMs / 1000;
    const dx = this.targetX - this.player.x;
    const step = Phaser.Math.Clamp(dx, -PLAYER_SPEED * dt, PLAYER_SPEED * dt);
    this.player.x += step;

    this.bullets.getChildren().forEach((b) => {
      if (b.active && b.y < -30) b.destroy();
    });
    this.enemies.getChildren().forEach((e) => {
      if (e.active && e.y > WORLD_H + 30) e.destroy();
    });
    this.panels.getChildren().forEach((p) => {
      if (!p.active) return;
      if (p.label) {
        p.label.x = p.x;
        p.label.y = p.y;
      }
      if (p.y > WORLD_H + GATE_PANEL_H) {
        if (p.label) p.label.destroy();
        p.destroy();
      }
    });
  }
}
