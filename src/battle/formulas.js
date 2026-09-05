// 战斗数值公式：全部纯函数，随机数由调用方传入 rng。改这里必须同步改 tests/run.js。
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// FF1 风格命中率：(168 + 命中 - 回避) / 200
export function hitChance(acc, eva) { return clamp((168 + acc - eva) / 200, 0.05, 0.99); }
export function hitCount(acc) { return 1 + Math.floor(acc / 50); }

// 物理攻击：每次命中 rand(atk, 2atk) - def，会心额外 +atk，防御减半，每次至少 1
export function physicalAttack(att, def, rng) {
  const hits = hitCount(att.acc), p = hitChance(att.acc, def.eva);
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

export function elementMultiplier(target, element) {
  if (!element) return 1;
  if (target.immune?.includes(element)) return 0;
  if (target.weak?.includes(element)) return 2;
  if (target.resist?.includes(element)) return 0.5;
  return 1;
}

export function magicDamage(power, caster, target, element, rng) {
  const base = rng.int(power, power * 2) + Math.floor((caster.int || 0) / 2);
  const mult = elementMultiplier(target, element);
  let damage = Math.floor(base * mult);
  if (mult > 0 && rng.chance(clamp((target.mdef || 0) / 100, 0, 0.5))) damage = Math.floor(damage / 2);
  return { damage: mult === 0 ? 0 : Math.max(1, damage), mult };
}

export function healAmount(power, caster, rng) { return rng.int(power, power * 2) + Math.floor((caster.int || 0) / 2); }

export function fleeChance(partyAvgSpd, enemyMaxSpd) { return clamp(0.5 + (partyAvgSpd - enemyMaxSpd) * 0.03, 0.1, 0.9); }

// 到达 level 级所需的累计经验：L2=25, L3=80, L4=165 …
export function expForLevel(level) { const n = level - 1; return 15 * n * n + 10 * n; }
