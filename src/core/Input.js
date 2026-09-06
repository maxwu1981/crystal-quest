// 键盘输入：把物理按键映射成动作，按逻辑帧提供 justPressed / repeatPressed / isDown。
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'confirm', Enter: 'confirm', Space: 'confirm',
  KeyX: 'cancel', Escape: 'cancel', Backspace: 'cancel',
  KeyB: 'debugBattle', KeyH: 'debugHeal', KeyM: 'mute',
  Tab: 'map', KeyQ: 'map',   // 摊开全图看地形
};
// 有些环境（自动化工具、部分输入法）只给 e.key 不给 e.code，两者都认
const KEYNAME = {
  ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
  z: 'confirm', Enter: 'confirm', ' ': 'confirm', x: 'cancel', Escape: 'cancel', Backspace: 'cancel',
  b: 'debugBattle', h: 'debugHeal', m: 'mute', Tab: 'map', q: 'map',
  Return: 'confirm', Up: 'up', Down: 'down', Left: 'left', Right: 'right', // 旧式/自动化工具的键名
};
const actionOf = e => KEYMAP[e.code] || KEYNAME[e.key] || KEYNAME[(e.key || '').toLowerCase()];
const DIRS = new Set(['up', 'down', 'left', 'right']);
const REPEAT_DELAY = 0.35, REPEAT_RATE = 0.08;

export class Input {
  constructor(target = window) {
    this.down = new Map();     // action -> 按住秒数（插入顺序 = 按下顺序）
    this.queue = [];
    this.pressed = new Set();
    this.repeat = new Set();
    target.addEventListener('keydown', e => {
      const a = actionOf(e);
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(a);
    });
    target.addEventListener('keyup', e => { const a = actionOf(e); if (a) this.release(a); });
    window.addEventListener('blur', () => this.down.clear());
  }

  // 按下 / 松开一个动作。键盘走这里，触控（src/touch.js）也走这里——
  // 两种输入共用同一条路径，才不会出现「只有手机上才有的 bug」。
  press(a) { if (!this.down.has(a)) { this.down.set(a, 0); this.queue.push(a); } }
  release(a) { this.down.delete(a); }

  // 每个逻辑帧开始时调用一次
  beginTick(dt) {
    this.pressed = new Set(this.queue);
    this.queue.length = 0;
    this.repeat = new Set(this.pressed);
    for (const [a, t] of this.down) {
      const nt = t + dt;
      if (t < REPEAT_DELAY && nt >= REPEAT_DELAY) this.repeat.add(a);
      else if (t >= REPEAT_DELAY &&
        Math.floor((t - REPEAT_DELAY) / REPEAT_RATE) !== Math.floor((nt - REPEAT_DELAY) / REPEAT_RATE)) this.repeat.add(a);
      this.down.set(a, nt);
    }
  }
  isDown(a) { return this.down.has(a); }
  justPressed(a) { return this.pressed.has(a); }
  repeatPressed(a) { return this.repeat.has(a); }
  // 当前按住的方向（最后按下的优先）
  dir() { let d = null; for (const a of this.down.keys()) if (DIRS.has(a)) d = a; return d; }
}
