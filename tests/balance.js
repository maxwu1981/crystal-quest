// 数值平衡模拟：不开画面，用行动协程直接打几百场，输出各遇敌区在各等级的胜率与平均掉血。
// 用法：打开游戏页，控制台  const b = await import('/tests/balance.js'); console.table(await b.run())
// 或 tests/index.html?balance 直接看表。策略是「普通玩家」：物理职业打血最少的敌人，黑魔放最强能放的攻击魔法，白魔半血以下就治疗。
import { loadData } from '../src/data/loader.js';
import { RNG } from '../src/core/RNG.js';
import { newGameState } from '../src/game/state.js';
import { healFull, memberSpells } from '../src/game/party.js';
import { makePartyActors, makeEnemyActors } from '../src/battle/actors.js';
import { execute } from '../src/battle/actions.js';
import { decideEnemyAction } from '../src/battle/ai.js';

// 各等级默认装备（模拟玩家按金币逐步换装：出村青铜、洞窟前铁、深处钢）
const TIERS = [
  { upto: 3, gear: { boxer: ['bronze_sword', 'leather_armor'], hunter: ['knife', 'leather_armor'],
                     herbwife: ['wood_staff', 'cloth_robe'], talisman: ['wood_staff', 'cloth_robe'],
                     general: [null, 'cloth_robe'], peddler: ['bronze_sword', 'cloth_robe'] } },
  { upto: 6, gear: { boxer: ['iron_sword', 'bronze_armor'], hunter: ['bronze_dagger', 'leather_armor'],
                     herbwife: ['oak_staff', 'linen_robe'], talisman: ['oak_staff', 'linen_robe'],
                     general: ['leather_knuckle', 'linen_robe'], peddler: ['iron_sword', 'linen_robe'] } },
  { upto: 99, gear: { boxer: ['steel_sword', 'iron_armor'], hunter: ['iron_dagger', 'bronze_armor'],
                      herbwife: ['iron_staff', 'silk_robe'], talisman: ['iron_staff', 'silk_robe'],
                      general: ['iron_knuckle', 'silk_robe'], peddler: ['steel_sword', 'silk_robe'] } },
];
// Boss 平衡要按玩家**真实可能的装备**算，而不是一个想当然的「决战档」。
//
// 原来只有一档 ENDGAME，而且它内部是矛盾的：拳头师穿商店货（钢剑/铁甲），
// 另外三个人穿神话装。查下来那一档在经济上也不成立——要买的铁甲 434 ＋
// 青铜甲 222 ＋ 丝绸袍 193 ＝ 849 金，只能打怪赚，打够就已经 10 级了。
// 于是「6 级 + 决战装备」这个被拿来当平衡基准的状态，**现实中没有玩家会站在那里**。
//
// 改成三档真实路线，各自代表一种玩法：
const LOADOUTS = {
  // ① 顺路开箱：cave_1 的草薙剑与盖伯尔加就在去 cave_3 的路上，几乎人人会拿
  onpath: {
    boxer:    ['kusanagi', 'iron_armor'],
    hunter:   ['gaebolg', 'bronze_armor'],
    general:  ['iron_knuckle', 'silk_robe'],
    herbwife: ['iron_staff', 'silk_robe'],
    talisman: ['iron_staff', 'silk_robe'],
    peddler:  ['steel_sword', 'silk_robe'],
  },
  // ② 全开箱：迷宫翻遍。注意四个人**都**换成神装——原来只换三个，
  //    那种半吊子配置没有任何玩家会是那样
  full: {
    boxer:    ['kusanagi', 'aegis'],
    hunter:   ['harpe', 'bronze_armor'],
    general:  ['vajra', 'silk_robe'],
    herbwife: ['caduceus', 'hagoromo'],
    talisman: ['laevateinn', 'silk_robe'],
    peddler:  ['ganjiang', 'silk_robe'],
  },
  // ③ 一个箱都不开：纯靠商店。这是难度的上限，练级派会落在这一档
  shop: null,   // null = 走 TIERS，按等级取商店档
};
const ENDGAME = LOADOUTS.full;   // 兼容旧调用
const GEAR = (level, mode) => {
  if (mode === true) return LOADOUTS.full;          // 旧写法
  const l = mode && LOADOUTS[mode];
  return l || TIERS.find(t => level <= t.upto).gear;
};
// 职业改名后最容易忘了同步这张表，缺一个就当场报错，别默默算错
export function checkGear(data) {
  for (const t of TIERS) for (const id of Object.keys(data.jobs))
    if (!t.gear[id]) throw new Error(`balance.js 的装备表缺少职业 ${id}（等级 ≤ ${t.upto}）`);
  for (const id of Object.keys(data.jobs))
    if (!ENDGAME[id]) throw new Error(`balance.js 的决战装备表缺少职业 ${id}`);
}

function scene(data, level, enemyIds, seed, endgame) {
  const st = newGameState(data);
  for (const m of st.party) { m.level = level; const [w, a] = GEAR(level, endgame)[m.jobId]; m.equipment = { weapon: w, armor: a, accessory: null }; healFull(m, data); }
  const s = { game: { data, state: st }, rng: new RNG(seed), msg: '', escaped: false, canFlee: false,
    // 桩要跟 Effects 的接口一致：少一个 shake，一出会心就抛「不是函数」；
    // 少一个 size，第一次物理攻击就抛「scene.size is not a function」——
    // actions.js 的 attack() 每次命中都要拿目标尺寸给特效用（658f445「被魔法笼罩」那次加的），
    // 而这里的假场景没有画面、没有尺寸，回一个空对象即可（特效本来就是空实现）
    fx: { add() {}, shake() {} }, popup() {}, center() { return [0, 0]; }, size() { return {}; },
    party: makePartyActors(st, data), enemies: makeEnemyActors(enemyIds, data),
    alive: l => l.filter(a => a.alive),
    retarget(t) { return t.alive ? t : (this.alive(t.side === 'enemy' ? this.enemies : this.party)[0] || null); },
    damage(t, dmg, { physical = false } = {}) { t.hp = Math.max(0, t.hp - dmg); if (physical && t.status.sleep) delete t.status.sleep; if (t.hp <= 0) { t.alive = false; t.status = {}; } },
    run(a) { const co = execute(this, a); let n = 0; while (!co.next().done && n++ < 200); } };
  return s;
}
// 玩家策略
function decide(s, p) {
  const data = s.game.data, sp = data.spells, enemies = s.alive(s.enemies), party = s.alive(s.party);
  const weakest = enemies.slice().sort((a, b) => a.hp - b.hp)[0];
  const hurt = party.filter(m => m.hp < m.maxHp * 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const usable = p.spells.filter(id => sp[id].mp <= p.mp);
  const heals = usable.filter(id => sp[id].heal).sort((a, b) => sp[b].power - sp[a].power);
  if (hurt && heals.length) return { type: 'magic', spellId: heals[0], target: hurt };
  const attacks = usable.filter(id => sp[id].power > 0 && sp[id].target === 'enemy').sort((a, b) => sp[b].power * (sp[b].scope === 'all' ? enemies.length : 1) - sp[a].power * (sp[a].scope === 'all' ? enemies.length : 1));
  if (attacks.length && (p.jobId === 'talisman' || p.jobId === 'peddler')) { const id = attacks[0]; return { type: 'magic', spellId: id, target: sp[id].scope === 'all' ? 'all' : weakest }; }
  return { type: 'attack', target: weakest };
}
function fight(data, level, enemyIds, seed, endgame) {
  const s = scene(data, level, enemyIds, seed, endgame);
  let rounds = 0;
  while (s.alive(s.party).length && s.alive(s.enemies).length && rounds++ < 40) {
    const acts = [];
    for (const p of s.alive(s.party)) acts.push({ actor: p, ...(p.status.sleep ? { type: 'sleep' } : decide(s, p)) });
    for (const e of s.alive(s.enemies)) { const d = e.status.sleep ? { type: 'sleep' } : decideEnemyAction(e, s.enemies, s.party, data, s.rng); if (d) acts.push({ actor: e, ...d }); }
    acts.sort((a, b) => (b.actor.spd + s.rng.int(0, 4)) - (a.actor.spd + s.rng.int(0, 4)));
    for (const a of acts) { if (!s.alive(s.party).length || !s.alive(s.enemies).length) break; s.run(a); }
  }
  const won = !!s.alive(s.enemies).length === false && s.alive(s.party).length > 0;
  const hpLoss = 1 - s.party.reduce((t, p) => t + p.hp, 0) / s.party.reduce((t, p) => t + p.maxHp, 0);
  const mpLoss = 1 - s.party.reduce((t, p) => t + p.mp, 0) / Math.max(1, s.party.reduce((t, p) => t + p.maxMp, 0));
  return { won, rounds, hpLoss, mpLoss, dead: s.party.filter(p => !p.alive).length };
}

export async function run(data = null, n = 30) {
  data ||= await loadData(location.pathname.includes('/tests/') ? '../data/' : './data/');
  checkGear(data);
  const rows = [];
  const zones = { ...data.encounters,
    'boss(纯商店)':   { groups: [{ enemies: ['knight'], weight: 1 }] },
    'boss(顺路开箱)': { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'onpath' },
    'boss(全开箱)':   { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'full' } };
  const levels = { village_field: [1, 2, 3], plains: [2, 3, 4, 5], cave: [4, 5, 6, 7], cave_deep: [5, 6, 7, 8],
                   'boss(纯商店)': [6, 8, 10, 12], 'boss(顺路开箱)': [4, 5, 6, 7, 8], 'boss(全开箱)': [4, 5, 6, 7, 8] };
  for (const [zone, z] of Object.entries(zones)) {
    for (const level of levels[zone] || [3, 6, 9]) {
      const r = { zone, level, fights: 0, wins: 0, hpLoss: 0, mpLoss: 0, rounds: 0, deaths: 0 };
      const rng = new RNG(1000 + level);
      for (let i = 0; i < n; i++) {
        const g = rng.weighted(z.groups, x => x.weight);
        const f = fight(data, level, g.enemies, 7 + i * 13 + level, z.endgame);
        r.fights++; r.wins += f.won; r.hpLoss += f.hpLoss; r.mpLoss += f.mpLoss; r.rounds += f.rounds; r.deaths += f.dead;
      }
      rows.push({ zone, level, winRate: Math.round(100 * r.wins / r.fights), hpLoss: Math.round(100 * r.hpLoss / r.fights), mpLoss: Math.round(100 * r.mpLoss / r.fights), rounds: +(r.rounds / r.fights).toFixed(1), deaths: +(r.deaths / r.fights).toFixed(2) });
    }
  }
  return rows;
}
if (location.search.includes('balance')) run().then(rows => { document.body.innerHTML = `<pre>${['zone       lv  win% hp% mp% rounds deaths', ...rows.map(r => `${r.zone.padEnd(12)} ${String(r.level).padStart(2)}  ${String(r.winRate).padStart(3)} ${String(r.hpLoss).padStart(3)} ${String(r.mpLoss).padStart(3)}  ${String(r.rounds).padStart(5)}  ${r.deaths}`)].join('\n')}</pre>`; window.__balance = rows; });
