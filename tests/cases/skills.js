// 战技：数据完整性 + 冷却/代价的判定 + 真的跑一遍协程看发生了什么。
//
// 这一组盯的是三件**单元测试之外看不见**的事：
//   ① 数据与代码对不上（招式挂在没有 skill 指令的职业上、状态 id 打错）——静默失效
//   ② 冷却的时点（在「回合开始」走一格，不是在执行时）——错了就凭空多一回合
//   ③ 战技真的打得出伤害、真的挂得上破甲/挡煞——不然菜单点得动、画面什么都不发生
import { assert, test, data, jsMember } from '../context.js';
import * as F from '../../src/battle/formulas.js';
import { RNG } from '../../src/core/RNG.js';
import { newGameState } from '../../src/game/state.js';
import { healFull, changeJob } from '../../src/game/party.js';
import { STATUS } from '../../src/game/status.js';
import { makePartyActors, makeEnemyActors } from '../../src/battle/actors.js';
import { execute } from '../../src/battle/actions.js';
import { decideEnemyAction } from '../../src/battle/ai.js';
import { decideAutoAction } from '../../src/battle/autoBattle.js';
import { skillItems } from '../../src/battle/BattleScene.js';
import { memberSkills, skillsFor, cooldownOf, putOnCooldown, tickCooldowns,
         hpCost, skillReady, skillPower } from '../../src/game/battleskill.js';

const SKILL_JOBS = ['boxer', 'hunter', 'general'];

// ── 数据 ───────────────────────────────────────────────────────────────────

test('战技：三个物理职业各有战技，且都挂着 skill 指令', () => {
  for (const id of SKILL_JOBS) {
    const job = data.jobs[id];
    assert(job.commands.includes('skill'), `${id} 的 commands 少了 skill——菜单上根本不会出现那一栏`);
    assert((job.skills || []).length >= 3, `${id} 只有 ${(job.skills || []).length} 招`);
  }
  // 反过来：没有 skill 指令的职业不该挂 skills，挂了也永远点不到
  for (const [id, job] of Object.entries(data.jobs)) {
    if (job.commands.includes('skill')) continue;
    assert(!job.skills?.length, `${id} 挂了 skills 却没有 skill 指令，那几招永远点不到`);
  }
});

test('战技：jobs.json 指到的每一招 skills.json 里都有，且字段说得通', () => {
  const seen = new Set();
  for (const id of SKILL_JOBS) for (const e of data.jobs[id].skills) {
    const sid = typeof e === 'string' ? e : e.id;
    const sk = data.skills[sid];
    assert(sk, `${id} 指到的 ${sid} 在 skills.json 里没有`);
    seen.add(sid);
    assert(sk.name && sk.desc, `${sid} 缺 name / desc`);
    assert(sk.job === id, `${sid} 的 job 写成 ${sk.job}，但挂在 ${id} 身上`);
    assert(sk.cd >= 1, `${sid} 没有冷却——战技的门槛只有冷却与 HP，两样都不收就是白送`);
    // MP 是唯一的资源（CLAUDE.md）。战技绝不能带 mp 字段，否则就是第二套货币
    assert(sk.mp === undefined, `${sid} 带了 mp——这三个职业的 MP 池是 0，战技不能吃 MP`);
    assert(['enemy', 'self'].includes(sk.target), `${sid} 的 target 是 ${sk.target}`);
    for (const st of [sk.status, ...(Array.isArray(sk.selfStatus) ? sk.selfStatus : [sk.selfStatus])]) {
      if (st) assert(STATUS[st], `${sid} 指到的状态 ${st} 在 status.js 里没有`);
    }
    if (sk.hp) assert(sk.hp > 0 && sk.hp < 0.5, `${sid} 的 HP 代价 ${sk.hp} 太离谱`);
    if (sk.target === 'self') assert(sk.selfStatus, `${sid} 只对自己却什么都不给`);
    else assert(sk.power > 0, `${sid} 打敌人却没有威力`);
  }
  for (const sid of Object.keys(data.skills)) assert(seen.has(sid), `${sid} 定义了却没有任何职业学得到`);
});

test('战技：有 turns 的状态都写了 gone，否则倒计时走完会静默消失', () => {
  for (const [id, st] of Object.entries(STATUS)) {
    if (st.turns) assert(st.gone, `${id} 有 turns 却没有 gone——statusPhase 是照 turns 泛化的，会不吭声地消掉`);
  }
});

// ── 等级闸与熟练度 ─────────────────────────────────────────────────────────

test('战技：按角色等级解锁，1 / 4 / 7 各一招', () => {
  const job = data.jobs.boxer;
  assert(skillsFor(job, 1).length === 1, '1 级该只有一招');
  assert(skillsFor(job, 3).length === 1, '3 级还不该有第二招');
  assert(skillsFor(job, 4).length === 2, '4 级该开第二招');
  assert(skillsFor(job, 7).length === 3, '7 级该三招全开');
  assert(memberSkills(jsMember('boxer', 9), data).length === 3);
  // 转职之后是新职业那一套，**不承接**——招式是门派的
  const m = jsMember('boxer', 9);
  changeJob(m, 'hunter', [], data);
  const ids = memberSkills(m, data);
  assert(ids.includes('holdbreath') && !ids.includes('chainfist'), `转职后还留着旧职业的招：${ids}`);
});

test('战技：熟练度按 SKILL_POWER 那张表抬威力，且不被取整压成 0', () => {
  const sk = data.skills.sevenstar;               // power 0.42，是最容易被 Math.round 抹掉的那一条
  assert(skillPower(sk, 1) === sk.power, '1 级不该有加成');
  assert(skillPower(sk, 5) > sk.power * 1.4, '练满该有明显加成');
  assert(skillPower(sk, 5) < 1, `0.42 练满不该被取整成 ${skillPower(sk, 5)}`);
});

// ── 冷却与代价 ─────────────────────────────────────────────────────────────

test('战技：冷却一回合走一格，走完才放得出来', () => {
  const a = { hp: 40, maxHp: 40 };
  const sk = { cd: 3 };
  assert(skillReady(a, 'x', sk), '一开始就该能放');
  putOnCooldown(a, 'x', sk);
  assert(cooldownOf(a, 'x') === 3);
  for (const left of [2, 1]) { tickCooldowns(a); assert(cooldownOf(a, 'x') === left, `该剩 ${left}`); }
  assert(!skillReady(a, 'x', sk), '还没走完就放得出来了');
  tickCooldowns(a);
  assert(cooldownOf(a, 'x') === 0 && skillReady(a, 'x', sk), '走完三格该能再放');
  // cd 0 的不进表，别让它在 actor 上留一堆 0
  putOnCooldown(a, 'y', { cd: 0 });
  assert(cooldownOf(a, 'y') === 0 && !('y' in (a.cool || {})), 'cd 0 不该占位子');
});

test('战技：HP 代价按最大 HP 算，且放完至少还剩 1 点', () => {
  const a = { hp: 100, maxHp: 100 }, sk = { cd: 1, hp: 0.25 };
  assert(hpCost(sk, a) === 25, `该收 25，收了 ${hpCost(sk, a)}`);
  a.hp = 3;                                        // 残血：代价还是按最大 HP 算，所以放不出来
  assert(hpCost(sk, a) === 25 && !skillReady(a, 'x', sk), '残血还能拼命，会把自己拼死');
  a.hp = 25;
  assert(!skillReady(a, 'x', sk), '血正好等于代价也不行——放完就是 0');
  a.hp = 26;
  assert(skillReady(a, 'x', sk), '血比代价多一点就该放得出来');
});

// ── 公式 ───────────────────────────────────────────────────────────────────

test('战技公式：power 乘在最后，低倍率多段技不会被减防吃干净', () => {
  const rng = new RNG(9);
  // acc 40 → hitCount 1，所以段数就是 职业 2 × 战技 4 = 8（acc 到 50 会再翻一倍，那是另一件事）
  const att = { atk: 20, acc: 40, crit: 0, hits: 2 }, def = { def: 12, eva: 0 };
  // 七星步那一档：段数 ×4、倍率 0.42。如果 power 乘在 atk 上，每段都打不穿 12 点防御，
  // 结果会全是保底 1 点（8 段 = 8 伤害）。乘在最后就该明显高于这个数。
  const r = F.skillAttack(att, def, rng, { power: 0.42, hits: 4 });
  assert(r.hits === 8, `该有 8 段，实际 ${r.hits}`);
  assert(r.damage > 20, `伤害只有 ${r.damage}，power 大概被乘在减防之前了`);
});

test('战技公式：sure 必中、pierce 削防、crit 叠加', () => {
  const rng = new RNG(3);
  const att = { atk: 20, acc: 1, crit: 0, hits: 1 }, def = { def: 10, eva: 200 };
  // 命中率被回避压到下限 5%，普通打法几乎必空
  let missed = 0;
  for (let i = 0; i < 40; i++) if (F.physicalAttack(att, def, rng).miss) missed++;
  assert(missed > 25, `回避 200 该几乎打不中，只空了 ${missed} 次`);
  for (let i = 0; i < 40; i++) assert(!F.skillAttack(att, def, rng, { sure: true }).miss, 'sure 该必中');
  // pierce 0.6：按四成防御算，同种子下伤害必须更高
  const a = F.skillAttack(att, { def: 20, eva: 0 }, new RNG(7), { sure: true });
  const b = F.skillAttack(att, { def: 20, eva: 0 }, new RNG(7), { sure: true, pierce: 0.6 });
  assert(b.damage > a.damage, `破防没起作用：${a.damage} → ${b.damage}`);
});

test('破甲：防御打六折，可以和防护叠着算', () => {
  const base = { def: 40, acc: 10, eva: 10, status: {} };
  assert(F.effectiveStats(base).def === 40);
  assert(F.effectiveStats({ ...base, status: { sunder: 3 } }).def === 24, '破甲该把 40 压到 24');
  assert(F.effectiveStats({ ...base, status: { protect: 3 } }).def === 60);
  assert(F.effectiveStats({ ...base, status: { protect: 3, sunder: 3 } }).def === 36, '两个都挂着该依次相乘');
});

// ── 跑真协程 ───────────────────────────────────────────────────────────────

function skillBattle(jobId, enemyIds, level = 9, seed = 5) {
  const st = newGameState(data);
  st.party = st.party.slice(0, 2);
  st.party.forEach((m, i) => { if (i === 0) changeJob(m, jobId, [], data); m.level = level; healFull(m, data); });
  const scene = { game: { data, state: st }, rng: new RNG(seed), msg: '', escaped: false, canFlee: true,
    fx: { add() {}, shake() {} }, popup() {}, center() { return [0, 0]; }, size() { return { w: 48, h: 48 }; },
    party: makePartyActors(st, data), enemies: makeEnemyActors(enemyIds, data),
    alive(l) { return l.filter(a => a.alive); },
    retarget(t) { return t.alive ? t : (this.alive(t.side === 'enemy' ? this.enemies : this.party)[0] || null); },
    damage(t, dmg, { physical = false } = {}) { t.hp = Math.max(0, t.hp - dmg); if (physical && t.status.sleep) delete t.status.sleep; if (t.hp <= 0) { t.alive = false; t.status = {}; } },
    run(a) { const co = execute(this, a); let n = 0; while (!co.next().done && n++ < 200); return this.msg; } };
  return { s: scene, actor: scene.party[0] };
}

test('战技：连环拳真的打得出伤害，而且用完就进冷却', () => {
  const { s, actor } = skillBattle('boxer', ['goblin', 'goblin']);
  const foe = s.enemies[0], before = foe.hp;
  s.run({ actor, type: 'skill', skillId: 'chainfist', target: foe });
  assert(foe.hp < before, `一点血都没掉：${s.msg}`);
  assert(cooldownOf(actor, 'chainfist') === data.skills.chainfist.cd, '没进冷却');
  // 冷却里再点一次：要报出来，不能静默什么都不做
  const hp = foe.hp;
  const msg = s.run({ actor, type: 'skill', skillId: 'chainfist', target: foe });
  assert(foe.hp === hp && msg.includes('缓'), `冷却中还能打：${msg}`);
});

test('战技：碎甲挂得上破甲；拼命放自己的血但不会把自己放死', () => {
  const { s, actor } = skillBattle('boxer', ['knight'], 12, 11);
  const foe = s.enemies[0];
  let got = false;
  for (let i = 0; i < 12 && !got; i++) {            // 75% 成功率，掷几次一定中
    delete actor.cool?.sunderfist;
    s.run({ actor, type: 'skill', skillId: 'sunderfist', target: foe });
    got = !!foe.status.sunder;
  }
  assert(got, '碎甲十二次一次都没破甲');
  actor.hp = actor.maxHp;
  delete actor.cool?.allout;
  s.run({ actor, type: 'skill', skillId: 'allout', target: foe });
  const cost = Math.floor(actor.maxHp * data.skills.allout.hp);
  assert(actor.hp === actor.maxHp - cost, `该放 ${cost} 点血，剩 ${actor.hp}/${actor.maxHp}`);
  assert(actor.alive, '把自己拼死了');
});

test('战技：踏罡打全体，一发落在每一只身上', () => {
  const { s, actor } = skillBattle('general', ['goblin', 'goblin', 'goblin'], 9, 4);
  const before = s.enemies.map(e => e.hp);
  s.run({ actor, type: 'skill', skillId: 'pacing', target: 'all' });
  const hit = s.enemies.filter((e, i) => e.hp < before[i]).length;
  assert(hit === 3, `三只里只打到 ${hit} 只：${s.msg}`);
});

test('挡煞：开脸之后敌人先冲家将来', () => {
  const { s, actor } = skillBattle('general', ['goblin'], 9, 6);
  s.run({ actor, type: 'skill', skillId: 'openface', target: actor });
  assert(actor.status.blockade, `开脸没挂上挡煞：${s.msg}`);
  assert(actor.status.protect, '开脸该顺带把自己撑硬');
  const rng = new RNG(1);
  const foe = s.enemies[0];
  for (let i = 0; i < 30; i++) {
    const d = decideEnemyAction(foe, s.enemies, s.party, data, rng);
    if (d?.type === 'attack') assert(d.target === actor, '挡煞开着，敌人却去打别人');
  }
  // 挡煞一散，目标又该散开
  delete actor.status.blockade;
  let other = 0;
  for (let i = 0; i < 40; i++) {
    const d = decideEnemyAction(foe, s.enemies, s.party, data, rng);
    if (d?.type === 'attack' && d.target !== actor) other++;
  }
  assert(other > 0, '挡煞散了敌人还是只打他一个');
});

test('战技：菜单条目该灰的灰，右栏写得出代价', () => {
  const { actor } = skillBattle('boxer', ['goblin'], 9);
  const items = skillItems(actor, data);
  assert(items.length === 3, `9 级该有三招，列出 ${items.length}`);
  assert(items.every(i => !i.disabled), '一开始三招都该能点');
  assert(items.find(i => i.value === 'allout').right.startsWith('血'), '拼命的右栏该写血');
  putOnCooldown(actor, 'chainfist', data.skills.chainfist);
  const after = skillItems(actor, data);
  const it = after.find(i => i.value === 'chainfist');
  assert(it.disabled && it.right.includes('缓'), `冷却中该灰掉并写「缓」：${JSON.stringify(it)}`);
  actor.hp = 1;
  assert(skillItems(actor, data).find(i => i.value === 'allout').disabled, '血只剩 1 还能点拼命');
});

// ── 自动战斗真的会用战技 ───────────────────────────────────────────────────
// **这一条是回过头补的**：菜单、协程、公式全对，自动战斗却一招都不放——
// 原因是那边有一句无差别的「普攻已经能补掉一只就别用战技」，
// 而杂鱼群里几乎总有一只是普攻打得死的，于是整条战技分支被永久跳过。
// 全绿、不报错、画面上一切正常，只是那一栏形同虚设。
test('自动战斗：该用战技的时候真的会用', () => {
  const { s, actor } = skillBattle('general', ['skeleton', 'skeleton', 'goblin'], 9);
  const act = decideAutoAction(actor, s.party, s.enemies, data, []);
  assert(act?.type === 'skill', `九级家将面对三只该放战技，实际 ${act?.type}`);
  // 反过来：只剩一只、而且普攻就补得掉时，不该为了放而放
  const solo = skillBattle('general', ['goblin'], 9).s;
  const a2 = solo.party[0];
  const act2 = decideAutoAction(a2, solo.party, solo.enemies, data, []);
  assert(act2?.type === 'attack', `一只杂鱼普攻就能补掉，不该动冷却：${JSON.stringify(act2?.skillId)}`);
});
