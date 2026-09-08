// 走地图的**方向光**：长投影、墙体立面暗部、受光棱。整张地图烘两张贴图，逐帧各一次 drawImage。
//
// 为什么不做在 src/assets/terrain.js 那套「一格一张缓存图」里：
// 一堵墙的影子要**跨好几格**，而那个模型里每格只知道自己的八个邻居——
// 现有的崖影（terrainBake.js 的 shadowTile）只有 5 逻辑像素高，正是被这条边界卡住的。
// 那是接触影（AO），不是太阳影。太阳影必须在地图这一级算。
//
// 光向沿用全项目已经定死的那一个：**左上来光**
// （tiles.js 房子那套「正脊→瓦面→檐口→墙身→石脚」的明暗序、terrain.js 只认 N/W/NW 的崖影）。
// 影子因此一律朝右下拖。terrain.js 只做了减法（压暗背光侧），这里补上加法（描亮受光侧）。
//
// **两张贴图、两种合成，都是这个项目已经在用的那两个**：
//   阴影贴图  不透明白底（白＝不动），画灰，渲染时 multiply —— 和 FieldScene 的崖影层同一条路
//   受光贴图  不透明黑底（黑＝不动），画光色，渲染时 lighter —— 和宝箱微光同一条路
// 不用 overlay / soft-light 把两张合成一张：那两个万一在某个浏览器上退化成 source-over，
// 就是把整张贴图**盖在画面上**，属于灾难性失败而不是降级。多一次 drawImage 买这个保险。
//
// **不透明画布上 darken/lighten 就是逐通道 min/max**，这是整套烘焙的地基：
// 一堵墙的投影要画成七片依次偏移的方块，source-over 会让它们叠成一团黑，
// 而 darken 取最暗的那片＝最近的那片，得到的正好是单调递减的拖影。
//
// **防闪**：两张贴图与时间完全无关，逐帧只是画同一张图。不可能闪。
import { TILE } from '../assets/tiles.js';

// 影子的方向与长度。len 是「一格高的东西拖多少逻辑像素」（一格 16）。
export const SUN = { dx: 0.55, dy: 1.0, len: 16 };
// 各档强度的默认值；MOOD 里可以按图覆盖（见 ambience.js 的 sun 字段）。
// cap 是**影子长度的上限，单位是格**：室外午后的影子拖得长，室内/洞窟的光源高、影子短。
export const SUN_DEF = { a: 0.30, lit: 0.16, face: 0.30, cap: 1.6, col: [255, 238, 205] };

// 每种瓦片的「高度」。0 = 地面，1 = 一整层墙。
// 水是 solid 但它是**洞不是体积**，必须留 0，否则池塘会往岸上投影。
// 楼梯 / 门 / 桥 / 地毯同理。村庄的屋顶比墙高，所以 roof_ridge 给到 1.25。
export const TALL = {
  cave_wall: 1, wall: 1, stone_wall: 1, mountain: 1,
  roof_ridge: 1.25, roof: 1.15, roof_eave: 1, wall_upper: 0.85, wall_window: 0.85,
  wall_base: 0.7, door_front: 0.7, arch_door: 0.75,
  tree: 0.75, forest: 0.7, cave_entrance: 0.9, town: 0.6, crystal: 0.6,
  pillar: 0.8, seal_stone: 0.7, idol: 0.7, altar: 0.55, throne: 0.5, stove: 0.5,
  ore_vein: 0.45, crate: 0.4, sarcophagus: 0.4, glowstone: 0.35, rubble: 0.3,
  counter: 0.35, bed: 0.25,
};
// 一条拖影切成几片：片距压在 1.5 逻辑像素上下，剩下的台阶靠降采样抹平。
// 片数跟着长度走 —— 固定片数的话，长影子的台阶会大到降采样也救不回来。
const slabs = L => Math.max(6, Math.min(28, Math.round(L / 1.5)));
const FACE = 5;       // 立面暗部的高度（逻辑像素）
const RIM = 3;        // 受光棱的厚度（逻辑像素）
const DOWN = 3;       // 软化用的降采样倍数。**不用 ctx.filter**：小半径反而更贵（见 HD2D方案.md 五-3）
const FALL = 1.45;    // 落地之后的衰减指数。峰值真落到地面之后，1.25 会拖出一条均匀的暗带
const MINL = 10;      // 落地长度的下限（逻辑像素）。见下面 exitDist 上方那段
const REACH = 6 * TILE, PROBE = 2;   // 找出口时最远走几格、几像素一步

// **影子从投影体里钻出来的那一点**，单位是逻辑像素；一路走到 REACH 还没出来就返回 null
//（那种格子的影子等下会被「不落在高物身上」整个擦掉，直接不画。罗经圈那种整片岩壁的图，
// 这一条把要画的格子砍掉一大半）。
//
// **斜坡必须从这里起算，不能从投影源那一格起算。** 第一版是后者，量出来的后果是：
// alpha 峰值那一片的偏移量只有 L/K ＝ 一两个像素，整片压在投影源自己头上，
// 被下一步擦得干干净净；落到可走地面上的**永远只剩衰减到尾巴的那一截**。
// 一栋房子的墙脚因此只拿到 0.17 而不是参数写的 0.30，村庄地面平均只压暗 2.8%，
// 关掉再打开肉眼分不出来。量法与前后读数见 docs/HD2D走地图.md 第三节。
//
// 连带的第二个后果：**矮东西一点影子都没有**。树 TALL 0.75 → 12 逻辑像素 < 一格 16，
// 整条影子都在自己格子里。六堆平原 164 棵树在草地上一片影子都不投——
// 而「山脚下的草是全亮的」正是 HD2D走地图.md 第零节记的最刺眼那一条。
// 从出口起算之后，树这一档自己就够了（12 px 全部落在邻格上）；
// **MINL 只管更矮的那一档**（hgt < 0.625：木箱 6.4、床 4、碎石 4.8 逻辑像素），
// 那些连出口都跨不过去，得给一个下限才在右下角留得下一小片。
function exitDist(at, x, y) {
  for (let f = 0; f <= REACH; f += PROBE) {
    // 拖影的每一片都是一整格见方，所以看的是**这一片的中心**落在哪一格
    const cx = x * TILE + SUN.dx * f + TILE / 2, cy = y * TILE + SUN.dy * f + TILE / 2;
    if (!at(Math.floor(cx / TILE), Math.floor(cy / TILE))) return f;
  }
  return null;
}

function mask(w, h, bg) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  return [c, g];
}
const gray = a => { const v = Math.round(255 * (1 - Math.max(0, Math.min(1, a)))); return `rgb(${v},${v},${v})`; };
const lit = (col, a) => `rgb(${Math.round(col[0] * a)},${Math.round(col[1] * a)},${Math.round(col[2] * a)})`;

// 最近几张地图的贴图。手机上不留 18 张：每张 0.1~1.3 MB，两张一套。
const CACHE = new Map(), ORDER = [], KEEP = 3;

export function buildLightmap(map, mapId, sun) {
  const s = { ...SUN_DEF, ...(sun || {}) };
  const key = `${mapId}|${s.a}|${s.lit}|${s.face}|${s.cap}|${s.col}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const v = bake(map, s);
  CACHE.set(key, v); ORDER.push(key);
  while (ORDER.length > KEEP) CACHE.delete(ORDER.shift());
  return v;
}

function bake(map, s) {
  const W = map.w * TILE, H = map.h * TILE;
  const n = map.w * map.h, tall = new Float32Array(n);
  for (let i = 0; i < n; i++) tall[i] = TALL[map.cells[i].tile] || 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h) ? 0 : tall[y * map.w + x];
  // **影子多长，看的是「这一叠有多高」，不是「这一格的瓦片叫什么」。**
  // 俯视图里一栋房子从正脊到石脚占了五行（内埔庄就是这样），那五行**在世界里是同一个体积**；
  // 只按本格的 TALL 算，一栋房子的影子只有半格，一格都爬不出自己的墙脚——
  // 第一版就是这样，影子全被「不落在高物身上」那一步擦光了，画面上一片影子都没有。
  const hgt = new Float32Array(n);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    hgt[i] = tall[i] ? tall[i] + (y > 0 ? hgt[i - map.w] : 0) : 0;
  }

  // ---- 阴影贴图 ----
  const [sc, sg] = mask(W, H, '#fff');
  sg.globalCompositeOperation = 'darken';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = tall[y * map.w + x];
    if (!t) continue;
    // L 是「**离开投影体之后**还拖多远」，不是影子总长。两个含义在整墙那一档差不多
    //（墙的出口就在自己脚下），差别全在矮物件上：树 12 px、木箱 6.4 px 本来都够不着邻格。
    // cap 的语义不变，仍然是「这张图的影子最长几格」（ambience.js 的 sun 里按场景分三档）。
    const L = Math.max(MINL, Math.min(hgt[y * map.w + x], s.cap) * SUN.len);
    const f0 = exitDist(at, x, y);
    if (f0 === null) continue;
    const K = slabs(L);
    for (let k = 0; k < K; k++) {
      sg.fillStyle = gray(s.a * Math.min(1, t) * (1 - k / K) ** FALL);
      const f = f0 + L * (k + 1) / K;
      sg.fillRect(Math.round(x * TILE + SUN.dx * f), Math.round(y * TILE + SUN.dy * f), TILE, TILE);
    }
  }
  // 影子不落在高物身上：不然屋脊会把影子投在自家屋顶上。
  // **地图里手画的影格（内埔庄那 46 格 shadow_dirt / shadow_grass）不擦**：
  // 擦了会在新影子中间留一条亮带，比不擦难看得多。它们本来就在影子里，
  // 新的软影正好接着那条硬边往外化开——那条硬边现在化得掉了。
  sg.globalCompositeOperation = 'lighten';
  sg.fillStyle = '#fff';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (tall[y * map.w + x]) sg.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  // 软化：降采样再放大。烘焙期跑一次，逐帧零成本。
  const [bc, bg] = mask(Math.max(1, Math.ceil(W / DOWN)), Math.max(1, Math.ceil(H / DOWN)), '#fff');
  bg.imageSmoothingEnabled = true;
  bg.drawImage(sc, 0, 0, W, H, 0, 0, bc.width, bc.height);
  sg.globalCompositeOperation = 'source-over';
  sg.imageSmoothingEnabled = true;
  sg.drawImage(bc, 0, 0, bc.width, bc.height, 0, 0, W, H);
  // 立面暗部**画在模糊之后**：墙面转折那条边本来就该是硬的，而投影该是软的。
  // 这是「把正面画出来」里唯一不动地图数据、也不吃掉可走地面的那半。
  sg.imageSmoothingEnabled = false;
  sg.globalCompositeOperation = 'darken';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = tall[y * map.w + x];
    if (!t || at(x, y + 1) >= t * 0.6) continue;      // 下面也是一样高的东西 ＝ 看不到正面
    for (let i = 0; i < FACE; i++) {
      sg.fillStyle = gray(s.face * Math.min(1, t) * (i + 1) / FACE);
      sg.fillRect(x * TILE, y * TILE + TILE - FACE + i, TILE, 1);
    }
  }

  // ---- 受光贴图 ----
  const [lc, lg] = mask(W, H, '#000');
  lg.globalCompositeOperation = 'lighten';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = tall[y * map.w + x];
    if (!t) continue;
    const k = Math.min(1, t);
    if (at(x, y - 1) < t * 0.6) for (let i = 0; i < RIM; i++) {      // 朝天那条棱，最亮
      lg.fillStyle = lit(s.col, s.lit * k * (1 - i / RIM));
      lg.fillRect(x * TILE, y * TILE + i, TILE, 1);
    }
    if (at(x - 1, y) < t * 0.6) for (let i = 0; i < RIM - 1; i++) {  // 朝光那一侧，弱一半
      lg.fillStyle = lit(s.col, s.lit * 0.55 * k * (1 - i / (RIM - 1)));
      lg.fillRect(x * TILE + i, y * TILE, 1, TILE);
    }
  }
  return { shade: sc, light: lc };
}

// 把贴图上对应镜头的那一块画上去。地图比屏幕小时 camX/camY 是负的（画面居中、两侧留黑），
// 源矩形必须夹回贴图内，否则 drawImage 会整个被判无效、什么都不画。
function blit(ctx, img, camX, camY, W, H, op, smooth) {
  const sx = Math.max(0, camX), sy = Math.max(0, camY);
  const sw = Math.min(img.width - sx, W - (sx - camX)), sh = Math.min(img.height - sy, H - (sy - camY));
  if (sw <= 0 || sh <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.imageSmoothingEnabled = smooth;   // 1 贴图像素 = 1 逻辑像素，放大 ART 倍**本身就是柔化**
  ctx.drawImage(img, sx, sy, sw, sh, sx - camX, sy - camY, sw, sh);
  ctx.restore();                        // 合成模式与插值开关都在绘制状态里，restore 一起还原
}
const on = (k, d) => (typeof window !== 'undefined' && window[k] !== undefined ? window[k] : d);

// 受光棱画在**角色之前**：它属于岩壁的几何，不该描在人身上。
export function drawLit(scene, ctx, camX, camY) {
  const lm = scene.fx?.lm;
  if (lm && on('__LIT', true)) blit(ctx, lm.light, camX, camY, scene.game.W, scene.game.H, 'lighter', true);
}
// 投影画在**角色之后**：站在墙影里的人本来就该跟着暗下去。
// 「人有没有被场景的光照到」正是「站在场景里」和「贴在场景上」的分界。
export function drawShade(scene, ctx, camX, camY) {
  const lm = scene.fx?.lm;
  if (lm && on('__SHADE', true)) blit(ctx, lm.shade, camX, camY, scene.game.W, scene.game.H, 'multiply', true);
}
