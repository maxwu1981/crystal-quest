// 状态异常 / 增益定义。persist=true 的状态战斗结束后留在角色身上（要用道具或旅馆治）。
// turns: 战斗中持续回合数范围（每次轮到该角色行动时 -1）；没有 turns 的状态一直持续到被治疗。
// gone: 倒数走完时报的那一句（主语是角色名，见 actions.js 的 statusPhase）。
//   **有 turns 就要有 gone**：statusPhase 是照着 turns 泛化递减的，
//   漏写只会让状态无声无息地消失——不报错、测试也照过。下面那条测试卡着这件事。
export const STATUS = {
  poison:  { name: '中毒', short: '毒', color: '#b388ff', persist: true },
  sleep:   { name: '睡眠', short: '眠', color: '#90caf9', persist: false, turns: [2, 4], gone: '醒了' },
  blind:   { name: '黑暗', short: '盲', color: '#bdbdbd', persist: false },
  protect: { name: '防护', short: '护', color: '#ffe082', persist: false, turns: [4, 6], buff: true, gone: '的防护消失了' },
  // ── 战技带来的两种（data/skills.json）──────────────────────────────────
  // 破甲：防御打六折。这是拳头师「碎甲」留下的口子，也是全场唯一能动别人防御的东西——
  // 伤害公式是「攻击×1.5 − 防御」，高防目标对物理近乎免疫，破甲就是那把撬棍。
  sunder:  { name: '破甲', short: '甲', color: '#d98f5a', persist: false, turns: [3, 5], gone: '的甲又合上了' },
  // 挡煞：八家将「开脸」之后站到队伍前面，敌人这几回合先冲他来（见 battle/ai.js）。
  // 算 buff——它是自己选的，图标要跟中毒那一类分得开。
  blockade: { name: '挡煞', short: '挡', color: '#e0a06a', persist: false, turns: [2, 3], buff: true, gone: '让开了身位' },
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
