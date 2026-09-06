// 对话框：打字机效果、多页、可选项。透明场景，压在地图上。
import { drawWindow, UI } from './Window.js';
import { drawText, measure, wrapText, LINE_H } from '../core/text.js';
import { Menu } from './Menu.js';
import { audio } from '../core/audio.js';

const BOX = { x: 0, y: 152, w: 256, h: 72 };
const CPS = 40; // 每秒字数

// 说话人名牌：挂在对话框左上角的一块小牌子。
// 没用 drawWindow——完整窗口至少要 23px 高（四圈边框吃掉 11px），压在对话框上像块砖；
// 这里只要一层暗铜边 + 深底 + 上缘一道受光，15px 就够，而且和窗口是同一套光源。
// 名字挪到框外之后，框里 4 行全归正文，反而比原来（名字占掉一行）宽裕。
function drawNamePlate(ctx, name, x, y) {
  const w = Math.round(measure(ctx, name)) + 12, h = 16;
  ctx.save();
  ctx.fillStyle = 'rgba(10,19,15,0.97)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#7a633f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(216,207,168,0.45)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.restore();
  drawText(ctx, name, x + 6, y + 2, { color: UI.accent });
}

export class DialogueScene {
  constructor(game, { name = '', pages = [], choices = null, onDone = null }) {
    this.game = game; this.transparent = true;
    this.name = name; this.pages = pages.length ? pages : ['……']; this.choices = choices; this.onDone = onDone;
    this.page = 0; this.shown = 0; this.acc = 0; this.t = 0; this.menu = null;
  }
  get text() { return this.pages[this.page]; }
  get done() { return this.shown >= this.text.length; }
  get isLast() { return this.page === this.pages.length - 1; }

  update(dt) {
    const input = this.game.input;
    this.t += dt;
    if (this.menu) { this.menu.update(input); return; }
    if (!this.done) {
      this.acc += dt * CPS * (input.isDown('confirm') ? 3 : 1);
      while (this.acc >= 1 && !this.done) { this.shown++; this.acc -= 1; }
      if (input.justPressed('confirm') || input.justPressed('cancel')) this.shown = this.text.length;
      if (this.done && this.isLast && this.choices) this.openChoices();
      return;
    }
    if (this.isLast && this.choices) { this.openChoices(); return; }
    if (input.justPressed('confirm') || input.justPressed('cancel')) {
      audio.sfx('cursor');
      if (!this.isLast) { this.page++; this.shown = 0; this.acc = 0; }
      else this.close(null);
    }
  }
  openChoices() {
    const h = 16 + this.choices.length * LINE_H;
    this.menu = new Menu({
      items: this.choices.map((c, i) => ({ label: c, value: i })), x: 176, y: BOX.y - h, w: 80, h,
      onSelect: it => this.close(it.value), onCancel: () => this.close(this.choices.length - 1),
    });
  }
  close(result) { this.game.scenes.pop(); this.onDone?.(result); }

  render(ctx) {
    const { x, y, w, h } = BOX;
    drawWindow(ctx, x, y, w, h);
    if (this.name) drawNamePlate(ctx, this.name, x + 10, y - 14);
    // 断行宽度仍是 w-16 = 240：tests/run.js 的「对话每页最多 3 行」按 240 量过所有台词，
    // 改窄了会有台词被截掉而测试还是绿的。
    wrapText(ctx, this.text.slice(0, this.shown), w - 16).slice(0, 4)
      .forEach((l, i) => drawText(ctx, l, x + 8, y + 8 + i * LINE_H, { color: UI.text }));
    if (this.done && !this.menu && !(this.isLast && this.choices)) {
      // 翻页提示。原来是 3Hz 亮灭（每秒闪 1.5 次），那是频闪不是提示：
      // 改成常亮 + 1.6 秒一个来回的 1px 上下轻移，一样在说「还有」，但不刺眼。
      const bob = Math.round(Math.sin(this.t * (Math.PI * 2 / 1.6)));
      const cx = x + w - 13, cy = y + h - 12 + bob;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.moveTo(cx - 4, cy - 1); ctx.lineTo(cx + 4, cy - 1); ctx.lineTo(cx, cy + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = UI.accent;
      ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    this.menu?.render(ctx);
  }
}
