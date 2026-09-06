// 美术绘制：所有精灵/瓦片的物理像素是逻辑尺寸的 ART 倍，画的时候统一除回去。
// 这样 UI 代码继续用 256×224 逻辑坐标，而美术精度可以随 ART 提升。
// 美术精度倍率：逻辑坐标仍是 256×224（UI 代码不用改），画布物理像素是它的 ART 倍。
// 瓦片 16→32px、角色 16×24→32×48px。想再细化只需调大 ART 并重新生成美术。
export const ART = 6;
export const LOGICAL_W = 256, LOGICAL_H = 224;

// 把一个逻辑坐标对齐到**物理**像素网格。
//
// 程序化特效原本一律 `Math.round(x)`，那是对齐到**逻辑**网格——等于强行让粒子
// 每次至少移动 ART 个物理像素。ART=2 时一步 2px 还看得过去，提到 6 之后
// 一步就是 6px，火星和毒气变成一格一格往上蹦，而旁边的美术精度已经是原来的六倍，
// 一眼就看出特效比画面粗。
//
// 对齐到物理网格能同时要两头：边缘仍然是硬的（像素画不能有半透明的毛边），
// 但运动的最小步长变成 1 个物理像素，跟着 ART 一起变细。
export const snap = v => Math.round(v * ART) / ART;

export const artW = img => img.width / ART;
export const artH = img => img.height / ART;

// 按逻辑坐标画一张美术图（左上角对齐）
export function drawArt(ctx, img, x, y) {
  ctx.drawImage(img, x, y, img.width / ART, img.height / ART);
}
// 指定逻辑宽高（缩放绘制，用于菜单里的头像）
export function drawArtSized(ctx, img, x, y, w, h) { ctx.drawImage(img, x, y, w, h); }

// 生成一张 ART 倍分辨率的离屏画布，回调里仍用逻辑坐标绘制
export function artCanvas(logicalW, logicalH, fn) {
  const c = document.createElement('canvas');
  c.width = logicalW * ART; c.height = logicalH * ART;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(ART, ART);
  fn(ctx);
  return c;
}

// 受击闪白/闪红：把整张精灵染成一个纯色的版本，缓存起来。
// 用它代替「隔帧不画」的老做法——那等于每秒让人消失 15 次，是频闪不是打击感。
const tintCache = new WeakMap();
export function tintedSprite(img, color) {
  let per = tintCache.get(img);
  if (!per) tintCache.set(img, per = new Map());
  let c = per.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';   // 只染精灵本身，不染透明背景
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    per.set(color, c);
  }
  return c;
}
