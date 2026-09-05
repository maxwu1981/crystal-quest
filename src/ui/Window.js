// FF 经典蓝底白框窗口
export function drawWindow(ctx, x, y, w, h) {
  ctx.fillStyle = '#0c1470';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#f8f8f8'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = '#7c86d8'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
}
