// 战技：拳头师 / 山猎人 / 家将 的专属指令（data/skills.json）。
//
// **为什么门槛不是 MP**：CLAUDE.md 写死「MP 是唯一的资源，不要再加第二套货币」，
// 而这三个职业的 base.mp 本来就是 0——给它们发 MP 等于推翻那条铁律。
// 所以门槛用两样**本来就存在**的东西：
//   ① 冷却回合（cd）：用掉之后要等几个自己的回合。这是时间，不是货币，
//      一场战斗内有效，战斗结束跟着 actor 一起丢掉，**不进存档**。
//   ② HP（hp，占最大 HP 的比例）：只有最重的两招收。血本来就是资源，
//      拿血换爆发是真的取舍，而账本上仍然只有 HP / MP 两栏。
// 于是「这回合放哪一招」变成了真的选择，账面上却没有多出第三种数字。
//
// **战技跟着现职走，不像魔法那样承接**：招式是那个门派的——八家将的开脸，
// 拳头师做不来。好处是它一个存档字段都不占（从 jobId + 角色等级纯推导），
// 旧存档读进来就有，也不必改 normalizeMember。
// 熟练度另算：skillUses 那张表本来就按 id 记，战技照用，练熟了这一下更重。
import { SKILL_POWER, skillLevelOf } from './jobskill.js';

// ── 会哪几招 ───────────────────────────────────────────────────────────────
// 表项写成 "chainfist" 或 { id: "chainfist", level: 4 }，和 jobs.json 的 spells 同形
export function skillsFor(job, level) {
  return (job?.skills || []).map(s => typeof s === 'string' ? { id: s, level: 1 } : s)
    .filter(s => level >= (s.level || 1)).map(s => s.id);
}

// 这个队员现在会的全部战技（data.skills 里没有的条目直接丢掉，和 memberSpells 同一条规矩）
export function memberSkills(member, data) {
  const ids = skillsFor(data.jobs?.[member.jobId], member.level);
  return data.skills ? ids.filter(id => data.skills[id]) : ids;
}

// ── 冷却 ───────────────────────────────────────────────────────────────────
// 存在**战斗 actor** 上（actor.cool），不是队员身上——战斗一结束整个 actor 就丢了，
// 所以它永远进不了 game.state，铁律 3「所有状态可 JSON.stringify」不受影响。
export function cooldownOf(actor, id) { return Math.max(0, actor.cool?.[id] || 0); }

export function putOnCooldown(actor, id, sk) {
  const cd = Math.max(0, Math.floor(sk?.cd || 0));
  if (cd > 0) (actor.cool ||= {})[id] = cd;
}

// 轮到这个角色的时候走一格。**调用点在「他的回合开始」而不是「他行动时」**：
// 回合制里四个人先一起下令、之后才依次执行，如果在执行时才减，
// 菜单上看到的永远是上一回合的数字，冷却读起来会凭空多一回合。
export function tickCooldowns(actor) {
  const c = actor.cool; if (!c) return;
  for (const id of Object.keys(c)) if (--c[id] <= 0) delete c[id];
}

// ── 代价与威力 ─────────────────────────────────────────────────────────────
// 这一招要放掉多少血。比例算在**最大** HP 上（残血时不会因为便宜就变好用）。
export function hpCost(sk, actor) {
  return sk?.hp ? Math.max(1, Math.floor((actor.maxHp || 0) * sk.hp)) : 0;
}

// 放得出来吗：冷却走完了，而且**放完还得活着**（血正好等于代价也不行）。
export function skillReady(actor, id, sk) {
  return cooldownOf(actor, id) === 0 && actor.hp > hpCost(sk, actor);
}

// 熟练度对威力的修正：和魔法 / 召唤共用 SKILL_POWER 那张表（练满 ×1.5）。
// 不走 jobskill.skillScale——那个会把结果 Math.round 成整数，
// 而战技的 power 是 0.42–2.2 的**倍率**，取整会把它压成 0 或 1。
export function skillPower(sk, level) {
  return (sk?.power ?? 0) * SKILL_POWER[Math.max(1, Math.min(SKILL_POWER.length - 1, Math.floor(level || 1)))];
}

// 战斗与模拟都用这一份：把一条战技连同它此刻的等级修正打包成 skillAttack 收的形状。
export function skillShape(sk, member, id) {
  const lv = member ? skillLevelOf(member, id) : 1;
  return { power: skillPower(sk, lv), hits: sk.hits || 1, crit: sk.crit || 0,
           pierce: sk.pierce || 0, sure: !!sk.sure, level: lv };
}
