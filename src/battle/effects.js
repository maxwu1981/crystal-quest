// 战斗特效：纯渲染，不碰战斗逻辑。effects.add('fire', x, y) 即可。
export class Effects {
  constructor(rng) { this.rng = rng; this.list = []; this.shakeT = 0; }
  add(kind, x, y) { const make = FX[kind]; if (make) this.list.push(make(x, y, this.rng)); }
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
  slash: (x, y) => ({ t: 0, dur: 0.22, render(ctx, p) {
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const o = i * 6 - 6, k = p * 20; ctx.beginPath(); ctx.moveTo(x - 12 + o + k, y - 12); ctx.lineTo(x + o + k - 4, y + 12); ctx.stroke(); }
  } }),
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
  spark: (x, y) => ({ t: 0, dur: 0.4, render(ctx, p) {
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff'; const r = 4 + p * 10;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2); }
  } }),
};
