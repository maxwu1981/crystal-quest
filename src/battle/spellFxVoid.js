// 暗与治疗——**一吞一放**的两种。暗是把光连同目标一起吸进去，治疗是从脚下把人托起来。
// 两者共用「以目标为中心的向心 / 离心」骨架，方向正好相反；连笔都是同一支——
// leaf() 既是暗甩出去的裂片，也是治疗张开的花瓣。
// 这个对称就是它们同住一个文件的理由：改一边一定要顺手看另一边，不然两边会各自漂走。
//
// 画笔在 fxKit.js，铁律见那里的文件头。这里另外自带三支：
// ribbon() 带锥度的带子 / rift() 竖着的裂口 / leaf() 花瓣与裂片。
// fxKit 的 tongue() 是给火用的（一丛从同一条基线往上收尖），套不到「卷进去」和「张开来」上。
//
// 火（spellFx.js 的 FIRE_FX）是这一套的基准，两条最要紧的经验都是它换来的：
//   **画形状不撒粒子**——所以这个文件里一颗 dot() 都没有，全是成形的轮廓；
//   **按目标大小 o.w / o.h 缩放**——治疗尤其要小心：它打在**我方角色**身上
//   （16×24 逻辑像素，见 render.js 的 actorRect），比敌人窄得多，
//   而且 actions.js 那边 `fx.add('heal', ...)` 根本没传尺寸，默认值必须按角色给，
//   不能沿用敌人那套 44×44 的方形假设。
import { snap } from '../core/draw.js';
import { W, FH, PX, seg, pulse, ease, flash, glow, ring } from './fxKit.js';

// ---------- 这个文件自己的三支笔 ----------

// 一条带锥度的带子：沿采样出来的路径填一个多边形，半宽由 halfAt(k) 给（k=0 起点、1 终点）。
//
// **为什么不用 stroke**：lineWidth 是恒定的，画不出「一头宽、一头收成尖」，
// 而收尖正是「这不是一根线，是一条被拉长的光」的全部说服力所在。
// 填充多边形由 canvas 在**物理像素**上抗锯齿，锥度是连续的——
// 跟 tongue() 按 PX 分行是同一个目的（见 fxKit.js 里 PX 那段）。
function ribbon(ctx, pts, halfAt, color) {
  const n = pts.length; if (n < 2) return;
  const nx = [], ny = [], hw = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    nx.push(-dy / d); ny.push(dx / d);
    hw.push(Math.max(PX * 0.5, halfAt(i / (n - 1))));
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + nx[0] * hw[0], pts[0][1] + ny[0] * hw[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0] + nx[i] * hw[i], pts[i][1] + ny[i] * hw[i]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i][0] - nx[i] * hw[i], pts[i][1] - ny[i] * hw[i]);
  ctx.closePath(); ctx.fill();
}

// 一片叶子形：从 (x,y) 朝角度 a 张出去，两端收尖、中段最宽。
// 治疗拿它当花瓣（往外张），暗拿它当裂片（往外甩）——一支笔两个方向，就是这两个法术的关系。
// sq 是纵向压扁比，跟场上其它东西的伪透视对齐（fxKit 的 ring() 用 0.62）。
// k0 把「最宽处」往里推：0 是两端收尖的花瓣，0.34 是根部就已经张开、只朝外收尖的裂片。
// 分这一刀是看了截图改的——两边都用花瓣形时，暗的碎片读作一圈紫花瓣，跟治疗撞了。
function leaf(ctx, x, y, a, r0, len, wide, color, sq = 0.82, k0 = 0) {
  if (len < PX * 2) return;
  const ca = Math.cos(a), sa = Math.sin(a);
  const pts = Array.from({ length: 7 }, (_, i) => {
    const k = i / 6, r = r0 + len * k, bow = Math.sin(k * 2.4) * len * 0.14;
    return [x + ca * r - sa * bow, y + sa * r * sq + ca * bow * sq];
  });
  ribbon(ctx, pts,
    k => wide * 0.5 * Math.max(0, Math.sin(Math.min(1, k0 + k * (1.04 - k0)) * Math.PI)) ** 0.62, color);
}

// 一道竖着的裂口：按**物理像素**分行，每行半宽由一条两端收尖的曲线给出。
//
// 用 arc/ellipse 画会得到一个规整的橄榄形，读作「一颗蛋贴在怪身上」；
// 分行画才收得出尖，而且行高是 1 物理像素，锥度不会一级一级跳
// （CLAUDE.md「按物理像素画」那节，火舌栽过一次）。
// skew 让上下不对称：完全对称的话它会读成一只眼睛。
function rift(ctx, x, y, hw, hh, color, skew) {
  if (hw < PX || hh < PX) return;
  const rows = Math.max(2, Math.round(hh * 2 / PX));
  ctx.fillStyle = color;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows * 2 - 1;                       // -1 顶 → +1 底
    const half = hw * (1 - Math.abs(t) ** 1.7) ** 0.6;
    if (half < PX * 0.5) continue;
    ctx.fillRect(snap(x + skew * t * Math.abs(t) - half), snap(y + t * hh), Math.max(PX, half * 2), PX);
  }
}

// 一圈躺在地上的光环。fxKit 的 ring() 压扁比固定 0.62、线宽最细 0.5 逻辑像素（＝3 物理像素）；
// 治疗要的是**贴着地**的扁环和一两个物理像素的细线，所以这里自己描一个。
function halo(ctx, x, y, r, sq, color, a, thick) {
  if (a <= 0.004 || r <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(PX, thick);
  ctx.beginPath(); ctx.ellipse(x, y, r, Math.max(PX, r * sq), 0, 0, 6.29); ctx.stroke();
  ctx.restore();
}

// 向心卷进去的一条弧：从半径 r0 卷到 r1，一路带旋。
// 直线读作「放射状的刺」，有旋才读作「被吸进去」。
const curlIn = (x, y, a0, r0, r1, curl, n = 9) => Array.from({ length: n }, (_, i) => {
  const k = i / (n - 1), r = r0 + (r1 - r0) * k, t = a0 + curl * k;
  return [x + Math.cos(t) * r, y + Math.sin(t) * r * 0.72];
});

export const VOID_FX = {
  // 暗：蚀(0–.30 全屏) → 裂(.28–.56 局部) → 吞(.53–.70 全屏) → 反(.66–1 局部)
  //
  // **为什么给它四段、又给它整屏**：剧情里地心那位就是这一属性
  // （docs/主线设计.md 第 5 节、data/lore.json 的「乌火」条：
  // 「地缝上头烧了三百年，底下就黑了三百年」）。暗不是杂鱼属性，
  // 演出得压得住场——所以它先把**整个战场**的光抽干（蚀），
  // 才有资格在目标身上撕开一道口子（裂），合上时把吞下去的光吐一次（吞），
  // 最后连自己炸出去的碎片都拉回来吃掉（反）。
  // 尺度按 全屏→局部→全屏→局部 交替，节奏不是一路推到底（fxKit 文件头第 9 条）。
  dark: (x, y, rng, o = {}) => {
    // 按目标大小缩放，基准 44×44、夹在 0.9–2.3——照火焰那套（spellFx.js 的注释里有理由）
    const S = v => Math.max(0.9, Math.min(2.3, v / 44));
    const kx = S(o.w || 44), ky = S(o.h || 44);
    // 角度/半径/相位一次掷死。逐帧掷骰会变成噪点抖动（fxKit 文件头第 7 条）
    const strands = Array.from({ length: 11 }, (_, i) => ({
      a: i / 11 * 6.283 + rng.next() * 0.42,
      r: 92 + rng.int(0, 62),
      curl: (i % 2 ? 1 : -1) * (0.42 + rng.next() * 0.5),
      d: rng.next() * 0.34, w: 1.5 + rng.next() * 2.4 }));
    const shards = Array.from({ length: 7 }, (_, i) => ({
      a: i / 7 * 6.283 + rng.next() * 0.38, v: 34 + rng.int(0, 56),
      len: 16 + rng.int(0, 20), w: 2.4 + rng.next() * 2.6, d: rng.next() * 0.34 }));
    return { t: 0, dur: 1.25, render(ctx, p) {
      // 吞：口子一口合上，把吞进去的光吐一次。**全场唯一一次闪**（fxKit 文件头第 6 条）：
      // 紫色、峰值 0.18、pulse 跨 0.22 个 p ＝ 0.275 秒，起落各 0.14 秒，远超 0.08 的下限。
      // 峰值从 0.40 压到 0.18 是看了截图改的：0.40 时整屏被 lighter 洗成淡紫，
      // 一个「暗」属性的高潮帧比它前后都亮，读起来是光魔法。
      // **画在最前面**也是同一个原因：闪光要先铺，再让下面那层暗角把四角压回去，
      // 亮的就只剩目标周围那一小滩——画在最后的话连黑掉的四角都被一起提亮。
      flash(ctx, pulse(p, 0.53, 0.75) * 0.18, '#a184e8');
      // 蚀：黑从画面四周合拢过来。
      // 不用 wash 铺一层平黑——那读作「有人把亮度调低了」；
      // 用一个**内径不断缩小**的径向渐变，才是「暗正在往这里收」。
      // 起落各半秒以上，慢到不可能读成闪。
      const eat = Math.min(seg(p, 0.02, 0.42), 1 - seg(p, 0.74, 1));
      if (eat > 0.01) {
        const rin = 124 - 98 * ease(seg(p, 0.02, 0.52));
        ctx.save(); ctx.globalAlpha = eat * 0.82;
        const gr = ctx.createRadialGradient(x, y, Math.max(1, rin), x, y, rin + 78);
        gr.addColorStop(0, 'rgba(8,3,18,0)');
        gr.addColorStop(0.5, 'rgba(8,3,18,0.72)');
        gr.addColorStop(1, 'rgba(5,2,12,0.94)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, FH); ctx.restore();
      }
      // 抽：十一条**亮**的丝从画面外卷进来。
      // 关键是丝是亮的：暗不是「吐出黑东西」，是**把光拿走**——
      // 看得见被拿走的是什么，这件事才成立。
      const g = seg(p, 0, 0.48);
      if (g > 0 && g < 1) for (const q of strands) {
        const k = Math.max(0, (g - q.d) / (1 - q.d)); if (k <= 0) continue;
        const e = ease(k), r0 = q.r * (1 - e * 0.94);
        ctx.globalAlpha = Math.min(1, k * 3) * (1 - k) ** 0.7 * 0.9;
        ribbon(ctx, curlIn(x, y, q.a + e * q.curl, r0, Math.max(2, r0 * 0.26), q.curl * 0.8),
          t => q.w * (1 - t) ** 1.3 * 0.5 * (0.4 + e),
          k < 0.5 ? '#b9a2f0' : '#efe6ff');
      }
      // 塌：三圈轮廓**向内**收。火往外扩、冰炸开——这里刻意反着来，
      // 不看颜色也该认得出是哪一种（这也是暗与治疗的分界：一个收、一个放）。
      const cl = seg(p, 0.26, 0.68);
      if (cl > 0 && cl < 1) for (let i = 0; i < 3; i++) {
        const k = (cl - i * 0.15) / 0.6; if (k <= 0 || k >= 1) continue;
        ring(ctx, x, y, 3 + (50 + i * 15) * kx * (1 - ease(k)), '#a98cff', (1 - k) * 0.45, 0.5 + k * 2.4);
      }
      // 裂：目标身上撕开一道竖着的口子。四层套画——外面一圈紫雾、紫边、深靛、近黑的芯，
      // 由外向内越来越实。**不能画成实心**（fxKit 文件头第 4 条）：
      // 目标那边已经被 veilAlpha() 压到 0.45，这边再糊死就看不见在打谁了。
      const ro = seg(p, 0.28, 0.55), rc = seg(p, 0.56, 0.70);
      if (ro > 0 && rc < 1) {
        const grow = ease(ro), vis = 1 - rc * 0.15;
        const hh = (4 + 25 * grow) * ky * (1 + rc * 0.5);          // 合上时反而更长，像一条拉链
        const hw = (1.2 + 9 * grow) * kx * (1 - rc) ** 0.75;
        ctx.save();
        ctx.globalAlpha = vis * 0.34;
        const gr = ctx.createRadialGradient(x, y, 1, x, y, hh * 1.5);
        gr.addColorStop(0, 'rgba(64,28,140,0.8)'); gr.addColorStop(1, 'rgba(26,6,56,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.ellipse(x, y, hh * 1.5, hh * 1.5, 0, 0, 6.29); ctx.fill();
        ctx.restore();
        // 三层的分工：紫边只是**边**，往里立刻沉成近黑。
        // 第一版把紫层画得又宽又亮，整道口子读成一颗发光的紫杏仁——那是光不是暗。
        const sk = 1.3 * kx;
        ctx.globalAlpha = vis * 0.42; rift(ctx, x, y, hw * 1.30, hh * 1.07, '#7b4fe0', sk);
        ctx.globalAlpha = vis * 0.80; rift(ctx, x, y, hw * 1.00, hh * 1.00, '#1d0b3a', sk);
        ctx.globalAlpha = vis * 0.92; rift(ctx, x, y, hw * 0.78, hh * 0.93, '#050310', sk);
      }
      // 合上那一瞬间的芯：口子被压成一条又细又亮的竖线，随后自己被拉长、变淡
      //（闪光在函数开头，见那里的注释）。这条线要撑到裂片飞出去为止——
      // 第一版它在 p=0.70 就没了，而裂片 0.66 才起步，中间空出小半秒没人接戏。
      const bite = pulse(p, 0.52, 0.80);
      if (bite > 0.01) {
        // 颜色压成紫白而不是纯白：一个「暗」属性的最亮帧要是一道白光柱，读起来是光魔法
        ctx.globalAlpha = bite ** 0.7 * 0.8; ctx.fillStyle = '#cfb6f7';
        ctx.beginPath();
        ctx.ellipse(x, y, (0.5 + bite * 2.4) * kx, (10 + bite * 30) * ky, 0, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = bite ** 0.7 * 0.35; ctx.fillStyle = '#8b6ae0';
        ctx.beginPath();
        ctx.ellipse(x, y, (1.6 + bite * 6) * kx, (6 + bite * 20) * ky, 0, 0, 6.29);
        ctx.fill();
      }
      // 反：七片裂片甩出去，**又被拉回来**。
      // 正弦的距离曲线：k≈0.6 时甩到最远，之后往回收——
      // 连自己炸出去的碎片都吃掉，这一下才把「吞」讲完整。
      const b = seg(p, 0.62, 1);
      if (b > 0) {
        for (const q of shards) {
          const k = Math.max(0, (b - q.d) / (1 - q.d)); if (k <= 0) continue;
          const d = q.v * kx * Math.sin(Math.min(1, k) * 2.5) * 0.85;
          const len = q.len * kx * (1 - k * 0.5), w = q.w * kx;
          ctx.globalAlpha = (1 - k) ** 0.8 * 0.85;
          leaf(ctx, x, y, q.a, d, len, w * 1.5, '#9d7ae8', 0.72, 0.34);
          ctx.globalAlpha = (1 - k) ** 0.8;
          leaf(ctx, x, y, q.a, d + len * 0.1, len * 0.8, w * 0.75, '#0b0318', 0.72, 0.34);
        }
        ring(ctx, x, y, (5 + ease(b) * 74) * kx, '#c9a8e8', (1 - b) ** 1.4 * 0.75, 3.2 * (1 - b) + 0.5);
        ring(ctx, x, y, (2 + ease(b) * 46) * kx, '#6a2f9a', (1 - b) * 0.6, 2.2 * (1 - b) + 0.4);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 治疗：承(0–.30) → 升(.12–.72) → 绽(.40–.80) → 离(.68–1)，全长 0.78 秒。
  //
  // **为什么比别的短、而且一次全屏闪都不给**：这是全场用得最频繁的魔法，
  // 一局要看几十次——治愈 / 治愈之风 / 复活 / 解状态 / 药品全都走这一支
  // （actions.js 里五处 fx.add('heal', ...)）。一场战斗被闪二十下是真的难受
  // （fxKit 文件头第 6 条），所以这里**一次 flash 都不调**，全靠 glow 局部加光；
  // 连整屏染绿的 wash 也去掉了——那会把别人的血条一起染绿，看几十次就是脏。
  // 时长也压到 0.78：actions.js 那边治疗的 yield 是 0.6，拖过头会把回合节奏一起拖慢。
  //
  // 尺度变化因此不靠全屏，靠**形状自己长大**：
  // 脚下一圈（半个身宽）→ 光带拔到过头顶（两个身高）→ 花横向张开（两个身宽）→ 整朵浮起来散掉。
  heal: (x, y, rng, o = {}) => {
    // 目标是我方角色：16×24 逻辑像素，比敌人窄得多，所以基准不是火焰那个 44×44 的方块，
    // 而是分开的 26（宽）/ 34（高）。默认值按角色给——actions.js 没传尺寸。
    const kx = Math.max(0.85, Math.min(2, (o.w || 16) / 26));
    const ky = Math.max(0.85, Math.min(2, (o.h || 24) / 34));
    const H = o.h || 24, foot = y + H / 2 + 1;
    // 五条光带：起脚方位、高度、出发时间全部错开。
    // 一起从同一个高度起、一样高地收，底边和顶边就各连成一条横线——
    // 火焰栽的就是这个（fxKit 文件头第 5 条），这里从构造上就不给它机会。
    const bands = Array.from({ length: 5 }, (_, i) => ({
      a: i * 1.31 + rng.next() * 0.5,
      h: 33 + rng.int(0, 15),
      d: rng.next() * 0.26,
      w: 2.4 + rng.next() * 1.9,
      rad: 4.5 + rng.next() * 4 }));
    // 七片花瓣：角度、长度、出场时间同样错开。一起从同一个半径张开就是一只规整的车轮。
    const pet = Array.from({ length: 7 }, (_, i) => ({
      a: i / 7 * 6.283 + rng.next() * 0.3,
      len: 12 + rng.int(0, 7), w: 4 + rng.next() * 2.6, d: rng.next() * 0.22 }));
    // 一条光带在身上的位置：s=0 在脚边的椭圆上，s=1 在头顶之上。越往上摆得越开。
    const spiral = (s, q) => {
      const t = q.a + s * 2.7, r = q.rad * kx * (0.5 + s * 0.85);
      return [x + Math.sin(t) * r, foot - q.h * ky * s + Math.cos(t) * q.rad * kx * 0.34 * (1 - s)];
    };
    return { t: 0, dur: 0.78, render(ctx, p) {
      // 局部加光，不铺全屏。glow 是 lighter 的径向渐变，亮的只有角色周围那一圈
      glow(ctx, x, y - 1, 46 * kx, 'rgb(120,255,190)', pulse(p, 0.04, 0.96) * 0.34);
      // 承：脚下浮起两圈光环，先张开再收紧——「地气聚起来了」。贴地画（压扁 0.3）
      const f = seg(p, 0, 0.30), fo = 1 - seg(p, 0.70, 1);
      if (f > 0 && fo > 0) {
        const rr = (6.5 + 8.5 * ease(f)) * kx * (0.7 + 0.3 * fo);
        halo(ctx, x, foot, rr, 0.30, '#7fe0aa', Math.min(1, f * 2.4) * fo * 0.8, PX * 2);
        halo(ctx, x, foot - 1, rr * 0.6, 0.32, '#eaffef', Math.min(1, f * 3) * fo * 0.55, PX);
      }
      // 升：五条光带贴着身体螺旋上去。
      // **这不是一撮往上飘的点**——旧版就是那撮点，在 16×24 的角色身上小到没有存在感，
      // 也是这次重做的起因。改成有头有尾的带子：每条只占一小段高度，一路往上爬，
      // 头亮尾暗，像光顺着人往上走。
      const u = seg(p, 0.10, 0.74);
      if (u > 0) for (const q of bands) {
        const k = (u - q.d) / (1 - q.d); if (k <= 0) continue;
        const s1 = Math.min(1.08, k * 1.08), s0 = s1 - 0.36;
        const pts = Array.from({ length: 8 }, (_, i) => spiral(Math.max(0, s0 + (s1 - s0) * i / 7), q));
        const fade = Math.min(1, k * 3.2) * (1 - Math.max(0, (k - 0.6) / 0.4));
        const wide = t => q.w * kx * 0.5 * Math.max(0, Math.sin(Math.min(1, t * 1.02) * Math.PI)) ** 0.6;
        ctx.globalAlpha = fade * 0.62; ribbon(ctx, pts, wide, '#3fb37e');
        ctx.globalAlpha = fade * 0.8; ribbon(ctx, pts.slice(3), t => wide(0.45 + t * 0.55) * 0.72, '#9ff0c0');
        ctx.globalAlpha = fade * 0.92; ribbon(ctx, pts.slice(5), t => wide(0.72 + t * 0.28) * 0.42, '#f2fff6');
      }
      // 绽：胸口开出一朵光。七片花瓣两层套画（外层薄一点的青、内层短而实的白），
      // 层次跟火焰的 LAYERS 是同一个道理——由外向内越来越实，视线被引到芯上。
      // 最后整朵**往上浮**着散掉：治疗的动作是「托起来」，收尾也该往上走。
      const bl = seg(p, 0.40, 0.80);
      if (bl > 0) {
        const cy = y - H * 0.05 - seg(p, 0.68, 1) * 10 * ky;
        for (const q of pet) {
          const k = (bl - q.d) / (1 - q.d); if (k <= 0) continue;
          const grow = ease(Math.min(1, k * 1.6)), fade = 1 - Math.max(0, (k - 0.5) / 0.5);
          const r0 = (1.5 + 3 * grow) * kx, len = q.len * kx * grow;
          ctx.globalAlpha = fade * 0.72;
          leaf(ctx, x, cy, q.a, r0, len, q.w * kx * (0.55 + 0.45 * fade), '#79e0a8');
          ctx.globalAlpha = fade * 0.9;
          leaf(ctx, x, cy, q.a, r0 + len * 0.1, len * 0.58, q.w * kx * 0.42, '#f2fff6');
        }
        // 芯：一点白光。跟着花一起浮上去，最后收成一颗小星
        const c = pulse(p, 0.40, 0.88);
        if (c > 0.01) {
          ctx.globalAlpha = c * 0.95; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, cy, (0.8 + c * 2.6) * kx, (0.8 + c * 2.6) * kx, 0, 0, 6.29); ctx.fill();
          halo(ctx, x, cy, (3 + c * 13) * kx, 0.78, '#d8ffe6', c * 0.5, PX * 1.5);
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};
