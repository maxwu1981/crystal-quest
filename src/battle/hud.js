// 战斗画面的静态部分：背景、敌人名单、队伍状态栏
import { drawText, measure, LINE_H } from '../core/text.js';
import { drawWindow, drawGauge, drawHighlight, UI } from '../ui/Window.js';
import { drawRatio } from '../menu/common.js';
import { statusTags } from '../game/status.js';
import { RNG } from '../core/RNG.js';
import { snap } from '../core/draw.js';

export const PANEL_Y = 152, PANEL_H = 72, LEFT_W = 112;
export const ENEMY_CENTERS = [[48, 62], [100, 82], [48, 114], [100, 132]];
export const PARTY_X = 204, PARTY_Y0 = 44, PARTY_DY = 26;

// ============ 战斗背景 ============
// 一张灰绿渐变打遍平原、洞窟、祭场，是这个战斗画面和 FF6 差距最大的地方——
// 那边是每种地形一张专属背景，「换了地方」这件事全靠背景说。这里按玩家当前所在地选一套。
// 判断只看 game.state.map / opts.zone，所以 FieldScene 不用改，也不必多传参数。
// 认不出的地图一律退回通用背景（调试强制遇敌、以后新加的地图都走这条路）。
const ZONE_BG = { village_field: 'plains', plains: 'plains', cave: 'cave', cave_deep: 'deep' };
const MAP_BG = { village: 'plains', overworld: 'plains', cave_1: 'cave', cave_2: 'deep', cave_3: 'shrine' };

const HZ = { plains: 100, cave: 112, deep: 120, shrine: 104 }; // 各背景的地平线（地面起始 y）

// 背景里的随机细节（星星、钟乳石、竹丛…）只能掷一次骰子：每帧重掷会变成一整片雪花。
// 所以由 BattleScene 在 constructor 里调用本函数把结果存下来，render 只读不掷。
export function makeBackdrop(game, opts = {}) {
  const kind = ZONE_BG[opts.zone] || MAP_BG[game?.state?.map?.id] || 'default';
  const rng = game?.rngFx || new RNG(20260905); // rngFx 是纯装饰用的 RNG；万一没有也不能让背景炸掉
  const bg = { kind };
  const list = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

  if (kind === 'plains') {
    // 竹围：客家庄外圈那道刺竹，既挡风也挡贼，是六堆地景的招牌
    bg.bamboo = list(10, i => ({ x: i * 27 + rng.int(-6, 6), h: rng.int(13, 24), n: rng.int(3, 5) }));
    bg.crops = list(54, () => ({ x: rng.int(-2, 256), y: rng.int(HZ.plains + 3, PANEL_Y - 2) })); // 秧苗
    bg.clouds = list(4, i => ({ x: rng.int(-20, 200), y: 12 + i * 11 + rng.int(-3, 3), w: rng.int(38, 84) }));
  } else if (kind === 'cave') {
    bg.drips = list(11, i => ({ x: i * 24 + rng.int(-8, 8), w: rng.int(3, 7), h: rng.int(8, 22) })); // 钟乳石
    bg.strata = list(4, i => ({ y: 26 + i * 20 + rng.int(-4, 4), h: rng.int(2, 4), p: rng.int(0, 60) })); // 岩层
    bg.seep = list(6, () => ({ x: rng.int(4, 250), y: rng.int(10, 60), h: rng.int(14, 40) })); // 壁上渗水
    // 地上的积水：位置固定，只有反光在缓慢横移
    bg.pools = list(3, i => ({ x: 26 + i * 78 + rng.int(-10, 10), y: 124 + rng.int(0, 14), w: rng.int(30, 46), ph: rng.int(0, 60) / 10 }));
    bg.rocks = list(7, () => ({ x: rng.int(0, 252), y: rng.int(HZ.cave + 2, PANEL_Y - 4), w: rng.int(3, 8) }));
  } else if (kind === 'deep') {
    // 磷光石：这层唯一的光源。位置贴着墙脚与两侧，尽量不抢敌人所在的画面中段
    bg.glow = list(6, i => ({
      x: [10, 32, 226, 246, 120, 200][i] + rng.int(-4, 4),
      y: [96, 128, 92, 130, 138, 122][i] + rng.int(-4, 4),
      r: rng.int(16, 26), c: rng.int(4, 8),
      period: 3.4 + rng.int(0, 18) / 10, phase: rng.int(0, 62) / 10, // 周期 3.4–5.2 秒，够慢才不刺眼
    }));
    bg.grit = list(40, () => ({ x: rng.int(0, 254), y: rng.int(6, PANEL_Y - 2), a: rng.int(3, 8) / 100 }));
  } else if (kind === 'shrine') {
    // 星空：每颗星自己的周期与相位，最亮最暗只差一点点，看起来是「有呼吸」而不是「在闪」
    bg.stars = list(46, () => {
      const big = rng.chance(0.18);
      return { x: rng.int(1, 254), y: rng.int(2, HZ.shrine - 12), big,
        base: (big ? 62 : 42) / 100, amp: (big ? 22 : 16) / 100,
        period: 2.2 + rng.int(0, 26) / 10, phase: rng.int(0, 62) / 10 };
    });
    // 立石：祭场围成一圈的石柱，中间高两边矮，像一群守着火的人
    bg.stones = list(7, i => ({ x: [2, 30, 64, 106, 150, 194, 230][i] + rng.int(-3, 3), w: rng.int(10, 17), h: rng.int(20, 40) }));
    bg.grit = list(34, () => ({ x: rng.int(0, 254), y: rng.int(HZ.shrine + 2, PANEL_Y - 2), a: rng.int(4, 9) / 100 }));
  }
  return bg;
}

// 用竖条填山棱线：路径填充会抗锯齿，把像素味糊掉，一列一列画才是硬边
function ridge(ctx, W, base, pts, color, step = 2) {
  ctx.fillStyle = color;
  for (let x = -4; x < W + 4; x += step) {
    let h = pts[pts.length - 1][1];
    if (x <= pts[0][0]) h = pts[0][1];
    else for (let i = 1; i < pts.length; i++) {
      const [x1, h1] = pts[i], [x0, h0] = pts[i - 1];
      if (x <= x1) { h = Math.round(h0 + (h1 - h0) * (x - x0) / (x1 - x0)); break; }
    }
    ctx.fillRect(x, base - h, step, h + 6);
  }
}
const RIDGE_FAR = [[0, 20], [26, 30], [58, 16], [88, 34], [118, 22], [150, 38], [186, 20], [214, 30], [256, 18]];
const RIDGE_NEAR = [[0, 10], [34, 16], [70, 8], [104, 18], [140, 10], [176, 20], [210, 9], [256, 14]];
const RIDGE_TAIWU = [[0, 14], [40, 26], [76, 18], [110, 40], [146, 24], [184, 34], [222, 16], [256, 22]];

// 铺满整幅背景时都往外多画几像素：受击震屏会把画面推开 ±2px，不留边就会露出黑条
function fillAll(ctx, W, y, h, style) { ctx.fillStyle = style; ctx.fillRect(-4, y - 4, W + 8, h + 8); }
// 地面：上缘必须刚好落在地平线上（不能像 fillAll 那样往上溢，会啃掉远景的下半截）
function fillGround(ctx, W, y, style) { ctx.fillStyle = style; ctx.fillRect(-4, y, W + 8, PANEL_Y - y + 6); }

// ---- 平原/田野：内埔庄外的水田与六堆平原 ----
function drawPlains(ctx, W, bg) {
  const hz = HZ.plains;
  // 天：南台湾的正午，头顶薄蓝，靠地平线被田水反上来的光烤成暖黄
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#6f97ad'); sky.addColorStop(0.55, '#9db4a6'); sky.addColorStop(1, '#cec69b');
  fillAll(ctx, W, 0, hz, sky);
  ctx.fillStyle = 'rgba(255,252,240,0.13)'; // 平铺的薄云，只压一点点白
  for (const c of bg.clouds) { ctx.fillRect(c.x, c.y, c.w, 2); ctx.fillRect(c.x + 8, c.y + 2, c.w - 20, 1); }
  // 远处大武山系：两层剪影拉出纵深，远的一层更淡更蓝（空气透视）
  ridge(ctx, W, hz, RIDGE_FAR, '#74889a', 2);
  ridge(ctx, W, hz, RIDGE_NEAR, '#55705a', 2);
  // 竹围：压在地平线上的一排深绿
  for (const b of bg.bamboo) {
    ctx.fillStyle = '#2c452a';
    for (let k = 0; k < b.n; k++) ctx.fillRect(b.x + k * 3, hz - b.h + Math.abs(k - (b.n >> 1)) * 3, 1, b.h);
    ctx.fillStyle = '#375733';
    for (let k = 0; k < b.n; k++) ctx.fillRect(b.x + k * 3 - 1, hz - b.h + Math.abs(k - (b.n >> 1)) * 3 - 2, 3, 3);
  }
  // 水田：三段，越近的一段越大块；田埂用土色亮线分隔，是这片地景的骨架
  const bands = [[hz, '#618040'], [hz + 13, '#55743a'], [hz + 29, '#496a30']];
  bands.forEach(([y, c], i) => { ctx.fillStyle = c; ctx.fillRect(-4, y, W + 8, (bands[i + 1]?.[0] ?? PANEL_Y + 6) - y); });
  ctx.fillStyle = 'rgba(214,220,182,0.20)'; // 最远那段还灌着水，会把天光反上来
  for (let i = 0; i < 3; i++) ctx.fillRect(-4, hz + 3 + i * 3, W + 8, 1);
  ctx.fillStyle = '#8e8a58';
  for (const [y] of bands) ctx.fillRect(-4, y, W + 8, 1);
  // 最近这段画出畦沟：远景全是横线，近景补一组竖线，两种方向一对比才有「这块地在往前铺」的感觉
  ctx.fillStyle = 'rgba(38,62,28,0.5)';
  for (let i = 0; i < 11; i++) ctx.fillRect(-4 + i * 26, hz + 30, 1, PANEL_Y - hz - 30 + 6);
  ctx.fillStyle = 'rgba(28,52,22,0.55)'; // 秧苗
  for (const c of bg.crops) ctx.fillRect(c.x, c.y, 1, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; // 最底下压一道暗边，让画面坐在下方的窗框上
  ctx.fillRect(-4, PANEL_Y - 5, W + 8, 11);
}

// ---- 洞窟外围：罗经圈外圈，湿岩壁、积水湖与那座断桥 ----
function drawCave(ctx, W, bg, t) {
  const hz = HZ.cave;
  // 岩壁：洞顶没光所以最黑，越靠地面越亮——亮的是积水反上来的那点光。
  // 岩石本身几乎不带彩（和地图里的 cave_wall #221d1d / cave_floor #4a4242 同一个思路：
  // 底色接近中性灰，冷是上面那层区域色调给的）。原本这里是饱和的暖褐，
  // 光靠 multiply 压不成冷灰——正片叠底只能压暗，压不掉红。
  const wall = ctx.createLinearGradient(0, 0, 0, hz);
  wall.addColorStop(0, '#121213'); wall.addColorStop(0.6, '#252628'); wall.addColorStop(1, '#3d3e41');
  fillAll(ctx, W, 0, hz, wall);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; // 岩层：几条起伏的横带，暗示层积岩
  for (const s of bg.strata) for (let x = -4; x < W + 4; x += 4) ctx.fillRect(x, s.y + Math.round(Math.sin((x + s.p) * 0.05) * 2), 4, s.h);
  ctx.fillStyle = 'rgba(120,140,140,0.06)'; // 壁上一道道渗水痕
  for (const s of bg.seep) ctx.fillRect(s.x, s.y, 1, s.h);
  ctx.fillStyle = '#161719'; // 钟乳石：从洞顶垂下来，越往下越尖
  for (const d of bg.drips) for (let k = 0; k < d.h; k++) {
    const w = Math.max(1, d.w - Math.round(k * d.w / d.h));
    ctx.fillRect(d.x - (w >> 1), k, w, 1);
  }
  // 后方积水湖：只占右半边，让左边留一块实心岩壁，构图不对称才有纵深
  const poolG = ctx.createLinearGradient(0, 92, 0, hz + 2);
  poolG.addColorStop(0, '#101c20'); poolG.addColorStop(1, '#1d3138');
  ctx.fillStyle = poolG; ctx.fillRect(108, 92, W - 108 + 4, hz - 90);
  ctx.fillStyle = 'rgba(130,175,185,0.10)'; // 湖面远端的一点反光
  for (let i = 0; i < 4; i++) ctx.fillRect(120 + i * 30, 96 + (i % 2) * 3, 18 - i * 2, 1);
  // 断桥：架在湖上的木桥，中间断掉的那一截就是玩家在外围绕路的理由
  ctx.fillStyle = '#201915';
  ctx.fillRect(126, 94, 30, 3); ctx.fillRect(178, 94, 30, 3);   // 两截残存的桥面
  ctx.fillRect(130, 97, 2, 12); ctx.fillRect(152, 97, 2, 10);   // 桥墩
  ctx.fillRect(182, 97, 2, 10); ctx.fillRect(204, 97, 2, 13);
  ctx.fillStyle = '#2e241d';
  ctx.fillRect(126, 94, 30, 1); ctx.fillRect(178, 94, 30, 1);   // 桥面朝上的一道亮边
  // 近处地面：湿石头。比岩壁亮一点，敌人脚下才有一条清楚的地平线
  const floor = ctx.createLinearGradient(0, hz, 0, PANEL_Y);
  floor.addColorStop(0, '#3c3d40'); floor.addColorStop(1, '#252628');
  ctx.fillStyle = floor; ctx.fillRect(-4, hz, W + 8, PANEL_Y - hz + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-4, hz, W + 8, 2); // 岸边的暗线
  ctx.fillStyle = '#474a4e';
  for (const r of bg.rocks) { ctx.fillRect(r.x, r.y, r.w, 2); ctx.fillRect(r.x + 1, r.y - 1, r.w - 2, 1); }
  ctx.fillStyle = '#191a1c'; // 两侧的落石：把画面框住，也遮掉空荡荡的角落
  ctx.fillRect(-4, PANEL_Y - 16, 18, 22); ctx.fillRect(6, PANEL_Y - 22, 10, 28);
  ctx.fillRect(W - 16, PANEL_Y - 20, 20, 26); ctx.fillRect(W - 26, PANEL_Y - 12, 12, 18);
  // 地上的积水：形状不动，只有反光在极慢地横移（约 11 秒一个来回，最多 6px）——
  // 会晃眼的东西一律不要，所以这里只允许「慢到几乎看不出在动」的程度
  for (const p of bg.pools) {
    for (let k = 0; k < 6; k++) {
      const w = p.w - Math.abs(k - 2.5) * 6;
      ctx.fillStyle = k === 0 ? '#3f4f50' : '#14252a'; // 上缘一条亮边，水面才立得起来
      ctx.fillRect(p.x + Math.round((p.w - w) / 2), p.y + k, Math.round(w), 1);
    }
    const drift = Math.round(Math.sin(t * 0.55 + p.ph) * (p.w * 0.16));
    const a = 0.16 + 0.06 * Math.sin(t * 0.9 + p.ph * 1.7);
    ctx.fillStyle = `rgba(160,205,212,${a.toFixed(3)})`;
    ctx.fillRect(p.x + 6 + drift, p.y + 2, (p.w >> 1) - 2, 1);
    ctx.fillRect(p.x + 10 - drift, p.y + 4, (p.w >> 2), 1);
  }
}

// ---- 洞窟深处：罗盘花结构，只有磷光石照明 ----
function drawDeep(ctx, W, bg, t) {
  const hz = HZ.deep;
  const wall = ctx.createLinearGradient(0, 0, 0, PANEL_Y);
  wall.addColorStop(0, '#0a0a0b'); wall.addColorStop(0.55, '#1a1b1c'); wall.addColorStop(1, '#2d2e2f');
  fillAll(ctx, W, 0, PANEL_Y, wall);
  // 罗盘花：后墙上一圈圈同心刻痕加放射线，罗经圈就是这么得名的。
  // 对比压到几乎看不见，只当墙的质地——真画清楚了会跟敌人抢视线。
  ctx.strokeStyle = 'rgba(122,204,188,0.05)'; ctx.lineWidth = 1;
  const cx = 128, cy = 82;
  for (const r of [22, 40, 60, 82, 108]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
    ctx.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108); ctx.stroke();
  }
  ctx.fillStyle = '#0b0b0c'; // 两侧的石柱：把画面框住，也提醒这里是人工凿出来的
  ctx.fillRect(-4, 0, 16, PANEL_Y); ctx.fillRect(W - 14, 0, 18, PANEL_Y);
  ctx.fillStyle = 'rgba(110,180,170,0.05)';
  ctx.fillRect(12, 0, 1, PANEL_Y); ctx.fillRect(W - 15, 0, 1, PANEL_Y);
  for (const g of bg.grit) { ctx.fillStyle = `rgba(150,200,190,${g.a})`; ctx.fillRect(g.x, g.y, 1, 1); }
  // 地面：这一层的地是铺过石板的（地图里就是 flagstone），画几道接缝把「人工凿出来」讲清楚
  const fl = ctx.createLinearGradient(0, hz, 0, PANEL_Y);
  fl.addColorStop(0, '#232425'); fl.addColorStop(1, '#111112');
  ctx.fillStyle = fl; ctx.fillRect(-4, hz, W + 8, PANEL_Y - hz + 6);
  ctx.fillStyle = 'rgba(120,200,186,0.07)'; ctx.fillRect(-4, hz, W + 8, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 4; i++) ctx.fillRect(-4, hz + i * 9, W + 8, 1);
  for (let i = 0; i < 9; i++) ctx.fillRect(i * 30 + (i % 2) * 12, hz + 1, 1, PANEL_Y - hz);
  // 磷光石：唯一的光源，冷蓝绿。亮度按各自 3.4–5.2 秒的周期缓慢起伏，振幅小到只像在呼吸
  for (const s of bg.glow) {
    const k = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / s.period + s.phase);
    const a = 0.11 + 0.05 * k;
    const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    rg.addColorStop(0, `rgba(150,235,214,${(a * 1.8).toFixed(3)})`);
    rg.addColorStop(0.45, `rgba(88,178,168,${(a * 0.75).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(60,140,130,0)');
    ctx.fillStyle = rg; ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    ctx.fillStyle = `rgba(172,232,220,${(0.46 + 0.16 * k).toFixed(3)})`; // 结晶本体
    ctx.fillRect(s.x - 1, s.y - s.c, 2, s.c);
    ctx.fillStyle = 'rgba(102,180,170,0.7)';
    ctx.fillRect(s.x - 3, s.y - (s.c - 2), 1, s.c - 2);
    ctx.fillRect(s.x + 2, s.y - (s.c - 3), 1, s.c - 3);
  }
}

// ---- 大武山祭场：夜、立石、星空，最终战的仪式感 ----
function drawShrine(ctx, W, bg, t) {
  const hz = HZ.shrine;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#070610'); sky.addColorStop(0.6, '#100f24'); sky.addColorStop(1, '#241f3b');
  fillAll(ctx, W, 0, hz, sky);
  // 星：每颗自己的周期（2.2–4.8 秒）与相位，明暗差只有 0.16–0.22，慢到像在呼吸而不是在闪
  for (const s of bg.stars) {
    const a = s.base + s.amp * Math.sin(t * (Math.PI * 2) / s.period + s.phase);
    ctx.fillStyle = `rgba(226,234,255,${a.toFixed(3)})`;
    ctx.fillRect(s.x, s.y, 1, 1);
    if (s.big) { // 亮星多描四个邻点，看起来大一圈，不必真的画成 2px 方块
      ctx.fillStyle = `rgba(226,234,255,${(a * 0.4).toFixed(3)})`;
      ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
    }
  }
  // 月：挂在敌我之间那块空档上，也给立石的边光一个来源
  const MX = 150, MY = 24;
  const halo = ctx.createRadialGradient(MX, MY, 2, MX, MY, 22);
  halo.addColorStop(0, 'rgba(200,214,240,0.16)'); halo.addColorStop(1, 'rgba(200,214,240,0)');
  ctx.fillStyle = halo; ctx.fillRect(MX - 22, MY - 22, 44, 44);
  ctx.fillStyle = '#c9d3e8';
  for (let k = -6; k <= 6; k++) { const w = Math.round(Math.sqrt(Math.max(0, 36 - k * k))); ctx.fillRect(MX - w, MY + k, w * 2, 1); }
  ctx.fillStyle = 'rgba(120,134,168,0.5)';
  for (let k = -6; k <= 2; k++) { const w = Math.round(Math.sqrt(Math.max(0, 36 - k * k))); ctx.fillRect(MX - w + 1, MY + k, 3, 1); } // 月面的暗部
  ridge(ctx, W, hz, RIDGE_TAIWU, '#0c0b18', 2); // 大武山的稜线
  ctx.fillStyle = 'rgba(150,132,196,0.055)'; // 山脚下压一层夜雾，把立石和稜线分开
  for (let i = 0; i < 5; i++) ctx.fillRect(-4, hz - 7 + i, W + 8, 1);
  fillGround(ctx, W, hz, '#161425'); // 夯实的土地：先铺地，立石才好站在上头（而不是被地面切掉脚）
  // 立石：围成一圈的石柱。朝月亮那一侧留一条窄边光，其余全是剪影
  for (const m of bg.stones) {
    ctx.fillStyle = '#191828'; ctx.fillRect(m.x, hz - m.h, m.w, m.h + 10);
    ctx.fillStyle = '#3a3757';
    ctx.fillRect(m.x + m.w / 2 < MX ? m.x + m.w - 1 : m.x, hz - m.h, 1, m.h + 10);
    ctx.fillRect(m.x, hz - m.h, m.w, 1);
  }
  for (const g of bg.grit) { ctx.fillStyle = `rgba(180,170,210,${g.a})`; ctx.fillRect(g.x, g.y, 2, 1); }
  ctx.fillStyle = '#2b2740'; // 地上摆成一圈的祭石：火塘的边
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (i / 12);
    ctx.fillRect(snap(128 - Math.cos(a) * 74), snap(136 + Math.sin(a) * 9), 4, 2);
  }
  // 火塘里剩下的一点炭：出火熄掉之后就只剩这个了。5.5 秒一次的极暗起伏
  const k = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / 5.5);
  const em = ctx.createRadialGradient(128, 136, 2, 128, 136, 44);
  em.addColorStop(0, `rgba(214,124,58,${(0.065 + 0.035 * k).toFixed(3)})`);
  em.addColorStop(1, 'rgba(214,124,58,0)');
  ctx.fillStyle = em; ctx.fillRect(128 - 44, 136 - 44, 88, 88);
}

// ---- 通用背景：认不出地图时的退路，维持原本那张山里的天与地 ----
function drawFallback(ctx, W) {
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_Y);
  g.addColorStop(0, '#232a33'); g.addColorStop(0.6, '#3b4038'); g.addColorStop(1, '#565a48');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, PANEL_Y);
  ctx.fillStyle = '#4a5138'; ctx.fillRect(0, PANEL_Y - 40, W, 40);
  ctx.fillStyle = '#39402c'; ctx.fillRect(0, PANEL_Y - 40, W, 2);
  ctx.fillStyle = 'rgba(200,190,150,0.06)';
  for (let i = 0; i < 5; i++) ctx.fillRect(0, PANEL_Y - 36 + i * 7, W, 1);
}

// ---- 区域色调：和地图那边对上 ----
// FieldScene 给每张地图蒙了一层 multiply 色调（村庄暖黄、洞窟冷蓝、祭场夜紫），
// 战斗背景却是自成一套的配色，于是「在冷蓝的洞里走着走着遇敌」会切进一片暖褐色，色温跳一下。
// 这里用同一种做法、同一组颜色，让两边落在同一个色系里：
//   plains ← village / overworld，cave ← cave_1，deep ← cave_2，shrine ← cave_3
// 用 multiply（正片叠底）而不是蒙一层半透明色：蒙色会把暗部提亮成灰，洞窟会糊成一片雾。
// 色调是常数、不含时间项 —— 结构上就不可能闪。
// 强度比地图那边低一档：地图有暗角托底，战斗画面没有，照抄 0.28 / 0.34 会把背景压得发闷。
const TONE = {
  plains: { c: '#ffdfad', a: 0.14 }, // village(#ffd9a2 .16) 与 overworld(#ffe6bb .11) 的折中：两张地图共用这一套背景
  cave:   { c: '#7d9ec2', a: 0.26 }, // cave_1：这套原本是暖褐色，色温跳得最凶，要的就是这一层
  deep:   { c: '#6f92c0', a: 0.22 }, // cave_2：本来就是冷色，点到为止，压太狠会吃掉磷光石
  shrine: { c: '#8d7fc6', a: 0.20 }, // cave_3：夜色本就暗，只把蓝夜往紫里推一点
};

// bg 由 makeBackdrop 生成（缺省时退回通用背景），t 是战斗经过的秒数。
// save/restore 包起来：背景改了 fillStyle / strokeStyle / lineWidth / 合成模式，
// 不能漏给后面画敌人的代码（restore 会把 globalAlpha 与 globalCompositeOperation 一起还原）。
export function drawBackground(ctx, W, bg = null, t = 0) {
  ctx.save();
  if (bg?.kind === 'plains') drawPlains(ctx, W, bg, t);
  else if (bg?.kind === 'cave') drawCave(ctx, W, bg, t);
  else if (bg?.kind === 'deep') drawDeep(ctx, W, bg, t);
  else if (bg?.kind === 'shrine') drawShrine(ctx, W, bg, t);
  else drawFallback(ctx, W);
  const tone = TONE[bg?.kind];
  if (tone) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tone.a;
    ctx.fillStyle = tone.c;
    ctx.fillRect(-4, -4, W + 8, PANEL_Y + 8); // 和 fillAll 一样往外多铺：震屏会把画面推开 ±2px
  }
  ctx.restore();
}

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
