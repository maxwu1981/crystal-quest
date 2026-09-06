// ======================= 地形过渡层（纯渲染，地图数据一个字没改）=======================
// FF6 的地图之所以看起来是「一片地景」而不是「一堆方块」，关键不在瓦片画得多好，
// 而在**接缝**：草伸进土路的锯齿、崖壁投在地上的影、水岸的浪花、地上零散的花与石头。
// 一格一张图硬拼出来的边，眼睛一眼就读成「贴纸」。
//
// 这里做四件事，全部只看邻居、只加图层：
//   1. 边缘咬合  高一级的地形（草/林/山/沙）沿接缝咬进低一级的地形（路/沙/洞窟地面）
//   2. 崖影      北 / 西 / 西北有「高物」时，本格对应的边压暗 —— 台地就有了高度
//   3. 水岸      水格朝陆地那侧涌浪花；陆地格朝水那侧是湿的
//   4. 地面装饰  花、草丛、石头、落叶、苔藓、裂缝，外加大块的明暗斑打散瓦片的复读感
//
// 性能约定和动画瓦片完全一样：**全部在换地图时烘成缓存画布**，渲染时只是多几次 drawImage。
// 绝不在每帧做逐像素处理，也绝不在每帧掷随机数（那是噪点闪烁，不是细节）。
// 随机数只在烘焙/布点时掷一次，种子来自「地图 id」或「缓存键」，所以每次进同一张图都长得一样。
import { TILE } from './tiles.js';
import { ART } from '../core/draw.js';
import { RNG } from '../core/RNG.js';

const PX = TILE * ART;      // 一格的物理像素（32）。锯齿、浪花这类细节按物理像素画才有 1px 的颗粒感。

// 邻居方向位。四条边 + 四个角。
// 角位只有在**两条相邻的边都没有同类邻居**时才需要画，否则早被边盖住了 —— 这一条把
// 理论上的 256 种组合压到实际地图里的十几种，缓存才不会爆。
const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;
const SIDES = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
const CORNERS = [[NE, 1, -1, N | E], [SE, 1, 1, S | E], [SW, -1, 1, S | W], [NW, -1, -1, N | W]];
const AROUND = [...SIDES, ...CORNERS];

// ---------------------------------- 规则表 ----------------------------------
// 谁咬进谁。over 里是「会被咬」的地形；depth 是咬进去几个物理像素，jag 是锯齿幅度。
// 深度要克制：土路常常只有一格宽，两边各咬 6px 就只剩 20px 路面了 —— 那是「小径」，
// 再深就把路吃没了。
const FRINGE = {
  grass: { over: ['path', 'sand', 'flagstone'], depth: 5, jag: 2, contact: true },
  forest: { over: ['grass', 'path', 'sand'], depth: 5, jag: 2, contact: true },   // 林缘的灌木丛
  mountain: { over: ['grass', 'sand', 'path'], depth: 4, jag: 2, contact: true }, // 山脚的碎石坡
  sand: { over: ['cave_floor'], depth: 5, jag: 2, contact: false },               // 洞里的滩
  cave_floor: { over: ['flagstone'], depth: 4, jag: 2, contact: false },          // 尘土漫过铺石
};
// 「高物」：本身一律不接受任何叠加。值 > 0 的还会把影子投到邻格上（1 = 崖壁石墙，0.6 = 林子与家具）。
// 值为 0 的是**孤零零站着的一格东西**（树、水晶、村落、洞口）：影子按格子铺会落成一个方框，
// 而它们的轮廓是圆的，看着像站在方坑里。这类东西的影子跟着自己的轮廓走，烘进合成图（见 seamTile）。
const CASTER = {
  cave_wall: 1, mountain: 1, wall: 1, forest: 0.6, counter: 0.6, bed: 0.6,
  tree: 0, crystal: 0, town: 0, cave_entrance: 0,
};
// 从来不接受任何叠加的瓦片。房子那一套在 tiles.js 里已经手工画好了明暗序，
// 村庄地图也手工摆了 shadow_dirt / shadow_grass，再自动加一层就是双重影子。
const NO_TOUCH = new Set(['roof', 'roof_ridge', 'roof_eave', 'wall_upper', 'wall_window',
  'wall_base', 'door_front', 'shadow_dirt', 'shadow_grass', 'bridge', 'door']);
// 会被水打湿的陆地
const WETTABLE = new Set(['sand', 'grass', 'path', 'forest', 'cave_floor', 'flagstone', 'town']);
// 「站在地上的东西」：这些瓦片**自带一层底**，而它和实际所在的地面对不上 ——
// 正式美术里树的底草是 #178424、草地是 #0e8e24；风之水晶自带的底是洞窟地面，却摆在祭场的沙地上。
// 于是每一棵树、每一颗水晶都框着一个 16×16 的方框。办法见 keyOutGround：抠掉自带的底换成真地面。
// 不能乱开：洞口 cave_entrance 的边框本来就是岩壁，抠掉等于把瓦片本身抠没了。
const SEAMABLE = new Set(['tree', 'crystal', 'town']);
const GROUND = new Set(['grass', 'path', 'sand', 'cave_floor', 'flagstone', 'floor', 'forest']); // 能当底铺的

// 地面装饰：[种类, 权重]。density 是这种地面上有多少比例的格子会摆点东西。
// 大头故意留给 patch（大块明暗斑）—— 它最不起眼，但破除「同一张瓦片铺满整屏」的效果最大。
const DECO = {
  grass: { density: 0.34, pick: [['patchL', 6], ['patchD', 6], ['tuft', 5], ['flowerW', 2], ['flowerY', 2], ['flowerP', 1], ['rock', 1]] },
  path: { density: 0.28, pick: [['patchL', 5], ['patchD', 5], ['pebble', 4], ['leaf', 2], ['crack', 1]] },
  sand: { density: 0.26, pick: [['patchL', 4], ['patchD', 5], ['pebble', 3], ['shell', 2], ['tuft', 1]] },
  cave_floor: { density: 0.28, pick: [['patchD', 6], ['patchL', 3], ['rock', 3], ['moss', 2], ['crack', 2]] },
  flagstone: { density: 0.22, pick: [['crack', 4], ['moss', 3], ['pebble', 2]] },
  floor: { density: 0.16, pick: [['patchL', 3], ['patchD', 3], ['crack', 1]] },   // 室内：只做旧，不摆东西
};

// ---------------------------------- 烘焙工具 ----------------------------------
function canvasPX(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g);
  return c;
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
// 全局缓存：键相同就复用。种子由键算出来，所以同一个键每次烘出来的图一模一样。
const CACHE = new Map();
function baked(key, make) {
  let v = CACHE.get(key);
  if (v === undefined) CACHE.set(key, v = make(new RNG(hash(key))));
  return v;
}
export const bakedCount = () => CACHE.size;

// 沿 side 这条边，第 i 列（行）从深度 a 填到深度 b。四条边共用一套坐标换算。
function fillSide(g, side, i, a, b) {
  const n = b - a;
  if (n <= 0) return;
  if (side === N) g.fillRect(i, a, 1, n);
  else if (side === S) g.fillRect(i, PX - b, 1, n);
  else if (side === W) g.fillRect(a, i, n, 1);
  else g.fillRect(PX - b, i, n, 1);
}

// 一条锯齿边的深度表：把这一边切成 3~5px 宽的「舌头」，每条深浅不同，两端各收 1px 让它圆一点。
// 不用逐像素随机 —— 那是白噪声，看着像毛边；成块的舌头才像草真的长过去了。
function tongues(rng, base, jag) {
  const d = new Array(PX).fill(0);
  for (let i = 0; i < PX;) {
    const w = Math.min(PX - i, 4 + rng.int(0, 3));
    const v = Math.max(1, base + rng.int(-jag, jag));
    for (let k = 0; k < w; k++) d[i + k] = Math.max(1, v - (k === 0 || k === w - 1 ? 1 : 0));
    i += w;
  }
  return d;
}

// 画出「咬进来」的形状（纯白），返回各边的深度表供描接触影用。
// 舌头外面再撒几颗孤立的碎点，边就化开了，不会是一条齐刷刷的界线。
function fringeShape(g, rng, mask, base, jag) {
  const depth = {};
  g.fillStyle = '#fff';
  for (const [bit] of SIDES) {
    if (!(mask & bit)) continue;
    const d = depth[bit] = tongues(rng, base, jag);
    for (let i = 0; i < PX; i++) fillSide(g, bit, i, 0, d[i]);
    for (let k = 0; k < 6; k++) {
      const i = rng.int(1, PX - 3), off = d[i] + 1 + rng.int(0, 3);
      if (off < PX - 3) fillSide(g, bit, i, off, off + rng.int(1, 2));
    }
  }
  for (const [bit, dx, dy, need] of CORNERS) {
    if (!(mask & bit) || (mask & need)) continue;
    const r = Math.max(2, base);                        // 只在对角单独挨着时补一小块三角
    for (let k = 0; k < r; k++) {
      const w = r - k;
      g.fillRect(dx > 0 ? PX - w : 0, dy > 0 ? PX - 1 - k : k, w, 1);
    }
  }
  return depth;
}

// 邻居地形咬进本格：形状里填**邻居瓦片自己的纹理**（source-in），
// 所以草边就是草、沙边就是沙 —— 换成 Gemini 的正式 PNG 也自动跟着变，不用改一行颜色。
function fringeTile(src, mask, base, jag, contact, rng) {
  return canvasPX(g => {
    const depth = fringeShape(g, rng, mask, base, jag);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(src, 0, 0, PX, PX);
    g.globalCompositeOperation = 'source-over';
    if (!contact) return;
    // 舌头脚下一条极淡的接触影：让它「压」在下面那块地上，而不是浮着
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (const [bit] of SIDES) {
      const d = depth[bit];
      if (d) for (let i = 0; i < PX; i++) fillSide(g, bit, i, d[i], d[i] + 1);
    }
  });
}

// 崖影。光统一从正上偏左来（和 tiles.js 里房子那一套同一个光向），
// 所以只有北 / 西 / 西北的高物会把影子投到这一格，其它方向一概不画 —— 满图打圈的影子没有方向感。
//
// 关键在**收头**：如果北边那堵墙到这一格就断了（西北/东北没有高物），影子的那一端必须斜着收掉。
// 一格影子从左到右一条齐边，看起来就是地上摆了个灰方块，不是影子。最后一行再隔点抖开，
// 因为一条硬的下边界会被读成「地上挖了个洞」。
const SH_N = [0.34, 0.34, 0.27, 0.18, 0.10];
const SH_W = [0.24, 0.22, 0.14, 0.08];
function shadowTile(mask, k) {
  return canvasPX(g => {
    const col = a => `rgba(20,26,36,${(a * k).toFixed(3)})`;
    if (mask & N) {
      const cutL = !(mask & NW), cutR = !(mask & NE);
      SH_N.forEach((a, y) => {
        g.fillStyle = col(a);
        const x0 = cutL ? Math.min(y, 3) : 0, x1 = PX - (cutR ? Math.min(y, 3) : 0);
        if (y < SH_N.length - 1) g.fillRect(x0, y, x1 - x0, 1);
        else for (let x = x0; x < x1; x += 2) g.fillRect(x, y, 1, 1);
      });
    }
    if (mask & W) {
      const cutT = !(mask & NW), cutB = !(mask & SW);
      SH_W.forEach((a, x) => {
        g.fillStyle = col(a);
        const y0 = cutT ? Math.min(x, 3) : 0, y1 = PX - (cutB ? Math.min(x, 3) : 0);
        if (x < SH_W.length - 1) g.fillRect(x, y0, 1, y1 - y0);
        else for (let y = y0; y < y1; y += 2) g.fillRect(x, y, 1, 1);
      });
    }
    if ((mask & NW) && !(mask & (N | W))) {   // 只在对角挨着时补个小角，交代得清楚就够
      g.fillStyle = col(0.26); g.fillRect(0, 0, 4, 4);
      g.fillStyle = col(0.13); g.fillRect(0, 4, 3, 1); g.fillRect(4, 0, 1, 3);
    }
  });
}

// 水岸的浪花，画在**水格**朝陆地那一侧。
// 节拍跟水面动画完全同一套（12 帧 × 0.45 秒 = 5.4 秒一圈，而且全图同相位），
// 所以整条岸线是一起涌的，不会各涌各的碎成马赛克。
// 每帧只在离岸方向挪 1 个物理像素、透明度只在 0.26~0.36 之间晃，看到的是水在拍岸，不是闪。
//
// 形状是重复的**扇贝**而不是等距虚线：虚线一眼就看出是电脑画的选取框（第一版就踩了这个坑）。
// 扇贝周期 16px = 半格，所以跨格也是连的，铺开就是一排浪头。
const FOAM_OFF = [0, 0, 1, 1, 2, 2, 1, 1, 0, 0, -1, -1];
const SCALLOP = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 1, 1, 1, 0];
const SHALLOW = [5, 6, 6, 5, 4, 4, 5, 6, 7, 7, 6, 5, 4, 4, 5, 6];   // 浅滩深浅，同样 16px 一循环
function foamFrames(mask, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(canvasPX(g => {
    const o = 2 + FOAM_OFF[i % FOAM_OFF.length];
    const a = 0.40 + 0.10 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
    for (const [bit] of SIDES) {
      if (!(mask & bit)) continue;
      // 先铺一层浅滩：靠岸的水浅、颜色淡。这一层不动，作用是把「水和陆地之间那条笔直的格线」
      // 换成一条深浅渐变的带子 —— 光靠一条浪花线压不住那条直边。
      for (let x = 0; x < PX; x++) {
        const d = SHALLOW[x & 15];
        g.fillStyle = 'rgba(150,214,222,0.20)'; fillSide(g, bit, x, 0, d - 2);
        g.fillStyle = 'rgba(140,200,212,0.11)'; fillSide(g, bit, x, d - 2, d);
      }
      for (let x = 0; x < PX; x++) {
        const s = SCALLOP[x & 15], y0 = Math.max(0, o + s - 1);
        g.fillStyle = `rgba(232,250,255,${(a + s * 0.06).toFixed(3)})`;
        fillSide(g, bit, x, y0, y0 + 1 + (s >> 1));          // 浪头厚一点，浪谷薄一点
        if (s) {                                             // 浪头后面拖一点更淡的沫
          g.fillStyle = `rgba(198,230,244,${(a * 0.42).toFixed(3)})`;
          fillSide(g, bit, x, y0 + 2 + (s >> 1), y0 + 3 + (s >> 1));
        }
      }
    }
  }));
  return out;
}

// 陆地被水打湿的一条边。用 multiply 压暗而不是蒙半透明灰：
// 沙子只会变成「湿沙」（暗一档、固有色还在），蒙灰会直接变脏。
// 分量要非常小 —— 这是背景里的背景，第一版压到了 0.55，出来像一道水泥路缘。
function wetTile(mask, rng) {
  return canvasPX(g => {
    for (const [bit] of SIDES) {
      if (!(mask & bit)) continue;
      const d = tongues(rng, 4, 1);
      for (let i = 0; i < PX; i++) {
        const core = Math.max(0, d[i] - 2);
        g.fillStyle = 'rgba(150,152,150,0.34)'; fillSide(g, bit, i, 0, core);
        g.fillStyle = 'rgba(170,172,170,0.28)'; fillSide(g, bit, i, core, d[i]);
        if (!(i & 1)) fillSide(g, bit, i, d[i], d[i] + 1);   // 最外一圈隔点抖开，别留一条硬边
      }
    }
  });
}

// ------------------------- 把「自带底色」的瓦片抠出来（见 SEAM）-------------------------
// 从四边往里做一次漫水：凡是「和边框同色、而且连得到边框」的像素一律抠成透明，剩下的就是树本身。
// 用漫水而不是单纯的颜色阈值，是因为树冠里也有绿 —— 阈值会把树冠打出洞，
// 漫水只吃得到从外面连进来的那一片。
// 抠出来的比例不在 10%~90% 之间就当抠坏了，直接放弃、原样画 —— 换一套美术也不会翻车。
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function keyOutGround(img, tol = 18) {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, PX, PX);
  let d;
  try { d = g.getImageData(0, 0, PX, PX); } catch { return null; }   // file:// 打开时画布被污染，读不了
  const p = d.data;
  const edge = (x, y) => x === 0 || y === 0 || x === PX - 1 || y === PX - 1;
  let r = 0, gg = 0, b = 0, k = 0;
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    if (!edge(x, y)) continue;
    const o = (y * PX + x) * 4; r += p[o]; gg += p[o + 1]; b += p[o + 2]; k++;
  }
  r /= k; gg /= k; b /= k;
  const near = j => { const o = j * 4; return Math.abs(p[o] - r) <= tol && Math.abs(p[o + 1] - gg) <= tol && Math.abs(p[o + 2] - b) <= tol; };
  const seen = new Uint8Array(PX * PX), stack = [];
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const j = y * PX + x;
    if (edge(x, y) && !seen[j] && near(j)) { seen[j] = 1; stack.push(j); }
  }
  let n = stack.length;
  while (stack.length) {
    const j = stack.pop(), x = j % PX, y = (j / PX) | 0;
    for (const [dx, dy] of NB4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= PX || ny >= PX) continue;
      const nj = ny * PX + nx;
      if (!seen[nj] && near(nj)) { seen[nj] = 1; stack.push(nj); n++; }
    }
  }
  const frac = n / (PX * PX);
  if (frac < 0.10 || frac > 0.90) return null;   // 抠得太多（整格都是底色）或太少＝这张图不适合，放弃
  for (let j = 0; j < seen.length; j++) if (seen[j]) p[j * 4 + 3] = 0;
  g.putImageData(d, 0, 0);
  return c;
}
// 底＋落影＋抠好的物件合成一张，直接**替掉**那一格原来的瓦片 ——
// 是替换不是叠加，每帧绘制次数一点没多。
// 树底下的草和邻居用的是同一张图、同一个对齐，格线就彻底没了。
// 底草不做风吹动画：那 1px 的摆动全被树冠挡着，看不见，不值得为它多烘四帧。
//
// 落影是个椭圆，不是方向影：树的轮廓是圆的，按格子铺的方向影会在格线上切出一个方框，
// 看着像树站在一个方坑里（第一版就是这样）。椭圆往右下偏一点，对上「光从正上偏左」这个光向。
function shadowOval(g, a, rxK = 0.30) {
  const cx = Math.round(PX * 0.53), cy = Math.round(PX * 0.87);
  const rx = Math.round(PX * rxK), ry = Math.max(2, Math.round(rx * 0.3));
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.4))));
    if (w <= 0 || cy + dy >= PX) continue;
    g.fillStyle = a(Math.abs(dy) === ry);
    g.fillRect(cx - w, cy + dy, 2 * w + 1, 1);
  }
}
function seamTile(ground, obj) {
  const cut = keyOutGround(obj);
  if (!cut) return null;
  return canvasPX(g => {
    g.drawImage(ground, 0, 0, PX, PX);
    g.globalCompositeOperation = 'multiply';   // 压暗而不是蒙灰，草地的绿才保得住
    shadowOval(g, out => out ? 'rgba(126,132,140,0.55)' : 'rgba(112,118,128,0.55)');
    g.globalCompositeOperation = 'source-over';
    g.drawImage(cut, 0, 0, PX, PX);
  });
}
// 同样是抠好底的物件，但**透明底**：给画在事件层的宝箱用。
// 底下那一格的地形（连同过渡边、装饰）照旧由地形层画，物件只是盖在上面，
// 所以不能像 seamTile 那样连地面一起烘 —— 那会把这一格的过渡边糊掉。
// 代价是落影只能用半透明黑（透明底上没法 multiply），面积小，看不出来。
export function objectTile(img) {
  const cut = keyOutGround(img);
  if (!cut) return null;
  return canvasPX(g => {
    shadowOval(g, out => out ? 'rgba(22,26,32,0.13)' : 'rgba(22,26,32,0.24)', 0.26);
    g.drawImage(cut, 0, 0, PX, PX);
  });
}

// ---------------------------------- 地面装饰 ----------------------------------
// 颜色从瓦片自己身上取：程序化占位图的草是 #5cb85c，Gemini 正式美术的草是 #0e8e24，
// 装饰要是硬编码颜色，换一套美术就会和地面对不上。
const PAL = new WeakMap();
const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
function palette(img) {
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
  const rx = rng.int(5, 9), ry = rng.int(4, 7);
  const cx = rng.int(rx + 1, PX - rx - 2), cy = rng.int(ry + 1, PX - ry - 2);
  g.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.5)))) + rng.int(-1, 1);
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
function flower(g, rng, p, petal, core) {
  const x = rng.int(6, PX - 11), y = rng.int(6, PX - 12);
  g.fillStyle = p.dark; g.fillRect(x + 2, y + 5, 2, 4);                       // 茎
  g.fillStyle = petal;
  g.fillRect(x + 2, y, 2, 2); g.fillRect(x, y + 2, 2, 2);                      // 四片花瓣
  g.fillRect(x + 4, y + 2, 2, 2); g.fillRect(x + 2, y + 4, 2, 2);
  g.fillStyle = core; g.fillRect(x + 2, y + 2, 2, 2);
}
const DECO_PAINT = {
  patchL: (g, rng, p) => blotch(g, rng, p.sl, 0.55),
  patchD: (g, rng, p) => blotch(g, rng, p.sd, 0.55),
  tuft: (g, rng, p) => {                                                       // 一撮高草
    const cx = rng.int(7, PX - 9), cy = rng.int(10, PX - 5);
    for (let k = 0; k < 5; k++) {
      const x = cx + k - 2, h = 4 + rng.int(0, 4), lean = rng.int(-1, 1);
      g.fillStyle = k % 2 ? p.dark : p.lit;
      for (let j = 0; j < h; j++) g.fillRect(x + (j > h - 3 ? lean : 0), cy - j, 1, 1);
    }
  },
  flowerW: (g, rng, p) => flower(g, rng, p, '#f1eee0', '#e0bc4b'),
  flowerY: (g, rng, p) => flower(g, rng, p, '#f0cf4d', '#a86f1c'),
  flowerP: (g, rng, p) => flower(g, rng, p, '#df97bd', '#f2e69a'),
  rock: (g, rng) => {
    const x = rng.int(6, PX - 11), y = rng.int(7, PX - 10);
    g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(x + 1, y + 5, 6, 1);          // 落在地上的影
    g.fillStyle = '#6f6a63'; g.fillRect(x, y + 1, 6, 4);
    g.fillStyle = '#8d8880'; g.fillRect(x + 1, y, 4, 1); g.fillRect(x, y + 1, 2, 1);
    g.fillStyle = '#4a463f'; g.fillRect(x + 1, y + 4, 5, 1);
  },
  pebble: (g, rng) => {
    const x = rng.int(6, PX - 9), y = rng.int(6, PX - 9);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + 2, 4, 1);
    g.fillStyle = '#9c9384'; g.fillRect(x, y, 4, 2);
    g.fillStyle = '#bdb4a2'; g.fillRect(x + 1, y, 2, 1);
  },
  leaf: (g, rng) => {
    const x = rng.int(6, PX - 10), y = rng.int(6, PX - 8);
    g.fillStyle = '#8a6a33'; g.fillRect(x, y + 1, 5, 2); g.fillRect(x + 1, y, 3, 1);
    g.fillStyle = '#5d4620'; g.fillRect(x + 2, y + 1, 1, 2);
  },
  crack: (g, rng) => {                                                         // 一道细裂缝
    g.fillStyle = 'rgba(0,0,0,0.30)';
    let x = rng.int(5, PX - 12), y = rng.int(6, PX - 7);
    for (let k = 0; k < 8; k++) { g.fillRect(x, y, 1, 1); x += 1; y += rng.int(-1, 1); }
  },
  moss: (g, rng) => blotch(g, rng, '#4c7a3c', 0.34),
  shell: (g, rng) => {
    const x = rng.int(7, PX - 10), y = rng.int(7, PX - 9);
    g.fillStyle = '#f0e2c6'; g.fillRect(x, y + 1, 4, 2); g.fillRect(x + 1, y, 2, 1);
    g.fillStyle = '#c9b48c'; g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x + 3, y + 1, 1, 1);
  },
};
const DECO_VARIANTS = 6;   // 每种装饰烘 6 个位置不同的版本，摆满一屏也不会看出是同一张图

// ---------------------------------- 组装 ----------------------------------
// 换地图时跑一次，产出三张与 cells 等长的表：
//   base[i] 替掉这一格本来要画的瓦片（只有树用；不是叠加，绘制次数不变）
//   ovr[i]  正常叠加（过渡边 / 浪花 / 装饰）。元素是缓存画布，或「一组帧」（浪花）。
//   shd[i]  正片叠底（崖影 / 湿地）。渲染时单独走一遍，合成模式一整趟只切两次。
export function buildTerrainFx(map, tiles, mapId) {
  const n = map.w * map.h;
  const ovr = new Array(n).fill(null), shd = new Array(n).fill(null), base = new Array(n).fill(null);
  const rng = new RNG(hash('deco:' + mapId));   // 装饰的布点：种子只跟地图 id 有关，重进一次还是这个样子
  const foamN = 12;
  const at = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h) ? null : map.cells[y * map.w + x].tile;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x, me = map.cells[i].tile;
    const push = (a, v) => { if (v) (a[i] ||= []).push(v); };
    // 落在本格的邻居分布。同一格最多算一次，下面几种叠加共用。
    // cast 只收 N/W/NW（真正会投影过来的方向）加上 NE/SW（只用来判断影子该不该收头）。
    let cast = 0, castK = 0, land = 0, water = 0;
    const kinds = new Set();
    for (const [bit, dx, dy] of AROUND) {
      const t = at(x + dx, y + dy);
      if (t === null || t === me) continue;
      kinds.add(t);
      const c = CASTER[t];
      if (c && (bit & (N | W | NW | NE | SW))) { cast |= bit; if (bit & (N | W | NW)) castK = Math.max(castK, c); }
      if (bit & 15) { if (t === 'water') water |= bit; else if (me === 'water' && !NO_TOUCH.has(t)) land |= bit; }
    }
    const inert = NO_TOUCH.has(me) || CASTER[me] !== undefined;
    // 同一张过渡图铺满一条接缝，锯齿会以一格为周期复读，一眼就看出是拼的。
    // 烘 4 个版本、按坐标挑：横着走 x 每 +1 换一个，竖着走 y 每 +1 也换，就散开了。
    const vr = (x * 5 + y * 3) & 3;

    // 1) 邻居地形咬进来。同一格最多两种来源 —— 三种以上的接缝在 16px 里也读不出来，白白多画。
    if (!inert) {
      let used = 0;
      for (const t of kinds) {
        const f = FRINGE[t];
        if (!f || !f.over.includes(me) || used >= 2) continue;
        const src = tiles?.[t];
        if (!src) continue;
        let m = 0;
        for (const [bit, dx, dy] of AROUND) if (at(x + dx, y + dy) === t) m |= bit;
        push(ovr, baked(`fr|${t}|${m}|${f.depth}|${f.jag}|${f.contact ? 1 : 0}|${vr}`,
          r => fringeTile(src, m, f.depth, f.jag, f.contact, r)));
        used++;
      }
    }
    // 1b) 树 / 水晶 / 村落：抠掉它自带的底，换成邻居用的那种地面（见 SEAMABLE / keyOutGround）。
    //     这是**替换**那一格的瓦片，不是叠加，绘制次数一点没多。
    if (SEAMABLE.has(me) && tiles?.[me]) {
      let best = null, bn = 0;
      const cnt = {};
      for (const [, dx, dy] of AROUND) {
        const t = at(x + dx, y + dy);
        if (!t || !GROUND.has(t) || !tiles[t]) continue;
        const c2 = cnt[t] = (cnt[t] || 0) + 1;
        if (c2 > bn) { bn = c2; best = t; }
      }
      if (best) base[i] = baked(`seam|${me}|${best}`, () => seamTile(tiles[best], tiles[me]));
    }
    // 2) 水岸：水格涌浪花，陆地格湿一条边。
    // 浪花只烘一套：扇贝要沿整条岸线连成一气，各格用不同版本反而会在格线上错开。
    if (me === 'water' && land) push(ovr, baked(`foam|${land}|${foamN}`, () => foamFrames(land, foamN)));
    else if (water && WETTABLE.has(me)) push(shd, baked(`wet|${water}|${vr}`, r => wetTile(water, r)));

    // 3) 地面装饰。事件格（宝箱/门/水晶）不摆东西，免得玩家把装饰看成可以互动的东西。
    const d = inert ? null : DECO[me];
    if (d && !map.events[`${x},${y}`] && rng.next() < d.density) {
      let total = 0;
      for (const [, w] of d.pick) total += w;
      let r = rng.next() * total, kind = d.pick[0][0];
      for (const [k, w] of d.pick) { r -= w; if (r < 0) { kind = k; break; } }
      const v = rng.int(0, DECO_VARIANTS - 1), src = tiles?.[me];
      if (src) push(ovr, baked(`deco|${me}|${kind}|${v}`, rr => canvasPX(g => DECO_PAINT[kind](g, rr, palette(src)))));
    }
    // 4) 崖影。放在最后，渲染时也画在最后 —— 影子里的花本来就该是暗的。
    // 浓度只有两档（1 = 崖壁石墙，0.6 = 树木家具），一格只画一张，不叠。
    if (!inert && (cast & (N | W | NW))) push(shd, baked(`sh|${cast}|${castK}`, () => shadowTile(cast, castK)));
  }
  // 宝箱画在事件层而不是地形层，可它自带的底也是洞窟地面 —— 27 个箱子里有 12 个摆在
  // 草地、沙地、林子甚至桥上，就是一个灰方块扣在那儿。这里抠成透明底的物件图给 FieldScene 用。
  const obj = {};
  for (const id of ['chest', 'chest_open']) if (tiles?.[id]) obj[id] = baked(`obj|${id}`, () => objectTile(tiles[id]));
  return { ovr, shd, base, obj, foamN };
}
