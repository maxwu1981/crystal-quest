// 地图行走：网格移动、镜头跟随、步数制遇敌、门传送、NPC 对话。
// 场地气氛（色调 / 光照 / 粒子）那一层在 ambience.js，小地图在 minimap.js。
import { TILE, TILE_FX, tileFrames } from '../assets/tiles.js';
import { buildTerrainFx } from '../assets/terrain.js';
import { drawArt, artH, snap } from '../core/draw.js';
import { RNG } from '../core/RNG.js';
import { layersFor } from '../assets/equip.js';
import { drawText } from '../core/text.js';
import { drawWindow } from '../ui/Window.js';
import { healFull } from '../game/party.js';
import { campParty } from '../game/items.js';
import { MenuScene } from '../menu/MenuScene.js';
import { DialogueScene } from '../ui/DialogueScene.js';
import { ShopScene } from './ShopScene.js';
import { NPC, pickVariant, applyVariant, drawShadow } from './npc.js';
import { DIRS, lerp, clamp } from './grid.js';
import { audio } from '../core/audio.js';
import { MOOD, seedOf, makeMotes, renderAmbience } from './ambience.js';
import { buildLightmap, drawLit, drawShade } from './lightmap.js';
import { renderPostFx } from './postfx.js';
import { renderMinimap, renderFullMap } from './minimap.js';
import { addItem } from '../game/items.js';
import { EndingScene } from '../title/EndingScene.js';
import { saveGame } from '../game/state.js';
import { VEHICLES, tryBoard, zoneFor } from './vehicles.js';

const STEP_TIME = 0.16; // 每格秒数

export function parseMap(md) {
  const rows = md.rows, h = rows.length, w = rows[0].length;
  const cells = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`地图 ${md.name} 第 ${y} 行长度 ${rows[y].length} ≠ ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], def = md.legend[ch];
      if (!def) throw new Error(`地图 ${md.name} 未知字符 '${ch}' at (${x},${y})`);
      cells.push({ tile: def.tile, solid: !!def.solid, encounter: !!def.encounter, counter: !!def.counter, ride: def.ride || null });
    }
  }
  const events = {};
  for (const ev of md.events || []) events[`${ev.x},${ev.y}`] = ev;
  return { w, h, cells, events, encounterZone: md.encounterZone, spawn: md.spawn, name: md.name };
}

export class FieldScene {
  // 走地图**用满整幅宽度**：屏幕越宽就多看见几列世界，不居中也不留边。
  // 战斗与菜单是照 256 宽排的版，它们由 Game.render 的 OX 居中（见那里的注释）。
  wide = true;

  constructor(game) {
    this.game = game; this.transparent = false; this.bgm = 'field'; this.animT = 0; this.nameT = 0; this.showMap = false;
    const m = game.state.map;
    this.loadMap(m.id, m.x, m.y, m.facing);
  }
  loadMap(id, x, y, facing) {
    const md = this.game.data.maps[id];
    if (!md) throw new Error(`地图不存在: ${id}`);
    // 换图不许带着这台载具就自动下车——不然会骑着牛車走进客栈
    if (this.game.state.vehicle && !(md.vehicles || []).includes(this.game.state.vehicle)) this.game.state.vehicle = null;
    this.mapId = id; this.map = parseMap(md);
    this.p = { x, y, fromX: x, fromY: y, dir: facing || 'down', moving: false, t: 0, phase: 0 };
    this.npcDefs = md.npcs || []; this.refreshNpcs();
    Object.assign(this.game.state.map, { id, x, y, facing: this.p.dir });
    this.nameT = 2;
    this.buildFx(id);
    if (!this.game.state.stepsUntilEncounter) this.resetEncounter();
  }

  // 换地图时准备好这张图要用的动画帧与气氛参数。帧有缓存，来回跑不会重烘。
  buildFx(id) {
    const mood = MOOD[id] || null;
    const anim = {}, list = [];
    for (const c of this.map.cells) {
      const spec = TILE_FX[c.tile];
      if (!spec || anim[c.tile]) continue;
      const f = tileFrames(this.game.tiles?.[c.tile], spec);
      if (f) list.push(anim[c.tile] = { f, k: spec.phase, dur: spec.dur, ts: 0 });
    }
    // 粒子活动范围取「地图」和「屏幕」的较小者：小地图（屋内）不会把粒子撒到屋外的黑边上
    const bw = Math.min(this.game.W, this.map.w * TILE), bh = Math.min(this.game.H, this.map.h * TILE);
    // 地形过渡（草咬进路、崖影、水岸浪花、地面装饰）也在这里一次算完，
    // 结果是两张与 cells 等长的「这一格再叠哪几张图」的表，渲染时零计算。
    const ter = buildTerrainFx(this.map, this.game.tiles, id, anim);
    for (const r of ter.seamList) list.push(r);   // 抠底合成图（树/水晶）也要跟着动，时间和别的动画瓦片一起推
    // 方向光（长投影 / 立面 / 受光棱）也在这里烘一次，和地形过渡同一条规矩：
    // 换地图时算完，逐帧只是两次 drawImage。见 lightmap.js。
    this.fx = { mood, anim, list, bw, bh, ovr: ter.ovr, shd: ter.shd, base: ter.base, obj: ter.obj, foamN: ter.foamN,
      lm: buildLightmap(this.map, id, mood?.sun),
      motes: mood?.motes ? makeMotes(mood.motes, new RNG(seedOf(id)), bw, bh) : null };
  }

  // NPC 可见条件：if / unless 标志位（Boss 被打败后消失等）
  refreshNpcs() {
    const flags = this.game.state.flags;
    const visible = this.npcDefs.filter(d => (!d.if || flags[d.if]) && (!d.unless || !flags[d.unless]));
    this.npcs = visible.map(d => this.npcs?.find(n => n.def === d) || new NPC(d, this));
  }
  resume() {
    this.refreshNpcs();
    for (const n of this.npcs) n.faceHome();   // 聊完转回去，否则走一圈全庄的人都朝着你
    const ab = this.afterBattle; this.afterBattle = null;
    if (ab && this.game.state.flags[ab.flag]) this.game.scenes.push(new DialogueScene(this.game, { name: ab.name, face: ab.face, pages: ab.pages }));
  }
  eventAt(x, y) { return this.map.events[`${x},${y}`]; }
  chestOpened(ev) { return !!this.game.state.flags[`chest:${ev.id}`]; }

  get zoneId() { return zoneFor(this.map.encounterZone, this.game.state.vehicle, this.game.data.encounters); }
  get zone() { return this.game.data.encounters[this.zoneId]; }
  resetEncounter() {
    const [a, b] = this.zone?.steps || [16, 40], k = VEHICLES[this.game.state.vehicle]?.encMul || 1;
    this.game.state.stepsUntilEncounter = this.game.rng.int(a, b) * k;
  }
  cell(x, y) {
    if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return null;
    return this.map.cells[y * this.map.w + x];
  }
  passable(x, y) {
    const c = this.cell(x, y); if (!c) return false;
    if (c.ride) return c.ride === this.game.state.vehicle;       // 载具专用格：solid 不管，只认骑没骑对
    const v = VEHICLES[this.game.state.vehicle];
    return v ? (v.fly ? !c.solid : v.only.includes(c.tile)) : !c.solid;  // 骑上载具收窄/放宽；fly 也不许穿 solid
  }
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
      if (input.justPressed('map')) { audio.sfx('confirm'); this.showMap = !this.showMap; return; }
      if (this.showMap) { if (input.justPressed('confirm') || input.justPressed('cancel')) this.showMap = false; return; }
      if (input.justPressed('cancel')) { audio.sfx('confirm'); this.game.scenes.push(new MenuScene(this.game)); return; }
      if (input.justPressed('confirm')) { this.interact(); return; }
    }
    if (p.moving) {
      const stepTime = VEHICLES[this.game.state.vehicle]?.step ?? STEP_TIME;
      p.t += dt / stepTime;
      p.phase = (p.phase + dt / stepTime) % 2;   // 每走满一格 +1，两拍一循环
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
    if (ev?.type === 'warp') {
      // 同图内的 warp（木馬道的滑道：踏上坡口一步到底）不是「进了一个新地方」，
      // 不该重放开门声，也不该把地图名横幅再顶出来——那两样都是「换地图」的
      // 反馈，滑道说的是「你在同一张图里被地形带着走」。fadeTo 本身的快闪
      // 留着：一格黑一格亮，正好是「嗖」的那一下，不比专门写一套滑行演出差。
      const sameMap = ev.to.map === this.mapId;
      if (!sameMap) audio.sfx('door');
      this.game.fadeTo(() => {
        this.loadMap(ev.to.map, ev.to.x, ev.to.y, ev.to.facing);
        if (sameMap) this.nameT = 0;
      });
      return;
    }
    st.steps++;
    for (const m of st.party) if (m.status?.poison && m.hp > 1) { m.hp--; this.poisonT = 0.15; } // 中毒：每步掉 1 HP，不会走死
    const c = this.cell(this.p.x, this.p.y);
    if (c?.encounter && !VEHICLES[st.vehicle]?.noEnc) { st.stepsUntilEncounter--; if (st.stepsUntilEncounter <= 0) this.triggerEncounter(); }
  }
  triggerEncounter() {
    const zone = this.zone;
    if (!zone) return;
    const g = this.game.rng.weighted(zone.groups, x => x.weight);
    this.resetEncounter();
    this.game.startBattle(g.enemies, { zone: this.zoneId });
  }

  // ---------- 对话 ----------
  interact() {
    const [dx, dy] = DIRS[this.p.dir];
    let x = this.p.x + dx, y = this.p.y + dy;
    if (this.cell(x, y)?.counter) { x += dx; y += dy; } // 隔着柜台说话
    if (tryBoard(this, x, y)) return;
    const npc = this.npcs.find(n => n.occupies(x, y));
    if (!npc) { const ev = this.eventAt(x, y); if (ev?.type === 'chest') this.openChest(ev); else if (ev?.type === 'crystal') this.touchCrystal(ev); return; }
    npc.stop(); npc.faceToward(this.p.x, this.p.y);
    this.talk(npc);
  }
  talk(npc) {
    const def = npc.def, g = this.game;
    const pages = applyVariant(pickVariant(def.dialogue, g.state.flags), g.state);
    const script = def.script;
    if (!script) g.scenes.push(new DialogueScene(g, { name: def.name, face: def.sprite, pages }));
    else if (script.type === 'inn') this.runInn(def, pages, script);
    else if (script.type === 'boss') {
      g.scenes.push(new DialogueScene(g, { name: def.name, face: def.sprite, pages, onDone: () => {
        // 存下 sprite：打完 Boss 时它已经从地图上撤了，事后再按名字反查找不回来
        this.afterBattle = script.after ? { name: def.name, face: def.sprite, pages: script.after, flag: script.winFlag } : null;
        g.startBattle(script.enemies, { canFlee: false, winFlag: script.winFlag, bgm: 'boss', reward: script.reward });
      } }));
    }
    else if (script.type === 'shop') g.scenes.push(new DialogueScene(g, { name: def.name, face: def.sprite, pages, onDone: () => g.scenes.push(new ShopScene(g, script, def.name)) }));
  }
  openChest(ev) {
    const g = this.game, st = g.state;
    if (this.chestOpened(ev)) { g.scenes.push(new DialogueScene(g, { pages: ['里面已经空了。'] })); return; }
    st.flags[`chest:${ev.id}`] = true; audio.sfx('coin');
    let text;
    if (ev.gold) { st.gold += ev.gold; text = `获得了 ${ev.gold} 金币！`; }
    else { addItem(st.inventory, ev.item, ev.qty || 1); const it = g.data.items[ev.item]; text = `拾到了 ${it.name}${ev.qty > 1 ? ' ×' + ev.qty : ''}。`; }
    // ev.text：开箱前先讲这东西的来历（神话装备用，普通箱子不写就没有）
    const pages = ev.text ? [...(Array.isArray(ev.text) ? ev.text : [ev.text]), text] : [text];
    g.scenes.push(new DialogueScene(g, { pages }));
  }
  touchCrystal(ev) {
    const g = this.game, st = g.state, story = g.data.story?.crystal || {};
    if (ev.needFlag && !st.flags[ev.needFlag]) { g.scenes.push(new DialogueScene(g, { pages: story.locked || ['……'] })); return; }
    if (st.flags.gameCleared) { g.scenes.push(new DialogueScene(g, { pages: story.again || ['水晶静静地发着光。'] })); return; }
    st.flags.gameCleared = true; audio.sfx('levelup');
    g.scenes.push(new DialogueScene(g, {
      pages: story.take || ['取回了风之水晶！'],
      onDone: () => g.fadeTo(() => { g.scenes.clear(); g.scenes.push(new EndingScene(g, () => this.returnAfterEnding())); }, { speed: 1 }),
    }));
  }
  // 字幕滚完不回标题，而是把队伍送回内埔庄。
  // 29 个 NPC 写了通关后台词（69 页），原本 gameCleared 只在内存里活几秒就回标题，
  // 这些话玩家一句也听不到；石臼的 story.crystal.again 同理。顺手落一份通关档，
  // 让标题的「想起」读得到通关状态。
  returnAfterEnding() {
    const g = this.game, st = g.state;
    for (const m of st.party) healFull(m, g.data);   // healFull 是单人的
    Object.assign(st.map, { id: 'village', ...g.data.maps.village.spawn, facing: 'down' });
    saveGame(st);
    g.scenes.clear();
    g.scenes.push(new FieldScene(g));
    const pages = g.data.story?.ending?.afterReturn;
    if (pages?.length) g.scenes.push(new DialogueScene(g, { pages }));
  }
  runInn(def, pages, script) {
    const g = this.game, price = script.price ?? 30;
    g.scenes.push(new DialogueScene(g, {
      name: def.name, face: def.sprite, pages, choices: ['住宿', '不了'],
      onDone: r => {
        if (r !== 0) return;
        if (g.state.gold < price) { g.scenes.push(new DialogueScene(g, { name: def.name, face: def.sprite, pages: script.poor || ['金币不太够呢……'] })); return; }
        g.state.gold -= price;
        g.fadeTo(() => { campParty(g.state.party, g.data); audio.sfx('heal'); g.scenes.push(new DialogueScene(g, { name: def.name, face: def.sprite, pages: script.wake || ['早上好！祝旅途平安。'] })); }, { speed: 1.5 });
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
    // 动画瓦片：帧是初始化时烘好的，这里只是「指到另一张图」，每格仍然只有一次 drawImage。
    // a.ts 把时间换算成「1/16 帧长」的刻度；加上格子自己的错位量再整除回去，
    // 等于让每格在同一个帧长里的不同时刻翻帧 —— 满屏两百多格永远不会在同一瞬间一起跳。
    // 这一步是防「闪」的关键：位移只有 1 像素、亮度完全不变，但只要全屏同时变，人眼就会看成闪。
    const fx = this.fx, anim = fx.anim, tiles = this.game.tiles, ovr = fx.ovr, shd = fx.shd, base = fx.base;
    for (const a of fx.list) a.ts = this.animT * (16 / a.dur);
    // 浪花跟水面共用一套节拍（同一个 dur 与帧数、同一个全局相位），整条岸线才会一起涌。
    const fi = Math.floor(this.animT / TILE_FX.water.dur) % fx.foamN;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * map.w + x;
      const sx = x * TILE - camX, sy = y * TILE - camY;
      // base[i]：树那种「自带底色」的瓦片换成「真草地 + 抠好的树」的合成图（assets/terrain.js），
      // 是替换不是叠加。它和 anim 条目长得一模一样（f/k/dur/ts），所以挑帧的算法可以共用。
      // (5x+9y)&15：5 和 9 都与 16 互质，同一时刻翻帧的格子在屏幕上是零散的十来个点，
      // 连不成线也凑不成块，看着就是「草在窸窣」而不是「有一道边扫过去」
      const a = base[i] || anim[map.cells[i].tile];
      const img = a ? a.f[Math.floor((a.ts + (a.k ? (x * 5 + y * 9) & 15 : 0)) / 16) % a.f.length] : tiles[map.cells[i].tile];
      drawArt(ctx, img, sx, sy);
      // 过渡边 / 浪花 / 地面装饰：换地图时就按邻居烘好了（assets/terrain.js），
      // 这里只是「这一格再贴一两张图」，逐帧没有任何计算。数组＝一组帧（浪花），画布＝静态。
      const ov = ovr[i];
      if (ov) for (const o of ov) drawArt(ctx, Array.isArray(o) ? o[fi] : o, sx, sy);
    }
    // 压暗层（崖影 / 湿沙）单独走一遍。两个理由：
    // 一是必须压在过渡与装饰之上 —— 影子里的花本来就该是暗的；
    // 二是 multiply 能保住地面的固有色（蒙半透明黑会把饱和的草地蒙成灰），
    //    而合成模式整趟只切换两次，比每格切一次便宜得多。
    ctx.globalCompositeOperation = 'multiply';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = shd[y * map.w + x];
      if (s) for (const o of s) drawArt(ctx, o, x * TILE - camX, y * TILE - camY);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const ev of Object.values(map.events)) {
      if (ev.type !== 'chest') continue;
      const opened = this.chestOpened(ev);
      const bx = ev.x * TILE - camX, by = ev.y * TILE - camY;
      // 没开过的箱子发一层暖金色的光，让玩家在暗洞里一眼看见。
      // 呼吸周期 2.4 秒——比 tiles.js 里那些还慢，绝不能做成一闪一闪的。
      if (!opened) {
        const k = 0.5 + 0.5 * Math.sin(this.animT * (2 * Math.PI / 2.4));
        const cx = bx + TILE / 2, cy = by + TILE / 2;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, TILE * (0.95 + k * 0.2));
        g.addColorStop(0, `rgba(255,224,140,${0.30 + k * 0.16})`);
        g.addColorStop(0.55, `rgba(255,196,90,${0.12 + k * 0.07})`);
        g.addColorStop(1, 'rgba(255,190,80,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';   // 加色，暗背景上才亮得起来
        ctx.fillStyle = g;
        ctx.fillRect(cx - TILE * 1.2, cy - TILE * 1.2, TILE * 2.4, TILE * 2.4);
        ctx.restore();
      }
      // 箱子的瓦片自带一层洞窟地面，摆在草地/沙地上就是一个灰方块。
      // fx.obj 里那张是抠掉底、只剩箱子加一小片落影的透明图；抠不出来（换了套美术）就退回原图。
      const co = opened ? 'chest_open' : 'chest';
      drawArt(ctx, fx.obj?.[co] || this.game.tiles[co], bx, by);
      // 箱盖上飘两点碎光，位置是时间的纯函数（不掷随机数，免得变噪点）
      if (!opened) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
          const ph = this.animT / 3.1 + i * 0.5 + (ev.x * 0.37 + ev.y * 0.61);
          const u = ph % 1;
          ctx.globalAlpha = Math.sin(u * Math.PI) * 0.75;
          ctx.fillStyle = '#fff4c8';
          ctx.fillRect(snap(bx + 3 + ((i * 7 + Math.floor(ph) * 5) % 10)), snap(by + 11 - u * 9), 1, 1);
        }
        ctx.restore();
      }
    }
    // 岩壁 / 墙 / 屋顶朝光那两条棱的受光边。画在角色**之前**——它属于场景的几何，
    // 描到人身上就成了给人镶了道金边。
    drawLit(this, ctx, camX, camY);
    // 角色按 y 排序绘制
    const leader = this.game.state.party[0];
    // 走路帧跟着位移走，不跟墙上时钟走。原本是 Math.floor(animT * 8) % 2，
    // 每格 0.16 秒而帧每秒只翻 4 次，腿的节奏和实际迈步对不上，看着像在滑步。
    // 现在每走满一格换一次脚：正/背面是「左脚→右脚」，侧面是「迈步→站立」。
    const frame = p.moving ? (Math.floor(p.phase) ? 2 : 1) : 0;
    const drawables = this.npcs.map(n => ({ y: n.renderPos()[1], draw: () => n.render(ctx, camX, camY, this.game.sprites) }));
    const rid = this.game.state.vehicle;
    const spr = this.game.sprites[`${rid || leader.jobId}_${p.dir}_${frame}`];
    const gear = rid ? [] : layersFor(leader, p.dir); // 骑车时不画装备叠加层，载具精灵自带乘客
    drawables.push({ y: py, draw: () => {
      const dx = Math.round(px - camX), dy = Math.round(py - camY) - (artH(spr) - TILE); // 高精灵脚贴格子底
      drawShadow(ctx, Math.round(px - camX), Math.round(py - camY));
      drawArt(ctx, spr, dx, dy);
      for (const g of gear) drawArt(ctx, g, dx, dy);
    } });
    drawables.sort((a, b) => a.y - b.y).forEach(d => d.draw());
    // 长投影画在角色**之后**：站在墙影里的人本来就该跟着暗下去。
    // 「人有没有被场景的光照到」正是「站在场景里」和「贴在场景上」的分界。
    drawShade(this, ctx, camX, camY);
    renderAmbience(this, ctx, camX, camY, px, py, mw, mh);
    // 镜头层（纵向光度渐变 + 上下两条移轴景深带）。**必须在 UI 之前**：
    // 底下那几行的地图名条、小地图、摊开的全图糊掉就是 bug。
    renderPostFx(this, ctx, mh);
    if (this.poisonT > 0) { ctx.fillStyle = 'rgba(120,40,160,0.35)'; ctx.fillRect(0, 0, W, H); }
    if (this.showMap) renderFullMap(this, ctx);           // 摊开全图时地名条与小地图都让位
    else if (this.nameT > 0 && map.name) {
      const w = 112; drawWindow(ctx, (W - w) / 2, 8, w, 26);
      drawText(ctx, map.name, W / 2, 15, { align: 'center' });
    } else renderMinimap(this, ctx);
  }
  debugInfo() { return `${this.mapId} (${this.p.x},${this.p.y}) 遇敌:${this.game.state.stepsUntilEncounter} 步:${this.game.state.steps}`; }
}
