// 【八部齐至】——八尊全部练满（技能 5 级）才解锁的最后一招，全游戏最后一样东西。
// 导演原话：「八位依序降临，八种属性各一击。」
//
// **为什么单独一个档**：这一招 6.4 秒，是任何单尊（1.7–2.2 秒）的三倍长，
// 塞进 summonFx.js 或 summonFxAlly.js 都会顶破 400 行；而且它跟那八位是
// **引用关系不是并列关系**——它不该在那八位中间被改到，那八位也不该因为它而动。
// 八个剪影母题在 summonKit.js 的 MOTIF 里（从各自那一段逐点抄回来的，比例一个没改）。
//
// ── 降临顺序：土 → 木 → 水 → 火 → 金 → 光 → 暗 → 風 ────────────────────────
// 不是按解锁顺序（那是玩家的时间线，不是神的），是按**辈分与来历**分的三组 + 一位点齐：
//   ① 地上的三位　伯公·土 / 观世音·木 / 妈祖·水
//      这三位的单尊演出重心全在我方（summonFxAlly.js），是「顾」不是「打」——
//      田头田尾的伯公坛、厅下的观音彩、桅顶的妈祖火，本来就已经在这户人家里。
//      她们不必赶来，只要**站起来**。所以第一组，也所以她们的形从地上长出来。
//   ② 拿刀的两位　关圣帝君·火 / 吕布·金
//      summons.json 的 lubu.note 写死了「这是关圣帝君『义气』的反面，两位要放在一起读」。
//      一个讲义气一个不讲情分，全作只有这一招会让他们同时在场，那就让两把兵器交在一起。
//   ③ 管鬼的两位　钟馗·光 / 义民爷·暗
//      一个把没走的送走，一个自己就是没走的（lore.summons_eight：跟好兄弟同一种东西，
//      差别只在有主无主）。光与暗站在同一张桌子的两头，这一组就是那张桌子。
//   ④ 点齐的一位　中坛元帅·風
//      他是**中坛**元帅、五营的中营，点兵的是他。而他自己那一段的话是
//      「轮子转起来，先到的是风」——风正好是把前面七位卷拢成一圈的那个东西。
//      所以他压最后、单独一组：他一到，八个神位同时亮，第八击才有得打。
//
// ── 段落（dur 6.4s，p 是 0→1 的整体进度）──────────────────────────────────
//   起坛　0    –0.13  (0–0.83s)  一声锣，八个神位依序亮起来，连成一圈
//   组一　0.14 –0.36  (0.9–2.3s) 土木水，三位
//   组二　0.33 –0.50  (2.1–3.2s) 火金，两位
//   组三　0.45 –0.62  (2.9–4.0s) 光暗，两位
//   组四　0.55 –0.67  (3.5–4.3s) 風，一位；风扫过，八位归位坐满一圈
//   八击　0.60 –0.90  (3.8–5.7s) 八道属性各一击，第八击是八神齐至的合像
//   收　　0.90 –1     (5.8–6.4s) 灰落下，神位依序熄掉
//
// **为什么不是「八位各闪一下」**：那是最伤眼也最廉价的做法——八段等长、等亮、
// 一模一样的节拍，读起来是幻灯片不是演出，而且要闪八次就必然破了「一招只闪一次」。
// 压成三到四组之后，节奏变成 3-2-2-1：先厚、再对、再对、最后一记点名，
// 长度递减本身就是加速，加速完才是八击的连打，连打完才是合像。
// **降临段一次全屏闪都没有**，八位各自只有局部 glow / ring / beam；
// 整招唯一的一次 flash 压在第八击（p≈0.87）——峰值 0.40、起落各 ≈0.46 秒。
//
// ── 八击必须落在 0.600–0.8625 ────────────────────────────────────────────
// 结算点不由这里定，由 actions.js 的 `settleAt(i, hits) = 0.60 + i*(0.30/hits)` 定：
// hits=8 → p = .600 .6375 .675 .7125 .750 .7875 .825 .8625（3.84s–5.52s）。
// 伤害数字就在那八个点跳出来，画面上的八击必须压在同一串上，否则数字与画面各说各的
// （关圣帝君那一段头上写着「结算要卡在劈的那一下」，就是这条规矩）。
// 所以降临只有前 60% 可用——这也是必须把八位压成组的第二个理由。
//
// 演出的其余规矩（形状优先于粒子、最小笔触 PX、rng 只在构造时掷）见 summonKit.js 开头。
// 坐标是 256×224 逻辑坐标，战场只到 y=FH(152)。

import { W, FH, seg, pulse, ease, wash, flash, glow, ring, dot, beam, gust, flame, motif } from './summonKit.js';
import { ELEMENTS } from './elements.js';

// 八位的册子：**顺序就是降临顺序**，索引 i 同时是第 i 击、第 i 个神位。
// 键用属性不用神名——「八种属性各一击」这句话在代码里就该长这样（MOTIF 也按属性索引）。
const EIGHT = ['earth', 'wood', 'water', 'fire', 'metal', 'light', 'dark', 'wind'];
// 每一位的大像出场时间（p）。组内错开 0.045，组与组之间留 0.08–0.1 的缝：
// 三组的长度是 0.22 / 0.17 / 0.17 → 递减本身就是加速
const ARRIVE = [0.140, 0.185, 0.230, 0.325, 0.370, 0.450, 0.495, 0.545];

// 八个神位：绕战场一圈的椭圆，从正上方起顺时针。落点是算出来的，不是摆出来的，
// 但落得刚好——组一（顾人的三位）在右半场，那正是队伍那一侧；
// 组三（管鬼的两位）在左半场，那正是敌人那一侧；組四的風在左上，从那里刮过全场。
const CX = 128, CY = 74, RX = 104, RY = 56;
const SEAT = EIGHT.map((_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 4;
  return [CX + Math.cos(a) * RX, CY + Math.sin(a) * RY];
});
// 大像的站位：同一个角度、往里收。这样每一位都出现在**自己的神位前面**，
// 收的时候直接退回去坐下，八个位置自然不打架，也不必手摆一张表
const STAND = EIGHT.map((_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 4;
  return [CX + Math.cos(a) * RX * 0.62, CY + Math.sin(a) * RY * 0.72];
});

const COL = EIGHT.map(el => ELEMENTS[el].color);
// glow() 要的是 rgb() 形式（它内部把 'rgb(' 换成 'rgba(' 加中段透明度），
// 而 elements.js 存的是 #hex。换算一次存起来，不在 render 里每帧算
const RGB = EIGHT.map(el => {
  const h = ELEMENTS[el].color;
  return `rgb(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)})`;
});

// 结算点，和 actions.js 的 settleAt(i, 8) 一模一样。抄一份而不是 import，
// 是因为那个函数没导出，而且这里要的是「画面对齐结算」这条约束的**副本**：
// 哪天那边改了节奏，这一行和它对不上，改的人一眼看得见差在哪
const HIT_AT = i => 0.600 + i * 0.0375;
// 四只敌人相对敌群中心 (74,96) 的位置（hudBits 的 ENEMY_CENTERS 减掉焦点）。
// 八击按 i%4 轮着落，等于把整条敌线扫两遍，不是八下砸同一个坑
const OFF = [[-26, -34], [26, -14], [-26, 18], [26, 36]];

export const FINALE_FX = {
  babu: (x, y, rng) => {
    // rng 只在这里掷。render() 里一次都不掷——每帧重掷的下场是整片雪花
    const ph = EIGHT.map(() => rng.next() * 6.28);
    const gusts = Array.from({ length: 9 }, () => ({
      y: rng.int(14, 138), len: rng.int(28, 62), bow: rng.int(-7, 7), d: rng.next() * 0.6, w: rng.next() }));
    const ash = Array.from({ length: 24 }, () => ({
      a: rng.next() * 6.283, v: rng.int(16, 46), d: rng.next() * 0.45, s: rng.int(1, 2) }));
    const grit = Array.from({ length: 18 }, () => ({
      a: rng.next() * 6.283, v: rng.int(12, 34), d: rng.next() * 0.3, s: rng.int(1, 2) }));

    return { t: 0, dur: 6.4, render(ctx, p) {
      const off = 1 - seg(p, 0.90, 1);                 // 收尾：所有东西一起退场
      wash(ctx, '#100a18', (seg(p, 0, 0.10) - seg(p, 0.90, 1)) * 0.34);
      // 八击那一段的底光。0.30 试过，太亮：暖雾把八种属性色都洗成同一个奶油色，
      // 而「看得出属性在换」恰恰是这一招唯一要说清的事。压到 0.20 并早一点收干净
      glow(ctx, x, y, 108, 'rgb(255,228,170)', pulse(p, 0.56, 0.98) * 0.20);

      // ── 起坛：一声锣，圈画出来 ──────────────────────────────────────────
      const gong = seg(p, 0, 0.13);
      if (gong > 0 && gong < 1) {
        ring(ctx, CX, CY, ease(gong) * 152, '#c8a24a', (1 - gong) ** 1.2, 3 * (1 - gong) + 0.5);
        ring(ctx, CX, CY, ease(gong) * 98, '#e8c877', (1 - gong) * 0.7, 1.6);
      }
      const rim = seg(p, 0.05, 0.16);
      if (rim > 0) {                                   // 八个神位连成的那一圈，全程都在
        ctx.save(); ctx.globalAlpha = rim * off * 0.34;
        ctx.strokeStyle = '#c8a24a'; ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let j = 0; j <= 8; j++) { const [ax, ay] = SEAT[j % 8]; j ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay); }
        ctx.stroke(); ctx.restore();
      }

      // ── 八位：亮神位 → 大像出场 → 退回神位坐下 → 轮到自己那一击时发亮 ───
      // 四个阶段一个循环画完。大像和坐像是**同一次调用**，只是位置与缩放在插值——
      // 分成两段画的话，接缝那一帧会跳一下
      for (let i = 0; i < 8; i++) {
        const el = EIGHT[i], col = COL[i], [sx, sy] = SEAT[i], [tx, ty] = STAND[i];
        const lit = seg(p, 0.015 + i * 0.013, 0.085 + i * 0.013);
        if (lit <= 0) continue;
        ring(ctx, sx, sy, 3 + lit * 3, col, lit * 0.45 * off, 0.9);

        const rise = seg(p, ARRIVE[i], ARRIVE[i] + 0.055);
        if (rise <= 0) continue;
        const back = ease(seg(p, ARRIVE[i] + 0.055, ARRIVE[i] + 0.125));
        const grow = ease(rise) * (1 - back);
        // 轮到自己那一击：坐像鼓一下，不是闪一下（局部、有起落）
        const beat = i < 8 ? pulse(p, HIT_AT(i) - 0.022, HIT_AT(i) + 0.034) : 0;
        const mx = tx + (sx - tx) * back, my = ty + (sy - ty) * back;
        const wave = el === 'dark' ? p * 4.4 + i : el === 'wind' ? p * 9 + ph[i] : ph[i];
        // 每一位自己就是一盏灯。**只画剪影不给光，八位都读成贴纸**——fxKit.js 那条
        // 「火是光源，只铺深色会压成土色」在这里同样成立，何况这一段底色压到了 0.34
        glow(ctx, mx, my, 54, RGB[i], (grow * 0.30 + beat * 0.22) * off);
        motif(ctx, el, mx, my, 0.42 + 1.05 * grow + 0.20 * beat, col,
          off * Math.min(1, rise * 3) * (0.5 + 0.5 * grow + 0.5 * beat), 0, wave);

        // 各自的招牌动作，只在大像那段做。**一位一个手势，做完就收**——
        // 八位每人都摆一整套的话，这 3 秒会糊成一团
        if (grow <= 0.01) continue;
        const a = grow * off;
        if (el === 'earth') ring(ctx, x, y + 12, 24 + grow * 44, col, a * 0.5, 1.4);         // 埕：脚下那块地
        else if (el === 'wood') beam(ctx, mx + 5, my + 12, mx + 9, my + 12 + 52 * grow, 2.4, col, a * 0.7);
        else if (el === 'water') {                                                           // 浪：底下推起三条
          ctx.save(); ctx.globalAlpha = a * 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
          for (let r = 0; r < 3; r++) {
            ctx.beginPath();
            for (let sxx = 0; sxx <= W; sxx += 8)
              ctx[sxx ? 'lineTo' : 'moveTo'](sxx, FH - 6 - r * 9 + Math.sin(sxx / 26 + ph[i] + p * 3) * 4 - grow * 7);
            ctx.stroke();
          }
          ctx.restore();
        }
        else if (el === 'fire') beam(ctx, mx - 46 * grow, my - 26 * grow, mx + 34 * grow, my + 20 * grow, 4 * grow + 0.8, col, a * 0.75);
        else if (el === 'metal') beam(ctx, W, my, W - (W + 10) * grow, my, 2.2, col, a * 0.8); // 箭道：全场唯一横着走的
        else if (el === 'light') ring(ctx, CX, CY, ease(grow) * 138, col, (1 - grow) * a * 0.8, 2.2 * (1 - grow) + 0.5);
        else if (el === 'dark') {                                                            // 阴气：不发光，是把下面那一截看不清
          ctx.save(); ctx.globalAlpha = a * 0.42;
          const gy = ctx.createLinearGradient(0, FH - 58, 0, FH);
          gy.addColorStop(0, 'rgba(60,36,92,0)'); gy.addColorStop(1, 'rgba(52,28,84,0.95)');
          ctx.fillStyle = gy; ctx.fillRect(0, FH - 58, W, 58); ctx.restore();
        }
        else for (const q of gusts) {                                                        // 風：把前面七位卷拢
          // 进度**不能挂在 grow 上**：grow 是 0→1→0，挂上去等于风刮到一半就倒着回来，
          // 而且 grow=1 那一帧 k 正好都 ≥1，全被跳过——峰值那一帧一条风线都没有。
          // 风要的是从左到右刮过去一次，所以单独走一条 0→1 的进度
          const gw = seg(p, ARRIVE[i], ARRIVE[i] + 0.125);
          const k = (gw - q.d * 0.55) / (1 - q.d * 0.55); if (k <= 0 || k >= 1) continue;
          gust(ctx, -20 + (W + 60) * ease(k), q.y, q.len, q.bow,
            q.w > 0.7 ? '#eafff8' : col, Math.sin(k * Math.PI) * 0.7 * off, 0.7 + q.w);
        }
      }

      // ── 八击：一位一击，属性跟着换 ─────────────────────────────────────
      // 每一击都是**局部**的（beam + ring + glow），连着来是热闹不是频闪——
      // 差别在面积不在次数，summonKit.js 开头那条讲的就是这件事
      for (let i = 0; i < 8; i++) {
        const k = seg(p, HIT_AT(i) - 0.020, HIT_AT(i) + 0.038);
        if (k <= 0 || k >= 1) continue;
        const el = EIGHT[i], col = COL[i], [sx, sy] = SEAT[i];
        const [ox, oy] = OFF[i % 4], tx = x + ox, ty = y + oy;
        if (el === 'dark')                                       // 影先到、刀后到（义民爷那条）
          beam(ctx, sx, sy, tx, ty, 9 * (1 - k) + 2, '#6a4a96', (1 - k) ** 0.5 * 0.45);
        beam(ctx, sx, sy, tx, ty, 4.4 * (1 - k) + 0.8, col, (1 - k) ** 0.6);
        ring(ctx, tx, ty, 4 + ease(k) * 26, col, (1 - k) * 0.9, 2.4 * (1 - k) + 0.6);
        glow(ctx, tx, ty, 46, RGB[i], (1 - k) * 0.40);
        if (el === 'fire') flame(ctx, tx, ty + 11, 17 * (1 - k), 6, ph[i] + p * 7, col);
        else if (el === 'wind') for (const j of [-1, 1]) gust(ctx, tx + j * 5, ty - 4, j * 24, j * 7, col, (1 - k) * 0.8, 1.1);
        else for (let j = 0; j < 5; j++) {
          const q = grit[(i * 5 + j) % grit.length];
          ctx.globalAlpha = (1 - k) ** 1.2 * 0.85;
          dot(ctx, tx + Math.cos(q.a + i) * q.v * k, ty + Math.sin(q.a + i) * q.v * k * 0.7, q.s, col);
        }
        ctx.globalAlpha = 1;
      }

      // ── 第八击 = 合像：八个神位同时出手，八条线收进同一点 ────────────────
      // 前七击是一位打一处，这一下是八位打同一处。整招唯一的一次全屏闪就在这里
      const fin = seg(p, 0.840, 0.910);
      if (fin > 0 && fin < 1) {
        const q = Math.sin(fin * Math.PI);
        // 八条线各自留住自己的属性色。beam() 是三层 lighter 叠加，粗一点就全糊成白的——
        // 那样合像读起来是「一团白光」，八位又白来了一趟。宽度和透明度都要克制
        for (let j = 0; j < 8; j++) beam(ctx, SEAT[j][0], SEAT[j][1], x, y, 2.6 * q + 0.5, COL[j], q * 0.85);
        for (const [ox, oy] of OFF) ring(ctx, x + ox, y + oy, 6 + ease(fin) * 30, '#ffe9b0', q * 0.75, 2 * (1 - fin) + 0.5);
        ring(ctx, x, y, ease(fin) * 124, '#ffe9b0', (1 - fin) * 0.7, 3.4 * (1 - fin) + 0.6);
      }
      // 整招唯一的一次 flash。峰值 0.40（上限 0.45），起落各 ≈0.46 秒（下限 0.08）。
      // 无条件调用、只此一处——加第二处就破了铁律，headless 那张表会立刻从 1 变 2
      flash(ctx, pulse(p, 0.795, 0.945) * 0.40, '#fff4e0');

      // ── 收：香灰落下 ───────────────────────────────────────────────────
      const end = seg(p, 0.875, 1);
      if (end > 0) {
        ring(ctx, x, y, ease(end) * 150, '#e8d79a', (1 - end) * 0.5, 2 * (1 - end) + 0.4);
        for (const q of ash) {
          const k = (end - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
          ctx.globalAlpha = (1 - k) * 0.7;
          dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7 - k * 12, q.s,
            k < 0.4 ? '#fff0c8' : '#7a6a58');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};
