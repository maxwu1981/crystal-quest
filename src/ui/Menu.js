// 光标菜单：上下（多列时左右）选择，确认/取消回调，超出高度自动滚动。
import { drawText, LINE_H } from '../core/text.js';
import { drawWindow, drawHighlight, UI } from './Window.js';
import { audio } from '../core/audio.js';

// 光标的「呼吸」：只挪位置，不改明暗。像素画面上一亮一灭就成了频闪，
// 慢慢左右挪 1px 不会。周期 1.8 秒、振幅 1px——慢到看得出在动，又不抢戏。
// 时钟取自 performance.now()：纯装饰，不进 game.state，也不影响任何逻辑与存档。
const BREATH = Math.PI * 2 / 1.8;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const drift = () => Math.round(Math.sin(clock() * BREATH));

function tri(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x, y + h); ctx.closePath();
}

// 暗金箭头 + 黑描边。描边是必需的：光标也会画在敌人身上（战斗选目标），
// 那里的底色什么都有可能。
export function drawCursor(ctx, x, y) {
  const px = x + drift();
  ctx.save();
  tri(ctx, px - 1, y - 1, 7, 9); ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill();
  tri(ctx, px, y, 5, 7); ctx.fillStyle = UI.accent; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px + 0.5, y + 1); ctx.lineTo(px + 3.5, y + 2.7);
  ctx.strokeStyle = 'rgba(255,246,214,0.85)'; ctx.lineWidth = 1; ctx.stroke(); // 上缘受光，和窗口同一个光源
  ctx.restore();
}

export class Menu {
  constructor({ items, x, y, w, h, cols = 1, rowH = LINE_H, pad = 8, onSelect, onCancel, onDisabled, wrap = true }) {
    Object.assign(this, { items, x, y, w, h, cols, rowH, pad, onSelect, onCancel, onDisabled, wrap });
    this.cursor = 0; this.scroll = 0;
  }
  get item() { return this.items[this.cursor]; }

  update(input) {
    const n = this.items.length;
    if (n) {
      const rows = Math.ceil(n / this.cols);
      let c = this.cursor;
      const col = c % this.cols, row = Math.floor(c / this.cols);
      if (input.repeatPressed('up')) c = row > 0 ? c - this.cols : (this.wrap ? (rows - 1) * this.cols + col : c);
      else if (input.repeatPressed('down')) c = row < rows - 1 ? c + this.cols : (this.wrap ? col : c);
      else if (this.cols > 1 && input.repeatPressed('left')) c = col > 0 ? c - 1 : (this.wrap ? c + this.cols - 1 : c);
      else if (this.cols > 1 && input.repeatPressed('right')) c = col < this.cols - 1 ? c + 1 : (this.wrap ? c - this.cols + 1 : c);
      c = Math.min(Math.max(0, c), n - 1);
      if (c !== this.cursor) audio.sfx('cursor');
      this.cursor = c;
    }
    if (input.justPressed('confirm')) {
      const it = this.item;
      if (!it) return;
      if (it.disabled) { audio.sfx('buzz'); this.onDisabled?.(it); } else { audio.sfx('confirm'); this.onSelect?.(it, this.cursor); }
    } else if (input.justPressed('cancel')) { audio.sfx('cancel'); this.onCancel?.(); }
  }

  render(ctx, { window: win = true } = {}) {
    if (win) drawWindow(ctx, this.x, this.y, this.w, this.h);
    const colW = Math.floor((this.w - this.pad * 2) / this.cols);
    const visible = Math.max(1, Math.floor((this.h - this.pad * 2) / this.rowH));
    const rows = Math.ceil(this.items.length / this.cols);
    const curRow = Math.floor(this.cursor / this.cols);
    if (curRow < this.scroll) this.scroll = curRow;
    if (curRow >= this.scroll + visible) this.scroll = curRow - visible + 1;
    this.items.forEach((it, i) => {
      const row = Math.floor(i / this.cols) - this.scroll;
      if (row < 0 || row >= visible) return;
      const x = this.x + this.pad + (i % this.cols) * colW, y = this.y + this.pad + row * this.rowH;
      const color = it.disabled ? UI.gray : UI.text;
      if (i === this.cursor) {
        // 先铺选中底再画光标：底色负责「选的是哪一整行」，箭头负责「精确在哪」。
        // 行高大于 14 时底条不跟着长高，行与行之间留一线缝。
        drawHighlight(ctx, x - 3, y - 1, colW, Math.min(this.rowH, 14));
        drawCursor(ctx, x, y + 2);
      }
      drawText(ctx, it.label, x + 9, y, { color });
      if (it.right != null) drawText(ctx, String(it.right), x + colW - 2, y, { align: 'right', color });
    });
    // 有东西被滚动出去时，右缘画一条 1px 滚动条。位置本身就说明「上下还有」，
    // 不用闪烁的箭头去提示。没滚动时完全不画。
    if (rows > visible) {
      const tx = this.x + this.w - 7, ty = this.y + this.pad, th = visible * this.rowH;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(tx, ty, 1, th);
      const hh = Math.max(6, Math.round(th * visible / rows));
      ctx.fillStyle = UI.dim;
      ctx.fillRect(tx, ty + Math.round((th - hh) * this.scroll / (rows - visible)), 1, hh);
      ctx.restore();
    }
  }
}
