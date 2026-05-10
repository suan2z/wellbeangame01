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
  { key: 'normal', tex: 'tex_enemy_normal', radius: 22, color: 0xff5577, hp: 1, speed: 45, score: 1, weight: 60 },
  { key: 'runner', tex: 'tex_enemy_runner', radius: 14, color: 0x4cffc2, hp: 1, speed: 65, score: 2, weight: 25 },
  { key: 'tanker', tex: 'tex_enemy_tanker', radius: 32, color: 0xa1356b, hp: 5, speed: 30, score: 5, weight: 15 },
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

function getWeapon(key) {
  return WEAPONS.find((w) => w.key === key) ?? WEAPONS[0];
}

const BOX_TYPES = [
  { key: 'wood',       order: 1, name: '나무 상자',  color: 0xa17c4c, hp: 3,  weaponKey: 'smg' },
  { key: 'iron',       order: 2, name: '철제 상자',  color: 0x8a8a8a, hp: 8,  weaponKey: 'shotgun' },
  { key: 'reinforced', order: 3, name: '강화 상자',  color: 0x4a4aa8, hp: 15, weaponKey: 'rifle' },
  { key: 'military',   order: 4, name: '군용 상자',  color: 0x2a4a2a, hp: 25, weaponKey: 'mg' },
];

const BOX_X = ZONE_W / 2;
const BOX_W = 68;
const BOX_H = 70;
const BOX_SLOTS_Y = [110, 230, 350, 470];
const BOX_SLOT_TYPES = ['military', 'reinforced', 'iron', 'wood'];
const BOX_RESPAWN_MS = 5000;

function getBoxType(key) {
  return BOX_TYPES.find((b) => b.key === key) ?? BOX_TYPES[0];
}

const SQUAD_ITEM_X = WORLD_W - ZONE_W / 2;
const SQUAD_ITEM_SPAWN_MS = 4500;
const SQUAD_ITEM_FALL_SPEED = 90;
const SQUAD_ITEM_VALUE = 1;

const WEAPON_ITEM_FALL_SPEED = 70;

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

function squadOffsets(N) {
  if (N <= 0) return [];
  if (N === 1) return [{ x: 0, y: 0 }];
  if (N === 2) return [{ x: -14, y: 0 }, { x: 14, y: 0 }];
  const r = Math.min(8 + N * 2.5, 32);
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.makeTriangleTexture('tex_player', 36, 36, 0x4cc2ff);
    this.makeCircleTexture('tex_bullet', 5, 0xffffff);
    this.makeCircleTexture('tex_star', 2, 0xffffff);
    for (const t of ENEMY_TYPES) {
      this.makeCircleTexture(t.tex, t.radius, t.color);
    }
    for (const b of BOX_TYPES) {
      this.makeRectTexture(`tex_box_${b.key}`, BOX_W, BOX_H, b.color);
    }
    this.makeCircleTexture('tex_weapon_item', 14, 0xffffff);
    this.makeCircleTexture('tex_squad_item', 18, 0x3ad27a);
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
    this.weapon = getWeapon(STARTING_WEAPON_KEY);
    this.invulnUntil = 0;
    this.targetX = WORLD_W / 2;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x141532);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      this.add.image(x, y, 'tex_star').setAlpha(Phaser.Math.FloatBetween(0.2, 0.6));
    }

    this.add.rectangle(ZONE_W / 2, WORLD_H / 2, ZONE_W, WORLD_H, 0x4a4a8a, 0.10);
    this.add.rectangle(WORLD_W - ZONE_W / 2, WORLD_H / 2, ZONE_W, WORLD_H, 0x3ad27a, 0.10);
    this.add.rectangle(COMBAT_LEFT, WORLD_H / 2, 1, WORLD_H, 0xffffff, 0.18);
    this.add.rectangle(COMBAT_RIGHT, WORLD_H / 2, 1, WORLD_H, 0xffffff, 0.18);

    this.squadGroup = this.physics.add.group();
    this.squad = [];
    this.addSquadMember();

    this.bullets = this.physics.add.group({
      defaultKey: 'tex_bullet',
      maxSize: 400,
    });
    this.enemies = this.physics.add.group({
      defaultKey: 'tex_enemy_normal',
      maxSize: 250,
    });
    this.boxes = this.physics.add.group();
    this.weaponItems = this.physics.add.group({
      defaultKey: 'tex_weapon_item',
      maxSize: 30,
    });
    this.squadItems = this.physics.add.group({
      defaultKey: 'tex_squad_item',
      maxSize: 20,
    });

    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.bullets, this.boxes, this.onBulletHitBox, null, this);
    this.physics.add.overlap(this.squadGroup, this.enemies, this.onSquadHitEnemy, null, this);
    this.physics.add.overlap(this.squadGroup, this.weaponItems, this.onSquadHitWeaponItem, null, this);
    this.physics.add.overlap(this.squadGroup, this.squadItems, this.onSquadHitSquadItem, null, this);

    this.input.on('pointerdown', this.onPointer, this);
    this.input.on('pointermove', this.onPointer, this);

    this.scoreText = this.add.text(20, 18, 'SCORE 0', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
    });
    this.hiScoreText = this.add.text(WORLD_W - 20, 18, `BEST ${this.hiScore}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe066',
    }).setOrigin(1, 0);
    this.weaponText = this.add.text(WORLD_W / 2, 18, this.weapon.name, {
      fontFamily: 'monospace', fontSize: '20px',
      color: rgbHex(this.weapon.color), fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.squadText = this.add.text(WORLD_W / 2, 44, `부대원 ${this.squad.length}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#3ad27a',
    }).setOrigin(0.5, 0);

    this.add.rectangle(WORLD_W / 2, (PLAYER_Y + WORLD_H) / 2 + 20, WORLD_W, WORLD_H - PLAYER_Y - 60, 0xffffff, 0.02);
    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 60, '드래그로 이동 · 좌측 상자 = 무기 · 우측 = 부대원 +1', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff80',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H - 30, '· 터치 영역 ·', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff40',
    }).setOrigin(0.5);

    BOX_SLOT_TYPES.forEach((typeKey, slotIdx) => {
      this.spawnBox(slotIdx, getBoxType(typeKey));
    });

    this.startShootTimer();

    this.spawnEvent = this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL,
      loop: true,
      callback: this.spawnEnemy,
      callbackScope: this,
    });

    this.squadItemEvent = this.time.addEvent({
      delay: SQUAD_ITEM_SPAWN_MS,
      loop: true,
      callback: this.spawnSquadItem,
      callbackScope: this,
    });
  }

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
    this.time.delayedCall(SQUAD_SPAWN_INVULN_MS, () => {
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
    this.targetX = Phaser.Math.Clamp(pointer.x, PLAYABLE_LEFT, PLAYABLE_RIGHT);
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
        const bullet = this.bullets.get(member.x, member.y - 18, 'tex_bullet');
        if (!bullet) continue;
        bullet.enableBody(true, member.x, member.y - 18, true, true);
        bullet.setTexture('tex_bullet');
        bullet.setTint(w.color);
        bullet.body.setVelocity(vx, vy);
        bullet.setData('damage', w.damage);
      }
    }
  }

  recycleBullet(b) {
    b.disableBody(true, true);
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const x = Phaser.Math.Between(COMBAT_LEFT + 20, COMBAT_RIGHT - 20);
    const type = pickEnemyType();
    const enemy = this.enemies.get(x, -type.radius, type.tex);
    if (!enemy) return;
    enemy.setTexture(type.tex);
    enemy.enableBody(true, x, -type.radius, true, true);
    enemy.body.setSize(type.radius * 2, type.radius * 2, true);
    const speedBoost = Math.min(this.score * 0.3, 40);
    enemy.body.setVelocity(0, type.speed + speedBoost);
    enemy.setData('hp', type.hp);
    enemy.setData('maxHp', type.hp);
    enemy.setData('score', type.score);
    enemy.setData('typeKey', type.key);

    if (enemy.hpBarBg) { enemy.hpBarBg.destroy(); enemy.hpBarBg = null; }
    if (enemy.hpBarFg) { enemy.hpBarFg.destroy(); enemy.hpBarFg = null; }
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

  spawnBox(slotIdx, type) {
    const y = BOX_SLOTS_Y[slotIdx];
    const box = this.boxes.create(BOX_X, y, `tex_box_${type.key}`);
    box.body.setImmovable(true);
    box.body.setVelocity(0, 0);
    box.setData('hp', type.hp);
    box.setData('maxHp', type.hp);
    box.setData('typeKey', type.key);
    box.setData('weaponKey', type.weaponKey);
    box.setData('slotIdx', slotIdx);

    const barW = BOX_W * 0.85;
    const barBg = this.add.image(box.x, box.y - BOX_H / 2 - 8, 'tex_hpbar_bg').setDisplaySize(barW, 5);
    const barFg = this.add.image(box.x - barW / 2, box.y - BOX_H / 2 - 8, 'tex_hpbar_fg')
      .setDisplaySize(barW, 5).setOrigin(0, 0.5);
    box.hpBarBg = barBg;
    box.hpBarFg = barFg;
    box.hpBarW = barW;

    const w = getWeapon(type.weaponKey);
    const label = this.add.text(box.x, box.y, w.name, {
      fontFamily: 'monospace', fontSize: '11px',
      color: rgbHex(w.color), fontStyle: 'bold',
    }).setOrigin(0.5);
    box.label = label;
  }

  scheduleBoxRespawn(slotIdx, typeKey) {
    this.time.delayedCall(BOX_RESPAWN_MS, () => {
      if (this.gameOver) return;
      this.spawnBox(slotIdx, getBoxType(typeKey));
    });
  }

  spawnSquadItem() {
    if (this.gameOver) return;
    const active = this.squadItems.getChildren().filter((i) => i.active).length;
    if (active >= 3) return;
    const item = this.squadItems.get(SQUAD_ITEM_X, -20, 'tex_squad_item');
    if (!item) return;
    item.enableBody(true, SQUAD_ITEM_X, -20, true, true);
    item.body.setVelocity(0, SQUAD_ITEM_FALL_SPEED);
    if (!item.label) {
      item.label = this.add.text(item.x, item.y, '+1', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      item.label.setVisible(true).setText('+1');
    }
  }

  spawnWeaponItem(x, y, weaponKey) {
    const w = getWeapon(weaponKey);
    const item = this.weaponItems.get(x, y, 'tex_weapon_item');
    if (!item) return;
    item.enableBody(true, x, y, true, true);
    item.setTint(w.color);
    item.body.setVelocity(0, WEAPON_ITEM_FALL_SPEED);
    item.setData('weaponKey', weaponKey);
    if (!item.label) {
      item.label = this.add.text(x, y, w.name, {
        fontFamily: 'monospace', fontSize: '11px',
        color: rgbHex(w.color), fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      item.label.setVisible(true).setText(w.name).setColor(rgbHex(w.color));
    }
  }

  recycleItem(item) {
    if (item.label) item.label.setVisible(false);
    item.disableBody(true, true);
  }

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
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

  onBulletHitBox(bullet, box) {
    if (!bullet.active || !box.active) return;
    const damage = bullet.getData('damage') ?? 1;
    this.recycleBullet(bullet);
    const hp = box.getData('hp') - damage;
    if (hp <= 0) {
      const slotIdx = box.getData('slotIdx');
      const typeKey = box.getData('typeKey');
      const weaponKey = box.getData('weaponKey');
      this.spawnWeaponItem(box.x, box.y, weaponKey);
      this.killBox(box);
      this.scheduleBoxRespawn(slotIdx, typeKey);
    } else {
      box.setData('hp', hp);
      this.refreshHpBar(box);
    }
  }

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

  killBox(box) {
    if (box.hpBarBg) box.hpBarBg.destroy();
    if (box.hpBarFg) box.hpBarFg.destroy();
    if (box.label) box.label.destroy();
    box.destroy();
  }

  onSquadHitEnemy(member, enemy) {
    if (this.gameOver) return;
    if (!member.active || !enemy.active) return;
    if (this.time.now < this.invulnUntil) return;
    this.killEnemy(enemy);
    this.loseSquadMember(member);
  }

  onSquadHitWeaponItem(_member, item) {
    if (!item.active) return;
    const weaponKey = item.getData('weaponKey');
    this.equipWeapon(weaponKey);
    this.recycleItem(item);
  }

  equipWeapon(weaponKey) {
    const next = getWeapon(weaponKey);
    if (next.key === this.weapon.key) return;
    this.weapon = next;
    this.weaponText.setText(this.weapon.name);
    this.weaponText.setColor(rgbHex(this.weapon.color));
    this.tweens.add({ targets: this.weaponText, scale: { from: 1.6, to: 1 }, duration: 250 });
    this.startShootTimer();
  }

  onSquadHitSquadItem(_member, item) {
    if (!item.active) return;
    this.recycleItem(item);
    this.addSquadMember(SQUAD_ITEM_VALUE);
    this.tweens.add({ targets: this.squadText, scale: { from: 1.6, to: 1 }, duration: 250 });
  }

  endGame() {
    this.gameOver = true;
    if (this.shootEvent) this.shootEvent.remove();
    if (this.spawnEvent) this.spawnEvent.remove();
    if (this.squadItemEvent) this.squadItemEvent.remove();
    this.physics.pause();

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

    const btn = this.add.text(WORLD_W / 2, WORLD_H / 2 + 110, '[ 다시하기 ]', {
      fontFamily: 'monospace', fontSize: '32px', color: '#4cc2ff',
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
      const wantY = PLAYER_Y + (m.getData('offsetY') ?? 0);
      const dx = wantX - m.x;
      const dy = wantY - m.y;
      m.x += Phaser.Math.Clamp(dx, -maxStep, maxStep);
      m.y += Phaser.Math.Clamp(dy, -maxStep, maxStep);
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.y < -30 || b.y > WORLD_H + 30 || b.x < -30 || b.x > WORLD_W + 30) this.recycleBullet(b);
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
    this.weaponItems.getChildren().forEach((it) => {
      if (!it.active) return;
      if (it.label) {
        it.label.x = it.x;
        it.label.y = it.y;
      }
      if (it.y > WORLD_H + 30) this.recycleItem(it);
    });
    this.squadItems.getChildren().forEach((it) => {
      if (!it.active) return;
      if (it.label) {
        it.label.x = it.x;
        it.label.y = it.y;
      }
      if (it.y > WORLD_H + 30) this.recycleItem(it);
    });
  }
}
