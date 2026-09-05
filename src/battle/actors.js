// 把持久角色数据 / 敌人数据 变成战斗用的 actor 对象（战斗结束后丢弃，只把 hp/mp/status 写回）。
import { computeStats, memberSpells } from '../game/party.js';

export function makePartyActors(state, data) {
  return state.party.map((m, i) => {
    const s = computeStats(m, data), job = data.jobs[m.jobId];
    return {
      id: `p${i}`, side: 'party', name: m.name, member: m, jobId: m.jobId, level: m.level,
      hp: m.hp, mp: m.mp, ...s,
      commands: job.commands, spells: memberSpells(m, data),
      weak: [], resist: [], immune: [],
      status: { ...(m.status || {}) },
      alive: m.hp > 0, defending: false, atb: 0, queued: false,
    };
  });
}

export function makeEnemyActors(ids, data) {
  const total = {}, seen = {};
  for (const id of ids) total[id] = (total[id] || 0) + 1;
  return ids.map((id, i) => {
    const e = data.enemies[id];
    if (!e) throw new Error(`未知敌人 ${id}`);
    const k = seen[id] = (seen[id] || 0) + 1;
    return {
      id: `e${i}`, side: 'enemy', enemyId: id, name: e.name + (total[id] > 1 ? 'ABCDEFGH'[k - 1] : ''),
      hp: e.hp, maxHp: e.hp, mp: e.mp || 0, maxMp: e.mp || 0,
      atk: e.atk, def: e.def, acc: e.acc, eva: e.eva, spd: e.spd,
      mdef: e.mdef || 0, int: e.int || 0, crit: e.crit || 3, hits: 1,
      weak: e.weak || [], resist: e.resist || [], immune: e.immune || [],
      spells: e.spells || [], ai: e.ai || 'basic', onHit: e.onHit || null, exp: e.exp, gold: e.gold, sprite: e.sprite || id,
      status: {},
      alive: true, defending: false, atb: 0, queued: false,
    };
  });
}
