// 转职（FF3/FF5 风格）：选角色 → 选职业（右侧预览属性变化）→ 立即生效。需要标志位 jobUnlocked（村长给的水晶碎片）。
import { Menu } from '../ui/Menu.js';
import { drawWindow } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats, changeJob, spellsFor } from '../game/party.js';
import { drawPartyPanel, drawSprite, drawTextBlock, stepCursor, PARTY_W } from './common.js';
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
    if (jobId === m.jobId) { this.msg = '已经是这个职业了'; audio.sfx('buzz'); return; }
    const removed = changeJob(m, jobId, this.game.state.inventory, data);
    audio.sfx('levelup');
    this.msg = `${m.name} 成为了${this.jobs[jobId].name}！` + (removed.length ? `\n卸下了 ${removed.map(id => data.items[id].name).join('、')}` : '');
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
    if (this.mode === 'member') {
      drawPartyPanel(ctx, g, { cursor: this.cursor });
      drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
      drawText(ctx, '转职', PARTY_W + 8, 8); drawText(ctx, '选择角色', PARTY_W + 8, 8 + LINE_H, { color: '#9aa4d8' });
      drawTextBlock(ctx, this.msg, PARTY_W + 8, 8 + LINE_H * 3, 64);
      return;
    }
    this.jobMenu.render(ctx);
    const m = this.member, id = this.jobMenu.item.value, job = this.jobs[id];
    const cur = computeStats(m, data), next = computeStats({ ...m, jobId: id }, data);
    drawWindow(ctx, LEFT_W, 0, 256 - LEFT_W, 224);
    drawSprite(ctx, g.sprites[`${id}_down_0`], LEFT_W + 8, 8, 48);
    drawText(ctx, `${m.name}  Lv ${m.level}`, LEFT_W + 60, 12);
    drawText(ctx, `${this.jobs[m.jobId].name} → ${job.name}`, LEFT_W + 60, 12 + LINE_H, { color: '#ffe66d' });
    wrapText(ctx, job.desc || '', 256 - LEFT_W - 16).slice(0, 3).forEach((l, i) => drawText(ctx, l, LEFT_W + 8, 64 + i * LINE_H, { color: '#9aa4d8' }));
    const rows = [['HP', cur.maxHp, next.maxHp], ['MP', cur.maxMp, next.maxMp], ['攻击', cur.atk, next.atk], ['防御', cur.def, next.def], ['速度', cur.spd, next.spd], ['魔法', spellsFor(this.jobs[m.jobId], m.level).length, spellsFor(job, m.level).length]];
    rows.forEach(([k, a, b], i) => {
      const y = 108 + i * LINE_H;
      drawText(ctx, k, LEFT_W + 8, y, { color: '#9aa4d8' }); drawText(ctx, String(a), LEFT_W + 72, y, { align: 'right' });
      drawText(ctx, '→', LEFT_W + 80, y, { color: '#9aa4d8' }); drawText(ctx, String(b), LEFT_W + 124, y, { align: 'right', color: b > a ? '#7cfc7c' : b < a ? '#ff8a80' : '#fff' });
    });
    drawText(ctx, 'Z 确认   X 返回', 256 - 8, 204, { align: 'right', color: '#9aa4d8' });
  }
}
