// 角色属性计算与升级。角色持久数据只存 {name, jobId, level, exp, hp, mp, equipment, status}，其余全部推导。
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
  const unarmed = job.unarmed || 0; // 武僧：空手时按等级加攻击
  return {
    maxHp: b.hp, maxMp: b.mp, str: b.str, agi: b.agi, int: b.int, vit: b.vit,
    atk: Math.floor(b.str / 2) + (weapon ? weapon.atk || 0 : Math.floor(unarmed * member.level)), // FF1 式：力量/2 + 武器，武器升级很重要
    def: Math.floor(b.vit / 2) + (armor?.def || 0),
    acc: b.acc + (weapon?.acc || 0),
    eva: b.eva + Math.floor(b.agi / 2),
    spd: b.agi,
    mdef: Math.floor(b.int / 2),
    crit: 5 + Math.floor(b.agi / 4),
    hits: job.hits || 1, // 武僧：每次攻击的命中数倍率
  };
}

// 职业魔法表项可写成 "cure" 或 { id: "cure", level: 3 }；返回该等级已学会的魔法 id 列表
export function spellsFor(job, level) {
  return (job.spells || []).map(s => typeof s === 'string' ? { id: s, level: 1 } : s).filter(s => level >= (s.level || 1)).map(s => s.id);
}
export function memberSpells(member, data) { return spellsFor(data.jobs[member.jobId], member.level); }

// 加经验，返回升级记录 [{level, hpUp, mpUp, learned:[spellId]}]；升级时按最大值差额回复 HP/MP
export function grantExp(member, amount, data) {
  const gains = [];
  member.exp += amount;
  while (member.exp >= expForLevel(member.level + 1)) {
    const before = computeStats(member, data), known = memberSpells(member, data);
    member.level++;
    const after = computeStats(member, data);
    const hpUp = after.maxHp - before.maxHp, mpUp = after.maxMp - before.maxMp;
    member.hp = Math.min(after.maxHp, member.hp + hpUp);
    member.mp = Math.min(after.maxMp, member.mp + mpUp);
    gains.push({ level: member.level, hpUp, mpUp, learned: memberSpells(member, data).filter(id => !known.includes(id)) });
  }
  return gains;
}

export function healFull(member, data) {
  const s = computeStats(member, data);
  member.hp = s.maxHp; member.mp = s.maxMp; member.status = {};
}

// 转职：换职业、卸下不能装备的装备（放回背包）、HP/MP 按新上限截断。返回卸下的道具 id 列表。
export function changeJob(member, jobId, inv, data) {
  if (!data.jobs[jobId]) return null;
  member.jobId = jobId;
  const removed = [];
  for (const slot of ['weapon', 'armor']) {
    const id = member.equipment[slot], it = id && data.items[id];
    if (it && it.jobs && !it.jobs.includes(jobId)) { member.equipment[slot] = null; inv.push({ id, qty: 1 }); removed.push(id); }
  }
  const s = computeStats(member, data);
  member.hp = Math.max(1, Math.min(member.hp, s.maxHp)); member.mp = Math.min(member.mp, s.maxMp);
  return removed;
}
