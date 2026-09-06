import { Game } from './core/Game.js';
import { installTouch, isTouch } from './touch.js';

const game = new Game(document.getElementById('game'));
await game.boot();
// 手机上装屏幕按键；桌面（pointer: fine）什么都不做。
// 同时把底部那行键盘提示换掉——手机上「方向键/Z/Esc」是没有意义的。
if (isTouch()) {
  installTouch(game);
  const hint = document.getElementById('hint');
  if (hint) hint.remove();
}
window.game = game; // 方便在控制台调试：game.state / game.scenes
