// 战斗画面的静态部分：背景、敌人名单、队伍状态栏
import { drawText, LINE_H } from '../core/text.js';
import { drawWindow } from '../ui/Window.js';

export const PANEL_Y = 152, PANEL_H = 72, LEFT_W = 112;
export const ENEMY_CENTERS = [[48, 62], [100, 82], [48, 114], [100, 132]];
export const PARTY_X = 204, PARTY_Y0 = 44, PARTY_DY = 26;

export function drawBackground(ctx, W) {
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_Y);
  g.addColorStop(0, '#1a2a6c'); g.addColorStop(1, '#4a6fb0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, PANEL_Y);
  ctx.fillStyle = '#3d7a3a'; ctx.fillRect(0, PANEL_Y - 40, W, 40);
  ctx.fillStyle = '#2f5f2c'; ctx.fillRect(0, PANEL_Y - 40, W, 2);
}

export function drawPanels(ctx, W) {
  drawWindow(ctx, 0, PANEL_Y, LEFT_W, PANEL_H);
  drawWindow(ctx, LEFT_W, PANEL_Y, W - LEFT_W, PANEL_H);
}

export function drawEnemyList(ctx, scene) {
  const groups = new Map();
  for (const e of scene.alive(scene.enemies)) { const n = scene.game.data.enemies[e.enemyId].name; groups.set(n, (groups.get(n) || 0) + 1); }
  let i = 0;
  for (const [n, c] of groups) {
    const y = PANEL_Y + 8 + i++ * LINE_H;
    drawText(ctx, n, 8, y);
    if (c > 1) drawText(ctx, `×${c}`, LEFT_W - 8, y, { align: 'right' });
  }
}

export function drawPartyStatus(ctx, scene) {
  const x0 = LEFT_W;
  scene.party.forEach((p, i) => {
    const y = PANEL_Y + 8 + i * LINE_H;
    const col = !p.alive ? '#8a8a9a' : scene.current === p ? '#ffe66d' : '#fff';
    drawText(ctx, p.name, x0 + 8, y, { color: col });
    drawText(ctx, 'HP', x0 + 56, y, { color: '#9aa4d8' });
    drawText(ctx, String(p.hp), x0 + 96, y, { align: 'right', color: p.alive && p.hp <= p.maxHp / 4 ? '#ff8a80' : col });
    drawText(ctx, 'MP', x0 + 102, y, { color: '#9aa4d8' });
    drawText(ctx, String(p.mp), x0 + 136, y, { align: 'right', color: col });
    if (scene.mode === 'atb') {
      ctx.fillStyle = '#2a2a4a'; ctx.fillRect(x0 + 8, y + 11, 40, 1);
      ctx.fillStyle = p.atb >= 100 ? '#ffe66d' : '#7cc4ff'; ctx.fillRect(x0 + 8, y + 11, Math.round(40 * p.atb / 100), 1);
    }
  });
}
