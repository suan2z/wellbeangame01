import Phaser from 'phaser';
import GameScene from './scenes/GameScene.js';

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0f1020',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
