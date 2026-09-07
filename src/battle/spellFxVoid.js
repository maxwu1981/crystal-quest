// 暗与治疗——**一吞一放**的两种。暗是把光和目标一起吸进去，治疗是从下往上托。
// 治疗放在这里不是凑数：它和暗共用「以目标为中心的向心/离心运动」这套骨架，
// 方向正好相反，一起调才调得准。
//
// 画笔在 fxKit.js，做法上的三条铁律见那里的文件头。
// 另外两条来自火焰那次三版试错（写在 fxKit.js 的 tongue() 上面）：
//   **画形状不撒粒子**；**按目标大小 o.w/o.h 缩放**，同一发魔法罩在小怪和 boss 身上不能一样大。
import { seg, pulse, ease, wash, flash, dot, W, FH, ring } from './fxKit.js';

export const VOID_FX = {
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
};
