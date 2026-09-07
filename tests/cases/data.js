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
import { layoutWidth } from '../../src/core/Game.js';
import { MAX_W } from '../../src/core/draw.js';
import { TitleScene } from '../../src/title/TitleScene.js';
import { EndingScene } from '../../src/title/EndingScene.js';
test('每个遇敌区都有对应的战斗背景，不会静默退回通用背景', async () => {
  // 遇敌区没在 ZONE_BG/MAP_BG 里登记的话，战斗背景会**静默**退回 drawFallback()——
  // 没有正式美术、没有透视地面、地平线还停在旧位置，上半场的人整个浮在天上。
  // 而地图、遇敌表、其余测试全都正常，只有真的在那张图上打一场才看得出来。
  // 隘寮石城与万金古塚就这么漏了一整轮，所以钉成断言。
  const { makeBackdrop } = await import('../../src/battle/backdrop.js');
  const zones = new Set();
  for (const m of Object.values(data.maps))
    for (const def of Object.values(m.legend || {})) if (def.encounter && typeof def.encounter === 'string') zones.add(def.encounter);
  for (const m of Object.values(data.maps)) if (m.encounterZone) zones.add(m.encounterZone);
  for (const z of Object.keys(data.encounters || {})) zones.add(z);
  const bad = [...zones].filter(z => makeBackdrop(null, { zone: z }).kind === 'default');
  assert(!bad.length, '这些遇敌区没有专属战斗背景：' + bad.join(' '));
});

test('职业引用的魔法与指令都存在', () => {
  const cmds = new Set(['attack', 'skill', 'magic', 'summon', 'defend', 'item', 'flee']);
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

// ── 手机上不能有黑边 ───────────────────────────────────────────────────────
// 导演的要求是「铺满，两侧不要黑框，按键浮在画面上」。做法是**让画面本身变宽**
// （多显示一些世界），而不是拉伸或裁切。这条卡住那个换算。
test('画面宽度跟着屏幕比例走：主流手机横屏都不会留黑边', () => {
  const bad = [];
  // 市面上真实存在的横屏比例。19.5:9 的 iPhone 是 2.167——上限曾经是 448（＝2:1），
  // 于是两侧各留 32px 黑边，正是导演在手机上看到的那圈黑框。
  for (const [name, ar] of [['16:9', 16 / 9], ['18:9', 2], ['19.5:9 iPhone', 19.5 / 9],
                            ['20:9', 20 / 9], ['21:9', 21 / 9], ['4:3 平板', 4 / 3]]) {
    const w = layoutWidth(ar);
    const got = w / 224;
    // 逻辑宽取偶数，所以最多差半个逻辑像素；换算成形变 ≤0.5%，肉眼看不出来
    const off = Math.abs(got - ar) / ar;
    if (off > 0.006) bad.push(`${name}：屏幕 ${ar.toFixed(3)}，画布 ${got.toFixed(3)}（宽 ${w}），差 ${(off * 100).toFixed(1)}%`);
    if (w < 256) bad.push(`${name}：宽 ${w} 小于 256，照 256 排的 UI 会被切掉`);
  }
  assert(!bad.length, '\n    ' + bad.join('\n    '));
});

test('画面宽度：极端比例要夹得住，不能算出零或几千', () => {
  assert(layoutWidth(0.5) === 256, `竖屏该夹到 256，得到 ${layoutWidth(0.5)}`);
  assert(layoutWidth(99) === MAX_W, `超宽该夹到 ${MAX_W}，得到 ${layoutWidth(99)}`);
  // 0 / NaN 当成「没给比例」，退回当前窗口自己算——所以断言的是**下限**，不是某个定值
  // （写死 256 会随着跑测试那个窗口的形状时红时绿，第一版就是这么误报的）
  for (const bad of [0, NaN, -5, Infinity, undefined]) {
    const w = layoutWidth(bad);
    assert(Number.isFinite(w) && w >= 256 && w <= MAX_W, `layoutWidth(${bad}) 算出 ${w}`);
  }
  for (const ar of [1, 1.5, 2, 2.4]) assert(layoutWidth(ar) % 2 === 0, `${ar} 算出的宽度不是偶数`);
});

// 满屏铺东西的场景必须声明 wide，否则会被 Game.render 整层右移 OX，左边露出一条纯黑。
// 标题画面上就是这样：手机横屏时左边四分之一是黑的（导演看到的另一半黑边）。
// wide 是类字段，写在**实例**上，所以只能建一个实例来查。
test('整幅铺满的场景都声明了 wide，不会被居中偏移推出一条黑边', () => {
  const fake = { data, state: { party: [] }, W: 486, H: 224, OX: 115, input: {} };
  for (const [name, make] of [['TitleScene', () => new TitleScene(fake)],
                              ['EndingScene', () => new EndingScene(fake, [], () => {})]]) {
    let sc; try { sc = make(); } catch (e) { assert(false, `${name} 建不起来：${e.message}`); }
    assert(sc.wide === true, `${name} 没声明 wide——它按 game.W 排版，被右移 OX 之后左边会是一条黑`);
  }
});
