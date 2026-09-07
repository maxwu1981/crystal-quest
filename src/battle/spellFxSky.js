// 雷与光——**从天上来**的两种。共同的语法：先压暗蓄势，再一道垂直的东西劈下来。
// 演出上跟火（往上腾）、冰（向内收）刻意相反，玩家不看颜色也该认得出是哪一种。
//
// 画笔在 fxKit.js，做法上的三条铁律见那里的文件头。
// 另外两条来自火焰那次三版试错（写在 fxKit.js 的 tongue() 上面）：
//   **画形状不撒粒子**；**按目标大小 o.w/o.h 缩放**，同一发魔法罩在小怪和 boss 身上不能一样大。
import { snap } from '../core/draw.js';
import { seg, pulse, ease, wash, flash, dot, inward } from './fxKit.js';

export const SKY_FX = {
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
};
