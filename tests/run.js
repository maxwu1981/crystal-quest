// 浏览器内测试：公式 + 数据完整性。打开 tests/index.html 查看；window.__testResults 供自动化读取。
import * as F from '../src/battle/formulas.js';
import { RNG } from '../src/core/RNG.js';
import { computeStats, grantExp } from '../src/game/party.js';
import { loadData } from '../src/data/loader.js';
import { parseMap } from '../src/field/FieldScene.js';
import { addItem, removeItem, countItem, applyItem, equip, canEquip, canUseOn, campParty } from '../src/game/items.js';
import { newGameState, loadGame, saveGame, SAVE_KEY } from '../src/game/state.js';
import { finaleReady, FINALE_ID,
  memberSpells, jobLevel, grantJobExp, availableSummons, useSkill, skillScale,
  normalizeMember, skillLevelOf, summonUnlockLevel, summonOrder, jpForJobLevel, levelForUses,
  SKILL_MAX, SKILL_USES, SKILL_POWER, JP_PER_LEVEL, JP_PER_BATTLE, JP_ACT_BONUS } from '../src/game/jobskill.js';
import { wrapText } from '../src/core/text.js';
import { pickVariant, applyVariant } from '../src/field/npc.js';
import { buyItem, sellItem } from '../src/game/shop.js';
import { spellsFor, changeJob, healFull, equipmentAfterJobChange } from '../src/game/party.js';
import { STATUS, cureStatus, persistentOnly } from '../src/game/status.js';
import { makePartyActors, makeEnemyActors } from '../src/battle/actors.js';
import { execute, inflict } from '../src/battle/actions.js';
import { MIRROR, NO_TOUCH } from '../src/assets/terrain.js';
import { U, u, us } from '../src/assets/terrainBits.js';
import { ART, snap } from '../src/core/draw.js';
import { TILE_FX } from '../src/assets/tiles.js';
import { ELEMENTS, ELEMENT_IDS } from '../src/battle/elements.js';
import { ELEM_SHAPE, spellIcon } from '../src/menu/icons.js';

const results = [];
const assert = (c, m = 'assert') => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e) }); } }

const data = await loadData('../data/');

// 正式美术的角色精灵：量出每张图里角色实际占的高度，用来保证大小一致
async function measureArt() {
  let m; try { const r = await fetch('../assets/art/manifest.json', { cache: 'no-store' }); if (!r.ok) return null; m = await r.json(); } catch { return null; }
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const out = [];
  for (const [cid, views] of Object.entries(m.characters || {})) {
    for (const [view, file] of Object.entries(views)) {
      const im = await load('../assets/art/' + file); if (!im) continue;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height).data;
      // 逐行统计：实心像素数与左右边界。只量身高抓不出「等高但胖瘦两样」，
      // 实际踩过——补生成的拳头师侧面站姿比他自己的侧面迈步少 41% 的实心面积。
      let y0 = im.height, y1 = -1, mass = 0;
      const span = [];
      for (let y = 0; y < im.height; y++) {
        let lo = -1, hi = -1, n = 0;
        for (let px = 0; px < im.width; px++) {
          if (d[(y * im.width + px) * 4 + 3] > 8) { if (lo < 0) lo = px; hi = px; n++; }
        }
        span.push(n ? [lo, hi, n] : null);
        if (n) { if (y < y0) y0 = y; if (y > y1) y1 = y; mass += n; }
      }
      if (y1 < 0) continue;
      const H = y1 - y0 + 1;
      const bandW = (a, b) => { let w = 0; for (let y = Math.round(y0 + H * a); y < Math.round(y0 + H * b); y++) { const r = span[y]; if (r) w = Math.max(w, r[1] - r[0] + 1); } return w; };
      void bandW;   // 宽度带留着备查，但不做门禁：迈步时腿张开、手臂摆动会把任何宽度指标带偏
      out.push({ cid, view, ratio: H / im.height, w: im.width, h: im.height, mass });
    }
  }
  return out;
}
// 量所有美术的**原始像素尺寸**（不看内容，只看长宽），给 ART 换算的那组测试用
async function measureSizes() {
  let m; try { const r = await fetch('../assets/art/manifest.json', { cache: 'no-store' }); if (!r.ok) return null; m = await r.json(); } catch { return null; }
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const out = { characters: {}, enemies: {}, tiles: {} };
  for (const [cid, views] of Object.entries(m.characters || {}))
    for (const [view, file] of Object.entries(views)) {
      const im = await load('../assets/art/' + file);
      if (im) out.characters[`${cid}_${view}`] = [im.width, im.height];
    }
  for (const [kind, key] of [['enemies', 'enemies'], ['tiles', 'tiles']])
    for (const [id, file] of Object.entries(m[key] || {})) {
      const im = await load('../assets/art/' + file);
      if (im) out[kind][id] = [im.width, im.height];
    }
  return out;
}

const artRows = await measureArt();
const artManifest = await fetch('/assets/art/manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
const artSizes = await measureSizes();

test('RNG 同种子可复现', () => {
  const a = new RNG(42), b = new RNG(42);
  for (let i = 0; i < 100; i++) assert(a.next() === b.next());
  const r = new RNG(7); for (let i = 0; i < 1000; i++) { const v = r.int(3, 5); assert(v >= 3 && v <= 5, `int 越界 ${v}`); }
});
test('expForLevel 单调递增且 L1=0', () => {
  assert(F.expForLevel(1) === 0);
  for (let l = 2; l < 60; l++) assert(F.expForLevel(l) > F.expForLevel(l - 1));
});
test('hitChance 在 [0.05, 0.99]', () => {
  for (const [a, e] of [[0, 0], [200, 0], [0, 200], [50, 30]]) { const p = F.hitChance(a, e); assert(p >= 0.05 && p <= 0.99); }
});
test('物理伤害：命中数 ≤ 上限，伤害 ≥ 命中数', () => {
  const rng = new RNG(1), att = { atk: 10, acc: 60, crit: 10 }, def = { def: 3, eva: 10 };
  for (let i = 0; i < 2000; i++) {
    const r = F.physicalAttack(att, def, rng);
    assert(r.hits <= F.hitCount(att.acc)); assert(r.damage >= r.hits); assert(r.miss === (r.hits === 0));
  }
});
test('防御减半不会低于每击 1 点', () => {
  const rng = new RNG(2), r = F.physicalAttack({ atk: 2, acc: 0, crit: 0 }, { def: 50, eva: 0, defending: true }, rng);
  assert(r.miss || r.damage >= 1);
});
test('元素倍率', () => {
  const t = { weak: ['fire'], resist: ['water'], immune: ['wood'] };
  assert(F.elementMultiplier(t, 'fire') === 2); assert(F.elementMultiplier(t, 'water') === 0.5);
  assert(F.elementMultiplier(t, 'wood') === 0); assert(F.elementMultiplier(t, 'metal') === 1); assert(F.elementMultiplier(t, null) === 1);
  // 八种都要认得，一种都不能落下（新加属性时忘了铺数据，这里先炸）
  for (const id of ELEMENT_IDS) assert(F.elementMultiplier(t, id) > 0 || id === 'wood', `${id} 倍率异常`);
  const rng = new RNG(3);
  assert(F.magicDamage(10, { int: 4 }, t, 'wood', rng).damage === 0);
  assert(F.magicDamage(10, { int: 4 }, t, 'fire', rng).damage >= 1);
});
test('逃跑概率在 [0.1, 0.9]', () => { assert(F.fleeChance(0, 100) === 0.1); assert(F.fleeChance(100, 0) === 0.9); });

test('所有职业都能算出属性且 maxHp > 0', () => {
  for (const id of Object.keys(data.jobs)) { const s = computeStats({ jobId: id, level: 1, equipment: {} }, data); assert(s.maxHp > 0 && s.atk > 0, id); }
});
test('升级：等级+1，maxHp 增加，HP 同步增加', () => {
  const m = { jobId: 'boxer', level: 1, exp: 0, hp: 10, mp: 0, equipment: {} };
  const before = computeStats(m, data);
  const gains = grantExp(m, F.expForLevel(2), data);
  assert(gains.length === 1 && m.level === 2);
  assert(computeStats(m, data).maxHp > before.maxHp); assert(m.hp === 10 + gains[0].hpUp);
});
test('职业引用的魔法与指令都存在', () => {
  const cmds = new Set(['attack', 'magic', 'summon', 'defend', 'item', 'flee']);
  for (const [id, j] of Object.entries(data.jobs)) {
    for (const s of j.spells) { const sid = typeof s === 'string' ? s : s.id; assert(data.spells[sid], `${id} 引用了不存在的魔法 ${sid}`); if (typeof s !== 'string') assert(s.level >= 1, `${id}/${sid} level`); }
    for (const c of j.commands) assert(cmds.has(c), `${id} 未知指令 ${c}`);
    if (j.spells.length) assert(j.commands.includes('magic'), `${id} 有魔法但没有 magic 指令`);
  }
});
test('敌人数据字段完整', () => {
  for (const [id, e] of Object.entries(data.enemies)) for (const k of ['name', 'hp', 'atk', 'def', 'acc', 'eva', 'spd', 'exp', 'gold']) assert(typeof e[k] === (k === 'name' ? 'string' : 'number'), `${id}.${k}`);
});
test('遇敌表引用的敌人存在，权重 > 0', () => {
  for (const [z, zone] of Object.entries(data.encounters)) for (const g of zone.groups) {
    assert(g.weight > 0, z); assert(g.enemies.length >= 1 && g.enemies.length <= 4, `${z} 敌人数量`);
    for (const e of g.enemies) assert(data.enemies[e], `${z} 引用不存在的敌人 ${e}`);
  }
});
test('地图行长度一致、图例完整、出生点可走、遇敌区存在', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md);
    const c = m.cells[md.spawn.y * m.w + md.spawn.x];
    assert(c && !c.solid, `${id} 出生点不可走`);
    if (md.encounterZone) assert(data.encounters[md.encounterZone], `${id} 遇敌区 ${md.encounterZone} 不存在`); // 室内地图 null = 不遇敌
  }
});
test('初始队伍职业存在', () => { for (const p of data.party) assert(data.jobs[p.jobId], p.name); });

test('背包增删计数', () => {
  const inv = []; addItem(inv, 'potion', 2); addItem(inv, 'potion');
  assert(countItem(inv, 'potion') === 3); assert(removeItem(inv, 'potion', 3)); assert(inv.length === 0); assert(!removeItem(inv, 'potion'));
});
test('药水回血封顶；凤凰尾巴只对死者有效', () => {
  const p = data.items.potion, ph = data.items.phoenix;
  const t = { hp: 90, mp: 0, maxHp: 100, maxMp: 0, alive: true };
  assert(applyItem(p, t).hp === 10 && t.hp === 100); assert(applyItem(ph, t) === null);
  const d = { hp: 0, mp: 0, maxHp: 40, maxMp: 0, alive: false };
  assert(applyItem(p, d) === null); const o = applyItem(ph, d); assert(o.revived && d.alive && d.hp === 20);
});
test('装备：职业限制、旧装备回背包、攻击力变化、卸下', () => {
  const m = { jobId: 'herbwife', level: 1, exp: 0, hp: 1, mp: 1, equipment: { weapon: 'wood_staff', armor: null } };
  const inv = [{ id: 'iron_sword', qty: 1 }, { id: 'bronze_dagger', qty: 1 }];
  assert(!equip(m, 'weapon', 'iron_sword', inv, data), '白魔不能拿铁剑');
  const before = computeStats(m, data).atk;
  assert(equip(m, 'weapon', 'bronze_dagger', inv, data));
  assert(m.equipment.weapon === 'bronze_dagger' && countItem(inv, 'wood_staff') === 1 && countItem(inv, 'bronze_dagger') === 0);
  assert(computeStats(m, data).atk > before);
  assert(equip(m, 'weapon', null, inv, data) && m.equipment.weapon === null && countItem(inv, 'bronze_dagger') === 1);
});
test('道具数据完整；初始装备/背包引用存在且职业可装', () => {
  for (const p of data.party) for (const slot of ['weapon', 'armor', 'accessory']) {
    const id = p.equipment?.[slot]; if (!id) continue; const it = data.items[id];
    assert(it && it.type === slot, `${p.name} ${slot}`); assert(canEquip(it, { jobId: p.jobId }), `${p.name} 不能装备 ${id}`);
  }
  for (const s of data.config.startInventory || []) assert(data.items[s.id], s.id);
  for (const [id, it] of Object.entries(data.items)) {
    assert(['consumable', 'weapon', 'armor', 'accessory'].includes(it.type), id);
    if (it.type === 'consumable') assert(it.effect && typeof it.battle === 'boolean' && typeof it.field === 'boolean', id);
    if (it.jobs) for (const j of it.jobs) assert(data.jobs[j], `${id} 职业 ${j}`);
  }
});
test('存档往返：状态可 JSON 序列化且不丢字段（含职业/技能等级三件套）', () => {
  const s = newGameState(data), talisman = s.party.find(m => m.jobId === 'talisman');
  // 先在档上留下三种新数据：练过的技能、转过的职业、学过的魔法
  useSkill(talisman, 'fire'); useSkill(talisman, 'fire'); useSkill(talisman, 'fire'); useSkill(talisman, 'fire');
  grantJobExp(talisman, JP_PER_LEVEL * 3, data);
  const back = JSON.parse(JSON.stringify(s));
  assert(JSON.stringify(back) === JSON.stringify(s)); assert(back.party[0].equipment.weapon === 'bronze_sword' && back.party[0].equipment.accessory === null); assert(back.inventory.length === 3);
  const t2 = back.party.find(m => m.jobId === 'talisman');
  assert(t2.learned.includes('fire') && t2.learned.includes('thunder'), `learned 没进存档：${JSON.stringify(t2.learned)}`);
  assert(t2.jobLevels.talisman === 4 && t2.jobExp.talisman === JP_PER_LEVEL * 3, `jobLevels/jobExp 没进存档：${JSON.stringify(t2.jobLevels)}`);
  assert(t2.skillLevels.fire === 2 && t2.skillUses.fire === 4, `skillLevels/skillUses 没进存档：${JSON.stringify(t2.skillLevels)}`);
});

test('地图事件与 NPC：传送目标存在且可走、NPC 站在可走格、对话/脚本格式正确', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md);
    for (const ev of md.events || []) {
      if (ev.type !== 'warp') continue;
      const to = data.maps[ev.to.map]; assert(to, `${id} 传送到不存在的地图 ${ev.to.map}`);
      const tm = parseMap(to), c = tm.cells[ev.to.y * tm.w + ev.to.x];
      assert(c && !c.solid, `${id} 传送目标 ${ev.to.map}(${ev.to.x},${ev.to.y}) 不可走`);
      assert(!tm.events[`${ev.to.x},${ev.to.y}`], `${id} 传送目标落在另一个传送点上`);
    }
    for (const n of md.npcs || []) {
      const c = m.cells[n.y * m.w + n.x]; assert(c && !c.solid, `${id}/${n.id} 站在不可走格`);
      assert(Array.isArray(n.dialogue) && n.dialogue.length, `${id}/${n.id} 没有对话`);
      for (const v of n.dialogue) assert(Array.isArray(v.lines) && v.lines.length, `${id}/${n.id} 对话缺 lines`);
      if (n.script) { assert(['inn', 'shop', 'boss'].includes(n.script.type), `${n.id} 脚本类型`); for (const it of n.script.items || []) assert(data.items[it], `${n.id} 商店卖不存在的 ${it}`); }
    }
  }
});
test('对话每页最多 3 行（240px 宽，带名字）', () => {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const p of [...data.story.crystal.take, ...data.story.crystal.locked]) assert(wrapText(ctx, p, 240).length <= 4, `story: ${p.slice(0, 12)}…`);
  for (const [id, md] of Object.entries(data.maps)) for (const n of md.npcs || []) {
    const pages = [...n.dialogue.flatMap(v => v.lines), ...(n.script?.wake || []), ...(n.script?.poor || []), ...(n.script?.after || [])];
    for (const p of pages) assert(wrapText(ctx, p, 240).length <= 3, `${id}/${n.id} 这页太长：${p.slice(0, 12)}…`);
  }
});
test('pickVariant / applyVariant：按标志选变体，副作用生效', () => {
  const d = [{ if: 'a', lines: ['A'] }, { unless: 'b', set: ['b'], give: { gold: 5, items: [{ id: 'potion', qty: 2 }] }, lines: ['B'] }, { lines: ['C'] }];
  const st = { flags: {}, gold: 0, inventory: [] };
  assert(applyVariant(pickVariant(d, st.flags), st)[0] === 'B'); assert(st.flags.b && st.gold === 5 && st.inventory[0].qty === 2);
  assert(pickVariant(d, st.flags).lines[0] === 'C'); st.flags.a = true; assert(pickVariant(d, st.flags).lines[0] === 'A');
  assert(pickVariant([], {}) === null && applyVariant(null, st)[0] === '……');
});
test('商店买卖金额', () => {
  const st = { gold: 100, inventory: [] };
  assert(buyItem(st, 'potion', data).ok && st.gold === 70 && countItem(st.inventory, 'potion') === 1);
  assert(!buyItem(st, 'iron_sword', data).ok && st.gold === 70);
  assert(sellItem(st, 'potion', data).ok && st.gold === 85 && st.inventory.length === 0);
  assert(!sellItem(st, 'potion', data).ok);
});

// BFS：从起点能走到的格子集合（宝箱视为障碍）
function reach(m, md, sx, sy) {
  const chests = new Set((md.events || []).filter(e => e.type === 'chest').map(e => `${e.x},${e.y}`));
  const seen = new Set([`${sx},${sy}`]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen.has(k)) continue;
      const c = m.cells[ny * m.w + nx];
      if (c.solid || chests.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
test('可达性：每张地图从出生点能走到所有楼梯/门/水晶旁/宝箱旁；传送落点也可达', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md), r = reach(m, md, md.spawn.x, md.spawn.y);
    const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => r.has(`${x + dx},${y + dy}`));
    for (const ev of md.events || []) {
      if (ev.type === 'warp') { assert(r.has(`${ev.x},${ev.y}`), `${id} 传送点 (${ev.x},${ev.y}) 走不到`); const tm = parseMap(data.maps[ev.to.map]), tr = reach(tm, data.maps[ev.to.map], data.maps[ev.to.map].spawn.x, data.maps[ev.to.map].spawn.y); assert(tr.has(`${ev.to.x},${ev.to.y}`), `${id}→${ev.to.map} 落点 (${ev.to.x},${ev.to.y}) 与目标地图出生点不连通`); }
      else assert(near(ev.x, ev.y), `${id} ${ev.type} (${ev.x},${ev.y}) 旁边走不到`);
    }
    for (const n of md.npcs || []) assert(near(n.x, n.y) || r.has(`${n.x},${n.y}`), `${id}/${n.id} 走不到`);
  }
});
test('宝箱 id 唯一、内容合法；Boss/水晶事件合法；结局文本存在', () => {
  const ids = new Set();
  for (const [id, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) {
      if (ev.type === 'chest') { assert(ev.id && !ids.has(ev.id), `${id} 宝箱 id 重复/缺失`); ids.add(ev.id); assert(ev.gold > 0 || data.items[ev.item], `${id} 宝箱 ${ev.id} 内容无效`); }
      else if (ev.type === 'crystal') assert(!ev.needFlag || typeof ev.needFlag === 'string');
      else assert(ev.type === 'warp', `${id} 未知事件 ${ev.type}`);
    }
    for (const n of md.npcs || []) if (n.script?.type === 'boss') { for (const e of n.script.enemies) assert(data.enemies[e], `${n.id} Boss 敌人 ${e}`); assert(n.script.winFlag && n.unless === n.script.winFlag, `${n.id} Boss 打完应消失`); }
  }
  assert(ids.size >= 5, '宝箱太少'); assert(data.story.ending.lines.length > 5 && data.story.crystal.take.length);
});
test('地图联通：从村子经楼梯能到最深处', () => {
  const seen = new Set(['village']), q = ['village'];
  while (q.length) { const id = q.pop(); for (const ev of data.maps[id].events || []) if (ev.type === 'warp' && !seen.has(ev.to.map)) { seen.add(ev.to.map); q.push(ev.to.map); } }
  assert(seen.has('cave_3'), '到不了 cave_3'); assert(seen.size === Object.keys(data.maps).length, '有地图没连上');
});


// ---------- 阶段 3：状态异常 / 魔法 / 职业 ----------
test('effectiveStats：黑暗命中减半、防护防御 ×1.5、睡眠回避 0', () => {
  const a = { acc: 40, def: 10, eva: 20, status: {} };
  assert(F.effectiveStats(a).acc === 40 && F.effectiveStats(a).def === 10);
  assert(F.effectiveStats({ ...a, status: { blind: true } }).acc === 20);
  assert(F.effectiveStats({ ...a, status: { protect: 3 } }).def === 15);
  assert(F.effectiveStats({ ...a, status: { sleep: 2 } }).eva === 0);
  assert(F.statusChance({ immune: ['poison'] }, 'poison') === 0 && F.statusChance({ immune: [] }, 'poison') === 0.75);
  assert(F.poisonDamage(10) === 1 && F.poisonDamage(120) === 10);
  assert(F.physicalAttack({ atk: 5, acc: 0, crit: 0, hits: 2 }, { def: 0, eva: -200 }, new RNG(1)).hits === 2, '武僧双击');
});
test('解毒药：只对中毒者有效，治好后返回状态名；帐篷清空状态', () => {
  const t = { hp: 10, mp: 0, maxHp: 20, maxMp: 0, alive: true, status: { poison: true } };
  assert(canUseOn(data.items.antidote, t)); const o = applyItem(data.items.antidote, t);
  assert(o.cured[0] === '中毒' && !t.status.poison); assert(applyItem(data.items.antidote, t) === null);
  assert(persistentOnly({ poison: true, sleep: 2, protect: 3 }).poison && !persistentOnly({ sleep: 2 }).sleep);
  const party = [{ jobId: 'boxer', level: 1, hp: 1, mp: 0, status: { poison: true }, equipment: {} }];
  campParty(party, data); assert(Object.keys(party[0].status).length === 0 && party[0].hp > 1);
});
test('spellsFor：按等级学魔法；升级时 learned 列出新魔法', () => {
  assert(spellsFor(data.jobs.herbwife, 1).join() === 'cure'); assert(spellsFor(data.jobs.herbwife, 3).includes('protect') && !spellsFor(data.jobs.herbwife, 3).includes('esuna'));
  const m = { jobId: 'talisman', level: 1, exp: 0, hp: 5, mp: 5, equipment: {} };
  const g = grantExp(m, F.expForLevel(2), data); assert(g[0].learned.join() === 'ice', `学会 ${g[0].learned}`);
});
test('changeJob：卸下不能装的装备并堆回背包，HP 截断，预览与实际一致', () => {
  const m = { jobId: 'boxer', level: 1, exp: 0, hp: 999, mp: 0, equipment: { weapon: 'iron_sword', armor: 'iron_armor' }, status: {} }, inv = [];
  const removed = changeJob(m, 'talisman', inv, data);
  assert(removed.length === 2 && inv.length === 2 && m.equipment.weapon === null, '卸装备'); assert(m.hp === computeStats(m, data).maxHp, 'HP 截断');
  assert(changeJob(m, 'nope', inv, data) === null);

  // 卸下的装备要并进背包里已有的那一堆（以前用 inv.push，会多出一行「铁剑 ×1」，countItem 只认第一堆）
  const dup = { jobId: 'boxer', level: 1, exp: 0, hp: 10, mp: 0, equipment: { weapon: 'iron_sword', armor: null }, status: {} };
  const dupInv = [{ id: 'iron_sword', qty: 1 }];
  changeJob(dup, 'talisman', dupInv, data);
  assert(dupInv.length === 1 && countItem(dupInv, 'iron_sword') === 2, `卸下的装备应并堆：${JSON.stringify(dupInv)}`);

  // 转职预览（JobScene）要和转完的结果对得上：装不了的武器防具在预览时就该按卸下算
  const pv = { jobId: 'boxer', level: 7, exp: 0, hp: 50, mp: 0, equipment: { weapon: 'iron_sword', armor: 'iron_armor', accessory: null }, status: {} };
  const preview = computeStats({ ...pv, jobId: 'herbwife', equipment: equipmentAfterJobChange(pv.equipment, 'herbwife', data).equipment }, data);
  changeJob(pv, 'herbwife', [], data);
  const actual = computeStats(pv, data);
  assert(preview.atk === actual.atk && preview.def === actual.def, `预览 ${preview.atk}/${preview.def} 应等于转职后 ${actual.atk}/${actual.def}`);

  // 武僧（家将）空手：攻击按 unarmed × 等级算。就地造两件临时武器做对照，不依赖 items.json 里的具体拳套 id
  const d2 = { ...data, items: { ...data.items,
    test_weak_fist: { name: '测试破拳套', type: 'weapon', atk: 1, jobs: ['general'] },
    test_strong_fist: { name: '测试利爪', type: 'weapon', atk: 30, jobs: ['general'] } } };
  const monk = { jobId: 'general', level: 4, equipment: {} };
  const bare = computeStats(monk, d2).atk;
  const weak = computeStats({ ...monk, equipment: { weapon: 'test_weak_fist' } }, d2).atk;
  const strong = computeStats({ ...monk, equipment: { weapon: 'test_strong_fist' } }, d2).atk;
  assert(bare > weak, `武僧空手(${bare}) 该强过 atk 1 的破武器(${weak})`);
  assert(strong > bare, `拿好武器(${strong}) 该强过空手(${bare})`);
  assert(computeStats({ ...monk, level: 8 }, d2).atk > bare, '武僧空手攻击应随等级成长');
});
// ── 职业等级 / 技能等级 / 承接（src/game/jobskill.js）──────────────────────
const jsMember = (jobId, level = 1, extra = {}) =>
  normalizeMember({ jobId, level, exp: 0, hp: 20, mp: 20, status: {}, equipment: {}, ...extra }, data);

test('承接：转职之后旧职业的魔法还在，新职业的魔法加上来', () => {
  const m = jsMember('talisman', 9);                     // 符仔仙 9 级：八条全会
  const before = memberSpells(m, data);
  assert(before.includes('fire') && before.includes('thundara'), `符仔仙 9 级该会 thundara：${before}`);
  changeJob(m, 'herbwife', [], data);                    // 转青草婆
  const after = memberSpells(m, data);
  for (const id of before) assert(after.includes(id), `转职后掉了旧魔法 ${id}`);
  assert(after.includes('cure') && after.includes('raise'), `新职业的魔法没加上来：${after}`);
  assert(m.learned.includes('thundara'), 'learned 该把旧魔法钉住');
  // 再转到没有 magic 指令的职业：魔法仍然记着（转回来就还能用），只是拳头师没得放
  changeJob(m, 'boxer', [], data);
  assert(memberSpells(m, data).includes('thundara'), '转成物理职业不该抹掉学过的魔法');
  assert(!data.jobs.boxer.commands.includes('magic'), '拳头师本来就没有 magic 指令，会但放不出来');
});

test('职业等级：各职业分开记，转回旧职业等级还在，没练过的从 1 级起', () => {
  const m = jsMember('talisman', 9);
  assert(jobLevel(m, 'talisman') === 1 && jobLevel(m, 'herbwife') === 0, '现职 1 级，没练过的 0 级');
  grantJobExp(m, JP_PER_LEVEL * 8, data);
  assert(jobLevel(m, 'talisman') === 9, `符仔仙该 9 级：${jobLevel(m, 'talisman')}`);
  changeJob(m, 'herbwife', [], data);
  assert(jobLevel(m, 'herbwife') === 1, '转到没练过的职业从 1 级起');
  assert(jobLevel(m, 'talisman') === 9, '旧职业等级不该被清掉');
  grantJobExp(m, JP_PER_LEVEL * 2, data);                // 只加给现职
  assert(jobLevel(m, 'herbwife') === 3 && jobLevel(m, 'talisman') === 9, 'JP 只该加给现在这个职业');
  changeJob(m, 'talisman', [], data);
  assert(jobLevel(m, 'talisman') === 9, '转回来练过的等级还在（练过的不会白练）');
});

test('HP/MP 按角色等级走：转到低血职业只截断不压死，倒下的人不会被转职救活', () => {
  const m = jsMember('boxer', 12); healFull(m, data);
  const boxerHp = computeStats(m, data).maxHp;
  changeJob(m, 'talisman', [], data);
  const s = computeStats(m, data);
  assert(s.maxHp < boxerHp, '符仔仙该比拳头师血少，否则这条测不到东西');
  assert(m.hp === s.maxHp && m.hp >= 1, `HP 该截到新上限而不是 0：${m.hp}/${s.maxHp}`);
  // 职业等级不参与属性计算：把职业等级拉满，HP/MP 一点都不该动
  grantJobExp(m, JP_PER_LEVEL * 48, data);
  assert(jobLevel(m, 'talisman') === 49 && computeStats(m, data).maxHp === s.maxHp, 'HP 不该跟职业等级走');
  const dead = jsMember('boxer', 12, { hp: 0 });
  changeJob(dead, 'talisman', [], data);
  assert(dead.hp === 0, '倒下的人不该因为转职就回到 1 点血');
});

test('請神按职业等级解锁：1 / 7 / 14 …每 +7 一位，关圣帝君第一个', () => {
  const order = summonOrder(data);
  // 台阶只管那八位。【八部齐至】走的是另一条路（八尊全练满），
  // 故意不占台阶上的格子——留在里面就掉到第九格 ＝ 职业 56 级。
  const eight = Object.keys(data.summons).filter(id => id !== FINALE_ID);
  assert(order.length === eight.length, `八位一个都不能漏：${order.length} vs ${eight.length}`);
  assert(!order.includes(FINALE_ID), '八部齐至不该占台阶的格子');
  assert(order[0] === 'guangong', '关圣帝君必须是第一位');
  assert(new Set(order).size === order.length, '解锁顺序里有重复');
  for (const id of order) assert(data.summons[id], `解锁表里的 ${id} 在 summons.json 里不存在`);
  assert(summonUnlockLevel(0) === 1 && summonUnlockLevel(1) === 7 && summonUnlockLevel(7) === 49, '解锁台阶该是 1/7/…/49');
  const m = jsMember('talisman', 9);
  const ids = lv => { m.jobLevels.talisman = lv; return availableSummons(m, data).map(x => x.id); };
  assert(ids(1).join() === 'guangong', `1 级只该有关圣帝君：${ids(1)}`);
  assert(ids(6).join() === 'guangong', '6 级还请不动第二位');
  assert(ids(7).join() === order.slice(0, 2).join(), `7 级该开第二位：${ids(7)}`);
  assert(ids(14).length === 3 && ids(48).length === 7 && ids(49).length === 8, '14 级三位、49 级才八位齐');
  const rec = availableSummons(m, data)[0];
  assert(rec.skillLevel === 1 && rec.mastered === false, 'availableSummons 该带上技能等级与是否练满');
});

test('職業經驗：grantJobExp 逐级报解锁，一幕一大笔能把台阶跨过去', () => {
  const m = jsMember('talisman', 9);
  const g1 = grantJobExp(m, JP_PER_BATTLE, data);
  assert(g1.length === 0, '一场一点 JP 不该立刻升级');
  const g2 = grantJobExp(m, JP_PER_LEVEL * 6, data);
  assert(g2.length === 6 && g2[0].level === 2 && g2[5].level === 7, `该逐级报 6 条：${JSON.stringify(g2.map(x => x.level))}`);
  assert(g2[5].unlocked.join() === 'bogong' && g2[0].unlocked.length === 0, `7 级该报解锁伯公：${JSON.stringify(g2[5])}`);
  assert(g2.every(x => x.jobId === 'talisman'), '记录要带上是哪个职业');
  const before = jobLevel(m, 'talisman');
  grantJobExp(m, JP_ACT_BONUS, data);                    // 六鎮物一幕的大笔 JP
  assert(jobLevel(m, 'talisman') - before === Math.floor(JP_ACT_BONUS / JP_PER_LEVEL), '一幕该稳稳跨过三级多');
  assert(jpForJobLevel(49) === JP_PER_LEVEL * 48, '第八位（钟馗）所需 JP 与曲线一致');
});

test('技能等级：用到满会升级，威力升 MP 降，满级那一步是双份', () => {
  const m = jsMember('talisman', 9);
  assert(skillLevelOf(m, 'fire') === 1, '没练过的技能是 1 级');
  let last = null, ups = [];
  for (let i = 0; i < SKILL_USES[SKILL_MAX] + 5; i++) { last = useSkill(m, 'fire'); if (last.leveled) ups.push([i + 1, last.level]); }
  assert(ups.map(u => u[0]).join() === SKILL_USES.slice(2).join(), `升级点该落在 ${SKILL_USES.slice(2)}：${JSON.stringify(ups)}`);
  assert(last.level === SKILL_MAX && last.mastered === true, '练满该封顶在 5 级并报 mastered');
  assert(m.skillLevels.fire === SKILL_MAX && levelForUses(m.skillUses.fire) === SKILL_MAX, '等级与次数要对得上');
  assert(skillLevelOf(m, 'ice') === 1, '练 fire 不该顺便把别的技能练起来');
  assert(availableSummons(m, data).length >= 1 && availableSummons(m, data)[0].mastered === false, '召唤要各练各的');

  // 曲线：威力单调升、MP 单调降，满级那一步比前面每一步都大
  const base = data.summons.guangong, steps = [1, 2, 3, 4, 5].map(lv => skillScale(base, lv));
  for (let i = 1; i < steps.length; i++) {
    assert(steps[i].power > steps[i - 1].power, `威力该逐级升：${JSON.stringify(steps.map(x => x.power))}`);
    assert(steps[i].mp <= steps[i - 1].mp, `MP 不该越练越贵：${JSON.stringify(steps.map(x => x.mp))}`);
  }
  const d = steps.map((x, i) => i ? x.power - steps[i - 1].power : 0);
  assert(d[4] > d[3] && d[4] >= d[1] * 2 - 1, `满级那一步该明显大于前面：${JSON.stringify(d)}`);
  assert(steps[4].power === Math.round(base.power * 1.5) && steps[4].power <= base.power * 1.5, '满级威力上限 ×1.5');
  assert(steps[4].mp >= Math.ceil(base.mp * 0.8), 'MP 折扣不该超过两成——MP 是唯一的资源');
  // 纯状态魔法（power 0）不该被抬起来；免费技能不该被抬出 MP
  assert(skillScale(data.spells.protect, 5).power === 0, 'power 0 的纯状态魔法乘完还是 0');
  assert(skillScale({ power: 10, mp: 0 }, 5).mp === 0, 'mp 0 的技能不该被抬成 1');
  assert(skillScale(20, 1).power === 20 && skillScale(20, 5).power === 30, 'skillScale 也收纯数字');
  assert(skillScale(base, 0).power === base.power && skillScale(base, 99).power === steps[4].power, '等级越界要夹住');
});

test('旧存档（没有 learned / jobLevels / skillLevels）读得进来且不掉东西', () => {
  const prev = localStorage.getItem(SAVE_KEY);
  try {
    // 造一份「加这套系统之前」的存档：三个新字段一个都没有
    const st = newGameState(data);
    st.party.forEach(m => { m.level = 9; delete m.learned; delete m.jobLevels; delete m.jobExp; delete m.skillLevels; delete m.skillUses; });
    st.party[3].jobId = 'talisman';
    localStorage.setItem(SAVE_KEY, JSON.stringify(st));
    assert(!('learned' in JSON.parse(localStorage.getItem(SAVE_KEY)).party[0]), '这份存档必须真的缺字段，否则测不到东西');

    const back = loadGame(data);
    assert(back, '旧存档该读得进来');
    for (const m of back.party) {
      assert(Array.isArray(m.learned) && m.jobLevels && m.jobExp && m.skillLevels && m.skillUses, `${m.name} 缺字段没补上`);
      assert(jobLevel(m, m.jobId) === 1, `${m.name} 现职该补成 1 级`);
      assert(memberSpells(m, data).length === spellsFor(data.jobs[m.jobId], 9).length, `${m.name} 魔法数量该和旧行为一致`);
      assert(availableSummons(m, data).map(x => x.id).join() === 'guangong', '旧档进来先只有关圣帝君');
    }
    const t = back.party[3];
    assert(t.learned.includes('thundara'), '读档时该把现职现等级该会的钉进 learned');
    // 不给 data 也不能崩，而且魔法照样一条不少（memberSpells 是并集）
    const bare = loadGame();
    assert(bare && bare.party[3].learned.length === 0 && memberSpells(bare.party[3], data).includes('thundara'), 'loadGame() 不带 data 也不该掉魔法');
    // 只有 skillLevels 没有 skillUses 的半旧存档：等级不能倒退
    const half = { jobId: 'talisman', level: 9, exp: 0, hp: 5, mp: 5, status: {}, equipment: {}, skillLevels: { fire: 4 } };
    normalizeMember(half, data);
    assert(skillLevelOf(half, 'fire') === 4 && half.skillUses.fire === SKILL_USES[4], '半旧存档的技能等级不该倒退');
    assert(useSkill(half, 'fire').level === 4, '补上的次数要接得上，不该一用就跳级');
  } finally { if (prev === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, prev); }
});

test('魔法 / 道具 / 敌人数据字段合法', () => {
  for (const [id, sp] of Object.entries(data.spells)) {
    assert(['enemy', 'ally'].includes(sp.target) && ['single', 'all'].includes(sp.scope), `${id} target/scope`);
    assert(typeof sp.mp === 'number' && typeof sp.power === 'number' && sp.name, `${id} 字段`);
    if (sp.status) assert(STATUS[sp.status], `${id} 未知状态 ${sp.status}`);
    for (const c of sp.cure || []) assert(STATUS[c], `${id} 治疗未知状态 ${c}`);
  }
  for (const [id, it] of Object.entries(data.items)) for (const c of it.effect?.cure || []) assert(STATUS[c], `${id} 治疗未知状态 ${c}`);
  for (const [id, e] of Object.entries(data.enemies)) {
    if (e.onHit) assert(STATUS[e.onHit.status] && e.onHit.chance > 0 && e.onHit.chance <= 1, `${id}.onHit`);
    for (const s of e.spells || []) assert(data.spells[s], `${id} 魔法 ${s}`);
    for (const s of e.immune || []) assert(STATUS[s] || ELEMENTS[s], `${id} immune ${s}`);
  }
});

// 用假场景跑行动协程（不需要画面），检验状态逻辑
function fakeBattle(partyJobs, enemyIds, seed = 5) {
  const st = newGameState(data); st.party = st.party.filter(m => partyJobs.includes(m.jobId)); st.party.forEach(m => { m.level = 12; healFull(m, data); });
  const scene = { game: { data, state: st }, rng: new RNG(seed), msg: '', escaped: false, canFlee: true,
    // 桩要跟 BattleScene / Effects 的接口一致。少一个方法，协程跑到那一行就 TypeError——
    // 这几条测试的价值正在于此（size() 这次就是这么被抓出来的），
    // 所以 actions.js 那边**不要**写成 scene.size?.(t) 把它绕过去。
    fx: { add() {}, shake() {} }, popup() {},
    center() { return [0, 0]; }, size() { return { w: 48, h: 48 }; },
    party: makePartyActors(st, data), enemies: makeEnemyActors(enemyIds, data),
    alive(l) { return l.filter(a => a.alive); },
    retarget(t) { return t.alive ? t : (this.alive(t.side === 'enemy' ? this.enemies : this.party)[0] || null); },
    damage(t, dmg, { physical = false } = {}) { t.hp = Math.max(0, t.hp - dmg); if (physical && t.status.sleep) delete t.status.sleep; if (t.hp <= 0) { t.alive = false; t.status = {}; } },
    run(a) { const co = execute(this, a); let n = 0; while (!co.next().done && n++ < 100); return this.msg; } };
  return scene;
}
// 請神的三条。数据层那几条测的是「能不能请」，这三条测的是**请下来之后真的发生了什么**——
// 中间隔着 callSummon 整条协程（扣 MP、八段结算、我方附带效果、drain、技能熟练度），
// 那才是玩家真正看到的东西。少了这一层，「解锁台阶对不对」全绿也可能一发都放不出来。
function tangkiBattle(enemyIds, jobLv = 50, seed = 5) {
  const s = fakeBattle(['talisman'], enemyIds, seed);
  const actor = s.party[0];
  changeJob(actor.member, 'tangki', [], data);
  grantJobExp(actor.member, jpForJobLevel(jobLv), data);   // 八位全开
  actor.jobId = 'tangki';
  actor.maxMp = actor.member.maxMp = 300; actor.mp = 300;  // 别让 MP 成为这几条的变量
  return { s, actor };
}

test('八部齐至：八尊全练满才开，不占职业等级那张表的格子', () => {
  const m = jsMember('tangki', 12);
  grantJobExp(m, jpForJobLevel(99), data);               // 职业等级拉满
  const eight = summonOrder(data);
  assert(eight.length === 8 && !eight.includes(FINALE_ID), `解锁表该只有八尊：${eight}`);
  assert(!availableSummons(m, data).some(x => x.id === FINALE_ID), '还没练满就不该出现');
  assert(!finaleReady(m, data), '一次没练就说 ready 了');
  // 把八尊逐个练满；差最后一尊的最后一次时都不许开
  for (const id of eight) {
    for (let i = 0; i < SKILL_USES[SKILL_MAX] + 1; i++) useSkill(m, id);
    const done = eight.indexOf(id) === eight.length - 1;
    assert(finaleReady(m, data) === done, `练到 ${id} 时 ready 该是 ${done}`);
  }
  assert(availableSummons(m, data).some(x => x.id === FINALE_ID), '八尊全满了还不开');
  // 练它自己不能成为它自己的解锁条件——判的是那八尊，不是「所有召唤」
  const m2 = jsMember('tangki', 12);
  grantJobExp(m2, jpForJobLevel(99), data);
  for (let i = 0; i < 99; i++) useSkill(m2, FINALE_ID);
  assert(!finaleReady(m2, data), '只练它自己不该解开它自己');
});

test('請神：扣 MP、打到敌方全体、一场只能请一次', () => {
  const { s, actor } = tangkiBattle(['goblin', 'goblin']);
  const sm = data.summons.guangong, hp0 = s.enemies.map(e => e.hp), mp0 = actor.mp;
  s.run({ actor, type: 'summon', summonId: 'guangong', target: 'all' });
  assert(s.msg.includes(sm.name) && s.msg.includes(sm.skill), `该报出神名与绝招：${s.msg}`);
  assert(actor.mp < mp0, `MP 没扣：${mp0} → ${actor.mp}`);
  s.enemies.forEach((e, i) => assert(e.hp < hp0[i], `第 ${i} 只没挨打：${hp0[i]} → ${e.hp}`));
  // 第二次：同一尊请不动了，而且不该再扣 MP
  const mp1 = actor.mp, hp1 = s.enemies.map(e => e.hp);
  s.run({ actor, type: 'summon', summonId: 'guangong', target: 'all' });
  assert(actor.mp === mp1, '被挡下来还扣了 MP');
  s.enemies.forEach((e, i) => assert(e.hp === hp1[i], '被挡下来还打了人'));
});

test('請神：职业等级不够的请不动；MP 不够也请不动', () => {
  const { s, actor } = tangkiBattle(['goblin'], 1);        // 职业 1 级：只开第一位
  const later = summonOrder(data)[3];                      // 第四位要到职业 21 级
  const hp0 = s.enemies[0].hp;
  s.run({ actor, type: 'summon', summonId: later, target: 'all' });
  assert(s.msg.includes('请不动'), `等级不够该被挡：${s.msg}`);
  assert(s.enemies[0].hp === hp0, '请不动却打到了人');
  actor.mp = 0;
  s.run({ actor, type: 'summon', summonId: summonOrder(data)[0], target: 'all' });
  assert(s.msg.includes('MP 不足'), `MP 不够该被挡：${s.msg}`);
});

test('請神：我方附带效果、吕布的 MP 归零、用一次算一次熟练度', () => {
  // 用耐打的怪（knight = 乌火，1250 HP）：小怪会被前一尊直接打死，而没有活着的目标时 callSummon 会提前返回、
  // 连 MP 都不扣——那样测出来的「MP 没归零」是测试自己造的假象，不是 bug
  const { s, actor } = tangkiBattle(['knight']);
  // 观世音：我方全体回 HP。先把人打伤，否则回满看不出来
  const ally = s.party[0]; ally.hp = 1;
  s.run({ actor, type: 'summon', summonId: 'guanyin', target: 'all' });
  assert(ally.hp > 1, `观音该回血：${ally.hp}`);
  // 吕布：drain mp —— 放完施术者 MP 见底
  actor.mp = actor.maxMp;
  s.run({ actor, type: 'summon', summonId: 'lubu', target: 'all' });
  assert(actor.mp === 0, `吕布放完 MP 该归零：${actor.mp}`);
  // 熟练度：上面三尊各请过一次（关圣帝君没请，留作对照）
  assert(actor.member.skillUses?.lubu >= 1, '用过的技能该记熟练度');
  assert(!(actor.member.skillUses?.guangong > 0), '没请过的不该有熟练度');
});

test('行动协程：催眠 → 睡着跳过 → 物理攻击打醒；毒每回合掉血；净化解毒；防护减伤', () => {
  const s = fakeBattle(['talisman', 'herbwife'], ['goblin']);
  const [bm, wm] = s.party, gob = s.enemies[0];
  let tries = 0; while (!gob.status.sleep && tries++ < 10) s.run({ actor: bm, type: 'magic', spellId: 'sleep', target: gob });
  assert(gob.status.sleep, '催眠应能生效'); assert(s.msg.includes('睡眠'), s.msg);
  s.run({ actor: gob, type: 'attack', target: bm }); assert(s.msg.includes('沉睡'), '睡着的敌人不能行动: ' + s.msg);
  const hp = gob.hp; s.run({ actor: wm, type: 'attack', target: gob }); if (gob.hp < hp) assert(!gob.status.sleep, '被打应醒来');
  bm.status.poison = true; const before = bm.hp; s.run({ actor: bm, type: 'defend' }); assert(bm.hp === before - F.poisonDamage(bm.maxHp), '毒伤害');
  s.run({ actor: wm, type: 'magic', spellId: 'esuna', target: bm }); assert(!bm.status.poison && s.msg.includes('治好'), '净化');
  s.run({ actor: wm, type: 'magic', spellId: 'protect', target: wm }); assert(wm.status.protect >= 4, '防护');
  assert(F.effectiveStats(wm).def > wm.def);
  const dead = { ...wm, alive: false, hp: 0 }; s.party.push(dead); s.run({ actor: wm, type: 'magic', spellId: 'raise', target: dead }); assert(dead.alive && dead.hp > 0, '复活');
});
test('行动协程：全体魔法打到每个敌人；MP 不足不施放；毒雾附加中毒；免疫无效', () => {
  const s = fakeBattle(['talisman'], ['slime', 'slime', 'skeleton']);
  const bm = s.party[0], hp0 = s.enemies.map(e => e.hp);
  s.run({ actor: bm, type: 'magic', spellId: 'fira', target: 'all' });
  assert(s.enemies.every((e, i) => e.hp < hp0[i]), '烈焰应打到全体');
  let n = 0; while (!s.enemies[0].status.poison && n++ < 10 && bm.mp >= 8) s.run({ actor: bm, type: 'magic', spellId: 'poison', target: 'all' });
  assert(s.enemies[0].status.poison || !s.enemies[0].alive, '毒雾应能下毒'); assert(!s.enemies[2].status.poison, '骷髅免疫毒');
  bm.mp = 0; s.run({ actor: bm, type: 'magic', spellId: 'fire', target: s.enemies[0] }); assert(s.msg.includes('MP 不足'), s.msg);
  const t = { immune: ['sleep'], status: {} }; assert(inflict(s, t, 'sleep') === false);
});
test('敌人附带状态攻击（黑史莱姆下毒）与战斗结束只保留持续状态', () => {
  const s = fakeBattle(['boxer'], ['darkslime']); const w = s.party[0]; w.def = 0; w.eva = -200;
  let n = 0; while (!w.status.poison && n++ < 40) { s.run({ actor: s.enemies[0], type: 'attack', target: w }); if (!w.alive) { w.alive = true; w.hp = w.maxHp; } }
  assert(w.status.poison, '40 次攻击应至少下毒一次');
  w.status.blind = true; const kept = persistentOnly(w.status); assert(kept.poison && !kept.blind);
});


// ---------- 装备系统：材质分级 + 神话装备 ----------
test('材质分级：同类装备 tier 越高属性越强、价格越贵', () => {
  const byCat = {};
  for (const [id, it] of Object.entries(data.items)) {
    if (it.myth || !it.cat) continue;
    (byCat[it.type + ':' + it.cat] ||= []).push({ id, ...it });
  }
  for (const [k, list] of Object.entries(byCat)) {
    list.sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i], key = cur.type === 'weapon' ? 'atk' : 'def';
      assert(cur.tier > prev.tier, `${k} tier 重复：${prev.id} ${cur.id}`);
      assert(cur[key] > prev[key], `${k} ${cur.id} 的 ${key} 不比 ${prev.id} 强`);
      assert(cur.price > prev.price, `${k} ${cur.id} 不比 ${prev.id} 贵`);
    }
  }
});
test('神话装备：都有造型 id、出处、说明，且强于同类最高材质', () => {
  const myth = Object.entries(data.items).filter(([, it]) => it.myth);
  assert(myth.length >= 20, `神话装备只有 ${myth.length} 件`);
  const icons = new Set();
  for (const [id, it] of myth) {
    assert(it.icon && !icons.has(it.icon), `${id} 造型 id 缺失或重复`); icons.add(it.icon);
    assert(it.lore && it.desc, `${id} 缺出处或说明`);
    assert(it.price === 0, `${id} 神话装备不该标价`);
    if (!it.cat) continue;
    const peers = Object.values(data.items).filter(x => !x.myth && x.cat === it.cat && x.type === it.type);
    const key = it.type === 'weapon' ? 'atk' : 'def';
    const best = Math.max(...peers.map(x => x[key] || 0));
    assert((it[key] || 0) > best, `${id} 的 ${key} 没有超过最强材质款 ${best}`);
  }
  const lores = new Set(myth.map(([, it]) => it.lore));
  assert(lores.size >= 8, `神话来源只有 ${lores.size} 种，应覆盖更多地区`);
});
test('三个装备槽：饰品可装、加成进属性、卸下还原', () => {
  const m = { jobId: 'boxer', level: 5, exp: 0, hp: 1, mp: 1, status: {}, equipment: { weapon: null, armor: null, accessory: null } };
  const before = computeStats(m, data);
  const inv = [{ id: 'dragon_heart', qty: 1 }, { id: 'power_band', qty: 1 }];
  assert(equip(m, 'accessory', 'dragon_heart', inv, data), '饰品应能装上');
  const after = computeStats(m, data);
  assert(after.maxHp === before.maxHp + 150, `HP 加成没生效 ${before.maxHp}→${after.maxHp}`);
  assert(after.def === before.def + 6, '防御加成没生效');
  assert(equip(m, 'accessory', 'power_band', inv, data) && countItem(inv, 'dragon_heart') === 1, '换饰品应把旧的放回背包');
  assert(equip(m, 'accessory', null, inv, data) && computeStats(m, data).atk === before.atk, '卸下应还原');
});
test('武器特效：属性倍率、连击、附加状态、免疫饰品', () => {
  const m = { jobId: 'boxer', level: 8, exp: 0, hp: 1, mp: 1, status: {}, equipment: { weapon: 'kusanagi', armor: null, accessory: null } };
  const s = computeStats(m, data);
  assert(s.element === 'metal', '草薙剑应带金属性（雷走金，见 battle/elements.js）');
  assert(computeStats({ ...m, equipment: { weapon: 'ganjiang' } }, data).hits === 2, '干将莫邪应是 2 连击');
  assert(computeStats({ ...m, jobId: 'general', equipment: { weapon: null } }, data).hits === 2, '武僧空手应是 2 连击');
  assert(computeStats({ ...m, jobId: 'general', equipment: { weapon: 'nemean_fist' } }, data).hits === 4, '武僧 + 双击武器 = 4');
  assert(computeStats({ ...m, equipment: { weapon: 'gram' } }, data).onHit.status === 'blind', '格拉墨应附加黑暗');
  const im = computeStats({ ...m, equipment: { accessory: 'ouroboros' } }, data);
  assert(im.immuneAll, '衔尾蛇之环应免疫异常');
  const st = { party: [{ ...m, equipment: { weapon: null, armor: null, accessory: 'ouroboros' } }], inventory: [] };
  assert(makePartyActors(st, data)[0].immune.includes('poison'), '免疫应带进战斗');
});
test('神话武器的属性伤害与连击在战斗里真的生效', () => {
  const s = fakeBattle(['boxer'], ['slime', 'slime']);  // 史莱姆弱雷
  const w = s.party[0];
  Object.assign(w, computeStats({ jobId: 'boxer', level: 12, equipment: { weapon: 'kusanagi', armor: null, accessory: null } }, data));
  w.acc = 200; w.name = '雷欧';
  const hp0 = s.enemies[0].hp;
  s.run({ actor: w, type: 'attack', target: s.enemies[0] });
  assert(s.msg.includes('效果拔群'), `雷属性打史莱姆应拔群：${s.msg}`);
  assert(s.enemies[0].hp < hp0, '应该造成伤害');
});
test('商店只卖非神话装备，宝箱/掉落才有神话装备', () => {
  for (const md of Object.values(data.maps)) for (const n of md.npcs || []) {
    for (const id of n.script?.items || []) assert(!data.items[id].myth, `商店不该卖神话装备 ${id}`);
    for (const r of n.script?.reward || []) assert(data.items[r.id], `掉落物 ${r.id} 不存在`);
  }
});

// 收集全部获取途径：商店 / 宝箱 / Boss 掉落 / NPC 赠予
function itemSources() {
  const src = new Map();
  const add = (id, where) => { if (!id) return; if (!src.has(id)) src.set(id, []); src.get(id).push(where); };
  for (const [mid, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) add(ev.item, `${mid} 宝箱 ${ev.id || ev.x + ',' + ev.y}`);
    for (const n of md.npcs || []) {
      for (const id of n.script?.items || []) add(id, `${mid} ${n.name} 商店`);
      for (const r of n.script?.reward || []) add(r.id, `${mid} ${n.name} 掉落`);
      for (const v of n.dialogue || []) for (const g of v.give?.items || []) add(g.id, `${mid} ${n.name} 赠予`);
    }
  }
  return src;
}

// 写在前面、但本作范围内没有用上的装备阶梯。
//
// 每条装备线的材质表都写到了 tier 11，而游戏实际只用到 tier 5（商店卖到钢）
// 再直接跳到 tier 11 的神话装备（宝箱给）。中间这 23 件属性、价格、职业限制都写好了，
// 但商店不卖、宝箱没有、没人给——玩家永远见不到。
//
// **没有删，也没有硬塞进游戏**：这是个 1–2 小时的垂直切片，塞 23 件装备会撑坏节奏；
// 而删掉又会让以后想扩展的人重写一遍阶梯。所以显式列在这里，
// 意思是「知道它们拿不到，这是有意留白」——**新出现的孤儿会被下面那条测试当场抓住**。
//
// 顺带一提，这批断档正是 Boss 难度全靠开箱驱动的原因：
// 玩家的强度只有「商店 tier 5」和「神话 tier 11」两档，中间没有过渡。
// 详见 CLAUDE.md 的 Boss 难度曲线一节。
const UNUSED_TIERS = new Set([
  'silver_sword', 'mythril_sword', 'adamant_sword', 'meteor_sword', 'dragon_sword',
  'silver_dagger', 'mythril_dagger', 'adamant_dagger', 'meteor_dagger',
  'silver_knuckle', 'mythril_knuckle', 'adamant_claw', 'dragon_claw',
  'silver_staff', 'mythril_staff', 'star_staff',
  'silver_armor', 'mythril_armor', 'adamant_armor', 'meteor_armor', 'dragon_armor',
  'mythril_robe', 'star_robe',
]);

test('每件神话装备都真的拿得到（之前 23 件里有 15 件玩家永远见不到）', () => {
  const src = itemSources();
  const missing = Object.entries(data.items).filter(([id, it]) => it.myth && !src.has(id)).map(([id]) => id);
  assert(!missing.length, `这些神话装备定义了却没有任何出处：${missing.join(' ')}`);
});

test('每件装备都拿得到——普通装备也要查，不只神话装备', () => {
  // 原本只有「每件神话装备都拿得到」那一条，`it.myth` 一过滤，
  // 普通装备线就没人守了：实际有 23 件 tier 6–10 定义完整却永远见不到，
  // 一直没被发现。这条把范围放到全部装备，已知留白的走 UNUSED_TIERS 白名单。
  const src = itemSources();
  const missing = [];
  for (const [id, it] of Object.entries(data.items)) {
    if (!['weapon', 'armor', 'accessory'].includes(it.type)) continue;
    if (src.has(id) || UNUSED_TIERS.has(id)) continue;
    missing.push(`${id}（${it.name}）`);
  }
  assert(!missing.length,
    '这些装备定义了却没有任何出处（商店/宝箱/掉落/赠予都没有）：\n      ' + missing.join('\n      ')
    + '\n      要么给它一个出处，要么加进 tests/run.js 的 UNUSED_TIERS 并说明为什么留白');
});

test('UNUSED_TIERS 白名单不能过期：里面的东西如果已经能拿到了，就该从名单里去掉', () => {
  // 白名单最怕的是「加进去就忘了」。哪天有人给银剑加了出处，
  // 名单不清理的话，下次再有孤儿又会被这条陈旧的白名单放过去。
  const src = itemSources();
  const stale = [...UNUSED_TIERS].filter(id => src.has(id));
  assert(!stale.length,
    `这些已经拿得到了，请从 UNUSED_TIERS 里删掉：${stale.join(' ')}`);
  const gone = [...UNUSED_TIERS].filter(id => !data.items[id]);
  assert(!gone.length, `UNUSED_TIERS 里有不存在的道具：${gone.join(' ')}`);
});

test('神话装备的职业限制合法，且不会出现「拿得到但全队没人能装」', () => {
  const src = itemSources();
  const partyJobs = new Set(data.party.map(p => p.jobId));
  for (const [id, it] of Object.entries(data.items)) {
    if (!it.myth || !it.cat) continue;
    if (!it.jobs) continue;                       // 不写 jobs = 全职业通用
    assert(it.jobs.length, `${id} 的 jobs 是空数组，谁都装不了`);
    for (const j of it.jobs) assert(data.jobs[j], `${id} 引用了不存在的职业 ${j}`);
  }
  // 大武山祭场的四个箱子是设计成「初始四人各一件」的，必须对得上默认队伍
  const finalChests = (data.maps.cave_3?.events || []).filter(e => e.type === 'chest' && data.items[e.item]?.myth);
  for (const ev of finalChests) {
    const jobs = data.items[ev.item].jobs;
    assert(!jobs || jobs.some(j => partyJobs.has(j)),
      `祭场宝箱 ${ev.id} 的 ${data.items[ev.item].name} 只有 ${jobs.join('/')} 能装，初始队伍拿了也用不了`);
  }
  assert(src.size, '一件可获得的道具都没有，收集逻辑坏了');
});

test('每个职业都取得到自己的精灵（含借图的），五处按 jobId 取图的地方才不会拿到 undefined', () => {
  // 精灵是按 `${jobId}_${dir}_${frame}` 直接取的，转职预览、走地图、战斗、
  // 胜利结算五处都这么取。少一个职业的图，光标一移到它上面就是 TypeError 当场崩——
  // 童乩加进 jobs.json 那次正是如此，而 67 条测试全绿。
  // 没画美术的职业用 jobs.json 的 `art` 借别人的（assets/art.js 末尾那段）。
  if (!artManifest) return;                      // 还没生成正式美术就跳过
  const chars = artManifest.characters || {};
  const miss = [];
  for (const id of Object.keys(data.jobs)) {
    const src = data.jobs[id].art || id;         // art 指向谁就查谁
    const v = chars[src];
    if (!v) { miss.push(`${id}${data.jobs[id].art ? `（借 ${src}，但 ${src} 也没有图）` : ''}`); continue; }
    // 至少要有一张基准图（down / left / up 任一），art.js 会从它派生出全部十三张
    if (!(v.down || v.left || v.up)) miss.push(`${id}（${src} 没有基准视角）`);
  }
  assert(!miss.length, '这些职业取不到精灵：' + miss.join(' '));
});

test('正式美术：所有角色精灵一样高、尺寸一致（防止某个职业显得特别小）', () => {
  if (!artRows || !artRows.length) return; // 还没生成正式美术就跳过
  const sizes = new Set(artRows.map(r => r.w + 'x' + r.h));
  assert(sizes.size === 1, '角色图尺寸不统一: ' + [...sizes].join(' '));
  const lo = Math.min(...artRows.map(r => r.ratio)), hi = Math.max(...artRows.map(r => r.ratio));
  const worst = artRows.slice().sort((a, b) => a.ratio - b.ratio)[0];
  assert(hi - lo <= 0.12, `角色身高不一致 ${(lo*100).toFixed(0)}%–${(hi*100).toFixed(0)}%，最矮的是 ${worst.cid}_${worst.view}`);
  assert(lo > 0.8, `${worst.cid}_${worst.view} 只占画布高度 ${(worst.ratio*100).toFixed(0)}%，角色应该几乎占满`);
});

test('正式美术：同一角色同一方向，站姿与迈步帧必须是同一个体型', () => {
  if (!artRows || !artRows.length) return;
  // 只量身高会漏掉「等高但胖瘦两样」——实际踩过：补生成的拳头师侧面站姿
  // 比他自己的侧面迈步少 41% 的实心面积，两张都是 46px 高，旧体检一路绿灯。
  // 只卡实心面积：宽度类指标会被姿势带偏（腿张开、手臂摆动、斗笠帽尖高低），不可靠。
  // 数值抓不到「站着戴斗笠、走起来变兜帽」这种服装漂移，那要靠
  // `python3 tools/proportion_check.py --sheet` 导出的对照图人眼看。
  const by = {};
  for (const r of artRows) (by[r.cid] ||= {})[r.view] = r;
  const bad = [];
  for (const [cid, views] of Object.entries(by)) {
    for (const v of ['down', 'up', 'left', 'right']) {
      const a = views[v], b = views[v + '_walk'];
      if (!a || !b) continue;
      const dev = Math.abs(a.mass - b.mass) / Math.max(a.mass, b.mass);
      if (dev > 0.30) bad.push(`${cid}/${v} 的实心面积差 ${(dev * 100).toFixed(0)}%（${a.mass} vs ${b.mass}）`);
    }
  }
  assert(!bad.length, '这些帧的体型对不上，看起来像两个人：\n      ' + bad.join('\n      '));
});

// ---------------------------------------------------------------------------
// ART 换算的契约。这一组守的是「提高 ART 会暴露一整类写死的物理像素常量」那批坑
// （见项目 CLAUDE.md 的复查表）——每一条都对应一个真踩过的问题。
// ---------------------------------------------------------------------------

test('u() 给尺寸：永远不小于 1 物理像素', () => {
  // 尺寸缩成 0 宽等于这块东西直接消失。ART 再小也得留 1 像素。
  for (const v of [0, 0.1, 0.4, 1, 2, 5, 9]) assert(u(v) >= 1, `u(${v}) = ${u(v)}，小于 1`);
  assert(u(4) === Math.max(1, Math.round(4 * U)), 'u() 的换算比例不对');
});

test('us() 给有符号偏移：必须保号，不能被 u() 的 max(1) 夹住', () => {
  // 真踩过：把 u() 用在 rng.int(-1,1) 上，u(-1) 变成 +1，
  // 于是裂缝只往一边歪、草叶全偏同一侧，抖动整个消失。
  assert(us(-1) < 0, `us(-1) = ${us(-1)}，应该是负的`);
  assert(us(0) === 0, `us(0) = ${us(0)}，应该是 0`);
  assert(us(1) > 0, `us(1) = ${us(1)}，应该是正的`);
  assert(us(-1) === -us(1), 'us() 应该对称');
  assert(u(-1) >= 1, 'u() 本来就该夹取（这条是提醒两者别混用）');
});

test('snap() 把逻辑坐标对齐到物理像素网格', () => {
  // 特效原本用 Math.round(x)，那是对齐**逻辑**网格，等于每步至少挪 ART 个物理像素。
  for (const v of [0, 0.1, 1.4, 7.77, -3.2]) {
    const p = snap(v) * ART;
    assert(Math.abs(p - Math.round(p)) < 1e-9, `snap(${v})*ART = ${p}，不是整数`);
  }
  // 最小步长应当是 1 个物理像素，不是 1 个逻辑像素
  assert(snap(1 / ART) !== snap(0) || ART === 1, 'snap() 的分辨率没有跟着 ART 变细');
});

test('镜像名单里不能出现有方向含义的瓦片', () => {
  // 楼梯/门/屋顶/桥/柜台翻过来就是错的（门开向反了、楼梯朝向反了）。
  // 房子那一套还在 tiles.js 里手工画好了从屋脊到墙脚的明暗序，翻转会把受光面翻到底下。
  const DIRECTIONAL = ['stairs_up', 'stairs_down', 'door', 'door_front', 'bridge', 'counter', 'bed',
    'roof', 'roof_ridge', 'roof_eave', 'wall_upper', 'wall_window', 'wall_base', 'cave_entrance'];
  const bad = DIRECTIONAL.filter(t => MIRROR.has(t));
  assert(!bad.length, '这些瓦片有方向含义，不能镜像：' + bad.join(' '));
  // NO_TOUCH 是「从不接受任何叠加」的那批，和镜像名单必须互斥
  const overlap = [...MIRROR].filter(t => NO_TOUCH.has(t));
  assert(!overlap.length, 'MIRROR 与 NO_TOUCH 重叠：' + overlap.join(' '));
});

test('角色与瓦片的美术尺寸必须正好是 逻辑尺寸 × ART', () => {
  if (!artSizes) return;
  const bad = [];
  for (const [k, [w, h]] of Object.entries(artSizes.characters))
    if (w !== 16 * ART || h !== 24 * ART) bad.push(`char ${k} 是 ${w}×${h}，应为 ${16 * ART}×${24 * ART}`);
  for (const [k, [w, h]] of Object.entries(artSizes.tiles))
    if (w !== 16 * ART || h !== 16 * ART) bad.push(`tile ${k} 是 ${w}×${h}，应为 ${16 * ART}×${16 * ART}`);
  assert(!bad.length, bad.join('\n      '));
});

test('怪物的逻辑尺寸各不相同，且没有被压成瓦片大小', () => {
  if (!artSizes) return;
  // 这条守的是一个真出现过、而且**零报错**的坑：
  // set_art.py 早先把所有非角色资源一律按瓦片（16×16）派生，
  // 而战斗画面是用 `artW = img.width / ART` 反推逻辑宽度的，
  // 于是每只怪都会被压成 16 逻辑像素——山猪本该 44、乌火本该 64。
  const logical = {};
  const bad = [];
  for (const [id, [w, h]] of Object.entries(artSizes.enemies)) {
    if (w % ART || h % ART) { bad.push(`${id} 的 ${w}×${h} 不是 ART(${ART}) 的整数倍`); continue; }
    const lw = w / ART;
    logical[id] = lw;
    if (lw < 24) bad.push(`${id} 只有 ${lw} 逻辑像素宽——像是被按瓦片尺寸派生了`);
    if (lw > 96) bad.push(`${id} 有 ${lw} 逻辑像素宽，超出战斗画面能放下的范围`);
  }
  assert(!bad.length, bad.join('\n      '));
  const vals = Object.values(logical);
  if (vals.length > 3) {
    // 全部一样大 = 逐只的逻辑尺寸丢了。小虫该比 Boss 小。
    assert(new Set(vals).size > 1, `${vals.length} 只怪全是同一个尺寸（${vals[0]}），逐只的逻辑尺寸丢了`);
    assert(Math.max(...vals) >= Math.min(...vals) * 1.5,
      `最大的怪只有最小的 ${(Math.max(...vals) / Math.min(...vals)).toFixed(2)} 倍，体型差被抹平了`);
  }
});

test('每只怪都能取到自己的美术，没有指向不存在的图', () => {
  const miss = [];
  for (const [id, e] of Object.entries(data.enemies)) {
    const key = e.sprite || id;
    if (!artSizes) continue;
    if (!(key in artSizes.enemies)) miss.push(`${id}${e.sprite ? `（借用 ${e.sprite}）` : ''}`);
  }
  assert(!miss.length, '这些怪取不到美术：' + miss.join(' '));
});

test('瓦片动画的循环周期不能太快（防闪）', () => {
  // 全项目的规矩：位移动画周期 ≥1.5 秒。瓦片是最占面积的一类——
  // 满屏两百多格一起变，人眼会直接读成「闪」而不是「在动」，所以这里卡得更紧。
  // 现存六种都在 4.8–6.4 秒，留出余量卡在 3 秒。
  const bad = [];
  for (const [id, spec] of Object.entries(TILE_FX)) {
    const period = spec.n * spec.dur;
    if (period < 3) bad.push(`${id} 一圈只有 ${period.toFixed(1)}s`);
  }
  assert(!bad.length, '这些瓦片动画太快，会看成闪烁：' + bad.join('，'));
});

test('每一种魔法属性都有自己的图标形状，不能退回无属性', () => {
  // 战斗里的魔法列表靠属性图标让玩家一眼分辨该不该对这只怪用。
  // 新加一种属性却忘了配图标，会静默退回「无属性宝珠」——
  // 列表看起来正常，但两个不同属性的魔法长得一模一样。
  // 清单不再手写：从 elements.js 那张表拿，加属性时忘了改测试的路直接堵死。
  const miss = new Set();
  for (const id of ELEMENT_IDS) if (!ELEM_SHAPE[id]) miss.add(id);
  for (const sp of Object.values(data.spells)) if (sp.element && !ELEM_SHAPE[sp.element]) miss.add(sp.element);
  for (const sm of Object.values(data.summons || {})) if (sm.element && !ELEM_SHAPE[sm.element]) miss.add(sm.element);
  assert(!miss.size, '这些属性没有配图标（menu/icons.js 的 ELEM_SHAPE）：' + [...miss].join(' '));
});

test('八种属性的图标形状两两不同，没有一对长得一样', () => {
  // 上一条只查「有没有配」。配了但两种属性画的是同一个形，一样分不出来——
  // 旧的「冰」（十字 + 四角点）和「光」（四芒星）就差点撞车，两个都是放射状十字。
  // 这里真的把图标渲染出来比像素：形状一样、只有颜色不同也算撞。
  const sig = new Map();
  for (const id of ELEMENT_IDS) {
    const c = spellIcon({ element: id });
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // 只看不透明的位置，忽略颜色：撞形状比撞颜色严重得多
    let bits = '';
    for (let i = 3; i < px.length; i += 4) bits += px[i] > 32 ? '1' : '0';
    if (sig.has(bits)) assert(false, `${ELEMENTS[id].cn}(${id}) 和 ${ELEMENTS[sig.get(bits)].cn}(${sig.get(bits)}) 的图标形状一模一样`);
    sig.set(bits, id);
    assert(bits.includes('1'), `${id} 的图标是空的`);
  }
  assert(sig.size === 8, `八种属性应该有八个不同的形，实际 ${sig.size} 个`);
});

// **每个模块都要 import 得动。** 语法错误只有加载那一刻才炸，
// 而 tests/run.js 只 import 它自己用得到的那些——touch.js、pwa.js、各个 scene
// 一个都不在里面。实际踩过：touch.js 里的一段 CSS 写在模板串里，
// 里面的 `\21BB` 被 JS 当成八进制转义，整个模块 SyntaxError，游戏白屏，
// 而 55 条测试全绿、lint_modules.py 三项全过——两边都看不见语法。
//
// 文件清单从**目录列表**拿：开发服务器就是 python 的 http.server，
// 它自带目录列表。硬编码一份清单一定会跟不上新增的文件（这个月新增了 9 个）。
async function jsUnder(dir) {
  const html = await (await fetch(dir)).text();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => decodeURIComponent(m[1]));
  let out = [];
  for (const h of hrefs) {
    if (h.startsWith('/') || h.startsWith('.')) continue;
    if (h.endsWith('.js')) out.push(dir + h);
    else if (h.endsWith('/')) out = out.concat(await jsUnder(dir + h));
  }
  return out;
}
try {
  // main.js 跳过：它是入口，import 的一刻就要拿 #game 画布、起 RAF 循环、开音频。
  // 少查它损失不大——入口一挂就是白屏，打开游戏立刻看得见；
  // 真正会静悄悄坏掉的是那些叶子模块（touch.js 那次正是如此）。
  const files = (await jsUnder('/src/')).filter(f => f !== '/src/main.js');
  const bad = [];
  for (const f of files) {
    try { await import(f); } catch (e) { bad.push(`${f}: ${e.message || e}`); }
  }
  test(`每个模块都 import 得动（${files.length} 个）`, () => {
    assert(files.length > 30, '只找到 ' + files.length + ' 个模块，目录列表大概没取到');
    assert(!bad.length, '\n    ' + bad.join('\n    '));
  });
} catch (e) {
  test('每个模块都 import 得动', () => assert(false, '取模块清单失败：' + e));
}

const out = document.getElementById('out');
out.innerHTML = results.map(r => `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : '\n    ' + r.err}</span>`).join('\n')
  + `\n\n${results.filter(r => r.ok).length}/${results.length} 通过`;
window.__testResults = results;
console.log('tests', results);
