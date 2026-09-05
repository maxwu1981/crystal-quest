// 正式美术加载：assets/art/manifest.json（由 tools/gen_art.py 生成）存在时，用 PNG 覆盖代码生成的精灵与瓦片。
// 没有清单或某张图缺失 → 保留占位图。角色 PNG 只需 down/up/left 三张（right 由 left 镜像，行走帧由压缩得到）。
import { downed } from './sprites.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function frame(img, f, mirror = false) {
  const w = img.width, h = img.height, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (f === 0) ctx.drawImage(img, 0, 0);
  else { ctx.drawImage(img, 0, 0, w, h - 4, 0, 1, w, h - 4); ctx.drawImage(img, 0, h - 4, w, 4, 0, h - 4, w, 4); } // 走路帧：上身下沉 1px
  return c;
}
const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

export async function loadArt(sprites, tiles, base = './assets/art/') {
  let m;
  try { const r = await fetch(base + 'manifest.json', { cache: 'no-store' }); if (!r.ok) return 0; m = await r.json(); } catch { return 0; }
  let n = 0;
  for (const [id, views] of Object.entries(m.characters || {})) {
    const img = {};
    for (const v of ['down', 'up', 'left']) if (views[v]) img[v] = await load(base + views[v]);
    const down = img.down || img.left || img.up; if (!down) continue;
    const left = img.left || down, up = img.up || down;
    for (const [dir, src, mirror] of [['down', down], ['up', up], ['left', left], ['right', left, true]]) {
      sprites[`${id}_${dir}_0`] = frame(src, 0, mirror); sprites[`${id}_${dir}_1`] = frame(src, 1, mirror);
    }
    sprites[`${id}_downed`] = downed(sprites[`${id}_left_0`]); n++;
  }
  for (const [id, file] of Object.entries(m.enemies || {})) { const im = await load(base + file); if (im) { sprites['enemy_' + id] = im; n++; } }
  for (const [id, file] of Object.entries(m.tiles || {})) { const im = await load(base + file); if (im) { tiles[id] = im; n++; } }
  return n;
}
