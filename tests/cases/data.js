// 数据完整性：JSON 里的引用指向的东西真的存在吗、字段齐不齐。
// 这一组不测行为，只测「数据自己说得通」。新增内容（怪、法术、道具）最先打红的就是它。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data } from '../context.js';
import { parseMap } from '../../src/field/FieldScene.js';
import { canEquip } from '../../src/game/items.js';
import { STATUS } from '../../src/game/status.js';
import { ELEMENTS } from '../../src/battle/elements.js';
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
