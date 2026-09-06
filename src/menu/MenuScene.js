// 主菜单（地图上按 X）：透明场景，叠在地图上。子菜单各自是独立场景。
import { Menu } from '../ui/Menu.js';
import { drawWindow } from '../ui/Window.js';
import { drawText, LINE_H } from '../core/text.js';
import { saveGame, loadGame } from '../game/state.js';
import { drawPartyPanel, drawInfoPanel, drawTextBlock, PARTY_W } from './common.js';
import { ItemScene } from './ItemScene.js';
import { EquipScene } from './EquipScene.js';
import { StatusScene } from './StatusScene.js';
import { JobScene } from './JobScene.js';
import { SettingsScene } from './SettingsScene.js';

const ITEMS = [['物品', 'item'], ['装备', 'equip'], ['名册', 'status'], ['转职', 'job'], ['设置', 'settings'], ['记下', 'save'], ['想起', 'load'], ['关闭', 'close']];
const MENU_H = 16 + ITEMS.length * LINE_H;

export class MenuScene {
  constructor(game) {
    this.game = game; this.transparent = true; this.msg = ''; this.msgT = 0;
    this.menu = new Menu({
      items: ITEMS.map(([label, value]) => ({ label, value, disabled: (value === 'load' && !loadGame()) || (value === 'job' && !game.state.flags.jobUnlocked) })),
      x: PARTY_W, y: 0, w: 256 - PARTY_W, h: MENU_H,
      onSelect: it => this.select(it.value), onCancel: () => game.scenes.pop(),
      onDisabled: it => this.flash(it.value === 'load' ? '没有可想起的' : '需要记名的碎片'),
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
    drawPartyPanel(ctx, this.game);
    this.menu.render(ctx);
    drawInfoPanel(ctx, this.game, PARTY_W, MENU_H, 256 - PARTY_W, 48);
    drawWindow(ctx, PARTY_W, MENU_H + 48, 256 - PARTY_W, 224 - MENU_H - 48);
    if (this.msgT > 0) drawTextBlock(ctx, this.msg, PARTY_W + 8, MENU_H + 56, 64);
    else drawText(ctx, this.game.data.maps[this.game.state.map.id]?.name || '', PARTY_W + 8, MENU_H + 56, { color: '#8a8468' });
  }
}
