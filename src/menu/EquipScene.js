// 装备菜单：选角色 → 选部位 → 从背包挑装备（带攻防预览）
import { Menu } from '../ui/Menu.js';
import { drawWindow } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats } from '../game/party.js';
import { canEquip, equip } from '../game/items.js';
import { drawPartyPanel, drawSprite, stepCursor, PARTY_W } from './common.js';
import { icons } from '../assets/art.js';
import { itemStats } from '../game/shop.js';

const SLOTS = [['weapon', '武器'], ['armor', '防具'], ['accessory', '饰品']];

export class EquipScene {
  constructor(game) { this.game = game; this.transparent = true; this.mode = 'member'; this.cursor = 0; this.slot = 'weapon'; }
  get member() { return this.game.state.party[this.cursor]; }

  buildSlotMenu(keep = 0) {
    const m = this.member, items = this.game.data.items;
    const lab = id => id ? items[id].name : '—';
    this.slotMenu = new Menu({
      items: SLOTS.map(([slot, name]) => ({ label: `${name}  ${lab(m.equipment[slot])}`, value: slot })),
      x: 0, y: 56, w: 256, h: 56,
      onSelect: it => this.openPick(it.value), onCancel: () => { this.mode = 'member'; },
    });
    this.slotMenu.cursor = keep;
  }
  openPick(slot) {
    const m = this.member, data = this.game.data, inv = this.game.state.inventory;
    const list = inv.filter(s => { const it = data.items[s.id]; return it.type === slot && canEquip(it, m); })
      .map(s => ({ label: data.items[s.id].name, value: s.id, right: `×${s.qty}` }));
    list.unshift({ label: '卸下', value: null });
    this.slot = slot; this.mode = 'pick';
    this.pickMenu = new Menu({
      items: list, x: 0, y: 112, w: 256, h: 112, cols: 2,
      onSelect: it => { equip(m, slot, it.value, inv, data); this.buildSlotMenu(SLOTS.findIndex(s => s[0] === slot)); this.mode = 'slot'; },
      onCancel: () => { this.mode = 'slot'; },
    });
  }
  previewStats() {
    const m = this.member, data = this.game.data, cur = computeStats(m, data);
    if (this.mode !== 'pick') return { cur, next: null };
    const trial = { ...m, equipment: { ...m.equipment, [this.slot]: this.pickMenu.item?.value ?? null } };
    return { cur, next: computeStats(trial, data) };
  }
  update() {
    const input = this.game.input;
    if (this.mode === 'member') {
      this.cursor = stepCursor(input, this.cursor, this.game.state.party.length);
      if (input.justPressed('confirm')) { this.buildSlotMenu(); this.mode = 'slot'; }
      else if (input.justPressed('cancel')) this.game.scenes.pop();
    } else if (this.mode === 'slot') this.slotMenu.update(input);
    else this.pickMenu.update(input);
  }
  render(ctx) {
    if (this.mode === 'member') {
      drawPartyPanel(ctx, this.game, { cursor: this.cursor });
      drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
      drawText(ctx, '装备', PARTY_W + 8, 8); drawText(ctx, '选择角色', PARTY_W + 8, 8 + LINE_H, { color: '#9aa4d8' });
      return;
    }
    const m = this.member, job = this.game.data.jobs[m.jobId], { cur, next } = this.previewStats();
    drawWindow(ctx, 0, 0, 256, 56);
    drawSprite(ctx, this.game.sprites[`${m.jobId}_down_0`], 8, 8, 40);
    drawText(ctx, `${m.name}  ${job.name}  Lv ${m.level}`, 52, 10);
    const stat = (label, a, b, x) => {
      const y = 10 + LINE_H + 4;
      drawText(ctx, label, x, y, { color: '#9aa4d8' }); drawText(ctx, String(a), x + 28, y);
      if (b != null && b !== a) drawText(ctx, `→ ${b}`, x + 50, y, { color: b > a ? '#7cfc7c' : '#ff8a80' });
    };
    stat('攻击', cur.atk, next?.atk, 52); stat('防御', cur.def, next?.def, 150);
    this.slotMenu.render(ctx);
    if (this.mode === 'pick') this.pickMenu.render(ctx);
    else {
      drawWindow(ctx, 0, 112, 256, 112);
      const it = this.game.data.items[m.equipment[SLOTS[this.slotMenu.cursor][0]]];
      if (it) {
        const ic = it.icon && icons[it.icon];               // 神话装备的专属造型
        const tx = ic ? 40 : 8, tw = ic ? 208 : 240;
        if (ic) drawSprite(ctx, ic, 6, 132, 28);
        drawText(ctx, it.name + (it.myth ? '  ★神话' : ''), tx, 120, { color: it.myth ? '#ffe66d' : '#fff' });
        if (it.lore) drawText(ctx, it.lore, 248, 120, { align: 'right', color: '#9aa4d8' });
        drawText(ctx, itemStats(it), tx, 120 + LINE_H, { color: '#7cc4ff' });
        wrapText(ctx, it.desc || '', tw).slice(0, 2).forEach((l, i) => drawText(ctx, l, tx, 120 + LINE_H * (i + 2), { color: '#9aa4d8' }));
      } else drawText(ctx, '选择要更换的部位', 8, 120, { color: '#9aa4d8' });
    }
  }
}
