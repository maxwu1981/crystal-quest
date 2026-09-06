// 窗口样式：褪色墨绿底 + 暗铜外框 + 米色内线，四角有小刻痕。
// 「余响」的界面基调是旧纸与铜锈，不是亮蓝色玻璃。
export const UI = {
  text:   '#e8e2cc', // 主文字（米白）
  dim:    '#8a8468', // 次要文字
  accent: '#e6c46a', // 高亮（暗金）
  danger: '#c8705a', // 危险
  good:   '#9ecf7a', // 恢复
  cool:   '#8fb9a8', // 余响 / 冷色数值
  gray:   '#6b6858', // 禁用 / 倒下
};

export function drawWindow(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#16241f'); g.addColorStop(1, '#0b1310');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#6b5637'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = '#b8ad86'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  ctx.fillStyle = '#d8cfa8';
  for (const [cx, cy] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]])
    ctx.fillRect(cx, cy, 1, 1);
}
