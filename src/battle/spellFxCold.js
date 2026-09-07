// 冰与毒——**向内收、往下沉**的两种。冰是从四周收拢再炸开的脆，
// 毒是从地面往上洇、黏着不散的浊。两者都不该有火那种腾起感。
//
// 画笔在 fxKit.js，做法上的三条铁律见那里的文件头。
// 另外两条来自火焰那次三版试错（写在 fxKit.js 的 tongue() 上面）：
//   **画形状不撒粒子**；**按目标大小 o.w/o.h 缩放**，同一发魔法罩在小怪和 boss 身上不能一样大。
import { snap } from '../core/draw.js';
import { seg, pulse, ease, wash, flash, dot, inward, PX } from './fxKit.js';

export const COLD_FX = {
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
