// 自动战斗：进战斗后由 AI 替玩家下指令。
//
// 目标不是"最快通关"，而是**在不浪费资源的前提下稳住**——所以决策分三层，
// 上层永远压过下层：
//   ① 保命：有人倒了就救，有人快死了就治，中了睡眠/黑暗就解
//   ② 效率：能一回合多杀就用全体魔法，能打弱点就打弱点，能补刀就补刀
//   ③ 省蓝：普攻打得死的杂鱼不要浪费 MP，MP 见底时只留给救人
//
// 这里全是**纯函数**：只读 actor 与数据，不改任何状态，返回的指令对象
// 跟玩家手动下的完全同形（`{type,target,spellId,itemId}`），
// 所以 BattleScene 不需要为自动战斗开第二条执行路径。
//
// 期望值估算刻意不掷随机数（`estPhysical`/`estMagic` 用公式的均值），
// 因为决策要可复现——自动试玩靠同种子复现路线，掷随机会让它每次都不一样。

import * as F from './formulas.js';
import { memberSkills, skillReady, skillShape } from '../game/battleskill.js';

const LOW_HP = 0.30;        // 低于这个比例算"快死了"
const REVIVE_FIRST = true;  // 有人倒下时优先救人（少一个人打就是少一份输出）
const GROUP_MIN = 3;        // 敌人多到这个数才值得放全体魔法
const MP_RESERVE = 0.25;    // MP 低于这个比例就只留给保命，不再用于输出

// ---------- 期望值估算（不掷骰，取均值）----------

// 物理攻击的期望伤害：命中率 × 命中次数 × 每击均值
export function estPhysical(attacker, target) {
  const att = F.effectiveStats(attacker), def = F.effectiveStats(target);
  const hits = F.hitCount(att.acc) * (att.hits || 1);
  const p = F.hitChance(att.acc, def.eva);
  const perHit = Math.max(1, (att.atk * 1.5) - def.def + att.atk * ((att.crit || 0) / 100));
  let dmg = hits * p * perHit;
  if (attacker.element) dmg *= F.elementMultiplier(target, attacker.element);
  return dmg;
}

// 战技的期望伤害。和 estPhysical 同一套均值算法，只是把 skillAttack 的三个修正
// （段数 / 破防 / 倍率）换成它们的期望版本，外加必中与额外会心。
export function estSkill(shape, attacker, target) {
  const att = F.effectiveStats(attacker), def = F.effectiveStats(target);
  const hits = F.hitCount(att.acc) * (att.hits || 1) * (shape.hits || 1);
  const p = shape.sure ? 1 : F.hitChance(att.acc, def.eva);
  const dfn = shape.pierce ? Math.floor(def.def * (1 - shape.pierce)) : def.def;
  const crit = (att.crit || 0) + (shape.crit || 0);
  const perHit = Math.max(1, (att.atk * 1.5) - dfn + att.atk * (crit / 100));
  let dmg = hits * p * perHit * (shape.power ?? 1);
  if (attacker.element) dmg *= F.elementMultiplier(target, attacker.element);
  return dmg;
}

// 魔法的期望伤害。倍率为 0（免疫）时直接返回 0，调用方会跳过
export function estMagic(sp, caster, target) {
  const mult = F.elementMultiplier(target, sp.element);
  if (!mult) return 0;
  const base = sp.power * 1.5 + Math.floor((caster.int || 0) / 2);
  const mdefCut = 1 - 0.5 * Math.min(0.5, (target.mdef || 0) / 100);   // 有几率减半，取期望
  return base * mult * mdefCut;
}

// ---------- 小工具 ----------

const alive = list => list.filter(a => a.alive);
const hpRatio = a => a.hp / Math.max(1, a.maxHp);
const canPay = (a, sp) => a.mp >= sp.mp;
const spellsOf = (a, data) => (a.spells || []).map(id => ({ id, sp: data.spells[id] })).filter(x => x.sp);
// 「攻击魔法」要同时满足：有威力、打敌人、不是治疗也不是复活。
// 少了后两条会出事——治愈之风同时有 scope:'all' 和 power:18，
// 只看这两个字段会把它当成全体攻击丢到敌人身上。
const isAttackSpell = sp => sp.power > 0 && sp.target !== 'ally' && !sp.heal && !sp.revive;
const findItem = (inv, ids) => inv.find(s => ids.includes(s.id) && s.qty > 0);
// 现在放得出来的战技（冷却走完、血够拼）。没有 member 的（敌人、测试桩）一律没有。
const skillsOf = (a, data) => !a.member || !data.skills ? [] :
  memberSkills(a.member, data).map(id => ({ id, sk: data.skills[id] }))
    .filter(x => x.sk && skillReady(a, x.id, x.sk));

// 队伍里谁最该被救：血比最低的那个
function weakest(party) {
  const live = alive(party);
  return live.length ? live.reduce((a, b) => (hpRatio(a) <= hpRatio(b) ? a : b)) : null;
}

// 打谁：优先补刀（这一击就能杀掉的），其次挑威胁最大的。
// 补刀优先是因为每少一只敌人，下一回合挨的打就少一份——这是回合制里最实在的收益。
function pickTarget(actor, enemies) {
  const live = alive(enemies);
  if (!live.length) return null;
  const killable = live.filter(e => estPhysical(actor, e) >= e.hp);
  if (killable.length) return killable.reduce((a, b) => (a.hp <= b.hp ? a : b));  // 补最容易补的
  return live.reduce((a, b) => (b.atk > a.atk ? b : a));                          // 否则先打最疼的
}

// ---------- 决策主体 ----------

/**
 * 给一个角色决定这回合做什么。返回值与玩家手动下的指令同形；
 * 返回 null 表示"没什么好做的"（调用方退回普攻）。
 */
export function decideAutoAction(actor, party, enemies, data, inventory = []) {
  const foes = alive(enemies);
  if (!foes.length) return null;
  const spells = spellsOf(actor, data);
  const mpLow = actor.maxMp > 0 && actor.mp / actor.maxMp < MP_RESERVE;

  // ---- ① 保命 ----

  // 复活：倒下的人比什么都值钱
  const dead = party.filter(p => !p.alive);
  if (REVIVE_FIRST && dead.length) {
    const rev = spells.find(x => x.sp.revive && canPay(actor, x.sp));
    if (rev) return { type: 'magic', spellId: rev.id, target: dead[0] };
    const ph = findItem(inventory, ['phoenix']);
    if (ph) return { type: 'item', itemId: ph.id, target: dead[0] };
  }

  // 急救。两种情况都算"该治了"：
  //   ① 有人血比低于 30%——快死了，不治就要倒
  //   ② 两个人以上掉到一半以下且会全体治疗——全体治疗恰恰在这时候最划算，
  //      等到有人低于 30% 才治就浪费了它的价值（一次治四个人）
  const heals = spells.filter(x => x.sp.heal && canPay(actor, x.sp)).sort((a, b) => a.sp.mp - b.sp.mp);
  const groupHeal = heals.find(x => x.sp.scope === 'all');
  const manyHurt = alive(party).filter(p => hpRatio(p) < 0.5).length >= 2;
  const hurt = weakest(party);
  if (hurt && (hpRatio(hurt) < LOW_HP || (manyHurt && groupHeal))) {
    if (manyHurt && groupHeal) return { type: 'magic', spellId: groupHeal.id, target: 'all' };
    const singleHeal = heals.find(x => x.sp.scope !== 'all');
    if (singleHeal) return { type: 'magic', spellId: singleHeal.id, target: hurt };
    const missing = hurt.maxHp - hurt.hp;
    // 挑「能补上且最不浪费」的那瓶：够用的里面最小的，都不够就拿最大的
    const pots = ['potion', 'hipotion', 'xpotion', 'elixir']
      .map(id => ({ id, hp: data.items[id]?.effect?.hp || 0, slot: findItem(inventory, [id]) }))
      .filter(p => p.slot);
    const enough = pots.filter(p => p.hp >= missing).sort((a, b) => a.hp - b.hp);
    const pick = enough[0] || pots.sort((a, b) => b.hp - a.hp)[0];
    if (pick) return { type: 'item', itemId: pick.id, target: hurt };
  }

  // 解异常：睡眠让人整回合不动、中毒战斗后还会继续掉血，都值得花一回合
  for (const st of ['sleep', 'poison', 'blind']) {
    const sick = alive(party).find(p => p.status?.[st]);
    if (!sick) continue;
    // cure 字段可能是字符串也可能是数组（净化一次解三种），两种都要认
    const cures = c => (Array.isArray(c) ? c : [c]).includes(st);
    const cure = spells.find(x => x.sp.cure && cures(x.sp.cure) && canPay(actor, x.sp));
    if (cure) return { type: 'magic', spellId: cure.id, target: sick };
    const ITEM = { poison: 'antidote', blind: 'eyedrop', sleep: 'bell' }[st];
    const slot = ITEM && findItem(inventory, [ITEM]);
    if (slot) return { type: 'item', itemId: slot.id, target: sick };
  }

  // ---- ② 效率 ----

  const best = pickTarget(actor, foes);
  const phys = best ? estPhysical(actor, best) : 0;

  // 战技排在魔法前面：它不花 MP，代价只有冷却与（少数几招的）血，
  // 所以门槛比魔法低得多——只要比普攻好就该放，留着冷却不用等于白少一份输出。
  {
    const skills = skillsOf(actor, data);
    // 挡煞那一类（只对自己、没有威力）：有人被打到半血以下、而自己还站得稳时才值得花一回合
    const guard = skills.find(x => x.sk.target === 'self' && !x.sk.power);
    if (guard && hpRatio(actor) > 0.5 && alive(party).some(p => p !== actor && hpRatio(p) < 0.5)
        && !actor.status?.blockade) {
      return { type: 'skill', skillId: guard.id, target: actor };
    }
    // 血一少就不碰要放血的那几招
    const lowHp = hpRatio(actor) < 0.5;
    // 比法：先比**这一手能补掉几只**，再比**真正用得上的伤害**。
    // 「用得上」＝ min(伤害, 对方剩余 HP)：打在 29 血的杂鱼身上，186 和 161 是一样的，
    // 溢出的部分不该拿来给战技加分。少了这一层，七星步会为了补一只魔神仔而白白吃掉四回合冷却。
    // 反过来，**不能**因为「普攻反正打得死某一只」就整条跳过战技——
    // 原本这里正是一句无差别的否决，结果家将从头到尾一招都不放，
    // 而菜单、协程、公式全对，测试全绿、画面正常，只是那一栏形同虚设。
    const useful = (d, e) => Math.min(d, e.hp);
    let pickSk = null, pickTgt = null;
    let bestKills = best && phys >= best.hp ? 1 : 0;
    let bestDmg = (best ? useful(phys, best) : 0) * 1.05;      // 要**明显**比普攻好才换
    for (const x of skills) {
      if (x.sk.target === 'self' || !x.sk.power) continue;
      if (x.sk.hp && lowHp) continue;
      const shape = skillShape(x.sk, actor.member, x.id);
      const take = (kills, dmg, tgt) => {
        if (kills < bestKills || (kills === bestKills && dmg <= bestDmg)) return;
        bestKills = kills; bestDmg = dmg; pickSk = x; pickTgt = tgt;
      };
      if (x.sk.scope === 'all') {
        let kills = 0, sum = 0;
        for (const e of foes) { const d = estSkill(shape, actor, e); sum += useful(d, e); if (d >= e.hp) kills++; }
        take(kills, sum, 'all');
      } else {
        for (const e of foes) {
          const d = estSkill(shape, actor, e);
          take(d >= e.hp ? 1 : 0, useful(d, e), e);
        }
      }
    }
    if (pickSk) return { type: 'skill', skillId: pickSk.id, target: pickTgt };
  }

  if (!mpLow) {
    // 全体魔法：敌人够多才划算。用「总伤害 ÷ MP」跟普攻比，别为了放而放
    if (foes.length >= GROUP_MIN) {
      const group = spells.filter(x => x.sp.scope === 'all' && isAttackSpell(x.sp) && canPay(actor, x.sp));
      let bestGroup = null, bestSum = 0;
      for (const g of group) {
        const sum = foes.reduce((s, e) => s + estMagic(g.sp, actor, e), 0);
        if (sum > bestSum) { bestSum = sum; bestGroup = g; }
      }
      if (bestGroup && bestSum > phys * 1.5) return { type: 'magic', spellId: bestGroup.id, target: 'all' };
    }
    // 单体魔法：只在明显强过普攻时才用（打弱点、或物理砍不动的高防）
    const single = spells.filter(x => x.sp.scope !== 'all' && isAttackSpell(x.sp) && canPay(actor, x.sp));
    let bestSp = null, bestDmg = 0;
    for (const s of single) for (const e of foes) {
      const d = estMagic(s.sp, actor, e);
      if (d > bestDmg) { bestDmg = d; bestSp = { s, e }; }
    }
    // 普攻已经能杀掉目标就不必浪费 MP；否则魔法要高出 40% 才值得
    if (bestSp && !(best && phys >= best.hp) && bestDmg > phys * 1.4)
      return { type: 'magic', spellId: bestSp.s.id, target: bestSp.e };
  }

  // ---- ③ 兜底：普攻 ----
  return best ? { type: 'attack', target: best } : null;
}
