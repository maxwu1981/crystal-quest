// 冰与毒——**向内收**和**往上洇**的两种。
//
// 冰：寒气从画面外收拢 → 把目标封进一根晶柱 → 一裂到底 → 炸成一地棱角分明的碎片（dur 1.15，脆而快）。
// 毒：脚下先烂出一摊黏泥 → 浊雾翻涌上来吞掉目标 → 毒气漫满战场 → 沉回去但**不散**（dur 1.40，黏而慢）。
// 这个时长差本身就是两者的性格，别调成一样。三种属性关掉颜色只看运动也该分得出来：
// 火往上腾、冰向内收再炸开、毒往上洇再黏住。
//
// 做法上的铁律见 fxKit.js 文件头（防闪三条、战场只到 FH、rng 只在构造时掷不在 render 里掷），
// 以及 tongue() 上面那段火焰三版试错的结论：
//   ① **画形状，不撒粒子**——冰是有棱有面的晶体与碎片，毒是成团翻滚的浊雾轮廓加黏液挂丝，
//      两个都不是点阵。旧版就是败在这里：冰是十来个小方块闪一下，毒是一撮往上飘的点。
//   ② **最小笔触用 PX**（＝1 物理像素）。冰尤其吃这一条：棱线用 lineWidth = 1 的话，
//      ART=6 下是 6 物理像素的粗边，冰就成了漫画描线而不是晶体。
//   ③ **按 o.w/o.h 缩放**，同一发魔法罩在小史莱姆和罩在 boss 身上不能一样大。
//
// **毒是全体魔法**（spells.json 里 scope:'all'），spellVolley 会给每只活着的敌人各加
// 一份这个演出——全屏那两层会**叠加**。所以毒这边的 wash（0.07）与毒气带（0.26）
// 峰值都压得低，按最常见的两只校准；而且**毒全程一次都不闪**：lighter 模式的闪光叠四次
// 是真会伤眼的，何况「毒」的可怕在于慢慢漫上来，不在爆。冰是单体，才敢用那一下白闪。
import { snap } from '../core/draw.js';
import { W, FH, PX, seg, pulse, ease, wash, flash, glow } from './fxKit.js';

// ---- 形状画笔。只有这两种用得上，暂时不往 fxKit 里塞 ----

// 一块面。冰晶的每个棱面、每片碎片都是一块多边形
function poly(ctx, pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.closePath(); ctx.fill();
}
// 一条棱。**笔触固定 PX**＝1 物理像素，才描得出「棱边亮、面透」的那道细高光；
// 用 1 的话就是 ART 倍粗的黑边。冰的所有可读性都压在这几条线上。
function edge(ctx, pts, col, k = 1.1, close = true) {
  ctx.strokeStyle = col; ctx.lineWidth = PX * k; ctx.lineJoin = 'miter'; ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[0][0], pts[0][1]);
  if (close) ctx.closePath();
  ctx.stroke();
}
// 取折线的前 k（0–1），末段按比例插值。裂纹靠这个「一路裂过去」——
// 整条一次画完只是一根静止的线，看不出裂的方向和速度
function trail(pts, k) {
  const n = pts.length - 1, f = Math.max(0, Math.min(n, k * n)), i = Math.floor(f), t = f - i;
  const out = pts.slice(0, i + 1);
  if (i < n) out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  return out;
}
// 一团浊雾。**所有 puff 进同一条路径、只 fill 一次**：nonzero 填充规则会把重叠部分
// 并成一整块，边界只剩最外圈那条起伏的轮廓。一个个分开 fill 的话，每个 puff 的边
// 都会在重叠处显出来，读作「一串泡泡」而不是「一团雾」——这是毒能不能成立的关键。
// 翻滚靠 ph 推进、半径按角度做三次谐波起伏：形状是**算**出来的，不是逐帧掷出来的。
function cloud(ctx, list, cx, cy, sx, sy, grow, ph, fill, a) {
  if (a <= 0.004) return;
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = fill; ctx.beginPath();
  for (const q of list) {
    const R = q.r * grow, px = cx + q.dx * sx * 0.6, py = cy - q.dy * sy * 0.6;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20 * 6.2832;
      const rr = R * (1 + q.k[0] * Math.sin(3 * t + ph * q.sp) + q.k[1] * Math.sin(5 * t - ph * q.sp * 1.3)
                        + q.k[2] * Math.sin(2 * t + q.ph));
      const X = px + Math.cos(t) * rr * sx, Y = py + Math.sin(t) * rr * sy;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.closePath();
  }
  ctx.fill();
}
// 一条黏液挂丝：从挂点往下逐行画横条，上粗下细，快到尖时先鼓出一颗珠子再收。
// 和火舌同一个道理——按**物理像素**分行，按逻辑像素分行会一级一级跳成阶梯。
function strand(ctx, x, topY, len, w, ph, col) {
  ctx.fillStyle = col;
  const rows = Math.max(1, Math.round(len / PX));
  for (let i = 0; i < rows; i++) {
    const k = i / rows;
    const bead = k > 0.78 ? Math.sin((k - 0.78) / 0.22 * Math.PI) * 1.7 : 0;
    const half = Math.max(PX * 0.5, w * ((1 - k * 0.6) + bead) * 0.5);
    ctx.fillRect(snap(x + Math.sin(k * 2.4 + ph) * 1.6 * k - half), snap(topY + i * PX), half * 2, PX);
  }
}

// 按目标大小算缩放比。基准 44×44（一般杂鱼的画面尺寸），夹在 0.9–2.3：
// 不夹的话小怪身上那点冰小得看不见，横向巨怪会撑出一片糊到屏幕边的蓝
const S = v => Math.max(0.9, Math.min(2.3, v / 44));

export const COLD_FX = {
  // 冰：霜(0–.26) → 封(.16–.36) → 裂(.30–.52) → 碎(.42–1)
  // 段与段刻意重叠一点，交接处不会「啪」地换场。
  // 尺度四段各不相同：**远**（冰刃从画面外插进来）→ **紧**（晶柱裹住目标）
  // → **满屏**（白闪＋冰刃朝外崩开）→ **散**（碎片飞得到处都是）。
  //
  // 白闪的峰值落在 p≈0.41 也就是 0.47 秒：actions.js 的 spellOn 等 0.45 秒才结算伤害，
  // 「炸开」和「伤害数字跳出来」必须是同一件事（第一版闪在 0.56 秒，读起来是两件事）。
  // 碎片段从 0.42 铺到片尾，不然最后三分之一是空画面——冰是快，但快不等于提前结束。
  ice: (x, y, rng, o = {}) => {
    const kx = S(o.w || 44), ky = S(o.h || 44);
    const foot = y + (o.h ? o.h / 2 : 22);              // 晶柱从脚下长起来，不是浮在躯干上
    // 晶柱半宽 / 全高。基准 24×62 而不是目标的 22×44——**要比目标大一圈**，
    // 不然读起来是「怪身上贴了块冰」而不是「怪被封进冰里」。
    // 火舌能到 92 高，冰这边收在 62：它是一根实心柱子，等高的话会压得整屏都是蓝
    const hw = 24 * kx, ht = 62 * ky;
    // 晶柱骨架，构造时抖一次定死（rng 只在构造时掷）。归一化：半宽 1、高 1、底在 y=0。
    // **一根冰柱之所以读作冰柱，靠的不是轮廓而是分面**——腰上一道横线、中间一道竖脊，
    // 把它切成四块明暗不同的面。只描一圈轮廓的话（第一版就是）全尺寸看是一片圆头的叶子。
    // 底边故意折成三段、有两处探到 y>0 扎进地里：一条横平的底边就是横切线，火焰那次栽过。
    const J = (v, r) => v * (1 - r + rng.next() * r * 2);
    const lean = (rng.next() - 0.5) * 0.30;             // 整根歪一点，天然结晶不对称
    const rx = -0.16 + rng.next() * 0.32;               // 脊线的 x，不在正中
    const gy = -0.62 - rng.next() * 0.10;               // 腰线的 y。左右两端不等高，
    const gr = gy - 0.04 - rng.next() * 0.09;           // 腰线才是斜的——水平的腰线太像屋檐
    const bs = [[-J(0.86, 0.10), -0.02], [-0.44, 0.05], [rx, -0.02], [0.46, 0.06], [J(0.88, 0.10), -0.02]];
    const lf = [[-J(1, 0.06), -0.32], [-J(0.90, 0.08), gy]];
    const cp = [[-J(0.48, 0.22), -0.84], [rx, -1], [J(0.52, 0.22), -0.91]];
    const rt = [[J(0.92, 0.08), gr], [J(1, 0.06), -0.28]];
    const gm = [rx, (gy + gr) / 2 - 0.03];              // 腰线与脊线的交点
    const OUT = [bs[0], lf[0], lf[1], cp[0], cp[1], cp[2], rt[0], rt[1], bs[4], bs[3], bs[2], bs[1]];
    // 四块面：左身最暗、右身次之、左冠、右冠最亮。**都是半透明的**，
    // 亮的是那几条 PX 宽的棱线——「棱边亮、面透」，冰跟火最大的差别就在这
    const FACE = [[[bs[0], lf[0], lf[1], gm, bs[2], bs[1]], 'rgba(40,92,144,0.38)'],
                  [[bs[2], gm, rt[0], rt[1], bs[4], bs[3]], 'rgba(96,160,206,0.28)'],
                  [[lf[1], cp[0], cp[1], gm], 'rgba(140,200,238,0.30)'],
                  [[gm, cp[1], cp[2], rt[0]], 'rgba(206,240,255,0.26)']];
    // 脚下的一堆霜：**画在晶柱之后**，把柱底那条边和八根冰刺的根一起埋掉
    const mound = Array.from({ length: 6 }, (_, i) => ({
      dx: (i - 2.5) * 11 + (rng.next() - 0.5) * 6, dy: rng.next() * 3, r: 9 + rng.next() * 8, sp: 0.3,
      k: [0.12 + rng.next() * 0.12, 0.06 + rng.next() * 0.08, 0.08 + rng.next() * 0.09],
      ph: rng.next() * 6.283 }));
    // 冰刃：从画面外朝目标插进来。每片是个**细长的菱形**，尖端朝着飞行方向——
    // 旧版这一段是十来个 1–2px 的方块，全尺寸看就是一撮灰点
    const blades = Array.from({ length: 13 }, () => ({
      a: rng.next() * 6.283, d0: 96 + rng.next() * 56, len: 9 + rng.next() * 12,
      w: 1.3 + rng.next() * 2, lag: rng.next() * 0.42 }));
    // 冰刺：从地面窜起围住晶柱。起脚高低差 ±3，**绝不能齐平**——
    // 一排东西对齐同一条线就会连成横切线，火焰那次就是栽在这里
    const spurs = Array.from({ length: 8 }, (_, i) => ({
      dx: (i - 3.5) * 8.4 + (rng.next() - 0.5) * 7, dy: (rng.next() - 0.5) * 9,
      h: 7 + rng.next() * 15, w: 5.5 + rng.next() * 7,
      tilt: (rng.next() - 0.5) * 14, lag: rng.next() * 0.5 }));
    // 裂纹：在晶柱的归一化坐标里走折线，五条各有起点与走向
    const cracks = Array.from({ length: 5 }, () => {
      let cx = (rng.next() - 0.5) * 0.9, cy = -0.16 - rng.next() * 0.6, ang = rng.next() * 6.283;
      const pts = [[cx, cy]];
      for (let i = 0; i < 4; i++) {
        ang += (rng.next() - 0.5) * 1.7;
        const L = 0.16 + rng.next() * 0.22;
        cx += Math.cos(ang) * L; cy += Math.sin(ang) * L * 0.85; pts.push([cx, cy]);
      }
      return { pts, lag: rng.next() * 0.3 };
    });
    // 碎片：三四个顶点的不规则块，各自自转。**不是方块粒子**——
    // 冰碎了应该是一地带棱的片，方块粒子只会读成「噪点」
    const shards = Array.from({ length: 20 }, () => {
      const n = rng.next() < 0.42 ? 4 : 3, r0 = 2.4 + rng.next() * 3.6;
      return {
        p: Array.from({ length: n }, (_, i) => {
          const a = i / n * 6.283 + rng.next() * 0.7, r = r0 * (0.5 + rng.next() * 0.8);
          return [Math.cos(a) * r, Math.sin(a) * r];
        }),
        // v 用平方分布：大半是慢的、留在原地往下掉，少数几片飞得远。
        // 均匀分布的话所有碎片会**同时**离开中心，散成一个空心圆环
        a: rng.next() * 6.283, v: 10 + rng.next() ** 2 * 82, rot: rng.next() * 6.283,
        spin: (rng.next() - 0.5) * 8, lit: rng.next() < 0.45, lag: rng.next() * 0.22 };
    });

    return { t: 0, dur: 1.15, render(ctx, p) {
      wash(ctx, '#0c2c4c', pulse(p, 0.04, 0.86) * 0.22);
      // 全屏那层霜：从四边往里长、中心留空，交代「整场都冷下来了」。
      // 用径向渐变，没有硬圈；正常合成不是 lighter，所以不算闪
      const rime = seg(p, 0.04, 0.28) * (1 - seg(p, 0.56, 0.94));
      if (rime > 0.01) {
        // 峰值 0.11：第一版给到 0.20，跟中段的白闪一叠整帧就成了一张白纸，
        // 晶柱的棱线全被洗掉。这一层只是**底子**，主角是那几条棱
        ctx.save(); ctx.globalAlpha = rime * 0.11;
        const g = ctx.createRadialGradient(x, y, 40, x, y, 200);
        g.addColorStop(0, 'rgba(198,236,255,0)'); g.addColorStop(1, 'rgba(198,236,255,0.95)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, FH); ctx.restore();
      }
      // 霜：冰刃收拢
      const g0 = seg(p, 0, 0.26);
      if (g0 > 0 && g0 < 1) for (const q of blades) {
        const k = Math.max(0, (g0 - q.lag) / (1 - q.lag)); if (k <= 0) continue;
        const d = q.d0 * (1 - ease(k)), c = Math.cos(q.a), s = Math.sin(q.a);
        const cx = x + c * d, cy = y + s * d * 0.72, L = q.len * kx, w = q.w;
        const P = [[cx - c * L, cy - s * L * 0.72], [cx + s * w, cy - c * w],
                   [cx + c * L * 0.5, cy + s * L * 0.36], [cx - s * w, cy + c * w]];
        ctx.globalAlpha = Math.min(1, k * 1.8) * 0.9;
        poly(ctx, P, k > 0.72 ? 'rgba(232,250,255,0.92)' : 'rgba(140,204,240,0.80)');
        edge(ctx, P, '#f2feff', 0.9);
      }
      // 封：晶柱长起来把目标裹住。左右两个棱面明暗不同、中间一道亮脊——
      // 「棱边亮、面透」：面的 alpha 只有 0.30–0.42，目标始终看得见，
      // 亮的是那几条 PX 宽的棱线。冰的透明不是均匀的，这一条是它跟火最大的差别
      const fr = seg(p, 0.16, 0.34), alive = 1 - seg(p, 0.42, 0.56);
      const grow = 0.18 + ease(fr) * 0.82;
      // 归一化骨架 → 画面坐标。lean 按高度错开，越高偏得越多
      const M = ([a, b]) => [x + (a + lean * -b) * hw, foot + b * ht * grow];
      if (fr > 0 && alive > 0) {
        ctx.globalAlpha = alive;
        for (const [pts, col] of FACE) poly(ctx, pts.map(M), col);
        edge(ctx, OUT.map(M), 'rgba(238,253,255,0.92)', 1.3);
        edge(ctx, [cp[1], gm, bs[2]].map(M), 'rgba(200,240,255,0.62)', 1, false); // 脊
        edge(ctx, [lf[1], gm, rt[0]].map(M), 'rgba(200,240,255,0.52)', 1, false); // 腰
      }
      // 冰刺：围着晶柱窜起。三角形，左棱描亮
      const sp = seg(p, 0.15, 0.36);
      if (sp > 0 && alive > 0) {
        ctx.globalAlpha = alive * 0.92;
        for (const q of spurs) {
          const k = Math.max(0, Math.min(1, (sp - q.lag) / (1 - q.lag))); if (k <= 0) continue;
          const bx = x + q.dx * kx, by = foot + q.dy, h = q.h * ky * ease(k), w = q.w * kx;
          const P = [[bx - w / 2, by], [bx + w / 2, by], [bx + q.tilt * kx * 0.9, by - h]];
          poly(ctx, P, 'rgba(150,212,244,0.55)');
          edge(ctx, [P[0], P[2]], '#eefdff', 1);
        }
      }
      // 地上堆起来的霜。**必须画在晶柱和冰刺之后**：柱底那条边和八根冰刺的底边
      // 全是横平的直线，露出来就是一排横切线。轮廓用 cloud() 起伏一下，边界自己就糊了。
      // 晶柱碎了它还留着慢慢化，收尾才不至于戛然而止
      const md = seg(p, 0.15, 0.30) * (1 - seg(p, 0.76, 1));
      if (md > 0.01) {
        cloud(ctx, mound, x, foot + 1, kx * (0.7 + md * 0.5), ky * 0.44, 1, p * 1.2, '#6f9dbe', md * 0.62);
        cloud(ctx, mound, x, foot + 2, kx * (0.6 + md * 0.4), ky * 0.34, 0.9, p * 1.2 + 2, '#cfe8f8', md * 0.62);
        glow(ctx, x, foot + 1, 36 * kx, 'rgb(110,175,220)', md * 0.15);
      }
      // 裂：五条裂纹一路裂过去
      const cr = seg(p, 0.30, 0.46);
      if (cr > 0 && alive > 0) {
        ctx.globalAlpha = alive * Math.min(1, cr * 3);
        for (const q of cracks) {
          const k = Math.max(0, (cr - q.lag) / (1 - q.lag)); if (k <= 0) continue;
          edge(ctx, trail(q.pts, k).map(M), '#f6ffff', 1.35, false);
        }
      }
      // **整个法术只闪这一下**。pulse 是正弦不是开关：跨 0.22 秒，起落各 0.11 秒 ≥0.08；
      // 峰值 0.36 < 0.45。「碎裂」最容易做成高频白闪，这里刻意只给一次慢起慢落
      const bang = pulse(p, 0.30, 0.52);
      if (bang > 0.004) {
        flash(ctx, bang * 0.36, '#dcefff');
        glow(ctx, x, y, 128 * kx, 'rgb(146,212,255)', bang * 0.22);
      }
      // 冲击：**开头那批冰刃反过来朝外炸出去**。试过两版几何椭圆环，
      // 不管调多细多快，静帧上都是一个又干净又完整的椭圆浮在画面上，
      // 读作 UI 控件不是冲击波。换成同一批刃反向飞就成立了——
      // 而且首尾呼应：收进来的寒气原样被崩出去。形状永远比图元可信。
      const sw = seg(p, 0.32, 0.64);
      if (sw > 0 && sw < 1) for (const q of blades) {
        const d = 10 + ease(sw) * (56 + q.d0 * 0.4) * kx, c = Math.cos(q.a), s = Math.sin(q.a);
        const L = q.len * kx * (1 - sw * 0.5), w = q.w * (1 - sw * 0.5);
        const cx = x + c * d, cy = y + s * d * 0.7;
        const P = [[cx + c * L, cy + s * L * 0.7], [cx + s * w, cy - c * w],
                   [cx - c * L * 0.5, cy - s * L * 0.36], [cx - s * w, cy + c * w]];
        ctx.globalAlpha = (1 - sw) ** 1.3 * 0.9;
        poly(ctx, P, 'rgba(214,242,255,0.90)');
        edge(ctx, P, '#f4ffff', 0.8);
      }
      // 碎：晶柱炸成一地碎片，旋转着飞散并下坠
      const br = seg(p, 0.42, 1);
      if (br > 0) for (const q of shards) {
        const k = Math.max(0, Math.min(1, (br - q.lag) / (1 - q.lag))); if (k <= 0) continue;
        const r = q.v * ease(k) * kx * 0.9;
        const cx = x + Math.cos(q.a) * r, cy = y + Math.sin(q.a) * r * 0.7 + k * k * 36 * ky;
        const rot = q.rot + q.spin * k, c = Math.cos(rot), s = Math.sin(rot);
        const P = q.p.map(([a, b]) => [cx + (a * c - b * s) * kx, cy + (a * s + b * c) * kx]);
        ctx.globalAlpha = (1 - k) ** 0.5 * 0.95;
        poly(ctx, P, q.lit ? 'rgba(228,248,255,0.90)' : 'rgba(104,168,210,0.85)');
        edge(ctx, P, '#f4ffff', 0.9);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 毒：渗(0–.18) → 涌(.18–.42) → 罩(.34–.78) → 黏(.70–1)
  // 尺度：**贴地**（脚下一摊，扁而宽）→ **立起来**（雾团比目标高）
  // → **满屏**（毒气从战场底边漫上来）→ **收回贴地**（沉下去，挂着丝化掉）。
  // 火是「往上腾然后熄」，冰是「收拢然后炸」，毒是「洇上来然后**不走**」。
  poison: (x, y, rng, o = {}) => {
    const kx = S(o.w || 44), ky = S(o.h || 44);
    const foot = y + (o.h ? o.h / 2 : 22);
    // 每个 puff 的谐波系数与相位都在这里掷死。翻滚靠相位推进——
    // 在 render 里重新掷骰会变成一团噪点抖动，毒雾最容易犯这个
    // amp 是轮廓的起伏幅度。**最外那层要给最大**：能不能读成雾全看外轮廓有没有
    // 凹进去的口子，圆滚滚的边界读作灌木丛。里层被外层压着，起伏小一点反而干净
    const puff = (n, dx, dy, r, sp, amp = 1) => Array.from({ length: n }, () => ({
      dx: (rng.next() * 2 - 1) * dx, dy: rng.next() * dy, r: r + rng.next() * r * 1.1, sp,
      k: [(0.16 + rng.next() * 0.16) * amp, (0.08 + rng.next() * 0.12) * amp,
          (0.10 + rng.next() * 0.14) * amp],
      ph: rng.next() * 6.283 }));
    // 三层各有**自己的一组 puff**，不是同一组缩放三次。
    // 同一组缩放的话三层是同心的，读起来是等高线地形图；各自一组，
    // 亮的部分才会散落在雾团各处，像翻涌起来被照到的那几个鼓包
    // 里层的 puff 要**摊得更开、单个更小**：挤在中间的话六团并成一坨，
    // 又变回同心的等高线。摊开之后亮的是散落的几个鼓包，那才是翻涌
    const body = puff(11, 20, 21, 6.5, 1, 1.55);        // 外层：最大最淡、边最碎
    const midl = puff(9, 20, 20, 3.6, 1.4);
    const core = puff(7, 17, 18, 2.3, 1.9);             // 芯：最小最亮
    const mud = puff(5, 15, 2, 8, 0.35);                // 脚下那摊黏泥（扁的）
    const bubs = Array.from({ length: 12 }, () => ({
      dx: (rng.next() * 2 - 1) * 23, dy: (rng.next() * 2 - 1) * 7,
      r: 1 + rng.next() * 2.2, d: rng.next(), sp: 0.8 + rng.next() * 1.1 }));
    const drips = Array.from({ length: 8 }, () => ({
      dx: (rng.next() * 2 - 1) * 20, hang: 3 + rng.next() * 8, len: 8 + rng.next() * 17,
      w: 1.1 + rng.next() * 1.5, lag: rng.next() * 0.45, ph: rng.next() * 6.283 }));
    const wob = rng.next() * 6.283;

    return { t: 0, dur: 1.40, render(ctx, p) {
      const roll = p * 5.2;                             // 翻滚相位，全片共用
      // 峰值只有 0.07：全体魔法最多叠四份，1-(1-.07)^4≈0.25，
      // 跟火焰（单体、0.14）才是同一个量级。第一版给 0.10，四只敌人时整屏糊成一块绿板，
      // 连天空都绿了——**要绿的是地面**，那是毒气带的活，不是这一层的
      wash(ctx, '#31501a', pulse(p, 0.06, 0.94) * 0.07);
      // 渗：脚下先烂出一摊。轮廓是起伏的，不是一个干干净净的椭圆
      const sl = seg(p, 0, 0.18) * (1 - seg(p, 0.88, 1));
      if (sl > 0.01) {
        const e = 0.5 + sl * 0.5;
        cloud(ctx, mud, x, foot + 1, kx * e, ky * 0.26 * e, 1, roll * 0.4, '#1b2a0b', sl * 0.62);
        cloud(ctx, mud, x, foot, kx * e * 0.84, ky * 0.20 * e, 0.8, roll * 0.4 + 1.7, '#3d5c16', sl * 0.50);
      }
      // 冒泡：黏泥表面鼓起来又破掉。每颗是有轮廓有高光的泡，不是一个点
      const bu = seg(p, 0.05, 0.9) * (1 - seg(p, 0.86, 1));
      if (bu > 0.02) for (const q of bubs) {
        const c = (p * q.sp * 1.9 + q.d) % 1;
        const bx = x + q.dx * kx, by = foot + q.dy;
        const r = q.r * kx * (c < 0.78 ? ease(c / 0.78) : 1);
        ctx.globalAlpha = bu * (c < 0.78 ? 0.75 : (1 - c) / 0.22 * 0.75);
        ctx.fillStyle = 'rgba(60,88,20,0.85)';
        ctx.beginPath(); ctx.ellipse(bx, by, r, r * 0.62, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(140,186,54,0.9)';
        ctx.beginPath(); ctx.ellipse(bx, by - r * 0.18, r * 0.78, r * 0.42, 0, 0, 6.29); ctx.fill();
        ctx.strokeStyle = '#d4ee74'; ctx.lineWidth = PX * 1.1;
        ctx.beginPath(); ctx.ellipse(bx, by, r, r * 0.62, 0, 3.45, 5.65); ctx.stroke();
        if (c > 0.78) {                                 // 破掉的那一圈
          const f = (c - 0.78) / 0.22;
          ctx.globalAlpha = bu * (1 - f) * 0.55;
          ctx.beginPath(); ctx.ellipse(bx, by, r * (1 + f * 4), r * 0.62 * (1 + f * 4), 0, 0, 6.29); ctx.stroke();
        }
      }
      // 涌：三层浊雾从那摊泥里翻上来吞掉目标。外层最淡最大、芯最亮最小，
      // 三层都半透明，目标从雾里透得出来（旧版是一撮往上飘的点，根本没有体量）
      const up = seg(p, 0.18, 0.42), sink = seg(p, 0.70, 1);
      const rise = ease(up) * (1 - sink * 0.45);
      // 尾段刻意留 26% 的残雾：全消掉的话最后那几条挂丝是凭空垂在半空的绿线。
      // 「黏着不散」这四个字全靠这个残量
      const fade = Math.min(1, up * 3) * (1 - sink * 0.74);
      if (fade > 0.01) {
        // 雾团**必须坐在地上**：抬高的话地上那摊和雾之间空出一条缝，
        // 读作「雾浮在半空」，跟「黏着不散」正相反。够高靠 puff 的 dy 摊开，不靠整体抬升
        const cy = foot - 16 * ky * rise;
        const sx = kx * (0.55 + rise * 0.75), sy = ky * (0.40 + rise * 0.80);
        // 最外这一层只是**毛边**：撑大 1.28 倍、只有 0.14，把主体那圈硬边糊掉。
        // 没有它的话雾团是个剪影，边缘利得像贴纸
        cloud(ctx, body, x, cy - 2, sx, sy, 1.28, roll * 0.8, '#2c4410', fade * 0.14);
        cloud(ctx, body, x, cy, sx, sy, 1.00, roll, '#33500f', fade * 0.40);
        cloud(ctx, midl, x, cy + 1, sx, sy, 1.00, roll * 1.30 + 2.1, '#6f9e24', fade * 0.42);
        cloud(ctx, core, x, cy + 2, sx, sy, 1.00, roll * 1.70 + 4.3, '#bcda52', fade * 0.38);
      }
      // 罩：毒气从战场底边往上洇。**上缘是起伏的**——一条直线横过屏幕是这一套里
      // 最招骂的东西，毒雾的下（这里是上）边缘尤其危险。
      // 峰值 0.26：这是全体魔法，会叠。encounters.json 的分布是 1 只 26%、2 只 49%、
      // 3 只 23%、4 只只有 2%——所以按**两只**校准（叠起来 0.45），不为那 2% 牺牲其余
      //
      // 第一版整条都是橄榄色，放进游戏一看整段消失了——六堆平原本来就是草地，
      // 绿盖绿等于没画。所以上缘要描一道亮边：**有边界的东西在什么底子上都看得见**，
      // 光靠一层染色只会跟背景融掉。这道边是波浪不是直线，所以不算横切线。
      const hz = seg(p, 0.34, 0.62) * (1 - seg(p, 0.80, 1));
      if (hz > 0.01) {
        const top = FH - (28 + 62 * hz);
        const crest = Array.from({ length: 37 }, (_, i) => {
          const u = i / 36;
          return [u * W, top + Math.sin(u * 8.4 + wob + roll * 0.35) * 5 + Math.sin(u * 19 - roll * 0.5) * 2.4];
        });
        // 由亮到暗跨完一整条：贴着上缘是**发亮的酸绿**，往下压到近黑的墨绿。
        // 靠的是明度落差而不是色相，所以压在天空上、压在草地上都读得出来
        ctx.save(); ctx.globalAlpha = hz * 0.26;
        const g = ctx.createLinearGradient(0, top - 10, 0, FH);
        g.addColorStop(0, 'rgba(198,222,96,0)'); g.addColorStop(0.10, 'rgba(178,204,74,0.55)');
        g.addColorStop(0.38, 'rgba(96,132,32,0.80)'); g.addColorStop(1, 'rgba(20,32,8,0.95)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, FH);
        for (const [cx2, cy2] of crest) ctx.lineTo(cx2, cy2);
        ctx.lineTo(W, FH); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = hz * 0.45; edge(ctx, crest, '#c8e267', 1.5, false);
        ctx.restore();
      }
      // 黏：从雾团底下垂下黏液，越拉越长、尖上鼓出珠子，最后断掉落下去。
      // 这是毒跟火/冰最不一样的地方——它是**黏的**，不会干干净净地散掉
      const dr = seg(p, 0.34, 1);
      if (dr > 0) for (const q of drips) {
        const k = Math.max(0, Math.min(1, (dr - q.lag) / (1 - q.lag))); if (k <= 0) continue;
        const ay = foot - 16 * ky * rise - q.hang * ky * 0.7;
        const len = q.len * ky * ease(k);
        ctx.globalAlpha = Math.min(1, k * 4) * (1 - sink * 0.65) * 0.85;
        strand(ctx, x + q.dx * kx, ay, len, q.w * kx, q.ph + roll * 0.5, '#84b62c');
        if (k > 0.70) {                                 // 断掉的那颗珠子往下掉
          const f = (k - 0.70) / 0.30, r = q.w * kx * 0.9;
          ctx.globalAlpha *= (1 - f) ** 0.8;
          ctx.fillStyle = '#c2df58';
          ctx.beginPath(); ctx.ellipse(x + q.dx * kx, ay + len + f * f * 34 * ky, r, r * 1.4, 0, 0, 6.29); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};
