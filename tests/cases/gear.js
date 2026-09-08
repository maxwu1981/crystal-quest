// 装备与道具：材质分级、神话装备、可获取性。
// 「每件装备都拿得到」那几条是补出来的教训：原本只有一条松断言
// 「至少 4 件神话装备可获得」，掩盖了 23 件里 15 件玩家永远见不到。
// 断言要写死到位，写松了等于没写。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data } from '../context.js';
import { computeStats } from '../../src/game/party.js';
import { addItem, removeItem, countItem, applyItem, equip, canEquip } from '../../src/game/items.js';
import { makePartyActors } from '../../src/battle/actors.js';
import { scene as balanceScene, checkGear } from '../balance.js';

test('背包增删计数', () => {
  const inv = []; addItem(inv, 'potion', 2); addItem(inv, 'potion');
  assert(countItem(inv, 'potion') === 3); assert(removeItem(inv, 'potion', 3)); assert(inv.length === 0); assert(!removeItem(inv, 'potion'));
});
test('药水回血封顶；凤凰尾巴只对死者有效', () => {
  const p = data.items.potion, ph = data.items.phoenix;
  const t = { hp: 90, mp: 0, maxHp: 100, maxMp: 0, alive: true };
  assert(applyItem(p, t).hp === 10 && t.hp === 100); assert(applyItem(ph, t) === null);
  const d = { hp: 0, mp: 0, maxHp: 40, maxMp: 0, alive: false };
  assert(applyItem(p, d) === null); const o = applyItem(ph, d); assert(o.revived && d.alive && d.hp === 20);
});
test('装备：职业限制、旧装备回背包、攻击力变化、卸下', () => {
  const m = { jobId: 'herbwife', level: 1, exp: 0, hp: 1, mp: 1, equipment: { weapon: 'wood_staff', armor: null } };
  const inv = [{ id: 'iron_sword', qty: 1 }, { id: 'bronze_dagger', qty: 1 }];
  assert(!equip(m, 'weapon', 'iron_sword', inv, data), '白魔不能拿铁剑');
  const before = computeStats(m, data).atk;
  assert(equip(m, 'weapon', 'bronze_dagger', inv, data));
  assert(m.equipment.weapon === 'bronze_dagger' && countItem(inv, 'wood_staff') === 1 && countItem(inv, 'bronze_dagger') === 0);
  assert(computeStats(m, data).atk > before);
  assert(equip(m, 'weapon', null, inv, data) && m.equipment.weapon === null && countItem(inv, 'bronze_dagger') === 1);
});


// ---------- 装备系统：材质分级 + 神话装备 ----------
test('材质分级：同类装备 tier 越高属性越强、价格越贵', () => {
  const byCat = {};
  for (const [id, it] of Object.entries(data.items)) {
    if (it.myth || !it.cat) continue;
    (byCat[it.type + ':' + it.cat] ||= []).push({ id, ...it });
  }
  for (const [k, list] of Object.entries(byCat)) {
    list.sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i], key = cur.type === 'weapon' ? 'atk' : 'def';
      assert(cur.tier > prev.tier, `${k} tier 重复：${prev.id} ${cur.id}`);
      assert(cur[key] > prev[key], `${k} ${cur.id} 的 ${key} 不比 ${prev.id} 强`);
      assert(cur.price > prev.price, `${k} ${cur.id} 不比 ${prev.id} 贵`);
    }
  }
});
test('神话装备：都有造型 id、出处、说明，且强于同类最高材质', () => {
  const myth = Object.entries(data.items).filter(([, it]) => it.myth);
  assert(myth.length >= 20, `神话装备只有 ${myth.length} 件`);
  const icons = new Set();
  for (const [id, it] of myth) {
    assert(it.icon && !icons.has(it.icon), `${id} 造型 id 缺失或重复`); icons.add(it.icon);
    assert(it.lore && it.desc, `${id} 缺出处或说明`);
    assert(it.price === 0, `${id} 神话装备不该标价`);
    if (!it.cat) continue;
    const peers = Object.values(data.items).filter(x => !x.myth && x.cat === it.cat && x.type === it.type);
    const key = it.type === 'weapon' ? 'atk' : 'def';
    const best = Math.max(...peers.map(x => x[key] || 0));
    assert((it[key] || 0) > best, `${id} 的 ${key} 没有超过最强材质款 ${best}`);
  }
  const lores = new Set(myth.map(([, it]) => it.lore));
  assert(lores.size >= 8, `神话来源只有 ${lores.size} 种，应覆盖更多地区`);
});
test('三个装备槽：饰品可装、加成进属性、卸下还原', () => {
  const m = { jobId: 'boxer', level: 5, exp: 0, hp: 1, mp: 1, status: {}, equipment: { weapon: null, armor: null, accessory: null } };
  const before = computeStats(m, data);
  const inv = [{ id: 'dragon_heart', qty: 1 }, { id: 'power_band', qty: 1 }];
  assert(equip(m, 'accessory', 'dragon_heart', inv, data), '饰品应能装上');
  const after = computeStats(m, data);
  assert(after.maxHp === before.maxHp + 150, `HP 加成没生效 ${before.maxHp}→${after.maxHp}`);
  assert(after.def === before.def + 6, '防御加成没生效');
  assert(equip(m, 'accessory', 'power_band', inv, data) && countItem(inv, 'dragon_heart') === 1, '换饰品应把旧的放回背包');
  assert(equip(m, 'accessory', null, inv, data) && computeStats(m, data).atk === before.atk, '卸下应还原');
});
// tests/balance.js 的 LOADOUTS 表长期写着 accessory:null——不是数值定得不好，
// 是 scene() 那一行只解构 [w,a] 两个位置，第三格写了也没人读。六座迷宫的对抗验证
// 捅出这个洞：箱子里塞饰品，balance 表上一个数字都不会动，看着像「改动没影响」。
// 这条直接跑一遍 balance.js 自己的 scene()，确认第三格真的穿到了队员身上。
test('balance.js 的装备表：第三格（饰品）真的会穿到模拟角色身上', () => {
  checkGear(data);       // 顺便验 LOADOUTS 里三个格子的道具 id 都存在（含只读 id 那半）
  const s = balanceScene(data, 9, ['goblin'], 1, 'full', 21);   // tangkiLv>0 才会换一个童乩进队伍
  const withAcc = s.party.filter(p => p.member.equipment.accessory);
  assert(withAcc.length >= 4, `LOADOUTS.full 该有至少 4 人戴着饰品，实际 ${withAcc.length}`);
  // 挑一个断言到具体数值：童乩戴的 ouroboros 是 immuneAll，这条最容易被「读到了但没生效」蒙混过去
  const tk = s.party.find(p => p.jobId === 'tangki');
  assert(tk?.immune?.length >= 3, `童乩该因为 ouroboros 免疫全部状态异常，实际 immune=${JSON.stringify(tk?.immune)}`);
});
test('武器特效：属性倍率、连击、附加状态、免疫饰品', () => {
  const m = { jobId: 'boxer', level: 8, exp: 0, hp: 1, mp: 1, status: {}, equipment: { weapon: 'kusanagi', armor: null, accessory: null } };
  const s = computeStats(m, data);
  assert(s.element === 'metal', '草薙剑应带金属性（雷走金，见 battle/elements.js）');
  assert(computeStats({ ...m, equipment: { weapon: 'ganjiang' } }, data).hits === 2, '干将莫邪应是 2 连击');
  assert(computeStats({ ...m, jobId: 'general', equipment: { weapon: null } }, data).hits === 2, '武僧空手应是 2 连击');
  assert(computeStats({ ...m, jobId: 'general', equipment: { weapon: 'nemean_fist' } }, data).hits === 4, '武僧 + 双击武器 = 4');
  assert(computeStats({ ...m, equipment: { weapon: 'gram' } }, data).onHit.status === 'blind', '格拉墨应附加黑暗');
  const im = computeStats({ ...m, equipment: { accessory: 'ouroboros' } }, data);
  assert(im.immuneAll, '衔尾蛇之环应免疫异常');
  const st = { party: [{ ...m, equipment: { weapon: null, armor: null, accessory: 'ouroboros' } }], inventory: [] };
  assert(makePartyActors(st, data)[0].immune.includes('poison'), '免疫应带进战斗');
});
test('商店只卖非神话装备，宝箱/掉落才有神话装备', () => {
  for (const md of Object.values(data.maps)) for (const n of md.npcs || []) {
    for (const id of n.script?.items || []) assert(!data.items[id].myth, `商店不该卖神话装备 ${id}`);
    for (const r of n.script?.reward || []) assert(data.items[r.id], `掉落物 ${r.id} 不存在`);
  }
});

// 收集全部获取途径：商店 / 宝箱 / Boss 掉落 / NPC 赠予
function itemSources() {
  const src = new Map();
  const add = (id, where) => { if (!id) return; if (!src.has(id)) src.set(id, []); src.get(id).push(where); };
  for (const [mid, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) add(ev.item, `${mid} 宝箱 ${ev.id || ev.x + ',' + ev.y}`);
    for (const n of md.npcs || []) {
      for (const id of n.script?.items || []) add(id, `${mid} ${n.name} 商店`);
      for (const r of n.script?.reward || []) add(r.id, `${mid} ${n.name} 掉落`);
      for (const v of n.dialogue || []) for (const g of v.give?.items || []) add(g.id, `${mid} ${n.name} 赠予`);
    }
  }
  return src;
}

// 写在前面、但本作范围内没有用上的装备阶梯。
//
// 每条装备线的材质表都写到了 tier 11，而游戏实际只用到 tier 5（商店卖到钢）
// 再直接跳到 tier 11 的神话装备（宝箱给）。中间这 23 件属性、价格、职业限制都写好了，
// 但商店不卖、宝箱没有、没人给——玩家永远见不到。
//
// **没有删，也没有硬塞进游戏**：这是个 1–2 小时的垂直切片，塞 23 件装备会撑坏节奏；
// 而删掉又会让以后想扩展的人重写一遍阶梯。所以显式列在这里，
// 意思是「知道它们拿不到，这是有意留白」——**新出现的孤儿会被下面那条测试当场抓住**。
//
// 顺带一提，这批断档正是 Boss 难度全靠开箱驱动的原因：
// 玩家的强度只有「商店 tier 5」和「神话 tier 11」两档，中间没有过渡。
// 详见 CLAUDE.md 的 Boss 难度曲线一节。
// 2026-09-08：tier 6（银）与 tier 7（秘银）**已经全部有出处了**——
// 壇下三层放银的那五件、爐底两层放秘银的那六件（见 data/maps/altar_*.json、furnace_*.json）。
// 这一档正是导演点名的那个断档：商店最高 tier 5（钢剑 atk 18），神话是 tier 11
// （草薙剑 atk 72），中间空五档，玩家的强度只有两个台阶。银与秘银补上了前两阶。
//
// **剩下的 tier 8–10 是故意不给的**，不是忘了：
//   ① 价钱就说明它们不属于这一段游戏——精金 5854、陨铁 11415、龙牙 22259 金，
//      而打穿现在这一幕全部收入也就一两千。
//   ② 防御那一侧更要命：伤害公式是「攻击×1.5 − 防御」，而乌火 atk 只有 30，
//      所以 def ≥ 60 的角色每下只吃 1 点 ＝ 物理免疫。龙鳞甲 def 57 一件就到门口了
//      （见 CLAUDE.md 的 Boss 难度曲线一节）。
//   ③ 它们该属于第三幕以后那几座还没做的迷宫（docs/八元素迷宫.md 列了八座，
//      现在落地的是壇下与爐底两座）。哪天那些迷宫接上了，就从这张名单里往下删。
const UNUSED_TIERS = new Set([
  'adamant_sword', 'meteor_sword', 'dragon_sword',
  'adamant_dagger', 'meteor_dagger',
  'adamant_claw', 'dragon_claw',
  'star_staff',
  'adamant_armor', 'meteor_armor', 'dragon_armor',
  'star_robe',
]);

test('每件神话装备都真的拿得到（之前 23 件里有 15 件玩家永远见不到）', () => {
  const src = itemSources();
  const missing = Object.entries(data.items).filter(([id, it]) => it.myth && !src.has(id)).map(([id]) => id);
  assert(!missing.length, `这些神话装备定义了却没有任何出处：${missing.join(' ')}`);
});

test('每件装备都拿得到——普通装备也要查，不只神话装备', () => {
  // 原本只有「每件神话装备都拿得到」那一条，`it.myth` 一过滤，
  // 普通装备线就没人守了：实际有 23 件 tier 6–10 定义完整却永远见不到，
  // 一直没被发现。这条把范围放到全部装备，已知留白的走 UNUSED_TIERS 白名单。
  const src = itemSources();
  const missing = [];
  for (const [id, it] of Object.entries(data.items)) {
    if (!['weapon', 'armor', 'accessory'].includes(it.type)) continue;
    if (src.has(id) || UNUSED_TIERS.has(id)) continue;
    missing.push(`${id}（${it.name}）`);
  }
  assert(!missing.length,
    '这些装备定义了却没有任何出处（商店/宝箱/掉落/赠予都没有）：\n      ' + missing.join('\n      ')
    + '\n      要么给它一个出处，要么加进 tests/run.js 的 UNUSED_TIERS 并说明为什么留白');
});

test('UNUSED_TIERS 白名单不能过期：里面的东西如果已经能拿到了，就该从名单里去掉', () => {
  // 白名单最怕的是「加进去就忘了」。哪天有人给银剑加了出处，
  // 名单不清理的话，下次再有孤儿又会被这条陈旧的白名单放过去。
  const src = itemSources();
  const stale = [...UNUSED_TIERS].filter(id => src.has(id));
  assert(!stale.length,
    `这些已经拿得到了，请从 UNUSED_TIERS 里删掉：${stale.join(' ')}`);
  const gone = [...UNUSED_TIERS].filter(id => !data.items[id]);
  assert(!gone.length, `UNUSED_TIERS 里有不存在的道具：${gone.join(' ')}`);
});

test('神话装备的职业限制合法，且不会出现「拿得到但全队没人能装」', () => {
  const src = itemSources();
  const partyJobs = new Set(data.party.map(p => p.jobId));
  for (const [id, it] of Object.entries(data.items)) {
    if (!it.myth || !it.cat) continue;
    if (!it.jobs) continue;                       // 不写 jobs = 全职业通用
    assert(it.jobs.length, `${id} 的 jobs 是空数组，谁都装不了`);
    for (const j of it.jobs) assert(data.jobs[j], `${id} 引用了不存在的职业 ${j}`);
  }
  // 大武山祭场的四个箱子是设计成「初始四人各一件」的，必须对得上默认队伍
  const finalChests = (data.maps.cave_3?.events || []).filter(e => e.type === 'chest' && data.items[e.item]?.myth);
  for (const ev of finalChests) {
    const jobs = data.items[ev.item].jobs;
    assert(!jobs || jobs.some(j => partyJobs.has(j)),
      `祭场宝箱 ${ev.id} 的 ${data.items[ev.item].name} 只有 ${jobs.join('/')} 能装，初始队伍拿了也用不了`);
  }
  assert(src.size, '一件可获得的道具都没有，收集逻辑坏了');
});

test('每个职业都装得上东西：武器、防具、饰品三个槽各至少有一件能装的', () => {
  // 装备限制是**每件道具一张白名单**（items.json 的 jobs），加了新职业不去补，
  // 结果就是它一路裸着打到底——而且没有任何报错，转职预览只会显示「卸下 ○○」。
  // 童乩加进来那次正是如此：25 件后排装备一件都没写它。
  // 家将（赤手空拳）是唯一允许没有武器的：他的设定就是不拿兵器。
  const slots = { weapon: '武器', armor: '防具', accessory: '饰品' };
  const bad = [];
  for (const id of Object.keys(data.jobs)) {
    for (const [slot, cn] of Object.entries(slots)) {
      if (slot === 'weapon' && id === 'general') continue;
      const ok = Object.values(data.items).some(it => it.type === slot && canEquip(it, { jobId: id }));
      if (!ok) bad.push(`${data.jobs[id].name} 没有能装的${cn}`);
    }
  }
  assert(!bad.length, bad.join('；'));
});
