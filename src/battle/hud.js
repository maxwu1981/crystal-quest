// 战斗画面的静态部分：面板、敌人名单、队伍状态栏。
// 背景（那一整套写景）在 backdrop.js，拆分的理由见那个文件的头注。
import { drawText, measure, LINE_H } from '../core/text.js';
import { drawWindow, drawGauge, drawHighlight, UI } from '../ui/Window.js';
import { drawRatio } from '../menu/common.js';
import { statusTags } from '../game/status.js';
import { PANEL_Y, PANEL_H, LEFT_W } from './hudBits.js';

export function drawPanels(ctx, W) {
  drawWindow(ctx, 0, PANEL_Y, LEFT_W, PANEL_H);
  drawWindow(ctx, LEFT_W, PANEL_Y, W - LEFT_W, PANEL_H);
}

export function drawEnemyList(ctx, scene) {
  const groups = new Map();
  for (const e of scene.alive(scene.enemies)) { const n = scene.game.data.enemies[e.enemyId].name; groups.set(n, (groups.get(n) || 0) + 1); }
  let i = 0;
  for (const [n, c] of groups) {
    const y = PANEL_Y + 8 + i++ * LINE_H;
    drawText(ctx, n, 8, y, { color: UI.text });
    if (c > 1) drawText(ctx, `×${c}`, LEFT_W - 8, y, { align: 'right', color: UI.dim }); // 只数几只，是补充信息，别和名字抢
  }
}

// ============ 队伍状态栏 ============
// 和菜单里的队伍面板同一套语汇：数字右对齐到固定竖线、下面压 HP/MP 横条、选中整行铺底。
// 但这块面板只有 144×72，菜单那边光一个人就占 176×52，所以是重新量过的，不是照抄：
//   · 去掉 "HP" / "MP" 字样。两个标签要 28px，而一整组 "188/188" 也才 42px——
//     标签换不来信息量。哪一栏是什么改由颜色和位置说：左边绿条是 HP、右边青条是 MP，
//     顺序与配色都跟菜单一致（UI.good / UI.cool），玩家在菜单里已经学过一次了。
//   · 「轮到谁」从「名字变金」改成菜单那种整行铺底（drawHighlight）。
//     名字的颜色就腾出来专讲濒死，不用再和「轮到谁」抢同一个位置。
//   · 人与人之间不画 drawDivider：一行 14px，再插 2px 分隔线就摆不下四个人；
//     每条横条自带的 1px 暗下沿已经在行与行之间划了一道，够用了。
const ROW_H = 14;   // 12px 字 + 3px 横条 = 15px，压到 14px 才塞得进 72px 的面板。
                    // 少掉的那 1px 是横条的暗下沿与下一行字顶相接，正好当行分隔线用
const BAR_DY = 11;  // 横条相对该行文字的偏移：字的墨迹到 y+10 为止，紧接着起条
const COL_GAP = 6;  // HP 与 MP 两栏之间的留白
// 摆不下所有状态标签时的取舍顺序：先保住「最影响这一回合该怎么下令」的那个。
// （眠＝这回合根本动不了 > 毒＝在掉血 > 盲＝会打空 > 护＝好事，晚一步知道也不亏）
const TAG_PRIO = { 眠: 0, 毒: 1, 盲: 2, 护: 3 };

export function drawPartyStatus(ctx, scene) {
  const W = scene.game?.W || 256;
  const x0 = LEFT_W, left = x0 + 8, right = W - 8;
  const party = scene.party;
  // 四个人共用同一组右对齐竖线——这正是 drawRatio 的用意：数字落在同一条线上，
  // 扫一眼就能比谁血少，而不是像从前那样每行各排各的。
  // 竖线的位置按「全队最宽的那组数字」算出来，所以有人升到三位数 MP 也只是整体左移，
  // 不会某一行突然把别人挤歪（写死 x 就会：一到三位数就串栏）。
  const hpTexts = party.map(p => `${p.hp}/${p.maxHp}`);
  const mpTexts = party.map(p => (p.maxMp > 0 ? `${p.mp}/${p.maxMp}` : '—'));
  const hpW = Math.max(...hpTexts.map(s => measure(ctx, s)));
  const mpW = Math.max(...mpTexts.map(s => measure(ctx, s)));
  const mpR = right, hpR = mpR - mpW - COL_GAP;
  const hpX = hpR - hpW, mpX = mpR - mpW;   // 两栏的左缘 = 两条横条的起点
  const nameEnd = hpX - 4;                  // 名字 + 状态标签的右界
  party.forEach((p, i) => {
    const y = PANEL_Y + 8 + i * ROW_H;
    const dead = !p.alive;
    const low = !dead && p.hp * 4 <= p.maxHp; // 濒死：HP 不到四分之一
    const col = dead ? UI.gray : UI.text;
    const warn = dead ? UI.gray : low ? UI.danger : UI.text;
    // 轮到谁下令：铺整行底色（和菜单选中同一个视觉）。比「名字变金」好认——
    // 名字变金和濒死变红会争同一个像素，铺底则是另一个图层，两件事可以同时说。
    if (scene.current === p) drawHighlight(ctx, x0 + 5, y - 2, W - x0 - 10, 13);
    // 名字：濒死时和 HP 一起转告警色，只有数字变红太容易被漏看
    drawText(ctx, p.name, left, y, { color: warn });
    // 状态标签：按实际量得的宽度往后排，排不下就不排。
    // 从前是固定 8px 步进，而标签是 12px 宽的汉字——两个标签必定互相咬字，还会咬到 HP 那一栏。
    // 名字与标签之间留 3px、标签彼此留 1px：正好够二十级左右的常见宽度塞下两个标签
    // （标签是 12px 的汉字，留 4px 就只剩一个位置了）。标签本来就各有各的颜色，挨紧也分得开。
    let tx = left + measure(ctx, p.name) + 3;
    if (!dead) for (const t of [...statusTags(p.status)].sort((a, b) => (TAG_PRIO[a.short] ?? 9) - (TAG_PRIO[b.short] ?? 9))) {
      const w = measure(ctx, t.short);
      if (tx + w > nameEnd) break;
      drawText(ctx, t.short, tx, y, { color: t.color });
      tx += w + 1;
    }
    // HP / MP：数字右对齐到竖线，横条压在数字正下方、宽度就是那一栏的宽度，
    // 于是「条的长度」和「数字的位置」讲的是同一件事。
    drawRatio(ctx, p.hp, p.maxHp, hpR, y, warn);
    drawGauge(ctx, hpX, y + BAR_DY, hpW, p.hp / p.maxHp, low ? UI.danger : UI.good);
    if (p.maxMp > 0) {
      drawRatio(ctx, p.mp, p.maxMp, mpR, y, col);
      drawGauge(ctx, mpX, y + BAR_DY, mpW, p.mp / p.maxMp, UI.cool);
    } else drawText(ctx, '—', mpR, y, { align: 'right', color: UI.gray }); // 拳头师/山猎人本来就没 MP，画个空槽会被当成 bug
    // ATB 槽：原本是裸的 1px 线，和菜单那边的横条完全是两种东西。换成同一个 drawGauge，
    // 位置就在名字底下、和 HP/MP 条同一条基线。攒满转暗金（＝可以下令了），
    // 和光标、选中底同色，「该我了」全画面用的是同一个颜色。
    if (scene.mode === 'atb' && !dead) drawGauge(ctx, left, y + BAR_DY, nameEnd - left, p.atb / 100, p.atb >= 100 ? UI.accent : UI.cool);
  });
}
