// 状态异常 / 增益定义。persist=true 的状态战斗结束后留在角色身上（要用道具或旅馆治）。
// turns: 战斗中持续回合数范围（每次轮到该角色行动时 -1）；没有 turns 的状态一直持续到被治疗。
export const STATUS = {
  poison:  { name: '中毒', short: '毒', color: '#b388ff', persist: true },
  sleep:   { name: '睡眠', short: '眠', color: '#90caf9', persist: false, turns: [2, 4] },
  blind:   { name: '黑暗', short: '盲', color: '#bdbdbd', persist: false },
  protect: { name: '防护', short: '护', color: '#ffe082', persist: false, turns: [4, 6], buff: true },
};

// 移除列表里的状态，返回被治好的状态名
export function cureStatus(target, list) {
  const removed = [];
  for (const s of list) if (target.status?.[s]) { delete target.status[s]; removed.push(STATUS[s].name); }
  return removed;
}
// 战斗结束：只保留会持续的状态
export function persistentOnly(status) {
  const out = {};
  for (const [k, v] of Object.entries(status || {})) if (STATUS[k]?.persist) out[k] = v;
  return out;
}
// 角色当前状态的显示标签 [{short, color}]
export function statusTags(status) {
  return Object.keys(status || {}).filter(k => STATUS[k]).map(k => ({ short: STATUS[k].short, name: STATUS[k].name, color: STATUS[k].color }));
}
