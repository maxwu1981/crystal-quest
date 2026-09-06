// NPC：站立或闲逛，按标志位选择对话变体。
import { TILE } from '../assets/tiles.js';
import { addItem } from '../game/items.js';
import { DIRS, lerp } from './grid.js';
import { drawArt, artH } from '../core/draw.js';

const NPC_STEP_TIME = 0.28;

// 对话变体：[{ if?, unless?, set?:[flags], give?:{gold, items:[{id,qty}]}, lines:[...] }]，取第一个条件满足的
// if / unless 可以是一个 flag，也可以是一组：
//   if: ['a','b']     两个都成立才选这一条
//   unless: ['a','b'] 任一成立就跳过
// 加数组是因为「按顺序发放」表达不了：伯公庙三段神器要求「打完 Boss **且**已领第二件」，
// 单个 flag 写不出来，结果三段的触发顺序和叙事顺序整个倒过来
// （玩家先听到「又吐一件出来」，再听到第一次发现那句）。
const allOf = (c, flags) => (Array.isArray(c) ? c : [c]).every(f => flags[f]);
const anyOf = (c, flags) => (Array.isArray(c) ? c : [c]).some(f => flags[f]);
export function pickVariant(dialogue, flags = {}) {
  for (const v of dialogue || []) {
    if (v.if && !allOf(v.if, flags)) continue;
    if (v.unless && anyOf(v.unless, flags)) continue;
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

// 脚下的一小块椭圆影。方向影会在格线上切出方坑（地图是逐格画的），所以用居中的椭圆。
// 导出给 FieldScene 画主角用——只给 NPC 加会不一致。
export function drawShadow(ctx, dx, dy) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(dx + TILE / 2, dy + TILE - 2, TILE * 0.30, TILE * 0.14, 0, 0, 6.29);
  ctx.fill();
  ctx.restore();
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
  // 转向玩家时把原来的朝向记下来，聊完转回去——
  // 不转回来的话，玩家在庄里走一圈，一庄的人就全都朝着他站着，很怪
  faceToward(x, y) {
    if (this.homeDir === undefined) this.homeDir = this.dir;
    this.dir = x < this.x ? 'left' : x > this.x ? 'right' : y < this.y ? 'up' : 'down';
  }
  faceHome() { if (this.homeDir !== undefined) { this.dir = this.homeDir; this.homeDir = undefined; } }
  stop() { this.moving = false; this.t = 0; this.fromX = this.x; this.fromY = this.y; }

  update(dt) {
    this.anim += dt;
    if (this.moving) {
      this.t += dt / NPC_STEP_TIME;
      this.phase = ((this.phase || 0) + dt / NPC_STEP_TIME) % 2;   // 每格换一次脚，跟主角同一套
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
    const frame = this.moving ? (Math.floor(this.phase || 0) ? 2 : 1) : 0;
    const spr = sprites[`${this.sprite}_${this.dir}_${frame}`] || sprites[`man_${this.dir}_0`];
    const dx = Math.round(px - camX), dy = Math.round(py - camY);
    drawShadow(ctx, dx, dy);   // 树和宝箱都有落影，人没有的话看着像浮在地上
    drawArt(ctx, spr, dx, dy - (artH(spr) - TILE));
  }
}
