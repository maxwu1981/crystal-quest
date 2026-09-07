// 战斗行为：行动协程与請神。
// 用假场景跑真协程（fakeBattle），不渲染画面但走完整条执行路径。
// **桩少一个方法，协程跑到那一行就 TypeError**——size() 就是这么被抓出来的，
// 所以 actions.js 那边不要写成 scene.size?.(t) 把它绕过去。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data, jsMember } from '../context.js';
import * as F from '../../src/battle/formulas.js';
import { RNG } from '../../src/core/RNG.js';
import { computeStats } from '../../src/game/party.js';
import { newGameState } from '../../src/game/state.js';
import { finaleReady, FINALE_ID, grantJobExp, availableSummons, useSkill, summonOrder, jpForJobLevel, SKILL_MAX, SKILL_USES } from '../../src/game/jobskill.js';
import { changeJob, healFull } from '../../src/game/party.js';
import { persistentOnly } from '../../src/game/status.js';
import { makePartyActors, makeEnemyActors } from '../../src/battle/actors.js';
import { execute, inflict } from '../../src/battle/actions.js';

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
