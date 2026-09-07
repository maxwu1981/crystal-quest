// 公式层：RNG、经验曲线、命中与伤害、元素倍率、逃跑、升级。
// 全是纯函数，不碰任何数据文件之外的东西——所以这一组跑得最快，改公式先看它红不红。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data } from '../context.js';
import * as F from '../../src/battle/formulas.js';
import { RNG } from '../../src/core/RNG.js';
import { computeStats, grantExp } from '../../src/game/party.js';
import { ELEMENT_IDS } from '../../src/battle/elements.js';
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
