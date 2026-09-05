// 地图行走：网格移动、镜头跟随、步数制遇敌。
import { TILE } from '../assets/tiles.js';
import { drawText } from '../core/text.js';
import { healFull } from '../game/party.js';
import { MenuScene } from '../menu/MenuScene.js';

const STEP_TIME = 0.16; // 每格秒数
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function parseMap(md) {
  const rows = md.rows, h = rows.length, w = rows[0].length;
  const cells = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`地图 ${md.name} 第 ${y} 行长度 ${rows[y].length} ≠ ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], def = md.legend[ch];
      if (!def) throw new Error(`地图 ${md.name} 未知字符 '${ch}' at (${x},${y})`);
      cells.push({ tile: def.tile, solid: !!def.solid, encounter: !!def.encounter });
    }
  }
  return { w, h, cells, encounterZone: md.encounterZone, spawn: md.spawn, name: md.name };
}

export class FieldScene {
  constructor(game) {
    this.game = game;
    this.transparent = false;
    const m = game.state.map;
    this.map = parseMap(game.data.maps[m.id]);
    this.p = { x: m.x, y: m.y, fromX: m.x, fromY: m.y, dir: m.facing, moving: false, t: 0 };
    this.animT = 0;
    if (!game.state.stepsUntilEncounter) this.resetEncounter();
  }

  get zone() { return this.game.data.encounters[this.map.encounterZone]; }
  resetEncounter() {
    const [a, b] = this.zone?.steps || [16, 40];
    this.game.state.stepsUntilEncounter = this.game.rng.int(a, b);
  }
  cell(x, y) {
    if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return null;
    return this.map.cells[y * this.map.w + x];
  }
  passable(x, y) { const c = this.cell(x, y); return !!c && !c.solid; }

  update(dt) {
    const input = this.game.input, p = this.p;
    this.animT += dt;
    if (this.game.debug) {
      if (input.justPressed('debugBattle')) { this.triggerEncounter(); return; }
      if (input.justPressed('debugHeal')) for (const m of this.game.state.party) healFull(m, this.game.data);
    }
    if (!p.moving && input.justPressed('cancel')) { this.game.scenes.push(new MenuScene(this.game)); return; }
    if (p.moving) {
      p.t += dt / STEP_TIME;
      if (p.t >= 1) {
        p.t = 0; p.moving = false; p.fromX = p.x; p.fromY = p.y;
        this.onStep();
        if (this.game.transitioning) return;
      }
    }
    if (!p.moving) {
      const d = input.dir();
      if (d) {
        p.dir = d;
        const [dx, dy] = DIRS[d];
        if (this.passable(p.x + dx, p.y + dy)) { p.fromX = p.x; p.fromY = p.y; p.x += dx; p.y += dy; p.moving = true; p.t = 0; }
      }
    }
    const m = this.game.state.map; m.x = p.x; m.y = p.y; m.facing = p.dir;
  }

  onStep() {
    const st = this.game.state;
    st.steps++;
    const c = this.cell(this.p.x, this.p.y);
    if (c?.encounter) { st.stepsUntilEncounter--; if (st.stepsUntilEncounter <= 0) this.triggerEncounter(); }
  }

  triggerEncounter() {
    const zone = this.zone;
    if (!zone) return;
    const g = this.game.rng.weighted(zone.groups, x => x.weight);
    this.resetEncounter();
    this.game.startBattle(g.enemies, { zone: this.map.encounterZone });
  }

  render(ctx) {
    const { W, H } = this.game, p = this.p, map = this.map;
    const px = lerp(p.fromX, p.x, p.t) * TILE, py = lerp(p.fromY, p.y, p.t) * TILE;
    const camX = clamp(Math.round(px + TILE / 2 - W / 2), 0, Math.max(0, map.w * TILE - W));
    const camY = clamp(Math.round(py + TILE / 2 - H / 2), 0, Math.max(0, map.h * TILE - H));
    const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
    const x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(map.h - 1, Math.ceil((camY + H) / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      ctx.drawImage(this.game.tiles[map.cells[y * map.w + x].tile], x * TILE - camX, y * TILE - camY);
    }
    const leader = this.game.state.party[0];
    const frame = p.moving ? Math.floor(this.animT * 8) % 2 : 0;
    ctx.drawImage(this.game.sprites[`${leader.jobId}_${p.dir}_${frame}`], Math.round(px - camX), Math.round(py - camY));
  }

  debugInfo() { return `(${this.p.x},${this.p.y}) 遇敌:${this.game.state.stepsUntilEncounter} 步:${this.game.state.steps}`; }
}
