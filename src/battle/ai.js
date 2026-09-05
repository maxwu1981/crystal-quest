// 敌人 AI：目前只有 'basic'——偏好打前排，有魔法时 35% 概率放魔法
// （治疗魔法只在同伴半血以下时用；状态魔法只对还没中该状态的人用）。
export function decideEnemyAction(actor, allies, party, data, rng) {
  const targets = party.filter(a => a.alive);
  if (!targets.length) return null;
  if (actor.spells.length && rng.chance(0.35)) {
    const spellId = rng.pick(actor.spells), sp = data.spells[spellId];
    if (sp && actor.mp >= sp.mp) {
      if (sp.heal) {
        const hurt = allies.filter(a => a.alive && a.hp < a.maxHp * 0.5);
        if (hurt.length) return { type: 'magic', spellId, target: rng.pick(hurt) };
      } else if (sp.status && !sp.power) {
        const fresh = targets.filter(t => !t.status[sp.status]);
        if (fresh.length) return { type: 'magic', spellId, target: sp.scope === 'all' ? 'all' : rng.pick(fresh) };
      } else return { type: 'magic', spellId, target: sp.scope === 'all' ? 'all' : rng.pick(targets) };
    }
  }
  const target = rng.weighted(targets, a => [4, 3, 2, 1][party.indexOf(a)] ?? 1);
  return { type: 'attack', target };
}
