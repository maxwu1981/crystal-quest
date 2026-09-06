// 场地气氛。从 FieldScene.js 拆出来——那个文件 424 行，破了项目单文件 400 行的上限，
// 而缝就切在它自己那道「场地气氛（纯渲染层）」的横幅上（横幅原样留在下面）。
// 那句「逻辑一个字都没动」正是这条缝干净的理由：走路、碰撞、事件、遇敌计步全留在那边，
// 这边只往画好的画面上加东西，两边只剩 buildFx 里「这张图配哪套气氛」那一句相接。
// 跟 minimap.js 一样，renderAmbience 收 `scene`（FieldScene 实例）而不是散参数。
import { TILE } from '../assets/tiles.js';
import { snap } from '../core/draw.js';

// ======================= 场地气氛（纯渲染层）=======================
// 逻辑一个字都没动：移动、碰撞、事件、遇敌计步全部照旧，下面只是往画面上加东西。
// 三样：区域色调、主角周围的光照、氛围粒子。前两样完全静态或超慢，粒子极稀。
//
// tint 用 multiply（正片叠底）而不是蒙一层半透明色：蒙色会把暗部提亮成灰，
// multiply 是给画面「调色」，暗的地方仍然是暗的，洞窟才不会变成雾。
// 色调本身不随时间变化 —— 再怎么调都不可能闪。
//
// vig：主角周围亮、远处暗的径向暗角。r 是完全变暗的半径（逻辑像素），a 是最深处的透明度。
// motes：氛围粒子。c 是 rgb，a 是透明度区间，vx/vy 是每秒逻辑像素，amp 是横向摆幅。
const DUST = { n: 12, c: '208,230,238', a: [0.10, 0.22], vx: [-2, 2], vy: [4, 9], amp: [2, 6] };
const POLLEN = { n: 8, c: '255,246,214', a: [0.09, 0.18], vx: [2, 6], vy: [-3, -1], amp: [3, 7] };
export const MOOD = {
  village: { tint: '#ffd9a2', tintA: 0.16, motes: POLLEN },                        // 内埔庄：午后的暖调
  overworld: { tint: '#ffe6bb', tintA: 0.11, motes: { ...POLLEN, n: 9 } },         // 六堆平原：开阔天光，最淡
  cave_1: { tint: '#7d9ec2', tintA: 0.28, vig: { r: 138, a: 0.32, c: '6,12,16' }, motes: DUST },
  cave_2: { tint: '#6f92c0', tintA: 0.34, vig: { r: 116, a: 0.46, c: '4,10,14' }, motes: DUST },   // 只靠磷光石照明，最暗
  cave_3: { tint: '#8d7fc6', tintA: 0.30, vig: { r: 150, a: 0.28, c: '10,6,18' }, motes: { ...DUST, n: 9 } }, // 祭场：夜色
  bogong: { tint: '#ffcf95', tintA: 0.24, vig: { r: 150, a: 0.20, c: '20,10,4' }, // 伯公庙：昏暗 + 香烟袅袅
    motes: { n: 5, c: '255,224,180', a: [0.10, 0.20], vx: [-1, 1], vy: [-9, -5], amp: [2, 5] } },
  house_elder: { tint: '#ffdca8', tintA: 0.20 },
  house_hakka: { tint: '#ffdca8', tintA: 0.20 },
  inn: { tint: '#ffdca8', tintA: 0.22 },
  shop: { tint: '#ffdca8', tintA: 0.18 },
};

const mod = (v, n) => ((v % n) + n) % n;
// 地图 id → 固定种子：同一张地图每次进来粒子分布都一样，不会「重进一次换个样」
export function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}
// 随机数只在这里掷 —— 每帧重掷会变成噪点闪烁。
// 用私有 RNG 而不是 game.rngFx：rngFx 还管着 NPC 闲逛，动它会改掉自动试玩的可复现路线。
export function makeMotes(spec, rng, bw, bh) {
  const out = [];
  const span = (r) => r[0] + rng.next() * (r[1] - r[0]);
  for (let i = 0; i < spec.n; i++) out.push({
    x: rng.next() * bw, y: rng.next() * bh,
    vx: span(spec.vx), vy: span(spec.vy), amp: span(spec.amp),
    f: 0.25 + rng.next() * 0.35,          // 横向摆动 10~25 秒一个来回
    ph: rng.next() * 6.283,
    par: 0.55 + rng.next() * 0.45,        // 视差：跟镜头走得慢一点的显得远
    c: `rgba(${spec.c},${span(spec.a).toFixed(3)})`,
  });
  return out;
}

// 气氛层：粒子 → 光照 → 色调。画在人物之后、UI 之前，
// 所以尘埃会被暗角压暗（远处的尘看着更远），而地图名和中毒闪不会被调色影响。
// 每帧新增的绘制调用：粒子 ≤12 个 fillRect + 暗角 1 次渐变填充 + 色调 1 次 fillRect。
export function renderAmbience(scene, ctx, camX, camY, px, py, mw, mh) {
  const { W, H } = scene.game, fx = scene.fx, t = scene.animT;
  if (fx.motes) {
    // 位置是 animT 的纯函数：不存每帧状态，暂停/转场回来不会跳，也不可能变成噪点
    const ox = mw <= W ? -camX : 0, oy = mh <= H ? -camY : 0;
    for (const m of fx.motes) {
      const sx = ox + mod(m.x + m.vx * t + Math.sin(t * m.f + m.ph) * m.amp - camX * m.par, fx.bw);
      const sy = oy + mod(m.y + m.vy * t - camY * m.par, fx.bh);
      ctx.fillStyle = m.c; ctx.fillRect(snap(sx), snap(sy), 1, 1);
    }
  }
  const v = fx.mood?.vig;
  if (v) {
    // 洞窟深处靠磷光石照明：主角周围亮，远处压暗。
    // 半径有 ±3% 的呼吸，8 秒一次——慢到不盯着看根本不会发现，但画面不会「死」。
    const cx = Math.round(px - camX) + TILE / 2, cy = Math.round(py - camY) + TILE / 2;
    const r = v.r * (1 + 0.03 * Math.sin(t * (2 * Math.PI / 8)));
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    g.addColorStop(0, `rgba(${v.c},0)`);
    g.addColorStop(1, `rgba(${v.c},${v.a})`);   // 渐变外的区域自动沿用最后一档，屏幕角落也盖得到
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const mood = fx.mood;
  if (mood?.tint) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = mood.tintA;
    ctx.fillStyle = mood.tint; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';   // 必须还原，后面还有转场要画
  }
}
