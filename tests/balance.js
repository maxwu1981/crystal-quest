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
import { estSkill, pickSummon } from '../src/battle/autoBattle.js';
import { memberSkills, skillReady, skillShape, tickCooldowns } from '../src/game/battleskill.js';
import { changeJob } from '../src/game/party.js';
import { grantJobExp, jpForJobLevel } from '../src/game/jobskill.js';

// 各等级默认装备（模拟玩家按金币逐步换装：出村青铜、洞窟前铁、深处钢）
// 童乩（tangki）这一路跟符仔仙同装：都是后排、都用杖 + 袍，商店里也没有第三种
// 后排武器可挑。这不是偷懒——它俩的差别在 MP 池与会什么招，不在穿什么。
// 装备表少一个职业会当场报错（checkGear），别默默算错。
const TIERS = [
  { upto: 3, gear: { boxer: ['bronze_sword', 'leather_armor'], hunter: ['knife', 'leather_armor'],
                     herbwife: ['wood_staff', 'cloth_robe'], talisman: ['wood_staff', 'cloth_robe'],
                     tangki: ['wood_staff', 'cloth_robe'],
                     general: [null, 'cloth_robe'], peddler: ['bronze_sword', 'cloth_robe'] } },
  { upto: 6, gear: { boxer: ['iron_sword', 'bronze_armor'], hunter: ['bronze_dagger', 'leather_armor'],
                     herbwife: ['oak_staff', 'linen_robe'], talisman: ['oak_staff', 'linen_robe'],
                     tangki: ['oak_staff', 'linen_robe'],
                     general: ['leather_knuckle', 'linen_robe'], peddler: ['iron_sword', 'linen_robe'] } },
  { upto: 99, gear: { boxer: ['steel_sword', 'iron_armor'], hunter: ['iron_dagger', 'bronze_armor'],
                      herbwife: ['iron_staff', 'silk_robe'], talisman: ['iron_staff', 'silk_robe'],
                      tangki: ['iron_staff', 'silk_robe'],
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
    tangki:   ['iron_staff', 'silk_robe'],
    peddler:  ['steel_sword', 'silk_robe'],
  },
  // ② 全开箱：迷宫翻遍。注意四个人**都**换成神装——原来只换三个，
  //    那种半吊子配置没有任何玩家会是那样。
  // **饰品也是**（2026-09-08 补的）：overworld 上摆着 ouroboros / winged_sandals /
  // sampo / dragon_heart 三尊神话饰品，cave_2 有银戒指、tomb_wanjin 有守护护腕——
  // 「全开箱」的定义就是这些也翻到了，只穿武器防具不算全开箱。
  // 之前这张表全员 accessory:null，六座迷宫的对抗验证捅出这个洞——
  // 不是这张表错了，是它从来没被算进去过：一直没有代码会去读第三格。
  full: {
    boxer:    ['kusanagi', 'aegis', 'dragon_heart'],      // 近战坦：+150hp+6def 配埃癸斯正合适
    hunter:   ['harpe', 'bronze_armor', 'winged_sandals'], // 闪避型：+14spd+10eva
    general:  ['vajra', 'silk_robe', 'guard_band'],
    herbwife: ['caduceus', 'hagoromo', 'sampo'],           // 后排：+30mp+6int
    talisman: ['laevateinn', 'silk_robe', 'silver_ring'],
    tangki:   ['laevateinn', 'silk_robe', 'ouroboros'],    // 请神打完最脆的是他：免疫状态异常保命
    peddler:  ['ganjiang', 'silk_robe', null],             // 六件真实存在的饰品分完了，他没有
  },
  // ③ 一个箱都不开：纯靠商店。这是难度的上限，练级派会落在这一档
  shop: null,   // null = 走 TIERS，按等级取商店档
  // ④ 顺路开箱 + 把壇下与爐底也翻了：tier 6（银）与 tier 7（秘银）那两阶。
  //    这两座是 2026-09-08 才接上的支线迷宫，也是商店 tier 5 与神话 tier 11
  //    之间唯一的两级台阶。**必须单独量一档**——不然「补上断档」这件事
  //    到底把 Boss 战推成什么样，表上一个数字都看不出来。
  side: {
    boxer:    ['mythril_sword', 'mythril_armor'],
    hunter:   ['mythril_dagger', 'mythril_armor'],
    general:  ['mythril_knuckle', 'mythril_robe'],
    herbwife: ['mythril_staff', 'mythril_robe'],
    talisman: ['mythril_staff', 'mythril_robe'],
    tangki:   ['mythril_staff', 'mythril_robe'],
    peddler:  ['mythril_sword', 'mythril_armor'],
  },
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
  // 三个格子写的 id 必须真的存在，且第三格（饰品）不能悄悄退化成「反正没人读」。
  // 2026-09-08 之前这条门根本没人守：LOADOUTS.full 全员 accessory:null 挂了很久，
  // 因为 scene() 只解构 [w,a] 两个位置——写了第三个值也是白写。
  for (const [name, table] of Object.entries(LOADOUTS)) {
    if (!table) continue;
    for (const [job, gear] of Object.entries(table)) {
      const [w, a, acc] = gear;
      for (const id of [w, a, acc]) if (id && !data.items[id]) throw new Error(`LOADOUTS.${name}.${job} 指到不存在的道具 ${id}`);
    }
  }
}

// 队伍里换一个童乩进来。**不这么做的话「請神」在这张表上完全不存在**——
// party.json 是拳头师/山猎人/青草婆/符仔仙，一尊神都请不出来，
// 改召唤的 MP 前后跑出来的数字会一模一样，看着像「改动没影响」。
// 换掉的是符仔仙（同为后排、同一套装备），职业等级给到 jobLv 那一档决定请得动几位。
function makeTangki(st, data, jobLv) {
  const m = st.party.find(x => x.jobId === 'talisman') || st.party[st.party.length - 1];
  changeJob(m, 'tangki', [], data);
  grantJobExp(m, jpForJobLevel(jobLv), data);
  return m;
}

// 导出只为了给 tests/cases/gear.js 那条「饰品真的穿上了」测试用——
// 平衡模拟本身不需要外部调用它，run() 自己在下面调。
export function scene(data, level, enemyIds, seed, endgame, tangkiLv = 0) {
  const st = newGameState(data);
  if (tangkiLv) makeTangki(st, data, tangkiLv);
  // [weapon, armor, accessory?]——第三格以前没人填过，因为没人读。
  // 八元素迷宫剩下六座的对抗验证发现了这个洞：箱子里塞的戒指/鞋子塞给谁都行，
  // 反正这张表从不戴——于是「改完记得跑 tests/?balance 验证」这句话对饰品是空话。
  // 现在 LOADOUTS 的第三格真的会被穿上；没给第三格的档位（TIERS 那三档）accessory 仍是 null。
  for (const m of st.party) { m.level = level; const [w, a, acc = null] = GEAR(level, endgame)[m.jobId]; m.equipment = { weapon: w, armor: a, accessory: acc }; healFull(m, data); }
  const s = { game: { data, state: st }, rng: new RNG(seed), msg: '', escaped: false, canFlee: false,
    // 桩要跟 Effects 的接口一致：少一个 shake，一出会心就抛「不是函数」；
    // 少一个 size，第一次物理攻击就抛「scene.size is not a function」——
    // actions.js 的 attack() 每次命中都要拿目标尺寸给特效用（658f445「被魔法笼罩」那次加的），
    // 而这里的假场景没有画面、没有尺寸，回一个空对象即可（特效本来就是空实现）
    fx: { add() {}, shake() {} }, popup() {}, center() { return [0, 0]; }, size() { return {}; },
    summonsUsed: new Set(),   // 一场每尊只能请一次（summons.json 的 once）；callSummon 会往里加
    party: makePartyActors(st, data), enemies: makeEnemyActors(enemyIds, data),
    alive: l => l.filter(a => a.alive),
    retarget(t) { return t.alive ? t : (this.alive(t.side === 'enemy' ? this.enemies : this.party)[0] || null); },
    damage(t, dmg, { physical = false } = {}) { t.hp = Math.max(0, t.hp - dmg); if (physical && t.status.sleep) delete t.status.sleep; if (t.hp <= 0) { t.alive = false; t.status = {}; } },
    run(a) { const co = execute(this, a); let n = 0; while (!co.next().done && n++ < 200); } };
  return s;
}
// 物理职业的战技策略。**这一段必须有**：没有它，加了战技之后跑出来的表和以前一模一样，
// 看着像「改动没影响」，其实只是模拟里的玩家从来没点过那一栏。
// 策略跟一个正常玩家一样朴素：有人挨打了就开脸挡着，否则挑期望伤害最高的一招，
// 但要**明显**比普攻好才换（不然白白吃掉冷却），而且血少于一半时不碰要放血的那几招。
function pickSkill(s, p, enemies) {
  const data = s.game.data;
  if (!p.member || !data.skills) return null;
  const ready = memberSkills(p.member, data).map(id => ({ id, sk: data.skills[id] }))
    .filter(x => x.sk && skillReady(p, x.id, x.sk));
  if (!ready.length) return null;
  const party = s.alive(s.party);
  const guard = ready.find(x => x.sk.target === 'self' && !x.sk.power);
  if (guard && !p.status.blockade && p.hp > p.maxHp * 0.5
      && party.some(m => m !== p && m.hp < m.maxHp * 0.5)) {
    return { type: 'skill', skillId: guard.id, target: p };
  }
  const lowHp = p.hp < p.maxHp * 0.5;
  const plain = enemies.length ? Math.max(...enemies.map(e => estSkill({ power: 1 }, p, e))) : 0;
  let bestSk = null, bestTgt = null, best = plain * 1.05;
  for (const x of ready) {
    if (x.sk.target === 'self' || !x.sk.power) continue;
    if (x.sk.hp && lowHp) continue;
    const shape = skillShape(x.sk, p.member, x.id);
    if (x.sk.scope === 'all') {
      const sum = enemies.reduce((t, e) => t + estSkill(shape, p, e), 0);
      if (sum > best) { best = sum; bestSk = x; bestTgt = 'all'; }
    } else {
      for (const e of enemies) { const d = estSkill(shape, p, e); if (d > best) { best = d; bestSk = x; bestTgt = e; } }
    }
  }
  return bestSk ? { type: 'skill', skillId: bestSk.id, target: bestTgt } : null;
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
  // 請神走和自动战斗同一个挑法（autoBattle.pickSummon）：两边分头写一套，
  // 表上调好的数字到了实机就不是那回事了
  const summon = pickSummon(p, s.party, enemies, data, s.summonsUsed);
  if (summon) return summon;
  if (attacks.length && (p.jobId === 'talisman' || p.jobId === 'peddler')) { const id = attacks[0]; return { type: 'magic', spellId: id, target: sp[id].scope === 'all' ? 'all' : weakest }; }
  return pickSkill(s, p, enemies) || { type: 'attack', target: weakest };
}
function fight(data, level, enemyIds, seed, endgame, tangkiLv = 0) {
  const s = scene(data, level, enemyIds, seed, endgame, tangkiLv);
  let rounds = 0;
  while (s.alive(s.party).length && s.alive(s.enemies).length && rounds++ < 40) {
    const acts = [];
    // 冷却在「他的回合开始」走一格，和 BattleScene.beginInput 同一个时点——
    // 两边不一致的话，模拟出来的战技节奏就不是玩家实际会遇到的那个
    for (const p of s.alive(s.party)) tickCooldowns(p);
    for (const p of s.alive(s.party)) acts.push({ actor: p, ...(p.status.sleep ? { type: 'sleep' } : decide(s, p)) });
    for (const e of s.alive(s.enemies)) { const d = e.status.sleep ? { type: 'sleep' } : decideEnemyAction(e, s.enemies, s.party, data, s.rng); if (d) acts.push({ actor: e, ...d }); }
    acts.sort((a, b) => (b.actor.spd + s.rng.int(0, 4)) - (a.actor.spd + s.rng.int(0, 4)));
    for (const a of acts) { if (!s.alive(s.party).length || !s.alive(s.enemies).length) break; s.run(a); }
  }
  const won = !!s.alive(s.enemies).length === false && s.alive(s.party).length > 0;
  const hpLoss = 1 - s.party.reduce((t, p) => t + p.hp, 0) / s.party.reduce((t, p) => t + p.maxHp, 0);
  const mpLoss = 1 - s.party.reduce((t, p) => t + p.mp, 0) / Math.max(1, s.party.reduce((t, p) => t + p.maxMp, 0));
  // 一场请了几尊。**这是導演真正在问的那个数**（他的原话是「一场只能请一尊」），
  // 光看胜率和 MP 百分比看不出来——把它列成一栏，改召唤的数值前后一眼就能对。
  return { won, rounds, hpLoss, mpLoss, dead: s.party.filter(p => !p.alive).length, summons: s.summonsUsed.size };
}

export async function run(data = null, n = 30) {
  data ||= await loadData(location.pathname.includes('/tests/') ? '../data/' : './data/');
  checkGear(data);
  const rows = [];
  const zones = { ...data.encounters,
    'boss(纯商店)':   { groups: [{ enemies: ['knight'], weight: 1 }] },
    'boss(顺路开箱)': { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'onpath' },
    'boss(全开箱)':   { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'full' },
    'boss(壇下+爐底)': { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'side' },
    // 童乩那一路：队伍里换一个请神的进来，職業 21 级 ＝ 请得动前四位。
    // 有这一行，改 summons.json 的 MP 才看得见后果
    'boss(童乩)':     { groups: [{ enemies: ['knight'], weight: 1 }], endgame: 'onpath', tangki: 21 },
    'cave_deep(童乩)': { groups: [{ enemies: ['skeleton', 'darkslime'], weight: 2 }, { enemies: ['ghost', 'ghost', 'skeleton'], weight: 1 }], tangki: 21 } };
  const levels = { village_field: [1, 2, 3], plains: [2, 3, 4, 5], cave: [4, 5, 6, 7], cave_deep: [5, 6, 7, 8],
                   fort: [4, 5, 6, 7], tomb: [4, 5, 6, 7],          // 隘寮石城 / 万金古塚：跟 cave 同一档，用同一组等级才好对照
                   // 这四个区之前漏在这张表外，会静默落到兜底 [3,6,9]——数字量出来但答的是另一道题
                   // （八元素迷宫剩下六座的对抗验证捅出来的）。按加权 exp/步实测对齐：
                   // altar 1.42 ≈ plains 1.49、altar_deep 3.09 ≈ fort/tomb、furnace 2.95 ≈ fort、
                   // furnace_deep 5.50 ≈ cave_deep 5.53、lighthouse 4.27 介于两档之间偏硬
                   altar: [2, 3, 4, 5], altar_deep: [4, 5, 6, 7], furnace: [4, 5, 6, 7], furnace_deep: [5, 6, 7, 8],
                   lighthouse: [5, 6, 7, 8], windgap: [5, 6, 7, 8], windgap_deep: [6, 7, 8, 9],
                   // 出火地縫挂在打完乌火之后（overworld 入口的 NPC 是 unless: bossDefeated），
                   // 量它就该量「刚通完主线」那个等级，不是从头量——纯商店路线 10–12 级才打得过乌火，
                   // 顺路开箱 7 级就稳赢（CLAUDE.md「Boss 难度曲线」），这里取两条路线的交集往上一点
                   chuhuo: [8, 9, 10, 11], chuhuo_deep: [9, 10, 11, 12],
                   // 木馬道没有闸门（随时进得去，跟 altar/furnace/lighthouse/windgap 同一档），
                   // 数值也已经压到那个梯度，量的等级照抄 cave/tomb 那两档
                   trail: [4, 5, 6, 7], trail_deep: [5, 6, 7, 8],
                   // 空伙房跟出火地縫同一挂法（overworld 入口的「路过的庄仔人」是 unless: bossDefeated），
                   // 而且量出来的加权 HP 比出火还重（huofang_deep 215.5 > chuhuo_deep 顶 300 那档的均值），
                   // 量的等级比出火再抬一档
                   huofang: [9, 10, 11, 12], huofang_deep: [10, 11, 12, 13],
                   'boss(纯商店)': [6, 8, 10, 12], 'boss(顺路开箱)': [4, 5, 6, 7, 8], 'boss(全开箱)': [4, 5, 6, 7, 8],
                   'boss(童乩)': [5, 7, 9, 12], 'cave_deep(童乩)': [6, 9, 12],
                   'boss(壇下+爐底)': [4, 5, 6, 7, 8] };
  for (const [zone, z] of Object.entries(zones)) {
    for (const level of levels[zone] || [3, 6, 9]) {
      const r = { zone, level, fights: 0, wins: 0, hpLoss: 0, mpLoss: 0, rounds: 0, deaths: 0, summons: 0 };
      const rng = new RNG(1000 + level);
      for (let i = 0; i < n; i++) {
        const g = rng.weighted(z.groups, x => x.weight);
        const f = fight(data, level, g.enemies, 7 + i * 13 + level, z.endgame, z.tangki || 0);
        r.fights++; r.wins += f.won; r.hpLoss += f.hpLoss; r.mpLoss += f.mpLoss; r.rounds += f.rounds; r.deaths += f.dead; r.summons += f.summons;
      }
      rows.push({ zone, level, winRate: Math.round(100 * r.wins / r.fights), hpLoss: Math.round(100 * r.hpLoss / r.fights), mpLoss: Math.round(100 * r.mpLoss / r.fights), rounds: +(r.rounds / r.fights).toFixed(1), deaths: +(r.deaths / r.fights).toFixed(2), summons: +(r.summons / r.fights).toFixed(2) });
    }
  }
  return rows;
}
if (location.search.includes('balance')) run().then(rows => { document.body.innerHTML = `<pre>${['zone       lv  win% hp% mp% rounds deaths 请神', ...rows.map(r => `${r.zone.padEnd(12)} ${String(r.level).padStart(2)}  ${String(r.winRate).padStart(3)} ${String(r.hpLoss).padStart(3)} ${String(r.mpLoss).padStart(3)}  ${String(r.rounds).padStart(5)}  ${String(r.deaths).padEnd(5)} ${r.summons}`)].join('\n')}</pre>`; window.__balance = rows; });
