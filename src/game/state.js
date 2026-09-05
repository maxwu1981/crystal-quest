// 全局游戏状态：一个纯 JSON 对象。存档 = JSON.stringify(state)。
import { computeStats } from './party.js';

export const SAVE_KEY = 'crystal-quest-save';

export function newGameState(data) {
  const party = data.party.map(p => {
    const m = { name: p.name, jobId: p.jobId, level: p.level || 1, exp: 0, hp: 0, mp: 0, status: {}, equipment: { weapon: p.equipment?.weapon || null, armor: p.equipment?.armor || null, accessory: p.equipment?.accessory || null } };
    const s = computeStats(m, data);
    m.hp = s.maxHp; m.mp = s.maxMp;
    return m;
  });
  const mapId = data.config.startMap;
  const map = data.maps[mapId];
  return {
    party,
    gold: data.config.startGold || 0,
    inventory: (data.config.startInventory || []).map(i => ({ id: i.id, qty: i.qty })),
    map: { id: mapId, x: map.spawn.x, y: map.spawn.y, facing: 'down' },
    flags: {},
    steps: 0,
    stepsUntilEncounter: 0,
    playTime: 0,
    settings: {},
  };
}

export function saveGame(state) { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
// 读档时补齐新版本加的字段，旧存档也能用
export function loadGame() {
  const s = localStorage.getItem(SAVE_KEY); if (!s) return null;
  const st = JSON.parse(s);
  for (const m of st.party) { m.status ||= {}; m.equipment ||= {}; m.equipment.accessory ??= null; }
  st.settings ||= {};
  return st;
}
