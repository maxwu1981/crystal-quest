// 菜单里的小图标：状态异常图标，以及「把图标塞进 Menu 每一行行首」的覆盖层。
// 道具/装备图标在 assets/equip.js（那边和角色身上穿戴的造型共用同一套材质配色），
// 这里只放菜单自己需要的东西。
import { artCanvas } from '../core/draw.js';
import { measure, FONT } from '../core/text.js';
import { STATUS } from '../game/status.js';
import { UI } from '../ui/Window.js';

export const ICON = 12;   // 图标边长（逻辑像素）。菜单行高 13，一行正好放得下一枚
const LABEL_X = 9;        // Menu 把标签画在 x+9（前面 9px 留给光标），图标就压在这块空档上
const DARK = '#141a16';   // 图标自带的描边色

// ---------- 状态异常图标 ----------
// FF6 是小图标，我们原本是「中毒」「睡眠」这样的汉字标签：一个标签 24px 宽，
// 队伍面板一行只剩 60px 给状态，两个异常就顶到 HP 上去了。改成 12px 的图标，
// 四个都排得下。颜色沿用 game/status.js 里那一套（毒紫 / 眠蓝 / 盲灰 / 护琥珀），
// 和战斗里的文字标签是同一个色，玩家不用重新记一遍对应关系。
//
// 形状里不能用 clearRect：下面的描边是「同一个形状画五遍」做出来的，
// 挖空会把先画好的那几遍一起挖掉。
const p = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const SHAPE = {
  // 毒：三颗大小不一的气泡往上冒
  poison(ctx, c) {
    p(ctx, c, 3, 6, 5, 4); p(ctx, c, 2, 7, 7, 2);          // 大泡
    p(ctx, c, 7, 3, 3, 3); p(ctx, c, 6, 4, 5, 1);          // 中泡
    p(ctx, c, 4, 2, 2, 2);                                 // 小泡
  },
  // 眠：一个 Z，最不会认错的一个
  sleep(ctx, c) {
    p(ctx, c, 3, 2, 6, 2);
    p(ctx, c, 6, 4, 2, 1); p(ctx, c, 5, 5, 2, 1); p(ctx, c, 4, 6, 2, 1);
    p(ctx, c, 3, 7, 6, 2);
  },
  // 盲：一只眼睛被一道斜杠划掉。斜杠只画在眼睛范围内——
  // 伸出眼眶的那两截会被描边一起加粗，看起来像两块脏点
  blind(ctx, c, d) {
    p(ctx, c, 3, 4, 6, 1); p(ctx, c, 2, 5, 8, 2); p(ctx, c, 3, 7, 6, 1);
    p(ctx, d, 5, 5, 2, 2);                                 // 瞳孔
    p(ctx, d, 3, 6, 2, 1); p(ctx, d, 5, 5, 2, 1); p(ctx, d, 7, 4, 2, 1);
  },
  // 护：一面盾
  protect(ctx, c, d) {
    p(ctx, c, 2, 2, 8, 4); p(ctx, c, 3, 6, 6, 1); p(ctx, c, 4, 7, 4, 1); p(ctx, c, 5, 8, 2, 1);
    p(ctx, d, 5, 3, 2, 3);                                 // 盾面上的一道竖脊
  },
};

const statusCache = new Map();
export function statusIcon(id) {
  if (!statusCache.has(id)) {
    const st = STATUS[id], draw = SHAPE[id];
    statusCache.set(id, !st || !draw ? null : artCanvas(ICON, ICON, ctx => {
      // 先拿暗色把同一个形状上下左右各画一遍 = 一圈 1px 描边。
      // 菜单底是墨绿、战斗里的底色什么都有可能，没有描边的小图标会糊进背景。
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        ctx.save(); ctx.translate(dx, dy); draw(ctx, DARK, DARK); ctx.restore();
      }
      draw(ctx, st.color, DARK);
    }));
  }
  return statusCache.get(id);
}

// 一排状态图标，返回画了几个。buff（防护）排在异常后面：先看坏消息。
// align:'right' 时 x 是右边界——状态数量不定，右对齐才不会把右边的东西顶掉
export function drawStatusIcons(ctx, status, x, y, { step = ICON + 1, align = 'left' } = {}) {
  const ids = Object.keys(status || {}).filter(k => STATUS[k]).sort((a, b) => (STATUS[a].buff ? 1 : 0) - (STATUS[b].buff ? 1 : 0));
  let px = align === 'right' ? x - ids.length * step + (step - ICON) : x;
  for (const id of ids) { const ic = statusIcon(id); if (ic) ctx.drawImage(ic, px, y, ICON, ICON); px += step; }
  return ids.length;
}

// ---------- 属性升降箭头 ----------
// FF6 换装备时用箭头表示这一项变好还是变坏。5×3 的小三角 + 1px 黑影
// （和文字用同一种描边方式，任何底色上都读得出）。
// 只表示方向、不做动画：256×224 上一个会闪的箭头就是噪点。
export function deltaArrow(ctx, x, y, up) {
  const rows = up ? [[2, 0, 1], [1, 1, 3], [0, 2, 5]] : [[0, 0, 5], [1, 1, 3], [2, 2, 1]];
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  for (const [dx, dy, w] of rows) ctx.fillRect(x + dx + 1, y + dy + 1, w, 1);
  ctx.fillStyle = up ? UI.good : UI.danger;
  for (const [dx, dy, w] of rows) ctx.fillRect(x + dx, y + dy, w, 1);
  ctx.restore();
}

// ---------- 把图标画进 Menu 的行首 ----------
// src/ui/Menu.js 不归我改，没法往里加图标支持，于是在外面把行列位置重算一遍。
// 必须在 menu.render(ctx) 之后调用：scroll 是在 render 里才更新的。
export function drawMenuIcons(ctx, menu, iconOf) {
  const colW = Math.floor((menu.w - menu.pad * 2) / menu.cols);
  const visible = Math.max(1, Math.floor((menu.h - menu.pad * 2) / menu.rowH));
  menu.items.forEach((it, i) => {
    const row = Math.floor(i / menu.cols) - menu.scroll;
    if (row < 0 || row >= visible) return;
    const ic = iconOf(it);
    if (!ic) return;
    const x = menu.x + menu.pad + (i % menu.cols) * colW + LABEL_X + (it.iconDX || 0);
    const y = menu.y + menu.pad + row * menu.rowH;
    ctx.save();
    if (it.disabled) ctx.globalAlpha = 0.4;   // 用不了的道具连图标一起压暗，和灰掉的文字一致
    ctx.drawImage(ic, x, y, ICON, ICON);
    ctx.restore();
  });
}

// 图标要占掉标签左边 ICON 像素的位置，而 Menu 只认字符串标签，
// 所以用「量出来够宽的一串空格」把文字推开。不能写死几个空格：
// 像素字体和系统字体的空格宽度不一样，写死的话总有一种字体会压到图标上。
let gapFont = null, gapStr = ' ', scratch = null;
export function iconGap() {
  if (gapFont !== FONT) {                       // 字体可能在开机时才从系统字换成像素字，所以按字体缓存
    gapFont = FONT; gapStr = ' ';
    while (textW(gapStr) < ICON + 2 && gapStr.length < 16) gapStr += ' ';
  }
  return gapStr;
}
// 一段文字有多宽。构建菜单时手上没有真正的 ctx，拿一张离屏的量
export function textW(s) {
  scratch ||= document.createElement('canvas').getContext('2d');
  return measure(scratch, s);
}
