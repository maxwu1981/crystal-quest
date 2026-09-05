// 文字绘制。以后放入 assets/fonts 的像素字体（如开源的「缝合怪像素字体 Fusion Pixel」）会自动优先使用。
export const FONT = '10px "Fusion Pixel 12px", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
export const LINE_H = 13;

export function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#ffffff', shadow = true, align = 'left' } = opts;
  ctx.font = FONT; ctx.textBaseline = 'top'; ctx.textAlign = align;
  if (shadow) { ctx.fillStyle = '#000000'; ctx.fillText(text, x + 1, y + 1); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
export function measure(ctx, text) { ctx.font = FONT; return ctx.measureText(text).width; }

// 按字符断行（中文没有空格），支持 \n
export function wrapText(ctx, text, maxWidth) {
  const lines = []; let cur = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    const t = cur + ch;
    if (cur && measure(ctx, t) > maxWidth) { lines.push(cur); cur = ch; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
