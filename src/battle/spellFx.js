// 魔法演出。和 effects.js 的分工：那边是「打击反馈」——挥砍、命中、受击闪白，
// 每个都在 0.3 秒内说完一件事；这边是「魔法」——多段式的一场戏，1.2 秒左右。
//
// **为什么要重做**：原来七种属性魔法各是一团 0.6 秒的粒子迸发，只占目标身边二十来个
// 逻辑像素。放在 FF6 旁边，差的不是像素精度而是**尺度与段落**——
// 那边一发火焰是「火星从画面外聚拢 → 白热核心炸开 → 火柱腾起 → 余烬飘散」，
// 有起承转合，还会染整个战场的颜色。我们只有「转」。
//
// 所以每个法术拆成明确的四段，段与段之间**尺度要变**（局部 → 全屏 → 局部），
// 变化本身就是节奏。段落边界写在每个法术开头，改的时候照着调。
//
// **关于全屏闪光**：这是最容易做过头、也最伤眼的东西。三条自律：
//   ① 峰值透明度不超过 0.45，绝不纯白铺满；
//   ② 起落各留 ≥0.08 秒的渐变，不做瞬间开关；
//   ③ 一个法术只闪一次。
// 光敏性风险是真的，宁可欠一点。
//
// 坐标是 256×224 的逻辑坐标，但**战场只到 y=152**（下面是指令窗与队伍面板，
// 见 hudBits.js 的 PANEL_Y）。全屏效果一律裁到这条线以上——盖住 UI 会让人以为界面坏了。

import { snap, ART } from '../core/draw.js';
import { PANEL_Y } from './hudBits.js';

const W = 256, FH = PANEL_Y;          // 战场范围：整宽 × 顶到指令窗

// **一个物理像素有多少逻辑单位。** 特效的最小笔触要用它，不能用 1。
//
// 画布是 1536×1344（ART=6），但 ctx 挂着 ART 倍的变换，所以代码里写的是 256×224 的
// 逻辑坐标。于是 `fillRect(x, y, 1, 1)` 落到屏幕上是 **6×6 的物理方块**——
// 火舌的收尖会一级一级跳，看着就是「一堆方块」而不是火。
// 拿 PX 当最小单位，笔触细到 1 物理像素，边缘才描得出平滑的锥度。
// 这也让效果自动跟着 ART 走：以后把 ART 调到 8 或 12，笔触自己变细，不用改代码。
const PX = 1 / ART;

// 段落插值：把整体进度 p 映射到 [a,b] 这一段内部的 0→1，段外返回 0 或 1
const seg = (p, a, b) => p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
// 一段之内先涨后落（0→1→0），用来做「亮起再熄掉」
const pulse = (p, a, b) => { const k = seg(p, a, b); return Math.sin(k * Math.PI); };
const ease = k => 1 - (1 - k) * (1 - k);

// 整个战场铺一层色。用来把「现在是火属性的场面」这件事说清楚——
// FF6 的火焰会把整屏染暖，那一下比火苗本身更有说服力。
function wash(ctx, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalAlpha = Math.min(0.55, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 冲击闪光。峰值卡在 0.45，且只在 lighter 模式下叠加，不会把画面洗成纯白
function flash(ctx, a, color = '#fff6e0') {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.45, a); ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, FH); ctx.restore();
}
// 以某点为中心的大范围加光。火、雷、光这类**是光源**——
// 只铺一层深色（第一版就是这么做的）会把画面压成土色，读起来是「脏」不是「热」。
// 用 lighter 从中心往外加光，才像这团火真的在照亮战场。
function glow(ctx, x, y, r, color, a) {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.9, a);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(0.45, color.replace('rgb(', 'rgba(').replace(')', ',0.45)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, FH); ctx.restore();
}

// 一圈扩散的环。厚度随半径变薄，看起来才像能量在摊开而不是一个圆在放大
function ring(ctx, x, y, r, color, a, thick = 3) {
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
function tongue(ctx, x, baseY, h, w, wave, phase, color) {
  ctx.fillStyle = color;
  const rows = Math.max(1, Math.round(h / PX));        // 按**物理像素**分行，不是逻辑像素
  for (let i = 0; i < rows; i++) {
    const k = i / rows;                                // 0 在底、1 在尖
    const half = w * (1 - k) ** 0.75 * 0.5;            // 收窄成尖，底部略鼓
    if (half < PX * 0.5) break;
    const off = Math.sin(k * 3.4 + phase) * wave * k;  // 越往上摆得越开
    ctx.fillRect(snap(x + off - half), snap(baseY - i * PX), Math.max(PX, half * 2), PX);
  }
}

// 一颗方形粒子。snap 到物理像素网格：不这样每步至少挪一个逻辑像素，
// ART=6 下就是 6 物理像素，火星会一格一格蹦（见 CLAUDE.md 的换算那节）
const dot = (ctx, x, y, s, col) => { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), s, s); };

// 从画面外向内聚拢的粒子：给「蓄力」段用。角度一次定死，不逐帧掷骰
const inward = (rng, n, x, y, dist) => Array.from({ length: n }, () => {
  const a = rng.next() * 6.283, d = dist * (0.7 + rng.next() * 0.6);
  return { ax: x + Math.cos(a) * d, ay: y + Math.sin(a) * d * 0.7, d: rng.next() * 0.35, s: rng.int(1, 2) };
});

// 火焰的三层：外焰最宽最高、内焰次之、焰芯最窄最矮。spread 让外层散得更开
const LAYERS = [
  { c: '#ff6a1f', w: 1.00, h: 1.00, spread: 1.15 },
  { c: '#ffc832', w: 0.62, h: 0.80, spread: 0.85 },
  { c: '#fff6d0', w: 0.30, h: 0.55, spread: 0.55 },
];

export const SPELL_FX = {
  // 火：聚(0–.22) → 爆(.22–.32) → 燃(.32–.72) → 熄(.72–1)
  fire: (x, y, rng) => {
    const gather = inward(rng, 20, x, y, 110);
    // 火柱走「画形状」而不是「撒粒子」——三版试错的结论写在 tongue() 上面。
    // 七条火舌，高矮宽窄各不同；中间那几条最高，两边矮，聚成一丛
    const tongues = Array.from({ length: 7 }, (_, i) => {
      const c = 1 - Math.abs(i - 3) / 3.4;                     // 中间 1、两边 0
      return { dx: (i - 3) * 6.5, h: (34 + c * 52) * (0.85 + rng.next() * 0.3),
               w: (7 + c * 7) * (0.8 + rng.next() * 0.4), ph: rng.next() * 6.28 };
    });
    const embers = Array.from({ length: 26 }, () => ({
      dx: rng.int(-28, 28), vy: rng.int(34, 84), d: rng.next(), w: rng.next() }));
    return { t: 0, dur: 1.25, render(ctx, p) {
      // 底色只压一点点，主要靠加光——见 glow() 上面那段
      wash(ctx, '#5a1e04', pulse(p, 0.18, 0.85) * 0.14);
      glow(ctx, x, y - 6, 120, 'rgb(255,150,50)', pulse(p, 0.20, 0.90) * 0.42);
      // 聚：火星从四面八方收进来，越近越亮
      const g = seg(p, 0, 0.26);
      if (g > 0 && g < 1) for (const q of gather) {
        const k = Math.max(0, (g - q.d) / (1 - q.d)); if (k <= 0) continue;
        const e = ease(k);
        dot(ctx, q.ax + (x - q.ax) * e, q.ay + (y - q.ay) * e, q.s, k > 0.7 ? '#fff2c4' : '#ff9a3c');
      }
      // 爆：白热核心 + 一次闪光
      const b = pulse(p, 0.22, 0.34);
      if (b > 0) {
        flash(ctx, b * 0.40, '#ffdca0');
        ctx.save(); ctx.globalAlpha = b * 0.9; ctx.fillStyle = '#fff6d0';
        ctx.beginPath(); ctx.arc(x, y, 6 + b * 26, 0, 6.29); ctx.fill();
        ctx.globalAlpha = b * 0.45; ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(x, y, 10 + b * 52, 0, 6.29); ctx.fill(); ctx.restore();
      }
      // 燃：一丛火舌。三层套着画——外橙最宽、中黄、芯白最窄，
      // 每层高度与宽度依次减小，堆出「外焰包着内焰」的层次。
      // 整丛的高度随时间起落（涨得快、落得慢），像真的烧起来又矮下去。
      const f = seg(p, 0.26, 1);
      if (f > 0) {
        const rise = f < 0.30 ? ease(f / 0.30) : 1 - (f - 0.30) / 0.70 * 0.55;   // 涨快落慢
        const baseY = y + 14;
        ctx.globalAlpha = Math.min(1, (1 - f) * 2.4);
        for (const L of LAYERS) {
          for (const q of tongues) {
            const h = q.h * rise * L.h, w = q.w * L.w;
            if (h < 2) continue;
            tongue(ctx, x + q.dx * L.spread, baseY, h, w, 5 + q.w, q.ph + p * 5.5, L.c);
          }
        }
      }
      // 熄：余烬往上飘，飘得比火舌慢也比火舌远
      const s = seg(p, 0.60, 1);
      if (s > 0) for (const q of embers) {
        const lp = (s - q.d * 0.5) / 1; if (lp <= 0) continue;
        ctx.globalAlpha = (1 - lp) * 0.8;
        dot(ctx, x + q.dx + Math.sin(lp * 4 + q.w * 6.28) * 6, y - q.vy * lp, 1, '#ffb457');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 雷：蓄(0–.30) → 击(.30–.38) → 炸(.38–.62) → 残(.62–1)
  thunder: (x, y, rng) => {
    // 主干从画面顶端劈到目标，折点一次定死——每帧重掷会变成一团噪声
    const seg1 = Array.from({ length: 9 }, (_, i) => ({ o: rng.int(-9, 9), k: i / 8 }));
    const forks = Array.from({ length: 3 }, () => ({ at: 0.3 + rng.next() * 0.5, dx: rng.int(-22, 22), dy: rng.int(8, 20) }));
    const arcs = Array.from({ length: 10 }, () => ({ a: rng.next() * 6.283, r: rng.int(10, 26), d: rng.next() * 0.4 }));
    const charge = inward(rng, 12, x, y - 34, 46);
    return { t: 0, dur: 1.15, render(ctx, p) {
      // 蓄：整场压暗，电荷在目标上方聚拢
      const c = seg(p, 0, 0.32);
      wash(ctx, '#0a0c1c', (c < 1 ? c : 1 - seg(p, 0.36, 0.7)) * 0.42);
      if (c > 0 && c < 1) for (const q of charge) {
        const k = Math.max(0, (c - q.d) / (1 - q.d)); if (k <= 0) continue;
        const e = ease(k);
        dot(ctx, q.ax + (x - q.ax) * e, q.ay + (y - 34 - q.ay) * e, q.s, '#dff0ff');
      }
      // 击：一道折线从天而降，同时闪一次
      const st = seg(p, 0.30, 0.40);
      if (st > 0) {
        const vis = st < 1 ? st : 1;
        flash(ctx, pulse(p, 0.30, 0.46) * 0.42, '#eef4ff');
        ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.globalAlpha = Math.max(0, 1 - seg(p, 0.44, 0.66));
        ctx.beginPath();
        seg1.forEach((s, i) => { const yy = s.k * (y + 2); const xx = x + s.o * (1 - s.k * 0.4);
          if (i === 0) ctx.moveTo(xx, 0); else if (s.k <= vis) ctx.lineTo(xx, yy); });
        ctx.stroke();
        ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 0.6;
        for (const f of forks) { const yy = f.at * y;
          ctx.beginPath(); ctx.moveTo(x + (1 - f.at) * 4, yy); ctx.lineTo(x + f.dx, yy + f.dy); ctx.stroke(); }
        ctx.restore();
      }
      // 炸：落点四散的电弧
      const bo = seg(p, 0.36, 0.72);
      if (bo > 0 && bo < 1) for (const q of arcs) {
        const k = Math.max(0, (bo - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = 1 - k;
        const r = q.r * ease(k);
        dot(ctx, x + Math.cos(q.a) * r, y + Math.sin(q.a) * r * 0.6, k < 0.5 ? 2 : 1, k < 0.5 ? '#ffffff' : '#8fc4ff');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 冰：凝(0–.30) → 刺(.30–.46) → 碎(.46–.66) → 落(.66–1)
  ice: (x, y, rng) => {
    const mist = inward(rng, 14, x, y, 70);
    const spikes = Array.from({ length: 7 }, (_, i) => ({
      dx: (i - 3) * 6 + rng.int(-2, 2), h: rng.int(16, 30), d: rng.next() * 0.3, w: rng.int(2, 4) }));
    const shards = Array.from({ length: 16 }, () => ({
      a: rng.next() * 6.283, v: rng.int(20, 52), s: rng.int(1, 3), spin: rng.next() }));
    return { t: 0, dur: 1.2, render(ctx, p) {
      wash(ctx, '#1e5c8a', pulse(p, 0.05, 0.8) * 0.26);
      // 凝：寒气收拢
      const g = seg(p, 0, 0.32);
      if (g > 0 && g < 1) for (const q of mist) {
        const k = Math.max(0, (g - q.d) / (1 - q.d)); if (k <= 0) continue;
        const e = ease(k); ctx.globalAlpha = 0.8;
        dot(ctx, q.ax + (x - q.ax) * e, q.ay + (y - q.ay) * e, q.s, '#cfeeff');
      }
      // 刺：冰锥从地面窜起，穿过目标
      const sp = seg(p, 0.28, 0.50);
      if (sp > 0) for (const q of spikes) {
        const k = Math.max(0, Math.min(1, (sp - q.d) / (1 - q.d))); if (k <= 0) continue;
        const h = q.h * ease(k), bx = x + q.dx, by = y + 12;
        ctx.globalAlpha = Math.min(1, k * 2) * (1 - seg(p, 0.50, 0.62));
        // 同样按物理像素分行：冰锥的锥度要平滑，逻辑像素一级一级跳会看成阶梯
        ctx.fillStyle = '#a8e4ff';
        const rows = Math.max(1, Math.round(h / PX));
        for (let i = 0; i < rows; i++) {
          const w = Math.max(PX, q.w * (1 - i / rows));
          ctx.fillRect(snap(bx - w / 2), snap(by - i * PX), w, PX);
        }
        ctx.fillStyle = '#f0fbff';
        ctx.fillRect(snap(bx - PX), snap(by - h), PX * 2, Math.max(PX, h * 0.4));
      }
      // 碎：炸成碎片飞散
      const br = seg(p, 0.48, 1);
      if (br > 0) {
        if (br < 0.25) flash(ctx, (0.25 - br) * 1.2 * 0.30, '#dff2ff');
        for (const q of shards) {
          ctx.globalAlpha = (1 - br) ** 0.8;
          const r = q.v * ease(br);
          dot(ctx, x + Math.cos(q.a) * r, y + Math.sin(q.a) * r * 0.7 + br * br * 14, q.s, q.spin > 0.5 ? '#e8f8ff' : '#8fd2f0');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 暗：蚀(0–.34) → 塌(.34–.50) → 炸(.50–.62) → 散(.62–1)
  dark: (x, y, rng) => {
    const motes = Array.from({ length: 18 }, () => ({
      a: rng.next() * 6.283, r0: rng.int(26, 58), d: rng.next() * 0.3, s: rng.int(1, 2) }));
    return { t: 0, dur: 1.15, render(ctx, p) {
      // 蚀：黑从画面四周收进来。用径向渐变做暗角，比铺一层黑更有「被吞」的意思
      const e = seg(p, 0, 0.40) * (1 - seg(p, 0.66, 1));
      if (e > 0.01) {
        ctx.save(); ctx.globalAlpha = e * 0.72;
        const gr = ctx.createRadialGradient(x, y, 8, x, y, 150);
        gr.addColorStop(0, 'rgba(10,4,16,0)'); gr.addColorStop(1, 'rgba(10,4,16,1)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, FH); ctx.restore();
      }
      // 塌：碎屑向中心收，最后聚成一个黑点
      const c = seg(p, 0.10, 0.52);
      if (c > 0 && c < 1) for (const q of motes) {
        const k = Math.max(0, (c - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = 0.85;
        const r = q.r0 * (1 - ease(k));
        dot(ctx, x + Math.cos(q.a) * r, y + Math.sin(q.a) * r * 0.7, q.s, '#7a4fa8');
      }
      const core = seg(p, 0.30, 0.54);
      if (core > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0410';
        ctx.beginPath(); ctx.arc(x, y, 3 + core * 9, 0, 6.29); ctx.fill();
      }
      // 炸：紫环炸开
      const b = seg(p, 0.52, 1);
      if (b > 0) {
        if (b < 0.2) flash(ctx, (0.2 - b) * 1.6 * 0.26, '#c9a8e8');
        ring(ctx, x, y, 6 + ease(b) * 78, '#c9a8e8', (1 - b) ** 1.3, 3.5 * (1 - b) + 0.6);
        ring(ctx, x, y, 2 + ease(b) * 52, '#6a2f9a', (1 - b) * 0.8, 2.5 * (1 - b) + 0.4);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 光：降(0–.32) → 闪(.32–.42) → 绽(.42–.70) → 升(.70–1)
  light: (x, y, rng) => {
    const rays = Array.from({ length: 8 }, (_, i) => ({ a: i * 0.785 + rng.next() * 0.2, len: rng.int(26, 44) }));
    const motes = Array.from({ length: 14 }, () => ({ dx: rng.int(-16, 16), v: rng.int(16, 40), d: rng.next() * 0.5 }));
    return { t: 0, dur: 1.15, render(ctx, p) {
      wash(ctx, '#fff0c0', pulse(p, 0.10, 0.9) * 0.20);
      // 降：一道光柱从天而降，落到目标身上
      const d = seg(p, 0, 0.36);
      if (d > 0) {
        const h = ease(Math.min(1, d)) * (y + 6);
        ctx.save(); ctx.globalAlpha = (1 - seg(p, 0.46, 0.8)) * 0.75;
        const gr = ctx.createLinearGradient(0, 0, 0, y + 6);
        gr.addColorStop(0, 'rgba(255,246,208,0.05)'); gr.addColorStop(1, 'rgba(255,246,208,0.65)');
        ctx.fillStyle = gr; ctx.fillRect(snap(x - 7), 0, 14, h); ctx.restore();
      }
      // 闪
      flash(ctx, pulse(p, 0.32, 0.48) * 0.38, '#fffbe8');
      // 绽：八方光芒
      const b = seg(p, 0.38, 0.82);
      if (b > 0 && b < 1) {
        ctx.save(); ctx.globalAlpha = Math.sin(b * Math.PI) * 0.9;
        ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 1.2;
        for (const r of rays) {
          const L = r.len * ease(b);
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(r.a) * L, y + Math.sin(r.a) * L * 0.7); ctx.stroke();
        }
        ctx.restore();
      }
      // 升：光点上飘
      const u = seg(p, 0.5, 1);
      if (u > 0) for (const q of motes) {
        const k = Math.max(0, (u - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * 0.9;
        dot(ctx, x + q.dx, y - q.v * k, 1, '#fff8d8');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 治愈：涌(0–.35) → 环(.35–.58) → 散(.58–1)。全程不闪，这是「好事」不是打击
  heal: (x, y, rng) => {
    const up = Array.from({ length: 18 }, () => ({
      dx: rng.int(-14, 14), v: rng.int(20, 48), d: rng.next() * 0.55, s: rng.int(1, 2) }));
    return { t: 0, dur: 1.05, render(ctx, p) {
      wash(ctx, '#2e7a4a', pulse(p, 0.05, 0.9) * 0.16);
      // 涌：绿点从脚下升起
      for (const q of up) {
        const k = (p - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.95;
        dot(ctx, x + q.dx + Math.sin(k * 3.2 + q.dx) * 2, y + 12 - q.v * k, q.s, k < 0.5 ? '#bff3cd' : '#7fd8a0');
      }
      // 环：一圈光自下而上扫过身体
      const r = seg(p, 0.30, 0.66);
      if (r > 0 && r < 1) {
        ctx.globalAlpha = Math.sin(r * Math.PI) * 0.9;
        ring(ctx, x, y + 12 - r * 26, 13 - r * 3, '#dfffe8', 1, 2);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 毒：涌(0–.40) → 罩(.40–.72) → 沉(.72–1)。不闪不炸，靠「慢慢漫上来」渗人
  poison: (x, y, rng) => {
    const bub = Array.from({ length: 20 }, () => ({
      dx: rng.int(-16, 16), v: rng.int(14, 34), d: rng.next() * 0.5, s: rng.int(2, 4), w: rng.next() }));
    return { t: 0, dur: 1.2, render(ctx, p) {
      wash(ctx, '#3d1a52', pulse(p, 0.08, 0.92) * 0.30);
      // 罩：一团雾把目标裹住
      const m = pulse(p, 0.25, 0.9);
      if (m > 0.01) {
        ctx.save(); ctx.globalAlpha = m * 0.42;
        const gr = ctx.createRadialGradient(x, y, 2, x, y, 26);
        gr.addColorStop(0, 'rgba(150,80,190,0.9)'); gr.addColorStop(1, 'rgba(90,30,130,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 26, 0, 6.29); ctx.fill(); ctx.restore();
      }
      for (const q of bub) {
        const k = (p - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (0.95 - k * 0.95);
        dot(ctx, x + q.dx + Math.sin(k * 3.6 + q.w * 6.28) * 5 * k, y + 8 - q.v * k, q.s,
          k < 0.45 ? '#d7a3e8' : '#6a1b8a');
      }
      ctx.globalAlpha = 1;
    } };
  },
};
