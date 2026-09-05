// 战斗场景：FF1/3 式回合制指令战斗。
// 调度器同时支持 'turn'（回合制）和 'atb'（FF5 式时间槽），由 data/config.json 的 battleMode 切换。
import { drawText, wrapText, LINE_H } from '../core/text.js';
import { Menu, drawCursor } from '../ui/Menu.js';
import { audio } from '../core/audio.js';
import { makePartyActors, makeEnemyActors } from './actors.js';
import { decideEnemyAction } from './ai.js';
import * as F from './formulas.js';
import { Effects } from './effects.js';
import { PANEL_Y, PANEL_H, LEFT_W, ENEMY_CENTERS, PARTY_X, PARTY_Y0, PARTY_DY, drawBackground, drawPanels, drawEnemyList, drawPartyStatus } from './hud.js';
import { grantExp } from '../game/party.js';
import { countItem, removeItem, applyItem, canUseOn, describeUse } from '../game/items.js';

const CMD = { attack: '攻击', magic: '魔法', defend: '防御', item: '道具', flee: '逃跑' };
const MSG_LINES = 4;
const ELEMENT_FX = { fire: 'fire', thunder: 'thunder' };

export class BattleScene {
  constructor(game, enemyIds, opts = {}) {
    this.game = game;
    this.transparent = false; this.bgm = 'battle';
    this.mode = game.data.config.battleMode || 'turn';
    this.party = makePartyActors(game.state, game.data);
    this.enemies = makeEnemyActors(enemyIds, game.data);
    this.canFlee = opts.canFlee !== false;
    this.phase = 'intro'; this.timer = 0.5; this.time = 0;
    this.msg = ''; this.popups = []; this.fx = new Effects(game.rngFx);
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
    this.time += dt;
    this.fx.update(dt);
    this.popups = this.popups.filter(p => (p.t -= dt) > 0);
    for (const a of this.all) { if (a.flash > 0) a.flash -= dt; if (a.lunge > 0) a.lunge -= dt; if (a.dying > 0) a.dying -= dt; }
    switch (this.phase) {
      case 'intro': if ((this.timer -= dt) <= 0) this.phase = 'idle'; break;
      case 'idle': this.updateIdle(dt); break;
      case 'input': this.updateInput(input); break;
      case 'acting': this.runCo(dt, input); break;
    }
  }

  updateIdle(dt) {
    if (this.actionQueue.length) { this.beginAction(this.actionQueue.shift()); return; }
    if (this.mode === 'turn') {
      if (!this.inputQueue.length && !this.pending.length) this.inputQueue = this.alive(this.party); // 新回合
      if (this.inputQueue.length) { this.beginInput(this.inputQueue.shift()); return; }
      // 全员下令完毕 → 敌人决策 → 按速度排序
      const acts = this.pending; this.pending = [];
      for (const e of this.alive(this.enemies)) {
        const d = decideEnemyAction(e, this.enemies, this.party, this.game.data, this.rng);
        if (d) acts.push({ actor: e, ...d });
      }
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
        if (a.side === 'party') this.inputQueue.push(a);
        else { const d = decideEnemyAction(a, this.enemies, this.party, this.game.data, this.rng); if (d) this.actionQueue.push({ actor: a, ...d }); }
      }
      if (this.inputQueue.length) this.beginInput(this.inputQueue.shift());
    }
  }

  // ---------- 玩家下令 ----------
  beginInput(actor) {
    if (!actor.alive) return;
    this.current = actor; this.phase = 'input'; this.openMain();
  }
  menuAt(items, onSelect, onCancel) { return new Menu({ items, x: 0, y: PANEL_Y, w: LEFT_W, h: PANEL_H, onSelect, onCancel }); }
  openMain() {
    this.sub = 'main'; this.target = null;
    const items = this.current.commands.map(c => ({ label: CMD[c] || c, value: c, disabled: (c === 'flee' && !this.canFlee) || (c === 'item' && !this.battleItems().length) }));
    this.menu = this.menuAt(items, it => this.onCommand(it.value), () => this.onCancelMain());
  }
  onCancelMain() {
    // 回合制：取消 = 回到上一个角色重新下令（FF 传统）
    if (this.mode === 'turn' && this.pending.length) { const prev = this.pending.pop(); this.inputQueue.unshift(this.current); this.beginInput(prev.actor); }
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
    const items = a.spells.map(id => ({ label: sp[id].name, value: id, right: sp[id].mp, disabled: a.mp < sp[id].mp }));
    if (!items.length) items.push({ label: '（没有魔法）', disabled: true });
    this.sub = 'magic'; this.target = null;
    this.menu = this.menuAt(items, it => {
      const s = sp[it.value];
      this.openTarget(s.target === 'ally' ? 'party' : 'enemy', t => this.commit({ type: 'magic', spellId: it.value, target: t }), () => this.openMagic());
    }, () => this.openMain());
  }
  battleItems() { return this.game.state.inventory.filter(s => this.game.data.items[s.id]?.battle); }
  openItems() {
    const data = this.game.data;
    const items = this.battleItems().map(s => ({ label: data.items[s.id].name, value: s.id, right: `×${s.qty}` }));
    this.sub = 'item'; this.target = null;
    this.menu = this.menuAt(items, it => {
      const revive = !!data.items[it.value].effect?.revive;
      const list = this.party.filter(p => revive ? !p.alive : p.alive);
      if (list.length) this.openTargetList(list, t => this.commit({ type: 'item', itemId: it.value, target: t }), () => this.openItems());
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
  beginAction(action) { this.startCo(this.execute(action), () => this.afterAction(action)); }
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

  *execute(a) {
    const actor = a.actor;
    if (!actor.alive) return;
    actor.defending = false;
    if (a.type === 'defend') { actor.defending = true; this.msg = `${actor.name} 摆出防御姿态`; audio.sfx('cursor'); yield 0.6; return; }
    if (a.type === 'flee') {
      this.msg = `${actor.name} 试图逃跑…`; yield 0.6;
      const ps = this.alive(this.party), es = this.alive(this.enemies);
      const avg = ps.reduce((s, p) => s + p.spd, 0) / ps.length, mx = Math.max(...es.map(e => e.spd));
      if (this.canFlee && this.rng.chance(F.fleeChance(avg, mx))) { this.msg = '成功逃走了！'; this.escaped = true; audio.sfx('flee'); }
      else { this.msg = '没能逃掉！'; audio.sfx('buzz'); }
      yield 0.8; return;
    }
    if (a.type === 'item') {
      const it = this.game.data.items[a.itemId], t = a.target;
      if (!countItem(this.game.state.inventory, a.itemId)) { this.msg = `${it.name} 已经用完了`; yield 0.6; return; }
      this.msg = `${actor.name} 使用了 ${it.name}！`; actor.lunge = 0.3; yield 0.4;
      if (!canUseOn(it, t)) { this.msg += '\n没有效果'; audio.sfx('buzz'); yield 0.6; return; }
      removeItem(this.game.state.inventory, a.itemId);
      const out = applyItem(it, t);
      this.fx.add(out?.revived ? 'heal' : 'spark', ...this.center(t)); audio.sfx(out?.revived ? 'heal' : 'item');
      if (out?.hp) this.popup(t, String(out.hp), '#7cfc7c');
      if (out?.mp) this.popup(t, String(out.mp), '#7cc4ff');
      this.msg += '\n' + describeUse(it, t.name, out); yield 0.8;
      return;
    }
    const t = this.retarget(a.target);
    if (!t) return;
    if (a.type === 'attack') {
      this.msg = `${actor.name} 的攻击！`; actor.lunge = 0.3; yield 0.3;
      const r = F.physicalAttack(actor, t, this.rng);
      if (r.miss) { this.popup(t, 'MISS', '#ddd'); audio.sfx('miss'); this.msg += '\n没有命中'; yield 0.7; return; }
      this.fx.add('slash', ...this.center(t)); audio.sfx(r.crit ? 'crit' : 'hit');
      this.damage(t, r.damage);
      this.msg += `\n${r.hits} 次命中${r.crit ? '  会心一击！' : ''}\n${t.name} 受到 ${r.damage} 伤害`;
      yield 0.8;
      if (!t.alive) { this.msg += `\n${t.name} 倒下了`; yield 0.5; }
      return;
    }
    if (a.type === 'magic') {
      const sp = this.game.data.spells[a.spellId];
      if (actor.mp < sp.mp) { this.msg = `${actor.name} 的 MP 不足！`; audio.sfx('buzz'); yield 0.6; return; }
      actor.mp -= sp.mp;
      this.msg = `${actor.name} 施放了 ${sp.name}！`; actor.lunge = 0.3; audio.sfx('magic'); yield 0.4;
      if (sp.heal) {
        this.fx.add('heal', ...this.center(t)); audio.sfx('heal');
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + F.healAmount(sp.power, actor, this.rng));
        this.popup(t, String(t.hp - before), '#7cfc7c');
        this.msg += `\n${t.name} 恢复了 ${t.hp - before} HP`; yield 0.8;
      } else {
        const fxName = ELEMENT_FX[sp.element] || 'spark';
        this.fx.add(fxName, ...this.center(t)); audio.sfx(ELEMENT_FX[sp.element] || 'hit');
        yield 0.25;
        const r = F.magicDamage(sp.power, actor, t, sp.element, this.rng);
        this.damage(t, r.damage);
        if (r.mult > 1) this.msg += '\n效果拔群！'; else if (r.mult === 0) this.msg += '\n完全无效…'; else if (r.mult < 1) this.msg += '\n效果不佳…';
        this.msg += `\n${t.name} 受到 ${r.damage} 伤害`; yield 0.8;
        if (!t.alive) { this.msg += `\n${t.name} 倒下了`; yield 0.5; }
      }
    }
  }

  damage(t, dmg) {
    t.hp = Math.max(0, t.hp - dmg); t.flash = 0.3;
    if (t.side === 'party') this.fx.shake(0.2);
    this.popup(t, String(dmg), t.side === 'party' ? '#ffb0b0' : '#fff');
    if (t.hp <= 0) { t.alive = false; if (t.side === 'enemy') t.dying = 0.5; }
  }
  popup(t, text, color) {
    const [x, y, w] = this.actorRect(t);
    this.popups.push({ x: x + w / 2, y: y - 6, text, color, t: 0.9 });
  }

  *victoryCo() {
    this.bgm = null; this.won = true; audio.sfx('victory');
    this.msg = '胜利！'; yield 1.0;
    const exp = this.enemies.reduce((s, e) => s + e.exp, 0), gold = this.enemies.reduce((s, e) => s + e.gold, 0);
    const alive = this.alive(this.party);
    const share = this.game.data.config.expSplit ? Math.floor(exp / alive.length) : exp;
    this.game.state.gold += gold;
    this.msg = `获得 ${share} 经验值\n获得 ${gold} 金币`; yield 'confirm';
    for (const a of alive) {
      this.syncMember(a);
      for (const g of grantExp(a.member, share, this.game.data)) {
        a.level = g.level; a.hp = a.member.hp; a.mp = a.member.mp; audio.sfx('levelup');
        this.msg = `${a.name} 升到了 ${g.level} 级！\nHP 最大值 +${g.hpUp}  MP 最大值 +${g.mpUp}`; yield 'confirm';
      }
    }
  }
  *defeatCo() { this.bgm = null; audio.sfx('defeat'); this.msg = '全军覆没…'; yield 1.4; this.msg = '全军覆没…\n\n（按确认键重新开始）'; yield 'confirm'; }

  syncMember(a) { a.member.hp = a.hp; a.member.mp = a.mp; }
  finish() {
    for (const a of this.party) this.syncMember(a);
    this.game.fadeTo(() => this.game.scenes.pop());
  }

  // ---------- 渲染 ----------
  actorRect(a) {
    if (a.side === 'party') {
      const i = this.party.indexOf(a);
      return [PARTY_X - (this.current === a ? 6 : 0), PARTY_Y0 + i * PARTY_DY, 16, 16];
    }
    const i = this.enemies.indexOf(a), spr = this.game.sprites['enemy_' + a.sprite];
    const [cx, cy] = ENEMY_CENTERS[i] || ENEMY_CENTERS[0];
    return [Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2), spr.width, spr.height];
  }
  lungeOffset(a) { return a.lunge > 0 ? Math.round(10 * Math.sin((0.3 - a.lunge) / 0.3 * Math.PI)) : 0; }
  blinking(a) { return a.flash > 0 && Math.floor(a.flash * 30) % 2 === 0; }

  render(ctx) {
    const { W } = this.game;
    const [sx, sy] = this.fx.offset();
    ctx.save(); ctx.translate(sx, sy);
    drawBackground(ctx, W);
    for (const e of this.enemies) {
      if (!e.alive && !(e.dying > 0)) continue;
      if (this.blinking(e)) continue;
      const [x, y] = this.actorRect(e);
      if (!e.alive) { ctx.globalAlpha = Math.max(0, e.dying / 0.5); ctx.drawImage(this.game.sprites['enemy_' + e.sprite], x, y + Math.round((0.5 - e.dying) * 8)); ctx.globalAlpha = 1; continue; }
      ctx.drawImage(this.game.sprites['enemy_' + e.sprite], x + this.lungeOffset(e), y);
    }
    for (const p of this.party) {
      if (this.blinking(p)) continue;
      const [x, y] = this.actorRect(p);
      const bob = (this.current === p || (this.won && p.alive)) && Math.floor(this.time * 4) % 2 ? 1 : 0;
      const key = p.alive ? `${p.jobId}_left_${bob}` : `${p.jobId}_downed`;
      ctx.drawImage(this.game.sprites[key], x - this.lungeOffset(p), y - (this.won && p.alive ? bob * 2 : 0));
    }
    this.fx.render(ctx);
    if (this.phase === 'input' && this.sub === 'target') {
      const t = this.target.list[this.target.idx];
      const [x, y, w, h] = this.actorRect(t);
      drawCursor(ctx, x - 9, y + h / 2 - 3);
      drawText(ctx, t.name, x + w / 2, y - 12, { align: 'center', color: '#ffe66d' });
    }
    for (const p of this.popups) {
      const q = 1 - p.t / 0.9, dy = q < 0.35 ? -18 * Math.sin(q / 0.35 * Math.PI / 2) : -18 + (q - 0.35) * 12;
      drawText(ctx, p.text, p.x, p.y + Math.round(dy), { color: p.color, align: 'center' });
    }
    ctx.restore();
    drawPanels(ctx, W);
    if (this.phase === 'input' && this.menu) this.menu.render(ctx, { window: false });
    else if (this.msg) wrapText(ctx, this.msg, LEFT_W - 16).slice(-MSG_LINES).forEach((l, i) => drawText(ctx, l, 8, PANEL_Y + 8 + i * LINE_H));
    else drawEnemyList(ctx, this);
    drawPartyStatus(ctx, this);
  }
  debugInfo() { return `战斗 ${this.mode} ${this.phase}/${this.sub || ''}`; }
}
