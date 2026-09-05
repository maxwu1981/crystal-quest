// NPC：站立或闲逛，按标志位选择对话变体。
import { TILE } from '../assets/tiles.js';
import { addItem } from '../game/items.js';
import { DIRS, lerp } from './grid.js';

const NPC_STEP_TIME = 0.28;

// 对话变体：[{ if?, unless?, set?:[flags], give?:{gold, items:[{id,qty}]}, lines:[...] }]，取第一个条件满足的
export function pickVariant(dialogue, flags = {}) {
  for (const v of dialogue || []) {
    if (v.if && !flags[v.if]) continue;
    if (v.unless && flags[v.unless]) continue;
    return v;
  }
  return null;
}
// 执行变体副作用，返回要显示的页
export function applyVariant(v, state) {
  if (!v) return ['……'];
  for (const f of v.set || []) state.flags[f] = true;
  if (v.give?.gold) state.gold += v.give.gold;
  for (const it of v.give?.items || []) addItem(state.inventory, it.id, it.qty || 1);
  return v.lines;
}

export class NPC {
  constructor(def, field) {
    this.def = def; this.field = field;
    this.x = def.x; this.y = def.y; this.ox = def.x; this.oy = def.y; this.fromX = def.x; this.fromY = def.y;
    this.dir = def.dir || 'down'; this.moving = false; this.t = 0; this.anim = 0;
    this.timer = 0.5 + field.game.rngFx.next() * 2;
  }
  get sprite() { return this.def.sprite || 'man'; }
  occupies(x, y) { return (this.x === x && this.y === y) || (this.moving && this.fromX === x && this.fromY === y); }
  faceToward(x, y) { this.dir = x < this.x ? 'left' : x > this.x ? 'right' : y < this.y ? 'up' : 'down'; }
  stop() { this.moving = false; this.t = 0; this.fromX = this.x; this.fromY = this.y; }

  update(dt) {
    this.anim += dt;
    if (this.moving) {
      this.t += dt / NPC_STEP_TIME;
      if (this.t >= 1) this.stop();
      return;
    }
    if (!this.def.wander) return;
    if ((this.timer -= dt) > 0) return;
    const rng = this.field.game.rngFx;
    this.timer = 1 + rng.next() * 2.5;
    const d = rng.pick(['up', 'down', 'left', 'right']);
    this.dir = d;
    const [dx, dy] = DIRS[d], nx = this.x + dx, ny = this.y + dy, r = this.def.radius ?? 2;
    if (Math.abs(nx - this.ox) > r || Math.abs(ny - this.oy) > r) return;
    if (!this.field.walkable(nx, ny, this)) return;
    this.fromX = this.x; this.fromY = this.y; this.x = nx; this.y = ny; this.moving = true; this.t = 0;
  }
  renderPos() { return [lerp(this.fromX, this.x, this.t) * TILE, lerp(this.fromY, this.y, this.t) * TILE]; }
  render(ctx, camX, camY, sprites) {
    const [px, py] = this.renderPos();
    const frame = this.moving ? Math.floor(this.anim * 8) % 2 : 0;
    const spr = sprites[`${this.sprite}_${this.dir}_${frame}`] || sprites[`man_${this.dir}_0`];
    ctx.drawImage(spr, Math.round(px - camX), Math.round(py - camY) - (spr.height - TILE));
  }
}
