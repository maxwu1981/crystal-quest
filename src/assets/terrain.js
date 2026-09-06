// ======================= 地形过渡层（纯渲染，地图数据一个字没改）=======================
// FF6 的地图之所以看起来是「一片地景」而不是「一堆方块」，关键不在瓦片画得多好，
// 而在**接缝**：草伸进土路的锯齿、崖壁投在地上的影、水岸的浪花、地上零散的花与石头。
// 一格一张图硬拼出来的边，眼睛一眼就读成「贴纸」。
//
// 这里做五件事，全部只看邻居、只加图层：
//   1. 边缘咬合  高一级的地形（草/林/山/沙）沿接缝咬进低一级的地形（路/沙/洞窟地面）
//   2. 崖影      北 / 西 / 西北有「高物」时，本格对应的边压暗 —— 台地就有了高度
//   3. 水岸      水格朝陆地那侧是浅滩加浪花；陆地格朝水那侧是湿的
//   4. 地面装饰  花、草丛、石头、落叶、苔藓、裂缝，外加大块的明暗斑打散瓦片的复读感
//   5. 抠底      树 / 水晶这类「自带一层底」的瓦片，把底换成它实际站着的那种地面
//
// 性能约定和动画瓦片完全一样：**全部在换地图时烘成缓存画布**，渲染时只是多几次 drawImage。
// 绝不在每帧做逐像素处理，也绝不在每帧掷随机数（那是噪点闪烁，不是细节）。
// 随机数只在烘焙/布点时掷一次，种子来自「地图 id」或「缓存键」，所以每次进同一张图都长得一样。
import { TILE, TILE_FX, tileFrames } from './tiles.js';
import { ART } from '../core/draw.js';
import { RNG } from '../core/RNG.js';
import { u, PX, N, E, S, W, NE, SE, SW, NW, SIDES, CORNERS, AROUND } from './terrainBits.js';
import { DECO_PAINT, DECO_VARIANTS, baked, canvasPX, foamFrames, fringeTile, hash,
         keyOutGround, objectTile, palette, seamRecord, shadowTile, wetTile } from './terrainBake.js';


// 邻居方向位。四条边 + 四个角。
// 角位只有在**两条相邻的边都没有同类邻居**时才需要画，否则早被边盖住了 —— 这一条把
// 理论上的 256 种组合压到实际地图里的十几种，缓存才不会爆。

// ---------------------------------- 规则表 ----------------------------------
// 谁咬进谁。over 里是「会被咬」的地形；depth 是咬进去几个物理像素，jag 是锯齿幅度。
// 深度要克制：土路常常只有一格宽，两边各咬 6px 就只剩 20px 路面了 —— 那是「小径」，
// 再深就把路吃没了。
const FRINGE = {
  grass: { over: ['path', 'sand', 'flagstone', 'shadow_grass', 'shadow_dirt'], depth: 5, jag: 2, contact: true },
  // 房子投在地上的影（tiles.js 的 castShadow）只抖散得了下边缘 —— 一块瓦片不知道自己是不是
  // 一条影子的尽头，左右两侧只能是齐刷刷的硬边，看着像地上挖了个方洞。
  // 这里从旁边的地面往影子里咬一口，把那两条竖边打散；影子本体（上面 9 行）一点没动。
  path: { over: ['shadow_dirt'], depth: 5, jag: 2, contact: false },
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
// 从来不接受任何叠加的瓦片。房子那一套在 tiles.js 里已经手工画好了从屋脊到墙脚的明暗序，
// 再自动加一层就是双重影子。（shadow_* 不在这里：它们只接受上面那条「咬掉硬竖边」的过渡。）
const NO_TOUCH = new Set(['roof', 'roof_ridge', 'roof_eave', 'wall_upper', 'wall_window',
  'wall_base', 'door_front', 'bridge', 'door']);
// 会被水打湿的陆地
const WETTABLE = new Set(['sand', 'grass', 'path', 'forest', 'cave_floor', 'flagstone', 'town']);
// 「站在地上的东西」：这些瓦片**自带一层底**，而它和实际所在的地面对不上 ——
// 正式美术里树的底草是 #178424、草地是 #0e8e24；风之水晶自带的底是洞窟地面，却摆在祭场的沙地上。
// 于是每一棵树、每一颗水晶都框着一个 16×16 的方框。办法见 keyOutGround：抠掉自带的底换成真地面。
// 不能乱开：洞口 cave_entrance 的边框本来就是岩壁，抠掉等于把瓦片本身抠没了。
const SEAMABLE = new Set(['tree', 'crystal', 'town']);
const GROUND = new Set(['grass', 'path', 'sand', 'cave_floor', 'flagstone', 'floor', 'forest']); // 能当底铺的

// 会做「水平镜像变体」的瓦片。
// 同一张图铺满一整片时，网格周期在 ART=6 下一眼可见——山、林、洞壁尤其明显，
// 因为它们成片占掉半个屏幕。装饰只能在上面点缀，破不掉底纹本身的周期。
// 按位置挑一半的格子换成水平镜像：不新增任何美术，观感上的变化直接翻倍。
//
// **只翻水平**：这些瓦片的明暗都是「上方来光」，垂直翻会把受光面翻到底下去。
// 有方向含义的（楼梯、门、屋顶、桥、柜台）一个都不能进这张表。
// 草没进来是因为底纹近乎均匀，翻了看不出差别，白占一份缓存。
// 沙**进来了**：一开始也按「近乎均匀」排除掉了，那是没看仔细——
// 它有一道很强的方向性斜纹，大武山祭场整片地板都是它，重复一眼可见。
// 判据应该是「有没有方向性纹理」，不是「颜色均不均匀」。
//
// 树也在里面。抠底合成图（草地 + 抠好的树）整张翻过去连草底一起翻了，但草是近乎均匀的纹理，
// 翻了看不出来；而树形一翻，大地图上那一列十几棵一模一样、还等距排开的树就散了。
const MIRROR = new Set(['mountain', 'forest', 'cave_wall', 'cave_floor', 'tree', 'sand']);

// 把一组帧整体做水平镜像，返回和 anim 条目同形的记录（f/k/dur/ts），
// 这样渲染时挑帧的算法可以和普通动画瓦片共用一套。
function mirrorRec(id, rec, still) {
  const src = rec ? rec.f : (still ? [still] : null);
  if (!src) return null;
  return baked(`mir|${id}`, () => ({
    f: src.map(im => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.translate(im.width, 0); g.scale(-1, 1);
      g.drawImage(im, 0, 0);
      return c;
    }),
    k: rec ? rec.k : 0, dur: rec ? rec.dur : 1, ts: 0,
  }));
}

// 地面装饰：[种类, 权重]。density 是这种地面上有多少比例的格子会摆点东西。
// 大头故意留给 patch（大块明暗斑）—— 它最不起眼，但破除「同一张瓦片铺满整屏」的效果最大。
const DECO = {
  grass: { density: 0.34, pick: [['patchL', 6], ['patchD', 6], ['tuft', 5], ['flowerW', 2], ['flowerY', 2], ['flowerP', 1], ['rock', 1]] },
  path: { density: 0.28, pick: [['patchL', 5], ['patchD', 5], ['pebble', 4], ['leaf', 2], ['crack', 1]] },
  sand: { density: 0.26, pick: [['patchL', 4], ['patchD', 5], ['pebble', 3], ['shell', 2], ['tuft', 1]] },
  cave_floor: { density: 0.28, pick: [['patchD', 6], ['patchL', 3], ['rock', 3], ['moss', 2], ['crack', 2]] },
  flagstone: { density: 0.22, pick: [['crack', 4], ['moss', 3], ['pebble', 2]] },
  floor: { density: 0.16, pick: [['patchL', 3], ['patchD', 3], ['crack', 1]] },   // 室内：只做旧，不摆东西
  // 林子与山是**大片平铺**的地形，一屏能占掉半个画面，重复感比草地更刺眼——
  // 提到 ART=6 之后连岩石纹理的走向都看得清，网格一眼可见。
  // 这两种只用明暗斑（外加山上的碎石）：树冠和岩壁本来就该是杂的，
  // 摆花摆贝壳反而假。密度比草地高，因为它们的底纹更规整、更需要打散。
  forest: { density: 0.42, pick: [['patchL', 6], ['patchD', 7], ['tuft', 2]] },
  mountain: { density: 0.40, pick: [['patchD', 7], ['patchL', 5], ['rock', 3], ['crack', 2]] },
};

// ---------------------------------- 组装 ----------------------------------
// 换地图时跑一次，产出三张与 cells 等长的表：
//   base[i] 替掉这一格本来要画的瓦片（树/水晶/村落的抠底合成图；是替换不是叠加，绘制次数不变）
//   ovr[i]  正常叠加（过渡边 / 浪花 / 装饰）。元素是缓存画布，或「一组帧」（浪花）。
//   shd[i]  正片叠底（崖影 / 湿地）。渲染时单独走一遍，合成模式一整趟只切两次。
export function buildTerrainFx(map, tiles, mapId, anim) {
  const n = map.w * map.h;
  const ovr = new Array(n).fill(null), shd = new Array(n).fill(null), base = new Array(n).fill(null);
  const seamList = [];   // 需要逐帧推进时间的合成图（会被风吹的树、会明灭的水晶）
  const rng = new RNG(hash('deco:' + mapId));   // 装饰的布点：种子只跟地图 id 有关，重进一次还是这个样子
  // 镜像单独一条 RNG：装饰那条是**有条件**才取值的，掺进来会让镜像图案跟着装饰的分布走。
  // 而且每格都要无条件取一次，序列才不受瓦片种类影响。
  const mrng = new RNG(hash('mirror:' + mapId));
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
    // 镜像的骰子在这里**无条件**掷一次：不这样序列就会跟着地图上瓦片的分布走，
    // 换一张地图整个图案都变。抠底合成图和普通瓦片共用这一次结果。
    const mir = mrng.next() < 0.5 && MIRROR.has(me);
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
        // depth/jag 是当初在 ART=2（PX=32）下手调的物理像素，要按 U 换算回同样的相对深度，
        // 否则 ART 一提高，咬合就从「咬掉六分之一格」变成「咬掉五十分之一格」，边界又变回硬的。
        const dep = u(f.depth), jag = u(f.jag);
        push(ovr, baked(`fr|${t}|${m}|${dep}|${jag}|${f.contact ? 1 : 0}|${vr}`,
          r => fringeTile(src, m, dep, jag, f.contact, r)));
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
      const raw = best && baked(`seam|${me}|${best}`, () => seamRecord(tiles[best], tiles[me], me));
      const rec = raw && mir ? mirrorRec(`seam|${me}|${best}`, raw, null) : raw;
      if (rec) { base[i] = rec; if (rec.f.length > 1 && !seamList.includes(rec)) seamList.push(rec); }
    }
    // 2) 水岸：水格涌浪花，陆地格湿一条边。
    // 浪花只烘一套：扇贝要沿整条岸线连成一气，各格用不同版本反而会在格线上错开。
    if (me === 'water' && land) push(ovr, baked(`foam|${land}|${foamN}`, () => foamFrames(land, foamN)));
    else if (water && WETTABLE.has(me)) push(shd, baked(`wet|${water}|${vr}`, r => wetTile(water, r)));

    // 3) 地面装饰。事件格（宝箱/门/水晶）不摆东西，免得玩家把装饰看成可以互动的东西。
    // 判据只看 NO_TOUCH，不看 inert：inert 把「会投影到邻格」和「自己身上能不能有装饰」
    // 混成了一件事，而这两件无关——山会朝邻格投影，不代表山坡上不能有碎石。
    // 放开之后仍然安全：CASTER 里的树/水晶/村落/柜台/床/墙没有 DECO 条目，取到的是 undefined。
    const d = NO_TOUCH.has(me) ? null : DECO[me];
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

    // 5) 普通瓦片的镜像变体（抠底合成图那一类已经在 1b 里换过了）。
    if (mir && !base[i]) {
      const rec = mirrorRec(me, anim?.[me], tiles?.[me]);
      if (rec) { base[i] = rec; if (rec.f.length > 1 && !seamList.includes(rec)) seamList.push(rec); }
    }
  }
  // 宝箱画在事件层而不是地形层。正式美术的箱子已经是透明底了，所以这里只是给它补一片落影，
  // 让它「站」在地上而不是浮着；万一换成不透明的箱子图，objectTile 会顺手把底抠掉。
  const obj = {};
  for (const id of ['chest', 'chest_open']) if (tiles?.[id]) obj[id] = baked(`obj|${id}`, () => objectTile(tiles[id]));
  return { ovr, shd, base, obj, seamList, foamN };
}
