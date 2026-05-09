import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H - 140;
const PLAYER_SPEED = 800;
const BULLET_SPEED = 700;
const BULLET_INTERVAL = 180;
const ENEMY_SPAWN_INTERVAL = 700;
const HISCORE_KEY = 'lane-defense:hiscore';

const ENEMY_TYPES = [
  { key: 'normal', tex: 'tex_enemy_normal', radius: 22, color: 0xff5577, hp: 1, speed: 140, score: 1, weight: 60 },
  { key: 'runner', tex: 'tex_enemy_runner', radius: 14, color: 0x4cffc2, hp: 1, speed: 230, score: 2, weight: 25 },
  { key: 'tanker', tex: 'tex_enemy_tanker', radius: 32, color: 0xa1356b, hp: 5, speed: 90, score: 5, weight: 15 },
];

function pickEnemyType() {
  const total = ENEMY_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Phaser.Math.Between(0, total - 1);
  for (const t of ENEMY_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return ENEMY_TYPES[0];
}

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
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) {
      this.makeCircleTexture(t.tex, t.radius, t.color);
    }
    this.makeRectTexture('tex_panel_add', GATE_PANEL_W, GATE_PANEL_H, 0x3ad27a);
    this.makeRectTexture('tex_panel_mul', GATE_PANEL_W, GATE_PANEL_H, 0x4cc2ff);
    this.makeRectTexture('tex_hpbar_bg', 64, 6, 0x331122);
    this.makeRectTexture('tex_hpbar_fg', 64, 6, 0xff5577);
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
    const type = pickEnemyType();
    const enemy = this.enemies.create(LANE_X[lane], -type.radius, type.tex);
    const speedBoost = Math.min(this.score * 1.5, 180);
    enemy.body.setVelocity(0, type.speed + speedBoost);
    enemy.setData('hp', type.hp);
    enemy.setData('maxHp', type.hp);
    enemy.setData('score', type.score);
    enemy.setData('typeKey', type.key);

    if (type.hp > 1) {
      const barW = type.radius * 1.8;
      const barBg = this.add.image(enemy.x, enemy.y - type.radius - 8, 'tex_hpbar_bg').setDisplaySize(barW, 6);
      const barFg = this.add.image(enemy.x - barW / 2, enemy.y - type.radius - 8, 'tex_hpbar_fg')
        .setDisplaySize(barW, 6).setOrigin(0, 0.5);
      enemy.hpBarBg = barBg;
      enemy.hpBarFg = barFg;
      enemy.hpBarW = barW;
    }
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
      const reward = enemy.getData('score') ?? 1;
      this.killEnemy(enemy);
      this.score += reward;
      this.scoreText.setText(`SCORE ${this.score}`);
      if (this.score > this.hiScore) {
        this.hiScore = this.score;
        this.hiScoreText.setText(`BEST ${this.hiScore}`);
      }
    } else {
      enemy.setData('hp', hp);
      this.refreshHpBar(enemy);
    }
  }

  refreshHpBar(enemy) {
    if (!enemy.hpBarFg) return;
    const ratio = Math.max(0, enemy.getData('hp') / enemy.getData('maxHp'));
    enemy.hpBarFg.setDisplaySize(enemy.hpBarW * ratio, 6);
  }

  killEnemy(enemy) {
    if (enemy.hpBarBg) enemy.hpBarBg.destroy();
    if (enemy.hpBarFg) enemy.hpBarFg.destroy();
    enemy.destroy();
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
      if (!e.active) return;
      if (e.hpBarBg) {
        e.hpBarBg.x = e.x;
        e.hpBarBg.y = e.y - e.displayHeight / 2 - 8;
        e.hpBarFg.x = e.x - e.hpBarW / 2;
        e.hpBarFg.y = e.hpBarBg.y;
      }
      if (e.y > WORLD_H + 30) this.killEnemy(e);
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
