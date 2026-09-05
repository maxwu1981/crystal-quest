// 全局游戏状态：一个纯 JSON 对象。存档 = JSON.stringify(state)。
import { computeStats } from './party.js';

export const SAVE_KEY = 'crystal-quest-save';

export function newGameState(data) {
  const party = data.party.map(p => {
    const m = { name: p.name, jobId: p.jobId, level: p.level || 1, exp: 0, hp: 0, mp: 0, equipment: { weapon: p.equipment?.weapon || null, armor: p.equipment?.armor || null } };
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
  };
}

export function saveGame(state) { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
export function loadGame() { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }
