// 战斗数值公式：全部纯函数，随机数由调用方传入 rng。改这里必须同步改 tests/run.js。
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// FF1 风格命中率：(168 + 命中 - 回避) / 200
export function hitChance(acc, eva) { return clamp((168 + acc - eva) / 200, 0.05, 0.99); }
export function hitCount(acc) { return 1 + Math.floor(acc / 50); }

// 状态异常对属性的影响：黑暗 → 命中减半；防护 → 防御 ×1.5；破甲 → 防御 ×0.6；睡眠 → 回避归零。
// 防护与破甲可以同时挂着（一个撑起来、一个撬开），所以是**依次相乘**而不是二选一。
export function effectiveStats(actor) {
  const s = actor.status || {};
  let def = actor.def;
  if (s.protect) def = Math.floor(def * 1.5);
  if (s.sunder) def = Math.floor(def * 0.6);
  return {
    ...actor,
    acc: s.blind ? Math.floor(actor.acc / 2) : actor.acc,
    def,
    eva: s.sleep ? 0 : actor.eva,
  };
}
// 中毒：每次行动前损失最大 HP 的 1/12（至少 1）
export function poisonDamage(maxHp) { return Math.max(1, Math.floor(maxHp / 12)); }
// 状态附加成功率：免疫为 0，否则固定基础值
export function statusChance(target, status, base = 0.75) { return target.immune?.includes(status) ? 0 : base; }

// 物理攻击：每次命中 rand(atk, 2atk) - def，会心额外 +atk，防御减半，每次至少 1；att.hits 是命中数倍率（武僧 2）
// sure：跳过命中判定（战技「屏息」「拼命」的必中）。写成选项而不是另开一个函数，
// 是为了让战技和普攻走**同一条**结算路径——段数、会心、防御减半、至少 1 点只有一份。
export function physicalAttack(att, def, rng, { sure = false } = {}) {
  const hits = hitCount(att.acc) * (att.hits || 1), p = sure ? 1 : hitChance(att.acc, def.eva);
  let landed = 0, damage = 0, crit = false;
  for (let i = 0; i < hits; i++) {
    if (!rng.chance(p)) continue;
    landed++;
    let d = rng.int(att.atk, att.atk * 2) - def.def;
    if (rng.chance((att.crit || 0) / 100)) { d += att.atk; crit = true; }
    if (def.defending) d = Math.floor(d / 2);
    damage += Math.max(1, d);
  }
  return { hits: landed, damage, crit, miss: landed === 0 };
}

// 战技的物理结算。三个修正套在 physicalAttack 外面：
//   hits   叠段数（和职业自带的 hits 相乘，家将的两下 × 七星步的四段 = 八下）
//   pierce 削掉目标一部分防御（碎甲 0.6 ＝ 只按四成防御算）
//   power  缩放**最终**伤害
// **power 乘在最后，不是乘在 atk 上**：乘在前面的话，「rand(atk,2atk) − def」里的减防
// 会把低倍率多段技整个吃掉（0.42 倍的七星步每一段都打不穿防御，结果全是保底 1 点）。
// 放在最后，power 就是干净的「这一招相当于几次普攻」，调数值时看得懂。
export function skillAttack(att, def, rng, sk = {}) {
  const a = { ...att, hits: (att.hits || 1) * (sk.hits || 1), crit: (att.crit || 0) + (sk.crit || 0) };
  const d = sk.pierce ? { ...def, def: Math.floor(def.def * (1 - sk.pierce)) } : def;
  const r = physicalAttack(a, d, rng, { sure: !!sk.sure });
  if (!r.miss) r.damage = Math.max(1, Math.round(r.damage * (sk.power ?? 1)));
  return r;
}

export function elementMultiplier(target, element) {
  if (!element) return 1;
  if (target.immune?.includes(element)) return 0;
  if (target.weak?.includes(element)) return 2;
  if (target.resist?.includes(element)) return 0.5;
  return 1;
}

// pierce：跳过 mdef 那一次「有几率减半」的判定。给召唤用的
// （义民爷「他们拿的是刀」、吕布「一箭穿过整条阵线」——刀与箭不吃魔防）。
// 写成选项而不是另开一个函数，是为了让召唤和普通魔法走**同一条**结算路径：
// 属性倍率、int/2、免疫为 0、至少 1 点这几条只有一份。
export function magicDamage(power, caster, target, element, rng, { pierce = false } = {}) {
  const base = rng.int(power, power * 2) + Math.floor((caster.int || 0) / 2);
  const mult = elementMultiplier(target, element);
  let damage = Math.floor(base * mult);
  if (!pierce && mult > 0 && rng.chance(clamp((target.mdef || 0) / 100, 0, 0.5))) damage = Math.floor(damage / 2);
  return { damage: mult === 0 ? 0 : Math.max(1, damage), mult };
}

export function healAmount(power, caster, rng) { return rng.int(power, power * 2) + Math.floor((caster.int || 0) / 2); }

export function fleeChance(partyAvgSpd, enemyMaxSpd) { return clamp(0.5 + (partyAvgSpd - enemyMaxSpd) * 0.03, 0.1, 0.9); }

// 到达 level 级所需的累计经验：L2=25, L3=80, L4=165 …
export function expForLevel(level) { const n = level - 1; return 15 * n * n + 10 * n; }
