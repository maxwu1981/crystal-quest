// 地形过渡的**像素烘焙**：把边缘咬合、崖影、浪花、湿地、抠底
// 各自画成一张 32×32 的缓存图。这里只管"一张图长什么样"，
// "哪一格该贴哪张图"在 terrain.js 里。拆开是因为合起来有 538 行，
// 破了项目单文件 400 行的规矩，而这条缝正好把"画"和"排"分得干净。
// 后来地面装饰那一段又从这里拆了出去（同一个理由），见 terrainDeco.js。
import { TILE, TILE_FX, tileFrames } from './tiles.js';
import { ART } from '../core/draw.js';
import { PX, U, u, us, N, E, S, W, NE, SE, SW, NW, SIDES, CORNERS, AROUND } from './terrainBits.js';
import { RNG } from '../core/RNG.js';

// ---------------------------------- 烘焙工具 ----------------------------------
export function canvasPX(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g);
  return c;
}
export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
// 全局缓存：键相同就复用。种子由键算出来，所以同一个键每次烘出来的图一模一样。
const CACHE = new Map();
export function baked(key, make) {
  let v = CACHE.get(key);
  if (v === undefined) CACHE.set(key, v = make(new RNG(hash(key))));
  return v;
}

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
    // 舌头宽度 4–7 也是 PX=32 时定的：ART=6 下不换算，锯齿密到看着像毛边
    const w = Math.min(PX - i, u(4) + rng.int(0, u(3)));   // 舌头宽度；base/jag 由调用方换算
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
    // 主舌头前面再撒几粒碎的，边缘才不像一条整齐的曲线。
    // 数量不随 ART 变（一格就该有这么几粒），但偏移和厚度是物理像素，要换算。
    for (let k = 0; k < 6; k++) {
      const i = rng.int(1, PX - u(3)), off = d[i] + u(1) + rng.int(0, u(3));
      if (off < PX - u(3)) fillSide(g, bit, i, off, off + u(rng.int(1, 2)));
    }
  }
  for (const [bit, dx, dy, need] of CORNERS) {
    if (!(mask & bit) || (mask & need)) continue;
    const r = Math.max(u(2), base);                     // 只在对角单独挨着时补一小块三角（base 已由调用方换算）
    for (let k = 0; k < r; k++) {
      const w = r - k;
      g.fillRect(dx > 0 ? PX - w : 0, dy > 0 ? PX - 1 - k : k, w, 1);
    }
  }
  return depth;
}

// 邻居地形咬进本格：形状里填**邻居瓦片自己的纹理**（source-in），
// 所以草边就是草、沙边就是沙 —— 换成 Gemini 的正式 PNG 也自动跟着变，不用改一行颜色。
export function fringeTile(src, mask, base, jag, contact, rng) {
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
export function shadowTile(mask, k) {
  return canvasPX(g => {
    const col = a => `rgba(20,26,36,${(a * k).toFixed(3)})`;
    // SH_N/SH_W 是**一物理像素一档**的渐变，当初按 PX=32 定的。
    // ART=6 下 PX=96，原样画出来的影子只有 5px 高——占一格的二十分之一，
    // 「远近」这件事全靠它，缩掉就没有立体感了。这里把每一档铺成 u(1) 厚的一条。
    const band = u(1);
    if (mask & N) {
      const cutL = !(mask & NW), cutR = !(mask & NE);
      SH_N.forEach((a, i) => {
        g.fillStyle = col(a);
        const cut = Math.min(u(i), u(3));
        const x0 = cutL ? cut : 0, x1 = PX - (cutR ? cut : 0), y = u(i);
        // 最后一档隔点画，让影子的下缘化开而不是齐刷刷断掉
        if (i < SH_N.length - 1) g.fillRect(x0, y, x1 - x0, band);
        else for (let x = x0; x < x1; x += band * 2) g.fillRect(x, y, band, band);
      });
    }
    if (mask & W) {
      const cutT = !(mask & NW), cutB = !(mask & SW);
      SH_W.forEach((a, i) => {
        g.fillStyle = col(a);
        const cut = Math.min(u(i), u(3));
        const y0 = cutT ? cut : 0, y1 = PX - (cutB ? cut : 0), x = u(i);
        if (i < SH_W.length - 1) g.fillRect(x, y0, band, y1 - y0);
        else for (let y = y0; y < y1; y += band * 2) g.fillRect(x, y, band, band);
      });
    }
    if ((mask & NW) && !(mask & (N | W))) {   // 只在对角挨着时补个小角，交代得清楚就够
      g.fillStyle = col(0.26); g.fillRect(0, 0, u(4), u(4));
      g.fillStyle = col(0.13); g.fillRect(0, u(4), u(3), u(1)); g.fillRect(u(4), 0, u(1), u(3));
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
export function foamFrames(mask, n) {
  const out = [];
  // SCALLOP/SHALLOW 是**每物理像素一格**的查表，周期 16 = 半格（按 PX=32 定的）。
  // ART=6 下 PX=96，原样索引就变成六分之一格一个浪头、浪高只有 5–7px：
  // 扇贝密成锯齿，浅滩窄成一条线。索引先除回 U，取到的值再乘回去。
  const wave = (arr, x) => u(arr[Math.floor(x / U) & 15]);
  for (let i = 0; i < n; i++) out.push(canvasPX(g => {
    const o = u(2 + FOAM_OFF[i % FOAM_OFF.length]);
    const a = 0.40 + 0.10 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
    for (const [bit] of SIDES) {
      if (!(mask & bit)) continue;
      // 先铺一层浅滩：靠岸的水浅、颜色淡。这一层不动，作用是把「水和陆地之间那条笔直的格线」
      // 换成一条深浅渐变的带子 —— 光靠一条浪花线压不住那条直边。
      for (let x = 0; x < PX; x++) {
        const d = wave(SHALLOW, x);
        g.fillStyle = 'rgba(150,214,222,0.20)'; fillSide(g, bit, x, 0, d - u(2));
        g.fillStyle = 'rgba(140,200,212,0.11)'; fillSide(g, bit, x, d - u(2), d);
      }
      for (let x = 0; x < PX; x++) {
        const raw = SCALLOP[Math.floor(x / U) & 15], s = u(raw), y0 = Math.max(0, o + s - u(1));
        g.fillStyle = `rgba(232,250,255,${(a + raw * 0.06).toFixed(3)})`;
        fillSide(g, bit, x, y0, y0 + u(1) + (s >> 1));       // 浪头厚一点，浪谷薄一点
        if (raw) {                                           // 浪头后面拖一点更淡的沫
          g.fillStyle = `rgba(198,230,244,${(a * 0.42).toFixed(3)})`;
          fillSide(g, bit, x, y0 + u(2) + (s >> 1), y0 + u(3) + (s >> 1));
        }
      }
    }
  }));
  return out;
}

// 陆地被水打湿的一条边。用 multiply 压暗而不是蒙半透明灰：
// 沙子只会变成「湿沙」（暗一档、固有色还在），蒙灰会直接变脏。
// 分量要非常小 —— 这是背景里的背景，第一版压到了 0.55，出来像一道水泥路缘。
export function wetTile(mask, rng) {
  return canvasPX(g => {
    for (const [bit] of SIDES) {
      if (!(mask & bit)) continue;
      const d = tongues(rng, u(4), u(1));
      for (let i = 0; i < PX; i++) {
        const core = Math.max(0, d[i] - u(2));
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
// 这张图本来就是透明底的吗（正式美术的宝箱、洋红抠底出来的物件瓦片都是）。
// 判「有没有一个全透明像素」就够——满铺不透明的瓦片一个都没有。
// 结果按图缓存：换一张地图会把同一张瓦片问上几百次，而读像素不便宜。
const TRANSP = new WeakMap();
export function hasTransparency(img) {
  let v = TRANSP.get(img);
  if (v !== undefined) return v;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, PX, PX);
  let d;
  try { d = g.getImageData(0, 0, PX, PX); } catch { TRANSP.set(img, false); return false; }
  const p = d.data;
  v = false;
  for (let j = 3; j < p.length; j += 4) if (!p[j]) { v = true; break; }
  TRANSP.set(img, v);
  return v;
}
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function keyOutGround(img, tol = 18) {
  // 本来就是透明底的不用抠，而且**必须不能抠**：透明像素的 RGB 是 0，
  // 边框均色会算成黑，漫水就会顺着黑色把物件自己的描边一路吃掉。
  if (hasTransparency(img)) return null;
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
  // 洋红抠底出来的物件瓦片自己就是透明底（tools/pixel.py 的 chroma_key，出图时抠掉的），
  // 直接拿来贴；老那批满铺的（树/水晶/村落）才需要现场漫水抠一次。
  const cut = hasTransparency(obj) ? obj : keyOutGround(obj);
  if (!cut) return null;
  return canvasPX(g => {
    g.drawImage(ground, 0, 0, PX, PX);
    g.globalCompositeOperation = 'multiply';   // 压暗而不是蒙灰，草地的绿才保得住
    shadowOval(g, out => out ? 'rgba(126,132,140,0.55)' : 'rgba(112,118,128,0.55)');
    g.globalCompositeOperation = 'source-over';
    g.drawImage(cut, 0, 0, PX, PX);
  });
}
// 抠底换地面之后，这一格就不再走原来那张瓦片的动画帧了 —— 直接用合成图的话，
// 树不会被风吹、水晶不会明灭，等于把前面做好的东西弄丢了。
// 所以把合成图送回 tiles.js 的 tileFrames 再烘一遍同样的帧；返回的记录形状和 FieldScene 的
// anim 条目完全一致（f/k/dur/ts），由 FieldScene 放进 fx.list 一起推进时间。
// 不会动的瓦片（村落）退化成「只有一帧」，渲染那边不用分两条路。
export function seamRecord(ground, obj, tileId) {
  const img = seamTile(ground, obj);
  if (!img) return null;
  const spec = TILE_FX[tileId], f = spec && tileFrames(img, spec);
  return f ? { f, k: spec.phase, dur: spec.dur, ts: 0 } : { f: [img], k: 0, dur: 1, ts: 0 };
}

// 同样是抠好底的物件，但**透明底**：给画在事件层的宝箱用。
// 底下那一格的地形（连同过渡边、装饰）照旧由地形层画，物件只是盖在上面，
// 所以不能像 seamTile 那样连地面一起烘 —— 那会把这一格的过渡边糊掉。
// 代价是落影只能用半透明黑（透明底上没法 multiply），面积小，看不出来。
export function objectTile(img) {
  const cut = keyOutGround(img) || img;   // 本来就是透明底的直接用原图，只补一片落影
  return canvasPX(g => {
    shadowOval(g, out => out ? 'rgba(22,26,32,0.13)' : 'rgba(22,26,32,0.24)', 0.26);
    g.drawImage(cut, 0, 0, PX, PX);
  });
}
