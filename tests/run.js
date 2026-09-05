// 浏览器内测试：公式 + 数据完整性。打开 tests/index.html 查看；window.__testResults 供自动化读取。
import * as F from '../src/battle/formulas.js';
import { RNG } from '../src/core/RNG.js';
import { computeStats, grantExp } from '../src/game/party.js';
import { loadData } from '../src/data/loader.js';
import { parseMap } from '../src/field/FieldScene.js';

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
    assert(data.encounters[md.encounterZone], `${id} 遇敌区 ${md.encounterZone} 不存在`);
  }
});
test('初始队伍职业存在', () => { for (const p of data.party) assert(data.jobs[p.jobId], p.name); });

const out = document.getElementById('out');
out.innerHTML = results.map(r => `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : '\n    ' + r.err}</span>`).join('\n')
  + `\n\n${results.filter(r => r.ok).length}/${results.length} 通过`;
window.__testResults = results;
console.log('tests', results);
