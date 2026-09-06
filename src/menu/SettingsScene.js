// 设置：战斗模式（回合制 / ATB）、声音。存在 state.settings 里，随存档保存。
import { Menu } from '../ui/Menu.js';
import { drawWindow, UI, fillWindowBg } from '../ui/Window.js';
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { audio } from '../core/audio.js';
import { key } from '../touch.js';

export const OPTIONS = [
  { key: 'battleMode', label: '交手方式', values: [['turn', '回合制'], ['atb', 'ATB']], desc: '回合制：全员下令后按速度结算。ATB：时间槽满了才能行动，敌人不等你。' },
  { key: 'autoBattle', label: '自动战斗', values: [[false, '关'], [true, '开']],
    desc: '开着就由 AI 替你下令：先救人再治疗，能打弱点就打弱点，普攻杀得死就不浪费 MP。战斗中按 Tab 或 Q 也能随时切换。' },
  { key: 'mute', label: '声音', values: [[false, '开'], [true, '关']], desc: '游戏中随时按 M 也能切换。' },
];

export function getSetting(game, key) {
  const v = game.state.settings?.[key];
  if (v !== undefined) return v;
  if (key === 'battleMode') return game.data.config.battleMode || 'turn';
  if (key === 'mute') return audio.muted;
  if (key === 'autoBattle') return !!game.data.config.autoBattle;
  return OPTIONS.find(o => o.key === key).values[0][0];
}
export function applySettings(game) { audio.setMute(!!game.state.settings?.mute); }

export class SettingsScene {
  constructor(game) { this.game = game; this.transparent = true; this.build(); }
  build(keep = 0) {
    // 当前值用暗金：这一栏是「按左右能改的东西」，颜色本身就是提示
    const items = OPTIONS.map(o => ({ label: `${o.label}`, right: o.values.find(v => v[0] === getSetting(this.game, o.key))?.[1] ?? '?', rightColor: UI.accent, value: o.key }));
    items.push({ label: '返回', value: 'back' });
    this.menu = new Menu({ items, x: 48, y: 48, w: 160, h: 16 + items.length * LINE_H, onSelect: it => this.select(it.value, 1), onCancel: () => this.game.scenes.pop() });
    this.menu.cursor = keep;
  }
  select(key, dir) {
    if (key === 'back') { this.game.scenes.pop(); return; }
    const o = OPTIONS.find(x => x.key === key), i = o.values.findIndex(v => v[0] === getSetting(this.game, key));
    const next = o.values[(i + dir + o.values.length) % o.values.length][0];
    this.game.state.settings ||= {}; this.game.state.settings[key] = next;
    applySettings(this.game); this.build(this.menu.cursor);
  }
  update() {
    const input = this.game.input, it = this.menu.item;
    if (it?.value !== 'back' && (input.repeatPressed('left') || input.repeatPressed('right'))) { audio.sfx('cursor'); this.select(it.value, input.repeatPressed('left') ? -1 : 1); return; }
    this.menu.update(input);
  }
  render(ctx) {
    // 三段窗上下相接（24-48 / 48-… / …-…+56）。窗体内缩 1px 画，接缝处会漏出
    // 下面的主菜单和队伍面板，看着像三块板没对齐。先把整个模态的范围垫实。
    fillWindowBg(ctx, 48, 24, 160, 24 + this.menu.h + 56);
    drawWindow(ctx, 48, 24, 160, 24); drawText(ctx, '设置', 128, 30, { align: 'center', color: UI.accent });
    this.menu.render(ctx);
    const o = OPTIONS.find(x => x.key === this.menu.item?.value);
    drawWindow(ctx, 48, 48 + this.menu.h, 160, 56);
    wrapText(ctx, o?.desc || `← → 切换，${key('cancel')} 返回`, 144).slice(0, 3).forEach((l, i) => drawText(ctx, l, 56, 56 + this.menu.h + i * LINE_H, { color: UI.dim }));
  }
}
