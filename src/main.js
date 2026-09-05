import { Game } from './core/Game.js';

const game = new Game(document.getElementById('game'));
await game.boot();
window.game = game; // 方便在控制台调试：game.state / game.scenes
