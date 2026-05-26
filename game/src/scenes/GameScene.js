import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H * 0.68;
const PLAYER_SPEED = 800;
const ENEMY_SPAWN_INTERVAL = 60;
const HISCORE_KEY = 'lane-defense:hiscore';

const ZONE_W = WORLD_W * 0.15;
const COMBAT_LEFT = ZONE_W;
const COMBAT_RIGHT = WORLD_W - ZONE_W;
const PLAYABLE_LEFT = 24;
const PLAYABLE_RIGHT = WORLD_W - 24;

const SQUAD_MAX = 12;
const SQUAD_SPAWN_INVULN_MS = 500;

const ENEMY_TYPES = [
  { key: 'normal', tex: 'tex_enemy_normal', radius: 22, color: 0xff5577, hp: 1, speed: 30, score: 1, weight: 100 },
];

const BOSS_STAGES = [
  { stage: 1, tex: 'tex_boss_1', radius: 45, color: 0xff9933, hp: 50,  speed: 30, score: 50 },
  { stage: 2, tex: 'tex_boss_2', radius: 55, color: 0xff5577, hp: 100, speed: 30, score: 100 },
  { stage: 3, tex: 'tex_boss_3', radius: 65, color: 0x9933ff, hp: 200, speed: 30, score: 250 },
  { stage: 4, tex: 'tex_boss_4', radius: 75, color: 0x4c4cff, hp: 400, speed: 30, score: 500 },
  { stage: 5, tex: 'tex_boss_5', radius: 90, color: 0x222222, hp: 800, speed: 30, score: 1000 },
];

const BOSS_INITIAL_DELAY_MS = 10000;
const BOSS_RESPAWN_DELAY_MS = 5000;

// 보스는 이 Y까지 내려와 멈춘 뒤 탄막 발사
const BOSS_HOLD_Y = 200;
const BOSS_BULLET_SPEED = 200;
// 단계별 탄막 패턴 (down = 90도)
const BOSS_PATTERNS = [
  { interval: 1800, count: 1, spread: 0,   aimed: true,  radial: false }, // 1: 조준 단발
  { interval: 1700, count: 3, spread: 44,  aimed: false, radial: false }, // 2: 3-way
  { interval: 1500, count: 5, spread: 70,  aimed: false, radial: false }, // 3: 5-way
  { interval: 1300, count: 3, spread: 18,  aimed: true,  radial: false }, // 4: 조준 점사
  { interval: 1200, count: 10, spread: 0,  aimed: false, radial: true  }, // 5: 전방위
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
  { key: 'pistol',  name: '권총',     damage: 1, interval: 300, speed: 700, count: 1, spread: 0,  color: 0xffe066 },
  { key: 'smg',     name: '기관단총', damage: 1, interval: 150, speed: 700, count: 1, spread: 0,  color: 0x4cffc2 },
  { key: 'shotgun', name: '샷건',     damage: 1, interval: 600, speed: 620, count: 5, spread: 35, color: 0xff9933 },
  { key: 'rifle',   name: '라이플',   damage: 3, interval: 350, speed: 850, count: 1, spread: 0,  color: 0x4cc2ff },
  { key: 'mg',      name: '기관총',   damage: 2, interval: 100, speed: 700, count: 1, spread: 0,  color: 0xff5577 },
];

const STARTING_WEAPON_KEY = 'pistol';

function getWeapon(key) {
  return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0];
}

// 부대원 아이템: 좌/우 랜덤, 3~5초 간격
const SQUAD_ITEM_LEFT_X  = ZONE_W / 2;
const SQUAD_ITEM_RIGHT_X = WORLD_W - ZONE_W / 2;
const SQUAD_ITEM_SPAWN_MIN_MS = 3000;
const SQUAD_ITEM_SPAWN_MAX_MS = 5000;
const SQUAD_ITEM_FALL_SPEED = 90;
const STARTING_SQUAD = 3;

// 부대원 아이템 종류: -1 / +1 / +2 / ?
const SQUAD_ITEM_TYPES = [
  { type: 'minus',    value: -1,   label: '-1', color: 0xff3300, weight: 15 },
  { type: 'plus1',   value:  1,   label: '+1', color: 0x3ad27a, weight: 40 },
  { type: 'plus2',   value:  2,   label: '+2', color: 0x44ffaa, weight: 30 },
  { type: 'question', value: null, label: ' ?', color: 0xffcc00, weight: 15 },
];

function pickSquadItemType() {
  const total = SQUAD_ITEM_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Phaser.Math.Between(0, total - 1);
  for (const t of SQUAD_ITEM_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return SQUAD_ITEM_TYPES[1];
}

// 무기 상자: 전투 구역을 3등분한 레인에서 등장
const COMBAT_ZONE_W = COMBAT_RIGHT - COMBAT_LEFT;
const LANE_W = COMBAT_ZONE_W / 3;
const WEAPON_BOX_SPAWN_XS = [
  COMBAT_LEFT + LANE_W * 0.5,
  COMBAT_LEFT + LANE_W * 1.5,
  COMBAT_LEFT + LANE_W * 2.5,
];
const WEAPON_BOX_SPAWN_MS   = 10000;
const WEAPON_BOX_RADIUS     = Math.round(LANE_W * 0.43); // 레인 폭의 약 86%
const WEAPON_BOX_KILL_RADIUS = WEAPON_BOX_RADIUS + 15;
const WEAPON_BOX_FALL_SPEED = 100;
const WEAPON_BOX_BASE_HP    = 5;
const WEAPON_BOX_HP_SCALE   = 3; // 단계당 증가량

// 30초마다 단계 상승 → 무기 상자 체력 증가
const STAGE_ADVANCE_MS = 30000;

const WEAPON_PICKUP_RADIUS    = 16;
const WEAPON_PICKUP_FALL_SPEED = 70;

function loadHiScore() {
  try {
    const raw = globalThis.localStorage?.getItem(HISCORE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

function saveHiScore(score) {
  try { globalThis.localStorage?.setItem(HISCORE_KEY, String(score)); } catch {}
}

function rgbHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// 해바라기(phyllotaxis) 패턴: 원 안에 균등 분포
function squadOffsets(N) {
  if (N <= 0) return [];
  if (N === 1) return [{ x: 0, y: 0 }];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const R = Math.sqrt(N) * 13;
  return Array.from({ length: N }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / N) * R;
    const theta = i * goldenAngle;
    return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
  });
}

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.makeTriangleTexture('tex_player', 36, 36, 0x4cc2ff);
    this.makeCircleTexture('tex_bullet', 5, 0xffffff);
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) this.makeCircleTexture(t.tex, t.radius, t.color);
    for (const b of BOSS_STAGES)  this.makeCircleTexture(b.tex, b.radius, b.color);
    this.makeCircleTexture('tex_squad_item',    18,                  0xffffff);
    this.makeCircleTexture('tex_weapon_box',    WEAPON_BOX_RADIUS,   0xff2200);
    this.makeCircleTexture('tex_weapon_pickup', WEAPON_PICKUP_RADIUS, 0xffffff);
    this.makeCircleTexture('tex_particle', 4, 0xffffff);
    this.makeCircleTexture('tex_boss_bullet', 8, 0xff3344);
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
    this.score        = 0;
    this.hiScore      = loadHiScore();
    this.gameOver     = false;
    this.weapon       = getWeapon(STARTING_WEAPON_KEY);
    this.invulnUntil  = 0;
    this.targetX      = WORLD_W / 2;
    this.currentBossStage = 0;
    this.activeBoss   = null;
    this.bossRound    = 0;
    this.gameStage    = 0;

    // 배경
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x141532);
    for (let i = 0; i < 60; i++) {
      this.add.image(
        Phaser.Math.Between(0, WORLD_W),
        Phaser.Math.Between(0, WORLD_H),
        'tex_star'
      ).setAlpha(Phaser.Math.FloatBetween(0.2, 0.6));
    }

    // 좌우 영역 (초록 = 부대원 증가)
    this.add.rectangle(ZONE_W / 2,            WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.10);
    this.add.rectangle(WORLD_W - ZONE_W / 2,  WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.10);
    this.add.rectangle(COMBAT_LEFT,  WORLD_H / 2, 1, WORLD_H, 0xffffff, 0.18);
    this.add.rectangle(COMBAT_RIGHT, WORLD_H / 2, 1, WORLD_H, 0xffffff, 0.18);

    // 물리 그룹
    this.squadGroup   = this.physics.add.group();
    this.squad        = [];
    this.addSquadMember(STARTING_SQUAD);

    this.bullets       = this.physics.add.group({ defaultKey: 'tex_bullet',        maxSize: 400 });
    this.enemies       = this.physics.add.group({ defaultKey: 'tex_enemy_normal',  maxSize: 250 });
    this.weaponBoxes   = this.physics.add.group({ defaultKey: 'tex_weapon_box',    maxSize: 10  });
    this.weaponPickups = this.physics.add.group({ defaultKey: 'tex_weapon_pickup', maxSize: 10  });
    this.squadItems    = this.physics.add.group({ defaultKey: 'tex_squad_item',    maxSize: 20  });
    this.bossBullets   = this.physics.add.group({ defaultKey: 'tex_boss_bullet',   maxSize: 120 });

    this.deathEmitter = this.add.particles(0, 0, 'tex_particle', {
      speed: { min: 60, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 350,
      emitting: false,
    });
    this.deathEmitter.setDepth(5);

    this.physics.add.overlap(this.bullets,    this.enemies,       this.onBulletHitEnemy,      null, this);
    this.physics.add.overlap(this.bullets,    this.weaponBoxes,   this.onBulletHitWeaponBox,  null, this);
    this.physics.add.overlap(this.squadGroup, this.enemies,       this.onSquadHitEnemy,        null, this);
    this.physics.add.overlap(this.squadGroup, this.weaponBoxes,   this.onSquadHitWeaponBox,   null, this);
    this.physics.add.overlap(this.squadGroup, this.weaponPickups, this.onSquadHitWeaponPickup, null, this);
    this.physics.add.overlap(this.squadGroup, this.squadItems,    this.onSquadHitSquadItem,    null, this);
    this.physics.add.overlap(this.squadGroup, this.bossBullets,   this.onSquadHitBossBullet,   null, this);

    this.input.on('pointerdown', this.onPointer, this);
    this.input.on('pointerup',   this.onPointer, this);
    this.input.on('pointermove', this.onPointer, this);

    // HUD
    this.scoreText = this.add.text(20, 18, 'SCORE 0', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
    });
    this.hiScoreText = this.add.text(WORLD_W - 20, 18, `BEST ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe066',
    }).setOrigin(1, 0);
    this.squadText = this.add.text(WORLD_W / 2, 18, `부대원 ${this.squad.length}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#3ad27a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.weaponText = this.add.text(WORLD_W / 2, 44, this.weapon.name, {
      fontFamily: 'monospace', fontSize: '14px',
      color: rgbHex(this.weapon.color), fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.bossText = this.add.text(WORLD_W / 2, 62, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff9933', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.rectangle(WORLD_W / 2, (PLAYER_Y + WORLD_H) / 2 + 20, WORLD_W, WORLD_H - PLAYER_Y - 60, 0xffffff, 0.02);
    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 60,
      '드래그로 이동 · 초록 원 = 부대원 · 빨간 원 = 위험!', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff80',
      }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H - 30, '· 터치 영역 ·', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff40',
    }).setOrigin(0.5);

    // 타이머
    this.startShootTimer();

    this.spawnEvent = this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL, loop: true,
      callback: this.spawnEnemy, callbackScope: this,
    });
    this.weaponBoxEvent = this.time.addEvent({
      delay: WEAPON_BOX_SPAWN_MS, loop: true,
      callback: this.spawnWeaponBox, callbackScope: this,
    });
    this.stageEvent = this.time.addEvent({
      delay: STAGE_ADVANCE_MS, loop: true,
      callback: () => { this.gameStage++; }, callbackScope: this,
    });

    this.scheduleNextSquadItem();
    this.time.delayedCall(BOSS_INITIAL_DELAY_MS, () => this.spawnNextBoss());
  }

  // ─── 부대원 아이템 ────────────────────────────────────────

  scheduleNextSquadItem() {
    if (this.gameOver) return;
    const delay = Phaser.Math.Between(SQUAD_ITEM_SPAWN_MIN_MS, SQUAD_ITEM_SPAWN_MAX_MS);
    this.squadItemTimer = this.time.delayedCall(delay, () => this.spawnSquadItem());
  }

  spawnSquadItem() {
    if (this.gameOver) return;
    const active = this.squadItems.getChildren().filter((i) => i.active).length;
    if (active < 5) {
      const def    = pickSquadItemType();
      const spawnX = Phaser.Math.Between(0, 1) === 0 ? SQUAD_ITEM_LEFT_X : SQUAD_ITEM_RIGHT_X;
      const item   = this.squadItems.get(spawnX, -20, 'tex_squad_item');
      if (item) {
        item.enableBody(true, spawnX, -20, true, true);
        item.setTint(def.color);
        item.body.setVelocity(0, SQUAD_ITEM_FALL_SPEED);
        item.setData('type',  def.type);
        item.setData('value', def.value);
        if (!item.label) {
          item.label = this.add.text(spawnX, -20, def.label, {
            fontFamily: 'monospace', fontSize: '14px',
            color: rgbHex(def.color), fontStyle: 'bold',
          }).setOrigin(0.5);
        } else {
          item.label.setVisible(true).setPosition(spawnX, -20)
            .setText(def.label).setColor(rgbHex(def.color));
        }
      }
    }
    this.scheduleNextSquadItem();
  }

  // ─── 보스 ────────────────────────────────────────────────

  spawnNextBoss() {
    if (this.gameOver) return;
    if (this.activeBoss) return;

    const nextStage = this.currentBossStage + 1;
    if (nextStage > BOSS_STAGES.length) {
      // 라운드 전환
      this.bossRound++;
      this.currentBossStage = 0;
      this.bossText.setText(`라운드 ${this.bossRound + 1} 시작!`);
      this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
      return;
    }

    this.currentBossStage = nextStage;
    const def = BOSS_STAGES[nextStage - 1];
    const x   = WORLD_W / 2;
    const boss = this.enemies.get(x, -def.radius, def.tex);
    if (!boss) return;

    boss.setTexture(def.tex);
    boss.enableBody(true, x, -def.radius, true, true);
    boss.body.setSize(def.radius * 2, def.radius * 2, true);
    boss.body.setVelocity(0, def.speed);

    const hpMult  = 1 + this.bossRound * 0.5;
    const actualHp = Math.round(def.hp * hpMult);
    boss.setData('hp',       actualHp);
    boss.setData('maxHp',    actualHp);
    boss.setData('score',    Math.round(def.score * hpMult));
    boss.setData('typeKey',  'boss');
    boss.setData('bossStage', def.stage);
    boss.setData('holding', false);
    this.stopBossFire();

    if (boss.hpBarBg) { boss.hpBarBg.destroy(); boss.hpBarBg = null; }
    if (boss.hpBarFg) { boss.hpBarFg.destroy(); boss.hpBarFg = null; }
    const barW  = def.radius * 2;
    const barBg = this.add.image(x, -def.radius - 10, 'tex_hpbar_bg').setDisplaySize(barW, 8);
    const barFg = this.add.image(x - barW / 2, -def.radius - 10, 'tex_hpbar_fg')
      .setDisplaySize(barW, 8).setOrigin(0, 0.5);
    boss.hpBarBg = barBg;
    boss.hpBarFg = barFg;
    boss.hpBarW  = barW;

    this.activeBoss = boss;
    const rLabel = this.bossRound > 0 ? ` R${this.bossRound + 1}` : '';
    this.bossText.setText(`보스 ${def.stage}/${BOSS_STAGES.length}${rLabel} (HP ${actualHp})`);
    this.tweens.add({ targets: this.bossText, scale: { from: 1.6, to: 1 }, duration: 400 });
  }

  startBossFire() {
    this.stopBossFire();
    const pattern = BOSS_PATTERNS[(this.currentBossStage - 1) % BOSS_PATTERNS.length];
    this.bossFireEvent = this.time.addEvent({
      delay: pattern.interval,
      loop: true,
      callback: this.fireBossPattern,
      callbackScope: this,
    });
  }

  stopBossFire() {
    if (this.bossFireEvent) { this.bossFireEvent.remove(); this.bossFireEvent = null; }
  }

  fireBossPattern() {
    const boss = this.activeBoss;
    if (!boss || !boss.active || this.gameOver) return;
    const p = BOSS_PATTERNS[(this.currentBossStage - 1) % BOSS_PATTERNS.length];
    if (p.radial) {
      for (let i = 0; i < p.count; i++) {
        this.fireBossBullet(boss.x, boss.y, (i / p.count) * 360);
      }
      return;
    }
    let base = 90;
    if (p.aimed) {
      const t = this.squad[0];
      if (t) base = Phaser.Math.RadToDeg(Math.atan2(t.y - boss.y, t.x - boss.x));
    }
    for (let i = 0; i < p.count; i++) {
      const f = p.count > 1 ? (i / (p.count - 1)) - 0.5 : 0;
      this.fireBossBullet(boss.x, boss.y, base + f * p.spread);
    }
  }

  fireBossBullet(x, y, angleDeg) {
    const b = this.bossBullets.get(x, y, 'tex_boss_bullet');
    if (!b) return;
    b.enableBody(true, x, y, true, true);
    const rad = Phaser.Math.DegToRad(angleDeg);
    b.body.setVelocity(Math.cos(rad) * BOSS_BULLET_SPEED, Math.sin(rad) * BOSS_BULLET_SPEED);
  }

  onSquadHitBossBullet(member, bullet) {
    if (this.gameOver) return;
    if (!member.active || !bullet.active) return;
    bullet.disableBody(true, true);
    if (this.time.now < this.invulnUntil) return;
    this.loseSquadMember(member);
  }

  // ─── 부대원 관리 ─────────────────────────────────────────

  addSquadMember(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.squad.length >= SQUAD_MAX) break;
      const m = this.physics.add.sprite(this.targetX, PLAYER_Y, 'tex_player');
      m.body.setSize(28, 28);
      this.squadGroup.add(m);
      this.squad.push(m);
    }
    this.layoutSquad();
    if (this.squadText) this.squadText.setText(`부대원 ${this.squad.length}`);
  }

  layoutSquad() {
    const offsets = squadOffsets(this.squad.length);
    this.squad.forEach((m, i) => {
      m.setData('offsetX', offsets[i].x);
      m.setData('offsetY', offsets[i].y);
    });
  }

  removeSquadMember(member) {
    const idx = this.squad.indexOf(member);
    if (idx < 0) return;
    this.squad.splice(idx, 1);
    member.destroy();
  }

  loseSquadMember(member) {
    const idx = this.squad.indexOf(member);
    if (idx < 0) return;
    this.squad.splice(idx, 1);
    member.destroy();
    this.layoutSquad();
    this.squadText.setText(`부대원 ${this.squad.length}`);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
    if (this.squad.length === 0) this.endGame();
  }

  // ─── 사격 ────────────────────────────────────────────────

  startShootTimer() {
    if (this.shootEvent) this.shootEvent.remove();
    this.shootEvent = this.time.addEvent({
      delay: this.weapon.interval, loop: true,
      callback: this.shoot, callbackScope: this,
    });
  }

  shoot() {
    if (this.gameOver) return;
    const w = this.weapon;
    for (const member of this.squad) {
      if (!member.active) continue;
      for (let i = 0; i < w.count; i++) {
        const t      = w.count > 1 ? (i / (w.count - 1)) - 0.5 : 0;
        const rad    = Phaser.Math.DegToRad(-90 + t * w.spread);
        const bullet = this.bullets.get(member.x, member.y - 18, 'tex_bullet');
        if (!bullet) continue;
        bullet.enableBody(true, member.x, member.y - 18, true, true);
        bullet.setTexture('tex_bullet');
        bullet.setTint(w.color);
        bullet.body.setVelocity(Math.cos(rad) * w.speed, Math.sin(rad) * w.speed);
        bullet.setData('damage', w.damage);
      }
    }
  }

  recycleBullet(b) { b.disableBody(true, true); }

  // ─── 적 스폰 ─────────────────────────────────────────────

  spawnEnemy() {
    if (this.gameOver) return;
    const x    = Phaser.Math.Between(COMBAT_LEFT + 20, COMBAT_RIGHT - 20);
    const type = pickEnemyType();
    const enemy = this.enemies.get(x, -type.radius, type.tex);
    if (!enemy) return;
    enemy.setTexture(type.tex);
    enemy.enableBody(true, x, -type.radius, true, true);
    enemy.body.setSize(type.radius * 2, type.radius * 2, true);
    enemy.body.setVelocity(0, type.speed);
    enemy.setData('hp',      type.hp);
    enemy.setData('maxHp',   type.hp);
    enemy.setData('score',   type.score);
    enemy.setData('typeKey', type.key);
    enemy.setData('bossStage', 0);
    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
  }

  // ─── 무기 상자 ───────────────────────────────────────────

  spawnWeaponBox() {
    if (this.gameOver) return;
    const spawnX = WEAPON_BOX_SPAWN_XS[Phaser.Math.Between(0, WEAPON_BOX_SPAWN_XS.length - 1)];
    const startY = -WEAPON_BOX_RADIUS * 2;
    const box    = this.weaponBoxes.get(spawnX, startY, 'tex_weapon_box');
    if (!box) return;

    box.enableBody(true, spawnX, startY, true, true);
    box.body.setSize(WEAPON_BOX_RADIUS * 2, WEAPON_BOX_RADIUS * 2, true);
    box.body.setVelocity(0, WEAPON_BOX_FALL_SPEED);

    const minHp = WEAPON_BOX_BASE_HP + this.gameStage * WEAPON_BOX_HP_SCALE;
    const maxHp = minHp + 4 + Math.floor(this.gameStage * 2);
    const hp    = Phaser.Math.Between(minHp, maxHp);
    box.setData('hp',    hp);
    box.setData('maxHp', hp);

    const droppedWeapon = WEAPONS[Phaser.Math.Between(0, WEAPONS.length - 1)];
    box.setData('weaponKey', droppedWeapon.key);

    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    const barW  = WEAPON_BOX_RADIUS * 2;
    const barBg = this.add.image(spawnX, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_bg').setDisplaySize(barW, 6);
    const barFg = this.add.image(spawnX - barW / 2, startY - WEAPON_BOX_RADIUS - 8, 'tex_hpbar_fg')
      .setDisplaySize(barW, 6).setOrigin(0, 0.5);
    box.hpBarBg = barBg;
    box.hpBarFg = barFg;
    box.hpBarW  = barW;

    if (!box.label) {
      box.label = this.add.text(spawnX, startY, droppedWeapon.name, {
        fontFamily: 'monospace', fontSize: '11px',
        color: rgbHex(droppedWeapon.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      box.label.setVisible(true).setPosition(spawnX, startY)
        .setText(droppedWeapon.name).setColor(rgbHex(droppedWeapon.color));
    }
  }

  killWeaponBox(box, spawnPickup = false) {
    if (spawnPickup) {
      const weaponKey = box.getData('weaponKey');
      if (weaponKey) this.spawnWeaponPickup(box.x, box.y, weaponKey);
    }
    if (box.hpBarBg) { box.hpBarBg.destroy(); box.hpBarBg = null; }
    if (box.hpBarFg) { box.hpBarFg.destroy(); box.hpBarFg = null; }
    if (box.label)   box.label.setVisible(false);
    box.disableBody(true, true);
  }

  spawnWeaponPickup(x, y, weaponKey) {
    const w    = getWeapon(weaponKey);
    const item = this.weaponPickups.get(x, y, 'tex_weapon_pickup');
    if (!item) return;
    item.enableBody(true, x, y, true, true);
    item.setTint(w.color);
    item.body.setVelocity(0, WEAPON_PICKUP_FALL_SPEED);
    item.setData('weaponKey', weaponKey);
    if (!item.label) {
      item.label = this.add.text(x, y, w.name, {
        fontFamily: 'monospace', fontSize: '13px',
        color: rgbHex(w.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      item.label.setVisible(true).setPosition(x, y).setText(w.name).setColor(rgbHex(w.color));
    }
  }

  equipWeapon(weaponKey) {
    const next = getWeapon(weaponKey);
    this.weapon = next;
    this.weaponText.setText(next.name);
    this.weaponText.setColor(rgbHex(next.color));
    this.tweens.add({ targets: this.weaponText, scale: { from: 1.6, to: 1 }, duration: 250 });
    this.startShootTimer();
  }

  // ─── 충돌 핸들러 ─────────────────────────────────────────

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    const hp = enemy.getData('hp') - damage;
    if (hp <= 0) {
      const reward  = enemy.getData('score') ?? 1;
      const wasBoss = enemy === this.activeBoss;
      this.showScorePopup(enemy.x, enemy.y, reward, wasBoss);
      this.deathEmitter.explode(wasBoss ? 28 : 8, enemy.x, enemy.y);
      this.cameras.main.shake(wasBoss ? 300 : 60, wasBoss ? 0.02 : 0.004);
      this.killEnemy(enemy);
      this.score += reward;
      this.scoreText.setText(`SCORE ${this.score}`);
      if (this.score > this.hiScore) {
        this.hiScore = this.score;
        this.hiScoreText.setText(`BEST ${this.hiScore}`);
      }
      if (wasBoss) {
        this.activeBoss = null;
        this.stopBossFire();
        this.clearBossBullets();
        this.bossText.setText(`다음 보스: ${BOSS_RESPAWN_DELAY_MS / 1000}초 후`);
        this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
      }
    } else {
      enemy.setData('hp', hp);
      this.refreshHpBar(enemy);
      this.flashEnemy(enemy);
      if (enemy === this.activeBoss) {
        const maxHp  = enemy.getData('maxHp');
        const def    = BOSS_STAGES[this.currentBossStage - 1];
        const rLabel = this.bossRound > 0 ? ` R${this.bossRound + 1}` : '';
        this.bossText.setText(`보스 ${def.stage}/${BOSS_STAGES.length}${rLabel} (HP ${hp}/${maxHp})`);
      }
    }
  }

  onBulletHitWeaponBox(bullet, box) {
    if (!bullet.active || !box.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    const hp = box.getData('hp') - damage;
    if (hp <= 0) {
      this.deathEmitter.explode(14, box.x, box.y);
      this.cameras.main.shake(80, 0.006);
      this.killWeaponBox(box, true);
    } else {
      box.setData('hp', hp);
      this.refreshHpBar(box);
      this.flashEnemy(box);
    }
  }

  onSquadHitEnemy(member, enemy) {
    if (this.gameOver) return;
    if (!member.active || !enemy.active) return;
    if (this.time.now < this.invulnUntil) return;
    if (enemy !== this.activeBoss) this.killEnemy(enemy);
    this.loseSquadMember(member);
  }

  onSquadHitWeaponBox(member, box) {
    if (!box.active || this.gameOver) return;
    const bx = box.x, by = box.y;
    const r2 = WEAPON_BOX_KILL_RADIUS * WEAPON_BOX_KILL_RADIUS;
    const toKill = this.squad.filter((m) => {
      if (!m.active) return false;
      const dx = m.x - bx, dy = m.y - by;
      return dx * dx + dy * dy <= r2;
    });
    this.killWeaponBox(box, false);
    if (toKill.length === 0) return;
    toKill.forEach((m) => this.removeSquadMember(m));
    this.layoutSquad();
    this.squadText.setText(`부대원 ${this.squad.length}`);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.4, to: 1 }, duration: 200 });
    this.invulnUntil = this.time.now + SQUAD_SPAWN_INVULN_MS;
    this.squad.forEach((m) => m.setAlpha(0.5));
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => this.squad.forEach((m) => m.setAlpha(1)));
    if (this.squad.length === 0) this.endGame();
  }

  onSquadHitWeaponPickup(_member, item) {
    if (!item.active) return;
    const weaponKey = item.getData('weaponKey');
    if (item.label) item.label.setVisible(false);
    item.disableBody(true, true);
    this.equipWeapon(weaponKey);
  }

  onSquadHitSquadItem(_member, item) {
    if (!item.active) return;
    const type = item.getData('type');
    if (item.label) item.label.setVisible(false);
    item.disableBody(true, true);

    let value = type === 'question'
      ? Phaser.Math.Between(-1, 2)
      : item.getData('value');

    if (value > 0) {
      this.addSquadMember(value);
      this.tweens.add({ targets: this.squadText, scale: { from: 1.6, to: 1 }, duration: 250 });
    } else if (value < 0 && this.squad.length > 0) {
      const victim = this.squad[Phaser.Math.Between(0, this.squad.length - 1)];
      this.loseSquadMember(victim);
    }
  }

  clearBossBullets() {
    this.bossBullets.getChildren().forEach((b) => {
      if (b.active) b.disableBody(true, true);
    });
  }

  onBossEscape(boss) {
    this.activeBoss = null;
    this.stopBossFire();
    this.clearBossBullets();
    this.bossText.setText(`보스 탈출! ${BOSS_RESPAWN_DELAY_MS / 1000}초 후 재등장`);
    this.time.delayedCall(BOSS_RESPAWN_DELAY_MS, () => this.spawnNextBoss());
    this.killEnemy(boss);
  }

  // ─── 유틸리티 ────────────────────────────────────────────

  refreshHpBar(target) {
    if (!target.hpBarFg) return;
    const ratio = Math.max(0, target.getData('hp') / target.getData('maxHp'));
    target.hpBarFg.setDisplaySize(target.hpBarW * ratio, target.hpBarFg.displayHeight);
  }

  killEnemy(enemy) {
    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
    enemy.disableBody(true, true);
  }

  flashEnemy(obj) {
    obj.setTintFill(0xffffff);
    this.time.delayedCall(50, () => {
      if (obj.active) obj.clearTint();
    });
  }

  showScorePopup(x, y, points, big = false) {
    const text = this.add.text(x, y, `+${points}`, {
      fontFamily: 'monospace',
      fontSize: big ? '36px' : '16px',
      color: big ? '#ffe066' : '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: text,
      y: y - (big ? 80 : 40),
      alpha: 0,
      duration: big ? 1200 : 700,
      onComplete: () => text.destroy(),
    });
  }

  onPointer(pointer) {
    if (this.gameOver) return;
    if (!pointer.isDown) return;
    this.targetX = Phaser.Math.Clamp(pointer.x, PLAYABLE_LEFT, PLAYABLE_RIGHT);
    if (this.hintText.alpha > 0)
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
  }

  // ─── 게임 오버 ───────────────────────────────────────────

  endGame() {
    this.gameOver = true;
    if (this.shootEvent)      this.shootEvent.remove();
    if (this.spawnEvent)      this.spawnEvent.remove();
    if (this.weaponBoxEvent)  this.weaponBoxEvent.remove();
    if (this.stageEvent)      this.stageEvent.remove();
    if (this.squadItemTimer)  this.squadItemTimer.remove();
    this.stopBossFire();
    this.physics.pause();

    // 네이티브 DOM 이벤트로 재시작 — Phaser 입력 시스템 우회
    window.setTimeout(() => {
      const handler = () => {
        document.removeEventListener('pointerdown', handler);
        document.removeEventListener('touchstart',  handler);
        this.scene.restart();
      };
      document.addEventListener('pointerdown', handler, { once: true });
      document.addEventListener('touchstart',  handler, { once: true });
    }, 600);

    saveHiScore(this.hiScore);
    const newRecord = this.score > 0 && this.score === this.hiScore;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 80, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '56px', color: '#ff5577',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, `점수: ${this.score}`, {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 20, `최고: ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffe066',
    }).setOrigin(0.5);
    if (newRecord) {
      this.add.text(WORLD_W / 2, WORLD_H / 2 + 60, '★ 신기록! ★', {
        fontFamily: 'monospace', fontSize: '26px', color: '#4cc2ff',
      }).setOrigin(0.5);
    }

    const btnY = WORLD_H / 2 + 140;
    const btnBg = this.add.rectangle(WORLD_W / 2, btnY, 320, 96, 0x4cc2ff, 0.35)
      .setStrokeStyle(5, 0xffffff, 1);
    this.add.text(WORLD_W / 2, btnY, '▶ 다시하기', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: btnBg, alpha: { from: 1, to: 0.55 },
      duration: 700, yoyo: true, repeat: -1,
    });
  }

  // ─── 매 프레임 ───────────────────────────────────────────

  update(_, deltaMs) {
    if (this.gameOver) return;
    const dt      = deltaMs / 1000;
    const maxStep = PLAYER_SPEED * dt;

    this.squad.forEach((m) => {
      if (!m.active) return;
      const wantX = this.targetX + (m.getData('offsetX') ?? 0);
      const wantY = PLAYER_Y    + (m.getData('offsetY') ?? 0);
      m.x += Phaser.Math.Clamp(wantX - m.x, -maxStep, maxStep);
      m.y += Phaser.Math.Clamp(wantY - m.y, -maxStep, maxStep);
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30)
        this.recycleBullet(b);
    });

    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      if (e.hpBarBg) {
        e.hpBarBg.x  = e.x;
        e.hpBarBg.y  = e.y - e.displayHeight / 2 - 8;
        e.hpBarFg.x  = e.x - e.hpBarW / 2;
        e.hpBarFg.y  = e.hpBarBg.y;
      }
      if (e.y > WORLD_H + 30) {
        if (e === this.activeBoss) this.onBossEscape(e);
        else this.killEnemy(e);
      }
    });

    this.weaponBoxes.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.label)   { b.label.x = b.x; b.label.y = b.y; }
      if (b.hpBarBg) {
        b.hpBarBg.x = b.x;
        b.hpBarBg.y = b.y - WEAPON_BOX_RADIUS - 8;
        b.hpBarFg.x = b.x - b.hpBarW / 2;
        b.hpBarFg.y = b.hpBarBg.y;
      }
      if (b.y > WORLD_H + 30) this.killWeaponBox(b);
    });

    const trackItem = (it) => {
      if (!it.active) return;
      if (it.label) { it.label.x = it.x; it.label.y = it.y; }
      if (it.y > WORLD_H + 30) {
        if (it.label) it.label.setVisible(false);
        it.disableBody(true, true);
      }
    };
    this.weaponPickups.getChildren().forEach(trackItem);
    this.squadItems.getChildren().forEach(trackItem);

    const boss = this.activeBoss;
    if (boss && boss.active && !boss.getData('holding') && boss.y >= BOSS_HOLD_Y) {
      boss.y = BOSS_HOLD_Y;
      boss.body.setVelocity(0, 0);
      boss.setData('holding', true);
      this.startBossFire();
    }

    this.bossBullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30)
        b.disableBody(true, true);
    });
  }
}
