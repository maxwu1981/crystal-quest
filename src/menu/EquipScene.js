// 装备菜单：选角色 → 选部位 → 从背包挑装备（带攻防预览）
import { Menu } from '../ui/Menu.js';
import { drawWindow, drawDivider, UI } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats } from '../game/party.js';
import { canEquip, equip } from '../game/items.js';
import { drawPartyPanel, drawSprite, stepCursor, PARTY_W, portrait } from './common.js';
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
      drawText(ctx, '装备', PARTY_W + 8, 8, { color: UI.accent });
      drawDivider(ctx, PARTY_W + 8, 8 + LINE_H, 256 - PARTY_W - 16);
      drawText(ctx, '选择角色', PARTY_W + 8, 8 + LINE_H + 6, { color: UI.dim });
      return;
    }
    const m = this.member, job = this.game.data.jobs[m.jobId], { cur, next } = this.previewStats();
    drawWindow(ctx, 0, 0, 256, 56);
    const po = portrait(this.game, m.jobId);
    drawSprite(ctx, po.img, 8, 8 + po.bob, 40);
    drawText(ctx, `${m.name}  ${job.name}  Lv ${m.level}`, 52, 10, { color: UI.text });
    const stat = (label, a, b, x) => {
      const y = 10 + LINE_H + 4;
      drawText(ctx, label, x, y, { color: UI.dim }); drawText(ctx, String(a), x + 44, y, { align: 'right', color: UI.text });
      if (b != null && b !== a) drawText(ctx, `→ ${b}`, x + 50, y, { color: b > a ? UI.good : UI.danger });
    };
    stat('攻击', cur.atk, next?.atk, 52); stat('防御', cur.def, next?.def, 150);
    this.slotMenu.render(ctx);
    if (this.mode === 'pick') this.pickMenu.render(ctx);
    else {
      drawWindow(ctx, 0, 112, 256, 112);
      const it = this.game.data.items[m.equipment[SLOTS[this.slotMenu.cursor][0]]];
      if (it) {
        // 神话装备的专属小图。icons 由 assets/art/manifest.json 的 "icons" 填充（见 assets/art.js）。
        // 现在 manifest 里 "icons" 还是空的（美术只出了角色/敌人/地形），所以这里恒为 undefined、
        // 布局恒走 tx = 8 那一支——这不是 bug。data/items.json 里每件神话装备的 icon id 已经齐了
        // （tests/run.js「神话装备：都有造型 id」在管着），美术管线（tools/gen_art.py、
        // tools/import_downloads.py）也已经会往 manifest.icons 写文件名，补上图就自动显示，不用改代码。
        const ic = it.icon && icons[it.icon];
        const tx = ic ? 40 : 8, tw = ic ? 208 : 240;
        if (ic) drawSprite(ctx, ic, 6, 136, 28); // 136 是刻线之下：图标和属性/说明同一段
        drawText(ctx, it.name + (it.myth ? '  ★神话' : ''), tx, 120, { color: it.myth ? UI.accent : UI.text });
        if (it.lore) drawText(ctx, it.lore, 248, 120, { align: 'right', color: UI.dim });
        drawDivider(ctx, 8, 120 + LINE_H - 2, 240); // 名字/出处一段，属性与说明一段
        drawText(ctx, itemStats(it), tx, 120 + LINE_H + 4, { color: UI.cool });
        wrapText(ctx, it.desc || '', tw).slice(0, 2).forEach((l, i) => drawText(ctx, l, tx, 124 + LINE_H * (i + 2), { color: UI.dim }));
      } else drawText(ctx, '选择要更换的部位', 8, 120, { color: UI.dim });
    }
  }
}
