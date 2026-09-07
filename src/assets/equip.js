// 装备外观：在角色精灵上叠一层武器 / 防具，走地图和战斗都看得到穿戴效果。
// 文件末尾还有一套 12×12 的道具小图标（菜单列表用），和这里共用材质配色。
//
// 每件装备按「类别 + 材质颜色」程序化画出叠加层（32×48，与角色同尺寸），
// 之后 assets/art/ 里若有 equip_<id>_<dir>.png 就用真图覆盖，接口不变。
import { ART, artCanvas } from '../core/draw.js';

// 材质颜色：暗色描边 / 主色 / 高光。id 前缀取自 data/items.json 的材质命名
// 材质调色板。itemIcon.js 也用这一份——铁就是铁，两边的形状可以不同，颜色不该不同
export const MAT = {
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
// 从 id 前缀猜材质（iron_sword → 铁）。itemIcon.js 也要用——
// 同一件东西在世界层和菜单图标里必须是同一个颜色
export const matOf = (id, fallback = MAT.iron) => {
  for (const k of Object.keys(MAT)) if (id.startsWith(k)) return MAT[k];
  return fallback;
};

function canvas() { const c = document.createElement('canvas'); c.width = 16 * ART; c.height = 24 * ART; return c; }

// 装备挂件画在 16×24 的逻辑框里，但**不能**用 ctx.scale(ART,ART) 然后整数取格——
// 那样每一笔最细就是一整个逻辑像素，ART=6 时是 6×6 的大方块。
// 角色本身已经是 96×144 的精细图，挂件却只有 16×24 格的表现力，
// 结果就是「精细的人身上贴了几个方块」：剑是一根实心条，甲是肩上两个方块。
//
// 改成直接在物理像素空间画，坐标仍用逻辑单位但**可以带小数**：
// R(ctx, 13, 12, 0.5, 9) 就是半个逻辑像素宽的刀刃，ART=6 下是 3 物理像素。
// 这样才画得出刃/脊/护手/柄这些一根条上分不出来的层次。
const U = () => ART;
function R(ctx, x, y, w, h) {
  const u = U();
  ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)));
}
// 一条斜线（刀刃收尖、杖身微斜用）：从 (x0,y0) 到 (x1,y1)，粗细 w 逻辑像素
function RL(ctx, x0, y0, x1, y1, w) {
  const u = U(), n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * u));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round((x0 + (x1 - x0) * t) * u), Math.round((y0 + (y1 - y0) * t) * u),
      Math.max(1, Math.round(w * u)), 1);
  }
}
function layer(fn) {
  const c = canvas(), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fn(ctx);
  return c;
}

// ---------- 武器形状（逻辑坐标，角色约 16 宽 24 高，脚在底部）----------
// dir: down 正面（武器垂在身侧）/ left 侧面（武器伸向前方）/ up 背面（武器背在身后）
// ---------- 武器形状 ----------
// 坐标是 16×24 逻辑空间（角色约 16 宽 24 高，脚在底部，肩在 y≈10-12，手在 y≈15-17），
// 但**可以带小数**——见上面 R()。有小数才画得出「刃比柄细」「刃身有一道脊」这种层次；
// 整数格的年代这些全被压成一根实心条，挂在精细角色身上像贴了块木板。
//
// 摆位原则：正/背面挂在角色右侧并**压住一点身体**（纯画在轮廓外会读成「浮在旁边」），
// 侧面伸向左前方（面朝的那一侧）。
const WEAPON = {
  sword(ctx, [o, m, h], dir) {
    if (dir === 'left') {                                    // 侧面：握在手里、伸向前
      ctx.fillStyle = '#4a3520'; R(ctx, 8.4, 14.6, 1.7, 0.9);   // 柄
      ctx.fillStyle = o;         R(ctx, 10.0, 14.4, 0.7, 1.3);  // 柄头
      ctx.fillStyle = o;         R(ctx, 7.7, 13.3, 0.7, 3.4);   // 护手（竖着一条）
      ctx.fillStyle = o;         R(ctx, 3.2, 14.5, 4.5, 1.1);   // 刃身
      ctx.fillStyle = o;         R(ctx, 1.3, 14.7, 1.9, 0.8);   // 收窄
      ctx.fillStyle = o;         R(ctx, 0.5, 14.9, 0.8, 0.5);   // 尖
      ctx.fillStyle = m;         R(ctx, 1.5, 14.8, 6.0, 0.35);  // 中脊
      ctx.fillStyle = h;         R(ctx, 3.0, 14.8, 3.0, 0.2);   // 高光
    } else if (dir === 'up') {                               // 背面：斜背在背上
      ctx.fillStyle = o;  RL(ctx, 13.5, 9.6, 10.4, 18.2, 0.9);
      ctx.fillStyle = m;  RL(ctx, 13.4, 10.2, 10.6, 17.6, 0.35);
      ctx.fillStyle = o;  R(ctx, 12.9, 9.2, 2.3, 0.6);         // 护手
      ctx.fillStyle = '#4a3520'; R(ctx, 13.6, 7.6, 0.9, 1.7);  // 柄
      ctx.fillStyle = o;  R(ctx, 13.4, 7.0, 1.3, 0.7);         // 柄头
    } else {                                                 // 正面：挂在右腰
      ctx.fillStyle = o;         R(ctx, 12.8, 9.7, 1.3, 0.6);  // 柄头
      ctx.fillStyle = '#4a3520'; R(ctx, 13.1, 10.3, 0.8, 2.2); // 柄
      ctx.fillStyle = o;         R(ctx, 11.8, 12.5, 3.3, 0.7); // 护手
      ctx.fillStyle = o;         R(ctx, 12.9, 13.2, 1.2, 3.3); // 刃（上段）
      ctx.fillStyle = o;         R(ctx, 13.0, 16.5, 1.0, 2.9); // 刃（中段，收窄）
      ctx.fillStyle = o;         R(ctx, 13.2, 19.4, 0.6, 1.5); // 刃（下段）
      ctx.fillStyle = o;         R(ctx, 13.35, 20.9, 0.3, 0.6);// 尖
      ctx.fillStyle = m;         R(ctx, 13.3, 13.3, 0.35, 7.2);// 中脊
      ctx.fillStyle = h;         R(ctx, 13.3, 13.5, 0.2, 3.0); // 高光
    }
  },
  dagger(ctx, [o, m, h], dir) {
    if (dir === 'left') {
      ctx.fillStyle = '#4a3520'; R(ctx, 7.6, 14.9, 1.5, 0.8);
      ctx.fillStyle = o;         R(ctx, 6.9, 14.2, 0.6, 2.2);  // 小护手
      ctx.fillStyle = o;         R(ctx, 3.6, 15.0, 3.3, 0.9);
      ctx.fillStyle = o;         R(ctx, 2.6, 15.2, 1.0, 0.5);  // 尖
      ctx.fillStyle = m;         R(ctx, 3.8, 15.25, 2.9, 0.3);
      ctx.fillStyle = h;         R(ctx, 4.2, 15.25, 1.6, 0.18);
    } else if (dir === 'up') {
      ctx.fillStyle = '#4a3520'; R(ctx, 13.9, 12.4, 0.8, 1.5);
      ctx.fillStyle = o;         R(ctx, 13.4, 13.8, 1.8, 0.5);
      ctx.fillStyle = o;         R(ctx, 13.9, 14.3, 0.8, 3.0);
      ctx.fillStyle = o;         R(ctx, 14.05, 17.3, 0.5, 0.6);
      ctx.fillStyle = m;         R(ctx, 14.15, 14.4, 0.3, 2.8);
    } else {
      ctx.fillStyle = o;         R(ctx, 13.7, 11.9, 1.1, 0.5); // 柄头
      ctx.fillStyle = '#4a3520'; R(ctx, 13.9, 12.4, 0.8, 1.5); // 柄
      ctx.fillStyle = o;         R(ctx, 13.3, 13.8, 2.0, 0.5); // 护手
      ctx.fillStyle = o;         R(ctx, 13.9, 14.3, 0.9, 3.1); // 刃
      ctx.fillStyle = o;         R(ctx, 14.1, 17.4, 0.5, 0.7); // 尖
      ctx.fillStyle = m;         R(ctx, 14.2, 14.4, 0.3, 2.9);
      ctx.fillStyle = h;         R(ctx, 14.2, 14.6, 0.18, 1.3);
    }
  },
  // 拳套：**包住拳头本身**，位置从角色图量出来——阿勇垂着的拳头在
  // x 2.0–3.6（左）与 12.2–13.8（右）、y 15–18。上一版画到 x0.7，整块伸在手臂外面。
  knuckle(ctx, [o, m, h], dir) {
    const fist = x => {
      ctx.fillStyle = o; R(ctx, x, 15.0, 1.8, 1.9);            // 护手本体（正好盖住拳头）
      ctx.fillStyle = m; R(ctx, x + 0.15, 15.2, 1.5, 1.0);     // 受光面
      ctx.fillStyle = o; R(ctx, x + 0.05, 16.9, 1.7, 0.6);     // 腕带
      ctx.fillStyle = h; for (let k = 0; k < 3; k++) R(ctx, x + 0.25 + k * 0.55, 15.35, 0.3, 0.3); // 指节铆钉
    };
    if (dir === 'left') fist(2.2); else { fist(2.0); fist(12.2); }
  },
  // 杖：画在角色**自己那根杖的位置上**（青草婆/符仔仙的美术里本来就握着一根，
  // 画在另一侧就成了第二根杖）。量出来她的杖在 x 2.2–3.4、y 8–22，就压在这里，
  // 于是「换了根更好的杖」；没有自带杖的职业看起来就是左手握着一根，也说得通。
  staff(ctx, [o, m, h], dir) {
    const x = 2.3;
    ctx.fillStyle = '#4a3520'; R(ctx, x, 10.8, 1.0, 11.4);      // 杖身
    ctx.fillStyle = '#6b4d2e'; R(ctx, x + 0.3, 10.8, 0.3, 11.4); // 木纹受光
    ctx.fillStyle = '#3a2a18'; R(ctx, x - 0.1, 14.4, 1.2, 1.7); // 缠绳握把
    // 宝石头压在角色自带杖头（青草婆的木疙瘩在 y9–11）的位置上，不能更高——
    // 高出去就成了一块悬在杖顶上方的方块。
    ctx.fillStyle = o; R(ctx, x - 0.5, 9.2, 2.0, 2.0);
    ctx.fillStyle = m; R(ctx, x - 0.2, 9.5, 1.4, 1.4);
    ctx.fillStyle = h; R(ctx, x, 9.7, 0.6, 0.6);                // 高光
  },
};

// ---------- 防具 ----------
// **位置是从角色图上量出来的，不是估的**：把 boxer_down_0 逐行扫非透明像素，
// 得到 y10 是最窄的一行（x 4–12.2，脖子），y11–13 是肩（x 3–13），
// y13–18 两侧是垂着的手臂（x 2.2–3.5 / 12.5–13.8），y19 以下是腿。
// 上一版凭印象把肩甲画到 x1.9–5.7，比肩膀还宽出去一大截，
// 结果两块横板伸在身体外面，像挑着扁担。
//
// 另一条：**角色美术本身已经画了腰带**，叠加层再加一条就是两条。
// 这里只做「多穿了一层护具」这一个信号——肩甲，其余交给角色图自己。
const ARMOR = {
  armor(ctx, [o, m, h], dir) {
    // 肩甲：上缘贴着肩线、往下收窄，形成一个圆肩的弧。宽度不超过肩宽。
    const pauldron = (x0, x1) => {
      const w = x1 - x0;
      ctx.fillStyle = o; R(ctx, x0,             11.0, w,            0.9);   // 上缘（最宽）
      ctx.fillStyle = o; R(ctx, x0 + w * 0.14,  11.9, w * 0.72,     0.8);   // 中段
      ctx.fillStyle = o; R(ctx, x0 + w * 0.32,  12.7, w * 0.40,     0.5);   // 下缘（最窄）
      ctx.fillStyle = m; R(ctx, x0 + w * 0.12,  11.15, w * 0.6,     0.5);   // 受光
      ctx.fillStyle = h; R(ctx, x0 + w * 0.22,  11.2,  w * 0.28,    0.25);  // 高光一点
    };
    if (dir === 'left') { pauldron(4.6, 7.4); return; }   // 侧面只看得到近身这一侧
    pauldron(3.0, 5.6); pauldron(10.4, 13.0);
    // 锁骨那道护片，只在正面画（背面看不到）
    if (dir === 'down') { ctx.fillStyle = o; R(ctx, 6.6, 11.3, 2.8, 0.5); ctx.fillStyle = m; R(ctx, 6.8, 11.35, 2.4, 0.25); }
  },
  // 长袍：加一条**腰带**，不要动袍子本身。
  //
  // 前后试错两版才想通：先画下摆滚边和前襟——在符仔仙的炭袍上刷出一道亮紫、
  // 把青草婆那圈乳黄扇形裙边盖成灰杠；改成披肩——两块灰褐色块挂在肩上像草编的补丁。
  // 问题不在形状，在**材质色**：袍类的配色（亚麻偏褐、丝绸偏紫）是给图标定的，
  // 盖在已经画好的衣服上，颜色近了看不见、颜色远了像脏。
  //
  // 肩甲之所以成立，是因为金属灰压在红衣上**本来就该是异色**。腰带同理：
  // 它天生就是对比色，而袍类角色腰部（y16–18）恰好是一片素面，不盖任何细节。
  robe(ctx, [o, m, h], dir) {
    const y = 16.1;
    if (dir === 'left') {
      ctx.fillStyle = o; R(ctx, 4.6, y, 4.4, 0.9);
      ctx.fillStyle = m; R(ctx, 4.6, y + 0.15, 4.4, 0.35);
      ctx.fillStyle = o; R(ctx, 5.2, y + 0.9, 0.7, 2.0);          // 侧面：垂下的带尾
      return;
    }
    ctx.fillStyle = o; R(ctx, 4.3, y, 7.4, 0.9);                  // 带身
    ctx.fillStyle = m; R(ctx, 4.3, y + 0.15, 7.4, 0.35);          // 受光
    if (dir === 'down') {
      ctx.fillStyle = h; R(ctx, 7.2, y - 0.15, 1.6, 1.2);         // 正面：带扣
      ctx.fillStyle = o; R(ctx, 7.6, y - 0.05, 0.8, 1.0);
      ctx.fillStyle = o; R(ctx, 5.6, y + 0.9, 0.7, 2.2);          // 垂下的带尾
    } else {
      ctx.fillStyle = o; R(ctx, 7.4, y + 0.9, 1.2, 1.4);          // 背面：结
    }
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
