// 脱战自动补血。设置里可关（SettingsScene 的 autoHeal，默认开）。
//
// **为什么要有**：回合制 RPG 最耗人的不是难度，是「打完一场 → 开菜单 → 翻道具 →
// 一个一个点药 → 关菜单」这套循环，一晚上要做几十遍，而每一遍都没有任何决策。
// 真正的资源管理发生在**战斗之内**（这一发魔法值不值得放），不在战斗之后。
//
// 两条自律，免得它变成「无限血」把战斗难度抹平：
//   ① 只补到 **八成**，不补满。剩下那两成让玩家自己决定要不要花药，
//      也让连续遭遇仍然会累积压力——这是难度该在的地方。
//   ② **优先花身上的药**，没药才免费补，且免费那份只补到六成。
//      有药时它替你省操作；没药时它保你不至于卡死，但会让你明显感觉到该补给了。
// MP 不自动回：MP 是这个游戏唯一的资源（CLAUDE.md 明写不要加第二套货币），
// 自动回 MP 等于把召唤与魔法的取舍一起抹掉。
import { computeStats } from './party.js';
import { countItem, removeItem } from './items.js';

const WITH_ITEM = 0.80;   // 用药能补到几成
const FREE = 0.60;        // 没药时白送到几成
const POTIONS = ['potion', 'hipotion', 'xpotion'];   // 由便宜到贵

export function autoHeal(game) {
  if (game.state.settings?.autoHeal === false) return null;
  const data = game.data, inv = game.state.inventory, used = {};
  let healed = 0;
  for (const m of game.state.party) {
    if (!m.hp) continue;                       // 倒下的人不自动救——那该是玩家的决定
    const max = computeStats(m, data).maxHp;
    // 先用药：挑「补得上且最不浪费」的那瓶，跟自动战斗的选药逻辑同一条思路
    while (m.hp < max * WITH_ITEM) {
      const need = max * WITH_ITEM - m.hp;
      const pick = POTIONS
        .map(id => ({ id, hp: data.items[id]?.effect?.hp || 0 }))
        .filter(p => p.hp > 0 && countItem(inv, p.id) > 0)
        .sort((a, b) => (a.hp >= need ? 0 : 1) - (b.hp >= need ? 0 : 1) || a.hp - b.hp)[0];
      if (!pick) break;
      removeItem(inv, pick.id, 1);
      used[pick.id] = (used[pick.id] || 0) + 1;
      const before = m.hp;
      m.hp = Math.min(max, m.hp + pick.hp);
      healed += m.hp - before;
    }
    if (m.hp < max * FREE) { healed += Math.round(max * FREE) - m.hp; m.hp = Math.round(max * FREE); }
  }
  return healed ? { healed, used } : null;
}
