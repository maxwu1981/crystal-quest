// 道具与背包：纯逻辑，地图菜单和战斗共用。背包格式 state.inventory = [{ id, qty }]。
import { computeStats } from './party.js';

export function countItem(inv, id) { return inv.find(s => s.id === id)?.qty || 0; }
export function addItem(inv, id, qty = 1) {
  const s = inv.find(x => x.id === id);
  if (s) s.qty += qty; else inv.push({ id, qty });
}
export function removeItem(inv, id, qty = 1) {
  const i = inv.findIndex(x => x.id === id);
  if (i < 0 || inv[i].qty < qty) return false;
  inv[i].qty -= qty;
  if (inv[i].qty <= 0) inv.splice(i, 1);
  return true;
}

// 目标形如 { hp, mp, maxHp, maxMp, alive }
export function canUseOn(item, target) {
  const e = item.effect || {};
  if (e.revive) return !target.alive;
  if (e.camp) return true;
  return target.alive;
}

// 对单个目标施加效果，返回 { hp, mp, revived } 或 null（无效）
export function applyItem(item, target) {
  const e = item.effect || {}, out = { hp: 0, mp: 0, revived: false };
  if (e.revive) {
    if (target.alive) return null;
    target.alive = true; target.hp = Math.max(1, Math.floor(target.maxHp * e.revive));
    out.revived = true; out.hp = target.hp; return out;
  }
  if (!target.alive) return null;
  if (e.hp) { const b = target.hp; target.hp = Math.min(target.maxHp, target.hp + e.hp); out.hp = target.hp - b; }
  if (e.mp) { const b = target.mp; target.mp = Math.min(target.maxMp, target.mp + e.mp); out.mp = target.mp - b; }
  return out;
}

export function describeUse(item, targetName, out) {
  if (!out) return `${item.name} 没有效果`;
  if (out.revived) return `${targetName} 复活了！`;
  const parts = [];
  if (out.hp) parts.push(`恢复了 ${out.hp} HP`); if (out.mp) parts.push(`恢复了 ${out.mp} MP`);
  return `${targetName} ${parts.join('、') || '没有变化'}`;
}

// 地图上对持久角色使用：把 member 包装成目标再写回
export function useItemOnMember(item, member, data) {
  const s = computeStats(member, data);
  const t = { hp: member.hp, mp: member.mp, maxHp: s.maxHp, maxMp: s.maxMp, alive: member.hp > 0 };
  const out = applyItem(item, t);
  if (out) { member.hp = t.hp; member.mp = t.mp; }
  return out;
}

// 帐篷：全员完全恢复（含复活）
export function campParty(party, data) {
  for (const m of party) { const s = computeStats(m, data); m.hp = s.maxHp; m.mp = s.maxMp; }
}

export function canEquip(item, member) { return !item.jobs || item.jobs.includes(member.jobId); }
// 装备：把旧装备放回背包，新装备从背包扣除。itemId 为 null 表示卸下。
export function equip(member, slot, itemId, inv, data) {
  if (itemId) { const it = data.items[itemId]; if (!it || it.type !== slot || !canEquip(it, member)) return false; if (!removeItem(inv, itemId, 1)) return false; }
  const old = member.equipment[slot];
  if (old) addItem(inv, old, 1);
  member.equipment[slot] = itemId || null;
  return true;
}
