// 战斗场景：FF1/3 式回合制指令战斗（流程与 UI）。行动执行见 actions.js，画面绘制见 render.js。
// 调度器同时支持 'turn'（回合制）和 'atb'（FF5 式时间槽），由 config.json 的 battleMode 或 state.settings.battleMode 切换。
import { Menu } from '../ui/Menu.js';
import { audio } from '../core/audio.js';
import { makePartyActors, makeEnemyActors } from './actors.js';
import { decideEnemyAction } from './ai.js';
import { decideAutoAction } from './autoBattle.js';
import { execute } from './actions.js';
import { Effects } from './effects.js';
import { PANEL_Y, PANEL_H, LEFT_W } from './hudBits.js';
import { makeBackdrop } from './backdrop.js';
import { actorRect, renderBattle, INTRO_T, DYING_T } from './render.js';
import { settleVictory } from './victory.js';
import { autoHeal } from '../game/autoheal.js';
import { canUseOn } from '../game/items.js';
import { iconGap } from '../menu/icons.js';
// 童乩的「請神」：请得动谁、这一位这次多少 MP，全问数据层，战斗里不重新判一遍。
import { availableSummons, skillScale } from '../game/jobskill.js';
// 战技：会哪几招、冷却走到哪了、放得起放不起，全问数据层（game/battleskill.js）
import { memberSkills, cooldownOf, hpCost, skillReady, tickCooldowns } from '../game/battleskill.js';

const CMD = { attack: '攻击', skill: '战技', magic: '魔法', summon: '請神', defend: '防御', item: '道具', flee: '逃跑' };

// 請神菜单的条目：这个角色**当前**请得动的几位，请过的 / 请不起的灰掉。
// 谁请得动由 availableSummons 决定（职业等级那一道闸在数据层），这里只叠两件
// 战斗自己才知道的事：MP 够不够、这一场是不是已经请过了（summons.json 的 once）。
//
// 抽成纯函数是为了**测得到**：BattleScene 要画布、要音频、要战斗背景，headless 起不来，
// 而「列出哪几位、哪几位该灰掉」恰恰是这段里最该有测试的一块。
export function summonItems(actor, data, used = new Set(), gap = '') {
  return availableSummons(actor.member, data).map(({ id, skillLevel }) => {
    const s = data.summons[id], { mp } = skillScale(s, skillLevel);
    return { label: gap + s.name, value: id, right: mp,
      disabled: actor.mp < mp || (s.once && used.has(id)) };
  });
}

// 战技菜单的条目：这个角色**当前**会的几招，冷却没走完 / 血不够拼的灰掉。
// 右栏写的是代价：还要缓几回合 ＞ 要放多少血 ＞ 什么都不要（'—'）。
// **写得极短是有原因的**：指令窗只有 LEFT_W-4 宽，右栏是右对齐贴着边画的，
// 「七星步」这种三字招式配上「HP 12」会直接顶到一起（实机上看过）。
// 一个字的前缀刚好留得出空隙，也不必猜那个数字是血还是蓝。
// 抽成纯函数的理由同 summonItems——BattleScene 要画布要音频，headless 起不来。
export function skillItems(actor, data, gap = '') {
  return memberSkills(actor.member, data).map(id => {
    const sk = data.skills[id], wait = cooldownOf(actor, id), cost = hpCost(sk, actor);
    return { label: gap + sk.name, value: id,
      right: wait ? `缓${wait}` : cost ? `血${cost}` : '—',
      disabled: !skillReady(actor, id, sk) };
  });
}

export class BattleScene {
  constructor(game, enemyIds, opts = {}) {
    this.game = game;
    this.transparent = false; this.bgm = opts.bgm || 'battle'; this.opts = opts;
    this.mode = game.state.settings?.battleMode || game.data.config.battleMode || 'turn';
    // 自动战斗：设置里可开关，默认关。战斗中按取消键也能随时切换（见 update）
    this.autoBattle = !!(game.state.settings?.autoBattle ?? game.data.config.autoBattle);
    this.party = makePartyActors(game.state, game.data);
    this.enemies = makeEnemyActors(enemyIds, game.data);
    this.canFlee = opts.canFlee !== false;
    this.phase = 'intro'; this.timer = INTRO_T; this.time = 0;
    this.result = null; this.loot = null; this.card = null; this.resultAt = 0; // 胜利结算屏 / 战利品卡 / 升级卡（见 victoryCo）
    this.msg = ''; this.popups = []; this.fx = new Effects(game.rngFx);
    // 按地形选战斗背景。随机细节（星星、钟乳石…）在这里一次性掷定，render 只读——
    // 每帧重掷会让整片背景变成雪花。
    this.backdrop = makeBackdrop(game, opts);
    this.pending = [];      // turn 模式：本回合已下达、未执行的指令
    this.inputQueue = [];   // 等待玩家下令的角色
    this.actionQueue = [];  // 待执行的行动
    this.current = null; this.menu = null; this.sub = null; this.target = null;
    this.co = null; this.coDone = null; this.wait = 0;
    this.escaped = false; this.won = false;
    // 請神：一场战斗每尊只能请一次（summons.json 的 once）。战斗结束就跟着场景一起丢掉，
    // 所以它不进 game.state——下一场又是干净的一张桌子。
    this.summonsUsed = new Set();
  }
  get rng() { return this.game.rng; }
  get all() { return [...this.party, ...this.enemies]; }
  alive(list) { return list.filter(a => a.alive); }

  // ---------- 主循环 ----------
  update(dt) {
    const input = this.game.input;
    // 战斗中随时按 Tab/Q 切换自动战斗——打到一半发现形势不对想接手，
    // 不该逼玩家退出去改设置。开的那一刻如果正等着下令，就把这一手也交给 AI。
    if (input.justPressed('map')) {
      this.autoBattle = !this.autoBattle;
      this.game.state.settings = { ...(this.game.state.settings || {}), autoBattle: this.autoBattle };
      audio.sfx('confirm');
      this.msg = this.autoBattle ? '自动战斗：开' : '自动战斗：关';
      if (this.autoBattle && this.phase === 'input' && this.current) { const a = this.current; this.current = null; this.beginInput(a); }
    }
    this.time += dt;
    this.fx.update(dt);
    this.popups = this.popups.filter(p => (p.t -= dt) > 0);
    for (const a of this.all) { if (a.flash > 0) a.flash -= dt; if (a.lunge > 0) a.lunge -= dt; if (a.dying > 0) a.dying -= dt; }
    for (const a of this.all) if (a.veil > 0) a.veil -= dt;   // 被魔法笼罩：见 render.js 的半透明处理
    switch (this.phase) {
      // 登场演出按确认可跳过：自动试玩靠连按确认推战斗，任何演出都不能是「只能等」
      case 'intro': if ((this.timer -= dt) <= 0 || input.justPressed('confirm')) this.phase = 'idle'; break;
      case 'idle': this.updateIdle(dt); break;
      case 'input': this.updateInput(input); break;
      case 'acting': this.runCo(dt, input); break;
    }
  }

  enemyDecision(e) {
    if (e.status.sleep) return { actor: e, type: 'sleep' };
    const d = decideEnemyAction(e, this.enemies, this.party, this.game.data, this.rng);
    return d ? { actor: e, ...d } : null;
  }
  updateIdle(dt) {
    if (this.actionQueue.length) { this.beginAction(this.actionQueue.shift()); return; }
    if (this.mode === 'turn') {
      if (!this.inputQueue.length && !this.pending.length) { // 新回合：睡着的人自动跳过
        for (const p of this.alive(this.party)) { if (p.status.sleep) this.pending.push({ actor: p, type: 'sleep' }); else this.inputQueue.push(p); }
      }
      if (this.inputQueue.length) { this.beginInput(this.inputQueue.shift()); return; }
      // 全员下令完毕 → 敌人决策 → 按速度排序
      const acts = this.pending; this.pending = [];
      for (const e of this.alive(this.enemies)) { const d = this.enemyDecision(e); if (d) acts.push(d); }
      for (const a of acts) a.prio = (a.type === 'flee' ? 1000 : 0) + (a.type === 'defend' ? 500 : 0) + a.actor.spd + this.rng.int(0, 4);
      acts.sort((a, b) => b.prio - a.prio);
      this.actionQueue = acts;
    } else {
      const rate = this.game.data.config.atbRate || 6;
      for (const a of this.alive(this.all)) {
        if (a.queued) continue;
        a.atb = Math.min(100, a.atb + a.spd * rate * dt);
        if (a.atb < 100) continue;
        a.queued = true;
        if (a.status.sleep) this.actionQueue.push({ actor: a, type: 'sleep' });
        else if (a.side === 'party') this.inputQueue.push(a);
        else { const d = this.enemyDecision(a); if (d) this.actionQueue.push(d); }
      }
      if (this.inputQueue.length) this.beginInput(this.inputQueue.shift());
    }
  }

  // ---------- 玩家下令 ----------
  beginInput(actor) {
    if (!actor.alive) return;
    // 战技的冷却走一格。**放在这里而不是行动执行时**：回合制里四个人先一起下令、
    // 之后才依次执行，在执行时才减的话菜单上永远显示上一回合的数字，
    // 「缓 3 回合」读起来会变成 4 回合。beginInput 在两种模式下都是每人每回合恰好一次。
    // 睡着的人不经过这里，也就不走格——睡过去的那一回合本来就什么都没恢复。
    tickCooldowns(actor);
    this.current = actor;
    // 自动战斗：替玩家下这一手。决策模块返回的指令跟手动下的完全同形，
    // 所以直接走 commit，不需要为它开第二条执行路径。
    // 决策不掷骰（期望值估算），所以同一局面永远给同一手，自动试玩的路线仍可复现。
    if (this.autoBattle) {
      const act = decideAutoAction(actor, this.party, this.enemies, this.game.data, this.game.state.inventory || [], this.summonsUsed);
      if (act) { this.phase = 'input'; this.commit(act); return; }
    }
    this.phase = 'input'; this.openMain();
  }
  // 指令窗：rowH 12 / pad 6，五条指令一次全露出来。原本是 LINE_H(13) + pad 8，
  // 一屏只放得下 4 条——会魔法的三个职业「逃跑」被卷到看不见的地方，玩家得先往下滚才知道还能不能跑。
  // FF6 的指令窗从不滚动。x 往右挪 2、w 收窄 4 是为了补回缩小的 pad，
  // 让文字与选中底落在和从前一模一样的位置（否则选中底会压到窗框的米色内线上）。
  menuAt(items, onSelect, onCancel) { return new Menu({ items, x: 2, y: PANEL_Y, w: LEFT_W - 4, h: PANEL_H, rowH: 12, pad: 6, onSelect, onCancel }); }
  openMain() {
    this.sub = 'main'; this.target = null;
    const items = this.current.commands.map(c => ({ label: CMD[c] || c, value: c, disabled: (c === 'flee' && !this.canFlee) || (c === 'item' && !this.battleItems().length) }));
    this.menu = this.menuAt(items, it => this.onCommand(it.value), () => this.onCancelMain());
  }
  onCancelMain() {
    // 回合制：取消 = 回到上一个（没睡着的）角色重新下令（FF 传统）
    if (this.mode !== 'turn') return;
    const i = this.pending.map(p => p.type !== 'sleep').lastIndexOf(true);
    if (i < 0) return;
    const prev = this.pending.splice(i, 1)[0]; this.inputQueue.unshift(this.current); this.beginInput(prev.actor);
  }
  onCommand(cmd) {
    if (cmd === 'attack') this.openTarget('enemy', t => this.commit({ type: 'attack', target: t }), () => this.openMain());
    else if (cmd === 'defend') this.commit({ type: 'defend' });
    else if (cmd === 'flee') this.commit({ type: 'flee' });
    else if (cmd === 'skill') this.openSkill();
    else if (cmd === 'magic') this.openMagic();
    else if (cmd === 'summon') this.openSummon();
    else if (cmd === 'item') this.openItems();
  }
  // 八位一律 target:'enemy' + scope:'all'，所以选完不必再选目标，直接下令。
  openSummon() {
    const items = summonItems(this.current, this.game.data, this.summonsUsed, iconGap());
    if (!items.length) items.push({ label: '（请不动谁）', disabled: true });
    this.sub = 'summon'; this.target = null;
    this.menu = this.menuAt(items, it => this.commit({ type: 'summon', summonId: it.value, target: 'all' }), () => this.openMain());
  }
  // 全体的（踏罡 / 扫山）与只对自己的（开脸）选完直接下令，其余才去挑目标
  openSkill() {
    const a = this.current, data = this.game.data;
    const items = skillItems(a, data, iconGap());
    if (!items.length) items.push({ label: '（没有战技）', disabled: true });
    this.sub = 'skill'; this.target = null;
    this.menu = this.menuAt(items, it => {
      const sk = data.skills[it.value], act = t => this.commit({ type: 'skill', skillId: it.value, target: t });
      if (sk.target === 'self') act(a);
      else if (sk.scope === 'all') act('all');
      else this.openTarget('enemy', act, () => this.openSkill());
    }, () => this.openMain());
  }
  openMagic() {
    const a = this.current, sp = this.game.data.spells;
    const gap = iconGap();
    const items = a.spells.map(id => ({ label: gap + sp[id].name, value: id, right: sp[id].mp, disabled: a.mp < sp[id].mp }));
    if (!items.length) items.push({ label: '（没有魔法）', disabled: true });
    this.sub = 'magic'; this.target = null;
    this.menu = this.menuAt(items, it => {
      const s = sp[it.value], act = t => this.commit({ type: 'magic', spellId: it.value, target: t });
      if (s.scope === 'all') act('all');
      else if (s.revive) { const dead = this.party.filter(p => !p.alive); if (dead.length) this.openTargetList(dead, act, () => this.openMagic()); else audio.sfx('buzz'); }
      else this.openTarget(s.target === 'ally' ? 'party' : 'enemy', act, () => this.openMagic());
    }, () => this.openMain());
  }
  battleItems() { return this.game.state.inventory.filter(s => this.game.data.items[s.id]?.battle); }
  openItems() {
    const data = this.game.data;
    const gap = iconGap();
    const items = this.battleItems().map(s => ({ label: gap + data.items[s.id].name, value: s.id, right: `×${s.qty}` }));
    this.sub = 'item'; this.target = null;
    this.menu = this.menuAt(items, it => {
      const item = data.items[it.value], list = this.party.filter(p => canUseOn(item, p));
      if (list.length) this.openTargetList(list, t => this.commit({ type: 'item', itemId: it.value, target: t }), () => this.openItems());
      else audio.sfx('buzz');
    }, () => this.openMain());
  }
  openTarget(side, cb, back) { this.openTargetList(this.alive(side === 'enemy' ? this.enemies : this.party), cb, back); }
  openTargetList(list, cb, back) { this.sub = 'target'; this.target = { list, idx: 0, cb, back }; }
  updateInput(input) {
    if (this.sub === 'target') {
      const t = this.target, n = t.list.length;
      if (input.repeatPressed('up') || input.repeatPressed('left')) { t.idx = (t.idx + n - 1) % n; audio.sfx('cursor'); }
      else if (input.repeatPressed('down') || input.repeatPressed('right')) { t.idx = (t.idx + 1) % n; audio.sfx('cursor'); }
      if (input.justPressed('confirm')) { audio.sfx('confirm'); t.cb(t.list[t.idx]); }
      else if (input.justPressed('cancel')) { audio.sfx('cancel'); t.back(); }
      return;
    }
    this.menu?.update(input);
  }
  commit(action) {
    const full = { actor: this.current, ...action };
    this.menu = null; this.sub = null; this.target = null; this.current = null;
    if (this.mode === 'turn') this.pending.push(full); else this.actionQueue.push(full);
    this.phase = 'idle';
  }

  // ---------- 行动执行（协程：yield 秒数 或 'confirm'） ----------
  startCo(gen, onDone) { this.co = gen; this.coDone = onDone; this.wait = 0; this.phase = 'acting'; }
  runCo(dt, input) {
    if (this.wait === 'confirm') {
      if (input.justPressed('confirm') || input.justPressed('cancel')) this.wait = 0; else return;
    } else if (this.wait > 0) {
      this.wait -= dt * (input.isDown('confirm') ? 3 : 1); // 按住确认加速
      if (this.wait > 0) return;
    }
    const r = this.co.next();
    if (r.done) { const f = this.coDone; this.co = this.coDone = null; f?.(); }
    else this.wait = r.value ?? 0;
  }
  beginAction(action) { this.startCo(execute(this, action), () => this.afterAction(action)); }
  afterAction(action) {
    action.actor.atb = 0; action.actor.queued = false;
    if (this.escaped) { this.finish(); return; }
    if (!this.alive(this.enemies).length) { this.startCo(this.victoryCo(), () => this.finish()); return; }
    if (!this.alive(this.party).length) { this.startCo(this.defeatCo(), () => this.game.fadeTo(() => this.game.gameOver())); return; }
    this.msg = ''; this.phase = 'idle';
  }
  retarget(t) {
    if (t.alive) return t;
    const pool = this.alive(t.side === 'enemy' ? this.enemies : this.party);
    return pool.length ? this.rng.pick(pool) : null;
  }
  center(a) { const [x, y, w, h] = actorRect(this, a); return [x + w / 2, y + h / 2]; }
  // 目标的画面尺寸。魔法特效要**按目标大小**来演——同一团火罩在史莱姆和罩在
  // боss 身上不能一样大，小怪会被淹掉、大怪则只烧到肚子。传给 fx.add 当 opts。
  size(a) { const [, , w, h] = actorRect(this, a); return { w, h }; }

  damage(t, dmg, { physical = false, crit = false } = {}) {
    t.hp = Math.max(0, t.hp - dmg); t.flash = 0.3;
    // 震屏幅度跟着伤害占最大 HP 的比例走：擦破皮不该跟快被打死一样晃
    if (t.side === 'party') this.fx.shake(0.12 + Math.min(0.28, dmg / Math.max(1, t.maxHp) * 0.9));
    this.popup(t, String(dmg), t.side === 'party' ? '#e0a090' : '#fff', crit);
    if (physical && t.status.sleep) { delete t.status.sleep; this.popup(t, '醒了', '#90caf9'); }
    if (t.hp <= 0) {
      t.alive = false; t.status = {};
      // 敌人倒下：溶解 + 往上飘的灰烬。FF6 的怪是碎掉/化掉的，不是整张图淡出去
      if (t.side === 'enemy') { t.dying = DYING_T; this.fx.add('motes', ...this.center(t)); }
    }
  }
  popup(t, text, color, big = false) {
    const [x, y, w] = actorRect(this, t);
    this.popups.push({ x: x + w / 2, y: y - 6, text, color, big, t: 0.9 });
  }

  // 胜利演出：胜利姿势 + 专属短曲 → 一屏结算 → 战利品卡 → 每个升级的人一张升级卡。
  // 原本是在左下角那个 112×72 的小面板里滚三行字，和「捡到一瓶药水」同一个框、同一种语气，
  // 而且要连按四五次确认（经验、每件掉落、每人每一级各一次）才回得到地图。
  // 全程用 yield 'confirm' 推进，所以自动试玩连按确认就能走完，不会卡住。
  *victoryCo() {
    this.bgm = null; this.won = true; audio.jingle('fanfare');
    this.msg = '打赢了！'; yield 1.5;      // 先让雀跃和短曲的头一句走完，再谈钱
    const { result, cards } = settleVictory(this);
    this.result = result; this.resultAt = this.time;
    yield 'confirm';
    // 掉落多于一件时单开一页列清楚（乌火一次掉五件，结算屏那一行放不下）
    if (result.items.length > 1) { this.loot = result.items; audio.sfx('item'); yield 'confirm'; this.loot = null; }
    for (const c of cards) { this.card = c; audio.sfx('levelup'); yield 'confirm'; }
    this.card = null;
  }
  *defeatCo() { this.bgm = null; audio.sfx('defeat'); this.msg = '声音都没了…'; yield 1.4; this.msg = '声音都没了…\n\n（按确认键重新开始）'; yield 'confirm'; }

  // **战斗结算后异常状态一律清空**（总监硬性规定）。
  // 原本用 persistentOnly 留下中毒这类「持续型」，让它带进大地图继续掉血——
  // 那是折磨玩家，不是难度：大地图上没有解毒的即时手段，玩家只能一边走一边看血条掉，
  // 而这段时间里他什么决策都做不了。难度该在战斗里给，不该在跑图时收利息。
  syncMember(a) { a.member.hp = a.hp; a.member.mp = a.mp; a.member.status = {}; }
  finish() {
    // 胜利短曲的音符是提前排进 Web Audio 的：玩家一路按确认冲过结算屏时，
    // 尾音会压在地图 BGM 上。退场时把它淡掉（等得完的人照样听得到整首）。
    audio.stopJingle();
    for (const a of this.party) this.syncMember(a);
    if (this.won) autoHeal(this.game);
    if (this.won && this.opts.winFlag) this.game.state.flags[this.opts.winFlag] = true;
    this.game.fadeTo(() => this.game.scenes.pop());
  }

  // 整屏怎么画全在 render.js（见那个文件的头注）。这里只留一个入口：
  // 把 scene 交出去，render 依旧只读状态。
  render(ctx) { renderBattle(this, ctx); }
  debugInfo() { return `战斗 ${this.mode} ${this.phase}/${this.sub || ''}`; }
}
