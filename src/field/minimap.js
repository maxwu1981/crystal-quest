// 小地图与全图。从 FieldScene 拆出来——它加上地形过渡之后过了项目 400 行的上限，
// 而这一段跟走路、碰撞、事件都无关，只读场景状态画一张俯视图，拆出来最干净。
// 两个函数都收 `scene`（FieldScene 实例）而不是散参数：要读的东西不少
// （map / p / animT / chestOpened / game.W），一个个传反而更难看。
import { drawWindow } from '../ui/Window.js';
import { drawText } from '../core/text.js';

// ---------- 地图 ----------
// 右上角常驻小地图 + 按 Tab/Q 摊开全图。
// 洞窟绕来绕去（罗经圈本来就是「像罗盘一样绕」的设计），没有地图很容易迷路。
// 小地图只画地形色块不画瓦片图：16×16 的瓦片缩到 2px 什么也看不出，反而糊成一片。
function mapColor(cell) {
  const t = cell.tile;
  if (cell.solid) return t === 'water' ? '#1d3c52' : '#2b2a30';   // 墙与水都是过不去的，但水另给一色
  if (t === 'path' || t === 'flagstone') return '#8a7a5e';
  // floor 原本跟上面同色。木馬道的滑道就是靠 floor 跟林间土路（path）分开的——
  // 同色的话玩家摊开全图完全看不出哪条是滑道，这座迷宫唯一的机制在导航
  // 界面上就是隐形的。分色之后顺带也帮到所有室内图：floor 从此不再假装是土路。
  if (t === 'floor') return '#a9793f';
  // 沙原本跟上面那档只差 19/255（CLAUDE.md 的判准：10.9 是分不清路，37.4 是修好）。
  // 燈塔那座迷宫的招牌机制「光帶不遇敵」靠的正是 flagstone(阴影)/sand(光带) 这组对比，
  // 玩家摊开全图规划路线时必须一眼分得出——量出来现在 Δlum 72.8，同一套判准下算修好。
  if (t === 'sand') return '#d8c48c';
  if (t === 'grass' || t === 'town') return '#4a6b3a';
  if (t === 'forest' || t === 'tree') return '#2f4a2a';
  if (t === 'bridge') return '#7a5a3a';
  if (t === 'cartstop') return '#8a6a3e';                          // 牛稠：比 path 深一档，摊开全图找得到上车点
  return '#4a4750';                                                // 洞窟地面等
}
// 画一张地图：scale = 每格几个逻辑像素
function drawMapAt(scene, ctx, ox, oy, scale, { dots = true } = {}) {
  const map = scene.map, st = scene.game.state;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    ctx.fillStyle = mapColor(map.cells[y * map.w + x]);
    ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
  }
  if (!dots) return;
  // 楼梯与门：亮青色；没开过的宝箱：金色；开过的不画（已经拿完了就别再吸引注意）
  for (const ev of Object.values(map.events)) {
    const s = Math.max(1, scale);
    // 同图内的 warp（滑道口）跟真的楼梯/门用同一支亮青会撞：滑道口踩上去是
    // 单向的「一步到底」，跟楼梯「上下一层」是两件事，玩家在全图上得分得出来
    if (ev.type === 'warp') ctx.fillStyle = ev.to.map === scene.mapId ? '#c8e04a' : '#6fe0d0';
    else if (ev.type === 'chest') { if (scene.chestOpened(ev)) continue; ctx.fillStyle = '#ffd257'; }
    else if (ev.type === 'crystal') ctx.fillStyle = '#ff9c4a';
    else continue;
    ctx.fillRect(ox + ev.x * scale, oy + ev.y * scale, s, s);
  }
  // 主角：白点 + 2.2 秒一次的柔和呼吸（周期够慢，不会看成闪）
  const k = 0.72 + 0.28 * Math.sin(scene.animT * (2 * Math.PI / 2.2));
  ctx.globalAlpha = k;
  ctx.fillStyle = '#fff';
  ctx.fillRect(ox + scene.p.x * scale - (scale < 2 ? 0 : 1), oy + scene.p.y * scale - (scale < 2 ? 0 : 1),
               Math.max(2, scale + 2), Math.max(2, scale + 2));
  ctx.globalAlpha = 1;
}
export function renderMinimap(scene, ctx) {
  const { W } = scene.game, map = scene.map;
  const MAX = 54;                                   // 右上角这块最多占 54×54 逻辑像素
  const scale = Math.max(1, Math.floor(Math.min(MAX / map.w, MAX / map.h)));
  const mw = map.w * scale, mh = map.h * scale;
  const ox = W - mw - 7, oy = 7;
  ctx.save();
  ctx.globalAlpha = 0.82;                           // 半透明，别把地图角落挡死
  ctx.fillStyle = '#0d100e'; ctx.fillRect(ox - 2, oy - 2, mw + 4, mh + 4);
  drawMapAt(scene, ctx, ox, oy, scale);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 1;
  ctx.strokeRect(ox - 2.5, oy - 2.5, mw + 5, mh + 5);
  ctx.restore();
}
export function renderFullMap(scene, ctx) {
  const { W, H } = scene.game, map = scene.map;
  ctx.fillStyle = 'rgba(8,10,9,0.88)'; ctx.fillRect(0, 0, W, H);
  const scale = Math.max(1, Math.floor(Math.min((W - 40) / map.w, (H - 56) / map.h)));
  const mw = map.w * scale, mh = map.h * scale;
  const ox = Math.round((W - mw) / 2), oy = Math.round((H - mh) / 2) + 4;
  drawWindow(ctx, ox - 6, oy - 6, mw + 12, mh + 12);
  drawMapAt(scene, ctx, ox, oy, scale);
  drawText(ctx, map.name || '', W / 2, 8, { align: 'center', color: '#e6c46a' });
  drawText(ctx, '楼梯/门 · 未开的箱 · 你', W / 2, H - 14, { align: 'center', color: '#8a8468' });
}
