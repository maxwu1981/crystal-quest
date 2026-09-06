// 结局：星空上滚动的剧情结尾与制作名单，滚完回标题。按住确认加速。
import { drawText, PIXEL, FONT_FAMILY } from '../core/text.js';
import { RNG } from '../core/RNG.js';
import { TitleScene } from './TitleScene.js';

export class EndingScene {
  constructor(game) {
    this.game = game; this.transparent = false; this.bgm = 'title'; this.t = 0;
    this.lines = game.data.story?.ending?.lines || ['感谢游玩！'];
    const rng = new RNG(11);
    this.stars = Array.from({ length: 80 }, () => [rng.int(0, 255), rng.int(0, 223), rng.next() * 6.28]);
    this.scroll = 0; this.speed = 18; this.done = false;
  }
  get totalH() { return this.lines.length * 16 + this.game.H + 40; }
  update(dt) {
    this.t += dt;
    this.scroll += dt * this.speed * (this.game.input.isDown('confirm') ? 6 : 1);
    if (this.scroll >= this.totalH && !this.done) {
      this.done = true;
      this.game.fadeTo(() => { this.game.scenes.clear(); this.game.scenes.push(new TitleScene(this.game)); }, { speed: 1 });
    }
  }
  render(ctx) {
    const { W, H } = this.game;
    ctx.fillStyle = '#0b100f'; ctx.fillRect(0, 0, W, H);
    for (const [x, y, ph] of this.stars) { ctx.fillStyle = `rgba(216,207,168,${0.12 + 0.35 * Math.abs(Math.sin(this.t + ph))})`; ctx.fillRect(x, y, 1, 1); }
    this.lines.forEach((line, i) => {
      const y = Math.round(H + i * 16 - this.scroll);
      if (y < -16 || y > H) return;
      const big = line.startsWith('# ');
      if (big) { ctx.font = PIXEL ? `24px ${FONT_FAMILY}` : `bold 22px ${FONT_FAMILY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#000'; ctx.fillText(line.slice(2), W / 2 + 2, y + 2); ctx.fillStyle = '#d8cfa8'; ctx.fillText(line.slice(2), W / 2, y); ctx.textAlign = 'left'; }
      else drawText(ctx, line, W / 2, y, { align: 'center', color: line.startsWith('·') ? '#8a8468' : '#fff' });
    });
  }
}
