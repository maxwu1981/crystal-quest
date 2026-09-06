// 战斗特效：纯渲染，不碰战斗逻辑。effects.add('fire', x, y) 即可。
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
        ctx.fillRect(Math.round(Math.cos(q.a) * d), Math.round(Math.sin(q.a) * d), q.s, q.s);
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
  fire: (x, y, rng) => {
    const ps = Array.from({ length: 16 }, () => ({ dx: rng.int(-10, 10), vy: rng.int(20, 50), s: rng.int(2, 4), d: rng.next() * 0.3 }));
    return { t: 0, dur: 0.6, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / (1 - q.d); if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = 1 - lp; ctx.fillStyle = lp < 0.5 ? '#ffeb3b' : '#ff5722';
        ctx.fillRect(Math.round(x + q.dx), Math.round(y + 8 - q.vy * lp), q.s, q.s);
      }
    } };
  },
  thunder: (x, y, rng) => {
    const pts = [[x + rng.int(-6, 6), -4]];
    for (let yy = 10; yy < y; yy += 10) pts.push([x + rng.int(-8, 8), yy]);
    pts.push([x, y]);
    return { t: 0, dur: 0.35, render(ctx, p) {
      if (Math.floor(p * 12) % 3 === 2) return;
      ctx.strokeStyle = p < 0.5 ? '#fff' : '#ffeb3b'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
    } };
  },
  heal: (x, y, rng) => {
    const ps = Array.from({ length: 10 }, () => ({ dx: rng.int(-10, 10), d: rng.next() * 0.4, s: rng.int(1, 2) }));
    return { t: 0, dur: 0.7, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / 0.6; if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = 1 - lp; ctx.fillStyle = lp < 0.5 ? '#b9f6ca' : '#69f0ae';
        ctx.fillRect(Math.round(x + q.dx), Math.round(y + 10 - 24 * lp), q.s, q.s);
      }
    } };
  },
  ice: (x, y, rng) => {
    const ps = Array.from({ length: 8 }, () => ({ dx: rng.int(-12, 12), dy: rng.int(-12, 12), d: rng.next() * 0.3 }));
    return { t: 0, dur: 0.55, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / 0.7; if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = 1 - lp; ctx.fillStyle = lp < 0.5 ? '#e1f5fe' : '#4fc3f7';
        const cx = Math.round(x + q.dx), cy = Math.round(y + q.dy - 6 * lp);
        ctx.fillRect(cx, cy - 3, 1, 7); ctx.fillRect(cx - 3, cy, 7, 1);
      }
    } };
  },
  poison: (x, y, rng) => {
    const ps = Array.from({ length: 10 }, () => ({ dx: rng.int(-10, 10), d: rng.next() * 0.4, s: rng.int(2, 3) }));
    return { t: 0, dur: 0.7, render(ctx, p) {
      for (const q of ps) {
        const lp = (p - q.d) / 0.6; if (lp <= 0 || lp >= 1) continue;
        ctx.globalAlpha = 0.9 - lp * 0.9; ctx.fillStyle = lp < 0.5 ? '#ce93d8' : '#7b1fa2';
        ctx.fillRect(Math.round(x + q.dx), Math.round(y + 8 - 20 * lp), q.s, q.s);
      }
    } };
  },
  dark: (x, y) => ({ t: 0, dur: 0.45, render(ctx, p) {
    ctx.globalAlpha = 0.8 * (1 - p); ctx.fillStyle = '#4a148c'; const r = 6 + p * 14;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
  } }),
  spark: (x, y) => ({ t: 0, dur: 0.4, render(ctx, p) {
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff'; const r = 4 + p * 10;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2); }
  } }),
};
