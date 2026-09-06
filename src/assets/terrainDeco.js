// 地面装饰的像素烘焙：花、草丛、石头、落叶、苔藓、裂缝，外加打散复读感的大块明暗斑。
// 从 terrainBake.js 拆出来——那个文件 410 行，破了项目单文件 400 行的上限，
// 缝就切在它原本第 299 行那道「地面装饰」横幅上。
// 这条缝干净的理由：横幅上半截（咬合 / 崖影 / 浪花 / 湿地 / 抠底）一个字都没用到下半截，
// 下半截也只要 terrainBits.js 的那几个换算，两边谁也不 import 谁。
// 「哪一格该撒哪种装饰」仍旧在 terrain.js 里，这边只管「一朵花长什么样」。
import { PX, u, us } from './terrainBits.js';

// ---------------------------------- 地面装饰 ----------------------------------
// 颜色从瓦片自己身上取：程序化占位图的草是 #5cb85c，Gemini 正式美术的草是 #0e8e24，
// 装饰要是硬编码颜色，换一套美术就会和地面对不上。
const PAL = new WeakMap();
const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
export function palette(img) {
  let p = PAL.get(img);
  if (p) return p;
  let r = 128, gg = 128, b = 128;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 8, 8);           // 缩到 8×8 = 取局部平均，比逐像素扫一遍快得多
    const d = x.getImageData(0, 0, 8, 8).data;
    let n = 0; r = gg = b = 0;
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    if (n) { r /= n; gg /= n; b /= n; } else { r = gg = b = 128; }
  } catch { r = gg = b = 128; }             // file:// 打开时画布会被污染读不出来，退回中性灰
  const mix = k => `rgb(${clamp8(r * k)},${clamp8(gg * k)},${clamp8(b * k)})`;
  // lit/dark 给花草石头用（要读得出来）；sl/sd 给大块明暗斑用（只准比地面深浅一点点）
  PAL.set(img, p = { lit: mix(1.36), dark: mix(0.64), sl: mix(1.22), sd: mix(0.80) });
  return p;
}

// 一块柔和的明暗斑。逐行按椭圆算宽度、宽度再抖一格，最外两圈隔点画 —— 边就化开了。
// 第一版是几个矩形叠出来的，铺在草地上看着是一块块补丁，比不加还糟。
// 整块画完再统一压到目标透明度（destination-in），否则重叠处会出现深浅不一的硬边。
function blotch(g, rng, color, a) {
  const rx = u(rng.int(5, 9)), ry = u(rng.int(4, 7));
  const cx = rng.int(rx + 1, PX - rx - 2), cy = rng.int(ry + 1, PX - ry - 2);
  g.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    // 宽度抖一下，边缘才不规整。抖幅也得跟着 U 放大——
    // 半径已经是 12–21 物理像素了，再抖 ±1 等于没抖，斑块会变成一个标准椭圆。
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.5)))) + us(rng.int(-1, 1));
    if (w <= 0) continue;
    const y = cy + dy;
    if (Math.abs(dy) >= ry - 1) { for (let x = cx - w; x <= cx + w; x += 2) g.fillRect(x, y, 1, 1); }
    else {
      g.fillRect(cx - w + 1, y, 2 * w - 1, 1);
      for (const x of [cx - w, cx + w]) if ((x + y) & 1) g.fillRect(x, y, 1, 1);
    }
  }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.fillRect(0, 0, PX, PX);
  g.globalCompositeOperation = 'source-over';
}
// 下面这些小东西的坐标与尺寸全是在 ART=2（PX=32）下手调的，直接用就等于缩到 1/U 大。
// R 把「相对 (x,y) 偏移 a,b、大小 w×h」这组数按 U 换算一次，
// 免得每个数字都包一层 u()——那样读起来全是括号，也容易漏。
const R = (g, x, y, a, b, w, h) => g.fillRect(x + u(a), y + u(b), u(w), u(h));
// 随机落点也要换算：PX 是随 ART 变的，留边距却是写死的物理像素。
const spot = (rng, a, b) => rng.int(u(a), PX - u(b));

function flower(g, rng, p, petal, core) {
  const x = spot(rng, 6, 11), y = spot(rng, 6, 12);
  g.fillStyle = p.dark; R(g, x, y, 2, 5, 2, 4);                                // 茎
  g.fillStyle = petal;
  R(g, x, y, 2, 0, 2, 2); R(g, x, y, 0, 2, 2, 2);                              // 四片花瓣
  R(g, x, y, 4, 2, 2, 2); R(g, x, y, 2, 4, 2, 2);
  g.fillStyle = core; R(g, x, y, 2, 2, 2, 2);
}
export const DECO_PAINT = {
  patchL: (g, rng, p) => blotch(g, rng, p.sl, 0.55),
  patchD: (g, rng, p) => blotch(g, rng, p.sd, 0.55),
  tuft: (g, rng, p) => {                                                       // 一撮高草
    const cx = spot(rng, 7, 9), cy = spot(rng, 10, 5);
    for (let k = 0; k < 5; k++) {
      const x = cx + us(k - 2), h = 4 + rng.int(0, 4), lean = rng.int(-1, 1);
      g.fillStyle = k % 2 ? p.dark : p.lit;
      // 草叶逐段往上画：段高与段宽都按 U 放大，叶尖那两段往一边偏
      for (let j = 0; j < h; j++) g.fillRect(x + (j > h - 3 ? us(lean) : 0), cy - us(j), u(1), u(1));
    }
  },
  flowerW: (g, rng, p) => flower(g, rng, p, '#f1eee0', '#e0bc4b'),
  flowerY: (g, rng, p) => flower(g, rng, p, '#f0cf4d', '#a86f1c'),
  flowerP: (g, rng, p) => flower(g, rng, p, '#df97bd', '#f2e69a'),
  rock: (g, rng) => {
    const x = spot(rng, 6, 11), y = spot(rng, 7, 10);
    g.fillStyle = 'rgba(0,0,0,0.26)'; R(g, x, y, 1, 5, 6, 1);                  // 落在地上的影
    g.fillStyle = '#6f6a63'; R(g, x, y, 0, 1, 6, 4);
    g.fillStyle = '#8d8880'; R(g, x, y, 1, 0, 4, 1); R(g, x, y, 0, 1, 2, 1);
    g.fillStyle = '#4a463f'; R(g, x, y, 1, 4, 5, 1);
  },
  pebble: (g, rng) => {
    const x = spot(rng, 6, 9), y = spot(rng, 6, 9);
    g.fillStyle = 'rgba(0,0,0,0.22)'; R(g, x, y, 0, 2, 4, 1);
    g.fillStyle = '#9c9384'; R(g, x, y, 0, 0, 4, 2);
    g.fillStyle = '#bdb4a2'; R(g, x, y, 1, 0, 2, 1);
  },
  leaf: (g, rng) => {
    const x = spot(rng, 6, 10), y = spot(rng, 6, 8);
    g.fillStyle = '#8a6a33'; R(g, x, y, 0, 1, 5, 2); R(g, x, y, 1, 0, 3, 1);
    g.fillStyle = '#5d4620'; R(g, x, y, 2, 1, 1, 2);
  },
  crack: (g, rng) => {                                                         // 一道细裂缝
    g.fillStyle = 'rgba(0,0,0,0.30)';
    let x = spot(rng, 5, 12), y = spot(rng, 6, 7);
    // 步长也要按 U 放大，否则 ART 一高裂缝就缩成一小撮点
    for (let k = 0; k < 8; k++) { g.fillRect(x, y, u(1), u(1)); x += u(1); y += us(rng.int(-1, 1)); }
  },
  moss: (g, rng) => blotch(g, rng, '#4c7a3c', 0.34),
  shell: (g, rng) => {
    const x = spot(rng, 7, 10), y = spot(rng, 7, 9);
    g.fillStyle = '#f0e2c6'; R(g, x, y, 0, 1, 4, 2); R(g, x, y, 1, 0, 2, 1);
    g.fillStyle = '#c9b48c'; R(g, x, y, 1, 2, 1, 1); R(g, x, y, 3, 1, 1, 1);
  },
};
export const DECO_VARIANTS = 6;   // 每种装饰烘 6 个位置不同的版本，摆满一屏也不会看出是同一张图
