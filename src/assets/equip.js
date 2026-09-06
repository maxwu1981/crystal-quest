// 装备外观：在角色精灵上叠一层武器 / 防具，走地图和战斗都看得到穿戴效果。
//
// 每件装备按「类别 + 材质颜色」程序化画出叠加层（32×48，与角色同尺寸），
// 之后 assets/art/ 里若有 equip_<id>_<dir>.png 就用真图覆盖，接口不变。
import { ART } from '../core/draw.js';

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
  myth:    ['#5a4a12', '#d4af37', '#ffe9a3'],   // 神话装备统一走金色
};
const matOf = id => {
  for (const k of Object.keys(MAT)) if (id.startsWith(k)) return MAT[k];
  return MAT.iron;
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
