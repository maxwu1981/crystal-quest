// 结局：星空上滚动的剧情结尾与制作名单。按住确认加速。
// 滚完之后走 onDone（通关流程会把玩家送回内埔庄，让 29 个 NPC 的通关后台词有机会被听到）；
// 没给 onDone 就退回标题。
import { drawText, PIXEL, FONT_FAMILY } from '../core/text.js';
import { UI } from '../ui/Window.js';
import { RNG } from '../core/RNG.js';
import { MAX_W } from '../core/draw.js';
import { TitleScene } from './TitleScene.js';

export class EndingScene {
  wide = true;                 // 整幅铺满，理由同 TitleScene

  constructor(game, onDone = null) {
    this.game = game; this.onDone = onDone; this.transparent = false; this.bgm = 'title'; this.t = 0;
    this.lines = game.data.story?.ending?.lines || ['感谢游玩！'];
    const rng = new RNG(11);
    // 撒到 MAX_W 而不是 256（理由同 TitleScene）：宽屏上右边那一大半本来一粒星都没有
    this.stars = Array.from({ length: 170 }, () => [rng.int(0, MAX_W - 1), rng.int(0, 223), rng.next() * 6.28]);
    this.scroll = 0; this.speed = 18; this.done = false;
  }
  get totalH() { return this.lines.length * 16 + this.game.H + 40; }
  update(dt) {
    this.t += dt;
    this.scroll += dt * this.speed * (this.game.input.isDown('confirm') ? 6 : 1);
    if (this.scroll >= this.totalH && !this.done) {
      this.done = true;
      if (this.onDone) this.game.fadeTo(this.onDone, { speed: 1 });
      else this.game.fadeTo(() => { this.game.scenes.clear(); this.game.scenes.push(new TitleScene(this.game)); }, { speed: 1 });
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
      if (big) { ctx.font = PIXEL ? `24px ${FONT_FAMILY}` : `bold 22px ${FONT_FAMILY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#000'; ctx.fillText(line.slice(2), W / 2 + 2, y + 2); ctx.fillStyle = UI.paper; ctx.fillText(line.slice(2), W / 2, y); ctx.textAlign = 'left'; }
      // 「·」开头的是制作名单的条目，压暗一档；正文用主色。两者的差别就是这一层
      else drawText(ctx, line, W / 2, y, { align: 'center', color: line.startsWith('·') ? UI.dim : UI.text });
    });
  }
}
