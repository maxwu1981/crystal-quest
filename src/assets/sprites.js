// 占位像素图：人物由代码绘制（4 职业 × 4 方向 × 2 帧），敌人用文字网格像素画。
// 换正式素材时只需让 buildSprites() 返回同名 canvas/Image 即可。
import { ENEMY_ART } from './enemyArt.js';

const DIRS = ['down', 'up', 'left', 'right'];

// 各职业调色板：o 轮廓 s 皮肤 h 头发 c 衣服 d 衣服暗色 b 靴子 e 眼睛
const PALETTES = {
  warrior:   { o: '#1b1b2f', s: '#f1c27d', h: '#e9c46a', c: '#d62828', d: '#7a1f1f', b: '#4a2e1a', e: '#1b1b2f' },
  thief:     { o: '#1b1b2f', s: '#f1c27d', h: '#f4a261', c: '#2a9d8f', d: '#1b6b62', b: '#4a2e1a', e: '#1b1b2f' },
  whitemage: { o: '#1b1b2f', s: '#f1c27d', h: '#f8f8f8', c: '#f8f8f8', d: '#d62828', b: '#8a5a3a', e: '#1b1b2f', hood: true },
  blackmage: { o: '#1b1b2f', s: '#1b1b2f', h: '#1d3557', c: '#1d3557', d: '#0f1e33', b: '#4a2e1a', e: '#ffd54f', hat: true },
};

// 村民调色板（缺省项沿用 warrior 的轮廓/皮肤/眼睛）
const NPC_PALETTES = {
  elder:     { h: '#e0e0e0', c: '#8d6e63', d: '#5d4037' },
  woman:     { h: '#6d4c41', c: '#f06292', d: '#ad1457' },
  man:       { h: '#263238', c: '#42a5f5', d: '#1565c0' },
  kid:       { h: '#ffca28', c: '#66bb6a', d: '#2e7d32' },
  merchant:  { h: '#6d4c41', c: '#26a69a', d: '#00695c', hat: true, s: '#f1c27d', e: '#1b1b2f' },
  innkeeper: { h: '#8d6e63', c: '#fafafa', d: '#c62828' },
  guard:     { h: '#455a64', c: '#90a4ae', d: '#546e7a' },
  knight:    { h: '#263238', c: '#212121', d: '#000000', s: '#1b1b2f', e: '#e53935', b: '#000000' },
};
const BASE = { o: '#1b1b2f', s: '#f1c27d', e: '#1b1b2f', b: '#4a2e1a' };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function drawHumanoid(ctx, p, dir, frame) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // 头
  R(3, 1, 10, 7, p.o);
  R(4, 2, 8, 5, p.h);
  if (dir === 'down') {
    R(4, 4, 8, 3, p.s); R(4, 4, 1, 1, p.h); R(11, 4, 1, 1, p.h);
    R(5, 5, 1, 1, p.e); R(10, 5, 1, 1, p.e);
  } else if (dir === 'left') {
    R(4, 4, 5, 3, p.s); R(5, 5, 1, 1, p.e);
  }
  if (p.hat) { R(2, 2, 12, 1, p.o); R(3, 1, 10, 1, p.c); R(5, 0, 6, 1, p.c); R(2, 3, 12, 1, p.c); }
  if (p.hood) { R(3, 1, 10, 2, p.d); }
  // 身体
  R(3, 8, 10, 5, p.o);
  R(4, 8, 8, 4, p.c);
  R(4, 11, 8, 1, p.d);
  if (dir === 'down' || dir === 'up') { R(3, 9, 1, 2, p.s); R(12, 9, 1, 2, p.s); }
  else R(6, 10, 2, 2, p.s);
  // 脚（走路交替）
  if (dir === 'left') { if (frame) { R(4, 13, 3, 3, p.b); R(8, 13, 3, 2, p.b); } else { R(5, 13, 3, 2, p.b); R(8, 13, 3, 3, p.b); } }
  else if (frame) { R(4, 13, 3, 2, p.b); R(9, 13, 3, 3, p.b); }
  else { R(4, 13, 3, 3, p.b); R(9, 13, 3, 2, p.b); }
}

function humanoid(p, dir, frame) {
  const c = canvas(16, 16), ctx = c.getContext('2d');
  if (dir === 'right') { ctx.translate(16, 0); ctx.scale(-1, 1); drawHumanoid(ctx, p, 'left', frame); }
  else drawHumanoid(ctx, p, dir, frame);
  return c;
}

// 倒地：躺倒 + 变灰（任意尺寸：w×h 的图旋转后是 h×w）
export function downed(src) {
  const w = src.width, h = src.height, c = canvas(h, w), ctx = c.getContext('2d');
  ctx.translate(h / 2, w / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(src, -w / 2, -h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(90,90,110,0.65)'; ctx.fillRect(0, 0, h, w);
  return c;
}

export function spriteFromRows(rows, palette, name = '?') {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  rows.forEach((r, i) => { if (r.length !== w) console.warn(`精灵 ${name} 第 ${i} 行长度 ${r.length} ≠ ${w}`); });
  const c = canvas(w, h), ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x]; if (ch === '.' || ch === ' ') continue;
    const col = palette[ch]; if (!col) { console.warn(`精灵 ${name} 未知颜色字符 '${ch}'`); continue; }
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

export function buildSprites() {
  const S = {};
  for (const [id, pal] of Object.entries({ ...PALETTES, ...NPC_PALETTES })) {
    const p = { ...BASE, ...pal };
    for (const d of DIRS) for (const f of [0, 1]) S[`${id}_${d}_${f}`] = humanoid(p, d, f);
    S[`${id}_downed`] = downed(S[`${id}_left_0`]);
  }
  for (const [id, art] of Object.entries(ENEMY_ART)) S[`enemy_${id}`] = spriteFromRows(art.rows, art.palette, id);
  return S;
}
