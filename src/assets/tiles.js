// 程序生成的占位瓦片。逻辑尺寸 16×16，实际画布是 16*ART（美术精度倍率，见 core/Game.js）。
// 换正式素材时：assets/art/tile_*.png 会覆盖这里，只要 PNG 是 16*ART 见方即可。
import { artCanvas } from '../core/draw.js';
export const TILE = 16;

function fill(ctx, c) { ctx.fillStyle = c; ctx.fillRect(0, 0, TILE, TILE); }
function scatter(ctx, rng, n, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rng.int(0, 15), rng.int(0, 15), 1, 1);
}
function hlines(ctx, ys, color) { ctx.fillStyle = color; for (const y of ys) ctx.fillRect(0, y, TILE, 1); }

const DRAW = {
  grass(ctx, rng) { fill(ctx, '#5cb85c'); scatter(ctx, rng, 10, '#4e9f4e'); scatter(ctx, rng, 5, '#72c872'); },
  path(ctx, rng) { fill(ctx, '#d2b47a'); scatter(ctx, rng, 8, '#c19d5f'); scatter(ctx, rng, 3, '#e0c58f'); },
  tree(ctx, rng) {
    DRAW.grass(ctx, rng);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(6, 10, 4, 6);
    ctx.fillStyle = '#1b5e20'; ctx.fillRect(2, 3, 12, 9); ctx.fillRect(4, 1, 8, 2); ctx.fillRect(1, 5, 14, 5);
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(4, 3, 6, 4); ctx.fillRect(3, 7, 4, 2);
  },
  water(ctx) {
    fill(ctx, '#2f7fd6');
    ctx.fillStyle = '#6ab0f0'; ctx.fillRect(2, 4, 5, 1); ctx.fillRect(9, 10, 5, 1); ctx.fillRect(1, 12, 3, 1); ctx.fillRect(11, 2, 3, 1);
  },
  wall(ctx) {
    fill(ctx, '#bdbdbd'); hlines(ctx, [3, 7, 11, 15], '#8d8d8d');
    ctx.fillStyle = '#8d8d8d';
    ctx.fillRect(4, 0, 1, 3); ctx.fillRect(12, 0, 1, 3); ctx.fillRect(8, 4, 1, 3);
    ctx.fillRect(4, 8, 1, 3); ctx.fillRect(12, 8, 1, 3); ctx.fillRect(8, 12, 1, 3);
  },
  roof(ctx) { fill(ctx, '#c62828'); hlines(ctx, [3, 7, 11, 15], '#8e1b1b'); hlines(ctx, [0, 4, 8, 12], '#e05353'); },
  door(ctx) { DRAW.wall(ctx); ctx.fillStyle = '#4e342e'; ctx.fillRect(4, 3, 8, 13); ctx.fillStyle = '#ffca28'; ctx.fillRect(10, 10, 1, 1); },
  floor(ctx) { fill(ctx, '#a1887f'); hlines(ctx, [3, 7, 11, 15], '#795548'); },
  counter(ctx) { DRAW.floor(ctx); ctx.fillStyle = '#8d6e63'; ctx.fillRect(0, 0, 16, 10); ctx.fillStyle = '#d7a86e'; ctx.fillRect(0, 0, 16, 5); ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 10, 16, 1); },
  cave_floor(ctx, rng) { fill(ctx, '#4a4242'); scatter(ctx, rng, 8, '#3d3636'); scatter(ctx, rng, 4, '#574d4d'); },
  cave_wall(ctx, rng) { fill(ctx, '#221d1d'); ctx.fillStyle = '#332c2c'; ctx.fillRect(0, 0, 7, 7); ctx.fillRect(8, 8, 8, 8); ctx.fillRect(9, 1, 6, 5); ctx.fillRect(1, 9, 6, 5); scatter(ctx, rng, 5, '#443b3b'); },
  stairs_down(ctx, rng) { DRAW.cave_floor(ctx, rng); ['#3a3333', '#2c2626', '#1e1a1a', '#110e0e'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(2, 2 + i * 3, 12, 3); }); },
  stairs_up(ctx, rng) { DRAW.cave_floor(ctx, rng); ['#9a8f8f', '#7d7373', '#655c5c', '#4f4747'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(2, 2 + i * 3, 12, 3); }); },
  chest(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#5d4037'; ctx.fillRect(2, 4, 12, 10); ctx.fillStyle = '#8d6e63'; ctx.fillRect(3, 5, 10, 3); ctx.fillStyle = '#ffca28'; ctx.fillRect(7, 8, 2, 3); },
  chest_open(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#5d4037'; ctx.fillRect(2, 7, 12, 7); ctx.fillRect(2, 2, 12, 3); ctx.fillStyle = '#1a1414'; ctx.fillRect(3, 8, 10, 3); },
  crystal(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#6d6060'; ctx.fillRect(3, 11, 10, 4); ctx.fillStyle = '#8a7c7c'; ctx.fillRect(4, 10, 8, 1); ctx.fillStyle = '#4dd0e1'; ctx.beginPath(); ctx.moveTo(8, 1); ctx.lineTo(12, 6); ctx.lineTo(8, 11); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e0f7fa'; ctx.fillRect(7, 3, 1, 4); },
  cave_entrance(ctx, rng) { DRAW.grass(ctx, rng); ctx.fillStyle = '#5d5252'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#6e6262'; ctx.fillRect(1, 1, 4, 4); ctx.fillRect(11, 2, 4, 3); ctx.fillStyle = '#0d0a0a'; ctx.fillRect(4, 5, 8, 11); ctx.fillRect(5, 3, 6, 2); },
  // 屏东的山不积雪：块状岩壁 + 缝里的灌木，不画白雪顶
  mountain(ctx, rng) { fill(ctx, '#6e6157');
    ctx.fillStyle = '#8d8177'; ctx.fillRect(1, 2, 6, 5); ctx.fillRect(9, 1, 5, 6); ctx.fillRect(3, 9, 7, 5); ctx.fillRect(11, 10, 4, 4);
    ctx.fillStyle = '#413a33'; ctx.fillRect(1, 7, 6, 1); ctx.fillRect(9, 7, 5, 1); ctx.fillRect(3, 14, 7, 1); ctx.fillRect(11, 14, 4, 1);
    ctx.fillStyle = '#2f5233'; ctx.fillRect(7, 4, 2, 2); ctx.fillRect(0, 12, 2, 2);
    scatter(ctx, rng, 5, '#574d45'); },
  forest(ctx, rng) { fill(ctx, '#2e7d32'); ctx.fillStyle = '#1b5e20'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8); ctx.fillStyle = '#43a047'; ctx.fillRect(2, 2, 3, 3); ctx.fillRect(10, 10, 3, 3); ctx.fillRect(10, 1, 4, 3); ctx.fillRect(1, 10, 4, 3); scatter(ctx, rng, 6, '#66bb6a'); },
  sand(ctx, rng) { fill(ctx, '#e6d5a3'); scatter(ctx, rng, 8, '#d4c08a'); scatter(ctx, rng, 4, '#f3e6bd'); },
  bridge(ctx) { DRAW.water(ctx); ctx.fillStyle = '#8d6e63'; ctx.fillRect(2, 0, 12, 16); ctx.fillStyle = '#6d4c41'; for (let y = 1; y < 16; y += 3) ctx.fillRect(2, y, 12, 1); ctx.fillStyle = '#5d4037'; ctx.fillRect(1, 0, 1, 16); ctx.fillRect(14, 0, 1, 16); },
  town(ctx, rng) { DRAW.grass(ctx, rng); ctx.fillStyle = '#bdbdbd'; ctx.fillRect(2, 8, 5, 6); ctx.fillRect(9, 9, 5, 5); ctx.fillStyle = '#c62828'; ctx.fillRect(1, 5, 7, 3); ctx.fillRect(8, 6, 7, 3); ctx.fillStyle = '#4e342e'; ctx.fillRect(4, 11, 2, 3); ctx.fillRect(11, 11, 2, 3); },
  glowstone(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#2f5b57'; ctx.fillRect(4, 8, 8, 6);
    ctx.fillStyle = '#69b6ac'; ctx.fillRect(5, 6, 2, 7); ctx.fillRect(8, 4, 3, 9); ctx.fillRect(11, 8, 2, 5);
    ctx.fillStyle = '#a8e6dc'; ctx.fillRect(5, 7, 1, 3); ctx.fillRect(9, 5, 1, 4); },
  flagstone(ctx, rng) { fill(ctx, '#8c837a'); ctx.fillStyle = '#4a443e';
    for (const v of [0, 5, 11]) { ctx.fillRect(0, v, 16, 1); ctx.fillRect(v, 0, 1, 16); }
    ctx.fillStyle = '#9c948b'; ctx.fillRect(2, 2, 2, 2); ctx.fillRect(8, 7, 3, 2); ctx.fillRect(12, 13, 2, 1);
    scatter(ctx, rng, 5, '#7a726a'); },
  bed(ctx) { DRAW.floor(ctx); ctx.fillStyle = '#5d4037'; ctx.fillRect(1, 0, 14, 16); ctx.fillStyle = '#1e88e5'; ctx.fillRect(2, 6, 12, 9); ctx.fillStyle = '#fafafa'; ctx.fillRect(3, 1, 10, 4); },
};

export function buildTiles(rng) {
  const out = {};
  for (const name of Object.keys(DRAW)) out[name] = artCanvas(TILE, TILE, ctx => DRAW[name](ctx, rng));
  return out;
}

// ============================ 动画瓦片 ============================
// FF6 的地图之所以「活」，一大半靠动画瓦片：水在流、灯在呼吸、草梢被风推。
//
// 做法：初始化时把一张静态瓦片烘成 N 张成品帧（离屏画布），渲染时按时间挑一张画。
// 于是每帧的绘制调用数和以前一模一样——每格仍然只有一次 drawImage，动画本身零成本。
// 千万不要改成每帧做逐像素处理：地图满屏 250 格以上，那样必掉帧。
// 因为是「换一张已经画好的图」，它对正式美术 PNG 和程序化 fallback 一视同仁。
//
// 分寸（这一条比效果本身重要）：所有循环周期 ≥4.8 秒，位移振幅只有 1~2 个**物理**像素
// （= 0.5~1 逻辑像素），亮度振幅 ≤0.2 而且只落在光源那一小块。
// 相邻两帧的差永远不超过 1 像素，所以看到的是「慢慢挪」，不是「闪」。

// 这里的离屏画布不走 artCanvas 的 ART 缩放：动画讲的是「挪一个物理像素」，
// 直接用基图自己的像素坐标最省事，ART 改了也不用跟着改。
function fxCanvas(img, fn) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fn(ctx, img.width, img.height);
  return c;
}
const wrap = (v, n) => ((v % n) + n) % n;

// 整块环绕漂移：水面。用环绕而不是留白，平移后瓦片四边还接得上；
// 又因为所有水格共用同一个相位（见 phase:0），整片水是一起流的，不会碎成马赛克。
function drift(ctx, img, w, h, dx, dy) {
  const ox = wrap(dx, w), oy = wrap(dy, h);
  for (const x of [ox - w, ox]) for (const y of [oy - h, oy]) ctx.drawImage(img, x, y);
}

// 一条缓慢下移的浅色涌浪，给水面一点反光。souce-atop 保证只作用在已有像素上，
// 瓦片若有透明区不会糊出白边。
function swell(ctx, w, h, y0, band, a) {
  ctx.globalCompositeOperation = 'source-atop';
  for (const off of [-h, 0, h]) {
    const g = ctx.createLinearGradient(0, y0 + off, 0, y0 + off + band);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 + off, w, band);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// 顶部一条带整体横移：草尖 / 树梢被风吹。同样环绕，平移后边上不会开缝。
function swayTop(ctx, img, w, h, dx, frac) {
  ctx.drawImage(img, 0, 0);
  if (!dx) return;
  const hb = Math.round(h * frac), ox = wrap(dx, w);
  ctx.clearRect(0, 0, w, hb);
  ctx.drawImage(img, 0, 0, w, hb, ox, 0, w, hb);
  ctx.drawImage(img, 0, 0, w, hb, ox - w, 0, w, hb);   // 补上被推出去的那一列
}

// 居中的加色光晕：磷光石 / 水晶的明灭。
// 半径必须小于半格，让光在瓦片边界之前衰减到 0，否则会看到一个方形的光斑边。
function glow(ctx, img, w, h, rgb, a) {
  ctx.drawImage(img, 0, 0);
  if (a <= 0) return;
  const cx = w / 2, cy = h / 2, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.47);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.55, `rgba(${rgb},${a * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.globalCompositeOperation = 'lighter';   // 加色，暗处才会真的被「照亮」而不是蒙灰
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

const WAVE_X = [0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2, -1]; // 水面 12 帧一圈的水平摇摆（物理像素）
const WAVE_Y = [1, 1, 1, 0, 0, -1, -1, -1, -1, 0, 0, 1];  // 相位差 90°，合起来是很小的一圈打转
const SWAY = [0, 1, 0, -1];                               // 风：左右各 1 物理像素，四帧一循环
const breathe = (i, n) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); // 0→1→0，两端导数为 0，接得平滑

// phase：0 = 全图同相位（水面要连成一整片）
//        1 = 按 (x+y) 错开（风一波一波斜着扫过去，而不是满屏一起动）
//        2 = 散开（好几盏灯一起呼吸就成了频闪，必须错开）
export const TILE_FX = {
  // 5.4 秒一圈。漂移 ±2px 让水在流，涌浪是唯一的亮度变化，峰值只有 0.10
  water: { n: 12, dur: 0.45, phase: 0, paint: (c, img, w, h, i, n) => {
    drift(c, img, w, h, WAVE_X[i], WAVE_Y[i]);
    swell(c, w, h, Math.floor(i * h / n), Math.max(4, Math.round(h / 5)), 0.10);
  } },
  // 4.8 秒一圈，只有 1 物理像素 = 0.5 逻辑像素。草是最占面积的瓦片，只敢动这么多
  grass: { n: 4, dur: 1.2, phase: 1, paint: (c, img, w, h, i) => swayTop(c, img, w, h, SWAY[i], 0.50) },
  tree: { n: 4, dur: 1.2, phase: 1, paint: (c, img, w, h, i) => swayTop(c, img, w, h, SWAY[i], 0.62) },
  forest: { n: 4, dur: 1.2, phase: 1, paint: (c, img, w, h, i) => swayTop(c, img, w, h, SWAY[i], 0.55) },
  // 5.6 秒一次呼吸，中心透明度 0.05↔0.20，边缘为 0。罗经圈深处就靠它照明
  glowstone: { n: 8, dur: 0.7, phase: 2, paint: (c, img, w, h, i, n) => glow(c, img, w, h, '120,232,214', 0.05 + 0.15 * breathe(i, n)) },
  // 6.4 秒一次。风之水晶是故事道具，允许比磷光石亮一点
  crystal: { n: 8, dur: 0.8, phase: 2, paint: (c, img, w, h, i, n) => glow(c, img, w, h, '158,244,255', 0.06 + 0.18 * breathe(i, n)) },
};

// 基图 → 帧数组。换地图、来回进出都命中缓存，全游戏总共只烘 40 张 32×32 画布。
const FRAME_CACHE = new Map();
export function tileFrames(img, spec) {
  if (!img || !spec) return null;
  let f = FRAME_CACHE.get(img);
  if (!f) {
    f = [];
    for (let i = 0; i < spec.n; i++) f.push(fxCanvas(img, (ctx, w, h) => spec.paint(ctx, img, w, h, i, spec.n)));
    FRAME_CACHE.set(img, f);
  }
  return f;
}
