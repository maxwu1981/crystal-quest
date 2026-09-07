// 角色属性计算与升级。角色持久数据存 {name, jobId, level, exp, hp, mp, equipment, status}
// 加上 jobskill.js 那五个字段（learned / jobLevels / jobExp / skillLevels / skillUses），其余全部推导。
// **HP/MP 与八项属性一律按 member.level 算，跟职业等级无关**——转职后血量走本身等级，就是这一条。
import { expForLevel } from '../battle/formulas.js';
// items.js 反过来也 import 本模块的 computeStats；两边都只在函数体里互相调用，
// 顶层没有任何调用，所以这个 ESM 循环引用是安全的。
import { addItem, canEquip } from './items.js';
// spellsFor / memberSpells 的实现搬去了 jobskill.js（那边才知道 learned 这回事）。
// 这里原样再导出一次，battle/actors.js、menu/StatusScene.js、menu/JobScene.js 的 import 一个字都不用改。
import { spellsFor, memberSpells, syncLearned, enterJob } from './jobskill.js';
export { spellsFor, memberSpells };

export const STAT_KEYS = ['hp', 'mp', 'str', 'agi', 'int', 'vit', 'acc', 'eva'];

export const SLOTS = ['weapon', 'armor', 'accessory'];

export function computeStats(member, data) {
  const job = data.jobs[member.jobId];
  if (!job) throw new Error(`未知职业 ${member.jobId}`);
  const L = member.level - 1, b = {};
  for (const k of STAT_KEYS) b[k] = Math.floor((job.base[k] || 0) + (job.growth[k] || 0) * L);
  const items = data.items || {};
  const gear = SLOTS.map(s => items[member.equipment?.[s]]).filter(Boolean);
  const sum = k => gear.reduce((t, g) => t + (g[k] || 0), 0);
  const weapon = items[member.equipment?.weapon] || null;
  const unarmed = job.unarmed || 0; // 武僧：空手时按等级加攻击
  return {
    maxHp: b.hp + sum('hpBonus'), maxMp: b.mp + sum('mpBonus'),
    str: b.str, agi: b.agi, int: b.int + sum('intBonus'), vit: b.vit,
    // FF1 式：力量/2 + 武器，武器升级很重要
    atk: Math.floor(b.str / 2) + (weapon ? weapon.atk || 0 : Math.floor(unarmed * member.level)) + sum('atkBonus'),
    def: Math.floor(b.vit / 2) + sum('def') + sum('defBonus'),
    acc: b.acc + sum('acc'),
    eva: b.eva + Math.floor(b.agi / 2) + sum('eva'),
    spd: b.agi + sum('spd'),
    mdef: Math.floor(b.int / 2) + sum('mdef'),
    crit: 5 + Math.floor(b.agi / 4) + sum('crit'),
    hits: (job.hits || 1) * (weapon?.hits || 1), // 命中数倍率（武僧 2、双剑 2）
    element: weapon?.element || null,            // 武器附带属性
    onHit: weapon?.status ? { status: weapon.status, chance: 0.3 } : null, // 武器附带状态
    immuneAll: gear.some(g => g.immuneAll),      // 衔尾蛇之环：免疫一切状态异常
  };
}

// 加经验，返回升级记录 [{level, hpUp, mpUp, learned:[spellId]}]；升级时按最大值差额回复 HP/MP
export function grantExp(member, amount, data) {
  const gains = [];
  member.exp += amount;
  syncLearned(member, data); // 现等级该会的先落进 learned（旧存档、刚转职的人都靠这一句补齐）
  while (member.exp >= expForLevel(member.level + 1)) {
    const before = computeStats(member, data), known = memberSpells(member, data);
    member.level++;
    const after = computeStats(member, data);
    const hpUp = after.maxHp - before.maxHp, mpUp = after.maxMp - before.maxMp;
    member.hp = Math.min(after.maxHp, member.hp + hpUp);
    member.mp = Math.min(after.maxMp, member.mp + mpUp);
    syncLearned(member, data);
    gains.push({ level: member.level, hpUp, mpUp, learned: memberSpells(member, data).filter(id => !known.includes(id)) });
  }
  return gains;
}

export function healFull(member, data) {
  const s = computeStats(member, data);
  member.hp = s.maxHp; member.mp = s.maxMp; member.status = {};
}

// 转职会挑职业的槽位：饰品谁都能戴，所以只查武器和防具。
const JOB_SLOTS = ['weapon', 'armor'];

// 转职后身上还留得住的装备：新职业装不了的武器/防具算作卸下。
// 返回 { equipment: 转职后的装备表（不改原对象）, removed: [{ slot, id }] }。
// 转职预览（menu/JobScene）和真正的 changeJob 都走这里，保证预览的属性和转完的结果一致。
export function equipmentAfterJobChange(equipment, jobId, data) {
  const kept = { ...equipment }, removed = [];
  for (const slot of JOB_SLOTS) {
    const id = kept[slot], it = id && data.items[id];
    if (it && !canEquip(it, { jobId })) { kept[slot] = null; removed.push({ slot, id }); }
  }
  return { equipment: kept, removed };
}

// 转职：换职业、卸下不能装备的装备（放回背包）、HP/MP 按新上限截断。返回卸下的道具 id 列表。
// 承接：走之前先把旧职业已经学会的魔法钉进 learned，转完再把新职业该会的补上——
// 所以「魔法师转召唤师」是在已经学到的魔法之上再加召唤，旧魔法一个都不掉。
// 职业等级各记各的：没练过的新职业从 1 级起，练过的转回来等级还在。
export function changeJob(member, jobId, inv, data) {
  if (!data.jobs[jobId]) return null;
  syncLearned(member, data);
  member.jobId = jobId;
  enterJob(member, jobId);
  syncLearned(member, data);
  const { removed } = equipmentAfterJobChange(member.equipment, jobId, data);
  // 用 addItem 而不是 inv.push：背包里已经有同款时要并进那一堆，
  // 否则会出现两行「铁剑 ×1」，而 countItem / removeItem 只认第一堆。
  for (const { slot, id } of removed) { member.equipment[slot] = null; addItem(inv, id, 1); }
  const s = computeStats(member, data);
  // 转到低 HP 职业不会把人压死：血按新上限截断，但活人至少留 1。
  // `member.hp > 0` 这一层是必要的——没有它，转职会把倒下的人（hp 0）白白救活成 1 点。
  member.hp = member.hp > 0 ? Math.max(1, Math.min(member.hp, s.maxHp)) : 0;
  member.mp = Math.min(member.mp, s.maxMp);
  return removed.map(r => r.id);
}
