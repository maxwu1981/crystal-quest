// 魔法演出的**共用画笔**。spellFx*.js 那几个文件都从这里取件。
//
// 单独成文件是因为七种属性各自要一整套多段演出，写在一个文件里会到一千多行，
// 而且没法几个人（几个 agent）同时改——一个文件同时被两处改写就会互相盖掉。
// 现在的分工：这里放画笔，火在 spellFx.js，其余按「气质」分三组各占一个文件。
//
// **关于全屏闪光**：这是最容易做过头、也最伤眼的东西。三条自律：
//   ① 峰值透明度不超过 0.45，绝不纯白铺满（flash 内部已经夹住）；
//   ② 起落各留 ≥0.08 秒的渐变，不做瞬间开关；
//   ③ 一个法术只闪一次。
// 光敏性风险是真的，宁可欠一点。
//
// 坐标是 256×224 的逻辑坐标，但**战场只到 y=152**（下面是指令窗与队伍面板，
// 见 hudBits.js 的 PANEL_Y）。全屏效果一律裁到这条线以上——盖住 UI 会让人以为界面坏了。
import { snap, ART } from '../core/draw.js';
import { PANEL_Y } from './hudBits.js';

export const W = 256, FH = PANEL_Y;          // 战场范围：整宽 × 顶到指令窗

// **一个物理像素有多少逻辑单位。** 特效的最小笔触要用它，不能用 1。
//
// 画布是 1536×1344（ART=6），但 ctx 挂着 ART 倍的变换，所以代码里写的是 256×224 的
// 逻辑坐标。于是 `fillRect(x, y, 1, 1)` 落到屏幕上是 **6×6 的物理方块**——
// 火舌的收尖会一级一级跳，看着就是「一堆方块」而不是火。
// 拿 PX 当最小单位，笔触细到 1 物理像素，边缘才描得出平滑的锥度。
// 这也让效果自动跟着 ART 走：以后把 ART 调到 8 或 12，笔触自己变细，不用改代码。
export const PX = 1 / ART;

// 段落插值：把整体进度 p 映射到 [a,b] 这一段内部的 0→1，段外返回 0 或 1
export const seg = (p, a, b) => p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
// 一段之内先涨后落（0→1→0），用来做「亮起再熄掉」
export const pulse = (p, a, b) => { const k = seg(p, a, b); return Math.sin(k * Math.PI); };
export const ease = k => 1 - (1 - k) * (1 - k);

// 整个战场铺一层色。用来把「现在是火属性的场面」这件事说清楚——
// FF6 的火焰会把整屏染暖，那一下比火苗本身更有说服力。
export function wash(ctx, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalAlpha = Math.min(0.55, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 冲击闪光。峰值卡在 0.45，且只在 lighter 模式下叠加，不会把画面洗成纯白
export function flash(ctx, a, color = '#fff6e0') {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.45, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 以某点为中心的大范围加光。火、雷、光这类**是光源**——
// 只铺一层深色（第一版就是这么做的）会把画面压成土色，读起来是「脏」不是「热」。
// 用 lighter 从中心往外加光，才像这团火真的在照亮战场。
export function glow(ctx, x, y, r, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.9, a);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(0.45, color.replace('rgb(', 'rgba(').replace(')', ',0.45)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, FH); ctx.restore();
}

// 一圈扩散的环。厚度随半径变薄，看起来才像能量在摊开而不是一个圆在放大
export function ring(ctx, x, y, r, color, a, thick = 3) {
  if (a <= 0.002 || r <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.5, thick);
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, 6.29); ctx.stroke();
  ctx.restore();
}
// 一条火舌：从底部往上逐行画横条，宽度按高度收窄到尖，整条随高度左右摆。
//
// **为什么不用粒子**：试过 96 颗 1–3 逻辑像素的方块堆火柱，全尺寸看还是「一撮方块」。
// 火在像素画里靠的是**成片的轮廓**，不是密度——FF6 的火焰是画出来的火舌形状，
// 内外三层色（外橙、中黄、芯白）套着走。少而准的形状胜过多而碎的点。
export function tongue(ctx, x, baseY, h, w, wave, phase, color) {
  ctx.fillStyle = color;
  const rows = Math.max(1, Math.round(h / PX));        // 按**物理像素**分行，不是逻辑像素
  for (let i = 0; i < rows; i++) {
    const k = i / rows;                                // 0 在底、1 在尖
    // 宽度曲线：底部先外扩再收窄成尖。
    // 只用 (1-k)^0.75 的话每条火舌底部都是同一个宽度、底边连成一条**横切线**——
    // 实测就是这样，火看起来像被一把刀齐根切平。前 12% 用一段外扩的曲线，
    // 底部就成了向两侧散开的弧，几条叠在一起自然咬合，切线消失。
    const flare = k < 0.12 ? 0.55 + (k / 0.12) * 0.45 : 1;
    const half = w * flare * (1 - k) ** 0.75 * 0.5;
    if (half < PX * 0.5) break;
    const off = Math.sin(k * 3.4 + phase) * wave * k;  // 越往上摆得越开
    ctx.fillRect(snap(x + off - half), snap(baseY - i * PX), Math.max(PX, half * 2), PX);
  }
}

// 一颗方形粒子。snap 到物理像素网格：不这样每步至少挪一个逻辑像素，
// ART=6 下就是 6 物理像素，火星会一格一格蹦（见 CLAUDE.md 的换算那节）
export const dot = (ctx, x, y, s, col) => { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), s, s); };

// 从画面外向内聚拢的粒子：给「蓄力」段用。角度一次定死，不逐帧掷骰
export const inward = (rng, n, x, y, dist) => Array.from({ length: n }, () => {
  const a = rng.next() * 6.283, d = dist * (0.7 + rng.next() * 0.6);
  return { ax: x + Math.cos(a) * d, ay: y + Math.sin(a) * d * 0.7, d: rng.next() * 0.35, s: rng.int(1, 2) };
});

// 火焰的三层：外焰最宽最高、内焰次之、焰芯最窄最矮。spread 让外层散得更开
// 火焰的三层：外焰最宽最高、内焰次之、焰芯最窄最矮。spread 让外层散得更开。
// a 是透明度——由外向内越来越实，目标从外焰的缝隙里透得出来
export const LAYERS = [
  { c: '#ff6a1f', w: 1.00, h: 1.00, spread: 1.15, a: 0.62 },
  { c: '#ffc832', w: 0.62, h: 0.80, spread: 0.85, a: 0.78 },
  { c: '#fff6d0', w: 0.30, h: 0.55, spread: 0.55, a: 0.92 },
];
