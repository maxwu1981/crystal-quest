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
// 一道风：带弧度的一条线，尾端往回卷。**风也要画形状**——
// 跟 flame() 上面那条教训是同一条：撒一把点画不出风，只会得到一片噪。
// 一条看得出方向、尾巴卷回去的线就够了，三四条错开就是一阵。
// 直线收尾读起来是划痕，所以那个小勾不能省。
export function gust(ctx, x, y, len, bow, color, a, w = 1.2) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.4, w); ctx.lineCap = 'round';
  const ex = x + len, ey = y + bow * 0.25;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.55, y + bow, ex, ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex, ey);
  ctx.quadraticCurveTo(ex + 5, ey - 3.2, ex - 1.5, ey - 4.6); ctx.stroke();
  ctx.restore();
}

// 从画面外向内聚拢的点：给「蓄力」段用。角度一次定死，不逐帧掷骰
export const inward = (rng, n, x, y, dist) => Array.from({ length: n }, () => {
  const a = rng.next() * 6.283, d = dist * (0.7 + rng.next() * 0.6);
  return { ax: x + Math.cos(a) * d, ay: y + Math.sin(a) * d * 0.7, d: rng.next() * 0.35, s: rng.int(1, 2) };
});

// ── 八个剪影母题（【八部齐至】用；单尊演出用不到，但画笔就该住在画笔档里）──────
//
// **不另画一套。** 认人靠剪影，而这八个形已经在各自那一段里立住了，
// 【八部齐至】里再设计一遍等于把八位重新介绍一次——那正是它不该做的事。
// 所以下面八个函数是**逐点抄回来**的，出处一一对应：
//   earth 田字   ← summonFxAlly.bogong 的「田」（他把整个战场当成自己的田，这是那张田的缩本）
//   wood  净瓶   ← summonFxAlly.guanyin 的 VASE 折线 + 那一枝杨柳
//   water 桅顶火 ← summonFxAlly.mazu 的桅杆与顶上那一点，底下两道浪
//   fire  关刀   ← summonFx.js 的 guandao()：杆 + 月牙刀身
//   light 帽翅   ← summonFx.zhongkui 的乌纱帽（两只帽翅 + 帽体 + 头）
//   wind  火轮   ← summonFx.nezha 的轮圈 + 沿缘那十条火舌
//   dark  六面旗 ← summonFx.yimin 的六面（就用本档的 banner()）
//   metal 戟     ← summonFx.lubu 的杆 + 枪尖 + 月牙小枝
// 每个只做两件事：① 平移到以原点为中心；② 收成单色，好在缩到 0.4 倍时还认得出。
// **比例一个都没改**——改了就不是同一位了。
//
// 键用的是**属性**而不是神名（八属性见 elements.js）。八位一人一种，两边一一对应，
// 而「八种属性各一击」这句话在代码里就该长成 MOTIF[element] 的样子。
// 签名统一 (ctx, col, ph)：ph 只有会动的两个用得上（旗在飘、轮在转）。
export const MOTIF = {
  earth(ctx, col) {                                   // 田：外框 + 一横一竖
    const t = 1.6, R = 11; ctx.fillStyle = col;
    ctx.fillRect(-R, -R, R * 2, t); ctx.fillRect(-R, R - t, R * 2, t);
    ctx.fillRect(-R, -R, t, R * 2); ctx.fillRect(R - t, -R, t, R * 2);
    ctx.fillRect(-R, -t / 2, R * 2, t); ctx.fillRect(-t / 2, -R, t, R * 2);
  },
  wood(ctx, col) {                                    // 净瓶：细颈、宽肩、收底，加一枝杨柳
    poly(ctx, [[-1.6, -13], [-1.6, -7], [-5, -4], [-6.4, 2], [-5.4, 10], [-3.6, 13],
      [3.6, 13], [5.4, 10], [6.4, 2], [5, -4], [1.6, -7], [1.6, -13]], col);
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(7, -19, 3, -26); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const ly = -15 - i * 4, lx = 5 - i * 0.9;
      poly(ctx, [[lx, ly], [lx + 3.2, ly + 1.6], [lx + 0.6, ly + 4]], col);
    }
  },
  water(ctx, col) {                                   // 桅顶火：一根桅杆，顶上一点，底下两道浪
    ctx.fillStyle = col; ctx.fillRect(-0.6, -13, 1.2, 30);
    ctx.beginPath(); ctx.arc(0, -13, 3.6, 0, 6.29); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    for (let i = 0; i < 2; i++) {
      const yy = 12 + i * 5; ctx.beginPath();
      for (let k = 0; k <= 4; k++) {
        const sx = -13 + k * 6.5, y2 = yy + (k % 2 ? -1.6 : 1.6);
        k ? ctx.lineTo(sx, y2) : ctx.moveTo(sx, y2);
      }
      ctx.stroke();
    }
  },
  fire(ctx, col) {                                    // 关刀：杆 + 月牙刀身（guandao() 的 L=26）
    // 杆一定要够长。第一版 L=13，刀身跟杆一样高，读起来是「叶子插在棍上」不是关刀——
    // guangong 那边杆长 128、刀身 26，刀是杆末端的一小片，比例得照那个来
    const L = 26; ctx.save(); ctx.translate(-10.8, 26.5);
    ctx.fillStyle = col; ctx.fillRect(-1.4, -L, 2.8, L);
    poly(ctx, [[0, -L - 1], [4, -L - 11], [11, -L - 22], [20, -L - 27],
      [23, -L - 18], [16, -L - 8], [5, -L - 2]], col);
    ctx.restore();
  },
  light(ctx, col) {                                   // 乌纱帽的两只帽翅
    poly(ctx, [[-14, -6], [-7, -6], [-7, -3], [-14, -3]], col);
    poly(ctx, [[7, -6], [14, -6], [14, -3], [7, -3]], col);
    poly(ctx, [[-7, 0], [-6, -10], [6, -10], [7, 0]], col);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 4.5, 5, 0, 6.29); ctx.fill();  // 头，比帽小一号
  },
  wind(ctx, col, ph = 0) {                            // 火轮：轮圈 + 沿缘十条火舌
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, 6.29); ctx.stroke();
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628 + ph;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 7);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 10);
      ctx.stroke();
    }
  },
  dark(ctx, col, ph = 0) {                            // 六面旗：一堆出事，各堆都要出人
    // 间距要够宽。挤在一起读起来是栅栏不是六面旗——yimin 那边是「杆距 : 旗宽 ≈ 1.7」，
    // 六面要各自看得出是一面，这个比例不能省
    for (let i = 0; i < 6; i++) banner(ctx, -19 + i * 6.4, 9, 4.6, 18, ph + i, col, col);
  },
  metal(ctx, col) {                                   // 戟：杆 + 枪尖 + 月牙小枝
    // 杆长 38（lubu 那边是 46）：小枝占杆的四分之一左右才读得出是戟上的小枝，
    // 短杆会把小枝读成一面旗——那就跟义民爷撞了
    const hh = 38; ctx.save(); ctx.translate(-5.5, 24.5);
    ctx.fillStyle = col; ctx.fillRect(-1.2, -hh, 2.4, hh);
    poly(ctx, [[-2, -hh], [0, -hh - 11], [2, -hh]], col);
    poly(ctx, [[2, -hh + 6], [11, -hh + 2], [13, -hh + 9], [3, -hh + 12]], col);
    ctx.restore();
  },
};

// 把某个剪影摆到 (x,y)：s 缩放、rot 旋转、a 透明度、col 单色、ph 给会动的那两个。
// 位置走 snap()（对齐物理像素网格，不是逻辑网格），否则缩放中的剪影会一格一格蹦。
export function motif(ctx, kind, x, y, s, col, a = 1, rot = 0, ph = 0) {
  const f = MOTIF[kind];
  if (!f || a <= 0.004 || !(s > 0.02)) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  ctx.translate(snap(x), snap(y));
  if (rot) ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1;
  f(ctx, col, ph);
  ctx.restore();
}
