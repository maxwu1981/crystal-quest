// 战斗画面的静态部分：背景、敌人名单、队伍状态栏
import { drawText, LINE_H } from '../core/text.js';
import { drawWindow } from '../ui/Window.js';
import { statusTags } from '../game/status.js';

export const PANEL_Y = 152, PANEL_H = 72, LEFT_W = 112;
export const ENEMY_CENTERS = [[48, 62], [100, 82], [48, 114], [100, 132]];
export const PARTY_X = 204, PARTY_Y0 = 44, PARTY_DY = 26;

export function drawBackground(ctx, W) {
  // 褪色的天与地：越靠近地面颜色越被抽干
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_Y);
  g.addColorStop(0, '#232a33'); g.addColorStop(0.6, '#3b4038'); g.addColorStop(1, '#565a48');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, PANEL_Y);
  ctx.fillStyle = '#4a5138'; ctx.fillRect(0, PANEL_Y - 40, W, 40);
  ctx.fillStyle = '#39402c'; ctx.fillRect(0, PANEL_Y - 40, W, 2);
  ctx.fillStyle = 'rgba(200,190,150,0.06)';
  for (let i = 0; i < 5; i++) ctx.fillRect(0, PANEL_Y - 36 + i * 7, W, 1);
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
    const tags = statusTags(p.status);
    const col = !p.alive ? '#6b6858' : scene.current === p ? '#e6c46a' : '#fff';
    drawText(ctx, p.name, x0 + 8, y, { color: col });
    tags.slice(0, 2).forEach((t, k) => drawText(ctx, t.short, x0 + 42 + k * 8, y, { color: t.color })); // 状态标签：毒 眠 盲 护
    drawText(ctx, 'HP', x0 + 60, y, { color: '#8a8468' });
    drawText(ctx, String(p.hp), x0 + 98, y, { align: 'right', color: p.alive && p.hp <= p.maxHp / 4 ? '#c8705a' : col });
    drawText(ctx, 'MP', x0 + 104, y, { color: '#8a8468' });
    drawText(ctx, String(p.mp), x0 + 136, y, { align: 'right', color: col });
    if (scene.mode === 'atb') {
      ctx.fillStyle = '#2a2a4a'; ctx.fillRect(x0 + 8, y + 11, 40, 1);
      ctx.fillStyle = p.atb >= 100 ? '#e6c46a' : '#8fb9a8'; ctx.fillRect(x0 + 8, y + 11, Math.round(40 * p.atb / 100), 1);
    }
  });
}
