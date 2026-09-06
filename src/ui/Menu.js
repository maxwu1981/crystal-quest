// 光标菜单：上下（多列时左右）选择，确认/取消回调，超出高度自动滚动。
import { drawText, LINE_H } from '../core/text.js';
import { drawWindow } from './Window.js';
import { audio } from '../core/audio.js';

export function drawCursor(ctx, x, y) {
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 6, y + 4.5); ctx.lineTo(x + 1, y + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 3.5); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
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
    const curRow = Math.floor(this.cursor / this.cols);
    if (curRow < this.scroll) this.scroll = curRow;
    if (curRow >= this.scroll + visible) this.scroll = curRow - visible + 1;
    this.items.forEach((it, i) => {
      const row = Math.floor(i / this.cols) - this.scroll;
      if (row < 0 || row >= visible) return;
      const x = this.x + this.pad + (i % this.cols) * colW, y = this.y + this.pad + row * this.rowH;
      const color = it.disabled ? '#6b6858' : '#fff';
      if (i === this.cursor) drawCursor(ctx, x, y + 2);
      drawText(ctx, it.label, x + 9, y, { color });
      if (it.right != null) drawText(ctx, String(it.right), x + colW - 2, y, { align: 'right', color });
    });
  }
}
