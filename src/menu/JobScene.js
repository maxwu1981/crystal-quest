// 转职：选角色 → 选职业（右侧预览属性变化）→ 立即生效。需要标志位 jobUnlocked（记名人给的「记名的碎片」）。
import { Menu } from '../ui/Menu.js';
import { drawWindow, drawDivider, UI, fillWindowBg } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats, changeJob, spellsFor, equipmentAfterJobChange } from '../game/party.js';
import { drawPartyPanel, drawSprite, drawTextBlock, stepCursor, PARTY_W, portrait } from './common.js';
import { audio } from '../core/audio.js';

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
    wrapText(ctx, job.desc || '', 256 - LEFT_W - 16).slice(0, 3).forEach((l, i) => drawText(ctx, l, LEFT_W + 8, 64 + i * LINE_H, { color: UI.dim }));
    drawDivider(ctx, LEFT_W + 8, 102, 256 - LEFT_W - 16); // 职业说明与属性对照之间切一刀
    const rows = [['HP', cur.maxHp, next.maxHp], ['MP', cur.maxMp, next.maxMp], ['攻击', cur.atk, next.atk], ['防御', cur.def, next.def], ['速度', cur.spd, next.spd], ['魔法', spellsFor(this.jobs[m.jobId], m.level).length, spellsFor(job, m.level).length]];
    rows.forEach(([k, a, b], i) => {
      const y = 108 + i * LINE_H;
      drawText(ctx, k, LEFT_W + 8, y, { color: UI.dim }); drawText(ctx, String(a), LEFT_W + 72, y, { align: 'right', color: UI.dim });
      drawText(ctx, '→', LEFT_W + 80, y, { color: UI.dim }); drawText(ctx, String(b), LEFT_W + 124, y, { align: 'right', color: b > a ? UI.good : b < a ? UI.danger : UI.text });
    });
    // 属性掉得多通常是因为装备被卸了，直接说明白，省得玩家以为数字算错了。
    // 只有一行位置（下面 204 就是操作提示），装备名太长就截断加省略号
    if (removed.length) {
      const ls = wrapText(ctx, `卸下 ${removed.map(r => data.items[r.id].name).join('、')}`, 256 - LEFT_W - 24);
      drawText(ctx, ls[0] + (ls.length > 1 ? '…' : ''), LEFT_W + 8, 188, { color: UI.danger });
    }
    drawText(ctx, 'Z 确认   X 返回', 256 - 8, 204, { align: 'right', color: UI.dim });
  }
}
