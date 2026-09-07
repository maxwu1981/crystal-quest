// 转职：选角色 → 选职业（右侧预览属性变化）→ 立即生效。需要标志位 jobUnlocked（记名人给的「记名的碎片」）。
import { Menu } from '../ui/Menu.js';
import { drawWindow, drawDivider, UI, fillWindowBg } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats, changeJob, spellsFor, equipmentAfterJobChange } from '../game/party.js';
import { memberSpells, jobLevel, summonsAtJobLevel } from '../game/jobskill.js';
import { drawPartyPanel, drawSprite, drawTextBlock, stepCursor, PARTY_W, portrait } from './common.js';
import { audio } from '../core/audio.js';
import { key } from '../touch.js';

const LEFT_W = 96;

export class JobScene {
  constructor(game) { this.game = game; this.transparent = true; this.mode = 'member'; this.cursor = 0; this.msg = ''; }
  get member() { return this.game.state.party[this.cursor]; }
  get jobs() { return this.game.data.jobs; }

  openJobs() {
    const ids = Object.keys(this.jobs);
    this.jobMenu = new Menu({
      items: ids.map(id => ({ label: this.jobs[id].name, value: id })), x: 0, y: 0, w: LEFT_W, h: 224,
      onSelect: it => this.pick(it.value), onCancel: () => { this.mode = 'member'; },
    });
    this.jobMenu.cursor = Math.max(0, ids.indexOf(this.member.jobId));
    this.mode = 'job'; this.msg = '';
  }
  pick(jobId) {
    const m = this.member, data = this.game.data;
    if (jobId === m.jobId) { this.msg = '现在就是这个样子'; audio.sfx('buzz'); return; }
    const removed = changeJob(m, jobId, this.game.state.inventory, data);
    audio.sfx('levelup');
    this.msg = `${m.name} 想起了自己也能是${this.jobs[jobId].name}。` + (removed.length ? `\n卸下了 ${removed.map(id => data.items[id].name).join('、')}` : '');
    this.mode = 'member';
  }
  update() {
    const input = this.game.input;
    if (this.mode === 'member') {
      this.cursor = stepCursor(input, this.cursor, this.game.state.party.length);
      if (input.justPressed('confirm')) { audio.sfx('confirm'); this.openJobs(); }
      else if (input.justPressed('cancel')) this.game.scenes.pop();
    } else this.jobMenu.update(input);
  }
  render(ctx) {
    const g = this.game, data = g.data;
    // 两个窗左右相接（队伍面板 + 右侧），接缝处会漏出野外
    fillWindowBg(ctx);
    if (this.mode === 'member') {
      drawPartyPanel(ctx, g, { cursor: this.cursor });
      drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
      drawText(ctx, '转职', PARTY_W + 8, 8, { color: UI.accent });
      drawDivider(ctx, PARTY_W + 8, 8 + LINE_H, 256 - PARTY_W - 16);
      drawText(ctx, '选择角色', PARTY_W + 8, 8 + LINE_H + 6, { color: UI.dim });
      drawTextBlock(ctx, this.msg, PARTY_W + 8, 8 + LINE_H * 3, 64, { color: UI.text });
      return;
    }
    this.jobMenu.render(ctx);
    const m = this.member, id = this.jobMenu.item.value, job = this.jobs[id];
    // 预览必须和 changeJob 走同一套规则：新职业装不了的武器/防具先按卸下算，
    // 否则会拿着现在的装备去算新职业，攻防虚高，转完对不上。
    const { equipment: nextEquip, removed } = equipmentAfterJobChange(m.equipment, id, data);
    const cur = computeStats(m, data), next = computeStats({ ...m, jobId: id, equipment: nextEquip }, data);
    drawWindow(ctx, LEFT_W, 0, 256 - LEFT_W, 224);
    const po = portrait(g, id);
    drawSprite(ctx, po.img, LEFT_W + 8, 8 + po.bob, 48);
    drawText(ctx, `${m.name}  Lv ${m.level}`, LEFT_W + 60, 12, { color: UI.text });
    drawText(ctx, `${this.jobs[m.jobId].name} → ${job.name}`, LEFT_W + 60, 12 + LINE_H, { color: UI.accent });
    // 魔法那一行要算**承接之后**的数，不是新职业自己带的那几条。
    // 写成 spellsFor(新职业) 的话，符仔仙 8 条转童乩会显示「魔法 8 → 0」，
    // 玩家会以为技能全丢了——正好把承接这件事整个藏起来。
    const magicNow = memberSpells(m, data).length;
    const magicNext = new Set([...memberSpells(m, data), ...spellsFor(job, m.level)]).size;
    // 請神只有会请的职业才显示这一行，免得给另外六个职业各挂一个恒为 0 的数字。
    // 转到没练过的职业是 1 级（enterJob），所以预览用 max(1, 已有等级)。
    const canSummon = j => (j.commands || []).includes('summon');
    const summonsOf = (j, id) => canSummon(j) ? summonsAtJobLevel(Math.max(1, jobLevel(m, id)), data).length : 0;
    const rows = [['HP', cur.maxHp, next.maxHp], ['MP', cur.maxMp, next.maxMp], ['攻击', cur.atk, next.atk], ['防御', cur.def, next.def], ['速度', cur.spd, next.spd], ['魔法', magicNow, magicNext]];
    if (canSummon(job) || canSummon(this.jobs[m.jobId]))
      rows.push(['請神', summonsOf(this.jobs[m.jobId], m.jobId), summonsOf(job, id)]);

    // 多出請神这一行就放不下了：最后一行会压到下面「卸下 ○○」那句（188）。
    // 让职业说明少一行来腾——说明是氛围，属性对照是玩家真正要比的东西。
    // 属性对照的**末行位置固定**（173，正好在「卸下 ○○」那句 188 上面留两像素），
    // 多一行就整体往上顶一行，说明相应少画一行并跟着上移。
    const descN = rows.length > 6 ? 2 : 3;
    const rowY0 = 108 - (rows.length - 6) * LINE_H, divY = rowY0 - 6;
    wrapText(ctx, job.desc || '', 256 - LEFT_W - 16).slice(0, descN).forEach((l, i) => drawText(ctx, l, LEFT_W + 8, 64 + i * LINE_H, { color: UI.dim }));
    drawDivider(ctx, LEFT_W + 8, divY, 256 - LEFT_W - 16); // 职业说明与属性对照之间切一刀
    rows.forEach(([k, a, b], i) => {
      const y = rowY0 + i * LINE_H;
      drawText(ctx, k, LEFT_W + 8, y, { color: UI.dim }); drawText(ctx, String(a), LEFT_W + 72, y, { align: 'right', color: UI.dim });
      drawText(ctx, '→', LEFT_W + 80, y, { color: UI.dim }); drawText(ctx, String(b), LEFT_W + 124, y, { align: 'right', color: b > a ? UI.good : b < a ? UI.danger : UI.text });
    });
    // 属性掉得多通常是因为装备被卸了，直接说明白，省得玩家以为数字算错了。
    // 只有一行位置（下面 204 就是操作提示），装备名太长就截断加省略号
    if (removed.length) {
      const ls = wrapText(ctx, `卸下 ${removed.map(r => data.items[r.id].name).join('、')}`, 256 - LEFT_W - 24);
      drawText(ctx, ls[0] + (ls.length > 1 ? '…' : ''), LEFT_W + 8, 188, { color: UI.danger });
    }
    drawText(ctx, `${key('confirm')} 确认   ${key('cancel')} 返回`, 256 - 8, 204, { align: 'right', color: UI.dim });
  }
}
