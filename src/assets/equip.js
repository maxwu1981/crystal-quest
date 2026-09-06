// 装备外观：在角色精灵上叠一层武器 / 防具，走地图和战斗都看得到穿戴效果。
// 文件末尾还有一套 12×12 的道具小图标（菜单列表用），和这里共用材质配色。
//
// 每件装备按「类别 + 材质颜色」程序化画出叠加层（32×48，与角色同尺寸），
// 之后 assets/art/ 里若有 equip_<id>_<dir>.png 就用真图覆盖，接口不变。
import { ART, artCanvas } from '../core/draw.js';

// 材质颜色：暗色描边 / 主色 / 高光。id 前缀取自 data/items.json 的材质命名
const MAT = {
  wood:    ['#4a3524', '#8d6a43', '#b08a5c'],
  knife:   ['#3a3f45', '#8b939b', '#c3cad1'],
  bronze:  ['#5a3f1c', '#a97438', '#d3a05c'],
  iron:    ['#3a3f45', '#7d858d', '#aab2ba'],
  steel:   ['#42484f', '#9aa3ac', '#d2dae2'],
  silver:  ['#5c6470', '#c2cad6', '#f2f6fb'],
  mythril: ['#2f5b57', '#69b6ac', '#a8e6dc'],
  adamant: ['#4a3d18', '#b39236', '#e6c765'],
  meteor:  ['#3a2c4a', '#6f5a92', '#a893c9'],
  dragon:  ['#5a1f1f', '#b2413a', '#e08a72'],
  oak:     ['#4a3524', '#7d5c38', '#a37f4f'],
  crystal: ['#2c4a5a', '#5aa9c9', '#a5e2f2'],
  star:    ['#2b2f52', '#6a72b8', '#b0b8f0'],
  leather: ['#4a3220', '#8a5f3a', '#b3855a'],
  cloth:   ['#3d3a52', '#6f6a8f', '#9c96bd'],
  linen:   ['#4a463a', '#9a9070', '#c6bd9c'],
  silk:    ['#3f2c4a', '#8a5fa0', '#bd93cf'],
  rune:    ['#2c3a4a', '#4f7aa0', '#87b3d6'],
  copper:  ['#5a3418', '#a2643a', '#d09060'],   // 铜戒指：比青铜再红一点
  wrap:    ['#4a463a', '#8f8468', '#bdb392'],   // 布缠手：本来就是一条布
  myth:    ['#5a4a12', '#d4af37', '#ffe9a3'],   // 神话装备统一走金色
};
// fallback 给那些 id 里根本没有材质词的东西（力量护腕、疾风靴…）
const matOf = (id, fallback = MAT.iron) => {
  for (const k of Object.keys(MAT)) if (id.startsWith(k)) return MAT[k];
  return fallback;
};

function canvas() { const c = document.createElement('canvas'); c.width = 16 * ART; c.height = 24 * ART; return c; }
// 回调里用 16×24 逻辑坐标绘制
function layer(fn) {
  const c = canvas(), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false; ctx.scale(ART, ART);
  fn(ctx);
  return c;
}

// ---------- 武器形状（逻辑坐标，角色约 16 宽 24 高，脚在底部）----------
// dir: down 正面（武器垂在身侧）/ left 侧面（武器伸向前方）/ up 背面（武器背在身后）
const WEAPON = {
  // 一律画在角色轮廓「外侧」，不要压到身上：正/背面挂在右侧，侧面伸向左前方
  sword(ctx, [o, m, h], dir) {
    if (dir === 'left') {
      ctx.fillStyle = o; ctx.fillRect(0, 14, 8, 3);
      ctx.fillStyle = m; ctx.fillRect(0, 15, 7, 1);
      ctx.fillStyle = h; ctx.fillRect(1, 15, 3, 1);
      ctx.fillStyle = o; ctx.fillRect(7, 13, 2, 5);            // 护手
      ctx.fillStyle = '#5a4028'; ctx.fillRect(9, 15, 2, 2);    // 握柄
    } else if (dir === 'up') {
      ctx.fillStyle = o; ctx.fillRect(13, 8, 3, 11);           // 背在身后
      ctx.fillStyle = m; ctx.fillRect(14, 9, 1, 9);
      ctx.fillStyle = '#5a4028'; ctx.fillRect(13, 17, 3, 3);
    } else {
      ctx.fillStyle = o; ctx.fillRect(13, 12, 3, 10);
      ctx.fillStyle = m; ctx.fillRect(14, 13, 1, 8);
      ctx.fillStyle = h; ctx.fillRect(14, 14, 1, 3);
      ctx.fillStyle = '#5a4028'; ctx.fillRect(13, 10, 3, 2);
    }
  },
  dagger(ctx, [o, m, h], dir) {
    if (dir === 'left') {
      ctx.fillStyle = o; ctx.fillRect(1, 15, 6, 2);
      ctx.fillStyle = m; ctx.fillRect(1, 15, 5, 1);
      ctx.fillStyle = '#5a4028'; ctx.fillRect(7, 15, 2, 2);
    } else if (dir === 'up') {
      ctx.fillStyle = o; ctx.fillRect(14, 13, 2, 6); ctx.fillStyle = m; ctx.fillRect(14, 14, 1, 4);
    } else {
      ctx.fillStyle = o; ctx.fillRect(14, 14, 2, 6);
      ctx.fillStyle = m; ctx.fillRect(14, 15, 1, 4);
      ctx.fillStyle = '#5a4028'; ctx.fillRect(14, 12, 2, 2);
    }
  },
  knuckle(ctx, [o, m, h], dir) {
    const put = x => { ctx.fillStyle = o; ctx.fillRect(x, 14, 3, 3); ctx.fillStyle = m; ctx.fillRect(x, 14, 2, 2); ctx.fillStyle = h; ctx.fillRect(x, 14, 1, 1); };
    if (dir === 'left') put(1); else { put(0); put(13); }
  },
  staff(ctx, [o, m, h], dir) {
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle = '#5a4028'; ctx.fillRect(x, 9, 2, 13);      // 杖身
    ctx.fillStyle = o; ctx.fillRect(x - 1, 6, 4, 4);           // 顶端宝石
    ctx.fillStyle = m; ctx.fillRect(x, 7, 2, 2);
    ctx.fillStyle = h; ctx.fillRect(x, 7, 1, 1);
  },
};

// ---------- 防具：只勾肩甲与下摆边缘，不盖住角色本身的造型 ----------
const ARMOR = {
  armor(ctx, [o, m, h], dir) {
    if (dir === 'left') {                                 // 侧面只看得到一侧肩甲
      ctx.fillStyle = o; ctx.fillRect(4, 11, 4, 4);
      ctx.fillStyle = m; ctx.fillRect(4, 11, 3, 3);
      ctx.fillStyle = h; ctx.fillRect(5, 12, 1, 1);
      return;
    }
    ctx.fillStyle = o; ctx.fillRect(2, 11, 4, 4);         // 左肩甲
    ctx.fillStyle = m; ctx.fillRect(2, 11, 3, 3);
    ctx.fillStyle = o; ctx.fillRect(10, 11, 4, 4);        // 右肩甲
    ctx.fillStyle = m; ctx.fillRect(11, 11, 3, 3);
    ctx.fillStyle = h; ctx.fillRect(3, 12, 1, 1); ctx.fillRect(12, 12, 1, 1);
  },
  robe(ctx, [o, m, h], dir) {
    ctx.fillStyle = m; ctx.fillRect(3, 19, 10, 2);        // 只加一圈下摆
    ctx.fillStyle = o; ctx.fillRect(3, 21, 10, 1);
    if (dir !== 'up') { ctx.fillStyle = h; ctx.fillRect(4, 19, 2, 1); ctx.fillRect(10, 19, 2, 1); }
  },
};

// ---------- 神话装备的专属造型：每件形状都不一样，一眼能认出来 ----------
// 坐标同样是 16×24 逻辑空间；正/背面挂在右侧（x≈13），侧面伸向左前方（x≈0-9）。
const G = ['#5a4a12', '#d4af37', '#ffe9a3'];   // 金
const MYTH_SHAPE = {
  excalibur(ctx, dir) {                         // 发光长剑 + 十字护手
    const [o, m, h] = G;
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(0,14,9,3); ctx.fillStyle=m; ctx.fillRect(0,15,8,1); ctx.fillStyle=h; ctx.fillRect(1,15,5,1);
      ctx.fillStyle=o; ctx.fillRect(8,12,2,7); ctx.fillStyle='#f8f0c0'; ctx.fillRect(9,15,3,2); }
    else { ctx.fillStyle=o; ctx.fillRect(13,10,3,12); ctx.fillStyle=m; ctx.fillRect(14,11,1,10); ctx.fillStyle=h; ctx.fillRect(14,12,1,5);
      ctx.fillStyle=o; ctx.fillRect(12,9,5,2); ctx.fillStyle='#f8f0c0'; ctx.fillRect(14,7,1,2); }
  },
  kusanagi(ctx, dir) {                          // 玉绿直刀，无护手
    const [o, m, h] = ['#12402f', '#3fae7a', '#a9f0cf'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(0,15,10,2); ctx.fillStyle=m; ctx.fillRect(0,15,9,1); ctx.fillStyle=h; ctx.fillRect(2,15,4,1); ctx.fillStyle='#2a2a2a'; ctx.fillRect(10,15,2,2); }
    else { ctx.fillStyle=o; ctx.fillRect(13,10,2,12); ctx.fillStyle=m; ctx.fillRect(13,11,1,10); ctx.fillStyle=h; ctx.fillRect(13,12,1,4); ctx.fillStyle='#2a2a2a'; ctx.fillRect(13,8,2,2); }
  },
  gram(ctx, dir) {                              // 厚背阔剑，刃上有缺口
    const [o, m, h] = ['#33383d', '#93a0aa', '#d8e2ea'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(0,13,9,4); ctx.fillStyle=m; ctx.fillRect(0,14,8,2); ctx.fillStyle=o; ctx.fillRect(3,13,1,1); ctx.fillRect(6,16,1,1); ctx.fillStyle=h; ctx.fillRect(1,14,3,1); }
    else { ctx.fillStyle=o; ctx.fillRect(12,10,4,12); ctx.fillStyle=m; ctx.fillRect(13,11,2,10); ctx.fillStyle=o; ctx.fillRect(12,14,1,1); ctx.fillRect(15,17,1,1); }
  },
  xuanyuan(ctx, dir) {                          // 青铜剑，柄端龙头
    const [o, m, h] = ['#4a3a12', '#b8912f', '#f0d878'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(0,14,9,3); ctx.fillStyle=m; ctx.fillRect(0,15,8,1); ctx.fillStyle=h; ctx.fillRect(9,13,3,4); }
    else { ctx.fillStyle=o; ctx.fillRect(13,11,3,11); ctx.fillStyle=m; ctx.fillRect(14,12,1,9); ctx.fillStyle=h; ctx.fillRect(12,9,5,3); }
  },
  zulfiqar(ctx, dir) {                          // 剑尖分双叉
    const [o, m, h] = ['#3a2a3a', '#a88fb8', '#e6d6f0'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(2,14,8,3); ctx.fillStyle=m; ctx.fillRect(2,15,7,1);
      ctx.fillStyle=o; ctx.fillRect(0,12,3,2); ctx.fillRect(0,17,3,2); ctx.fillStyle=h; ctx.fillRect(3,15,3,1); }
    else { ctx.fillStyle=o; ctx.fillRect(13,12,3,10); ctx.fillStyle=m; ctx.fillRect(14,13,1,8);
      ctx.fillStyle=o; ctx.fillRect(12,9,2,3); ctx.fillRect(15,9,2,3); }
  },
  gungnir(ctx, dir) {                           // 长枪，叶形枪头
    const [o, m, h] = ['#2f3a4a', '#8fa8c8', '#dcecff'];
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle='#5a4028'; ctx.fillRect(x,8,2,14);
    ctx.fillStyle=o; ctx.fillRect(x-1,3,4,6); ctx.fillStyle=m; ctx.fillRect(x,4,2,4); ctx.fillStyle=h; ctx.fillRect(x,5,1,2);
  },
  gaebolg(ctx, dir) {                           // 带倒钩的红枪
    const [o, m, h] = ['#4a1414', '#b0392f', '#f08a72'];
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle='#3a2418'; ctx.fillRect(x,9,2,13);
    ctx.fillStyle=o; ctx.fillRect(x-1,4,4,6); ctx.fillStyle=m; ctx.fillRect(x,5,2,4);
    ctx.fillStyle=o; ctx.fillRect(x-2,7,2,1); ctx.fillRect(x+2,9,2,1); ctx.fillStyle=h; ctx.fillRect(x,5,1,2);
  },
  harpe(ctx, dir) {                             // 弯镰刃
    const [o, m, h] = ['#3a3218', '#b8a038', '#f0e090'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(1,12,7,2); ctx.fillRect(0,13,2,4); ctx.fillStyle=m; ctx.fillRect(2,12,5,1); ctx.fillStyle='#5a4028'; ctx.fillRect(8,13,3,3); }
    else { ctx.fillStyle=o; ctx.fillRect(13,10,3,8); ctx.fillRect(15,10,2,3); ctx.fillStyle=m; ctx.fillRect(14,11,1,6); ctx.fillStyle='#5a4028'; ctx.fillRect(13,18,3,3); }
  },
  ganjiang(ctx, dir) {                          // 一对短剑交叉
    const [o, m] = ['#2a2f3a', '#9aa8c0'];
    if (dir === 'left') { ctx.fillStyle=o; ctx.fillRect(1,13,7,2); ctx.fillRect(1,16,7,2); ctx.fillStyle=m; ctx.fillRect(1,13,6,1); ctx.fillRect(1,16,6,1); }
    else { ctx.fillStyle=o; ctx.fillRect(12,12,2,9); ctx.fillRect(15,12,2,9); ctx.fillStyle=m; ctx.fillRect(12,13,1,7); ctx.fillRect(15,13,1,7); }
  },
  vajra(ctx, dir) {                             // 两端对称的雷杵
    const [o, m, h] = ['#4a3a12', '#d4af37', '#fff3b0'];
    const x = dir === 'left' ? 2 : 13;
    ctx.fillStyle=m; ctx.fillRect(x,13,3,4);
    ctx.fillStyle=o; ctx.fillRect(x-1,10,5,3); ctx.fillRect(x-1,17,5,3);
    ctx.fillStyle=h; ctx.fillRect(x,11,3,1); ctx.fillRect(x,18,3,1);
  },
  nemean_fist(ctx, dir) {                       // 兽爪拳套
    const [o, m, h] = ['#4a3418', '#c08a3a', '#f0c880'];
    const put = x => { ctx.fillStyle=o; ctx.fillRect(x,13,4,4); ctx.fillStyle=m; ctx.fillRect(x,13,3,3);
      ctx.fillStyle=h; ctx.fillRect(x,12,1,1); ctx.fillRect(x+2,12,1,1); };
    if (dir === 'left') put(1); else { put(0); put(12); }
  },
  laevateinn(ctx, dir) {                        // 顶端燃火的杖
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle='#2a2018'; ctx.fillRect(x,9,2,13);
    ctx.fillStyle='#8a2a10'; ctx.fillRect(x-1,4,4,5);
    ctx.fillStyle='#e8632a'; ctx.fillRect(x,5,2,3);
    ctx.fillStyle='#ffd070'; ctx.fillRect(x,5,1,2);
  },
  caduceus(ctx, dir) {                          // 双蛇 + 小翅膀
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle='#b8912f'; ctx.fillRect(x,8,2,14);
    ctx.fillStyle='#f0f0f0'; ctx.fillRect(x-3,5,3,2); ctx.fillRect(x+2,5,3,2);
    ctx.fillStyle='#3fae7a'; ctx.fillRect(x,10,2,1); ctx.fillRect(x,13,2,1);
    ctx.fillStyle='#d4af37'; ctx.fillRect(x,5,2,3);
  },
  was_scepter(ctx, dir) {                       // 兽首权杖，底端分叉
    const x = dir === 'left' ? 2 : 14;
    ctx.fillStyle='#4a3a12'; ctx.fillRect(x,8,2,12);
    ctx.fillStyle='#d4af37'; ctx.fillRect(x-1,4,4,4); ctx.fillStyle='#2a2418'; ctx.fillRect(x+1,5,1,1);
    ctx.fillStyle='#4a3a12'; ctx.fillRect(x-1,20,2,2); ctx.fillRect(x+2,20,2,2);
  },
  // ----- 防具 -----
  aegis(ctx, dir) {                             // 圆盾胸铠，中央一张脸
    ctx.fillStyle='#5a4a12'; ctx.fillRect(4,11,8,7);
    ctx.fillStyle='#d4af37'; ctx.fillRect(5,12,6,5);
    if (dir !== 'up') { ctx.fillStyle='#2a2418'; ctx.fillRect(6,13,1,1); ctx.fillRect(9,13,1,1); ctx.fillRect(7,15,2,1); }
  },
  jade_armor(ctx, dir) {                        // 玉片 + 金线
    ctx.fillStyle='#1f4a3a'; ctx.fillRect(3,11,10,7);
    ctx.fillStyle='#4fae8a'; for (let y=0;y<3;y++) for (let x=0;x<4;x++) ctx.fillRect(4+x*2,12+y*2,1,1);
    ctx.fillStyle='#d4af37'; ctx.fillRect(3,11,10,1); ctx.fillRect(3,17,10,1);
  },
  brynhild(ctx, dir) {                          // 带白羽的肩甲
    ctx.fillStyle='#3a4250'; ctx.fillRect(2,11,4,4); ctx.fillRect(10,11,4,4);
    ctx.fillStyle='#aab8c8'; ctx.fillRect(2,11,3,3); ctx.fillRect(11,11,3,3);
    ctx.fillStyle='#f0f4f8'; ctx.fillRect(1,9,3,2); ctx.fillRect(12,9,3,2);
  },
  hagoromo(ctx, dir) {                          // 飘起来的薄纱
    ctx.fillStyle='#cfe6f0'; ctx.fillRect(2,13,3,7); ctx.fillRect(11,13,3,7);
    ctx.fillStyle='#f4fbff'; ctx.fillRect(2,13,1,6); ctx.fillRect(13,13,1,6);
    if (dir !== 'up') { ctx.fillStyle='#cfe6f0'; ctx.fillRect(4,19,8,1); }
  },
  nemean_hide(ctx, dir) {                       // 狮皮兜帽 + 披风
    ctx.fillStyle='#7a5420'; ctx.fillRect(3,2,10,5);
    ctx.fillStyle='#c08a3a'; ctx.fillRect(4,3,8,3);
    if (dir !== 'up') { ctx.fillStyle='#2a2418'; ctx.fillRect(5,4,1,1); ctx.fillRect(10,4,1,1); }
    ctx.fillStyle='#7a5420'; ctx.fillRect(2,11,2,8); ctx.fillRect(12,11,2,8);
  },
};

export const equipLayers = {};  // equipLayers[`${itemId}_${dir}`] = canvas

export function buildEquipLayers(items) {
  const dirs = ['down', 'up', 'left'];
  for (const [id, it] of Object.entries(items)) {
    if (it.type !== 'weapon' && it.type !== 'armor') continue;
    const special = it.myth && MYTH_SHAPE[it.icon];      // 神话装备有专属造型
    const draw = special || (it.type === 'weapon' ? WEAPON[it.cat] : ARMOR[it.cat]);
    if (!draw) continue;
    const pal = it.myth ? MAT.myth : matOf(id);
    for (const d of dirs) equipLayers[`${id}_${d}`] = layer(ctx => special ? draw(ctx, d) : draw(ctx, pal, d));
    // right 由 left 水平镜像
    const src = equipLayers[`${id}_left`], c = canvas(), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false; ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0);
    equipLayers[`${id}_right`] = c;
  }
  return Object.keys(equipLayers).length;
}

// 取某个角色在某方向上要叠加的装备层（先防具后武器，武器画在最上面）
export function layersFor(member, dir) {
  const out = [];
  for (const slot of ['armor', 'weapon']) {
    const id = member.equipment?.[slot];
    if (!id) continue;
    const l = equipLayers[`${id}_${dir}`];
    if (l) out.push(l);
  }
  return out;
}

// ================= 道具小图标（12×12 逻辑像素，菜单列表用）=================
// FF6 的道具/装备列表每行前面都有一枚小图标，一眼扫得出「这是剑还是药」；
// 我们 87 件道具在列表里长得一模一样，只能一个个读名字——这是人物介面最大的缺口。
//
// 复用上面同一套「形状分类别、材质分档次」的规则，只是把 16×24 的挂件改画成独立小图：
// 12×12 是能同时表达「刃 + 护手 + 柄」三段的最小尺寸（8×8 试过，剑和匕首糊成同一坨）。
// 形状按 cat 出（sword/dagger/knuckle/staff/armor/robe，饰品按 id 推 ring/band/boots/gem），
// 消耗品按 effect 出；颜色一律走上面那张 MAT 表，于是「铁剑→秘银剑」在列表里
// 是同一个形状换一套金属色，和穿在身上那把也对得起来。
// 写法上和 MYTH_SHAPE 一样挤：一行一个部件，形状本身靠注释说明。
export const ICON_SIZE = 12;
const p = (ctx, c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const GRIP = '#5a4028';   // 木/皮握柄，与世界层同一个棕

const ICON_SHAPE = {
  sword(ctx, [o, m, h]) {                       // 竖刃 + 宽护手 = 十字剪影
    p(ctx,o,5,1,2,1); p(ctx,o,4,2,4,6); p(ctx,m,5,2,2,6); p(ctx,h,5,3,1,4);   // 刃（受光在左缘，同一个光源）
    p(ctx,o,2,8,8,2); p(ctx,m,3,8,6,1); p(ctx,GRIP,5,10,2,2); p(ctx,o,4,11,4,1);  // 护手 + 柄 + 柄头
  },
  dagger(ctx, [o, m, h]) {                      // 短刃斜插：靠「斜的」和剑的「竖的」分开，长度差在 12px 上看不出来
    for (let i = 0; i < 4; i++) { p(ctx,o,3+i,6-i,2,2); p(ctx,m,3+i,6-i,1,1); }
    p(ctx,h,6,3,1,1); p(ctx,o,1,7,4,2); p(ctx,m,1,7,4,1); p(ctx,GRIP,1,9,3,2);   // 护手上缘提亮，否则柄是一坨黑
  },
  knuckle(ctx, [o, m, h]) {                     // 指虎：三个指孔用 clearRect 真的挖空（实心方块版被当成箱子）
    for (let k = 0; k < 3; k++) { p(ctx,o,1+k*4,3,3,4); p(ctx,m,1+k*4,3,3,1); ctx.clearRect(2+k*4,4,1,2); }
    p(ctx,o,1,7,10,2); p(ctx,m,2,7,8,1); p(ctx,h,2,7,3,1);
  },
  staff(ctx, [o, m, h]) {                       // 细杖身 + 顶端亮宝石，和剑的「亮在上半段、宽护手在下」正相反
    p(ctx,o,5,5,2,7); p(ctx,m,5,5,1,7); p(ctx,o,4,1,4,4); p(ctx,m,5,2,2,2); p(ctx,h,5,2,1,1);
    for (const [x, y] of [[4,1],[7,1],[4,4],[7,4]]) ctx.clearRect(x,y,1,1);      // 抹掉宝石四角 = 圆一点
  },
  armor(ctx, [o, m, h]) {                       // 宽肩 + 收腰 + 腰带。和法袍是一对反义词（上宽下窄 vs 上窄下宽）
    p(ctx,o,1,2,10,3); p(ctx,m,2,3,8,2); p(ctx,o,5,2,2,3);                      // 肩线（最宽）+ 正中领口
    p(ctx,o,2,5,8,5); p(ctx,m,3,5,6,4); p(ctx,o,3,8,6,1);                       // 胸甲 + 腰带
    p(ctx,h,2,3,1,1); p(ctx,h,9,3,1,1); p(ctx,h,3,5,1,3);
  },
  robe(ctx, [o, m, h]) {                        // 兜帽 + 下摆外张。兜帽内部要留暗，全填满就成了一座山，会和帐篷撞脸
    p(ctx,o,4,1,4,3); p(ctx,m,4,1,4,1); p(ctx,m,4,2,1,2); p(ctx,m,7,2,1,2);
    p(ctx,o,3,4,6,2); p(ctx,m,4,4,4,2); p(ctx,o,2,6,8,5); p(ctx,m,3,6,6,4);
    p(ctx,o,5,6,1,5); p(ctx,h,3,5,1,5);                                         // 前襟 + 左缘受光
  },
  ring(ctx, [o, m, h]) {                        // 宝石 + 环。环心必须真的挖空，深色描边糊出来的「空心」看着就是个实心瓶子
    p(ctx,h,5,1,2,2); p(ctx,o,4,3,4,1); p(ctx,o,3,4,6,7); p(ctx,m,4,5,4,5); p(ctx,h,4,5,2,1);
    ctx.clearRect(4,6,4,3);
    for (const [x, y] of [[3,4],[8,4],[3,10],[8,10]]) ctx.clearRect(x,y,1,1);
  },
  band(ctx, [o, m, h]) {                        // 横带 + 中央护片。带子要伸出护片两侧，不然只剩方块，和拳套/铠甲分不开
    p(ctx,o,0,5,12,3); p(ctx,m,0,5,12,1);
    p(ctx,o,3,3,6,6); p(ctx,m,4,4,4,4); p(ctx,h,4,4,1,4); p(ctx,h,5,5,2,2);
  },
  boots(ctx, [o, m, h]) {                       // L 形剪影
    p(ctx,o,3,2,4,7); p(ctx,m,4,3,2,5); p(ctx,h,4,3,1,4);
    p(ctx,o,3,8,7,3); p(ctx,m,4,9,5,1); p(ctx,o,3,10,7,1);
  },
  gem(ctx, [o, m, h]) {                         // 切面宝石：上宽下尖，和上尖下宽的帐篷正相反，两者不会认错
    p(ctx,o,3,2,6,2); p(ctx,o,2,4,8,1); p(ctx,o,3,5,6,1); p(ctx,o,4,6,4,1); p(ctx,o,5,7,2,2);
    p(ctx,m,4,3,4,1); p(ctx,m,3,4,6,1); p(ctx,m,4,5,4,1); p(ctx,m,5,6,2,1);
    p(ctx,h,4,2,3,1); p(ctx,h,3,4,2,1);
  },
  flask(ctx, [o, m, h]) {                       // 瓶子：药水/符水/万灵药共用，只换液体颜色（和 HP/MP 横条同色）
    p(ctx,o,5,0,2,2); p(ctx,o,4,2,4,2); p(ctx,o,3,4,6,7); p(ctx,m,4,5,4,5); p(ctx,h,4,5,1,3); p(ctx,o,3,10,6,1);
  },
  talisman(ctx, [o, m, h]) {                    // 纸符：长条 + 三道朱砂
    p(ctx,o,3,1,6,10); p(ctx,m,4,2,4,8); p(ctx,h,5,3,2,1); p(ctx,h,5,5,2,1); p(ctx,h,5,7,2,1);
  },
  drop(ctx, [o, m, h]) {                        // 水滴：尖头圆底。画成「细口宽身」就和药水瓶是同一个剪影了
    p(ctx,o,5,1,2,1); p(ctx,o,4,2,4,2); p(ctx,m,5,2,2,2); p(ctx,o,3,4,6,1); p(ctx,m,4,4,4,1);
    p(ctx,o,2,5,8,3); p(ctx,m,3,5,6,3); p(ctx,o,3,8,6,1); p(ctx,m,4,8,4,1); p(ctx,o,4,9,4,1); p(ctx,h,4,5,1,2);
  },
  bell(ctx, [o, m, h]) {                        // 铃 + 铃舌
    p(ctx,o,5,1,2,1); p(ctx,o,4,2,4,2); p(ctx,o,3,4,6,4); p(ctx,m,4,3,4,5); p(ctx,h,4,4,1,3);
    p(ctx,o,2,8,8,1); p(ctx,m,5,9,2,2);
  },
  tent(ctx, [o, m, h]) {                        // 三角 + 门缝
    for (let i = 0; i < 5; i++) { p(ctx,o,5-i,3+i,2+i*2,1); p(ctx,m,6-i,3+i,i*2,1); }
    p(ctx,o,1,8,10,2); p(ctx,m,2,8,8,1); p(ctx,o,5,5,2,4);
  },
};

// 消耗品按 effect 取形状与配色。颜色刻意和别处一致：绿=HP、青=MP、
// 状态药=该状态的标签色（见 game/status.js），玩家不用记第二套对应关系。
const LIQUID = {
  hp:     ['#1e3a24', '#7fbf5a', '#c6f0a0'], mp:    ['#1c3a3a', '#5aa9b8', '#a8e6f0'],
  elixir: ['#4a3a12', '#d4af37', '#ffe9a3'], poison:['#2f1f4a', '#b388ff', '#e0d0ff'],
  blind:  ['#33383d', '#bdbdbd', '#f0f0f0'], sleep: ['#1f3350', '#90caf9', '#d8ecff'],
  revive: ['#5a4a2a', '#e0d8b0', '#b03a2a'], camp:  ['#3a2a18', '#a5763c', '#d8b070'],
};
function consumableIcon(e) {
  if (e.camp) return ['tent', LIQUID.camp];
  if (e.revive) return ['talisman', LIQUID.revive];
  if (e.hp && e.mp) return ['flask', LIQUID.elixir];       // 补运汤：金色，和普通药水一眼分开
  if (e.cure) { const c = e.cure[0]; return c === 'blind' ? ['drop', LIQUID.blind] : c === 'sleep' ? ['bell', LIQUID.sleep] : ['flask', LIQUID.poison]; }
  return e.mp ? ['flask', LIQUID.mp] : ['flask', LIQUID.hp];
}
// 饰品在 items.json 里没有 cat，从 id 认：戒指 / 护腕 / 靴 / 其余当宝物。
// 「力量护腕」这种 id 里也没有材质词，按形状兜一套皮革色，免得全掉进默认的铁灰
const ACC_PAL = { band: MAT.leather, boots: MAT.leather, gem: MAT.crystal };
const accessoryShape = id => /ring|ouroboros/.test(id) ? 'ring' : /band/.test(id) ? 'band' : /boots|sandals/.test(id) ? 'boots' : 'gem';

// 生成好就存着：87 件道具最多 87 张 24×24 画布，比每帧重画便宜太多。
// 用 has() 判存在，画不出来的（未知类别）也记一个 null，不会每帧重试。
const iconCache = new Map();
export function itemIcon(id, item) {
  if (!item) return null;
  if (!iconCache.has(id)) iconCache.set(id, buildIcon(id, item));
  return iconCache.get(id);
}
function buildIcon(id, item) {
  let shape, pal;
  if (item.type === 'consumable') [shape, pal] = consumableIcon(item.effect || {});
  else {
    shape = item.type === 'accessory' ? accessoryShape(id) : item.cat;
    pal = item.myth ? MAT.myth : matOf(id, ACC_PAL[shape]);
  }
  const draw = ICON_SHAPE[shape];
  if (!draw) return null;
  return artCanvas(ICON_SIZE, ICON_SIZE, ctx => {
    draw(ctx, pal);
    // 神话装备右上角点一颗星：金色之外再给一个形状上的记号，
    // 否则「精金剑」（土金色）和「王者之剑」在小图上只差一点色相
    if (item.myth) { const s = '#fff3b0'; p(ctx,s,10,0); p(ctx,s,9,1,3,1); p(ctx,s,10,2); }
  });
}
