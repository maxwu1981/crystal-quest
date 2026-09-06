// 对话框：打字机效果、多页、可选项。透明场景，压在地图上。
import { drawWindow } from './Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { Menu } from './Menu.js';
import { audio } from '../core/audio.js';

const BOX = { x: 0, y: 152, w: 256, h: 72 };
const CPS = 40; // 每秒字数

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
    let ty = y + 8;
    if (this.name) { drawText(ctx, this.name, x + 8, ty, { color: '#e6c46a' }); ty += LINE_H; }
    wrapText(ctx, this.text.slice(0, this.shown), w - 16).slice(0, 4).forEach((l, i) => drawText(ctx, l, x + 8, ty + i * LINE_H));
    if (this.done && !this.menu && !(this.isLast && this.choices) && Math.floor(this.t * 3) % 2 === 0) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + w - 14, y + h - 12); ctx.lineTo(x + w - 8, y + h - 12); ctx.lineTo(x + w - 11, y + h - 8); ctx.closePath(); ctx.fill();
    }
    this.menu?.render(ctx);
  }
}
