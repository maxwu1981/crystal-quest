// 正式美术加载：assets/art/manifest.json（由 tools/gen_art.py 或 tools/import_downloads.py 生成）
// 存在时，用 PNG 覆盖代码生成的精灵与瓦片；缺哪张就保留哪张占位图。
//
// 角色每个方向可以有两帧：
//   characters.warrior.down       站立帧（必需）
//   characters.warrior.down_walk  迈步帧（可选；没有就用站立帧程序化压出一个假动作）
// right 方向由 left 镜像得到。
import { downed } from './sprites.js';
import { ART } from '../core/draw.js';

const VIEWS = ['down', 'up', 'left'];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 把一张图画进新画布，可水平镜像；bob=true 时上身下沉 1 逻辑像素（没有真迈步帧时的退化动画）
function frame(img, { mirror = false, bob = false } = {}) {
  const w = img.width, h = img.height, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (!bob) ctx.drawImage(img, 0, 0);
  else {
    const foot = 4 * ART, dy = ART;
    ctx.drawImage(img, 0, 0, w, h - foot, 0, dy, w, h - foot);
    ctx.drawImage(img, 0, h - foot, w, foot, 0, h - foot, w, foot);
  }
  return c;
}
const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

export const icons = {}; // 神话装备造型：icons[itemIcon] = Image

export async function loadArt(sprites, tiles, base = './assets/art/') {
  let m;
  try { const r = await fetch(base + 'manifest.json', { cache: 'no-store' }); if (!r.ok) return 0; m = await r.json(); } catch { return 0; }
  let n = 0;
  for (const [id, views] of Object.entries(m.characters || {})) {
    const still = {}, walk = {};
    for (const v of VIEWS) {
      if (views[v]) still[v] = await load(base + views[v]);
      if (views[v + '_walk']) walk[v] = await load(base + views[v + '_walk']);
    }
    const base0 = still.down || still.left || still.up;
    if (!base0) continue;
    const pick = v => still[v] || base0;
    for (const [dir, v, mirror] of [['down', 'down', false], ['up', 'up', false], ['left', 'left', false], ['right', 'left', true]]) {
      const s0 = pick(v), s1 = walk[v];
      sprites[`${id}_${dir}_0`] = frame(s0, { mirror });
      // 有真迈步帧就用真的，否则退回程序化的下沉动作
      sprites[`${id}_${dir}_1`] = s1 ? frame(s1, { mirror }) : frame(s0, { mirror, bob: true });
    }
    sprites[`${id}_downed`] = downed(sprites[`${id}_left_0`]); n++;
  }
  for (const [id, file] of Object.entries(m.enemies || {})) { const im = await load(base + file); if (im) { sprites['enemy_' + id] = im; n++; } }
  for (const [id, file] of Object.entries(m.tiles || {})) { const im = await load(base + file); if (im) { tiles[id] = im; n++; } }
  for (const [id, file] of Object.entries(m.icons || {})) { const im = await load(base + file); if (im) { icons[id] = im; n++; } }
  return n;
}
