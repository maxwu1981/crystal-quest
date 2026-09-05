// 美术绘制：所有精灵/瓦片的物理像素是逻辑尺寸的 ART 倍，画的时候统一除回去。
// 这样 UI 代码继续用 256×224 逻辑坐标，而美术精度可以随 ART 提升。
// 美术精度倍率：逻辑坐标仍是 256×224（UI 代码不用改），画布物理像素是它的 ART 倍。
// 瓦片 16→32px、角色 16×24→32×48px。想再细化只需调大 ART 并重新生成美术。
export const ART = 2;
export const LOGICAL_W = 256, LOGICAL_H = 224;

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
