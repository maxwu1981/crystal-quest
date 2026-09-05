// 标题画面：新游戏 / 继续
import { Menu } from '../ui/Menu.js';
import { drawText, PIXEL, FONT_FAMILY } from '../core/text.js';
import { loadGame } from '../game/state.js';
import { RNG } from '../core/RNG.js';

export class TitleScene {
  constructor(game) {
    this.game = game; this.transparent = false; this.bgm = 'title'; this.t = 0;
    const rng = new RNG(7);
    this.stars = Array.from({ length: 70 }, () => [rng.int(0, 255), rng.int(0, 130), rng.next() * 6.28]);
    const has = !!loadGame();
    this.menu = new Menu({
      items: [{ label: '新游戏', value: 'new' }, { label: '继续', value: 'continue', disabled: !has }],
      x: 88, y: 150, w: 80, h: 44,
      onSelect: it => { if (it.value === 'new') game.fadeTo(() => game.newGame()); else game.fadeTo(() => game.loadState(loadGame())); },
    });
    if (has) this.menu.cursor = 1;
  }
  update(dt) { this.t += dt; this.menu.update(this.game.input); }
  render(ctx) {
    const { W, H } = this.game;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#050a2e'); g.addColorStop(1, '#1a2a6c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const [x, y, ph] of this.stars) { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.5 + ph))})`; ctx.fillRect(x, y, 1, 1); }
    ctx.font = PIXEL ? `24px ${FONT_FAMILY}` : `bold 26px ${FONT_FAMILY}`; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(this.game.data.config.title, W / 2 + 2, 62);
    ctx.fillStyle = '#ffe66d'; ctx.fillText(this.game.data.config.title, W / 2, 60);
    ctx.textAlign = 'left';
    drawText(ctx, 'CRYSTAL QUEST', W / 2, 96, { align: 'center', color: '#9aa4d8' });
    this.menu.render(ctx);
    drawText(ctx, 'Z / Enter 确认', W / 2, 206, { align: 'center', color: '#6c76b8' });
  }
}
