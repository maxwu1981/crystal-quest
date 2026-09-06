// 商店买卖：纯逻辑
import { addItem, removeItem, countItem } from './items.js';

export const MAX_STACK = 99;
export const sellPrice = it => Math.floor((it.price || 0) / 2);

export function buyItem(state, id, data) {
  const it = data.items[id];
  if (!it) return { ok: false, msg: '没有这个商品。' };
  if (state.gold < it.price) return { ok: false, msg: '钱不够。' };
  if (countItem(state.inventory, id) >= MAX_STACK) return { ok: false, msg: '带不动更多了。' };
  state.gold -= it.price; addItem(state.inventory, id);
  return { ok: true, msg: `${it.name} 归你了。` };
}
export function sellItem(state, id, data) {
  const it = data.items[id];
  if (!it || !countItem(state.inventory, id)) return { ok: false, msg: '没有这个东西。' };
  if (!it.price) return { ok: false, msg: '这个不能卖。' };
  removeItem(state.inventory, id); state.gold += sellPrice(it);
  return { ok: true, msg: `${it.name} 换了 ${sellPrice(it)} 枚。` };
}
const ELEM = { fire: '火', thunder: '雷', ice: '冰', dark: '暗', light: '光' };
// 装备的一行摘要：主属性 + 特效 + 可装备职业
export function itemStats(it) {
  const p = [];
  if (it.atk) p.push(`攻击 +${it.atk}`);
  if (it.def) p.push(`防御 +${it.def}`);
  if (it.atkBonus) p.push(`攻击 +${it.atkBonus}`);
  if (it.defBonus) p.push(`防御 +${it.defBonus}`);
  if (it.acc) p.push(`命中 +${it.acc}`);
  if (it.eva) p.push(`回避 +${it.eva}`);
  if (it.mdef) p.push(`魔防 +${it.mdef}`);
  if (it.intBonus) p.push(`智力 +${it.intBonus}`);
  if (it.hpBonus) p.push(`HP +${it.hpBonus}`);
  if (it.mpBonus) p.push(`MP +${it.mpBonus}`);
  if (it.spd) p.push(`速度 +${it.spd}`);
  if (it.crit) p.push(`会心 +${it.crit}%`);
  if (it.element) p.push(`${ELEM[it.element] || it.element}属性`);
  if (it.status) p.push('附加异常');
  if (it.hits > 1) p.push(`${it.hits} 连击`);
  if (it.immuneAll) p.push('免疫异常');
  return p.join('　');
}
export function describeItem(it, data) {
  if (it.type === 'consumable') return it.desc || '';
  const who = it.jobs ? it.jobs.map(j => data.jobs[j]?.name || j).join(' ') : '全员';
  return `${itemStats(it)}　可装备：${who}`;
}
