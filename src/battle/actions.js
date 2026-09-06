// 战斗行动执行（协程，yield 秒数 或 'confirm'）：攻击 / 魔法 / 道具 / 防御 / 逃跑 / 睡眠，以及行动前的状态处理。
// 由 BattleScene.beginAction 调用；只通过 scene 的 msg / damage / popup / fx / rng 与画面交互。
import * as F from './formulas.js';
import { STATUS, cureStatus } from '../game/status.js';
import { audio } from '../core/audio.js';
import { countItem, removeItem, applyItem, canUseOn, describeUse } from '../game/items.js';

const ELEMENT_FX = { fire: 'fire', thunder: 'thunder', ice: 'ice', poison: 'poison', dark: 'dark' };
const ELEMENT_SFX = { fire: 'fire', thunder: 'thunder', ice: 'magic', poison: 'buzz', dark: 'hit' };

// 附加状态：免疫 / 已有 → false
export function inflict(scene, t, status) {
  const def = STATUS[status];
  if (!def || t.status[status] || !scene.rng.chance(F.statusChance(t, status))) return false;
  t.status[status] = def.turns ? scene.rng.int(def.turns[0], def.turns[1]) : true;
  scene.popup(t, def.name, def.color);
  return true;
}

// 行动前：毒伤害、状态倒计时。返回 false 表示角色已倒下
function* statusPhase(scene, actor) {
  if (actor.status.poison) {
    scene.msg = `${actor.name} 受到毒的侵蚀`; scene.damage(actor, F.poisonDamage(actor.maxHp)); audio.sfx('buzz'); yield 0.6;
    if (!actor.alive) { scene.msg += `\n${actor.name} 倒下了`; yield 0.5; return false; }
  }
  for (const s of ['sleep', 'protect']) {
    if (typeof actor.status[s] !== 'number') continue;
    if (--actor.status[s] > 0) continue;
    delete actor.status[s];
    scene.msg = s === 'sleep' ? `${actor.name} 醒了` : `${actor.name} 的防护消失了`; yield 0.5;
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
const ELEMENT_COLOR = { fire: '#ffb060', thunder: '#ffe98a', ice: '#a8e4ff', dark: '#b28fd0', light: '#fff3c0' };
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
  scene.fx.add(impact, ...scene.center(t), { dir: face });
  if (r.crit) scene.fx.shake(0.18);          // 会心才震，普通命中不震，免得整场都在晃
  audio.sfx(r.crit ? 'crit' : 'hit');
  scene.damage(t, r.damage, { physical: true });
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
  for (const t of targets) yield* spellOn(scene, actor, sp, t);
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
  scene.fx.add(ELEMENT_FX[sp.element] || 'spark', ...scene.center(t)); audio.sfx(ELEMENT_SFX[sp.element] || 'hit');
  yield 0.25;
  const r = F.magicDamage(sp.power, actor, t, sp.element, rng);
  scene.damage(t, r.damage);
  if (r.mult > 1) scene.msg += '\n效果拔群！'; else if (r.mult === 0) scene.msg += '\n完全无效…'; else if (r.mult < 1) scene.msg += '\n效果不佳…';
  scene.msg += `\n${t.name} 受到 ${r.damage} 伤害`; yield 0.6;
  if (!t.alive) { scene.msg += `\n${t.name} 倒下了`; yield 0.4; return; }
  if (sp.status && r.mult > 0 && inflict(scene, t, sp.status)) { scene.msg += `\n${t.name} ${STATUS[sp.status].name}了`; yield 0.5; }
}
