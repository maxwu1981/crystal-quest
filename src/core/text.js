// 文字绘制。若 index.html 里定义了 @font-face "Fusion Pixel 12px"（开源像素字体）且加载成功，自动切换为像素字体。
export let FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
export let FONT = `10px ${FONT_FAMILY}`;
export let PIXEL = false;
export const LINE_H = 13;

export async function initFont() {
  const fam = '"Fusion Pixel 12px"';
  try {
    // 触发两个子集（拉丁 / 简中）加载，再用测宽法确认字体真的可用（document.fonts 在某些环境里看不到 CSS 字体）
    await Promise.all([document.fonts.load(`12px ${fam}`, 'HP 0123'), document.fonts.load(`12px ${fam}`, '水晶传说')]);
    const c = document.createElement('canvas').getContext('2d');
    const w = (font, t) => { c.font = font; return c.measureText(t).width; };
    const sample = '水晶传说 HP 123';
    const differs = w(`12px ${fam}, monospace`, sample) !== w('12px monospace', sample) && w(`12px ${fam}, serif`, sample) !== w('12px serif', sample);
    if (differs) { PIXEL = true; FONT_FAMILY = `${fam}, sans-serif`; FONT = `12px ${FONT_FAMILY}`; }
  } catch { /* 没有像素字体就用系统字体 */ }
  return PIXEL;
}

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
