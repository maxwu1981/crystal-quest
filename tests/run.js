// 浏览器内测试：公式 + 数据完整性。打开 tests/index.html 查看；window.__testResults 供自动化读取。
import * as F from '../src/battle/formulas.js';
import { RNG } from '../src/core/RNG.js';
import { computeStats, grantExp } from '../src/game/party.js';
import { loadData } from '../src/data/loader.js';
import { parseMap } from '../src/field/FieldScene.js';
import { addItem, removeItem, countItem, applyItem, equip, canEquip, canUseOn, campParty } from '../src/game/items.js';
import { newGameState } from '../src/game/state.js';
import { wrapText } from '../src/core/text.js';
import { pickVariant, applyVariant } from '../src/field/npc.js';
import { buyItem, sellItem } from '../src/game/shop.js';
import { spellsFor, changeJob, healFull, equipmentAfterJobChange } from '../src/game/party.js';
import { STATUS, cureStatus, persistentOnly } from '../src/game/status.js';
import { makePartyActors, makeEnemyActors } from '../src/battle/actors.js';
import { execute, inflict } from '../src/battle/actions.js';

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
      let y0 = im.height, y1 = -1;
      for (let y = 0; y < im.height; y++) for (let px = 0; px < im.width; px++) {
        if (d[(y * im.width + px) * 4 + 3] > 8) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      }
      if (y1 >= 0) out.push({ cid, view, ratio: (y1 - y0 + 1) / im.height, w: im.width, h: im.height });
    }
  }
  return out;
}
const artRows = await measureArt();

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
  const t = { weak: ['fire'], resist: ['ice'], immune: ['poison'] };
  assert(F.elementMultiplier(t, 'fire') === 2); assert(F.elementMultiplier(t, 'ice') === 0.5);
  assert(F.elementMultiplier(t, 'poison') === 0); assert(F.elementMultiplier(t, 'thunder') === 1); assert(F.elementMultiplier(t, null) === 1);
  const rng = new RNG(3);
  assert(F.magicDamage(10, { int: 4 }, t, 'poison', rng).damage === 0);
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
  const cmds = new Set(['attack', 'magic', 'defend', 'item', 'flee']);
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
test('存档往返：状态可 JSON 序列化且不丢字段', () => {
  const s = newGameState(data), back = JSON.parse(JSON.stringify(s));
  assert(JSON.stringify(back) === JSON.stringify(s)); assert(back.party[0].equipment.weapon === 'bronze_sword' && back.party[0].equipment.accessory === null); assert(back.inventory.length === 3);
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
    for (const s of e.immune || []) assert(STATUS[s] || ['fire', 'thunder', 'ice', 'poison', 'dark'].includes(s), `${id} immune ${s}`);
  }
});

// 用假场景跑行动协程（不需要画面），检验状态逻辑
function fakeBattle(partyJobs, enemyIds, seed = 5) {
  const st = newGameState(data); st.party = st.party.filter(m => partyJobs.includes(m.jobId)); st.party.forEach(m => { m.level = 12; healFull(m, data); });
  const scene = { game: { data, state: st }, rng: new RNG(seed), msg: '', escaped: false, canFlee: true,
    fx: { add() {}, shake() {} }, popup() {}, center() { return [0, 0]; },   // 桩要跟 Effects 的接口一致
    party: makePartyActors(st, data), enemies: makeEnemyActors(enemyIds, data),
    alive(l) { return l.filter(a => a.alive); },
    retarget(t) { return t.alive ? t : (this.alive(t.side === 'enemy' ? this.enemies : this.party)[0] || null); },
    damage(t, dmg, { physical = false } = {}) { t.hp = Math.max(0, t.hp - dmg); if (physical && t.status.sleep) delete t.status.sleep; if (t.hp <= 0) { t.alive = false; t.status = {}; } },
    run(a) { const co = execute(this, a); let n = 0; while (!co.next().done && n++ < 100); return this.msg; } };
  return scene;
}
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
  assert(s.element === 'thunder', '草薙剑应带雷属性');
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

// 收集全部获取途径：宝箱 / Boss 掉落 / NPC 赠予
function itemSources() {
  const src = new Map();
  const add = (id, where) => { if (!id) return; if (!src.has(id)) src.set(id, []); src.get(id).push(where); };
  for (const [mid, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) add(ev.item, `${mid} 宝箱 ${ev.id || ev.x + ',' + ev.y}`);
    for (const n of md.npcs || []) {
      for (const r of n.script?.reward || []) add(r.id, `${mid} ${n.name} 掉落`);
      for (const v of n.dialogue || []) for (const g of v.give?.items || []) add(g.id, `${mid} ${n.name} 赠予`);
    }
  }
  return src;
}

test('每件神话装备都真的拿得到（之前 23 件里有 15 件玩家永远见不到）', () => {
  const src = itemSources();
  const missing = Object.entries(data.items).filter(([id, it]) => it.myth && !src.has(id)).map(([id]) => id);
  assert(!missing.length, `这些神话装备定义了却没有任何出处：${missing.join(' ')}`);
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

test('正式美术：所有角色精灵一样高、尺寸一致（防止某个职业显得特别小）', () => {
  if (!artRows || !artRows.length) return; // 还没生成正式美术就跳过
  const sizes = new Set(artRows.map(r => r.w + 'x' + r.h));
  assert(sizes.size === 1, '角色图尺寸不统一: ' + [...sizes].join(' '));
  const lo = Math.min(...artRows.map(r => r.ratio)), hi = Math.max(...artRows.map(r => r.ratio));
  const worst = artRows.slice().sort((a, b) => a.ratio - b.ratio)[0];
  assert(hi - lo <= 0.12, `角色身高不一致 ${(lo*100).toFixed(0)}%–${(hi*100).toFixed(0)}%，最矮的是 ${worst.cid}_${worst.view}`);
  assert(lo > 0.8, `${worst.cid}_${worst.view} 只占画布高度 ${(worst.ratio*100).toFixed(0)}%，角色应该几乎占满`);
});

const out = document.getElementById('out');
out.innerHTML = results.map(r => `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : '\n    ' + r.err}</span>`).join('\n')
  + `\n\n${results.filter(r => r.ok).length}/${results.length} 通过`;
window.__testResults = results;
console.log('tests', results);
