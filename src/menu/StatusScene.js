// 状态页：单个角色的完整属性、已学魔法、状态异常，左右切换角色
import { drawWindow, drawDivider, drawGauge, UI } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats, memberSpells } from '../game/party.js';
import { expForLevel } from '../battle/formulas.js';
import { drawSprite, drawRatio, portrait } from './common.js';
import { drawStatusIcons } from './icons.js';
import { itemIcon } from '../assets/equip.js';
import { icons } from '../assets/art.js';
import { key } from '../touch.js';

// 这一页信息最杂，全靠三样东西分层：暗色的标签 vs 亮色的数值、
// 三条刻线切出的四个区块（身份 / 属性 / 装备 / 魔法）、以及和队伍面板一致的横条。
const GX = 106, GW = 78;     // 三条横条（HP / MP / 经验）的左端与长度，对齐成一竖排
const NUM_R = 248;           // 所有数值右对齐到这条线
const SEC = [86, 148, 184];  // 三条分区刻线的 y

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
    const po = portrait(g, m.jobId);
    drawSprite(ctx, po.img, 12, 12 + po.bob, 56);
    drawText(ctx, m.name, 76, 12, { color: UI.accent });                       // 名字是这一页的标题，给暗金
    drawText(ctx, `← → 换人   ${key('cancel')} 返回`, NUM_R, 12, { align: 'right', color: UI.dim }); // 操作提示放页首右上角，把页尾整行让给魔法
    drawText(ctx, `${job.name}  Lv ${m.level}`, 76, 25, { color: UI.dim });
    drawStatusIcons(ctx, m.status, NUM_R, 24, { align: 'right' });   // 图标比「中毒」两个字窄一半，四个也排得下
    const bar = (label, y, cur, max, ratio, color) => {
      drawText(ctx, label, 76, y, { color: UI.dim });
      drawGauge(ctx, GX, y + 5, GW, ratio, color);
      drawRatio(ctx, cur, max, NUM_R, y, UI.text);
    };
    bar('HP', 40, m.hp, s.maxHp, s.maxHp ? m.hp / s.maxHp : 0, m.hp * 4 <= s.maxHp ? UI.danger : UI.good);
    if (s.maxMp > 0) bar('MP', 53, m.mp, s.maxMp, m.mp / s.maxMp, UI.cool);
    else { drawText(ctx, 'MP', 76, 53, { color: UI.dim }); drawText(ctx, '不吃法力', GX, 53, { color: UI.gray }); }
    // 经验也做成同一条横条。右边只报「还需多少」：升级数字本身是几千的长串，
    // 写成 936/1040 会顶到横条上，而且玩家真正想知道的就是还差多少。
    const base = expForLevel(m.level), next = expForLevel(m.level + 1);
    drawText(ctx, '经验', 76, 66, { color: UI.dim });
    drawGauge(ctx, GX, 71, GW, next > base ? (m.exp - base) / (next - base) : 0, UI.accent);
    drawText(ctx, `还需 ${Math.max(0, next - m.exp)}`, NUM_R, 66, { align: 'right', color: UI.dim });

    // ---- 属性 ----
    // 每一项后面挂一个暗色的「下一级 +n」：FF6 的状态页只报当下的数字，
    // 玩家看不出这个角色往哪长。多算一次 computeStats（纯函数、不改状态）就能讲清楚，
    // 于是「符仔仙升级涨智力、家将涨体力」这件事在页面上是看得见的。
    drawDivider(ctx, 12, SEC[0], 232);
    const up = computeStats({ ...m, level: m.level + 1 }, g.data);
    const rows = [[['力量', 'str'], ['敏捷', 'agi'], ['智力', 'int'], ['体力', 'vit']], [['攻击', 'atk'], ['防御', 'def'], ['命中', 'acc'], ['回避', 'eva']]];
    rows.forEach((list, c) => list.forEach(([k, key], i) => {
      const x = 20 + c * 120, y = 92 + i * LINE_H, d = up[key] - s[key];
      drawText(ctx, k, x, y, { color: UI.dim });
      drawText(ctx, String(s[key]), x + 76, y, { align: 'right', color: UI.text });
      if (d > 0) drawText(ctx, `+${d}`, x + 80, y, { color: UI.gray });
    }));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(126, 92, 1, 50); // 两栏之间一道竖缝，数字才不会串行

    // ---- 装备 ----
    drawDivider(ctx, 12, SEC[1], 232);
    // 装备名前面挂一枚 12px 小图标（正式美术优先，没有就用 equip.js 程序化画的），
    // 和道具/装备列表里的是同一枚，三个地方看到的是同一件东西
    const slot = (label, id, x, y) => {
      const it = id ? items[id] : null;
      drawText(ctx, label, x, y, { color: UI.dim });
      if (it) { const ic = (it.icon && icons[it.icon]) || itemIcon(id, it); if (ic) ctx.drawImage(ic, x + 27, y, 12, 12); }
      drawText(ctx, it ? it.name : '—', x + 42, y, { color: it ? (it.myth ? UI.accent : UI.text) : UI.gray }); // 神话装备给暗金
    };
    slot('武器', m.equipment.weapon, 20, 154); slot('防具', m.equipment.armor, 140, 154);
    slot('饰品', m.equipment.accessory, 20, 167);

    // ---- 魔法 ----
    drawDivider(ctx, 12, SEC[2], 232);
    const spells = memberSpells(m, g.data).map(id => g.data.spells[id]?.name || id);
    drawText(ctx, '魔法', 20, 190, { color: UI.dim });
    const ls = wrapText(ctx, spells.length ? spells.join('  ') : '—', 192);
    ls.slice(0, 2).forEach((l, i) => drawText(ctx, l + (i === 1 && ls.length > 2 ? '…' : ''), 56, 190 + i * LINE_H, { color: UI.text }));
  }
}
