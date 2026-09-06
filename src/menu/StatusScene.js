// 状态页：单个角色的完整属性、已学魔法、状态异常，左右切换角色
import { drawWindow, drawDivider, drawGauge, UI } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats, memberSpells } from '../game/party.js';
import { expForLevel } from '../battle/formulas.js';
import { drawSprite, drawRatio } from './common.js';
import { statusTags } from '../game/status.js';

// 这一页信息最杂，全靠三样东西分层：暗色的标签 vs 亮色的数值、
// 三条刻线切出的四个区块（身份 / 属性 / 装备 / 魔法）、以及和队伍面板一致的横条。
const GX = 96, GW = 96;      // 三条横条（HP / MP / 经验）的左端与长度，对齐成一竖排
const NUM_R = 248;           // 所有「当前/上限」右对齐到这条线
const SEC = [84, 146, 180];  // 三条分区刻线的 y

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

    // ---- 身份 ----
    drawSprite(ctx, g.sprites[`${m.jobId}_down_0`], 12, 12, 56);
    drawText(ctx, m.name, 76, 12, { color: UI.accent });                       // 名字是这一页的标题，给暗金
    drawText(ctx, '← → 换人   X 返回', NUM_R, 12, { align: 'right', color: UI.dim }); // 操作提示放页首右上角，把页尾整行让给魔法
    drawText(ctx, `${job.name}  Lv ${m.level}`, 76, 25, { color: UI.dim });
    statusTags(m.status).forEach((t, k) => drawText(ctx, t.name, NUM_R - k * 30, 25, { align: 'right', color: t.color }));
    const bar = (label, y, cur, max, ratio, color) => {
      drawText(ctx, label, 76, y, { color: UI.dim });
      drawGauge(ctx, GX, y + 5, GW, ratio, color);
      drawRatio(ctx, cur, max, NUM_R, y, UI.text);
    };
    bar('HP', 40, m.hp, s.maxHp, s.maxHp ? m.hp / s.maxHp : 0, m.hp * 4 <= s.maxHp ? UI.danger : UI.good);
    if (s.maxMp > 0) bar('MP', 53, m.mp, s.maxMp, m.mp / s.maxMp, UI.cool);
    else { drawText(ctx, 'MP', 76, 53, { color: UI.dim }); drawText(ctx, '这一门功夫不吃法力', GX, 53, { color: UI.gray }); }
    // 经验也做成同一条横条：升到下一级还剩多少，看长度比读「还需 104」快
    const base = expForLevel(m.level), next = expForLevel(m.level + 1);
    bar('经验', 66, m.exp, next, next > base ? (m.exp - base) / (next - base) : 0, UI.accent);

    // ---- 属性 ----
    drawDivider(ctx, 12, SEC[0], 232);
    const rows = [[['力量', s.str], ['敏捷', s.agi], ['智力', s.int], ['体力', s.vit]], [['攻击', s.atk], ['防御', s.def], ['命中', s.acc], ['回避', s.eva]]];
    rows.forEach((list, c) => list.forEach(([k, v], i) => {
      const x = 20 + c * 120, y = 90 + i * LINE_H;
      drawText(ctx, k, x, y, { color: UI.dim });
      drawText(ctx, String(v), x + 84, y, { align: 'right', color: UI.text });
    }));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(126, 90, 1, 50); // 两栏之间一道竖缝，数字才不会串行

    // ---- 装备 ----
    drawDivider(ctx, 12, SEC[1], 232);
    const eq = id => id ? items[id].name : '—';
    const slot = (label, id, x, y) => {
      drawText(ctx, label, x, y, { color: UI.dim });
      drawText(ctx, eq(id), x + 36, y, { color: id ? (items[id].myth ? UI.accent : UI.text) : UI.gray }); // 神话装备给暗金
    };
    slot('武器', m.equipment.weapon, 20, 152); slot('防具', m.equipment.armor, 140, 152);
    slot('饰品', m.equipment.accessory, 20, 165);

    // ---- 魔法 ----
    drawDivider(ctx, 12, SEC[2], 232);
    const spells = memberSpells(m, g.data).map(id => g.data.spells[id]?.name || id);
    drawText(ctx, '魔法', 20, 186, { color: UI.dim });
    const ls = wrapText(ctx, spells.length ? spells.join('  ') : '—', 192);
    ls.slice(0, 2).forEach((l, i) => drawText(ctx, l + (i === 1 && ls.length > 2 ? '…' : ''), 56, 186 + i * LINE_H, { color: UI.text }));
  }
}
