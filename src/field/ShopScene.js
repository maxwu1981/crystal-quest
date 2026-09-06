// 商店：购买 / 出售 / 离开
import { Menu } from '../ui/Menu.js';
import { drawWindow, UI, fillWindowBg } from '../ui/Window.js';
import { drawMenuIcons, iconGap } from '../menu/icons.js';
import { itemIcon } from '../assets/equip.js';
import { drawText, LINE_H } from '../core/text.js';
import { countItem } from '../game/items.js';
import { buyItem, sellItem, sellPrice, describeItem } from '../game/shop.js';
import { audio } from '../core/audio.js';

const GREETING = '想要点什么？';

export class ShopScene {
  constructor(game, script, shopName = '商店') {
    this.game = game; this.transparent = true; this.ids = script.items || []; this.name = shopName;
    // 商店没有专属曲子，明写成 'field' 而不是留空：留空时这一层不带 BGM，
    // 放什么全看底下压着的是哪个场景，等于把「进店听到什么」交给运气。
    this.bgm = 'field';
    this.mode = 'root'; this.msg = GREETING; this.lastCursor = -1;
    this.root = new Menu({
      items: [{ label: '购买', value: 'buy' }, { label: '出售', value: 'sell' }, { label: '离开', value: 'leave' }],
      x: 176, y: 32, w: 80, h: 56, onSelect: it => this.select(it.value), onCancel: () => game.scenes.pop(),
    });
  }
  select(v) { if (v === 'leave') this.game.scenes.pop(); else { this.mode = v; this.msg = ''; this.buildList(); } }
  buildList(keep = 0) {
    const data = this.game.data, inv = this.game.state.inventory;
    // 金额单独上暗金（Menu 的 rightColor）：一排商品里只有价钱是要玩家做决定的数字，
    // 和菜单信息栏的「金币」、右上角的持有金币同色，一眼就能把三处的钱串起来看。
    // 买不起的直接灰掉。原本三十几件商品的价钱一律同色，
    // 玩家得逐行心算才知道哪些够得着——滚到底下、选中、才被告知「钱不够」。
    // 灰掉之后一眼就能看出「买得起的到哪一行为止」。
    // Menu 的光标不跳过 disabled，所以照样能停上去读说明，只是按下去买不成。
    const items = this.mode === 'buy'
      // 标签前留出图标位，跟道具列表、装备页同一套排版——
      // 一排商品全是文字的话，玩家得逐行读名字才知道哪个是药哪个是剑
      ? this.ids.map(id => ({ label: iconGap() + data.items[id].name, value: id, right: `${data.items[id].price}G`, rightColor: UI.accent, disabled: data.items[id].price > this.game.state.gold }))
      : inv.map(s => ({ label: iconGap() + data.items[s.id].name, value: s.id, right: `${sellPrice(data.items[s.id])}G`, rightColor: UI.accent }));
    if (!items.length) items.push({ label: this.mode === 'buy' ? '（没有商品）' : '（没有可卖的东西）', disabled: true });
    this.list = new Menu({ items, x: 0, y: 32, w: 176, h: 192, onSelect: it => this.trade(it.value),
      // 按到买不起的那一件时还是要给一句话，否则只有一声 buzz，玩家不知道是「不能买」还是「按错了」
      onDisabled: () => { this.msg = '钱毋罅。'; },
      onCancel: () => { this.mode = 'root'; this.msg = GREETING; } });
    this.list.cursor = Math.min(keep, items.length - 1); this.lastCursor = this.list.cursor;
  }
  trade(id) {
    const r = this.mode === 'buy' ? buyItem(this.game.state, id, this.game.data) : sellItem(this.game.state, id, this.game.data);
    this.msg = r.msg; audio.sfx(r.ok ? 'coin' : 'buzz');
    // 买卖都要重建：金币变了，「买不起」的那条线跟着挪
    if (r.ok) this.buildList(this.list.cursor);
  }
  update() {
    const input = this.game.input;
    if (this.mode === 'root') { this.root.update(input); return; }
    this.list.update(input);
    if (this.list && this.list.cursor !== this.lastCursor) { this.msg = ''; this.lastCursor = this.list.cursor; }
  }
  render(ctx) {
    const data = this.game.data, st = this.game.state;
    const hovered = this.mode !== 'root' && this.list.item?.value ? data.items[this.list.item.value] : null;
    // 五个窗上下左右相接铺满整屏（0-32 顶 / 左 0-176 / 右 176-256 分三段）。
    // 窗体是内缩 1px + 圆角画的，接缝处会漏出店里的地板和墙，先垫一层。
    fillWindowBg(ctx);
    drawWindow(ctx, 0, 0, 256, 32);
    // 交易结果（买到了／钱不够）用暗金，和「说明文字」区分开：那一行既当招呼语又当回执，
    // 不换颜色的话玩家分不出这句是商品说明还是刚才那笔交易的回应
    drawText(ctx, this.msg || (hovered ? describeItem(hovered, data) : GREETING), 8, 10, { color: this.msg && this.msg !== GREETING ? UI.accent : UI.text });
    if (this.mode === 'root') { drawWindow(ctx, 0, 32, 176, 192); drawText(ctx, this.name, 8, 40, { color: UI.dim }); }
    else { this.list.render(ctx); drawMenuIcons(ctx, this.list, it => it.value ? itemIcon(it.value, data.items[it.value]) : null); }
    this.root.render(ctx);
    drawWindow(ctx, 176, 88, 80, 28);
    drawText(ctx, `${st.gold} G`, 248, 96, { align: 'right', color: UI.accent }); // 钱包也是暗金，和商品价钱对得上
    drawWindow(ctx, 176, 116, 80, 108);
    if (hovered) { drawText(ctx, '持有', 184, 124, { color: UI.dim }); drawText(ctx, `×${countItem(st.inventory, this.list.item.value)}`, 248, 124, { align: 'right', color: UI.text }); }
  }
}
