// 全局游戏状态：一个纯 JSON 对象。存档 = JSON.stringify(state)。
import { computeStats } from './party.js';
import { normalizeMember } from './jobskill.js';

export const SAVE_KEY = 'crystal-quest-save';

export function newGameState(data) {
  const party = data.party.map(p => {
    const m = { name: p.name, jobId: p.jobId, level: p.level || 1, exp: 0, hp: 0, mp: 0, status: {}, equipment: { weapon: p.equipment?.weapon || null, armor: p.equipment?.armor || null, accessory: p.equipment?.accessory || null }, learned: [], jobLevels: {}, jobExp: {}, skillLevels: {}, skillUses: {} };
    const s = computeStats(m, data);
    m.hp = s.maxHp; m.mp = s.maxMp;
    normalizeMember(m, data); // 现职 1 级、开局该会的魔法记进 learned
    return m;
  });
  const mapId = data.config.startMap;
  const map = data.maps[mapId];
  return {
    party,
    gold: data.config.startGold || 0,
    inventory: (data.config.startInventory || []).map(i => ({ id: i.id, qty: i.qty })),
    map: { id: mapId, x: map.spawn.x, y: map.spawn.y, facing: 'down' },
    vehicle: null,
    flags: {},
    steps: 0,
    stepsUntilEncounter: 0,
    playTime: 0,
    settings: {},
  };
}

export function saveGame(state) { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
// 读档时补齐新版本加的字段，旧存档也能用。
// data 是可选的（MenuScene 的 loadGame() 拿不到它）——没有 data 也不会缺东西：
// memberSpells 本来就是「learned ∪ 现职现等级该会的」，learned 空着也不会掉魔法，
// 下一次升级或转职时 syncLearned 自然把它补满。Game.loadState 那一侧会带着 data 再走一遍。
export function loadGame(data = null) {
  const s = localStorage.getItem(SAVE_KEY); if (!s) return null;
  const st = JSON.parse(s);
  for (const m of st.party) { m.status ||= {}; m.equipment ||= {}; m.equipment.accessory ??= null; normalizeMember(m, data); }
  st.settings ||= {};
  st.vehicle ??= null;
  return st;
}
