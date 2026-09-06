// 装备菜单：选角色 → 选部位 → 从背包挑装备（带属性升降对照）
//
// 版面照 FF6 的装备页分三段：
//   上（0-56）   角色 + HP/MP + 状态图标 + 正在挑的那件东西的数值摘要
//   中（56-112） 三个部位，右半边并排一张六格属性对照表
//   下（112-224）挑选列表 / 或当前这件装备的详情
// 「换上之后会变成多少」是这一页唯一重要的事，所以数值一律显示「换上后的值」＋升降箭头，
// 不让玩家自己去心算差额。
import { Menu } from '../ui/Menu.js';
import { drawWindow, drawDivider, fillWindowBg, UI } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { computeStats } from '../game/party.js';
import { canEquip, equip } from '../game/items.js';
import { drawPartyPanel, drawSprite, stepCursor, PARTY_W, portrait } from './common.js';
import { drawMenuIcons, drawStatusIcons, deltaArrow, iconGap, textW } from './icons.js';
import { icons } from '../assets/art.js';
import { itemIcon } from '../assets/equip.js';
import { itemStats } from '../game/shop.js';
import { key } from '../touch.js';

const SLOTS = [['weapon', '武器'], ['armor', '防具'], ['accessory', '饰品']];
// 属性对照表：六格是部位列表右边这块地方放得下的上限。
// 挑的是「装备真正会改的派生属性」；智力/会心/连击/属性这些不常动的，
// 由上面那行道具摘要（itemStats）补齐，不必挤进表里。
const GRID = [['攻击', 'atk'], ['防御', 'def'], ['命中', 'acc'], ['回避', 'eva'], ['速度', 'spd'], ['魔防', 'mdef']];
// 每格：标签在左、数值右对齐到 x+GW。两格之间要留 8px，否则「攻击 91」和「防御」会贴在一起
const GX = 136, GW = 48, GSTEP = 56;

// 一格属性：标签（暗）+ 数值（右对齐）。有变化时数值换成「换上之后的值」并配一个升降箭头
function cell(ctx, label, a, b, x, y, w = GW) {
  drawText(ctx, label, x, y, { color: UI.dim });
  const changed = b != null && b !== a;
  drawText(ctx, String(changed ? b : a), x + w, y, { align: 'right', color: changed ? (b > a ? UI.good : UI.danger) : UI.text });
  if (changed) deltaArrow(ctx, x + 26, y + 4, b > a);
}
// 装备图标：assets/art/manifest.json 里的正式美术优先，没有就用 equip.js 程序化画的那枚
const gearIcon = (id, it) => (it.icon && icons[it.icon]) || itemIcon(id, it);

export class EquipScene {
  constructor(game) { this.game = game; this.transparent = true; this.mode = 'member'; this.cursor = 0; this.slot = 'weapon'; }
  get member() { return this.game.state.party[this.cursor]; }

  buildSlotMenu(keep = 0) {
    const m = this.member, items = this.game.data.items, gap = iconGap();
    const lab = id => id ? items[id].name : '—';
    this.slotMenu = new Menu({
      // 标签排成「部位 + 图标 + 装备名」：gap 是量出来的一段空白，图标就压在那上面
      items: SLOTS.map(([slot, name]) => ({ label: `${name}${gap}${lab(m.equipment[slot])}`, value: slot, iconDX: textW(name) })),
      x: 0, y: 56, w: 256, h: 56,
      onSelect: it => this.openPick(it.value), onCancel: () => { this.mode = 'member'; },
    });
    this.slotMenu.cursor = keep;
  }
  openPick(slot) {
    const m = this.member, data = this.game.data, inv = this.game.state.inventory, gap = iconGap();
    const list = inv.filter(s => { const it = data.items[s.id]; return it.type === slot && canEquip(it, m); })
      .map(s => ({ label: gap + data.items[s.id].name, value: s.id, right: `×${s.qty}` }));
    list.unshift({ label: gap + '卸下', value: null });   // 同样缩进，列表左缘才是齐的（这一项没有图标）
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
      fillWindowBg(ctx);          // 队伍面板与右栏左右相接，接缝处会漏出野外
      drawPartyPanel(ctx, this.game, { cursor: this.cursor });
      drawWindow(ctx, PARTY_W, 0, 256 - PARTY_W, 224);
      drawText(ctx, '装备', PARTY_W + 8, 8, { color: UI.accent });
      drawDivider(ctx, PARTY_W + 8, 8 + LINE_H, 256 - PARTY_W - 16);
      drawText(ctx, '选择角色', PARTY_W + 8, 8 + LINE_H + 6, { color: UI.dim });
      return;
    }
    const m = this.member, items = this.game.data.items, job = this.game.data.jobs[m.jobId];
    const { cur, next } = this.previewStats();

    // ---- 上段：谁在换、换完血量魔力变多少 ----
    // 三段窗上下相接（0-56 / 56-112 / 112-224），接缝处会透出下层菜单，先垫一层
    fillWindowBg(ctx);
    drawWindow(ctx, 0, 0, 256, 56);
    const po = portrait(this.game, m.jobId);
    drawSprite(ctx, po.img, 8, 8 + po.bob, 40);
    drawText(ctx, m.name, 52, 8, { color: UI.accent });
    drawText(ctx, `${job.name}  Lv ${m.level}`, 56 + textW(m.name), 8, { color: UI.dim });
    drawStatusIcons(ctx, m.status, 196, 7);          // 身上带着的异常在这页也要看得到
    cell(ctx, 'HP', cur.maxHp, next?.maxHp, 52, 22, 60);   // HP/MP 是四位数，格子给宽一点
    cell(ctx, 'MP', cur.maxMp, next?.maxMp, 128, 22, 60);
    // 第三行：挑选时报「这件东西本身加什么」——智力、会心、连击、属性都在这句里，
    // 下面那张表放不下的全靠它。不在挑选时就让位给操作提示。
    if (this.mode === 'pick') {
      const it = this.pickMenu.item?.value ? items[this.pickMenu.item.value] : null;
      const txt = it ? (itemStats(it) || it.desc || '') : '把这个部位空出来';
      drawText(ctx, wrapText(ctx, txt, 196)[0] || '', 52, 36, { color: it?.myth ? UI.accent : UI.cool });
    } else drawText(ctx, `${key('confirm')} 选部位   ${key('cancel')} 返回`, 248, 36, { align: 'right', color: UI.dim });

    // ---- 中段：三个部位 + 属性对照 ----
    this.slotMenu.render(ctx);
    drawMenuIcons(ctx, this.slotMenu, it => { const id = m.equipment[it.value]; return id ? gearIcon(id, items[id]) : null; });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(GX - 8, 62, 1, 42);   // 部位与属性之间一道竖缝
    GRID.forEach(([label, key], i) => cell(ctx, label, cur[key], next?.[key], GX + (i % 2) * GSTEP, 64 + Math.floor(i / 2) * LINE_H));

    // ---- 下段：挑选列表 / 当前这件的详情 ----
    if (this.mode === 'pick') {
      this.pickMenu.render(ctx);
      drawMenuIcons(ctx, this.pickMenu, it => it.value ? gearIcon(it.value, items[it.value]) : null);
      return;
    }
    drawWindow(ctx, 0, 112, 256, 112);
    const id = m.equipment[SLOTS[this.slotMenu.cursor][0]], it = id ? items[id] : null;
    if (!it) { drawText(ctx, '选择要更换的部位', 8, 120, { color: UI.dim }); return; }
    // 名字与出处各占一行、都靠左：出处最长有 10 个字（「凯尔特 · 亚瑟王传说」），
    // 右对齐塞在名字后面会直接压上去
    drawSprite(ctx, gearIcon(id, it), 8, 118, 28);   // 图标放大到 24px：这里是「看清这件东西」的地方
    drawText(ctx, it.name + (it.myth ? '  ★神话' : ''), 42, 118, { color: it.myth ? UI.accent : UI.text });
    if (it.lore) drawText(ctx, it.lore, 42, 118 + LINE_H, { color: UI.dim });
    drawDivider(ctx, 8, 146, 240);                   // 名字/出处一段，属性与说明一段
    // 属性摘要可能有四五组（攻击/命中/会心/属性…），一行放不下就换行
    wrapText(ctx, itemStats(it), 240).slice(0, 2).forEach((l, i) => drawText(ctx, l, 8, 152 + i * LINE_H, { color: UI.cool }));
    wrapText(ctx, it.desc || '', 240).slice(0, 2).forEach((l, i) => drawText(ctx, l, 8, 182 + i * LINE_H, { color: UI.dim }));
  }
}
