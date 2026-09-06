// 地图行走：网格移动、镜头跟随、步数制遇敌、门传送、NPC 对话。
import { TILE } from '../assets/tiles.js';
import { drawArt, artH } from '../core/draw.js';
import { layersFor } from '../assets/equip.js';
import { drawText } from '../core/text.js';
import { drawWindow } from '../ui/Window.js';
import { healFull } from '../game/party.js';
import { campParty } from '../game/items.js';
import { MenuScene } from '../menu/MenuScene.js';
import { DialogueScene } from '../ui/DialogueScene.js';
import { ShopScene } from './ShopScene.js';
import { NPC, pickVariant, applyVariant } from './npc.js';
import { DIRS, lerp, clamp } from './grid.js';
import { audio } from '../core/audio.js';
import { addItem } from '../game/items.js';
import { EndingScene } from '../title/EndingScene.js';

const STEP_TIME = 0.16; // 每格秒数

export function parseMap(md) {
  const rows = md.rows, h = rows.length, w = rows[0].length;
  const cells = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`地图 ${md.name} 第 ${y} 行长度 ${rows[y].length} ≠ ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], def = md.legend[ch];
      if (!def) throw new Error(`地图 ${md.name} 未知字符 '${ch}' at (${x},${y})`);
      cells.push({ tile: def.tile, solid: !!def.solid, encounter: !!def.encounter, counter: !!def.counter });
    }
  }
  const events = {};
  for (const ev of md.events || []) events[`${ev.x},${ev.y}`] = ev;
  return { w, h, cells, events, encounterZone: md.encounterZone, spawn: md.spawn, name: md.name };
}

export class FieldScene {
  constructor(game) {
    this.game = game; this.transparent = false; this.bgm = 'field'; this.animT = 0; this.nameT = 0;
    const m = game.state.map;
    this.loadMap(m.id, m.x, m.y, m.facing);
  }
  loadMap(id, x, y, facing) {
    const md = this.game.data.maps[id];
    if (!md) throw new Error(`地图不存在: ${id}`);
    this.mapId = id; this.map = parseMap(md);
    this.p = { x, y, fromX: x, fromY: y, dir: facing || 'down', moving: false, t: 0 };
    this.npcDefs = md.npcs || []; this.refreshNpcs();
    Object.assign(this.game.state.map, { id, x, y, facing: this.p.dir });
    this.nameT = 2;
    if (!this.game.state.stepsUntilEncounter) this.resetEncounter();
  }

  // NPC 可见条件：if / unless 标志位（Boss 被打败后消失等）
  refreshNpcs() {
    const flags = this.game.state.flags;
    const visible = this.npcDefs.filter(d => (!d.if || flags[d.if]) && (!d.unless || !flags[d.unless]));
    this.npcs = visible.map(d => this.npcs?.find(n => n.def === d) || new NPC(d, this));
  }
  resume() {
    this.refreshNpcs();
    const ab = this.afterBattle; this.afterBattle = null;
    if (ab && this.game.state.flags[ab.flag]) this.game.scenes.push(new DialogueScene(this.game, { name: ab.name, pages: ab.pages }));
  }
  eventAt(x, y) { return this.map.events[`${x},${y}`]; }
  chestOpened(ev) { return !!this.game.state.flags[`chest:${ev.id}`]; }

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
  // who: 'player' | NPC
  walkable(x, y, who = null) {
    if (!this.passable(x, y)) return false;
    if (who !== 'player' && ((this.p.x === x && this.p.y === y) || (this.p.moving && this.p.fromX === x && this.p.fromY === y))) return false;
    for (const n of this.npcs) if (n !== who && n.occupies(x, y)) return false;
    const ev = this.eventAt(x, y);
    if (ev?.type === 'chest') return false;
    if (who instanceof NPC && ev) return false;
    return true;
  }

  update(dt) {
    const input = this.game.input, p = this.p;
    this.animT += dt; if (this.nameT > 0) this.nameT -= dt; if (this.poisonT > 0) this.poisonT -= dt;
    for (const n of this.npcs) n.update(dt);
    if (this.game.debug) {
      if (input.justPressed('debugBattle')) { this.triggerEncounter(); return; }
      if (input.justPressed('debugHeal')) for (const m of this.game.state.party) healFull(m, this.game.data);
    }
    if (!p.moving) {
      if (input.justPressed('cancel')) { audio.sfx('confirm'); this.game.scenes.push(new MenuScene(this.game)); return; }
      if (input.justPressed('confirm')) { this.interact(); return; }
    }
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
        if (this.walkable(p.x + dx, p.y + dy, 'player')) { p.fromX = p.x; p.fromY = p.y; p.x += dx; p.y += dy; p.moving = true; p.t = 0; }
      }
    }
    const m = this.game.state.map; m.x = p.x; m.y = p.y; m.facing = p.dir;
  }

  onStep() {
    const st = this.game.state, ev = this.map.events[`${this.p.x},${this.p.y}`];
    if (ev?.type === 'warp') { audio.sfx('door'); this.game.fadeTo(() => this.loadMap(ev.to.map, ev.to.x, ev.to.y, ev.to.facing)); return; }
    st.steps++;
    for (const m of st.party) if (m.status?.poison && m.hp > 1) { m.hp--; this.poisonT = 0.15; } // 中毒：每步掉 1 HP，不会走死
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

  // ---------- 对话 ----------
  interact() {
    const [dx, dy] = DIRS[this.p.dir];
    let x = this.p.x + dx, y = this.p.y + dy;
    if (this.cell(x, y)?.counter) { x += dx; y += dy; } // 隔着柜台说话
    const npc = this.npcs.find(n => n.occupies(x, y));
    if (!npc) { const ev = this.eventAt(x, y); if (ev?.type === 'chest') this.openChest(ev); else if (ev?.type === 'crystal') this.touchCrystal(ev); return; }
    npc.stop(); npc.faceToward(this.p.x, this.p.y);
    this.talk(npc);
  }
  talk(npc) {
    const def = npc.def, g = this.game;
    const pages = applyVariant(pickVariant(def.dialogue, g.state.flags), g.state);
    const script = def.script;
    if (!script) g.scenes.push(new DialogueScene(g, { name: def.name, pages }));
    else if (script.type === 'inn') this.runInn(def, pages, script);
    else if (script.type === 'boss') {
      g.scenes.push(new DialogueScene(g, { name: def.name, pages, onDone: () => {
        this.afterBattle = script.after ? { name: def.name, pages: script.after, flag: script.winFlag } : null;
        g.startBattle(script.enemies, { canFlee: false, winFlag: script.winFlag, bgm: 'boss', reward: script.reward });
      } }));
    }
    else if (script.type === 'shop') g.scenes.push(new DialogueScene(g, { name: def.name, pages, onDone: () => g.scenes.push(new ShopScene(g, script, def.name)) }));
  }
  openChest(ev) {
    const g = this.game, st = g.state;
    if (this.chestOpened(ev)) { g.scenes.push(new DialogueScene(g, { pages: ['里面已经空了。'] })); return; }
    st.flags[`chest:${ev.id}`] = true; audio.sfx('coin');
    let text;
    if (ev.gold) { st.gold += ev.gold; text = `获得了 ${ev.gold} 金币！`; }
    else { addItem(st.inventory, ev.item, ev.qty || 1); const it = g.data.items[ev.item]; text = `拾到了 ${it.name}${ev.qty > 1 ? ' ×' + ev.qty : ''}。`; }
    g.scenes.push(new DialogueScene(g, { pages: [text] }));
  }
  touchCrystal(ev) {
    const g = this.game, st = g.state, story = g.data.story?.crystal || {};
    if (ev.needFlag && !st.flags[ev.needFlag]) { g.scenes.push(new DialogueScene(g, { pages: story.locked || ['……'] })); return; }
    if (st.flags.gameCleared) { g.scenes.push(new DialogueScene(g, { pages: story.again || ['水晶静静地发着光。'] })); return; }
    st.flags.gameCleared = true; audio.sfx('levelup');
    g.scenes.push(new DialogueScene(g, { pages: story.take || ['取回了风之水晶！'], onDone: () => g.fadeTo(() => { g.scenes.clear(); g.scenes.push(new EndingScene(g)); }, { speed: 1 }) }));
  }
  runInn(def, pages, script) {
    const g = this.game, price = script.price ?? 30;
    g.scenes.push(new DialogueScene(g, {
      name: def.name, pages, choices: ['住宿', '不了'],
      onDone: r => {
        if (r !== 0) return;
        if (g.state.gold < price) { g.scenes.push(new DialogueScene(g, { name: def.name, pages: script.poor || ['金币不太够呢……'] })); return; }
        g.state.gold -= price;
        g.fadeTo(() => { campParty(g.state.party, g.data); audio.sfx('heal'); g.scenes.push(new DialogueScene(g, { name: def.name, pages: script.wake || ['早上好！祝旅途平安。'] })); }, { speed: 1.5 });
      },
    }));
  }

  // ---------- 渲染 ----------
  render(ctx) {
    const { W, H } = this.game, p = this.p, map = this.map;
    const px = lerp(p.fromX, p.x, p.t) * TILE, py = lerp(p.fromY, p.y, p.t) * TILE;
    const mw = map.w * TILE, mh = map.h * TILE;
    const camX = mw <= W ? -Math.floor((W - mw) / 2) : clamp(Math.round(px + TILE / 2 - W / 2), 0, mw - W);
    const camY = mh <= H ? -Math.floor((H - mh) / 2) : clamp(Math.round(py + TILE / 2 - H / 2), 0, mh - H);
    const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(map.h - 1, Math.ceil((camY + H) / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      drawArt(ctx, this.game.tiles[map.cells[y * map.w + x].tile], x * TILE - camX, y * TILE - camY);
    }
    for (const ev of Object.values(map.events)) {
      if (ev.type !== 'chest') continue;
      drawArt(ctx, this.game.tiles[this.chestOpened(ev) ? 'chest_open' : 'chest'], ev.x * TILE - camX, ev.y * TILE - camY);
    }
    // 角色按 y 排序绘制
    const leader = this.game.state.party[0];
    const frame = p.moving ? Math.floor(this.animT * 8) % 2 : 0;
    const drawables = this.npcs.map(n => ({ y: n.renderPos()[1], draw: () => n.render(ctx, camX, camY, this.game.sprites) }));
    const spr = this.game.sprites[`${leader.jobId}_${p.dir}_${frame}`];
    const gear = layersFor(leader, p.dir); // 穿在身上的装备
    drawables.push({ y: py, draw: () => {
      const dx = Math.round(px - camX), dy = Math.round(py - camY) - (artH(spr) - TILE); // 高精灵脚贴格子底
      drawArt(ctx, spr, dx, dy);
      for (const g of gear) drawArt(ctx, g, dx, dy);
    } });
    drawables.sort((a, b) => a.y - b.y).forEach(d => d.draw());
    if (this.poisonT > 0) { ctx.fillStyle = 'rgba(120,40,160,0.35)'; ctx.fillRect(0, 0, W, H); }
    if (this.nameT > 0 && map.name) {
      const w = 112; drawWindow(ctx, (W - w) / 2, 8, w, 26);
      drawText(ctx, map.name, W / 2, 15, { align: 'center' });
    }
  }
  debugInfo() { return `${this.mapId} (${this.p.x},${this.p.y}) 遇敌:${this.game.state.stepsUntilEncounter} 步:${this.game.state.steps}`; }
}
