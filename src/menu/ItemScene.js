// 道具菜单：列表 → 选目标 → 使用
import { Menu } from '../ui/Menu.js';
import { drawWindow, drawDivider, fillWindowBg, UI } from '../ui/Window.js';
import { drawText, LINE_H } from '../core/text.js';
import { countItem, removeItem, useItemOnMember, describeUse, campParty } from '../game/items.js';
import { drawPartyPanel, drawSprite, drawTextBlock, stepCursor, PARTY_W } from './common.js';
import { drawMenuIcons, iconGap } from './icons.js';
import { itemIcon } from '../assets/equip.js';
import { audio } from '../core/audio.js';
import { itemStats } from '../game/shop.js';

export class ItemScene {
  constructor(game) { this.game = game; this.transparent = true; this.mode = 'list'; this.cursor = 0; this.msg = ''; this.buildMenu(); }
  get inv() { return this.game.state.inventory; }
  buildMenu(keep = 0) {
    const data = this.game.data, gap = iconGap();
    // 标签前面留一段量出来的空白，图标画在那上面（见 icons.js）。
    // FF6 的道具列表每行都有图标，没有的话 87 件东西在这里长得一模一样，只能一个个读名字
    const items = this.inv.map(s => { const it = data.items[s.id]; return { label: gap + it.name, value: s.id, right: `×${s.qty}`, disabled: it.type !== 'consumable' || !it.field }; });
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
    if (it.effect?.camp) { audio.sfx('heal'); campParty(this.game.state.party, this.game.data); removeItem(this.inv, id); this.msg = '全员复原了'; this.buildMenu(this.menu.cursor); return; }
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
      fillWindowBg(ctx);          // 上下两段窗的接缝会透出下层菜单，先垫一层
      drawWindow(ctx, 0, 0, 256, 32);
      const it = this.menu.item?.value ? data.items[this.menu.item.value] : null;
      const desc = it ? (it.type === 'consumable' ? (it.desc || '') : itemStats(it)) : '道具';
      drawText(ctx, this.msg || desc, 8, 10, { color: this.msg ? UI.accent : UI.text });
      this.menu.render(ctx);
      drawMenuIcons(ctx, this.menu, m => m.value ? itemIcon(m.value, data.items[m.value]) : null);
      return;
    }
    fillWindowBg(ctx);            // 同上：选目标那一屏也是左右相接
    drawPartyPanel(ctx, this.game, { cursor: this.cursor });
    drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
    // 右栏分两段：上段说「拿的是什么」，一条刻线之后是「结果怎么样」
    const it = data.items[this.itemId], x = PARTY_W + 8, ic = itemIcon(this.itemId, it);
    if (ic) drawSprite(ctx, ic, x, 6, 12);           // 手上拿的是哪一件，图标跟着一起过来
    drawText(ctx, it.name, x + (ic ? 15 : 0), 8, { color: UI.accent });
    drawText(ctx, `剩余 ×${countItem(this.inv, this.itemId)}`, x, 8 + LINE_H, { color: UI.dim });
    drawDivider(ctx, x, 8 + LINE_H * 2 + 2, 256 - PARTY_W - 16);
    drawText(ctx, '选择对象', x, 8 + LINE_H * 2 + 8, { color: UI.dim });
    drawTextBlock(ctx, this.msg, x, 8 + LINE_H * 4, 64, { color: UI.text });
  }
}
