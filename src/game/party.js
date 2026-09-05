// 角色属性计算与升级。角色持久数据只存 {name, jobId, level, exp, hp, mp, equipment}，其余全部推导。
import { expForLevel } from '../battle/formulas.js';

export const STAT_KEYS = ['hp', 'mp', 'str', 'agi', 'int', 'vit', 'acc', 'eva'];

export function computeStats(member, data) {
  const job = data.jobs[member.jobId];
  if (!job) throw new Error(`未知职业 ${member.jobId}`);
  const L = member.level - 1, b = {};
  for (const k of STAT_KEYS) b[k] = Math.floor((job.base[k] || 0) + (job.growth[k] || 0) * L);
  const items = data.items || {};
  const weapon = items[member.equipment?.weapon] || null;
  const armor = items[member.equipment?.armor] || null;
  return {
    maxHp: b.hp, maxMp: b.mp, str: b.str, agi: b.agi, int: b.int, vit: b.vit,
    atk: b.str + (weapon?.atk || 0),
    def: Math.floor(b.vit / 2) + (armor?.def || 0),
    acc: b.acc + (weapon?.acc || 0),
    eva: b.eva + Math.floor(b.agi / 2),
    spd: b.agi,
    mdef: Math.floor(b.int / 2),
    crit: 5 + Math.floor(b.agi / 4),
  };
}

// 加经验，返回升级记录 [{level, hpUp, mpUp}]；升级时按最大值差额回复 HP/MP
export function grantExp(member, amount, data) {
  const gains = [];
  member.exp += amount;
  while (member.exp >= expForLevel(member.level + 1)) {
    const before = computeStats(member, data);
    member.level++;
    const after = computeStats(member, data);
    const hpUp = after.maxHp - before.maxHp, mpUp = after.maxMp - before.maxMp;
    member.hp = Math.min(after.maxHp, member.hp + hpUp);
    member.mp = Math.min(after.maxMp, member.mp + mpUp);
    gains.push({ level: member.level, hpUp, mpUp });
  }
  return gains;
}

export function healFull(member, data) {
  const s = computeStats(member, data);
  member.hp = s.maxHp; member.mp = s.maxMp;
}
