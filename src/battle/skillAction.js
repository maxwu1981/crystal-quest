// 「战技」指令的执行（协程，形状同 actions.js 的 castSpell / callSummon）。
//
// 三个物理职业本来只有平 A，导演点名要摒弃这个设定。战技就是那一栏：
// 破甲、挡煞、多段斩、全体扫击各有各的用法，而**门槛不是 MP**——
// 那三个职业的 MP 池是 0，加一套蓝条等于推翻 CLAUDE.md 那条「MP 是唯一的资源」。
// 用的是冷却回合 + 少数几招收 HP，理由与实现见 game/battleskill.js 的档头。
//
// 结算走 formulas.skillAttack，也就是普攻那条路加三个修正（段数 / 破防 / 倍率），
// 所以「防御减半」「会心」「至少 1 点」这些规矩全场只有一份。
import * as F from './formulas.js';
import { STATUS } from '../game/status.js';
import { audio } from '../core/audio.js';
import { inflict, veilOn } from './afflict.js';
import { useSkill } from '../game/jobskill.js';
import { memberSkills, cooldownOf, putOnCooldown, hpCost, skillShape } from '../game/battleskill.js';
import { ELEMENT_FX, ELEMENT_TINT } from './elements.js';

// 打不出去的三种情形各报各的。**不静默返回**——玩家点了却什么都没发生是最难查的一种。
function* refuse(scene, text) { scene.msg = text; audio.sfx('buzz'); yield 0.6; }

// 武器属性照旧生效：对弱点翻倍、被抗性减半，和普攻同一条（actions.js 的 attack）。
// 少了这一句，拿着草薙剑的人一使战技反而把武器的属性丢了——而这不会报错，
// 只会表现成「神装用战技比用普攻还弱」。命中时的特效也跟着属性走。
function elementize(actor, t, r) {
  const mult = F.elementMultiplier(t, actor.element);
  if (actor.element && mult !== 1 && !r.miss) r.damage = Math.max(1, Math.floor(r.damage * mult));
  return mult;
}
const impactOf = (actor, sk) => sk.fx || (actor.element && ELEMENT_FX[actor.element]) || 'slash';

export function* useBattleSkill(scene, actor, a) {
  const data = scene.game.data;
  const sk = data.skills?.[a.skillId];
  if (!sk) { yield* refuse(scene, `${actor.name} 没有这一招`); return; }
  // 会不会这一招问数据层，战斗里不重新判一遍（和「請神」同一条规矩）
  if (actor.member && !memberSkills(actor.member, data).includes(a.skillId)) {
    yield* refuse(scene, `${actor.name} 使不出 ${sk.name}`); return;
  }
  const wait = cooldownOf(actor, a.skillId);
  if (wait) { yield* refuse(scene, `${sk.name} 还要缓 ${wait} 回合`); return; }
  const cost = hpCost(sk, actor);
  if (actor.hp <= cost) { yield* refuse(scene, `${actor.name} 拼不动了`); return; }

  const self = sk.target === 'self';
  const targets = self ? [actor]
    : sk.scope === 'all' ? scene.alive(scene.enemies)
    : [scene.retarget(a.target)].filter(Boolean);
  if (!targets.length) { scene.msg = `${actor.name} 使出 ${sk.name}！\n没有对象`; yield 0.6; return; }

  // ── 付账 ──
  // 冷却先记上：这一招的其余部分再怎么早退，账都已经结清了。
  putOnCooldown(actor, a.skillId, sk);
  if (cost) {
    // **不走 scene.damage**：那条路会判死亡、会打断睡眠、会算进「挨了打」。
    // 拼命是自己放的血，skillReady 保证放完至少还剩 1 点。
    actor.hp = Math.max(1, actor.hp - cost);
    scene.popup(actor, String(cost), '#e0704a');
  }
  const learn = actor.member ? useSkill(actor.member, a.skillId) : null;
  const shape = skillShape(sk, actor.member, a.skillId);

  scene.msg = `${actor.name} 使出 ${sk.name}！`;
  if (self) { yield* selfSkill(scene, actor, sk); }
  else {
    // 起手一律是挥出去的那一下——战技是身法，不是施法，脚下不该浮光环
    actor.lunge = 0.3;
    scene.fx.add('swing', ...scene.center(actor), { dir: actor.side === 'party' ? -1 : 1 });
    yield 0.3;
    if (targets.length > 1) yield* skillVolley(scene, actor, sk, shape, targets);
    else yield* skillOn(scene, actor, sk, shape, targets[0]);
  }
  if (learn?.leveled) { scene.msg += `\n${sk.name} 使得更顺了`; yield 0.5; }
}

// ── 只对自己的那一类（家将「开脸」）──────────────────────────────────────
// selfStatus 收字符串或数组（和 spells.json 的 cure 同一条规矩）。
// 自己给自己上的东西**必中**——inflict 的 chance 覆盖走 1，但免疫仍然一票否决。
function* selfSkill(scene, actor, sk) {
  const list = Array.isArray(sk.selfStatus) ? sk.selfStatus : [sk.selfStatus].filter(Boolean);
  scene.fx.add('heal', ...scene.center(actor));
  audio.sfx(sk.sfx || 'heal');
  const got = [];
  for (const st of list) if (inflict(scene, actor, st, 1)) got.push(STATUS[st].name);
  scene.msg += got.length ? `\n${actor.name} ${got.join('、')}了` : '\n没有变化';
  yield 0.8;
}

// ── 单体 ────────────────────────────────────────────────────────────────────
function* skillOn(scene, actor, sk, shape, t) {
  const r = F.skillAttack(F.effectiveStats(actor), F.effectiveStats(t), scene.rng, shape);
  if (r.miss) { scene.popup(t, 'MISS', '#ddd'); audio.sfx('miss'); scene.msg += '\n没有命中'; yield 0.7; return; }
  const mult = elementize(actor, t, r);
  const face = actor.side === 'party' ? -1 : 1;
  const fx = scene.fx.add(impactOf(actor, sk), ...scene.center(t), { dir: face, ...scene.size(t) });
  if (actor.element) veilOn(t, fx, ELEMENT_TINT[actor.element]);
  if (r.crit) scene.fx.shake(0.18);
  audio.sfx(sk.sfx || (r.crit ? 'crit' : 'hit'));
  scene.damage(t, r.damage, { physical: true, crit: r.crit });
  scene.msg += `\n${r.hits} 次命中${r.crit ? '  会心一击！' : ''}`;
  if (mult > 1) scene.msg += '  效果拔群！'; else if (mult < 1 && mult > 0) scene.msg += '  效果不佳…';
  scene.msg += `\n${t.name} 受到 ${r.damage} 伤害`;
  yield 0.8;
  if (!t.alive) { scene.msg += `\n${t.name} 倒下了`; yield 0.5; return; }
  if (sk.status && inflict(scene, t, sk.status)) {
    scene.msg += `\n${t.name} ${STATUS[sk.status].name}了`; audio.sfx('buzz'); yield 0.6;
  }
}

// ── 全体（家将「踏罡」/ 山猎人「扫山」）────────────────────────────────────
// 和全体魔法同一套演出：**所有目标同时挨**，伤害数字由各自头上的 popup 交代，
// 消息窗只留一句总结——逐个报的话四只敌人四行，连招式名那句都会被挤掉。
function* skillVolley(scene, actor, sk, shape, targets) {
  const face = actor.side === 'party' ? -1 : 1;
  for (const t of targets) scene.fx.add(impactOf(actor, sk), ...scene.center(t), { dir: face, ...scene.size(t) });
  audio.sfx(sk.sfx || 'hit');
  yield 0.35;
  let landed = 0, crit = false;
  const downed = [];
  for (const t of targets) {
    const r = F.skillAttack(F.effectiveStats(actor), F.effectiveStats(t), scene.rng, shape);
    if (r.miss) { scene.popup(t, 'MISS', '#ddd'); continue; }
    elementize(actor, t, r);
    landed++; crit ||= r.crit;
    scene.damage(t, r.damage, { physical: true, crit: r.crit });
    if (!t.alive) downed.push(t.name);
    else if (sk.status) inflict(scene, t, sk.status);
  }
  if (crit) scene.fx.shake(0.18);
  scene.msg += landed ? `\n扫中 ${landed} 个${crit ? '  会心一击！' : ''}` : '\n全部落空';
  yield 0.75;
  if (downed.length) { scene.msg += `\n${downed.join('、')} 倒下了`; yield 0.5; }
}
