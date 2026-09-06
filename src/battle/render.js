// 战斗画面的绘制：敌我站位、登场 / 受击 / 倒下 / 雀跃的表现，以及把整屏拼起来的 renderBattle。
// 从 BattleScene.js 拆出来——那个文件 431 行，破了项目单文件 400 行的上限，
// 缝就切在它原本第 281 行那道「渲染」横幅上。
//
// 这条缝切得下去，是因为项目铁律第 4 条：render 只读状态、不改状态。
// 横幅底下那一整块对 scene 天然是只读的，所以改成收 `scene` 的自由函数，
// 不可能有状态从别处被改掉。收 `scene` 而不是散参数，和 field/minimap.js 同一个做法：
// 要读的东西太多（party / enemies / phase / timer / time / fx / menu / popups / result…），
// 一个个传反而更难看。
//
// 两处例外，都是有意的：
//   · actorRect 流程侧也要用（damage / popup 得知道挨打的那个人画在哪），
//     所以 BattleScene 保留一个 center(a)，转手调这里的 actorRect(this, a)。它本身只读。
//   · INTRO_T / DYING_T 定义在这里而不是 BattleScene：这两个数说的是「演出多久」，
//     流程那边只是拿它设定时器。由绘制侧定义、流程侧 import，方向是单向的，不绕环。
import { drawText, measure, LINE_H } from '../core/text.js';
import { drawCursor } from '../ui/Menu.js';
import { UI } from '../ui/Window.js';
import { drawArt, artW, artH, tintedSprite, ART } from '../core/draw.js';
import { layersFor, itemIcon } from '../assets/equip.js';
import { drawMenuIcons, spellIcon } from '../menu/icons.js';
import { PANEL_Y, PANEL_H, LEFT_W, ENEMY_CENTERS, PARTY_X, PARTY_Y0, PARTY_DY } from './hudBits.js';
import { drawBackground } from './backdrop.js';
import { drawPanels, drawEnemyList, drawPartyStatus } from './hud.js';
import { renderResult, renderLootCard, renderLevelCard } from './victory.js';

const MSG_LINES = 4;
const CHEER_T = 2.6; // 胜利雀跃一个来回的秒数。全项目的规矩是动效周期 ≥1.5 秒
// 敌人登场：滑入 + 聚拢成形，按确认可跳过。转场期间场景是冻结的（Game.update 里 transitioning 就不 update），
// 所以这段只能等遇敌淡入那 0.45 秒走完才开始——收在 0.7 秒，免得「空场地」看着太久
export const INTRO_T = 0.7;
export const DYING_T = 0.7; // 敌人溶解消失

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

// ---------- 渲染 ----------
export function actorRect(scene, a) {
  if (a.side === 'party') {
    const i = scene.party.indexOf(a), spr = scene.game.sprites[`${a.jobId}_left_0`];
    return [PARTY_X - (scene.current === a ? 6 : 0), PARTY_Y0 + i * PARTY_DY + 16 - artH(spr), artW(spr), artH(spr)];
  }
  const i = scene.enemies.indexOf(a), spr = scene.game.sprites['enemy_' + a.sprite];
  const [cx, cy] = ENEMY_CENTERS[i] || ENEMY_CENTERS[0];
  return [Math.round(cx - artW(spr) / 2), Math.round(cy - artH(spr) / 2), artW(spr), artH(spr)];
}
export function lungeOffset(a) { return a.lunge > 0 ? Math.round(10 * Math.sin((0.3 - a.lunge) / 0.3 * Math.PI)) : 0; }
// 受击表现：原本是 `Math.floor(flash*30)%2` 隔帧不画——每秒让人消失 15 次，
// 那是频闪不是打击感，而且被打的那零点几秒里根本看不清挨打的是谁。
// 改成整体染色：先闪白（像被打出的高光），迅速转红，再褪回本色。全程不消失。
export function hitTint(a) {
  if (!(a.flash > 0)) return null;
  const k = a.flash / 0.3;                    // 1 → 0
  if (k > 0.62) return '#ffffff';
  if (k > 0.28) return '#ff6a5a';
  return null;
}
// 画一个可能正在受击的精灵：染色版画完再叠一层原图，保留一点本来的明暗层次
export function drawHit(ctx, img, x, y, tint) {
  drawArt(ctx, img, x, y);
  if (tint) { ctx.globalAlpha = tint === '#ffffff' ? 0.85 : 0.6; drawArt(ctx, tintedSprite(img, tint), x, y); ctx.globalAlpha = 1; }
}
// 敌人登场进度 0→1。每只错开 0.08 秒依次现身：整队一起冒出来没有层次，也看不清有几只。
export function enterP(scene, e) {
  if (scene.phase !== 'intro') return 1;
  return Math.max(0, Math.min(1, (INTRO_T - scene.timer - scene.enemies.indexOf(e) * 0.07) / 0.48));
}
// 溶解：把精灵按 2 逻辑像素一条横切开，每条的显隐阈值由行号定死（不掷骰——渲染消耗随机数
// 会让同一场战斗每次画得不一样）。vis=1 全在、vis=0 全没；死亡 1→0，登场 0→1，一进一出同一套语汇。
export function drawDissolve(ctx, img, x, y, vis) {
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
export function idleBob(scene, e) {
  if (!e.alive || e.flash > 0) return 0;
  const i = scene.enemies.indexOf(e);
  return Math.round(Math.sin(scene.time * (Math.PI * 2) / (2.6 + (i % 3) * 0.2) + i * 0.9));
}
// 濒死：HP 不到四分之一。FF6 会换成喘息的濒死姿势，我们只有站立帧，
// 就用 1–2 像素的缓慢下沉（2 秒一个来回）来表示「站不太住了」，配合面板的告警色。
// 胜利雀跃时不下沉：两个位移叠在一起会互相抵消，看起来只像跳得不齐。
export function faintSink(scene, p) {
  if (!p.alive || scene.won || p.hp * 4 > p.maxHp) return 0;
  const i = scene.party.indexOf(p);
  return 1 + Math.round(0.5 + 0.5 * Math.sin(scene.time * Math.PI + i * 1.3));
}
// 胜利雀跃：原本是 `Math.floor(time*3)%2 ? 2 : 0`——每 1/3 秒硬切一次的 2px 方波，
// 一个来回只要 0.67 秒，是全项目最快的一个周期，而这个项目被抱怨最多的就是画面在闪。
// 改成 2.6 秒一个来回的正弦（和敌人待机呼吸同一个量级），振幅收到 1px，
// 并按队列序号错开相位，四个人依次起落像一道波——
// 同时跳等于整块画面在上下抖，错开之后才读得出「四个人各自在高兴」。
export function cheerHop(scene, p) {
  if (!scene.won || !p.alive) return 0;
  const i = scene.party.indexOf(p);
  return Math.round(Math.max(0, Math.sin(scene.time * (Math.PI * 2) / CHEER_T - i * (Math.PI / 2))));
}

export function renderBattle(scene, ctx) {
  const { W } = scene.game;
  const [sx, sy] = scene.fx.offset();
  ctx.save(); ctx.translate(sx, sy);
  drawBackground(ctx, W, scene.backdrop, scene.time);
  for (const e of scene.enemies) {
    if (!e.alive && !(e.dying > 0)) continue;
    const [x, y] = actorRect(scene, e);
    const spr = scene.game.sprites['enemy_' + e.sprite];
    // 倒下：逐条溶解 + 略微下沉，最后剩的几条整体淡掉。从前是整张图淡出，读起来像「贴纸被撕走」
    if (!e.alive) {
      const k = Math.max(0, e.dying / DYING_T);
      ctx.globalAlpha = Math.min(1, k * 2.2);
      drawDissolve(ctx, spr, x, y + Math.round((1 - k) * 4), k);
      ctx.globalAlpha = 1; continue;
    }
    const p = enterP(scene, e);
    if (p <= 0) continue;                    // 还没轮到这只现身
    if (p < 1) {                             // 登场：从画面外侧滑进来，同时逐条聚拢成形
      ctx.globalAlpha = Math.min(1, p * 1.6);
      drawDissolve(ctx, spr, x - Math.round(14 * (1 - p) ** 2), y, p);
      ctx.globalAlpha = 1; continue;
    }
    drawHit(ctx, spr, x + lungeOffset(e), y + idleBob(scene, e), hitTint(e));
  }
  for (const p of scene.party) {
    const [x, y] = actorRect(scene, p);
    // 轮到谁行动，actorRect 已经把他往前挪了 6px，不必再换帧。
    // 原本每秒换 4 次走路帧：站着打架却在原地踏步，而且有几个职业的站立帧与迈步帧朝向
    // 根本不一致（拳头师、符仔仙的「侧面」其实画成了正面），切起来像换了个人在闪。
    // 胜利时的雀跃改成整体上下跳，同样不换帧。
    const cheer = cheerHop(scene, p);
    const key = p.alive ? `${p.jobId}_left_0` : `${p.jobId}_downed`;
    const dx = x - lungeOffset(p), dy = y - cheer + faintSink(scene, p);
    const tint = hitTint(p);
    drawHit(ctx, scene.game.sprites[key], dx, dy, tint);
    if (p.alive) for (const g of layersFor(p.member, 'left')) drawHit(ctx, g, dx, dy, tint); // 装备叠加也一起闪
  }
  scene.fx.render(ctx);
  if (scene.phase === 'input' && scene.sub === 'target') {
    const t = scene.target.list[scene.target.idx];
    const [x, y, w, h] = actorRect(scene, t);
    drawCursor(ctx, x - 9, y + h / 2 - 3);
    // 目标名字压一块暗底再写：光标会指到草地、岩壁、星空上，加阴影的字在浅色地面上还是会糊。
    // 底下那道暗金线和光标、选中底同色，说的是同一件事：「现在指的是这个」
    const nx = Math.round(x + w / 2), ny = y - 13, hw = Math.round(measure(ctx, t.name) / 2) + 3;
    ctx.fillStyle = 'rgba(8,16,12,0.82)'; ctx.fillRect(nx - hw, ny - 1, hw * 2, 13);
    ctx.fillStyle = 'rgba(230,196,106,0.5)'; ctx.fillRect(nx - hw, ny + 12, hw * 2, 1);
    drawText(ctx, t.name, nx, ny, { align: 'center', color: UI.accent });
  }
  for (const p of scene.popups) {
    const q = 1 - p.t / 0.9, dy = q < 0.35 ? -18 * Math.sin(q / 0.35 * Math.PI / 2) : -18 + (q - 0.35) * 12;
    const py = p.y + Math.round(dy);
    // 会心的数字加一圈暗金描边，比普通伤害「重」一点。只是描边，没有任何闪烁
    if (p.big) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, p.text, p.x + ox, py + oy, { align: 'center', color: '#8a5a12', shadow: false });
    drawText(ctx, p.text, p.x, py, { color: p.big ? '#ffe9a8' : p.color, align: 'center' });
  }
  ctx.restore();
  drawPanels(ctx, W);
  if (scene.phase === 'input' && scene.menu) {
    scene.menu.render(ctx, { window: false });
    // 指令窗行高 12，比菜单的 13 矮，图标按 10px 画才不会和上下行贴死。
    // 魔法用属性图标（和打出去的特效同色），道具用和村里菜单同一套道具图标——
    // 战斗中最需要「扫一眼就知道这是什么」的地方，反而一直只有光秃秃的文字。
    const data = scene.game.data;
    if (scene.sub === 'magic') drawMenuIcons(ctx, scene.menu, it => it.value ? spellIcon(data.spells[it.value]) : null, 10);
    else if (scene.sub === 'item') drawMenuIcons(ctx, scene.menu, it => it.value ? itemIcon(it.value, data.items[it.value]) : null, 10);
  }
  else if (scene.msg) wrapMsg(ctx, scene.msg, LEFT_W - 16).slice(-MSG_LINES).forEach((l, i) => drawText(ctx, l, 8, PANEL_Y + 8 + i * LINE_H, { color: UI.text }));
  else drawEnemyList(ctx, scene);
  drawPartyStatus(ctx, scene);
  // 选目标时把指令窗压暗：注意力该在战场上的光标，不在刚才那张菜单。只压内容区、留着窗框，
  // 看起来是「退到后面」而不是「被盖住」。胜利结算屏则铺满整个画面，连面板一起盖掉
  if (scene.phase === 'input' && scene.sub === 'target') { ctx.fillStyle = 'rgba(6,14,10,0.45)'; ctx.fillRect(5, PANEL_Y + 5, LEFT_W - 10, PANEL_H - 10); }
  if (scene.result) renderResult(ctx, scene.game, scene.result, scene.time - scene.resultAt, !scene.card && !scene.loot);
  if (scene.loot) renderLootCard(ctx, scene.loot);
  if (scene.card) renderLevelCard(ctx, scene.card);
}
