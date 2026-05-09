import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H - 140;
const PLAYER_SPEED = 600;
const BULLET_SPEED = 700;
const BULLET_INTERVAL = 180;
const ENEMY_SPEED = 140;
const ENEMY_SPAWN_INTERVAL = 700;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.makeTriangleTexture('tex_player', 48, 48, 0x4cc2ff);
    this.makeRectTexture('tex_bullet', 6, 18, 0xffe066);
    this.makeCircleTexture('tex_enemy', 22, 0xff5577);
    this.makeCircleTexture('tex_star', 2, 0xffffff);
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
    this.gameOver = false;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x141532);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      this.add.image(x, y, 'tex_star').setAlpha(Phaser.Math.FloatBetween(0.2, 0.6));
    }

    this.player = this.physics.add.sprite(WORLD_W / 2, PLAYER_Y, 'tex_player');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(40, 40);

    this.targetX = this.player.x;

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);

    this.input.on('pointerdown', this.onPointer, this);
    this.input.on('pointermove', this.onPointer, this);

    this.scoreText = this.add.text(20, 20, 'SCORE 0', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffffff',
    });

    this.hintText = this.add.text(WORLD_W / 2, WORLD_H - 50, '드래그로 좌우 이동', {
      fontFamily: 'monospace',
      fontSize: '22px',
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
  }

  onPointer(pointer) {
    if (!pointer.isDown) return;
    this.targetX = Phaser.Math.Clamp(pointer.x, 30, WORLD_W - 30);
    if (this.hintText.alpha > 0) {
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
    }
  }

  shoot() {
    if (this.gameOver) return;
    const bullet = this.bullets.create(this.player.x, this.player.y - 24, 'tex_bullet');
    bullet.body.setVelocity(0, -BULLET_SPEED);
    bullet.setData('kind', 'bullet');
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const x = Phaser.Math.Between(40, WORLD_W - 40);
    const enemy = this.enemies.create(x, -30, 'tex_enemy');
    const speed = ENEMY_SPEED + Math.min(this.score * 2, 200);
    enemy.body.setVelocity(0, speed);
    enemy.setData('hp', 1);
  }

  onBulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    const hp = enemy.getData('hp') - 1;
    if (hp <= 0) {
      enemy.destroy();
      this.score += 1;
      this.scoreText.setText(`SCORE ${this.score}`);
    } else {
      enemy.setData('hp', hp);
    }
  }

  onPlayerHit() {
    if (this.gameOver) return;
    this.endGame();
  }

  endGame() {
    this.gameOver = true;
    this.shootEvent.remove();
    this.spawnEvent.remove();
    this.physics.pause();

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6);
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 60, 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ff5577',
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2, `점수: ${this.score}`, {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const btn = this.add.text(WORLD_W / 2, WORLD_H / 2 + 80, '[ 다시하기 ]', {
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
  }
}
