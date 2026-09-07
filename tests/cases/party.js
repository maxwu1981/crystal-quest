// 队员：属性、状态、转职，以及职业等级/技能等级那一套。
// 「承接」「职业等级分开记」「旧存档读得进来」三条是这一组的核心——
// 原本 spellsFor 是纯推导，转职一瞬间旧技能全没，这三条卡的就是那个。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data, jsMember } from '../context.js';
import * as F from '../../src/battle/formulas.js';
import { RNG } from '../../src/core/RNG.js';
import { computeStats, grantExp } from '../../src/game/party.js';
import { removeItem, countItem, applyItem, canUseOn, campParty } from '../../src/game/items.js';
import { newGameState, loadGame, SAVE_KEY } from '../../src/game/state.js';
import { FINALE_ID, memberSpells, jobLevel, grantJobExp, availableSummons, useSkill, skillScale, normalizeMember, skillLevelOf, summonUnlockLevel, summonOrder, jpForJobLevel, levelForUses, SKILL_MAX, SKILL_USES, JP_PER_LEVEL, JP_PER_BATTLE, JP_ACT_BONUS } from '../../src/game/jobskill.js';
import { spellsFor, changeJob, healFull, equipmentAfterJobChange } from '../../src/game/party.js';
import { persistentOnly } from '../../src/game/status.js';
import { u } from '../../src/assets/terrainBits.js';
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
