// 浏览器内测试：公式 + 数据完整性。打开 tests/index.html 查看；window.__testResults 供自动化读取。
import * as F from '../src/battle/formulas.js';
import { RNG } from '../src/core/RNG.js';
import { computeStats, grantExp } from '../src/game/party.js';
import { loadData } from '../src/data/loader.js';
import { parseMap } from '../src/field/FieldScene.js';
import { addItem, removeItem, countItem, applyItem, equip, canEquip } from '../src/game/items.js';
import { newGameState } from '../src/game/state.js';
import { wrapText } from '../src/core/text.js';
import { pickVariant, applyVariant } from '../src/field/npc.js';
import { buyItem, sellItem } from '../src/game/shop.js';

const results = [];
const assert = (c, m = 'assert') => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e) }); } }

const data = await loadData('../data/');

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
  const m = { jobId: 'warrior', level: 1, exp: 0, hp: 10, mp: 0, equipment: {} };
  const before = computeStats(m, data);
  const gains = grantExp(m, F.expForLevel(2), data);
  assert(gains.length === 1 && m.level === 2);
  assert(computeStats(m, data).maxHp > before.maxHp); assert(m.hp === 10 + gains[0].hpUp);
});
test('职业引用的魔法与指令都存在', () => {
  const cmds = new Set(['attack', 'magic', 'defend', 'item', 'flee']);
  for (const [id, j] of Object.entries(data.jobs)) {
    for (const s of j.spells) assert(data.spells[s], `${id} 引用了不存在的魔法 ${s}`);
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
  const m = { jobId: 'whitemage', level: 1, exp: 0, hp: 1, mp: 1, equipment: { weapon: 'staff', armor: null } };
  const inv = [{ id: 'ironsword', qty: 1 }, { id: 'dagger', qty: 1 }];
  assert(!equip(m, 'weapon', 'ironsword', inv, data), '白魔不能拿铁剑');
  const before = computeStats(m, data).atk;
  assert(equip(m, 'weapon', 'dagger', inv, data));
  assert(m.equipment.weapon === 'dagger' && countItem(inv, 'staff') === 1 && countItem(inv, 'dagger') === 0);
  assert(computeStats(m, data).atk > before);
  assert(equip(m, 'weapon', null, inv, data) && m.equipment.weapon === null && countItem(inv, 'dagger') === 1);
});
test('道具数据完整；初始装备/背包引用存在且职业可装', () => {
  for (const p of data.party) for (const slot of ['weapon', 'armor']) {
    const id = p.equipment?.[slot]; if (!id) continue; const it = data.items[id];
    assert(it && it.type === slot, `${p.name} ${slot}`); assert(canEquip(it, { jobId: p.jobId }), `${p.name} 不能装备 ${id}`);
  }
  for (const s of data.config.startInventory || []) assert(data.items[s.id], s.id);
  for (const [id, it] of Object.entries(data.items)) {
    assert(['consumable', 'weapon', 'armor'].includes(it.type), id);
    if (it.type === 'consumable') assert(it.effect && typeof it.battle === 'boolean' && typeof it.field === 'boolean', id);
    if (it.jobs) for (const j of it.jobs) assert(data.jobs[j], `${id} 职业 ${j}`);
  }
});
test('存档往返：状态可 JSON 序列化且不丢字段', () => {
  const s = newGameState(data), back = JSON.parse(JSON.stringify(s));
  assert(JSON.stringify(back) === JSON.stringify(s)); assert(back.party[0].equipment.weapon === 'shortsword'); assert(back.inventory.length === 3);
});

test('地图事件与 NPC：传送目标存在且可走、NPC 站在可走格、对话/脚本格式正确', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md);
    for (const ev of md.events || []) {
      assert(ev.type === 'warp', `${id} 事件类型 ${ev.type}`);
      const to = data.maps[ev.to.map]; assert(to, `${id} 传送到不存在的地图 ${ev.to.map}`);
      const tm = parseMap(to), c = tm.cells[ev.to.y * tm.w + ev.to.x];
      assert(c && !c.solid, `${id} 传送目标 ${ev.to.map}(${ev.to.x},${ev.to.y}) 不可走`);
      assert(!tm.events[`${ev.to.x},${ev.to.y}`], `${id} 传送目标落在另一个传送点上`);
    }
    for (const n of md.npcs || []) {
      const c = m.cells[n.y * m.w + n.x]; assert(c && !c.solid, `${id}/${n.id} 站在不可走格`);
      assert(Array.isArray(n.dialogue) && n.dialogue.length, `${id}/${n.id} 没有对话`);
      for (const v of n.dialogue) assert(Array.isArray(v.lines) && v.lines.length, `${id}/${n.id} 对话缺 lines`);
      if (n.script) { assert(['inn', 'shop'].includes(n.script.type), `${n.id} 脚本类型`); for (const it of n.script.items || []) assert(data.items[it], `${n.id} 商店卖不存在的 ${it}`); }
    }
  }
});
test('对话每页最多 3 行（240px 宽，带名字）', () => {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const [id, md] of Object.entries(data.maps)) for (const n of md.npcs || []) {
    const pages = [...n.dialogue.flatMap(v => v.lines), ...(n.script?.wake || []), ...(n.script?.poor || [])];
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
  assert(!buyItem(st, 'ironsword', data).ok && st.gold === 70);
  assert(sellItem(st, 'potion', data).ok && st.gold === 85 && st.inventory.length === 0);
  assert(!sellItem(st, 'potion', data).ok);
});

const out = document.getElementById('out');
out.innerHTML = results.map(r => `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : '\n    ' + r.err}</span>`).join('\n')
  + `\n\n${results.filter(r => r.ok).length}/${results.length} 通过`;
window.__testResults = results;
console.log('tests', results);
