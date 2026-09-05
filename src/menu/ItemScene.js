// 道具菜单：列表 → 选目标 → 使用
import { Menu } from '../ui/Menu.js';
import { drawWindow } from '../ui/Window.js';
import { drawText, LINE_H } from '../core/text.js';
import { countItem, removeItem, useItemOnMember, describeUse, campParty } from '../game/items.js';
import { drawPartyPanel, drawTextBlock, stepCursor, PARTY_W } from './common.js';
import { audio } from '../core/audio.js';

export class ItemScene {
  constructor(game) { this.game = game; this.transparent = true; this.mode = 'list'; this.cursor = 0; this.msg = ''; this.buildMenu(); }
  get inv() { return this.game.state.inventory; }
  buildMenu(keep = 0) {
    const data = this.game.data;
    const items = this.inv.map(s => { const it = data.items[s.id]; return { label: it.name, value: s.id, right: `×${s.qty}`, disabled: it.type !== 'consumable' || !it.field }; });
    if (!items.length) items.push({ label: '（没有道具）', disabled: true });
    this.menu = new Menu({
      items, x: 0, y: 32, w: 256, h: 192, cols: 2,
      onSelect: it => this.pick(it.value), onCancel: () => this.game.scenes.pop(),
      onDisabled: it => { if (it.value) this.msg = data.items[it.value].type === 'consumable' ? '这里不能使用' : '请在「装备」菜单里使用'; },
    });
    this.menu.cursor = Math.min(keep, items.length - 1); this.lastCursor = this.menu.cursor;
  }
  pick(id) {
    const it = this.game.data.items[id];
    if (it.effect?.camp) { audio.sfx('heal'); campParty(this.game.state.party, this.game.data); removeItem(this.inv, id); this.msg = '全员完全恢复了'; this.buildMenu(this.menu.cursor); return; }
    this.mode = 'target'; this.itemId = id; this.cursor = 0; this.msg = '';
  }
  update() {
    const input = this.game.input;
    if (this.mode === 'list') {
      this.menu.update(input);
      if (this.menu.cursor !== this.lastCursor) { this.msg = ''; this.lastCursor = this.menu.cursor; }
      return;
    }
    const party = this.game.state.party;
    this.cursor = stepCursor(input, this.cursor, party.length);
    if (input.justPressed('cancel')) { this.mode = 'list'; this.buildMenu(this.menu.cursor); return; }
    if (input.justPressed('confirm')) {
      const it = this.game.data.items[this.itemId], m = party[this.cursor];
      const out = useItemOnMember(it, m, this.game.data);
      if (!out) { this.msg = '没有效果'; audio.sfx('buzz'); return; }
      audio.sfx('heal');
      removeItem(this.inv, this.itemId);
      this.msg = describeUse(it, m.name, out);
      if (!countItem(this.inv, this.itemId)) { this.mode = 'list'; this.buildMenu(this.menu.cursor); }
    }
  }
  render(ctx) {
    const data = this.game.data;
    if (this.mode === 'list') {
      drawWindow(ctx, 0, 0, 256, 32);
      const it = this.menu.item?.value ? data.items[this.menu.item.value] : null;
      const desc = it ? (it.desc || `${it.type === 'weapon' ? '攻击' : '防御'} +${it.atk || it.def}`) : '道具';
      drawText(ctx, this.msg || desc, 8, 10, { color: this.msg ? '#ffe66d' : '#fff' });
      this.menu.render(ctx);
      return;
    }
    drawPartyPanel(ctx, this.game, { cursor: this.cursor });
    drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
    const it = data.items[this.itemId];
    drawText(ctx, it.name, PARTY_W + 8, 8);
    drawText(ctx, `剩余 ×${countItem(this.inv, this.itemId)}`, PARTY_W + 8, 8 + LINE_H, { color: '#9aa4d8' });
    drawText(ctx, '选择对象', PARTY_W + 8, 8 + LINE_H * 2, { color: '#9aa4d8' });
    drawTextBlock(ctx, this.msg, PARTY_W + 8, 60, 64);
  }
}
