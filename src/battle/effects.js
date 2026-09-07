// 战斗特效：纯渲染，不碰战斗逻辑。effects.add('fire', x, y) 即可。
import { snap } from '../core/draw.js';
import { SPELL_FX } from './spellFx.js';

export class Effects {
  constructor(rng) { this.rng = rng; this.list = []; this.shakeT = 0; }
  // 返回建好的特效对象，调用方要拿它的 dur——目标的「被笼罩」时间必须跟特效等长，
  // 各自写死一个数字的话，改了特效时长就会有一段火已经灭了人还是半透明的
  add(kind, x, y, opts) {
    const make = FX[kind];
    if (!make) return null;
    const e = make(x, y, this.rng, opts || {});
    this.list.push(e);
    return e;
  }
  shake(t = 0.25) { this.shakeT = Math.max(this.shakeT, t); }
  update(dt) {
    for (const e of this.list) e.t += dt;
    this.list = this.list.filter(e => e.t < e.dur);
    if (this.shakeT > 0) this.shakeT -= dt;
  }
  offset() { return this.shakeT > 0 ? [this.rng.int(-2, 2), this.rng.int(-2, 2)] : [0, 0]; }
  render(ctx) { for (const e of this.list) { ctx.save(); e.render(ctx, Math.min(1, e.t / e.dur)); ctx.restore(); } }
}

const FX = {
  // 属性魔法的演出在 spellFx.js（多段式、带全屏染色，1.2 秒左右）。
  // 这里保留的是「打击反馈」那一类：挥砍、命中、受击，每个 0.3 秒内说完一件事。
  ...SPELL_FX,
  // 命中的一瞬：一道月牙形冲击张开来，外加几点迸散的火星。
  // 原本是三条平行斜直线，读起来像划痕不像打击。
  slash: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1;                       // -1 我方打向左边的敌人，+1 反过来
    const sparks = Array.from({ length: 7 }, () => ({
      a: rng.next() * 6.28, v: 14 + rng.next() * 16, s: rng.next() < 0.4 ? 2 : 1 }));
    return { t: 0, dur: 0.28, render(ctx, p) {
      ctx.translate(x, y); ctx.scale(dir, 1);
      // 月牙：半径随时间张开，线宽随时间收细
      const R = 6 + p * 16;
      ctx.globalAlpha = (1 - p) ** 0.7;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * (1 - p) + 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, R, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,190,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, R - 3, -0.95, 0.95); ctx.stroke();
      ctx.scale(dir, 1);                            // 火星不跟着翻，四散是各向同性的
      for (const q of sparks) {
        const d = q.v * p;
        ctx.globalAlpha = (1 - p) ** 1.5;
        ctx.fillStyle = '#ffe9b0';
        ctx.fillRect(snap(Math.cos(q.a) * d), snap(Math.sin(q.a) * d), q.s, q.s);
      }
    } };
  },
  // 挥武器：刀光从后上方扫到前下方，带两道渐隐的残影。画在出手的人身上。
  swing: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1, R = o.reach ?? 23, col = o.color || '#efe9d2';
    return { t: 0, dur: 0.26, render(ctx, p) {
      ctx.translate(x, y - 4); ctx.scale(dir, 1);   // 上移到手的高度，不是躯干中心
      const A0 = -2.25, A1 = 0.75, a = A0 + (A1 - A0) * p;   // 起止角，扫过约 170°
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {                 // 一道主刀光 + 三道渐隐残影
        const tr = a - i * 0.26;
        if (tr < A0) continue;
        ctx.globalAlpha = (0.95 - i * 0.22) * (1 - p * 0.55);
        ctx.strokeStyle = i ? col : '#ffffff';      // 最前面那一道压白，看得出锋刃
        ctx.lineWidth = 3.4 - i * 0.7;
        ctx.beginPath(); ctx.arc(0, 0, R - i * 1.2, tr, tr + 0.40); ctx.stroke();
      }
    } };
  },
  // 起手施法：脚下浮起两圈光环，同时头顶聚一点光。跟挥武器要一眼分得出来。
  cast: (x, y, rng, o = {}) => {
    const col = o.color || '#9fd8c8';
    return { t: 0, dur: 0.5, render(ctx, p) {
      ctx.translate(x, y);
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const lp = p - i * 0.22; if (lp <= 0) continue;
        ctx.globalAlpha = 0.75 * (1 - lp);
        const ry = 14 - lp * 26;                 // 光环往上飘
        ctx.beginPath(); ctx.ellipse(0, ry, 13 * (1 - lp * 0.45), 4 * (1 - lp * 0.45), 0, 0, 6.29); ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, p * 2) * (1 - p) * 1.6;   // 头顶聚起来的光点
      ctx.fillStyle = '#fff';
      const s = 1 + Math.round(p * 3);
      ctx.fillRect(-s / 2, -20 - s / 2, s, s);
    } };
  },
  // 挨打：一圈向外扩的冲击环 + 朝受击方向甩出去的血色碎片。
  // 跟自己出手时的白色月牙(slash)刻意分开——玩家要一眼看出「这下是打在我身上」。
  hurt: (x, y, rng, o = {}) => {
    const dir = o.dir ?? 1;                        // 冲击来的方向
    const bits = Array.from({ length: 9 }, () => ({
      a: (rng.next() - 0.5) * 2.4, v: 12 + rng.next() * 18, s: rng.next() < 0.35 ? 2 : 1 }));
    return { t: 0, dur: 0.34, render(ctx, p) {
      ctx.translate(x, y);
      // 冲击环：从被打中的点炸开，越扩越淡越细
      ctx.globalAlpha = (1 - p) ** 0.6;
      ctx.strokeStyle = '#ffd0c0'; ctx.lineWidth = 3 * (1 - p) + 0.6;
      ctx.beginPath(); ctx.arc(0, 0, 3 + p * 19, 0, 6.29); ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.55; ctx.strokeStyle = '#e2564a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 1 + p * 25, 0, 6.29); ctx.stroke();
      // 碎片顺着冲击方向甩出去，带一点重力
      for (const q of bits) {
        const d = q.v * p;
        ctx.globalAlpha = (1 - p) ** 1.4;
        ctx.fillStyle = p < 0.4 ? '#fff1e6' : '#c2453c';
        ctx.fillRect(snap(Math.cos(q.a) * d * dir), snap(Math.sin(q.a) * d + p * p * 10), q.s, q.s);
      }
    } };
  },
  // 敌人溶解时飘散的灰烬。配合 BattleScene 的逐条溶解：光让精灵消失只是「不见了」，
  // 有东西往上飘才读得出「化掉了」。慢、少、暗——这是死亡的收尾，不该比魔法还抢眼。
  motes: (x, y, rng) => {
    const ps = Array.from({ length: 12 }, () => ({
      dx: rng.int(-10, 10), dy: rng.int(-8, 8), v: 10 + rng.next() * 15, d: rng.next() * 0.3, s: rng.next() < 0.3 ? 2 : 1 }));
    return { t: 0, dur: 0.8, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / (1 - q.d); if (lp <= 0) continue;
        ctx.globalAlpha = (1 - lp) ** 1.2 * 0.8;
        ctx.fillStyle = lp < 0.4 ? '#efe6cc' : '#8b8474';   // 先亮后暗，像烧尽的灰
        ctx.fillRect(snap(x + q.dx + Math.sin(lp * 3 + q.dx) * 2), snap(y + q.dy - q.v * lp), q.s, q.s);
      }
    } };
  },
  // ---- 属性魔法在 spellFx.js（上面 ...SPELL_FX 已经展开）----
  // 曾经这里也有一份 fire/thunder/ice/poison/dark/heal。对象字面量**后写的键覆盖先写的**，
  // 所以那份旧的一直在生效，spellFx.js 的多段式演出一次都没播过——
  // 测试全绿、控制台无错、模块体检也查不出（两边都是合法的导出与定义）。
  // 又一次「只有真的跑到那一帧才看得见」的坑，和 CLAUDE.md 记的那两次同一类。
  // **spark 必须留下**：SPELL_FX 里没有它，而 actions.js 有三处兜底要用
  // （用道具、纯状态魔法、无属性魔法）。整块删掉的话 FX['spark'] 变 undefined，
  // effects.add 里的 `if (make)` 会把它悄悄吞掉——不报错，特效直接不见。
  spark: (x, y) => ({ t: 0, dur: 0.4, render(ctx, p) {
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff'; const r = 4 + p * 10;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(snap(x + Math.cos(a) * r), snap(y + Math.sin(a) * r), 2, 2); }
  } }),
};
