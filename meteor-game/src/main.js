import { Game } from './game.js';

const root = document.getElementById('game');
const game = new Game(root);
game.start();

if (typeof window !== 'undefined') {
  window.__meteorGame = game;
}
