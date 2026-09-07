// 程序生成的占位瓦片。逻辑尺寸 16×16，实际画布是 16*ART（美术精度倍率，见 core/Game.js）。
// 换正式素材时：assets/art/tile_*.png 会覆盖这里，只要 PNG 是 16*ART 见方即可。
import { artCanvas, ART } from '../core/draw.js';
export const TILE = 16;

function fill(ctx, c) { ctx.fillStyle = c; ctx.fillRect(0, 0, TILE, TILE); }
function scatter(ctx, rng, n, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rng.int(0, 15), rng.int(0, 15), 1, 1);
}
function hlines(ctx, ys, color) { ctx.fillStyle = color; for (const y of ys) ctx.fillRect(0, y, TILE, 1); }

// ======================== 房子怎么才有厚度 ========================
// 「一片瓦顶 + 一条白墙」平铺出来像贴在地上的色块，因为整栋房子只有两个色阶。
// 2D 俯视图里的立体感不是靠透视，是靠**从上到下走一遍明暗序**：
// 每一格瓦片负责一条横带，带与带之间的明暗跳变就是「这里转折了」的信号。
//
//   ^ roof_ridge   正脊：顶上一线暗＝看不见的后坡（交代「屋顶有两面」）→ 脊瓦顶面受光 → 硬影 → 前坡最亮
//   R roof         瓦面：竖向筒瓦，每格下缘一条课缝（上一垄压着下一垄的瓦口）
//   v roof_eave    檐口：瓦面转暗 → 滴水 → **出挑的檐板受光** → 檐下硬阴影
//   U wall_upper   墙身上部：顶上承接檐影，往下四行化开，化开处是全墙最亮的一线
//   N wall_window  同上，外加一个凹进去的直棂窗（墙上有个洞，墙就立起来了）
//   W wall_base    墙身下部 + 石脚：墙面一路白下来会飘，底下压深色石头才算「站」在地上
//   D door_front   门楼：出挑的石门楣 + 缩进去的双扇木门 + 门槛石
//   _ / - shadow_* 房子投在地上的影（可通行）。地图里这条影比房子**左右各宽一格**，
//                  那一格就是屋檐出挑的量——不画侧墙也能读出屋顶比墙宽。
//
// 光统一从正上偏左来：受光面一律在带的上缘，阴影落在下缘。全套只认这一个光向，
// 混着来就会互相抵消，看起来又变回平的。
// 颜色贴着 assets/art/ 里已有的 Gemini 瓦片走（屋顶 #4d1212~#661f1f，墙 #dbdbdb），
// 这样正式美术只换掉一部分时也不会撞色。
const ROOF = { far: '#2a1112', cap: '#8f3330', lit: '#7a2727', body: '#5a1717', rib: '#4a1212', dark: '#33100f' };
const WALL = { hi: '#efe8d8', body: '#ded5c2', mid: '#c9bfa9', sh1: '#9a9080', sh2: '#776e5f', sh3: '#585144' };
const STONE = { lit: '#9a958c', body: '#7c776e', dark: '#544f46', seam: '#3b382f' };
const WOOD = { lit: '#8f5f37', body: '#5e3a20', dark: '#33200f' };

// 竖向筒瓦：一垄 4 像素，左边一列是垄脊（受光），右边两列是垄沟（背光）。
// 屋顶的所有格子共用这一套垄距，上下几格才接得成一条通到底的瓦垄。
function tileRibs(ctx, y, h, ridge, valley) {
  for (let x = 0; x < TILE; x += 4) {
    ctx.fillStyle = ridge; ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = valley; ctx.fillRect(x + 2, y, 2, h);
  }
}
// 地上的屋影：上 6 行本影、2 行半影，第 9 行用隔点抖开，再往下是地面本色。
// 边缘一定要抖散——一条齐刷刷的硬边会被看成「地上挖了个方洞」，而不是影子。
function castShadow(ctx, rng, ground, speckA, speckB, core, penumbra, edge) {
  fill(ctx, ground);
  scatter(ctx, rng, 6, speckA); scatter(ctx, rng, 3, speckB);
  ctx.fillStyle = core; ctx.fillRect(0, 0, TILE, 6);
  ctx.fillStyle = penumbra; ctx.fillRect(0, 6, TILE, 2);
  ctx.fillStyle = edge; for (let x = 0; x < TILE; x += 2) ctx.fillRect(x, 8, 1, 1);
}

// 导出给测试用：「地图图例引用的瓦片都取得到」那条要拿它跟 manifest 合起来查
export const DRAW = {
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
  // 室内的墙。顶上那道影是「上面还压着屋顶」的交代——少了它，墙和地板一样平。
  wall(ctx) {
    fill(ctx, '#cfcac1');
    ctx.fillStyle = '#6f6a62'; ctx.fillRect(0, 0, TILE, 1);   // 梁/檐投下来的硬影
    ctx.fillStyle = '#948e85'; ctx.fillRect(0, 1, TILE, 1);
    ctx.fillStyle = '#e6e1d8'; ctx.fillRect(0, 2, TILE, 1);   // 影一化开就是最亮的一线
    hlines(ctx, [7, 12], '#a8a29a');
    ctx.fillStyle = '#a8a29a';
    ctx.fillRect(4, 3, 1, 4); ctx.fillRect(12, 3, 1, 4);
    ctx.fillRect(1, 8, 1, 4); ctx.fillRect(8, 8, 1, 4);
    ctx.fillStyle = '#7f7a72'; ctx.fillRect(0, 15, TILE, 1);  // 贴地的一线，墙脚才落得下去
  },
  // 屋面：竖向筒瓦 + 每格下缘的课缝。老版本是横线平铺，读起来像一块摊平的红布；
  // 改成竖垄之后眼睛会顺着垄往下走，坡度就出来了。课缝同时把「一垄压一垄」讲清楚。
  roof(ctx, rng) {
    fill(ctx, ROOF.body);
    tileRibs(ctx, 0, TILE, ROOF.lit, ROOF.rib);
    ctx.fillStyle = ROOF.lit; ctx.fillRect(0, 13, TILE, 1);   // 瓦口受光的一线
    ctx.fillStyle = ROOF.dark; ctx.fillRect(0, 14, TILE, 2);  // 压在下一垄上的阴影
    scatter(ctx, rng, 4, ROOF.rib);
  },
  // 正脊。最上面那一行是**后坡**露出来的一线：屋顶有两面坡这件事只能靠它交代，
  // 少了它屋顶就只是一块从天而降的板。往下依次是脊瓦顶面（全屋最亮）、脊下硬影、前坡。
  roof_ridge(ctx) {
    fill(ctx, '#6d2020');                                     // 前坡：紧挨着脊，最朝天，用最亮的瓦色
    tileRibs(ctx, 5, 11, '#93342f', ROOF.body);
    ctx.fillStyle = ROOF.lit; ctx.fillRect(0, 13, TILE, 1);
    ctx.fillStyle = ROOF.dark; ctx.fillRect(0, 14, TILE, 2);
    ctx.fillStyle = ROOF.far; ctx.fillRect(0, 0, TILE, 1);    // 后坡：越远越暗
    ctx.fillStyle = ROOF.cap; ctx.fillRect(0, 1, TILE, 1);    // 脊瓦顶面受光
    ctx.fillStyle = ROOF.body; ctx.fillRect(0, 2, TILE, 2);
    ctx.fillStyle = ROOF.dark; ctx.fillRect(0, 4, TILE, 1);   // 脊瓦投在前坡上的硬影
    ctx.fillStyle = ROOF.cap; ctx.fillRect(3, 0, 2, 1); ctx.fillRect(11, 0, 2, 1); // 脊上的小起翘，别做大，重复会花
  },
  // 檐口。一格里走完「瓦面转暗 → 滴水 → 檐板受光 → 檐下硬影」。
  // 檐板那条亮线是全屋最要紧的一笔：它是唯一一条**水平的受光面**，
  // 看到它，眼睛才知道上面那块是斜的、下面那块是竖的。
  roof_eave(ctx) {
    fill(ctx, ROOF.rib);                                      // 坡底背光，比屋面暗一档
    tileRibs(ctx, 0, 9, ROOF.body, ROOF.dark);
    ctx.fillStyle = ROOF.lit;                                 // 滴水/瓦当：每垄瓦口一个圆头
    for (let x = 0; x < TILE; x += 4) ctx.fillRect(x, 9, 2, 1);
    ctx.fillStyle = ROOF.dark; ctx.fillRect(0, 10, TILE, 1);
    ctx.fillStyle = WOOD.lit; ctx.fillRect(0, 11, TILE, 1);   // 檐板顶面
    ctx.fillStyle = WOOD.body; ctx.fillRect(0, 12, TILE, 1);  // 檐板正面
    ctx.fillStyle = WOOD.dark; ctx.fillRect(0, 13, TILE, 1);  // 檐板下沿
    ctx.fillStyle = '#3d3730'; ctx.fillRect(0, 14, TILE, 2);  // 檐下：出挑投在墙上的影，由 wall_upper 接着化开
  },
  // 墙身上部。顶上四行把檐影一级级化开——化开的行数就是屋檐挑出去的量，
  // 一步到位会像贴了条黑胶带，太慢又会糊成一片灰。
  wall_upper(ctx, rng) {
    fill(ctx, WALL.body);
    scatter(ctx, rng, 5, WALL.hi); scatter(ctx, rng, 3, WALL.mid);  // 白灰墙的斑驳，先撒，等下被檐影盖住上面几行
    ctx.fillStyle = WALL.sh3; ctx.fillRect(0, 0, TILE, 1);
    ctx.fillStyle = WALL.sh2; ctx.fillRect(0, 1, TILE, 1);
    ctx.fillStyle = WALL.sh1; ctx.fillRect(0, 2, TILE, 1);
    ctx.fillStyle = WALL.mid; ctx.fillRect(0, 3, TILE, 1);
    ctx.fillStyle = WALL.hi; ctx.fillRect(0, 4, TILE, 1);     // 影一化开就是最亮的一线
    ctx.fillStyle = WALL.mid;                                 // 斗子砌的砖缝：横两条，竖的错开
    ctx.fillRect(0, 9, TILE, 1); ctx.fillRect(0, 14, TILE, 1);
    ctx.fillRect(4, 5, 1, 4); ctx.fillRect(11, 5, 1, 4);
    ctx.fillRect(2, 10, 1, 4); ctx.fillRect(8, 10, 1, 4); ctx.fillRect(13, 10, 1, 4);
  },
  // 直棂窗。窗子本身不重要，重要的是它**凹进去**：上沿一道硬影、下面一块出挑的窗台。
  // 墙上只要有一个真的凹下去的洞，这堵墙就立起来了。
  wall_window(ctx, rng) {
    DRAW.wall_upper(ctx, rng);
    ctx.fillStyle = STONE.lit; ctx.fillRect(3, 4, 10, 1);     // 窗楣（过梁）顶面受光
    ctx.fillStyle = STONE.body; ctx.fillRect(3, 5, 10, 1);
    ctx.fillStyle = '#1e1a15'; ctx.fillRect(4, 6, 8, 6);      // 洞口
    ctx.fillStyle = '#100d09'; ctx.fillRect(4, 6, 8, 1);      // 洞口顶内壁：背光，进深全靠它
    ctx.fillStyle = '#6a5a44'; ctx.fillRect(11, 8, 1, 4); ctx.fillRect(5, 11, 7, 1); // 右下内壁吃到光
    ctx.fillStyle = WOOD.body; ctx.fillRect(6, 6, 1, 6); ctx.fillRect(9, 6, 1, 6);   // 两根竖棂
    ctx.fillStyle = STONE.lit; ctx.fillRect(3, 12, 10, 1);    // 窗台出挑
    ctx.fillStyle = STONE.dark; ctx.fillRect(3, 13, 10, 1);   // 窗台投在墙上的影
  },
  // 墙身下部 + 石脚。石脚不是装饰：墙面一路白下来会飘，
  // 底下压一段深色的卵石，房子才是「站」在地上而不是浮在上面。
  wall_base(ctx, rng) {
    fill(ctx, WALL.body);
    scatter(ctx, rng, 5, WALL.hi);
    ctx.fillStyle = WALL.mid;
    ctx.fillRect(0, 4, TILE, 1);
    ctx.fillRect(5, 0, 1, 4); ctx.fillRect(12, 0, 1, 4); ctx.fillRect(2, 5, 1, 5); ctx.fillRect(9, 5, 1, 5);
    ctx.fillStyle = STONE.lit; ctx.fillRect(0, 10, TILE, 1);  // 石脚顶面受光
    ctx.fillStyle = STONE.body; ctx.fillRect(0, 11, TILE, 4);
    ctx.fillStyle = STONE.dark; ctx.fillRect(3, 11, 1, 4); ctx.fillRect(8, 11, 1, 4); ctx.fillRect(12, 11, 1, 4);
    ctx.fillStyle = STONE.lit; ctx.fillRect(1, 11, 1, 2); ctx.fillRect(5, 11, 1, 2); ctx.fillRect(10, 11, 1, 2);
    ctx.fillStyle = STONE.seam; ctx.fillRect(0, 15, TILE, 1); // 墙脚线：贴地的最暗一笔
  },
  // 门楼。门口是全屋唯一有进深的开口，凹进去这件事必须交代清楚：
  // 出挑的石门楣压出一道硬影，门扇缩在影里，最后一条门槛石收在地面上。
  door_front(ctx, rng) {
    DRAW.wall_base(ctx, rng);
    ctx.fillStyle = STONE.lit; ctx.fillRect(2, 1, 12, 1);     // 门楣顶面
    ctx.fillStyle = STONE.body; ctx.fillRect(2, 2, 12, 1);
    ctx.fillStyle = '#120e0a'; ctx.fillRect(3, 3, 10, 2);     // 门洞顶部最暗＝进深
    ctx.fillStyle = WOOD.body; ctx.fillRect(4, 5, 8, 10);     // 两扇木门
    ctx.fillStyle = WOOD.lit; ctx.fillRect(4, 5, 1, 10); ctx.fillRect(6, 5, 1, 10); ctx.fillRect(9, 5, 1, 10);
    ctx.fillStyle = WOOD.dark; ctx.fillRect(3, 5, 1, 10); ctx.fillRect(12, 5, 1, 10); ctx.fillRect(7, 5, 1, 10);
    ctx.fillStyle = '#c9a227'; ctx.fillRect(5, 10, 1, 1); ctx.fillRect(10, 10, 1, 1); // 铜门环
    ctx.fillStyle = '#a3271f'; ctx.fillRect(1, 4, 1, 8); ctx.fillRect(14, 4, 1, 8);   // 门两边的对联
    ctx.fillStyle = STONE.lit; ctx.fillRect(3, 15, 10, 1);    // 门槛石
  },
  // 屋影落在泥地/禾埕上。房子和地面之间没有这条影，两者就在同一个平面上，
  // 再怎么画瓦片都还是「一张贴在地上的画」。颜色照 Gemini 的 path 走。
  shadow_dirt(ctx, rng) { castShadow(ctx, rng, '#b08d4a', '#9c7c40', '#c4a05a', '#5b4626', '#755c31', '#8f7139'); },
  // 同上，落在草地上。压暗到 #12401f 才压得住 Gemini 那块很饱和的绿。
  shadow_grass(ctx, rng) { castShadow(ctx, rng, '#2c8b39', '#237a30', '#3fa04c', '#12401f', '#1c5c28', '#237430'); },
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

  // ---- 迷宫瓦片的兜底 ----
  // 这七张平时用的是 Gemini 出的 PNG（manifest.tiles）。这里的程序化版本是**兜底**：
  // PNG 少一张就是 tiles[id] === undefined，画到那一格当场崩，而地图数据看起来完全正常。
  // 所以每张正式美术都要在这里有一个能看的替身——难看没关系，不能没有。
  stone_wall(ctx, rng) { fill(ctx, '#6f6a63'); ctx.fillStyle = '#3f3a35';
    for (const y of [0, 5, 11]) ctx.fillRect(0, y, 16, 1);
    for (const [y, xs] of [[0, [4, 11]], [5, [7]], [11, [3, 10]]]) for (const x of xs) ctx.fillRect(x, y, 1, 5);
    scatter(ctx, rng, 4, '#807a72'); },
  pillar(ctx, rng) { DRAW.flagstone(ctx, rng); ctx.fillStyle = '#cfc9bd'; ctx.fillRect(5, 1, 6, 14);
    ctx.fillStyle = '#e8e2d6'; ctx.fillRect(6, 1, 1, 14); ctx.fillRect(9, 1, 1, 14);
    ctx.fillStyle = '#a9a294'; ctx.fillRect(4, 0, 8, 2); ctx.fillRect(4, 14, 8, 2); },
  carpet(ctx) { fill(ctx, '#a5231d'); ctx.fillStyle = '#c8302a'; ctx.fillRect(2, 0, 12, 16);
    ctx.fillStyle = '#d8b24a'; ctx.fillRect(1, 0, 1, 16); ctx.fillRect(14, 0, 1, 16);
    for (let y = 2; y < 16; y += 5) { ctx.fillRect(2, y, 1, 2); ctx.fillRect(13, y, 1, 2); } },
  ore_vein(ctx, rng) { fill(ctx, '#3b3a3c'); scatter(ctx, rng, 6, '#4c4b4d');
    ctx.fillStyle = '#1f6f68'; ctx.fillRect(2, 11, 4, 3); ctx.fillRect(6, 8, 4, 3); ctx.fillRect(10, 4, 4, 3);
    ctx.fillStyle = '#3fbfae'; ctx.fillRect(3, 12, 2, 1); ctx.fillRect(7, 9, 2, 1); ctx.fillRect(11, 5, 2, 1); },
  rubble(ctx, rng) { fill(ctx, '#8b7d6b'); scatter(ctx, rng, 8, '#7a6d5c');
    ctx.fillStyle = '#9c968d'; for (const [x, y, w, h] of [[1, 9, 5, 4], [7, 11, 4, 3], [11, 6, 4, 4], [3, 3, 4, 3]]) ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6d675f'; for (const [x, y] of [[1, 12], [7, 13], [11, 9], [3, 5]]) ctx.fillRect(x, y, 5, 1); },
  throne(ctx, rng) { DRAW.flagstone(ctx, rng); ctx.fillStyle = '#6b4423'; ctx.fillRect(4, 1, 8, 14);
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(3, 8, 10, 6); ctx.fillStyle = '#a5231d'; ctx.fillRect(5, 9, 6, 4);
    ctx.fillStyle = '#d8b24a'; ctx.fillRect(6, 2, 4, 1); ctx.fillRect(5, 13, 6, 1); },
  sarcophagus(ctx, rng) { fill(ctx, '#4a4640'); scatter(ctx, rng, 4, '#565149');
    ctx.fillStyle = '#b0a894'; ctx.fillRect(2, 3, 12, 10);
    ctx.fillStyle = '#c9c1ac'; ctx.fillRect(3, 3, 11, 4);
    ctx.fillStyle = '#2b2822'; ctx.fillRect(2, 7, 1, 6);
    ctx.fillStyle = '#8e876f'; for (const y of [9, 11]) ctx.fillRect(4, y, 8, 1); },
  seal_stone(ctx) { fill(ctx, '#7f8480'); ctx.fillStyle = '#9aa09b'; ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = '#666b67'; ctx.fillRect(3, 4, 10, 1); ctx.fillRect(3, 11, 10, 1);
    ctx.fillRect(3, 4, 1, 8); ctx.fillRect(12, 4, 1, 8);
    ctx.fillStyle = '#b6bcb6'; ctx.fillRect(6, 7, 4, 2); },
  plank(ctx, rng) { DRAW.water(ctx, rng); ctx.fillStyle = '#8d6e63'; ctx.fillRect(0, 4, 16, 8);
    ctx.fillStyle = '#6d4c41'; for (let x = 1; x < 16; x += 3) ctx.fillRect(x, 4, 1, 8);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 12, 16, 1); },
  arch_door(ctx) { DRAW.stone_wall(ctx, { next: () => 0.5, int: () => 0 });
    ctx.fillStyle = '#9a948a'; ctx.fillRect(3, 1, 10, 14);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(4, 3, 8, 12);
    ctx.fillStyle = '#3e2723'; ctx.fillRect(7, 3, 2, 12);
    ctx.fillStyle = '#8d8378'; for (const y of [5, 10]) ctx.fillRect(4, y, 8, 1); },
  crate(ctx, rng) { fill(ctx, '#8a6a45'); scatter(ctx, rng, 5, '#7a5c3c');
    ctx.fillStyle = '#a97c50'; ctx.fillRect(2, 5, 6, 6); ctx.fillRect(8, 8, 6, 5);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(2, 5, 6, 1); ctx.fillRect(2, 10, 6, 1); ctx.fillRect(8, 8, 6, 1);
    ctx.fillStyle = '#d8cbb0'; ctx.fillRect(10, 3, 4, 4); },
  stove(ctx, rng) { fill(ctx, '#8a6a45'); scatter(ctx, rng, 4, '#7a5c3c');
    ctx.fillStyle = '#9c4a34'; ctx.fillRect(2, 3, 12, 10);
    ctx.fillStyle = '#7d3a28'; for (const y of [5, 8, 11]) ctx.fillRect(2, y, 12, 1);
    ctx.fillStyle = '#ff8a1e'; ctx.fillRect(6, 10, 4, 3);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(6, 3, 5, 3); },
  idol(ctx, rng) { fill(ctx, '#3a4348'); scatter(ctx, rng, 4, '#454f54');
    ctx.fillStyle = '#8f9a90'; ctx.fillRect(6, 2, 4, 11);
    ctx.fillStyle = '#a8b3a6'; ctx.fillRect(6, 2, 2, 11);
    ctx.fillStyle = '#6f7a70'; ctx.fillRect(4, 13, 8, 2);
    ctx.fillStyle = '#5d6b58'; ctx.fillRect(7, 5, 2, 1); ctx.fillRect(6, 9, 4, 1); },
  altar(ctx, rng) { DRAW.flagstone(ctx, rng); ctx.fillStyle = '#b8b2a6'; ctx.fillRect(2, 6, 12, 7);
    ctx.fillStyle = '#8f8a80'; ctx.fillRect(2, 10, 12, 1); ctx.fillStyle = '#c98a2e'; ctx.fillRect(7, 4, 3, 2);
    ctx.fillStyle = '#efe6cc'; ctx.fillRect(4, 3, 1, 3); ctx.fillRect(12, 3, 1, 3); },
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

// 这里的离屏画布不走 artCanvas 的 ART 缩放，直接用基图自己的像素坐标。
// 注意：位移量本身**必须**跟着 ART 换算（见 WAVE_X/SWAY 上面那段）——
// 这里原本写着「ART 改了也不用跟着改」，那是错的：
// 「挪一个物理像素」在 ART=2 下是半个逻辑像素，在 ART=6 下只有六分之一个，肉眼就没了。
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

// 幅度当初是按 ART=2 定的**物理**像素。ART 提到 6 之后不换算，
// 相对幅度就只剩三分之一——水面和草几乎看不出在动。
// 按 ART/2 放大回去：防闪那条「相邻两帧差不超过 1 像素」管的其实是**逻辑**位移，
// 换算之后逻辑位移和 ART=2 时一模一样，分寸没变。
const AMP = ART / 2;
const amp = a => a.map(v => Math.round(v * AMP));
const WAVE_X = amp([0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2, -1]); // 水面 12 帧一圈的水平摇摆
const WAVE_Y = amp([1, 1, 1, 0, 0, -1, -1, -1, -1, 0, 0, 1]);  // 相位差 90°，合起来是很小的一圈打转
const SWAY = amp([0, 1, 0, -1]);                               // 风：左右各 1 逻辑半像素，四帧一循环
const breathe = (i, n) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); // 0→1→0，两端导数为 0，接得平滑

// phase：0 = 全图同相位。只有水面用它——一整片水必须一起流，各流各的就碎成马赛克了。
//        1 = 按格子坐标把「翻帧的时刻」错开（见 FieldScene 的 SUB）。
//            关键不在于每格长得不一样，而在于它们不在同一瞬间翻帧：
//            满屏两百多格同时跳一下，哪怕位移只有 1 像素、亮度完全不变，也会被看成「画面闪了一下」。
//            错开之后翻帧散在整个周期里，看到的就只是草在窸窸窣窣、灯各呼吸各的。
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
  glowstone: { n: 8, dur: 0.7, phase: 1, paint: (c, img, w, h, i, n) => glow(c, img, w, h, '120,232,214', 0.05 + 0.15 * breathe(i, n)) },
  // 6.4 秒一次。风之水晶是故事道具，允许比磷光石亮一点
  crystal: { n: 8, dur: 0.8, phase: 1, paint: (c, img, w, h, i, n) => glow(c, img, w, h, '158,244,255', 0.06 + 0.18 * breathe(i, n)) },
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
