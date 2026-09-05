// 状态页：单个角色的完整属性，左右切换角色
import { drawWindow } from '../ui/Window.js';
import { drawText, LINE_H } from '../core/text.js';
import { computeStats } from '../game/party.js';
import { expForLevel } from '../battle/formulas.js';
import { drawSprite } from './common.js';

export class StatusScene {
  constructor(game) { this.game = game; this.transparent = true; this.idx = 0; }
  update() {
    const input = this.game.input, n = this.game.state.party.length;
    if (input.repeatPressed('left') || input.repeatPressed('up')) this.idx = (this.idx + n - 1) % n;
    else if (input.repeatPressed('right') || input.repeatPressed('down')) this.idx = (this.idx + 1) % n;
    if (input.justPressed('cancel') || input.justPressed('confirm')) this.game.scenes.pop();
  }
  render(ctx) {
    const g = this.game, m = g.state.party[this.idx], s = computeStats(m, g.data), job = g.data.jobs[m.jobId], items = g.data.items;
    drawWindow(ctx, 0, 0, 256, 224);
    drawSprite(ctx, g.sprites[`${m.jobId}_down_0`], 12, 12, 56);
    drawText(ctx, `${m.name}`, 76, 16); drawText(ctx, `${job.name}  Lv ${m.level}`, 76, 16 + LINE_H, { color: '#9aa4d8' });
    drawText(ctx, `HP ${m.hp}/${s.maxHp}   MP ${m.mp}/${s.maxMp}`, 76, 16 + LINE_H * 2);
    drawText(ctx, `经验 ${m.exp}   升级还需 ${Math.max(0, expForLevel(m.level + 1) - m.exp)}`, 76, 16 + LINE_H * 3, { color: '#9aa4d8' });
    const left = [['力量', s.str], ['敏捷', s.agi], ['智力', s.int], ['体力', s.vit]];
    const right = [['攻击', s.atk], ['防御', s.def], ['命中', s.acc], ['回避', s.eva]];
    const row = (x, list) => list.forEach(([k, v], i) => { drawText(ctx, k, x, 84 + i * LINE_H, { color: '#9aa4d8' }); drawText(ctx, String(v), x + 60, 84 + i * LINE_H, { align: 'right' }); });
    row(24, left); row(140, right);
    const eq = id => id ? items[id].name : '—';
    drawText(ctx, `武器  ${eq(m.equipment.weapon)}`, 24, 148); drawText(ctx, `防具  ${eq(m.equipment.armor)}`, 140, 148);
    drawText(ctx, '← →  切换角色      X  返回', 128, 200, { align: 'center', color: '#9aa4d8' });
  }
}
