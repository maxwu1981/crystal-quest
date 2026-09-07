// 战斗行动执行（协程，yield 秒数 或 'confirm'）：攻击 / 魔法 / 請神 / 道具 / 防御 / 逃跑 / 睡眠，
// 以及行动前的状态处理。
// 由 BattleScene.beginAction 调用；只通过 scene 的 msg / damage / popup / fx / rng 与画面交互。
import * as F from './formulas.js';
import { STATUS, cureStatus } from '../game/status.js';
import { audio } from '../core/audio.js';
import { countItem, removeItem, applyItem, canUseOn, describeUse } from '../game/items.js';
// 四张属性表都从 elements.js 取。以前这个档里各写一份，属性一改名就要四处一起改，
// 而改漏一处的表现是「特效静默退回 spark」——不报错、测试也照过。
import { ELEMENT_FX, ELEMENT_TINT, ELEMENT_SFX, ELEMENT_COLOR } from './elements.js';
// 「請神」的解锁与熟练度全在数据层（game/jobskill.js），这里只当调用方：
// 能请谁、这一位这次多少威力多少 MP、用掉一次要记什么，都不在战斗里重新判一遍。
import { availableSummons, useSkill, skillScale } from '../game/jobskill.js';
// 哪几位的演出焦点在我方——不在这里再抄一份名单，直接问那个档自己。
import { FX_ALLY } from './summonFxAlly.js';
// veilOn / inflict 搬去了 afflict.js（skillAction.js 也要用，留在这儿会成循环引用）。
// 这里原样再导出一次，tests/cases/battle.js 与将来的调用方 import 一个字都不用改。
import { veilOn, inflict } from './afflict.js';
export { inflict };
// 三个物理职业的「战技」。它跟魔法/請神一样是一整条演出＋结算，单独成档
// （actions.js 已经 339 行，CLAUDE.md 的上限是 400）。
import { useBattleSkill } from './skillAction.js';

// 行动前：毒伤害、状态倒计时。返回 false 表示角色已倒下
function* statusPhase(scene, actor) {
  if (actor.status.poison) {
    scene.msg = `${actor.name} 受到毒的侵蚀`; scene.damage(actor, F.poisonDamage(actor.maxHp)); audio.sfx('buzz'); yield 0.6;
    if (!actor.alive) { scene.msg += `\n${actor.name} 倒下了`; yield 0.5; return false; }
  }
  // 倒计时照着 STATUS 自己的 turns 走，**不再手写一张 ['sleep','protect'] 的名单**：
  // 加了破甲与挡煞之后，漏登记的表现是「状态永远不消」——不报错、测试也照过，
  // 正是这个项目栽过好几次的那一类。报的那句话来自 STATUS[s].gone。
  for (const s of Object.keys(actor.status)) {
    if (typeof actor.status[s] !== 'number') continue;   // 数字 ＝ 有 turns 的那几种
    if (--actor.status[s] > 0) continue;
    delete actor.status[s];
    const gone = STATUS[s]?.gone;
    if (gone) { scene.msg = `${actor.name} ${gone}`; yield 0.5; }
  }
  return true;
}

export function* execute(scene, a) {
  const actor = a.actor, rng = scene.rng, data = scene.game.data;
  if (!actor.alive) return;
  actor.defending = false;
  if (!(yield* statusPhase(scene, actor))) return;
  if (a.type === 'sleep' || actor.status.sleep) { scene.msg = `${actor.name} 正在沉睡…`; yield 0.6; return; }
  if (a.type === 'defend') { actor.defending = true; scene.msg = `${actor.name} 稳住了身形`; audio.sfx('cursor'); yield 0.6; return; }
  if (a.type === 'flee') {
    scene.msg = `${actor.name} 想退开…`; yield 0.6;
    const ps = scene.alive(scene.party), es = scene.alive(scene.enemies);
    const avg = ps.reduce((s, p) => s + p.spd, 0) / ps.length, mx = Math.max(...es.map(e => e.spd));
    if (scene.canFlee && rng.chance(F.fleeChance(avg, mx))) { scene.msg = '退开了。'; scene.escaped = true; audio.sfx('flee'); }
    else { scene.msg = '退不掉。'; audio.sfx('buzz'); }
    yield 0.8; return;
  }
  if (a.type === 'item') { yield* useItem(scene, actor, a); return; }
  if (a.type === 'attack') { yield* attack(scene, actor, a); return; }
  if (a.type === 'magic') { yield* castSpell(scene, actor, a); return; }
  if (a.type === 'skill') { yield* useBattleSkill(scene, actor, a); return; }
  if (a.type === 'summon') { yield* callSummon(scene, actor, a); return; }
}

function* useItem(scene, actor, a) {
  const it = scene.game.data.items[a.itemId], t = a.target, inv = scene.game.state.inventory;
  if (!countItem(inv, a.itemId)) { scene.msg = `${it.name} 已经用完了`; yield 0.6; return; }
  scene.msg = `${actor.name} 使用了 ${it.name}！`; actor.lunge = 0.3; yield 0.4;
  if (!canUseOn(it, t)) { scene.msg += '\n没有效果'; audio.sfx('buzz'); yield 0.6; return; }
  removeItem(inv, a.itemId);
  const out = applyItem(it, t);
  scene.fx.add(out?.revived ? 'heal' : 'spark', ...scene.center(t)); audio.sfx(out?.revived ? 'heal' : 'item');
  if (out?.hp) scene.popup(t, String(out.hp), '#9ecf7a');
  if (out?.mp) scene.popup(t, String(out.mp), '#8fb9a8');
  scene.msg += '\n' + describeUse(it, t.name, out); yield 0.8;
}

// 刀光的颜色跟着武器材质走：木/青铜偏暖，铁钢偏冷，银与秘银发亮，神话装备带自己的属性色
const SWING_COLOR = { wood: '#d9c08a', oak: '#d9c08a', bronze: '#d8a86a', iron: '#dfe3e6',
  steel: '#eef3f6', silver: '#f2f4ff', mythril: '#cfe8ff', adamant: '#bcd0e0', meteor: '#e0d2f0',
  dragon: '#ffd9b0', crystal: '#cdeff2', star: '#e6dcff', knife: '#dfe3e6',
  wrap: '#e2cfa8', leather: '#c9a074' };
function swingColor(actor) {
  if (actor.element && ELEMENT_COLOR[actor.element]) return ELEMENT_COLOR[actor.element];
  const id = actor.member?.equipment?.weapon || '';   // 战斗 actor 把队员挂在 .member 上
  for (const k in SWING_COLOR) if (id.startsWith(k)) return SWING_COLOR[k];
  return '#efe9d2';
}

function* attack(scene, actor, a) {
  const t = scene.retarget(a.target); if (!t) return;
  scene.msg = `${actor.name} 出手`; actor.lunge = 0.3;
  // 先看到武器挥出去，再看到命中——原本只有一个前冲位移，武器根本不动。
  // 我方站右边打向左，敌人反过来。刀光颜色跟着武器材质走。
  const face = actor.side === 'party' ? -1 : 1;
  scene.fx.add('swing', ...scene.center(actor), { dir: face, color: swingColor(actor) });
  yield 0.3;
  const r = F.physicalAttack(F.effectiveStats(actor), F.effectiveStats(t), scene.rng);
  if (r.miss) { scene.popup(t, 'MISS', '#ddd'); audio.sfx('miss'); scene.msg += '\n没有命中'; yield 0.7; return; }
  // 武器属性：对弱点翻倍、被抗性减半
  const mult = F.elementMultiplier(t, actor.element);
  if (actor.element && mult !== 1) r.damage = Math.max(1, Math.floor(r.damage * mult));
  // 打在敌人身上是白色月牙，打在自己人身上是红色冲击环——一眼要能分出挨打的是谁
  const impact = actor.element ? (ELEMENT_FX[actor.element] || 'slash') : (t.side === 'party' ? 'hurt' : 'slash');
  const impactFx = scene.fx.add(impact, ...scene.center(t), { dir: face, ...scene.size(t) });
  if (actor.element) veilOn(t, impactFx, ELEMENT_TINT[actor.element]);   // 附魔武器同样要透出目标
  if (r.crit) scene.fx.shake(0.18);          // 会心才震，普通命中不震，免得整场都在晃
  audio.sfx(r.crit ? 'crit' : 'hit');
  scene.damage(t, r.damage, { physical: true, crit: r.crit });   // crit 只用来决定伤害数字的样式，不参与结算
  scene.msg += `\n${r.hits} 次命中${r.crit ? '  会心一击！' : ''}`;
  if (actor.element && mult > 1) scene.msg += '  效果拔群！'; else if (actor.element && mult < 1 && mult > 0) scene.msg += '  效果不佳…';
  scene.msg += `\n${t.name} 受到 ${r.damage} 伤害`;
  yield 0.8;
  if (!t.alive) { scene.msg += `\n${t.name} 倒下了`; yield 0.5; return; }
  const oh = actor.onHit; // 敌人附带状态攻击（蝙蝠致盲、黑史莱姆下毒…）
  if (oh && scene.rng.chance(oh.chance ?? 0.3) && inflict(scene, t, oh.status)) { scene.msg += `\n${t.name} ${STATUS[oh.status].name}了`; audio.sfx('buzz'); yield 0.6; }
}

function* castSpell(scene, actor, a) {
  const sp = scene.game.data.spells[a.spellId];
  if (actor.mp < sp.mp) { scene.msg = `${actor.name} 的 MP 不足！`; audio.sfx('buzz'); yield 0.6; return; }
  const ally = sp.target === 'ally';
  const targets = a.target === 'all'
    ? (sp.revive ? scene.party.filter(p => !p.alive) : scene.alive(ally ? scene.party : scene.enemies))
    : [sp.revive ? a.target : scene.retarget(a.target)].filter(Boolean);
  if (!targets.length) { scene.msg = `${actor.name} 施放了 ${sp.name}！\n没有对象`; yield 0.6; return; }
  actor.mp -= sp.mp;
  // 施法不前冲——法师扑上去砍人的观感不对。改成脚下浮起光环的起手式。
  scene.msg = `${actor.name} 施放了 ${sp.name}！`;
  scene.fx.add('cast', ...scene.center(actor), { color: sp.target === 'ally' ? '#9fd8c8' : '#c9a8e8' });
  audio.sfx('magic'); yield 0.45;
  // 全体攻击魔法：**所有目标同时演**，不是一只一只轮着来。
  // 逐个演的话四只敌人要等 3.4 秒，第二遍开始玩家就只是在等；
  // 而且「一发全体魔法」的观感本来就是一次盖满全场，不是连放四次同样的动画。
  // 治疗/复活/纯状态不走这条：那几种的看点在「谁被治到了」，逐个报反而清楚。
  const volley = targets.length > 1 && sp.power > 0 && !sp.heal && !sp.cure && !sp.revive;
  if (volley) { yield* spellVolley(scene, actor, sp, targets); return; }
  for (const t of targets) yield* spellOn(scene, actor, sp, t);
}

// 全体攻击魔法的一次齐射。伤害数字由每个目标头上的 popup 各自交代
// （FF6 也是这么做的），消息窗只留一句总结——窗口只显示最后几行，
// 四只敌人各报一行的话，连「施放了地狱火」那句都会被挤掉。
function* spellVolley(scene, actor, sp, targets) {
  const kind = ELEMENT_FX[sp.element] || 'spark';
  for (const t of targets) {
    veilOn(t, scene.fx.add(kind, ...scene.center(t), scene.size(t)), ELEMENT_TINT[sp.element]);
  }
  audio.sfx(ELEMENT_SFX[sp.element] || 'hit');
  yield 0.9;                                   // 同上：等目标被火吞掉的那一刻再结算
  let best = 1, worst = 1, downed = [];
  for (const t of targets) {
    const r = F.magicDamage(sp.power, actor, t, sp.element, scene.rng);
    scene.damage(t, r.damage);
    best = Math.max(best, r.mult); worst = Math.min(worst, r.mult);
    if (!t.alive) downed.push(t.name);
    else if (sp.status && r.mult > 0) inflict(scene, t, sp.status);
  }
  if (best > 1) scene.msg += '\n效果拔群！';
  else if (worst === 0) scene.msg += '\n完全无效…';
  yield 0.75;
  if (downed.length) { scene.msg += `\n${downed.join('、')} 倒下了`; yield 0.5; }
}

function* spellOn(scene, actor, sp, t) {
  const rng = scene.rng;
  if (sp.revive) {
    if (t.alive) { scene.msg += `\n${t.name} 没有效果`; yield 0.5; return; }
    t.alive = true; t.hp = Math.max(1, Math.floor(t.maxHp * sp.revive)); t.status = {};
    scene.fx.add('heal', ...scene.center(t)); audio.sfx('heal'); scene.msg += `\n${t.name} 复活了！`; yield 0.7; return;
  }
  if (sp.heal) {
    scene.fx.add('heal', ...scene.center(t)); audio.sfx('heal');
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + F.healAmount(sp.power, actor, rng));
    scene.popup(t, String(t.hp - before), '#9ecf7a');
    scene.msg += `\n${t.name} 恢复了 ${t.hp - before} HP`; yield 0.6; return;
  }
  if (sp.cure) {
    const r = cureStatus(t, sp.cure); scene.fx.add('heal', ...scene.center(t)); audio.sfx('heal');
    scene.msg += r.length ? `\n${t.name} 的${r.join('、')}治好了` : `\n${t.name} 没有效果`; yield 0.6; return;
  }
  if (sp.status && !sp.power) { // 纯状态魔法（催眠 / 防护）
    scene.fx.add(STATUS[sp.status].buff ? 'heal' : 'spark', ...scene.center(t)); audio.sfx(STATUS[sp.status].buff ? 'heal' : 'magic');
    const ok = inflict(scene, t, sp.status);
    scene.msg += ok ? `\n${t.name} ${STATUS[sp.status].buff ? '获得了' : ''}${STATUS[sp.status].name}${STATUS[sp.status].buff ? '' : '了'}` : `\n${t.name} 没有效果`;
    yield 0.7; return;
  }
  // veil：特效期间目标画成半透明，像**隔着火焰/雷光看过去**。
  // 时长跟特效同步（属性魔法 1.2s，其余 0.3s），由 BattleScene.update 递减。
  veilOn(t, scene.fx.add(ELEMENT_FX[sp.element] || 'spark', ...scene.center(t), scene.size(t)),
         ELEMENT_TINT[sp.element]);
  audio.sfx(ELEMENT_SFX[sp.element] || 'hit');
  // 属性魔法的结算卡在**目标被火吞掉的那一刻**（render.js 的 VEIL 表，进度 0.55 上下），
  // 也就是这场戏的高点。0.25 那会儿火才刚聚拢，伤害数字先跳出来、火后到，像两件事。
  yield ELEMENT_FX[sp.element] ? 0.9 : 0.25;
  const r = F.magicDamage(sp.power, actor, t, sp.element, rng);
  scene.damage(t, r.damage);
  if (r.mult > 1) scene.msg += '\n效果拔群！'; else if (r.mult === 0) scene.msg += '\n完全无效…'; else if (r.mult < 1) scene.msg += '\n效果不佳…';
  // 0.75：让火烧完最后那一段（吞没 → 退去 → 目标重新现身）再往下走。
  // 提前切走的话玩家最后看到的是「怪不见了」，下一句消息才把它带回来
  scene.msg += `\n${t.name} 受到 ${r.damage} 伤害`; yield ELEMENT_FX[sp.element] ? 0.75 : 0.6;
  if (!t.alive) { scene.msg += `\n${t.name} 倒下了`; yield 0.4; return; }
  if (sp.status && r.mult > 0 && inflict(scene, t, sp.status)) { scene.msg += `\n${t.name} ${STATUS[sp.status].name}了`; yield 0.5; }
}

// ---------- 請神（童乩的 summon 指令）----------
//
// 八位一律 target:'enemy' + scope:'all'，所以结算骨架就是 spellVolley 那一套：
// **所有目标同时演**、伤害数字由各自头上的 popup 交代、消息窗只留总结句。
// 召唤多出来的三件事是：段数（hits，每段独立掷）、pierce（不吃魔防）、
// 以及我方那一侧的附带效果（ally* 字段，排在演出的尾巴上）。
//
// **焦点坐标**：主焦点是敌群中心 (74,96)（ENEMY_CENTERS 的正中）；
// 演出重心在我方的三位（伯公 / 观世音 / 妈祖，在 summonFxAlly.js）传队伍中心 (212,88)。
// 归哪一边不在这里另抄一份名单——问 FX_ALLY 本身，它就是那个名单。
const ENEMY_FOCUS = [74, 96], ALLY_FOCUS = [212, 88];

// 结算卡在演出的哪一段（占 dur 的比例）。单段是 0.60——
// 关圣帝君头上写着「结算要卡在劈的那一下（p≈0.56）」，就是这个位置；
// 多段的把 0.60→0.90 平均切成 hits 份，落点正好压在中坛元帅三下乾坤圈（≈.52/.65/.78）
// 与义民爷六道刀光（.63…89）上。三段就要看得出是三下，所以**不要合并成一次结清**。
const settleAt = (i, hits) => 0.60 + i * (0.30 / hits);

function* callSummon(scene, actor, a) {
  const data = scene.game.data, rng = scene.rng;
  const s = data.summons?.[a.summonId];
  if (!s) return;
  // 一场战斗每尊只能请一次。BattleScene 在构造时建这个 Set，
  // 这里的 ||= 只是给不带它的调用方（测试的假场景）兜底。
  const used = scene.summonsUsed || (scene.summonsUsed = new Set());
  if (s.once && used.has(a.summonId)) { scene.msg = `${s.name} 这一场已经来过了`; audio.sfx('buzz'); yield 0.6; return; }
  const known = availableSummons(actor.member, data).find(k => k.id === a.summonId);
  if (!known) { scene.msg = `${actor.name} 请不动 ${s.name}`; audio.sfx('buzz'); yield 0.6; return; }
  const { power, mp } = skillScale(s, known.skillLevel);
  if (actor.mp < mp) { scene.msg = `${actor.name} 的 MP 不足！`; audio.sfx('buzz'); yield 0.6; return; }
  const targets = scene.alive(scene.enemies);
  if (!targets.length) { scene.msg = `${actor.name} 請下了 ${s.name}！\n没有对象`; yield 0.6; return; }

  actor.mp -= mp;
  if (s.once) used.add(a.summonId);
  const learn = useSkill(actor.member, a.summonId);

  // 起手：和施法同一个动作（脚下浮起光环，不前冲），光环取这一位的属性色
  scene.msg = `${actor.name} 請下了 ${s.name}！`;
  scene.fx.add('cast', ...scene.center(actor), { color: ELEMENT_COLOR[s.element] || '#c9a8e8' });
  audio.sfx('magic'); yield 0.5;

  // 神到：一发全屏演出，敌方全体同时被笼罩——veil 时长直接取特效自己的 dur，
  // 和普通魔法走同一个 veilOn，不另起一套（见 render.js 的 VEIL 表）
  const [fx, fy] = FX_ALLY[s.fx] ? ALLY_FOCUS : ENEMY_FOCUS;
  const show = scene.fx.add(s.fx, fx, fy);
  const dur = show ? show.dur : 1.8;
  for (const t of targets) veilOn(t, show, ELEMENT_TINT[s.element]);
  audio.sfx(s.sfx || ELEMENT_SFX[s.element] || 'hit');
  scene.msg += `\n${s.skill}！`;

  const hits = s.hits || 1;
  let best = 1, worst = 1, at = 0;
  for (let i = 0; i < hits; i++) {
    const p = settleAt(i, hits);
    yield dur * (p - at); at = p;
    for (const t of targets) {
      if (!t.alive) continue;
      const r = F.magicDamage(power, actor, t, s.element, rng, { pierce: !!s.pierce });
      scene.damage(t, r.damage);
      best = Math.max(best, r.mult); worst = Math.min(worst, r.mult);
    }
  }
  if (best > 1) scene.msg += '\n效果拔群！'; else if (worst === 0) scene.msg += '\n完全无效…';
  // 不带前缀的 status 永远指**敌方**（钟馗的黑暗）。这里照旧掷 75%，
  // 跟毒雾那一类同一条路——必中的只有下面我方那一侧
  if (s.status) for (const t of targets) if (t.alive) inflict(scene, t, s.status);

  // 收尾：把演出的最后那一段走完。我方那一侧的效果本来就排在尾巴上
  // （关圣帝君「护」在 .64–1、伯公「净/墙」在 .48–1），所以先等再发
  yield dur * (1 - at);
  yield* summonAlly(scene, actor, s);
  if (s.drain === 'mp' && actor.mp > 0) {   // 吕布：请他不讲情分，一箭出去 MP 见底
    actor.mp = 0; scene.popup(actor, 'MP', '#7fb0e8');
    scene.msg += `\n${actor.name} 身上的 MP 空了`; yield 0.6;
  }
  const downed = targets.filter(t => !t.alive).map(t => t.name);
  if (downed.length) { scene.msg += `\n${downed.join('、')} 倒下了`; yield 0.5; }
  if (learn?.leveled) { scene.msg += `\n${s.name} 请得更顺了`; yield 0.5; }
}

// 我方那一侧的附带效果。字段一律 ally 开头（不带前缀的 status 指敌方，这条不含糊）。
// 一句话交代全队、不逐个报：消息窗只显示最后 4 行，四个人各一行会把绝招名挤掉。
function* summonAlly(scene, actor, s) {
  const rng = scene.rng, party = scene.party;
  if (s.allyRevive) {                        // 妈祖：全场唯一的团体复活
    const back = [];
    for (const p of party) {
      if (p.alive) continue;
      p.alive = true; p.hp = Math.max(1, Math.floor(p.maxHp * s.allyRevive)); p.status = {};
      scene.fx.add('heal', ...scene.center(p)); back.push(p.name);
    }
    if (back.length) { audio.sfx('heal'); scene.msg += `\n${back.join('、')} 站起来了！`; yield 0.7; }
  }
  if (s.allyHeal) {                          // 走 healAmount，和治疗魔法同一条公式
    let sum = 0;
    for (const p of scene.alive(party)) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + F.healAmount(s.allyHeal, actor, rng));
      if (p.hp > before) { scene.popup(p, String(p.hp - before), '#9ecf7a'); sum += p.hp - before; }
    }
    if (sum) { audio.sfx('heal'); scene.msg += `\n全队恢复了 ${sum} HP`; yield 0.6; }
  }
  if (s.allyMpHeal) {                        // 定值，不掷骰
    let sum = 0;
    for (const p of scene.alive(party)) {
      const before = p.mp;
      p.mp = Math.min(p.maxMp, p.mp + s.allyMpHeal);
      if (p.mp > before) { scene.popup(p, String(p.mp - before), '#8fb9a8'); sum += p.mp - before; }
    }
    if (sum) { scene.msg += `\n全队恢复了 ${sum} MP`; yield 0.6; }
  }
  if (s.allyCure) {
    const names = [];
    for (const p of scene.alive(party)) if (cureStatus(p, s.allyCure).length) names.push(p.name);
    if (names.length) { audio.sfx('heal'); scene.msg += `\n${names.join('、')} 清干净了`; yield 0.6; }
  }
  if (s.allyStatus) {                        // 必中（见 inflict 的 chance 覆盖）
    let n = 0;
    for (const p of scene.alive(party)) if (inflict(scene, p, s.allyStatus, 1)) n++;
    if (n) { audio.sfx('heal'); scene.msg += `\n全队${STATUS[s.allyStatus].name}了`; yield 0.6; }
  }
}
