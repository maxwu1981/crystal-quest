// 战斗特效：纯渲染，不碰战斗逻辑。effects.add('fire', x, y) 即可。
import { snap } from '../core/draw.js';
import { SPELL_FX } from './spellFx.js';

export class Effects {
  constructor(rng) { this.rng = rng; this.list = []; this.shakeT = 0; }
  add(kind, x, y, opts) { const make = FX[kind]; if (make) this.list.push(make(x, y, this.rng, opts || {})); }
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
  // ---- 属性魔法 ----
  // 都做成「起手→爆开→散去」三段，而不是单纯撒一把粒子：
  // 先有一个亮核撑开，再是本体，最后余烬/余晖。刻意避开高频闪烁（会晃眼）。
  fire: (x, y, rng) => {
    const ps = Array.from({ length: 22 }, () => ({
      dx: rng.int(-11, 11), vy: rng.int(26, 62), s: rng.int(2, 4), d: rng.next() * 0.35, w: rng.next() }));
    return { t: 0, dur: 0.62, render(ctx, p) {
      // 亮核：前 30% 撑开，之后收掉
      if (p < 0.45) {
        const k = p / 0.45;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = '#fff6d0';
        const r = 3 + k * 13;
        ctx.beginPath(); ctx.arc(x, y + 2, r, 0, 6.29); ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(x, y + 2, r * 1.5, 0, 6.29); ctx.fill();
      }
      // 火舌：白心→黄→橙→暗红余烬，越晚越暗
      for (const q of ps) {
        const lp = (p - q.d) / (1 - q.d); if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = (1 - lp) ** 0.8;
        ctx.fillStyle = lp < 0.22 ? '#fff8e0' : lp < 0.5 ? '#ffd23f' : lp < 0.78 ? '#ff6a1f' : '#8c2b12';
        const sway = Math.sin(lp * 5 + q.w * 6.28) * 3 * lp;   // 火舌摇一下，不是直上直下
        ctx.fillRect(snap(x + q.dx + sway), snap(y + 8 - q.vy * lp), q.s, q.s);
      }
    } };
  },
  thunder: (x, y, rng) => {
    // 主干 + 两条分叉，位置一次性定好（每帧重 roll 会变成噪点）
    const trunk = [[x + rng.int(-5, 5), -4]];
    for (let yy = 12; yy < y; yy += 9) trunk.push([x + rng.int(-9, 9), yy]);
    trunk.push([x, y]);
    const forks = [0, 1].map(() => {
      const i = 1 + rng.int(0, Math.max(0, trunk.length - 3));
      const [bx, by] = trunk[i];
      return [[bx, by], [bx + rng.int(-14, 14), by + rng.int(8, 16)], [bx + rng.int(-20, 20), by + rng.int(16, 26)]];
    });
    const line = (ctx, pts) => { ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); };
    return { t: 0, dur: 0.42, render(ctx, p) {
      // 落雷瞬间整片发白，然后迅速收成黄色的电弧 —— 用连续的 alpha，不做逐帧通断
      if (p < 0.18) { ctx.globalAlpha = (1 - p / 0.18) * 0.5; ctx.fillStyle = '#fffbe0'; ctx.fillRect(x - 34, 0, 68, y + 20); }
      const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 5; line(ctx, trunk);
      ctx.globalAlpha = fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; line(ctx, trunk);
      ctx.globalAlpha = fade * 0.8; ctx.lineWidth = 1.2;
      for (const f of forks) line(ctx, f);
      // 落点的余晖圈
      ctx.globalAlpha = (1 - p) * 0.7; ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y + 6, 6 + p * 18, 3 + p * 7, 0, 0, 6.29); ctx.stroke();
    } };
  },
  heal: (x, y, rng) => {
    const ps = Array.from({ length: 14 }, () => ({ dx: rng.int(-11, 11), d: rng.next() * 0.45, s: rng.int(1, 2) }));
    return { t: 0, dur: 0.75, render(ctx, p) {
      // 一圈光环从头顶罩下来
      if (p < 0.6) {
        const k = p / 0.6;
        ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = '#c8ffe0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y - 16 + k * 26, 13 - k * 3, 4, 0, 0, 6.29); ctx.stroke();
      }
      // 升起的光点
      for (const q of ps) {
        const lp = (p - q.d) / 0.55; if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = (1 - lp) ** 0.7;
        ctx.fillStyle = lp < 0.5 ? '#eaffee' : '#69f0ae';
        ctx.fillRect(snap(x + q.dx), snap(y + 10 - 28 * lp), q.s, q.s);
      }
    } };
  },
  ice: (x, y, rng) => {
    // 冰晶先从四周向内收，撞在一起再炸开
    const ps = Array.from({ length: 10 }, () => ({ a: rng.next() * 6.28, r: 16 + rng.next() * 10, d: rng.next() * 0.18, s: rng.int(3, 5) }));
    return { t: 0, dur: 0.6, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / (1 - q.d); if (lp <= 0) continue;
        const inward = Math.min(1, lp / 0.45);
        const dist = lp < 0.45 ? q.r * (1 - inward) : (lp - 0.45) / 0.55 * 26;
        ctx.globalAlpha = lp < 0.45 ? 1 : (1 - (lp - 0.45) / 0.55);
        ctx.fillStyle = lp < 0.45 ? '#e8f8ff' : '#5cc8f5';
        const cx = snap(x + Math.cos(q.a) * dist), cy = snap(y + Math.sin(q.a) * dist);
        const h = q.s;
        ctx.fillRect(cx, cy - h, 1, h * 2); ctx.fillRect(cx - h, cy, h * 2, 1);   // 六角雪花的两笔
        ctx.fillRect(cx - h + 1, cy - h + 1, 1, 1); ctx.fillRect(cx + h - 1, cy + h - 1, 1, 1);
      }
      // 命中瞬间的霜环
      if (p > 0.4 && p < 0.85) {
        const k = (p - 0.4) / 0.45;
        ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 4 + k * 20, 0, 6.29); ctx.stroke();
      }
    } };
  },
  poison: (x, y, rng) => {
    const ps = Array.from({ length: 14 }, () => ({ dx: rng.int(-11, 11), d: rng.next() * 0.45, s: rng.int(2, 4), w: rng.next() }));
    return { t: 0, dur: 0.72, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / 0.58; if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = (0.95 - lp * 0.95);
        ctx.fillStyle = lp < 0.45 ? '#d7a3e8' : '#6a1b8a';
        const sway = Math.sin(lp * 4 + q.w * 6.28) * 4 * lp;    // 毒气是飘的，不是直冲
        ctx.fillRect(snap(x + q.dx + sway), snap(y + 8 - 22 * lp), q.s, q.s);
      }
    } };
  },
  // 暗：先塌缩成一个黑点，再把周围吞进去炸开一圈紫边
  dark: (x, y) => ({ t: 0, dur: 0.5, render(ctx, p) {
    if (p < 0.4) {
      const k = p / 0.4;
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#1a0326';
      ctx.beginPath(); ctx.arc(x, y, 18 * (1 - k) + 3, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#8e4fd0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 20 * (1 - k) + 4, 0, 6.29); ctx.stroke();
    } else {
      const k = (p - 0.4) / 0.6;
      ctx.globalAlpha = (1 - k) * 0.9; ctx.fillStyle = '#2b0a3d';
      ctx.beginPath(); ctx.arc(x, y, 3 + k * 16, 0, 6.29); ctx.fill();
      ctx.globalAlpha = (1 - k); ctx.strokeStyle = '#b98ae0'; ctx.lineWidth = 2 * (1 - k) + 0.6;
      ctx.beginPath(); ctx.arc(x, y, 4 + k * 22, 0, 6.29); ctx.stroke();
    }
  } }),
  spark: (x, y) => ({ t: 0, dur: 0.4, render(ctx, p) {
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff'; const r = 4 + p * 10;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(snap(x + Math.cos(a) * r), snap(y + Math.sin(a) * r), 2, 2); }
  } }),
};
