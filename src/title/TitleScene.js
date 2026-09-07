// 标题画面：新游戏 / 继续
import { Menu } from '../ui/Menu.js';
import { UI } from '../ui/Window.js';
import { drawText, PIXEL, FONT_FAMILY } from '../core/text.js';
import { loadGame } from '../game/state.js';
import { RNG } from '../core/RNG.js';
import { MAX_W } from '../core/draw.js';
import { key } from '../touch.js';

export class TitleScene {
  // **整幅铺满，不吃 Game.render 的居中偏移。** 这一屏从头到尾都是按 game.W 排的
  // （底色、灰烬、标题、菜单全是 W/2），没声明 wide 的话整层会被右移 OX，
  // 于是左边露出 OX 那么宽的一条纯黑——手机横屏上就是屏幕的四分之一。
  wide = true;

  constructor(game) {
    this.game = game; this.transparent = false; this.bgm = 'title'; this.t = 0;
    const rng = new RNG(7);
    // 撒到 MAX_W 而不是 256：宽屏上右边那一大半本来一粒灰都没有。
    // 数量跟着一起放大，密度才和从前一样。
    this.stars = Array.from({ length: 150 }, () => [rng.int(0, MAX_W - 1), rng.int(0, 130), rng.next() * 6.28]);
    const has = !!loadGame();
    this.menu = new Menu({
      items: [{ label: '开始', value: 'new' }, { label: '想起', value: 'continue', disabled: !has }],
      x: 88, y: 150, w: 80, h: 44,
      onSelect: it => { if (it.value === 'new') game.fadeTo(() => game.newGame()); else game.fadeTo(() => game.loadState(loadGame())); },
    });
    if (has) this.menu.cursor = 1;
  }
  update(dt) { this.t += dt; this.menu.update(this.game.input); }
  render(ctx) {
    const { W, H } = this.game;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b100f'); g.addColorStop(0.7, '#1b2320'); g.addColorStop(1, '#2e3428');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 缓缓上浮的灰烬（出火熄掉那晚飘起来的），而不是星星
    for (const [x, y, ph] of this.stars) {
      const yy = (y - this.t * 6 + ph * 20) % H;
      ctx.fillStyle = `rgba(216,207,168,${0.10 + 0.30 * Math.abs(Math.sin(this.t + ph))})`;
      ctx.fillRect(x, yy < 0 ? yy + H : yy, 1, 1);
    }
    // 一圈扩散的余温波纹
    for (let i = 0; i < 3; i++) {
      const p = ((this.t * 0.22 + i / 3) % 1);
      ctx.strokeStyle = `rgba(200,190,150,${0.16 * (1 - p)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(W / 2, 74, 6 + p * 96, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = PIXEL ? `24px ${FONT_FAMILY}` : `bold 26px ${FONT_FAMILY}`; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(this.game.data.config.title, W / 2 + 2, 62);
    ctx.fillStyle = UI.paper; ctx.fillText(this.game.data.config.title, W / 2, 60);
    ctx.textAlign = 'left';
    drawText(ctx, this.game.data.config.subtitle || '', W / 2, 96, { align: 'center', color: UI.dim });
    // 菜单的 x 每帧现算：W 会跟着转屏变（Game.fitCanvas 会重算），
    // 构造时定死的话一转屏就偏到一边去了
    this.menu.x = Math.round((W - this.menu.w) / 2);
    this.menu.render(ctx);
    drawText(ctx, `${key('confirm')} 确认`, W / 2, 206, { align: 'center', color: UI.gray }); // 操作提示：最不该抢戏的一行
  }
}
