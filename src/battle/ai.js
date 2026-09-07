// 敌人 AI：目前只有 'basic'——偏好打前排，有魔法时 35% 概率放魔法
// （治疗魔法只在同伴半血以下时用；状态魔法只对还没中该状态的人用）。
//
// 「挡煞」（家将开脸之后）会把**打人的那几手**吸到他身上：普攻、以及单体攻击魔法。
// 状态魔法不吸——那一类的价值在铺开，全堆在挡的人身上等于自废。
// 这是全场唯一能左右敌人选谁打的东西，也是家将存在的理由：一个能替人挨打的人。
export function decideEnemyAction(actor, allies, party, data, rng) {
  const targets = party.filter(a => a.alive);
  if (!targets.length) return null;
  const guards = targets.filter(t => t.status?.blockade);
  const focus = guards.length ? guards : targets;
  if (actor.spells.length && rng.chance(0.35)) {
    const spellId = rng.pick(actor.spells), sp = data.spells[spellId];
    if (sp && actor.mp >= sp.mp) {
      if (sp.heal) {
        const hurt = allies.filter(a => a.alive && a.hp < a.maxHp * 0.5);
        if (hurt.length) return { type: 'magic', spellId, target: rng.pick(hurt) };
      } else if (sp.status && !sp.power) {
        const fresh = targets.filter(t => !t.status[sp.status]);
        if (fresh.length) return { type: 'magic', spellId, target: sp.scope === 'all' ? 'all' : rng.pick(fresh) };
      } else return { type: 'magic', spellId, target: sp.scope === 'all' ? 'all' : rng.pick(focus) };
    }
  }
  const target = rng.weighted(focus, a => [4, 3, 2, 1][party.indexOf(a)] ?? 1);
  return { type: 'attack', target };
}
