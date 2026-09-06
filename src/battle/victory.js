// 胜利结算屏与升级卡：只负责画，数据由 BattleScene.victoryCo 结清后传进来。
//
// 为什么单独开一个文件：BattleScene 已经 330 行，这两块加进去必破 400 行的上限。
// 为什么要有这块：原本打赢只是在左下角那个 112×72 的小面板里滚三行字
// （「获得 N 经验值」→「某某升到了 N 级」），和「捡到一瓶药水」用的是同一个框、同一种语气。
// FF6 打赢是一段独立的演出：胜利姿势 + 专属短曲 + 一屏结算（经验、金币、掉落、谁升级了、
// 学会了什么）。这里补的就是那一屏。
import { drawText, wrapText } from '../core/text.js';
import { drawWindow, drawDivider, drawGauge, UI } from '../ui/Window.js';
import { drawArt, artH } from '../core/draw.js';
import { grantExp, computeStats } from '../game/party.js';
import { expForLevel } from './formulas.js';
import { addItem } from '../game/items.js';

// 升级卡要列的属性。全部取自 computeStats，所以装备加成也算在内——
// 玩家在这张卡上看到的数字，和菜单状态页里看到的是同一个。
const LEVEL_STATS = [['HP 最大值', 'maxHp'], ['MP 最大值', 'maxMp'], ['力量', 'str'], ['敏捷', 'agi'],
  ['智力', 'int'], ['体力', 'vit'], ['攻击', 'atk'], ['防御', 'def']];

// 结算：把这一场的账一次算清（金币入袋、掉落入包、经验分完、该升的级升掉），
// 顺便把「要给玩家看什么」整理成两份数据。战斗规则一条都没动：
// 谁分得到经验（只有还站着的人）、分多少（expSplit）、升级怎么算，全是原样。
export function settleVictory(scene) {
  const data = scene.game.data, spells = data.spells;
  const exp = scene.enemies.reduce((s, e) => s + e.exp, 0), gold = scene.enemies.reduce((s, e) => s + e.gold, 0);
  const alive = scene.alive(scene.party);
  const share = data.config.expSplit ? Math.floor(exp / alive.length) : exp;
  scene.game.state.gold += gold;
  const items = [];
  for (const r of scene.opts.reward || []) {   // Boss 掉落
    addItem(scene.game.state.inventory, r.id, r.qty || 1);
    const it = data.items[r.id];
    items.push({ name: it?.name || r.id, qty: r.qty || 1, myth: !!it?.myth });
  }
  const rows = [], cards = [];
  const span = k => Math.max(1, expForLevel(k + 1) - expForLevel(k));
  for (const a of scene.party) {
    const got = a.alive;                       // 倒下的人不分经验：原本的规则，没动
    const before = computeStats(a.member, data), lv0 = a.member.level, exp0 = a.member.exp;
    if (got) scene.syncMember(a);              // 顺序不能动：先把战斗中的 HP/MP 写回，grantExp 才在正确的基数上补血
    const gains = got ? grantExp(a.member, share, data) : [];
    const after = computeStats(a.member, data), lv = a.member.level;
    // 升级后连上限一起换掉。从前只改了 hp/mp 没改 maxHp，
    // 于是升完级的那一瞬间队伍面板会出现「138/120」这种读数
    if (gains.length) { a.level = lv; a.hp = a.member.hp; a.mp = a.member.mp; a.maxHp = after.maxHp; a.maxMp = after.maxMp; }
    rows.push({ name: a.name, jobId: a.jobId, level: lv, dead: !got, leveled: gains.length > 0,
      from: Math.min(1, Math.max(0, (exp0 - expForLevel(lv0)) / span(lv0))),
      to: Math.min(1, Math.max(0, (a.member.exp - expForLevel(lv)) / span(lv))),
      need: Math.max(0, expForLevel(lv + 1) - a.member.exp) });
    if (gains.length) cards.push({ name: a.name, from: lv0, to: lv,
      stats: LEVEL_STATS.filter(([, k]) => k !== 'maxMp' || after.maxMp > 0)
        .map(([label, k]) => ({ label, before: before[k], after: after[k] })),
      learned: gains.flatMap(g => g.learned).map(id => spells[id]?.name || id) });
  }
  return { result: { share, gold, items, rows }, cards };
}

// 结算屏铺满整个画面（只留 4px 边）：这是 FF6 的做法，也是「这一场结束了」的分段号。
// 演出顺序是「先看胜利姿势，再看账单」——所以队伍雀跃那 1.5 秒里这块还没出现。
const WIN = { x: 4, y: 8, w: 248, h: 208 };
const L = WIN.x + 8, R = WIN.x + WIN.w - 8;   // 内容的左右界：12 / 244
const ROW_H = 24;                             // 一个人一行：上排文字 + 下排经验条，正好放得下 24px 高的小像
const BAR_T = 0.9;                            // 经验条填充时长。一次性缓动，不是循环动画

// 经验条：从战前的进度填到战后。升了级的人先填满、归零、再填新的那一截——
// 「条子转了一圈」这件事本身就是升级最直观的说法。整段只发生一次，不循环、不闪。
function expRatio(row, t) {
  const k = Math.min(1, Math.max(0, t) / BAR_T), e = 1 - (1 - k) ** 2;   // ease-out
  if (!row.leveled) return row.from + (row.to - row.from) * e;
  return e < 0.5 ? row.from + (1 - row.from) * (e / 0.5) : row.to * ((e - 0.5) / 0.5);
}

// res:   { share, gold, items:[文本], rows:[{name, jobId, level, leveled, dead, from, to, need}] }
// t:     结算屏出现后经过的秒数（由 BattleScene 用 this.time 算，不另开时钟）
// footer: 上面盖着升级卡时传 false —— 两段字叠在一起会糊成一团
export function renderResult(ctx, game, res, t, footer = true) {
  // 先把整个画面压暗再开窗：不压的话，窗口四周那 4–8px 会露出下面两块面板的边和它们中间的接缝，
  // 看起来像窗口没盖住，而不是「战斗画面退到后面去了」
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 256, 224);
  drawWindow(ctx, WIN.x, WIN.y, WIN.w, WIN.h);
  drawText(ctx, '战  果', 128, WIN.y + 10, { align: 'center', color: UI.paper });
  drawDivider(ctx, L, WIN.y + 26, R - L);

  // 经验与金币并排：两件事一样重要，上下排会显得金币是附注
  const y0 = WIN.y + 34;
  drawText(ctx, '经验值', L + 4, y0, { color: UI.dim });
  drawText(ctx, String(res.share), 122, y0, { align: 'right', color: UI.accent });
  drawText(ctx, '金　币', 134, y0, { color: UI.dim });
  drawText(ctx, String(res.gold), R - 4, y0, { align: 'right', color: UI.accent });
  // 掉落只在这里报个数：乌火一次掉五件，一行一件会顶穿下面的队伍那一栏，
  // 所以多于一件时另开一张战利品卡（renderLootCard），这里只留一句摘要
  if (res.items.length) {
    const one = res.items.length === 1 ? res.items[0] : null;
    drawText(ctx, '拾　得', L + 4, y0 + 16, { color: UI.dim });
    drawText(ctx, one ? `${one.name}${one.qty > 1 ? ' ×' + one.qty : ''}` : `${res.items.length} 件`,
      L + 44, y0 + 16, { color: one?.myth ? UI.accent : UI.text });
  }

  drawDivider(ctx, L, WIN.y + 72, R - L);
  // 四个人贴着底排：结算屏的下缘固定，上面那块（掉落有没有、几件）再怎么变都不会推动这里
  const top = WIN.y + WIN.h - 30 - res.rows.length * ROW_H;
  res.rows.forEach((row, i) => {
    const y = top + i * ROW_H;
    const spr = game.sprites[`${row.jobId}_down_0`];
    if (spr) { ctx.globalAlpha = row.dead ? 0.35 : 1; drawArt(ctx, spr, L + 2, y + ROW_H - 2 - artH(spr)); ctx.globalAlpha = 1; }
    const col = row.dead ? UI.gray : row.leveled ? UI.accent : UI.text;
    drawText(ctx, row.name, L + 26, y, { color: col });
    drawText(ctx, 'Lv', L + 62, y, { color: UI.dim });
    drawText(ctx, String(row.level), L + 78, y, { color: col });
    // 右上角只说一件事：升级了，或者还差多少
    if (row.dead) drawText(ctx, '倒下', R - 4, y, { align: 'right', color: UI.gray });
    else if (row.leveled) drawText(ctx, '升级！', R - 4, y, { align: 'right', color: UI.accent });
    else drawText(ctx, `下一级还差 ${row.need}`, R - 4, y, { align: 'right', color: UI.dim });
    drawGauge(ctx, L + 26, y + 14, R - 4 - (L + 26), row.dead ? 0 : expRatio(row, t), row.leveled ? UI.accent : UI.cool);
  });
  if (footer) drawText(ctx, '按确认键继续', R - 4, WIN.y + WIN.h - 20, { align: 'right', color: UI.dim });
}

// ---- 升级卡 ----
// FF6 升级会明确告诉你「哪一项涨了多少」。原本这里只有一行「HP 最大值 +18  MP 最大值 +3」，
// 力量敏捷智力体力涨没涨、攻击防御变成多少，玩家一概看不到（要退出战斗、开菜单、翻状态页才知道）。
// 所以八项一次列全：涨了的用暗金写差额，没涨的留白但仍列出来——「这级没长力量」也是信息。
const CARD_W = 208, PAD = 8, ROW = 13;

// 卡片的共用外壳：压暗底下那一屏 + 开窗 + 标题行 + 一道分隔线。回传内容区的左右界与起始 y。
// 压暗是为了让卡片成为这一刻唯一的焦点（结算屏还在下面，但退到后面去了）。
function cardShell(ctx, w, h, title, right) {
  const x = Math.round((256 - w) / 2), y = Math.round((224 - h) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, 256, 224);
  drawWindow(ctx, x, y, w, h);
  const l = x + PAD + 2, r = x + w - PAD - 2;
  drawText(ctx, title, l, y + PAD, { color: UI.accent });
  if (right) drawText(ctx, right, r, y + PAD, { align: 'right', color: UI.paper });
  return { l, r, y };
}

// 战利品卡：Boss 一次掉五件神话装备，塞不进结算屏那一行，也不该像从前那样一件一页对话地报。
// 一件一行列清楚，神话装备用暗金标出来——这是打完硬仗最该看清的东西。
export function renderLootCard(ctx, items) {
  const h = PAD + 15 + 6 + items.length * ROW + PAD;
  const { l, r, y } = cardShell(ctx, 200, h, '战利品', `${items.length} 件`);
  let ry = y + PAD + 15;
  drawDivider(ctx, l, ry, r - l); ry += 6;
  for (const it of items) {
    drawText(ctx, it.name, l, ry, { color: it.myth ? UI.accent : UI.text });
    if (it.qty > 1) drawText(ctx, `×${it.qty}`, r, ry, { align: 'right', color: UI.dim });
    else if (it.myth) drawText(ctx, '神话装备', r, ry, { align: 'right', color: UI.good });
    ry += ROW;
  }
}

export function renderLevelCard(ctx, card) {
  const rows = card.stats;
  const learn = card.learned.length ? wrapText(ctx, `学会了 ${card.learned.join('、')}`, CARD_W - PAD * 2 - 8) : [];
  const h = PAD + 15 + 14 + 6 + rows.length * ROW + (learn.length ? 6 + learn.length * ROW : 0) + PAD;
  const { l, r, y } = cardShell(ctx, CARD_W, h, card.name, '升级！');
  drawText(ctx, '等级', l, y + PAD + 15, { color: UI.dim });
  drawText(ctx, `${card.from} → ${card.to}`, r, y + PAD + 15, { align: 'right', color: UI.text });
  let ry = y + PAD + 15 + 14;
  drawDivider(ctx, l, ry, r - l); ry += 6;
  for (const s of rows) {
    const up = s.after - s.before;
    drawText(ctx, s.label, l, ry, { color: up ? UI.text : UI.dim });
    drawText(ctx, String(s.before), r - 74, ry, { align: 'right', color: UI.dim });
    drawText(ctx, '→', r - 70, ry, { color: UI.dim });
    drawText(ctx, String(s.after), r - 30, ry, { align: 'right', color: up ? UI.accent : UI.dim });
    if (up) drawText(ctx, `+${up}`, r, ry, { align: 'right', color: UI.good });
    ry += ROW;
  }
  if (learn.length) {
    drawDivider(ctx, l, ry, r - l); ry += 6;
    for (const line of learn) { drawText(ctx, line, l, ry, { color: UI.good }); ry += ROW; }
  }
}
