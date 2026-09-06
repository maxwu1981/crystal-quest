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

export const equipLayers = {};  // equipLayers[`${itemId}_${dir}`] = canvas

export function buildEquipLayers(items) {
  const dirs = ['down', 'up', 'left'];
  for (const [id, it] of Object.entries(items)) {
    if (it.type !== 'weapon' && it.type !== 'armor') continue;
    const draw = it.type === 'weapon' ? WEAPON[it.cat] : ARMOR[it.cat];
    if (!draw) continue;
    const pal = it.myth ? MAT.myth : matOf(id);
    for (const d of dirs) equipLayers[`${id}_${d}`] = layer(ctx => draw(ctx, pal, d));
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
