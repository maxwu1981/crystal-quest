// 雷与光——都**从天上来**，但来的方式正好相反，玩家不看颜色也该分得出是哪一种：
//   雷是**一瞬间劈下来的枝干**：垂直、有分叉、有粗细变化，亮一次就走，剩下地面的余震；
//   光是**漫下来、又从脚下升起的一束**：柔和、成束、有环，来得慢也散得慢。
// 火是「往上腾」，冰是「向内收」，这两个都不该有那两种的动势。
//
// 画笔在 fxKit.js，做法上的铁律见那里的文件头。其中**全屏闪光那三条对这两个尤其要紧**：
// 雷的「连闪几下」和光的「一直亮着」是全套七种里最容易做出癫痫风险的两个写法，
// 所以两边都只闪一次——雷是**亮起一次然后拖尾**（不是频闪），光是**慢慢涨到峰值再慢慢退**。
// 另外两条来自火焰那次三版试错（写在 fxKit.js 的 tongue() 上面）：
//   **画形状不撒粒子**；**按目标大小 o.w/o.h 缩放**，同一发魔法罩在小怪和 boss 身上不能一样大。
import { snap } from '../core/draw.js';
import { FH, PX, seg, pulse, ease, wash, flash, glow, dot, inward } from './fxKit.js';

// 按目标大小缩放，和火焰同一条曲线：基准 44×44，夹在 0.9–2.3。
// 不夹的话小史莱姆身上那道雷细得看不见，横向巨怪会撑出一片糊到屏幕边的白。
const S = v => Math.max(0.9, Math.min(2.3, v / 44));

// 沿一串带宽度的点画一条枝干／光束：按**物理像素**步进，每步落一个方块。
//
// **为什么不用 ctx.stroke()**：lineWidth 是逻辑单位，ART=6 时 `lineWidth = 1.6`
// 落到屏幕上是 9.6 物理像素宽的抗锯齿粗线——旧版那道「细歪线」其实又粗又糊，
// 而且一条线从头到尾一个宽度，没有闪电该有的粗细变化。
// 逐步落方块才能让宽度沿路连续收细，边缘也落在任意物理像素上。
function limb(ctx, pts, k, color) {
  ctx.fillStyle = color;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const step = Math.max(PX, (a.w + b.w) * 0.25 * k);   // 方块之间叠一半，边缘才连得上
    const n = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j <= n; j++) {
      const t = j / n, w = Math.max(PX, (a.w + (b.w - a.w) * t) * k);
      ctx.fillRect(snap(a.x + dx * t - w / 2), snap(a.y + dy * t - w / 2), w, w);
    }
  }
}
// 一条枝干的骨架：起点到终点之间折 n 次，宽度沿路收细并带随机起伏（等宽的不像电）。
// 折点在**构造时**一次掷定；逐帧重掷就成了噪点抖动（fxKit 文件头第 7 条）。
function branch(rng, x0, y0, x1, y1, w0, w1, jag, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, e = i === 0 || i === n ? 0 : 1;      // 两端不偏，否则接不上主干
    return { x: x0 + (x1 - x0) * t + (rng.next() * 2 - 1) * jag * e,
             y: y0 + (y1 - y0) * t + (rng.next() * 2 - 1) * jag * 0.3 * e,
             w: (w0 + (w1 - w0) * t) * (0.72 + rng.next() * 0.56) };
  });
}
// 一条竖直的丝／柱。按物理像素行从底往上画，宽度沿高度渐变，**两端各自渐隐**。
//
// 两端渐隐是刻意的：一排丝若都从同一条基线满不透明地起画，底边就连成一条横切线——
// 火焰正是栽在这上面（见 fxKit 的 tongue()）。这里靠 alpha 化掉，不靠外扩。
// step 给大一点（光柱一百多逻辑像素高）能省掉几千次 fillRect，
// 而纵向的透明度渐变分档到 2–3 物理像素是看不出来的。
function strand(ctx, bx, by, h, wBot, wTop, a, color, ph, wob, fadeBot, fadeTop, step) {
  if (h <= step) return;
  const rows = Math.round(h / step);
  ctx.fillStyle = color;
  for (let i = 0; i < rows; i++) {
    const k = i / rows;                                  // 0 在底、1 在顶
    const f = Math.min(1, k / fadeBot) * Math.min(1, (1 - k) / fadeTop);
    if (f <= 0.012) continue;
    ctx.globalAlpha = a * f;
    const w = Math.max(PX, wBot + (wTop - wBot) * k);
    ctx.fillRect(snap(bx + Math.sin(k * 3.1 + ph) * wob * k - w / 2), snap(by - i * step), w, step);
  }
}

// 一圈冲击环。fxKit 的 ring() 是一条等亮度的椭圆描边——放大了看就是「一个几何圆」，
// 干净得像线框，读不出是能量在摊开（第一版实测：三条一起走活像三个呼啦圈）。
// 这里拆成 44 段短弧，每段亮度按角度起伏（相位构造时定死，不逐帧掷骰），
// 环上就有了明暗参差，也不会在画面上留下一条闭合的硬线。
// ry 比 fxKit 更扁（0.42），读作「摊在地上」而不是「立在空中」。
function halo(ctx, x, y, r, color, a, thick, ph, flat = 0.42) {
  if (a <= 0.012 || r <= 0) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(PX, thick);
  const n = 44;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * 6.283;
    const m = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t0 * 3 + ph)) * (0.5 + 0.5 * Math.abs(Math.sin(t0)));
    ctx.globalAlpha = Math.min(1, a * m);
    // 相邻两段**严丝合缝地接**（+1 而不是 +0.9 或 +1.25）：
    // 留缝的那版是一圈虚线，叠着画的那版在重叠处透明度翻倍、成了一串珠子，
    // 两种都比原来那条干净的实线更假。butt 端盖的切线和下一段起点重合，接得上。
    // 参差只能来自亮度，不能来自缺口或重叠
    ctx.beginPath(); ctx.ellipse(x, y, r, r * flat, 0, t0, (i + 1) / n * 6.283); ctx.stroke();
  }
  ctx.restore();
}

// 闪电的三层，套着画：外晕最宽最透（紫蓝）、中层亮蓝、芯白最窄最实。
// 和火焰同一个道理——由外向内越来越不透明，视线被引到芯上，
// 边缘那圈晕又半透明得能看见底下的怪（render.js 那边已经把目标压到 0.45）。
const BOLT = [
  { c: '#5f6cff', k: 2.40, a: 0.34 },
  { c: '#8fd8ff', k: 1.35, a: 0.66 },
  { c: '#ffffff', k: 0.55, a: 0.95 },
];

export const SKY_FX = {
  // 雷：兆(0–.30) → 劈(.30–.42) → 爆(.42–.66) → 余(.66–1)
  //   兆 **局部**：天压暗，云底的脉络先亮，目标脚下窜起静电细丝——「这里要挨劈了」
  //   劈 **全屏**：一道带二级分叉的枝干从画面顶端劈到脚下；全场只闪这一次
  //   爆 **局部**：落点向两侧爬开的地电 + 两圈冲击环，尺度收回地面
  //   余 **局部**：电弧在目标身上零星跳几下，暗色退干净
  // 段与段之间尺度在变（局部→全屏→地面→贴身），变化本身就是节奏。
  thunder: (x, y, rng, o = {}) => {
    const kx = S(o.w || 44), ky = S(o.h || 44);
    const foot = Math.min(FH - 6, y + (o.h ? o.h / 2 : 22));   // 劈在脚下，不是躯干中心
    const tw = 1.3 + kx * 1.25;                                // 主干宽：小怪 ~2.4、boss ~4.2
    // 主干：从画面顶端一路折到落点。折 16 段，越往下越细
    const trunk = branch(rng, x + rng.int(-14, 14), -4, x, foot, tw, tw * 0.5, 5.2, 16);
    // 分叉：从主干的某一节斜着分出去，七成概率再分一次。
    // at 是它挂在主干上的位置——主干还没劈到那儿，分叉就不该先出现
    const forks = [];
    for (let i = 0; i < 5; i++) {
      const at = 0.20 + i * 0.15 + rng.next() * 0.07;
      const b = trunk[Math.min(trunk.length - 2, Math.round(at * trunk.length))];
      const dir = rng.next() < 0.5 ? -1 : 1, len = 15 + rng.next() * 26;
      const pts = branch(rng, b.x, b.y, b.x + dir * len * (0.55 + rng.next() * 0.7),
        b.y + len * (0.5 + rng.next() * 0.6), b.w * 0.62, PX, 3.4, 6);
      forks.push({ at, pts });
      if (rng.next() < 0.7) {
        const m = pts[3];
        forks.push({ at: at + 0.04, pts: branch(rng, m.x, m.y, m.x + dir * (6 + rng.next() * 15),
          m.y + 5 + rng.next() * 12, m.w * 0.75, PX, 2.2, 4) });
      }
    }
    // 云底的脉络：横着走，只在蓄势那段隐隐亮，预告雷从哪片天来
    const veins = Array.from({ length: 3 }, (_, i) => ({
      d: rng.next() * 0.45,
      pts: branch(rng, x + rng.int(-78, -22), 4 + i * 5, x + rng.int(22, 78), 5 + i * 5 + rng.int(-3, 3),
        1.3, 0.4, 2.6, 8) }));
    // 地面爬电：落点向两侧沿地面爬开的枝干。**这是形状不是散点**——
    // 旧版那圈四散的小方块看着像噪声，爬电才读得出「电顺着地面走掉了」。
    // 六条的落脚 y 必须错开（±7）、末端高低也各不相同：第一版全压在 foot 这一条线上，
    // 六条叠起来直接连成一根横杠——正是第 5 条禁止的那种硬边
    const crawl = Array.from({ length: 6 }, (_, i) => {
      const dir = i % 2 ? 1 : -1, len = (24 + rng.next() * 30) * kx;
      const y0 = foot + rng.int(-6, 6), y1 = y0 + rng.int(-7, 9);
      return { d: rng.next() * 0.26,
        pts: branch(rng, x + rng.int(-3, 3), y0, x + dir * len, y1, 1.1, PX, 3.2, 7) };
    });
    // 静电细丝：蓄势时从脚下窜起来的短丝
    const hairs = Array.from({ length: 9 }, (_, i) => ({
      dx: (i - 4) * 4.2 * kx + rng.int(-2, 2), dy: rng.int(-3, 2),
      h: (7 + rng.next() * 13) * ky, w: 0.5 + rng.next() * 0.7,
      d: rng.next() * 0.5, ph: rng.next() * 6.28 }));
    // 余震：贴在目标身上的短弧，各自在自己的窗口里亮一下。
    // 六条错开亮，不是六条一起闪——一起闪就成了频闪
    const clings = Array.from({ length: 6 }, (_, i) => {
      const ox = (i % 2 ? 1 : -1) * (o.w ? o.w * 0.44 : 19) * (0.55 + rng.next() * 0.6);
      const oy = (rng.next() - 0.5) * (o.h ? o.h * 0.8 : 34);
      return { at: i * 0.13 + rng.next() * 0.05,
        pts: branch(rng, x + ox, y + oy, x + ox * 0.2, y + oy + rng.int(-11, 11), 1.9, PX, 3.4, 5) };
    });
    // 电荷：从画面外收进目标脚下。**终点必须各自错开**——
    // 十四颗全收敛到同一个坐标时，就算每颗只有 0.08 的透明度，叠十四层也是 0.69，
    // 劈之前那两帧目标脚边会杵着一颗接近不透明的白方块（放大到物理像素才看得出来）
    const charge = inward(rng, 14, x, foot - 4, 62).map(q => ({
      ...q, tx: x + rng.int(-8, 8), ty: foot - 4 + rng.int(-6, 5) }));
    const sparks = Array.from({ length: 14 }, () => ({
      dx: rng.int(-24, 24) * kx, vy: rng.int(26, 62), d: rng.next() * 0.6, w: rng.next() }));

    return { t: 0, dur: 1.25, render(ctx, p) {
      // ---- 兆 ----
      // 压暗：涨得慢（0.375 秒）、退得更慢（0.375 秒）。暗色骤退本身就是一次闪
      const dim = seg(p, 0, 0.30) * (1 - seg(p, 0.30, 0.60));
      wash(ctx, '#080a1e', dim * 0.44);
      const c = seg(p, 0.04, 0.32);
      if (c > 0 && c < 1) {
        const cf = Math.sin(c * Math.PI);
        ctx.save();
        for (const v of veins) {
          const k = Math.max(0, (c - v.d) / (1 - v.d)); if (k <= 0) continue;
          ctx.globalAlpha = cf * 0.5;
          limb(ctx, v.pts.slice(0, Math.max(2, Math.ceil(v.pts.length * ease(k)))), 1, '#7ea8ff');
        }
        for (const h of hairs) {
          const k = Math.max(0, (c - h.d) / (1 - h.d)); if (k <= 0) continue;
          strand(ctx, x + h.dx, foot + h.dy, h.h * ease(k), h.w, PX, cf * 0.75, '#bfe6ff',
            h.ph, 1.6, 0.3, 0.5, PX);
        }
        for (const q of charge) {
          const k = Math.max(0, (c - q.d) / (1 - q.d)); if (k <= 0 || k > 0.86) continue;
          const e = ease(k);
          ctx.globalAlpha = Math.min(1, (1 - k / 0.86) * 2.4);   // 还没到岸就先淡掉
          dot(ctx, q.ax + (q.tx - q.ax) * e, q.ay + (q.ty - q.ay) * e, q.s, k > 0.6 ? '#eaf6ff' : '#7fb4ff');
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // ---- 劈 ----
      // 全场只闪这一次：峰值 0.42（上限 0.45），起落各 0.11 秒（下限 0.08）。
      // 「连劈三下」很诱人，但那正是光敏性风险最高的写法，改成亮一次然后拖尾
      flash(ctx, pulse(p, 0.285, 0.47) * 0.42, '#e8f0ff');
      const st = seg(p, 0.30, 0.42);
      if (st > 0) {
        const cut = Math.min(1, seg(p, 0.300, 0.336));   // 两三帧就贯穿，读作「瞬间」
        // 拖尾：芯白先退（乘方退得快），外晕留得最久
        const life = 1 - seg(p, 0.345, 0.62);
        // 加光收着用：第一版 132×kx / 0.40，跟闪光叠在同一帧，整屏糊成一片奶白，
        // 怪彻底不见了。雷是**冷而集中**的光源，范围小一点、颜色饱和一点才对
        glow(ctx, x, foot - 14, 96 * kx, 'rgb(110,155,255)', Math.sin(st * Math.PI) * 0.26);
        ctx.save();
        for (let li = 0; li < BOLT.length; li++) {
          const L = BOLT[li];
          ctx.globalAlpha = L.a * life ** (0.7 + li * 0.9);
          if (ctx.globalAlpha < 0.02) continue;
          limb(ctx, trunk.slice(0, Math.max(2, Math.ceil(trunk.length * cut))), L.k, L.c);
          for (const f of forks) {
            if (cut < f.at) continue;
            limb(ctx, f.pts, L.k * 0.85, L.c);
          }
        }
        ctx.restore();
      }
      // ---- 爆 ----
      // 离子通道：主干退干净之后还留一道极淡的白痕，到 0.84 才散。
      // 这就是「亮一次然后拖尾」里的拖尾——**用它代替连闪几下**
      // 画宽而淡，不画细而实：细的那版读起来是「一根没擦干净的线」，
      // 宽的这版才是「刚才那道雷在空气里留下的一条热痕」
      const gh = seg(p, 0.42, 0.80);
      if (gh > 0 && gh < 1) {
        ctx.save(); ctx.globalAlpha = (1 - gh) ** 1.6 * 0.16;
        limb(ctx, trunk, 1.5, '#a8c8ff'); ctx.restore();
      }
      const bo = seg(p, 0.40, 0.76);
      if (bo > 0 && bo < 1) {
        ctx.save();
        for (const cr of crawl) {
          const k = Math.max(0, (bo - cr.d) / (1 - cr.d)); if (k <= 0) continue;
          const grow = Math.max(2, Math.ceil(cr.pts.length * ease(Math.min(1, k * 1.8))));
          ctx.globalAlpha = (1 - k) ** 0.7 * 0.7;
          limb(ctx, cr.pts.slice(0, grow), 2.2, '#4f63e8');
          ctx.globalAlpha = (1 - k) ** 0.9;
          limb(ctx, cr.pts.slice(0, grow), 0.8, '#dff0ff');
        }
        ctx.restore();
        for (let i = 0; i < 2; i++) {
          const k = seg(p, 0.40 + i * 0.10, 0.80 + i * 0.10); if (k <= 0 || k >= 1) continue;
          halo(ctx, x, foot + i * 3, (10 + ease(k) * 60) * kx, i ? '#8fc0ff' : '#e8f2ff',
            (1 - k) ** 1.3 * 0.46, 2.6 * (1 - k), i * 2.1);
        }
      }
      // ---- 余 ----
      const af = seg(p, 0.62, 1);
      if (af > 0) {
        // 落点还烫着：一摊压得很低的余光陪到最后一帧，
        // 不留这一摊的话尾段整屏只剩两条小弧，空得像特效提前结束了
        glow(ctx, x, foot - 2, 42 * kx, 'rgb(90,130,235)', (1 - af) ** 1.4 * 0.30);
        ctx.save();
        for (const cl of clings) {
          const k = (af - cl.at) / 0.24; if (k <= 0 || k >= 1) continue;
          const kf = Math.sin(k * Math.PI);
          ctx.globalAlpha = kf * 0.55;
          limb(ctx, cl.pts, 2.6, '#4a5fe0');
          ctx.globalAlpha = kf * 0.85;
          limb(ctx, cl.pts, 1.2, '#8fc4ff');
          ctx.globalAlpha = kf * 0.95;
          limb(ctx, cl.pts, 0.5, '#f4faff');
        }
        ctx.restore();
        for (const q of sparks) {
          const lp = (af - q.d * 0.5) / 0.9; if (lp <= 0 || lp >= 1) continue;
          ctx.globalAlpha = (1 - lp) * 0.8;
          dot(ctx, x + q.dx + Math.sin(lp * 5 + q.w * 6.28) * 5, foot - q.vy * lp, 1, '#a8ccff');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 光：兆(0–.26) → 降(.26–.50) → 绽(.50–.76) → 升(.76–1)
  //   兆 **局部**：脚下先浮出一个环，环上冒起细光丝；头顶的天开始亮——光是先「照过来」的
  //   降 **全屏**：一束（九条）光柱从画面顶端漫下来罩住目标，落地时全场只闪这一次
  //   绽 **中景**：六道光束从目标身上射出 + 三重光环摊开。六道是照着六水晶／六堆来的
  //   升 **局部**：柱收回天上，脚下的光丝一束束升起穿过目标散掉
  // 光属性在剧情里是六水晶合成的那一样东西（docs/主线设计.md「見得光」），
  // 所以它不能只是「白色的火」——它得有**仪式感**：慢起、成束、对称、有环。
  light: (x, y, rng, o = {}) => {
    const kx = S(o.w || 44), ky = S(o.h || 44);
    const foot = Math.min(FH - 6, y + (o.h ? o.h / 2 : 22));
    // 一束光柱＝九条宽窄不一的带。整块梯形填一次的话读作「一张贴纸」，
    // 九条各自的宽度／透明度／到达时刻都不同，叠起来才有束感，边缘也自然参差
    const N = 9;
    const beams = Array.from({ length: N }, (_, i) => {
      const c = 1 - Math.abs(i - (N - 1) / 2) / (N / 2 + 0.7);     // 中间 1、两边 0
      return { dx: (i - (N - 1) / 2) * 4.6, dy: rng.int(-5, 4),
        w: (2.6 + c * 7.4) * (0.72 + rng.next() * 0.55),
        // 每条都很透（中间那条也只有 0.31）。九条叠起来罩在怪身上已经接近不透明了，
        // 第一版 0.44 的时候整只怪被柱子吃掉，玩家看不见自己在打谁（第 4 条）
        a: 0.11 + c * 0.20, d: rng.next() * 0.26, ph: rng.next() * 6.28 };
    });
    // 六道放射：主束六条（每 60°），中间再插六条短的填空隙——
    // 仍是六重对称，只是不至于稀疏得像个星号
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a0 = (i >> 1) * (Math.PI / 3) + (i & 1 ? Math.PI / 6 : 0) + 0.22;
      const long = !(i & 1);
      const len = (long ? 52 + rng.next() * 24 : 26 + rng.next() * 14) * kx;
      const w0 = long ? 6.2 : 3.0;
      return { long, pts: Array.from({ length: 7 }, (_, j) => {
        const t = j / 6, r = len * t, aa = a0 + Math.sin(t * 2.4) * 0.10;
        return { x: x + Math.cos(aa) * r, y: y + Math.sin(aa) * r * 0.74,
                 w: w0 * (1 - t) ** 0.8 + 0.15 };
      }) };
    });
    // 升起的光丝：长短、快慢、起脚高低全错开，免得又连出一条横切线
    const wisps = Array.from({ length: 14 }, (_, i) => ({
      dx: (i - 6.5) * 3.4 * kx + rng.int(-2, 2), dy: rng.int(-4, 4),
      h: (16 + rng.next() * 34) * ky, w: 0.6 + rng.next() * 1.5,
      d: rng.next() * 0.55, ph: rng.next() * 6.28 }));
    const motes = Array.from({ length: 16 }, () => ({
      dx: rng.int(-26, 26) * kx, vy: rng.int(18, 48), d: rng.next() * 0.6, w: rng.next() }));

    return { t: 0, dur: 1.25, render(ctx, p) {
      // 底色只染一点点，主要靠加光——铺深色会把「光」压成土黄。
      // 加光的峰值**故意错开闪光的峰值**（这里 0.62，闪光在 0.45）：
      // 第一版两个峰撞在同一帧，加上光柱和核，整屏烧成一块白板，怪完全看不见了。
      // 错开之后亮度是两个缓坡而不是一根尖刺，读起来反而更亮更久
      wash(ctx, '#fff0c8', pulse(p, 0.06, 0.94) * 0.15);
      glow(ctx, x, y - 4, 108 * kx, 'rgb(255,236,182)', pulse(p, 0.24, 1.0) * 0.30);
      // ---- 兆 ----
      const pre = seg(p, 0, 0.28);
      if (pre > 0) {
        const fade = 1 - seg(p, 0.74, 1);
        halo(ctx, x, foot, (7 + ease(pre) * 20) * kx, '#ffeba8', pre * fade * 0.5, 1.8, 0.7);
        glow(ctx, x, -6, 84 * kx, 'rgb(255,246,214)', pre * 0.26);   // 头顶的天先亮
        for (const wp of wisps) {
          const k = Math.max(0, (pre - wp.d * 0.5) / 1); if (k <= 0) continue;
          strand(ctx, x + wp.dx, foot + wp.dy, wp.h * 0.4 * ease(k), wp.w * 0.6, PX,
            k * 0.5, '#fff4cc', wp.ph, 1.2, 0.3, 0.55, PX * 2);
        }
      }
      // ---- 降 ----
      const dn = seg(p, 0.22, 0.52);
      if (dn > 0) {
        const back = 1 - seg(p, 0.62, 0.97) * 0.94;   // 绽开之后柱子就该往天上收了
        ctx.save();
        for (const b of beams) {
          const k = Math.max(0, Math.min(1, (dn - b.d) / (1 - b.d))); if (k <= 0) continue;
          const top = foot + b.dy, h = ease(k) * (top + 10);
          strand(ctx, x + b.dx * kx, top, h, b.w * kx * back, b.w * kx * 1.45 * back,
            b.a * back, '#fff8dc', b.ph, 1.1, 0.10, 0.55, PX * 3);
        }
        ctx.restore();
        // 柱子踩到地上的那一摊：把底部彻底糊开，同时交代「光是落在地上的」
        ctx.globalAlpha = 1;
        glow(ctx, x, foot, 36 * kx, 'rgb(255,244,206)', Math.min(1, dn * 1.5) * (1 - seg(p, 0.72, 1)) * 0.42);
      }
      // 全场只闪这一次：峰值 0.34，起落各 0.1375 秒。光是「涨上来」的，
      // 用比雷更宽的窗口——同样一个峰值，涨得慢就柔和得多；
      // 而且光这一发本来就满屏都是亮东西，闪光可以比雷再欠一点
      flash(ctx, pulse(p, 0.34, 0.56) * 0.34, '#fff6dc');
      // ---- 绽 ----
      const bl = seg(p, 0.44, 0.80);
      if (bl > 0 && bl < 1) {
        const e = Math.sin(bl * Math.PI);
        ctx.save();
        for (const r of rays) {
          const grow = ease(Math.min(1, bl * (r.long ? 1.5 : 2.2)));
          const n = Math.max(2, Math.ceil(r.pts.length * grow));
          ctx.globalAlpha = e * 0.42;
          limb(ctx, r.pts.slice(0, n), 1.9, '#ffd97a');
          ctx.globalAlpha = e * 0.72;
          limb(ctx, r.pts.slice(0, n), 1.0, '#fff3c4');
          ctx.globalAlpha = e * 0.92;
          limb(ctx, r.pts.slice(0, n), 0.42, '#fffdf2');
        }
        ctx.restore();
        // 目标身上的核：不画实心，画两层半透明的圆，怪还得透得出来。
        // 半径也收着（第一版 7+17，罩住整只怪就成了一坨白饼）
        ctx.save();
        ctx.globalAlpha = e * 0.26; ctx.fillStyle = '#ffeaa6';
        ctx.beginPath(); ctx.arc(x, y, (5 + e * 11) * kx, 0, 6.29); ctx.fill();
        ctx.globalAlpha = e * 0.5; ctx.fillStyle = '#fffdf0';
        ctx.beginPath(); ctx.arc(x, y, (2 + e * 5) * kx, 0, 6.29); ctx.fill();
        ctx.restore();
      }
      // 三重环：厚度随半径变薄，摊开而不是放大。三条错开出发、扁度各不相同——
      // 齐步走、同一个扁度的话，看着就是三个套在一起的呼啦圈
      for (let i = 0; i < 3; i++) {
        const k = seg(p, 0.46 + i * 0.10, 0.86 + i * 0.10); if (k <= 0 || k >= 1) continue;
        halo(ctx, x, y + (i === 1 ? 0 : (i ? 12 : -11)) * ky, (8 + ease(k) * 72) * kx,
          i === 2 ? '#ffe4a0' : '#fff8de', (1 - k) ** 1.2 * 0.42, 2.8 * (1 - k),
          i * 1.7, 0.34 + i * 0.13);
      }
      // ---- 升 ----
      const up = seg(p, 0.70, 1);
      if (up > 0) {
        ctx.save();
        for (const wp of wisps) {
          const k = Math.max(0, (up - wp.d * 0.6) / 0.9); if (k <= 0 || k >= 1) continue;
          strand(ctx, x + wp.dx, foot + wp.dy - wp.h * 0.9 * ease(k), wp.h * (0.45 + k * 0.55),
            wp.w, PX, (1 - k) ** 0.8 * 0.8, '#fff6d4', wp.ph + k * 2, 2.2, 0.25, 0.6, PX * 2);
        }
        ctx.restore();
        for (const q of motes) {
          const lp = (up - q.d * 0.4) / 0.8; if (lp <= 0 || lp >= 1) continue;
          ctx.globalAlpha = (1 - lp) * 0.85;
          dot(ctx, x + q.dx + Math.sin(lp * 3.4 + q.w * 6.28) * 6, foot - q.vy * lp, 1, '#fff2c0');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};
