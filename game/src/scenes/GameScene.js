import Phaser from 'phaser';

const WORLD_W = 540;
const WORLD_H = 960;
const PLAYER_Y = WORLD_H - 140;
const PLAYER_SPEED = 600;
const BULLET_SPEED = 700;
const BULLET_INTERVAL = 180;
const ENEMY_SPEED = 120;
const ENEMY_SPAWN_INTERVAL = 700;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.score = 0;
    this.gameOver = false;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x141532);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      const r = Phaser.Math.Between(1, 2);
      this.add.circle(x, y, r, 0xffffff, Phaser.Math.FloatBetween(0.2, 0.6));
    }

    this.player = this.add.triangle(
      WORLD_W / 2, PLAYER_Y,
      0, 36,
      24, 0,
      48, 36,
      0x4cc2ff,
    );
    this.player.setOrigin(0.5, 0.5);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setSize(40, 40);

    this.targetX = this.player.x;

    this.bullets = this.physics.add.group({
      maxSize: 200,
      runChildUpdate: false,
    });

    this.enemies = this.physics.add.group({
      maxSize: 100,
      runChildUpdate: false,
    });

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
    const cam = this.cameras.main;
    const worldX = (pointer.x - cam.x) / cam.zoom + cam.scrollX;
    this.targetX = Phaser.Math.Clamp(worldX, 30, WORLD_W - 30);
    if (this.hintText.alpha > 0) this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
  }

  shoot() {
    if (this.gameOver) return;
    const bullet = this.add.rectangle(this.player.x, this.player.y - 24, 6, 18, 0xffe066);
    this.physics.add.existing(bullet);
    bullet.body.setVelocity(0, -BULLET_SPEED);
    this.bullets.add(bullet);
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const x = Phaser.Math.Between(40, WORLD_W - 40);
    const enemy = this.add.circle(x, -30, 22, 0xff5577);
    this.physics.add.existing(enemy);
    enemy.body.setVelocity(0, ENEMY_SPEED + Math.min(this.score * 2, 200));
    enemy.hp = 1;
    this.enemies.add(enemy);
  }

  onBulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      enemy.destroy();
      this.score += 1;
      this.scoreText.setText(`SCORE ${this.score}`);
    }
  }

  onPlayerHit(player, enemy) {
    if (this.gameOver) return;
    this.endGame();
  }

  endGame() {
    this.gameOver = true;
    this.shootEvent.remove();
    this.spawnEvent.remove();
    this.physics.pause();

    const overlay = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x000000, 0.6);
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

    this.bullets.children.each((b) => {
      if (b.active && b.y < -30) b.destroy();
    });
    this.enemies.children.each((e) => {
      if (e.active && e.y > WORLD_H + 30) e.destroy();
    });
  }
}
