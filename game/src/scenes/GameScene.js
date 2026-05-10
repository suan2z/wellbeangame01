import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H - 140;
const PLAYER_SPEED = 800;
const ENEMY_SPAWN_INTERVAL = 700;
const HISCORE_KEY = 'lane-defense:hiscore';

const SQUAD_MAX = 8;
const SQUAD_SPACING = 28;
const SQUAD_INVULN_MS = 500;

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

const WEAPONS = [
  { key: 'pistol',  name: '권총',     damage: 1, interval: 400, speed: 700, count: 1, spread: 0,  color: 0xffe066 },
  { key: 'smg',     name: '기관단총', damage: 1, interval: 150, speed: 700, count: 1, spread: 0,  color: 0x4cffc2 },
  { key: 'shotgun', name: '샷건',     damage: 1, interval: 600, speed: 620, count: 5, spread: 35, color: 0xff9933 },
  { key: 'rifle',   name: '라이플',   damage: 3, interval: 350, speed: 850, count: 1, spread: 0,  color: 0x4cc2ff },
  { key: 'mg',      name: '기관총',   damage: 2, interval: 100, speed: 700, count: 1, spread: 0,  color: 0xff5577 },
];

const STARTING_WEAPON_KEY = 'pistol';

const SQUAD_BONUSES = [
  { value: 1, label: '+1명' },
  { value: 2, label: '+2명' },
  { value: 3, label: '+3명' },
];

const SQUAD_PANEL_COLOR = 0x3ad27a;

function getWeapon(key) {
  return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0];
}

const LANE_COUNT = 3;
const LANE_W = WORLD_W / LANE_COUNT;
const LANE_X = [LANE_W * 0.5, LANE_W * 1.5, LANE_W * 2.5];

const GATE_SPEED = 110;
const GATE_SPAWN_INTERVAL = 6000;
const GATE_PANEL_W = LANE_W * 0.9;
const GATE_PANEL_H = 90;

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

function rgbHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.makeTriangleTexture('tex_player', 40, 40, 0x4cc2ff);
    this.makeCircleTexture('tex_bullet', 5, 0xffffff);
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) {
      this.makeCircleTexture(t.tex, t.radius, t.color);
    }
    this.makeRectTexture('tex_panel', GATE_PANEL_W, GATE_PANEL_H, 0xffffff);
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
    this.weapon = getWeapon(STARTING_WEAPON_KEY);
    this.invulnUntil = 0;

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

    this.targetX = LANE_X[this.currentLane];
    this.squadGroup = this.physics.add.group();
    this.squad = [];
    this.addSquadMember();

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.panels = this.physics.add.group();

    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.squadGroup, this.enemies, this.onSquadHitEnemy, null, this);
    this.physics.add.overlap(this.squadGroup, this.panels, this.onSquadHitPanel, null, this);

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

    this.weaponText = this.add.text(WORLD_W / 2, 20, this.weapon.name, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: rgbHex(this.weapon.color),
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.squadText = this.add.text(WORLD_W / 2, 48, `부대원 ${this.squad.length}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#3ad27a',
    }).setOrigin(0.5, 0);

    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 50, '터치한 레인으로 이동 · 게이트로 무기/병력 확보', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff80',
    }).setOrigin(0.5);

    this.startShootTimer();

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

  addSquadMember(count = 1) {
    const before = this.squad.length;
    for (let i = 0; i < count; i++) {
      if (this.squad.length >= SQUAD_MAX) break;
      const m = this.physics.add.sprite(this.targetX, PLAYER_Y, 'tex_player');
      m.body.setSize(32, 32);
      m.setData('alive', true);
      this.squadGroup.add(m);
      this.squad.push(m);
    }
    if (this.squad.length !== before) this.layoutSquad();
    if (this.squadText) this.squadText.setText(`부대원 ${this.squad.length}`);
  }

  layoutSquad() {
    const N = this.squad.length;
    const total = (N - 1) * SQUAD_SPACING;
    this.squad.forEach((m, i) => {
      m.setData('offsetX', i * SQUAD_SPACING - total / 2);
    });
  }

  loseSquadMember(member) {
    const idx = this.squad.indexOf(member);
    if (idx < 0) return;
    this.squad.splice(idx, 1);
    member.destroy();
    this.layoutSquad();
    this.squadText.setText(`부대원 ${this.squad.length}`);
    this.tweens.add({
      targets: this.squadText,
      scale: { from: 1.4, to: 1 },
      duration: 200,
    });
    this.invulnUntil = this.time.now + SQUAD_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_INVULN_MS, () => {
      this.squad.forEach((m) => m.setAlpha(1));
    });
    if (this.squad.length === 0) this.endGame();
  }

  startShootTimer() {
    if (this.shootEvent) this.shootEvent.remove();
    this.shootEvent = this.time.addEvent({
      delay: this.weapon.interval,
      loop: true,
      callback: this.shoot,
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
    const w = this.weapon;
    for (const member of this.squad) {
      if (!member.active) continue;
      for (let i = 0; i < w.count; i++) {
        const t = w.count > 1 ? (i / (w.count - 1)) - 0.5 : 0;
        const angleDeg = -90 + t * w.spread;
        const rad = Phaser.Math.DegToRad(angleDeg);
        const vx = Math.cos(rad) * w.speed;
        const vy = Math.sin(rad) * w.speed;
        const bullet = this.bullets.create(member.x, member.y - 22, 'tex_bullet');
        bullet.setTint(w.color);
        bullet.body.setVelocity(vx, vy);
        bullet.setData('damage', w.damage);
      }
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

  buildGateOptions() {
    const weaponOpts = WEAPONS
      .filter((w) => w.key !== this.weapon.key)
      .map((w) => ({ kind: 'weapon', weapon: w }));
    const squadOpts = SQUAD_BONUSES.map((b) => ({ kind: 'squad', value: b.value, label: b.label }));
    return [...weaponOpts, ...squadOpts];
  }

  spawnGate() {
    if (this.gameOver) return;
    const opts = this.buildGateOptions();
    const picks = Phaser.Utils.Array.Shuffle([...opts]).slice(0, 2);
    const lanes = Phaser.Utils.Array.Shuffle([0, 1, 2]).slice(0, 2);
    const gateId = `g${this.time.now}`;

    lanes.forEach((lane, i) => {
      const def = picks[i];
      const panel = this.panels.create(LANE_X[lane], -GATE_PANEL_H / 2, 'tex_panel');
      panel.setAlpha(0.85);
      panel.body.setVelocity(0, GATE_SPEED);
      panel.setData('gateId', gateId);
      panel.setData('def', def);

      let nameText, statText, color;
      if (def.kind === 'weapon') {
        color = def.weapon.color;
        nameText = def.weapon.name;
        statText = `DMG ${def.weapon.damage} · ${def.weapon.interval}ms${def.weapon.count > 1 ? ` ×${def.weapon.count}` : ''}`;
      } else {
        color = SQUAD_PANEL_COLOR;
        nameText = def.label;
        statText = '부대원 충원';
      }
      panel.setTint(color);

      const labelName = this.add.text(panel.x, panel.y - 14, nameText, {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      const labelStat = this.add.text(panel.x, panel.y + 14, statText, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffffcc',
      }).setOrigin(0.5);
      panel.labelName = labelName;
      panel.labelStat = labelStat;
    });
  }

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') ?? 1;
    bullet.destroy();
    const hp = enemy.getData('hp') - damage;
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

  onSquadHitEnemy(member, enemy) {
    if (this.gameOver) return;
    if (!member.active || !enemy.active) return;
    if (this.time.now < this.invulnUntil) return;
    this.killEnemy(enemy);
    this.loseSquadMember(member);
  }

  onSquadHitPanel(_member, panel) {
    if (this.gameOver) return;
    if (!panel.active) return;
    const def = panel.getData('def');
    const gateId = panel.getData('gateId');

    if (def.kind === 'weapon' && def.weapon.key !== this.weapon.key) {
      this.weapon = def.weapon;
      this.weaponText.setText(this.weapon.name);
      this.weaponText.setColor(rgbHex(this.weapon.color));
      this.tweens.add({
        targets: this.weaponText,
        scale: { from: 1.6, to: 1 },
        duration: 250,
      });
      this.startShootTimer();
    } else if (def.kind === 'squad') {
      this.addSquadMember(def.value);
      this.tweens.add({
        targets: this.squadText,
        scale: { from: 1.6, to: 1 },
        duration: 250,
      });
    }

    this.panels.getChildren().slice().forEach((p) => {
      if (p.getData('gateId') === gateId) {
        if (p.labelName) p.labelName.destroy();
        if (p.labelStat) p.labelStat.destroy();
        p.destroy();
      }
    });
  }

  endGame() {
    this.gameOver = true;
    if (this.shootEvent) this.shootEvent.remove();
    if (this.spawnEvent) this.spawnEvent.remove();
    if (this.gateEvent) this.gateEvent.remove();
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
    const maxStep = PLAYER_SPEED * dt;

    this.squad.forEach((m) => {
      if (!m.active) return;
      const wantX = this.targetX + (m.getData('offsetX') ?? 0);
      const dx = wantX - m.x;
      m.x += Phaser.Math.Clamp(dx, -maxStep, maxStep);
      m.y = PLAYER_Y;
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30) b.destroy();
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
      if (p.labelName) {
        p.labelName.x = p.x;
        p.labelName.y = p.y - 14;
      }
      if (p.labelStat) {
        p.labelStat.x = p.x;
        p.labelStat.y = p.y + 14;
      }
      if (p.y > WORLD_H + GATE_PANEL_H) {
        if (p.labelName) p.labelName.destroy();
        if (p.labelStat) p.labelStat.destroy();
        p.destroy();
      }
    });
  }
}
