// 战斗场景：FF1/3 式回合制指令战斗（流程与 UI）。行动执行见 actions.js。
// 调度器同时支持 'turn'（回合制）和 'atb'（FF5 式时间槽），由 config.json 的 battleMode 或 state.settings.battleMode 切换。
import { drawText, measure, LINE_H } from '../core/text.js';
import { Menu, drawCursor } from '../ui/Menu.js';
import { UI } from '../ui/Window.js';
import { audio } from '../core/audio.js';
import { makePartyActors, makeEnemyActors } from './actors.js';
import { decideEnemyAction } from './ai.js';
import { decideAutoAction } from './autoBattle.js';
import { execute } from './actions.js';
import { Effects } from './effects.js';
import { PANEL_Y, PANEL_H, LEFT_W, ENEMY_CENTERS, PARTY_X, PARTY_Y0, PARTY_DY, makeBackdrop, drawBackground, drawPanels, drawEnemyList, drawPartyStatus } from './hud.js';
import { settleVictory, renderResult, renderLootCard, renderLevelCard } from './victory.js';
import { canUseOn } from '../game/items.js';
import { persistentOnly } from '../game/status.js';
import { drawArt, artW, artH, tintedSprite, ART } from '../core/draw.js';
import { layersFor, itemIcon } from '../assets/equip.js';
import { drawMenuIcons, spellIcon, iconGap } from '../menu/icons.js';

const CMD = { attack: '攻击', magic: '魔法', defend: '防御', item: '道具', flee: '逃跑' };
const MSG_LINES = 4;
const CHEER_T = 2.6; // 胜利雀跃一个来回的秒数。全项目的规矩是动效周期 ≥1.5 秒
// 敌人登场：滑入 + 聚拢成形，按确认可跳过。转场期间场景是冻结的（Game.update 里 transitioning 就不 update），
// 所以这段只能等遇敌淡入那 0.45 秒走完才开始——收在 0.7 秒，免得「空场地」看着太久
const INTRO_T = 0.7;
const DYING_T = 0.7; // 敌人溶解消失

// 战斗讯息断行。core 的 wrapText 是逐字断的（中文没空格），碰上数字就会把
// 「魔神仔 受到 541 伤害」断成「…受到 54」+「1 伤害」——伤害数字被劈成两半。
// 这里把连续的半角字符（数字、MISS、HP）当成一个不可分的词，其余仍旧逐字断。
function wrapMsg(ctx, text, maxW) {
  const out = []; let cur = '';
  for (const tk of text.match(/[!-~]+|[\s\S]/g) || []) {
    if (tk === '\n') { out.push(cur); cur = ''; }
    else if (cur && measure(ctx, cur + tk) > maxW) { out.push(cur); cur = tk === ' ' ? '' : tk; }
    else cur += tk;
  }
  if (cur) out.push(cur);
  return out;
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
    this.current = actor;
    // 自动战斗：替玩家下这一手。决策模块返回的指令跟手动下的完全同形，
    // 所以直接走 commit，不需要为它开第二条执行路径。
    // 决策不掷骰（期望值估算），所以同一局面永远给同一手，自动试玩的路线仍可复现。
    if (this.autoBattle) {
      const act = decideAutoAction(actor, this.party, this.enemies, this.game.data, this.game.state.inventory || []);
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
    else if (cmd === 'magic') this.openMagic();
    else if (cmd === 'item') this.openItems();
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
  center(a) { const [x, y, w, h] = this.actorRect(a); return [x + w / 2, y + h / 2]; }

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
    const [x, y, w] = this.actorRect(t);
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

  syncMember(a) { a.member.hp = a.hp; a.member.mp = a.mp; a.member.status = persistentOnly(a.status); }
  finish() {
    // 胜利短曲的音符是提前排进 Web Audio 的：玩家一路按确认冲过结算屏时，
    // 尾音会压在地图 BGM 上。退场时把它淡掉（等得完的人照样听得到整首）。
    audio.stopJingle();
    for (const a of this.party) this.syncMember(a);
    if (this.won && this.opts.winFlag) this.game.state.flags[this.opts.winFlag] = true;
    this.game.fadeTo(() => this.game.scenes.pop());
  }

  // ---------- 渲染 ----------
  actorRect(a) {
    if (a.side === 'party') {
      const i = this.party.indexOf(a), spr = this.game.sprites[`${a.jobId}_left_0`];
      return [PARTY_X - (this.current === a ? 6 : 0), PARTY_Y0 + i * PARTY_DY + 16 - artH(spr), artW(spr), artH(spr)];
    }
    const i = this.enemies.indexOf(a), spr = this.game.sprites['enemy_' + a.sprite];
    const [cx, cy] = ENEMY_CENTERS[i] || ENEMY_CENTERS[0];
    return [Math.round(cx - artW(spr) / 2), Math.round(cy - artH(spr) / 2), artW(spr), artH(spr)];
  }
  lungeOffset(a) { return a.lunge > 0 ? Math.round(10 * Math.sin((0.3 - a.lunge) / 0.3 * Math.PI)) : 0; }
  // 受击表现：原本是 `Math.floor(flash*30)%2` 隔帧不画——每秒让人消失 15 次，
  // 那是频闪不是打击感，而且被打的那零点几秒里根本看不清挨打的是谁。
  // 改成整体染色：先闪白（像被打出的高光），迅速转红，再褪回本色。全程不消失。
  hitTint(a) {
    if (!(a.flash > 0)) return null;
    const k = a.flash / 0.3;                    // 1 → 0
    if (k > 0.62) return '#ffffff';
    if (k > 0.28) return '#ff6a5a';
    return null;
  }
  // 画一个可能正在受击的精灵：染色版画完再叠一层原图，保留一点本来的明暗层次
  drawHit(ctx, img, x, y, tint) {
    drawArt(ctx, img, x, y);
    if (tint) { ctx.globalAlpha = tint === '#ffffff' ? 0.85 : 0.6; drawArt(ctx, tintedSprite(img, tint), x, y); ctx.globalAlpha = 1; }
  }
  // 敌人登场进度 0→1。每只错开 0.08 秒依次现身：整队一起冒出来没有层次，也看不清有几只。
  enterP(e) {
    if (this.phase !== 'intro') return 1;
    return Math.max(0, Math.min(1, (INTRO_T - this.timer - this.enemies.indexOf(e) * 0.07) / 0.48));
  }
  // 溶解：把精灵按 2 逻辑像素一条横切开，每条的显隐阈值由行号定死（不掷骰——渲染消耗随机数
  // 会让同一场战斗每次画得不一样）。vis=1 全在、vis=0 全没；死亡 1→0，登场 0→1，一进一出同一套语汇。
  drawDissolve(ctx, img, x, y, vis) {
    const step = 2 * ART, rows = Math.ceil(img.height / step);
    for (let r = 0; r < rows; r++) {
      const k = Math.abs(Math.sin(r * 12.9898 + 1.7) * 43758.5453) % 1;  // 打散的阈值：像碎掉，不像拉幕
      if (vis <= k * 0.9) continue;
      const sh = Math.min(step, img.height - r * step);
      ctx.drawImage(img, 0, r * step, img.width, sh, x, y + r * 2, artW(img), sh / ART);
    }
  }

  // 敌人待机浮动：全静止的怪看起来是贴纸，FF6 的怪都在很轻微地「呼吸」。
  // 只有 ±1 逻辑像素、周期 2.6–3.0 秒，并按队列序号错开相位与周期——
  // 一起同步上下会立刻变成「在抖」，这里宁可含蓄到几乎看不出来。
  // 受击时（flash > 0）冻结：sprite 本来就在忽隐忽现，再动就成了闪。死亡另有下沉动画。
  idleBob(e) {
    if (!e.alive || e.flash > 0) return 0;
    const i = this.enemies.indexOf(e);
    return Math.round(Math.sin(this.time * (Math.PI * 2) / (2.6 + (i % 3) * 0.2) + i * 0.9));
  }
  // 濒死：HP 不到四分之一。FF6 会换成喘息的濒死姿势，我们只有站立帧，
  // 就用 1–2 像素的缓慢下沉（2 秒一个来回）来表示「站不太住了」，配合面板的告警色。
  // 胜利雀跃时不下沉：两个位移叠在一起会互相抵消，看起来只像跳得不齐。
  faintSink(p) {
    if (!p.alive || this.won || p.hp * 4 > p.maxHp) return 0;
    const i = this.party.indexOf(p);
    return 1 + Math.round(0.5 + 0.5 * Math.sin(this.time * Math.PI + i * 1.3));
  }
  // 胜利雀跃：原本是 `Math.floor(time*3)%2 ? 2 : 0`——每 1/3 秒硬切一次的 2px 方波，
  // 一个来回只要 0.67 秒，是全项目最快的一个周期，而这个项目被抱怨最多的就是画面在闪。
  // 改成 2.6 秒一个来回的正弦（和敌人待机呼吸同一个量级），振幅收到 1px，
  // 并按队列序号错开相位，四个人依次起落像一道波——
  // 同时跳等于整块画面在上下抖，错开之后才读得出「四个人各自在高兴」。
  cheerHop(p) {
    if (!this.won || !p.alive) return 0;
    const i = this.party.indexOf(p);
    return Math.round(Math.max(0, Math.sin(this.time * (Math.PI * 2) / CHEER_T - i * (Math.PI / 2))));
  }

  render(ctx) {
    const { W } = this.game;
    const [sx, sy] = this.fx.offset();
    ctx.save(); ctx.translate(sx, sy);
    drawBackground(ctx, W, this.backdrop, this.time);
    for (const e of this.enemies) {
      if (!e.alive && !(e.dying > 0)) continue;
      const [x, y] = this.actorRect(e);
      const spr = this.game.sprites['enemy_' + e.sprite];
      // 倒下：逐条溶解 + 略微下沉，最后剩的几条整体淡掉。从前是整张图淡出，读起来像「贴纸被撕走」
      if (!e.alive) {
        const k = Math.max(0, e.dying / DYING_T);
        ctx.globalAlpha = Math.min(1, k * 2.2);
        this.drawDissolve(ctx, spr, x, y + Math.round((1 - k) * 4), k);
        ctx.globalAlpha = 1; continue;
      }
      const p = this.enterP(e);
      if (p <= 0) continue;                    // 还没轮到这只现身
      if (p < 1) {                             // 登场：从画面外侧滑进来，同时逐条聚拢成形
        ctx.globalAlpha = Math.min(1, p * 1.6);
        this.drawDissolve(ctx, spr, x - Math.round(14 * (1 - p) ** 2), y, p);
        ctx.globalAlpha = 1; continue;
      }
      this.drawHit(ctx, spr, x + this.lungeOffset(e), y + this.idleBob(e), this.hitTint(e));
    }
    for (const p of this.party) {
      const [x, y] = this.actorRect(p);
      // 轮到谁行动，actorRect 已经把他往前挪了 6px，不必再换帧。
      // 原本每秒换 4 次走路帧：站着打架却在原地踏步，而且有几个职业的站立帧与迈步帧朝向
      // 根本不一致（拳头师、符仔仙的「侧面」其实画成了正面），切起来像换了个人在闪。
      // 胜利时的雀跃改成整体上下跳，同样不换帧。
      const cheer = this.cheerHop(p);
      const key = p.alive ? `${p.jobId}_left_0` : `${p.jobId}_downed`;
      const dx = x - this.lungeOffset(p), dy = y - cheer + this.faintSink(p);
      const tint = this.hitTint(p);
      this.drawHit(ctx, this.game.sprites[key], dx, dy, tint);
      if (p.alive) for (const g of layersFor(p.member, 'left')) this.drawHit(ctx, g, dx, dy, tint); // 装备叠加也一起闪
    }
    this.fx.render(ctx);
    if (this.phase === 'input' && this.sub === 'target') {
      const t = this.target.list[this.target.idx];
      const [x, y, w, h] = this.actorRect(t);
      drawCursor(ctx, x - 9, y + h / 2 - 3);
      // 目标名字压一块暗底再写：光标会指到草地、岩壁、星空上，加阴影的字在浅色地面上还是会糊。
      // 底下那道暗金线和光标、选中底同色，说的是同一件事：「现在指的是这个」
      const nx = Math.round(x + w / 2), ny = y - 13, hw = Math.round(measure(ctx, t.name) / 2) + 3;
      ctx.fillStyle = 'rgba(8,16,12,0.82)'; ctx.fillRect(nx - hw, ny - 1, hw * 2, 13);
      ctx.fillStyle = 'rgba(230,196,106,0.5)'; ctx.fillRect(nx - hw, ny + 12, hw * 2, 1);
      drawText(ctx, t.name, nx, ny, { align: 'center', color: UI.accent });
    }
    for (const p of this.popups) {
      const q = 1 - p.t / 0.9, dy = q < 0.35 ? -18 * Math.sin(q / 0.35 * Math.PI / 2) : -18 + (q - 0.35) * 12;
      const py = p.y + Math.round(dy);
      // 会心的数字加一圈暗金描边，比普通伤害「重」一点。只是描边，没有任何闪烁
      if (p.big) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, p.text, p.x + ox, py + oy, { align: 'center', color: '#8a5a12', shadow: false });
      drawText(ctx, p.text, p.x, py, { color: p.big ? '#ffe9a8' : p.color, align: 'center' });
    }
    ctx.restore();
    drawPanels(ctx, W);
    if (this.phase === 'input' && this.menu) {
      this.menu.render(ctx, { window: false });
      // 指令窗行高 12，比菜单的 13 矮，图标按 10px 画才不会和上下行贴死。
      // 魔法用属性图标（和打出去的特效同色），道具用和村里菜单同一套道具图标——
      // 战斗中最需要「扫一眼就知道这是什么」的地方，反而一直只有光秃秃的文字。
      const data = this.game.data;
      if (this.sub === 'magic') drawMenuIcons(ctx, this.menu, it => it.value ? spellIcon(data.spells[it.value]) : null, 10);
      else if (this.sub === 'item') drawMenuIcons(ctx, this.menu, it => it.value ? itemIcon(it.value, data.items[it.value]) : null, 10);
    }
    else if (this.msg) wrapMsg(ctx, this.msg, LEFT_W - 16).slice(-MSG_LINES).forEach((l, i) => drawText(ctx, l, 8, PANEL_Y + 8 + i * LINE_H, { color: UI.text }));
    else drawEnemyList(ctx, this);
    drawPartyStatus(ctx, this);
    // 选目标时把指令窗压暗：注意力该在战场上的光标，不在刚才那张菜单。只压内容区、留着窗框，
    // 看起来是「退到后面」而不是「被盖住」。胜利结算屏则铺满整个画面，连面板一起盖掉
    if (this.phase === 'input' && this.sub === 'target') { ctx.fillStyle = 'rgba(6,14,10,0.45)'; ctx.fillRect(5, PANEL_Y + 5, LEFT_W - 10, PANEL_H - 10); }
    if (this.result) renderResult(ctx, this.game, this.result, this.time - this.resultAt, !this.card && !this.loot);
    if (this.loot) renderLootCard(ctx, this.loot);
    if (this.card) renderLevelCard(ctx, this.card);
  }
  debugInfo() { return `战斗 ${this.mode} ${this.phase}/${this.sub || ''}`; }
}
