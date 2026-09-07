// 道具图标：**菜单列表里**每一行左边那个 12×12 的小图。
//
// 跟 equip.js 是两件事，所以拆开：那边画的是「穿在身上看得见的样子」——
// 逻辑坐标、16×24 的角色画布、四个方向各一张、要跟精灵的肩线手位对得上；
// 这边画的是「列表里认得出是什么」——12×12 的方格、没有方向、
// 只求一眼分得清剑和杖、药水和解毒剂。同一件装备两边的形状本来就不一样，
// 硬放在一个档里，改图标时会不小心动到世界层的坐标。
//
// 调色板 MAT 仍从 equip.js 取——材质是同一套（铁就是铁），只有形状分家。

import { artCanvas } from '../core/draw.js';
import { MAT, matOf } from './equip.js';

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
