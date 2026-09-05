// 商店买卖：纯逻辑
import { addItem, removeItem, countItem } from './items.js';

export const MAX_STACK = 99;
export const sellPrice = it => Math.floor((it.price || 0) / 2);

export function buyItem(state, id, data) {
  const it = data.items[id];
  if (!it) return { ok: false, msg: '没有这个商品。' };
  if (state.gold < it.price) return { ok: false, msg: '金币不够。' };
  if (countItem(state.inventory, id) >= MAX_STACK) return { ok: false, msg: '拿不下更多了。' };
  state.gold -= it.price; addItem(state.inventory, id);
  return { ok: true, msg: `买下了 ${it.name}。谢谢惠顾！` };
}
export function sellItem(state, id, data) {
  const it = data.items[id];
  if (!it || !countItem(state.inventory, id)) return { ok: false, msg: '没有这个东西。' };
  if (!it.price) return { ok: false, msg: '这个不能卖。' };
  removeItem(state.inventory, id); state.gold += sellPrice(it);
  return { ok: true, msg: `卖出了 ${it.name}，得到 ${sellPrice(it)} 金币。` };
}
export function describeItem(it, data) {
  if (it.type === 'consumable') return it.desc || '';
  const who = (it.jobs || Object.keys(data.jobs)).map(j => data.jobs[j]?.name || j).join(' ');
  const stat = it.type === 'weapon' ? `攻击 +${it.atk}` : `防御 +${it.def}`;
  return `${stat}　可装备：${who}`;
}
