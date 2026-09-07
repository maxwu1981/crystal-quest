// 战斗背景的**共用画笔**：分层与镜头、渐变、色带、稜线、光晕、暗角。
//
// 从 backdropDraw.js 拆出来——那个档加上正式美术的 plate() 之后到了 420 行，
// 破了单文件 400 行的上限。缝切在「画笔」与「写景」之间：
// 这里的东西跟画的是哪一套景无关（改一次四套一起变），那边是四套景各自的构图。
// 依赖单向：backdropDraw.js → 这里。
//
// **关于 ART**：这里所有坐标都是**逻辑**像素（256×224）——ctx 进来时 Game.render 已经
// setTransform(ART,0,0,ART,0,0) 缩放过了，所以这些常量**不需要** terrainBits.js 那套
// u() / us() 换算。唯一该跟着 ART 走的是细纹的宽度，那就是 PX。

import { snap, ART } from '../core/draw.js';
import { PANEL_Y } from './hudBits.js';

// ---- 远近分层 ----
// 战斗画面本身不滚动，唯一能推动镜头的是震屏：renderBattle 在画背景之前已经
// ctx.translate(fx.offset()) 过一次，整幅画跟着镜头一起跳 ±2px。
// 真实的远近该是「远处几乎不动、近处比镜头动得还多一点」，所以每层在那之上**再补一次**
// 反向位移：系数 1 = 跟着镜头，<1 = 远，>1 = 近，0 = 完全钉在屏幕上（暗角用）。
// 只有震屏进得来：角色出手的 lungeOffset 只挪那一个精灵、没进镜头变换，背景这边够不着。
export const K = { sky: 0.12, far: 0.38, mid: 0.72, near: 1.16 };
// 光源的 x：「受光 / 背光两档」全靠同一条判据 —— 朝着这个 x 的那一面提亮，背面压暗。
// 表里没有 cave，是因为洞窟那盏是从顶上裂缝斜射进来的**平行光**：
// 平行光没有「位置」，两档退化成「一律左脸受光」，判据直接写死在 drawCave 里。
export const LIGHT = { plains: 158, deep: 128, shrine: 150 };
export const SHAFT = 128;    // 洞窟顶上那道裂缝的 x（光束从这里往右下斜着落）
export const M = 6;          // 铺满整幅的填充往外多画这么多：震屏 ±2px、近层还要再多 0.3px，不留边会露黑条
export const PX = 1 / ART;  // 一个物理像素 —— 和 spellFx.js 的 PX 同一个东西（**不是** terrainBits.js 那个 PX）

// 震屏偏移：Game.render 每帧 setTransform(ART,0,0,ART,0,0) 起手，基准变换是纯缩放、
// 不含平移，所以当前矩阵的平移量 ÷ 缩放量，就正好是 renderBattle 刚 translate 进去的那两个数。
// 拿它当镜头，就不必改 render.js 的签名（那边另有人在改，动不得）。
export const camOf = ctx => { const m = ctx.getTransform?.(); return m && m.a ? [m.e / m.a, m.f / m.d] : [0, 0]; };
// snap 而不是 round：ART=6 时对齐到物理像素，位移的最小步长是 1/6 逻辑像素 ——
// 边缘仍然是硬的，但远层不会因为四舍五入又和近层一起整格跳（那就白分层了）。
export function layer(ctx, cam, k, fn) {
  ctx.save(); ctx.translate(snap((k - 1) * cam[0]), snap((k - 1) * cam[1]));
  fn(); ctx.restore();
}

// ---- 画笔 ----
export const grad = (ctx, y0, y1, ...cs) => {           // 竖直渐变，色标均分
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c));
  return g;
};
export function halo(ctx, x, y, r, stops) {             // 一团光晕；最外一档必须收到全透明，否则会切出一个方框
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export const band = (ctx, W, y, h, style) => { ctx.fillStyle = style; ctx.fillRect(-M, y, W + M * 2, h); };
export const fillAll = (ctx, W, y, h, style) => band(ctx, W, y - M, h + M * 2, style);

// 用竖条填山棱线：路径填充会抗锯齿，把像素味糊掉，一列一列画才是硬边。
// edge 给「受光 / 背光两档」：坡面朝着光源就描一道亮边，背着光描一道暗边。
// 判据只要两个符号 —— 高度沿 x 的增减、光源在哪一侧，两者相反就是迎光面。
// 「一座山有正面也有背面」是这三张外景里最省事、也最见效的一笔。
export function ridge(ctx, W, base, pts, color, edge = null, step = 2) {
  let prev = null, cur = null;
  const use = c => { if (c !== cur) ctx.fillStyle = cur = c; };  // 同色不重设：一道稜线要填一百多次
  for (let x = -M; x < W + M; x += step) {
    let h = pts[pts.length - 1][1];
    if (x <= pts[0][0]) h = pts[0][1];
    else for (let i = 1; i < pts.length; i++) {
      const [x1, h1] = pts[i], [x0, h0] = pts[i - 1];
      if (x <= x1) { h = Math.round(h0 + (h1 - h0) * (x - x0) / (x1 - x0)); break; }
    }
    use(color); ctx.fillRect(x, base - h, step, h + M);
    if (edge && prev !== null) { const lit = (h - prev) * (edge.lx - x) < 0; use(lit ? edge.lit : edge.dark); ctx.fillRect(x, base - h, step, lit ? 2 : 1); }
    prev = h;
  }
}
export const RIDGE_FAR = [[0, 20], [26, 30], [58, 16], [88, 34], [118, 22], [150, 38], [186, 20], [214, 30], [256, 18]];
export const RIDGE_NEAR = [[0, 10], [34, 16], [70, 8], [104, 18], [140, 10], [176, 20], [210, 9], [256, 14]];
export const RIDGE_TAIWU = [[0, 14], [40, 26], [76, 18], [110, 40], [146, 24], [184, 34], [222, 16], [256, 22]];


// 压下来之后，中间那条视觉走廊（敌人—火塘—我方）自己就浮出来了。
export function vignette(ctx, W) {
  const g = ctx.createRadialGradient(128, 84, 44, 128, 84, 178);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.62, 'rgba(0,0,0,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g; ctx.fillRect(-M, -M, W + M * 2, PANEL_Y + M * 2);
}
