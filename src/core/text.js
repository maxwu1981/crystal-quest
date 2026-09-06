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

// 行首禁则用的标点：中文排版里这些不该出现在一行的开头
const NO_HEAD = '。，、；：！？）」』】·';

// 按字符断行（中文没有空格），支持 \n。
//
// hang=true 打开行首禁则（避头尾）：断点正好落在句读前面时，把上一行的最后一个字
// 也带下来，于是「……去圳沟边采的」+「。」变成「……去圳沟边采」+「的。」，
// 不会有一行只挂着一个孤零零的句号。全部 273 页台词里有 23 页是这个样子，
// 对话框一收窄就特别显眼。
//
// 为什么不默认打开：这条规则在某些宽度下会多断出一行，而菜单里的道具/职业/设置说明
// 是 .slice(0, 2) / .slice(0, 3) 截断的，多一行等于把说明吃掉一截。
// 240px 的对话框逐页验过：273 页一页都不会因此变长，所以只有对话框开这个开关。
export function wrapText(ctx, text, maxWidth, { hang = false } = {}) {
  const lines = []; let cur = '', last = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; last = ''; continue; }
    if (cur && measure(ctx, cur + ch) > maxWidth) {
      // 退一个字用 last 的长度、不用 slice(-1)：台词里有「𠊎」这种四字节字，
      // slice(-1) 会把它劈成半个代理对，画出来是个方块
      if (hang && NO_HEAD.includes(ch) && cur.length > last.length) {
        lines.push(cur.slice(0, cur.length - last.length)); cur = last + ch;
      } else { lines.push(cur); cur = ch; }
    } else cur += ch;
    last = ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
