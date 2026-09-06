// 主菜单（地图上按 X）：透明场景，叠在地图上。子菜单各自是独立场景。
import { Menu } from '../ui/Menu.js';
import { drawWindow, UI, fillWindowBg } from '../ui/Window.js';
import { drawText, LINE_H } from '../core/text.js';
import { saveGame, loadGame } from '../game/state.js';
import { drawPartyPanel, drawInfoPanel, drawTextBlock, PARTY_W } from './common.js';
import { ItemScene } from './ItemScene.js';
import { EquipScene } from './EquipScene.js';
import { StatusScene } from './StatusScene.js';
import { JobScene } from './JobScene.js';
import { SettingsScene } from './SettingsScene.js';

const ITEMS = [['物品', 'item'], ['装备', 'equip'], ['名册', 'status'], ['转职', 'job'], ['设置', 'settings'], ['记下', 'save'], ['想起', 'load'], ['关闭', 'close']];
// 行高比正文行距宽 2px：右栏只有 80px 宽，八项挤在一起时字与字几乎贴着，
// 撑开一点点就好读很多（8 项 × 15 + 上下 pad 正好排满，不用滚动）。
const ROW_H = 15;
const MENU_H = 16 + ITEMS.length * ROW_H;
const INFO_H = 48;

export class MenuScene {
  constructor(game) {
    this.game = game; this.transparent = true; this.msg = ''; this.msgT = 0;
    this.menu = new Menu({
      items: ITEMS.map(([label, value]) => ({ label, value, disabled: (value === 'load' && !loadGame()) || (value === 'job' && !game.state.flags.jobUnlocked) })),
      x: PARTY_W, y: 0, w: 256 - PARTY_W, h: MENU_H, rowH: ROW_H,
      onSelect: it => this.select(it.value), onCancel: () => game.scenes.pop(),
      onDisabled: it => this.flash(it.value === 'load' ? '没有可想起的' : '还没拿到六堆令旗'),
    });
  }
  flash(t) { this.msg = t; this.msgT = 1.5; }
  select(v) {
    const g = this.game;
    if (v === 'close') g.scenes.pop();
    else if (v === 'item') g.scenes.push(new ItemScene(g));
    else if (v === 'equip') g.scenes.push(new EquipScene(g));
    else if (v === 'status') g.scenes.push(new StatusScene(g));
    else if (v === 'job') g.scenes.push(new JobScene(g));
    else if (v === 'settings') g.scenes.push(new SettingsScene(g));
    else if (v === 'save') { saveGame(g.state); this.menu.items.find(i => i.value === 'load').disabled = false; this.flash('记下了'); }
    else if (v === 'load') { const s = loadGame(); if (s) g.fadeTo(() => g.loadState(s)); }
  }
  update(dt) { if (this.msgT > 0) this.msgT -= dt; this.menu.update(this.game.input); }
  render(ctx) {
    // 队伍面板与右侧指令窗左右相接，接缝处会漏出野外。先垫一层。
    fillWindowBg(ctx);
    drawPartyPanel(ctx, this.game);
    this.menu.render(ctx);
    drawInfoPanel(ctx, this.game, PARTY_W, MENU_H, 256 - PARTY_W, INFO_H);
    const by = MENU_H + INFO_H;
    drawWindow(ctx, PARTY_W, by, 256 - PARTY_W, 224 - by);
    // 最底下这格平时报所在地：先一行暗色的小标题，再报地名，
    // 才不会看起来像一个漂在空窗口里的词。提示消息则直接顶掉标题。
    if (this.msgT > 0) drawTextBlock(ctx, this.msg, PARTY_W + 8, by + 8, 64, { color: UI.accent });
    else {
      drawText(ctx, '所在', PARTY_W + 8, by + 8, { color: UI.dim });
      drawTextBlock(ctx, this.game.data.maps[this.game.state.map.id]?.name || '', PARTY_W + 8, by + 8 + LINE_H, 64);
    }
  }
}
