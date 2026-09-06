// 菜单共用绘制：队伍面板、信息面板、光标步进
import { drawWindow, drawDivider, drawGauge, drawHighlight, UI } from '../ui/Window.js';
import { drawText, measure, wrapText, LINE_H } from '../core/text.js';
import { drawCursor } from '../ui/Menu.js';
import { computeStats } from '../game/party.js';
import { drawStatusIcons } from './icons.js';
import { artW, artH } from '../core/draw.js';

export const PARTY_W = 176, ROW_H = 52; // 行高要放得下 48 高的角色图，否则会显得被切掉

// 按整数倍放大画精灵（逻辑尺寸），高度不超过 maxH，底部对齐在 y + maxH
export function drawSprite(ctx, img, x, y, maxH) {
  const iw = artW(img), ih = artH(img);
  const s = Math.max(1, Math.floor(maxH / ih)), w = iw * s, h = ih * s;
  ctx.drawImage(img, Math.round(x + (maxH - w) / 2), Math.round(y + maxH - h), w, h);
}

// 「当前/上限」这类数值：上限暗、当前亮，整组右对齐到 right。
// 先量出「/上限」多宽再把当前值贴着它右对齐——四个人的数字这样才会落在同一条竖线上，
// 而不是像 `HP 92/92  MP 0/0` 那样各排各的。
export function drawRatio(ctx, cur, max, right, y, color) {
  const tail = `/${max}`;
  drawText(ctx, tail, right, y, { align: 'right', color: UI.dim });
  drawText(ctx, String(cur), right - measure(ctx, tail), y, { align: 'right', color });
}

// 菜单里的角色小像：慢慢转一圈，顺带一点待机动作。
// 原本四个人一律画 `_down_0` 杵在那不动，而有的职业「正面」画得偏侧，
// 于是看起来是「一个侧面三个正面」。改成让他们**同步**转——
// 不同步的话任一瞬间又会是各朝各的，等于没修。
//
// 时间用挂钟：菜单几个场景各自独立、没有共享的 dt 累加器，
// 而这只影响渲染，不进逻辑也不进存档，自动试玩同步步进时它几乎不动，不影响可复现性。
const TURN = ['down', 'left', 'up', 'right'];   // 转向顺序：正面 → 左 → 背面 → 右
const HOLD = 1.15;                              // 每个朝向停 1.15 秒，转一圈约 4.6 秒
const STEP_AT = 0.72;                           // 一个朝向内过了 72% 就抬脚，转身才不是硬切
const BOB_T = 2.6;                              // 轻微起伏的周期

export function portrait(game, jobId) {
  const t = performance.now() / 1000;
  const k = t / HOLD;
  const dir = TURN[Math.floor(k) % TURN.length];
  const phase = k % 1;
  // 快要换向的那段时间踏一步：偶数圈迈左脚、奇数圈迈右脚，肩和手跟着动
  const frame = phase > STEP_AT ? (Math.floor(k) % 2 ? 2 : 1) : 0;
  const img = game.sprites[`${jobId}_${dir}_${frame}`] || game.sprites[`${jobId}_down_0`];
  const bob = Math.sin(t * (2 * Math.PI / BOB_T)) > 0.6 ? -1 : 0;   // 1px，慢
  return { img, bob };
}

export function drawPartyPanel(ctx, game, { x = 0, y = 0, w = PARTY_W, h = 224, cursor = -1 } = {}) {
  drawWindow(ctx, x, y, w, h);
  game.state.party.forEach((m, i) => {
    const s = computeStats(m, game.data), job = game.data.jobs[m.jobId];
    const ry = y + 8 + i * ROW_H, dead = m.hp <= 0;
    if (i) drawDivider(ctx, x + 8, ry - 5, w - 16); // 人与人之间刻一道线，四行才不会糊成一片
    // 选中整行铺底（画在精灵之前，免得把角色也染上金色），箭头只负责指位置
    if (cursor === i) { drawHighlight(ctx, x + 5, ry - 2, w - 10, 48); drawCursor(ctx, x + 6, ry + 20); }
    const po = portrait(game, m.jobId);
    drawSprite(ctx, po.img, x + 6, ry + po.bob, 48); // 完整一格，不再被下一行挤掉
    const tx = x + 46, right = x + w - 8, ty = ry + 2; // 文字整体在图右侧
    const col = dead ? UI.gray : UI.text;
    // 第一行：名字（亮）+ 职业（暗、右对齐）。职业是补充信息，不该和名字抢
    drawText(ctx, m.name, tx, ty, { color: col });
    drawText(ctx, job.name, right, ty, { align: 'right', color: dead ? UI.gray : UI.dim });
    // 第二行：等级 + 状态异常。状态用图标不用「中毒」这样的汉字标签：
    // 一个标签 24px，这一行总共只有 60px，两个异常就顶到右边的职业名上去了
    drawText(ctx, 'Lv', tx, ty + LINE_H, { color: UI.dim });
    drawText(ctx, String(m.level), tx + 18, ty + LINE_H, { color: col });
    drawStatusIcons(ctx, m.status, tx + 44, ty + LINE_H);
    // 第三行：HP / MP 分两栏，数字右对齐到固定竖线；下面各压一条 3px 横条，
    // 「还剩多少」一眼就看得出，不用先读完两个数字再心算。
    const y3 = ty + LINE_H * 2, hpR = tx + 56, mpX = tx + 66, gy = ry + 42;
    if (dead) { drawText(ctx, '失去声音', tx, y3, { color: UI.gray }); return; }
    const low = m.hp * 4 <= s.maxHp; // 濒死：不到四分之一，标签和数字一起转告警色
    drawText(ctx, 'HP', tx, y3, { color: low ? UI.danger : UI.dim });
    drawRatio(ctx, m.hp, s.maxHp, hpR, y3, low ? UI.danger : col);
    drawGauge(ctx, tx, gy, hpR - tx, m.hp / s.maxHp, low ? UI.danger : UI.good);
    if (s.maxMp > 0) {
      drawText(ctx, 'MP', mpX, y3, { color: UI.dim });
      drawRatio(ctx, m.mp, s.maxMp, right, y3, col);
      drawGauge(ctx, mpX, gy, right - mpX, m.mp / s.maxMp, UI.cool);
    } else drawText(ctx, 'MP —', mpX, y3, { color: UI.gray }); // 拳头师/山猎人本来就没 MP，画个空槽会被当成 bug
  });
}

export function drawInfoPanel(ctx, game, x, y, w, h) {
  drawWindow(ctx, x, y, w, h);
  const st = game.state, t = Math.floor(st.playTime || 0);
  const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  // 钱是唯一会让人做决定的数字，给它暗金；步数和时间只是记录，用主色就够
  [['金币', `${st.gold} G`, UI.accent], ['步数', String(st.steps), UI.text], ['时间', time, UI.text]]
    .forEach(([k, v, c], i) => {
      drawText(ctx, k, x + 8, y + 8 + i * LINE_H, { color: UI.dim });
      drawText(ctx, v, x + w - 8, y + 8 + i * LINE_H, { align: 'right', color: c });
    });
}

export function drawTextBlock(ctx, text, x, y, w, opts = {}) {
  wrapText(ctx, text, w).forEach((l, i) => drawText(ctx, l, x, y + i * LINE_H, opts));
}

export function stepCursor(input, idx, n) {
  if (n <= 0) return 0;
  if (input.repeatPressed('up')) idx = (idx + n - 1) % n;
  else if (input.repeatPressed('down')) idx = (idx + 1) % n;
  return idx;
}
