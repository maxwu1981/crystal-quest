// 菜单共用绘制：队伍面板、信息面板、光标步进
import { drawWindow } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { drawCursor } from '../ui/Menu.js';
import { computeStats } from '../game/party.js';
import { statusTags } from '../game/status.js';
import { artW, artH } from '../core/draw.js';

export const PARTY_W = 176, ROW_H = 52; // 行高要放得下 48 高的角色图，否则会显得被切掉

// 按整数倍放大画精灵（逻辑尺寸），高度不超过 maxH，底部对齐在 y + maxH
export function drawSprite(ctx, img, x, y, maxH) {
  const iw = artW(img), ih = artH(img);
  const s = Math.max(1, Math.floor(maxH / ih)), w = iw * s, h = ih * s;
  ctx.drawImage(img, Math.round(x + (maxH - w) / 2), Math.round(y + maxH - h), w, h);
}

export function drawPartyPanel(ctx, game, { x = 0, y = 0, w = PARTY_W, h = 224, cursor = -1 } = {}) {
  drawWindow(ctx, x, y, w, h);
  game.state.party.forEach((m, i) => {
    const s = computeStats(m, game.data), job = game.data.jobs[m.jobId];
    const ry = y + 8 + i * ROW_H, dead = m.hp <= 0;
    drawSprite(ctx, game.sprites[`${m.jobId}_down_0`], x + 6, ry, 48);   // 完整一格，不再被下一行挤掉
    const tx = x + 46, ty = ry + 4;                                       // 文字整体在图右侧、垂直居中
    const col = dead ? '#6b6858' : '#fff';
    if (cursor === i) drawCursor(ctx, x + 1, ry + 20);
    drawText(ctx, `${m.name}  ${job.name}`, tx, ty, { color: col });
    drawText(ctx, `Lv ${m.level}`, tx, ty + LINE_H, { color: col });
    statusTags(m.status).forEach((t, k) => drawText(ctx, t.name, tx + 46 + k * 28, ty + LINE_H, { color: t.color }));
    drawText(ctx, dead ? '失去声音' : `HP ${m.hp}/${s.maxHp}  MP ${m.mp}/${s.maxMp}`, tx, ty + LINE_H * 2,
      { color: !dead && m.hp <= s.maxHp / 4 ? '#c8705a' : col });
  });
}

export function drawInfoPanel(ctx, game, x, y, w, h) {
  drawWindow(ctx, x, y, w, h);
  const st = game.state, t = Math.floor(st.playTime || 0);
  const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  [['金币', `${st.gold} G`], ['步数', String(st.steps)], ['时间', time]].forEach(([k, v], i) => {
    drawText(ctx, k, x + 8, y + 8 + i * LINE_H, { color: '#8a8468' });
    drawText(ctx, v, x + w - 8, y + 8 + i * LINE_H, { align: 'right' });
  });
}

export function drawTextBlock(ctx, text, x, y, w) {
  wrapText(ctx, text, w).forEach((l, i) => drawText(ctx, l, x, y + i * LINE_H));
}

export function stepCursor(input, idx, n) {
  if (n <= 0) return 0;
  if (input.repeatPressed('up')) idx = (idx + n - 1) % n;
  else if (input.repeatPressed('down')) idx = (idx + 1) % n;
  return idx;
}
