// 召唤演出的共用画笔。summonFx.js（焦点在敌方的五位）与 summonFxAlly.js（焦点在我方的三位）都用这一份。
//
// **为什么不从 spellFx.js import 那一套**：那边正在改，把两个文件绑在一起
// 等于让魔法的调参牵动召唤。而且节奏本来就不一样——魔法 1.2 秒说一件事，
// 召唤 1.7–2.2 秒要说「谁来了 → 他做了什么 → 走了」三件事。抄二十行比耦合便宜。
//
// 三条自律照抄 spellFx.js（那边的注释讲了为什么，光敏性风险是真的）：
//   ① 全屏闪光峰值不超过 0.45；② 起落各留 ≥0.08 秒的渐变；③ **一次演出只闪一次**。
// 召唤比魔法长，第三条更要守死：2 秒里闪两次，读起来就是频闪不是节奏。
// 鞭炮串、三连击这类「本来就该一串」的东西，一律用局部亮点（glow / ring / 小圆），
// 绝不碰 flash()。局部亮点面积小，连着来也不晃眼；全屏白光连两次就晃。
//
// **形状优先于粒子**。spellFx.js 的 tongue() 上面那段教训在这里同样成立：
// 火焰试了三版才发现「粒子撒不出火，要画形状」。召唤更是如此——
// 召唤的全部意义是「一眼认出是谁来了」，而认人靠的是剪影：
// 关刀的月牙、六面旗、净瓶的肩线、火轮的圆、乌纱帽的两只帽翅。
// 所以这个档里的基本件是 poly / banner / flame / beam 这些**画形状**的，
// dot() 只留给余烬与飘散——那才是粒子该干的事。
//
// 坐标是 256×224 逻辑坐标；战场只到 y=PANEL_Y(152)，下面是指令窗与队伍面板。
// 全屏效果一律裁在这条线以上——盖住 UI 会让人以为界面坏了。
//
// 画布已经 setTransform(ART,...)，所以这里写的都是逻辑单位：lineWidth=1 是 ART 个
// 物理像素，要细线就写 0.5–0.8。**运动中的点一律走 snap()**：对齐到物理像素网格
// 而不是逻辑网格，否则 ART=6 下每步至少蹦 6 个物理像素（见 core/draw.js 的 snap()）。

import { snap } from '../core/draw.js';
import { PANEL_Y } from './hudBits.js';

export const W = 256, FH = PANEL_Y;

// 段落插值：把整体进度 p 映射到 [a,b] 这一段内部的 0→1，段外返回 0 或 1
export const seg = (p, a, b) => p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
// 一段之内先涨后落（0→1→0），用来做「亮起再熄掉」
export const pulse = (p, a, b) => Math.sin(seg(p, a, b) * Math.PI);
export const ease = k => 1 - (1 - k) * (1 - k);

// 整个战场铺一层色，把「现在是谁的场面」说清楚
export function wash(ctx, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalAlpha = Math.min(0.55, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 冲击闪光。峰值卡死在 0.45，只在 lighter 下叠加，不会把画面洗成纯白。一次演出只准调用一次
export function flash(ctx, a, color = '#fff6e0') {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.45, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 以某点为中心加光。火、光这类**是光源**，只铺深色会把画面压成土色（读起来是脏不是热）
export function glow(ctx, x, y, r, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.9, a);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(0.45, color.replace('rgb(', 'rgba(').replace(')', ',0.45)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 一圈扩散的环。厚度随半径变薄，才像能量在摊开而不是一个圆在放大
export function ring(ctx, x, y, r, color, a, thick = 3) {
  if (a <= 0.002 || r <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.4, thick);
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, 6.29); ctx.stroke();
  ctx.restore();
}
// 一颗方形粒子。只用于余烬 / 灰 / 水点这类真的该是点的东西
export const dot = (ctx, x, y, s, col) => { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), s, s); };

// 一个填色多边形。剪影全靠它：关刀、净瓶、乌纱帽、莲瓣、人影
export function poly(ctx, pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
// 一道有厚度的光带（射线、水柱、刀痕）。两头收细，中间最亮
export function beam(ctx, x0, y0, x1, y1, w0, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.95, a);
  ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {                       // 三层：宽而淡 → 窄而亮
    ctx.globalAlpha = Math.min(0.95, a) * (0.35 + i * 0.3);
    ctx.lineWidth = Math.max(0.4, w0 * (1 - i * 0.36));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}
// 一面插在地上的旗：旗杆 + 随风起伏的旗面。义民爷那六面、关帝的帅旗都用它
export function banner(ctx, x, baseY, w, h, phase, cloth, pole = '#3b2a1c') {
  ctx.fillStyle = pole; ctx.fillRect(snap(x), snap(baseY - h), 1, h);
  const top = baseY - h + 1, wave = (k, o) => Math.sin(phase + k * 3.1 + o) * 2.4 * k;
  ctx.fillStyle = cloth; ctx.beginPath(); ctx.moveTo(x + 1, top);
  for (let i = 1; i <= 6; i++) ctx.lineTo(x + 1 + w * i / 6, top + wave(i / 6, 0));
  for (let i = 6; i >= 0; i--) ctx.lineTo(x + 1 + w * i / 6, top + h * 0.45 + wave(i / 6, 0.7));
  ctx.closePath(); ctx.fill();
}
// 一条火舌：从底往上逐行画横条，宽度收窄到尖，整条随高度左右摆。
// 这是 spellFx.js 那条教训的直接移植——火要画形状，不要撒粒子
export function flame(ctx, x, baseY, h, w, phase, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < h; i++) {
    const k = i / h, half = w * (1 - k) ** 0.75 * 0.5;
    if (half < 0.25) break;
    ctx.fillRect(snap(x + Math.sin(k * 3.4 + phase) * 3 * k - half), snap(baseY - i), Math.max(1, half * 2), 1);
  }
}
// 从画面外向内聚拢的点：给「蓄力」段用。角度一次定死，不逐帧掷骰
export const inward = (rng, n, x, y, dist) => Array.from({ length: n }, () => {
  const a = rng.next() * 6.283, d = dist * (0.7 + rng.next() * 0.6);
  return { ax: x + Math.cos(a) * d, ay: y + Math.sin(a) * d * 0.7, d: rng.next() * 0.35, s: rng.int(1, 2) };
});
