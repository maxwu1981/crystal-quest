// 主菜单（地图上按 X）：透明场景，叠在地图上。子菜单各自是独立场景。
import { Menu } from '../ui/Menu.js';
import { drawWindow } from '../ui/Window.js';
import { drawText } from '../core/text.js';
import { saveGame, loadGame } from '../game/state.js';
import { drawPartyPanel, drawInfoPanel, drawTextBlock, PARTY_W } from './common.js';
import { ItemScene } from './ItemScene.js';
import { EquipScene } from './EquipScene.js';
import { StatusScene } from './StatusScene.js';

export class MenuScene {
  constructor(game) {
    this.game = game; this.transparent = true; this.msg = ''; this.msgT = 0;
    this.menu = new Menu({
      items: [
        { label: '道具', value: 'item' }, { label: '装备', value: 'equip' }, { label: '状态', value: 'status' },
        { label: '存档', value: 'save' }, { label: '读档', value: 'load', disabled: !loadGame() }, { label: '关闭', value: 'close' },
      ],
      x: PARTY_W, y: 0, w: 256 - PARTY_W, h: 96,
      onSelect: it => this.select(it.value), onCancel: () => game.scenes.pop(), onDisabled: () => this.flash('没有存档'),
    });
  }
  flash(t) { this.msg = t; this.msgT = 1.5; }
  select(v) {
    const g = this.game;
    if (v === 'close') g.scenes.pop();
    else if (v === 'item') g.scenes.push(new ItemScene(g));
    else if (v === 'equip') g.scenes.push(new EquipScene(g));
    else if (v === 'status') g.scenes.push(new StatusScene(g));
    else if (v === 'save') { saveGame(g.state); this.menu.items[4].disabled = false; this.flash('已保存'); }
    else if (v === 'load') { const s = loadGame(); if (s) g.fadeTo(() => g.loadState(s)); }
  }
  update(dt) { if (this.msgT > 0) this.msgT -= dt; this.menu.update(this.game.input); }
  render(ctx) {
    drawPartyPanel(ctx, this.game);
    this.menu.render(ctx);
    drawInfoPanel(ctx, this.game, PARTY_W, 96, 256 - PARTY_W, 60);
    drawWindow(ctx, PARTY_W, 156, 256 - PARTY_W, 68);
    if (this.msgT > 0) drawTextBlock(ctx, this.msg, PARTY_W + 8, 164, 64);
    else drawText(ctx, this.game.data.maps[this.game.state.map.id]?.name || '', PARTY_W + 8, 164, { color: '#9aa4d8' });
  }
}
