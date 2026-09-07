// 召唤演出（下）：焦点在**敌方**的五位——关圣帝君、钟馗、中坛元帅、义民爷、吕布。
// 另外三位（伯公、观世音菩萨、妈祖）在 summonFxAlly.js；这个档负责把八位合并成 SUMMON_FX。
//
// 形状和 SPELL_FX 一致：`(x, y, rng) => ({ t, dur, render(ctx, p) })`，
// 所以可以直接塞进 effects.js 的 FX 表，`fx.add('guangong', x, y)` 就能放。
//
// **传进来的 (x, y)**：这五位一律传敌方那一侧的焦点——
//   · scope 'single'（中坛元帅 / 吕布）传该敌人的 scene.center(t)
//   · scope 'all' / 'random'（关圣帝君 / 钟馗 / 义民爷）传敌群中心，用 (74, 96) 就好
//     （ENEMY_CENTERS 是 [[48,62],[100,82],[48,114],[100,132]]，中心就在那里）
// 每一位的全屏部分都用固定屏幕几何，只有局部部分跟着 (x, y) 走——传偏了不好看，但不会散架。
//
// **召唤为什么要比魔法长**：魔法 1.2 秒说一件事（这一下是火）；
// 召唤 1.7–2.2 秒要说三件事（谁来了 → 他做了什么 → 走了）。中间那件必须有**剪影**，
// 因为召唤的全部意义就是「一眼认出是谁」。所以这五位各有一个认人的形：
// 关刀的月牙、乌纱帽的两只帽翅、两只火轮、六面旗、一支立着的戟。
// 演出的其余规矩（只闪一次、峰值 ≤0.45、形状优先于粒子）见 summonKit.js 开头。

import { W, FH, seg, pulse, ease, wash, flash, glow, ring, dot, poly, beam, banner, flame, inward } from './summonKit.js';
import { PARTY_X, PARTY_Y0, PARTY_DY } from './hudBits.js';
import { FX_ALLY } from './summonFxAlly.js';

// 关刀的剪影，画在原点朝上：杆往下、月牙刀身在上头。L 是杆长
function guandao(ctx, L) {
  ctx.fillStyle = '#4a3a26'; ctx.fillRect(-1.4, -L, 2.8, L);                        // 杆
  poly(ctx, [[0, -L - 1], [4, -L - 11], [11, -L - 22], [20, -L - 27],
    [23, -L - 18], [16, -L - 8], [5, -L - 2]], '#e6eef5');                          // 月牙刀身
  poly(ctx, [[-2, -L + 2], [2, -L + 2], [1, -L + 12], [-1, -L + 12]], '#8a1f1a');   // 红缨
}

const FX_ENEMY = {
  // 关圣帝君「义气」：立(0–.26) → 举(.26–.46) → 劈(.46–.64) → 护(.64–1)
  //
  // 全场唯一一个「打完还留下来」的演出，因为义气不是一记大招。
  // 刀劈完停在原地插着，同一时间我方四个座位上落下金色的光条（那就是防护）。
  // 结算要卡在劈的那一下（p≈0.56），护的那一段是给 allyStatus 用的尾巴。
  guangong: (x, y, rng) => {
    const PX = 196, PY = 148, L = 128;                 // 刀的支点在战场右下角，杆长 128
    const ang = k => -0.42 - k * 1.16;                 // 举到位是 -0.42，劈到底是 -1.58
    const gather = inward(rng, 14, x, y, 90);
    const seats = [0, 1, 2, 3].map(i => PARTY_Y0 + i * PARTY_DY + 16);
    return { t: 0, dur: 2.0, render(ctx, p) {
      wash(ctx, '#4a1410', pulse(p, 0.06, 0.90) * 0.20);
      glow(ctx, x, y, 108, 'rgb(255,120,70)', pulse(p, 0.42, 0.80) * 0.34);
      // 立：帅旗升起来，红色的火星从四面收拢
      const s = seg(p, 0, 0.30), fade = 1 - seg(p, 0.80, 1);
      if (s > 0) {
        ctx.globalAlpha = Math.min(1, s * 2) * fade;
        banner(ctx, 150, PY, 26, 58 * ease(s), p * 5.2, '#8a1f1a');
        for (const q of gather) {
          const k = Math.max(0, (s - q.d) / (1 - q.d)); if (k <= 0 || k >= 1) continue;
          const e = ease(k); ctx.globalAlpha = (1 - k) * 0.9;
          dot(ctx, q.ax + (x - q.ax) * e, q.ay + (y - q.ay) * e, q.s, '#ffb27a');
        }
      }
      // 举 → 劈：一把刀，一个动作。举得慢、劈得快，中间不加任何装饰
      const up = seg(p, 0.24, 0.48), cut = seg(p, 0.46, 0.64);
      if (up > 0) {
        ctx.save(); ctx.globalAlpha = fade;
        ctx.translate(PX, PY); ctx.rotate(ang(cut > 0 ? ease(cut) : 0) + (1 - ease(up)) * 0.5);
        guandao(ctx, L); ctx.restore();
      }
      // 刀痕：白色的一道，横贯敌群。整段唯一的一次闪就压在这里
      if (cut > 0 && cut < 1) {
        flash(ctx, Math.sin(cut * Math.PI) * 0.38, '#fff0d8');
        const a0 = ang(0), a1 = ang(ease(cut));
        beam(ctx, PX + Math.sin(a0) * L, PY - Math.cos(a0) * L,
          PX + Math.sin(a1) * L, PY - Math.cos(a1) * L, 5 * (1 - cut) + 1, '#ffffff', 1 - cut);
      }
      // 护：我方四个座位上落下一道金光条。这一段是给 allyStatus 看的，不该抢戏
      const g = seg(p, 0.60, 1);
      if (g > 0) for (const sy of seats) {
        const k = Math.min(1, g * 1.6);
        ctx.globalAlpha = Math.sin(Math.min(1, g) * Math.PI) * 0.55;
        ctx.fillStyle = '#ffd98a'; ctx.fillRect(PARTY_X + 1, sy - 26 * k, 14, 26 * k);
        ring(ctx, PARTY_X + 8, sy, 11 * k, '#ffe9b0', 0.7, 1.2);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 钟馗「跳钟馗」：锣(0–.20) → 炮(.20–.54) → 影(.54–.72) → 扫(.72–1)
  //
  // 鞭炮串是这一段的主角，也是最容易做成频闪的地方。做法：十二个**局部**小亮点
  // 依次炸，每个只有几像素，全程不碰 flash()。局部亮点连着来是热闹，
  // 全屏白光连两次就是晃眼——差别在面积，不在次数。整段的那一次闪留给剪影现身。
  zhongkui: (x, y, rng) => {
    const pops = Array.from({ length: 12 }, (_, i) => ({
      x: 18 + i * 19 + rng.int(-4, 4), y: 34 + rng.int(-10, 10), at: i / 12, r: rng.int(7, 13) }));
    const soot = Array.from({ length: 18 }, () => ({
      a: rng.next() * 6.283, v: rng.int(14, 34), d: rng.next() * 0.4, s: rng.int(1, 2) }));
    return { t: 0, dur: 2.0, render(ctx, p) {
      wash(ctx, '#0d0a14', (seg(p, 0, 0.22) - seg(p, 0.76, 1)) * 0.44);
      // 锣：一圈铜色的环。响一声，场子就归他了
      const g = seg(p, 0, 0.26);
      if (g > 0 && g < 1) {
        ring(ctx, W / 2, FH / 2, ease(g) * 150, '#c8a24a', (1 - g) ** 1.2, 3 * (1 - g) + 0.5);
        ring(ctx, W / 2, FH / 2, ease(g) * 96, '#e8c877', (1 - g) * 0.7, 1.6);
      }
      // 炮：一串从左炸到右
      const f = seg(p, 0.18, 0.58);
      if (f > 0 && f < 1) for (const q of pops) {
        const k = (f - q.at) / 0.22; if (k <= 0 || k >= 1) continue;
        glow(ctx, q.x, q.y, q.r * 2.4, 'rgb(255,210,140)', (1 - k) * 0.5);
        ctx.globalAlpha = (1 - k) ** 0.7; ctx.fillStyle = '#fff6d8';
        ctx.beginPath(); ctx.arc(q.x, q.y, 1.5 + k * 4, 0, 6.29); ctx.fill();
        ring(ctx, q.x, q.y, 2 + ease(k) * q.r, '#ffcf8a', (1 - k) * 0.8, 1.2);
      }
      // 影：乌纱帽的两只帽翅 + 虬髯 + 一把剑。黑剪影压红边，只现身一下就没
      const s = seg(p, 0.52, 0.76);
      if (s > 0 && s < 1) {
        const a = Math.sin(s * Math.PI);
        flash(ctx, a * 0.34, '#ffd9c0');
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.8); ctx.translate(x, y - 4);
        poly(ctx, [[-14, -12], [-7, -12], [-7, -9], [-14, -9]], '#1a1018');            // 左帽翅
        poly(ctx, [[7, -12], [14, -12], [14, -9], [7, -9]], '#1a1018');                // 右帽翅
        poly(ctx, [[-7, -6], [-6, -16], [6, -16], [7, -6]], '#1a1018');                // 帽体
        ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.arc(0, -1, 6, 0, 6.29); ctx.fill();
        poly(ctx, [[-6, 2], [6, 2], [4, 14], [0, 17], [-4, 14]], '#231524');           // 虬髯
        ctx.strokeStyle = '#e8564a'; ctx.lineWidth = 0.8;                              // 红边
        ctx.strokeRect(-7, -16, 14, 10);
        beam(ctx, 10, 6, 30, -10, 2.4, '#ffe9c8', a * 0.9);                            // 剑
        ctx.restore();
      }
      // 扫：一把扫帚扫过敌人那一侧，扫过的地方盖下一层暗——致盲就长这样
      const b = seg(p, 0.70, 1);
      if (b > 0) {
        const sx = W * 0.72 - ease(b) * (W * 0.72);
        ctx.save(); ctx.globalAlpha = Math.sin(Math.min(1, b) * Math.PI) * 0.5;
        ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, Math.max(0, sx + 40), FH);
        ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(sx + 34, 30 + i * 3); ctx.lineTo(sx + 6, 18 + i * 14); ctx.stroke(); }
        ctx.restore();
        for (const q of soot) {
          const k = (b - q.d) / (1 - q.d); if (k <= 0) continue;
          ctx.globalAlpha = (1 - k) * 0.6;
          dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7, q.s, '#6a5a48');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 中坛元帅「三头六臂」：轮(0–.26) → 绫(.26–.44) → 击×3(.44–.84) → 收(.84–1)
  //
  // 三段伤害要看得出是三下，所以三次乾坤圈砸下来的间隔是死的（0.13），
  // 前两下只给局部的光，第三下才闪一次全屏。三下一样亮就没有终点了。
  nezha: (x, y, rng) => {
    const wheels = [{ from: -30, to: x - 26 }, { from: W + 30, to: x + 26 }];
    const spark = Array.from({ length: 20 }, () => ({
      a: rng.next() * 6.283, v: rng.int(16, 44), d: rng.next() * 0.5, s: rng.int(1, 2) }));
    const ph = rng.next() * 6.28;
    return { t: 0, dur: 1.9, render(ctx, p) {
      wash(ctx, '#5a1e04', pulse(p, 0.10, 0.92) * 0.16);
      glow(ctx, x, y, 96, 'rgb(255,150,50)', pulse(p, 0.20, 0.94) * 0.40);
      // 轮：两只火轮从画面两侧滚进来，滚到目标两边停住
      const r = seg(p, 0, 0.30), out = seg(p, 0.86, 1);
      if (r > 0) for (const w of wheels) {
        const cx = w.from + (w.to - w.from) * ease(Math.min(1, r)) + (w.from < 0 ? -1 : 1) * out * 90;
        const spin = p * 9 + ph;
        ctx.globalAlpha = 1 - out;
        ctx.strokeStyle = '#ffc832'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(cx, y + 12, 11, 7, 0, 0, 6.29); ctx.stroke();
        ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 2.2;
        for (let i = 0; i < 10; i++) {                       // 沿轮缘的火舌
          const a = i * 0.628 + spin, len = 5 + Math.sin(a * 3 + p * 7) * 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * 11, y + 12 + Math.sin(a) * 7);
          ctx.lineTo(cx + Math.cos(a) * (11 + len), y + 12 + Math.sin(a) * (7 + len * 0.6));
          ctx.stroke();
        }
      }
      // 绫：混天绫甩出一条 S。红色的一笔，只这一笔，不加光
      const s = seg(p, 0.24, 0.52);
      if (s > 0 && s < 1) {
        ctx.save(); ctx.globalAlpha = Math.sin(s * Math.PI) * 0.9;
        ctx.strokeStyle = '#e0333f'; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.lineWidth = 4 - i * 1.2; ctx.strokeStyle = i ? '#e0333f' : '#ff8a94';
          ctx.beginPath(); ctx.moveTo(x - 60 + s * 30, y - 40);
          ctx.quadraticCurveTo(x + 40 - s * 20, y - 24 + i * 2, x - 20 + s * 60, y + 22);
          ctx.stroke();
        }
        ctx.restore();
      }
      // 击×3：乾坤圈砸下来三次。第三下才允许闪一次全屏
      for (let i = 0; i < 3; i++) {
        const k = seg(p, 0.44 + i * 0.13, 0.58 + i * 0.13);
        if (k <= 0 || k >= 1) continue;
        ring(ctx, x, y, 34 * (1 - ease(k)) + 5, '#ffe07a', 1 - k * 0.4, 2.6 * (1 - k) + 0.8);
        if (k > 0.55) {
          glow(ctx, x, y, 60, 'rgb(255,190,90)', (k - 0.55) * 1.4);
          for (let j = 0; j < 3; j++) flame(ctx, x + (j - 1) * 7, y + 12, 18 * (1 - k), 6, ph + j + p * 6, j === 1 ? '#fff6d0' : '#ff9a3c');
        }
      }
      // 只有第三下闪，而且**单独走一条更宽的曲线**：挂在那 0.14 宽的命中段上
      // 起落只有 0.055 秒，低于 0.08 秒的下限——那就是频闪，不是冲击
      flash(ctx, pulse(p, 0.70, 0.92) * 0.32, '#ffdca0');
      // 收：余火四散
      const emb = seg(p, 0.70, 1);
      if (emb > 0) for (const q of spark) {
        const k = (emb - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (1 - k) * 0.8;
        dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7 - k * 10, q.s, '#ffb457');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 义民爷「六堆齐到」：号(0–.20) → 旗(.20–.48) → 阵(.48–.62) → 斩×6(.58–.90) → 收(.90–1)
  //
  // 请的不是神，是人，所以整段没有一点神光：暗红的天、六面旗、一排看不清脸的人影、六下刀。
  // 六面旗是这一位的剪影——也是「六堆」这三个字在画面上唯一说得清的方式。
  yimin: (x, y, rng) => {
    const flags = Array.from({ length: 6 }, (_, i) => ({
      x: 22 + i * 38, h: rng.int(46, 60), d: i * 0.045, ph: rng.next() * 6.28 }));
    const men = Array.from({ length: 11 }, () => ({
      x: rng.int(10, 240), h: rng.int(16, 26), w: rng.int(5, 8), d: rng.next() * 0.3 }));
    const cuts = Array.from({ length: 6 }, (_, i) => ({
      at: 0.58 + i * 0.052, x: x + rng.int(-40, 40), y: y + rng.int(-34, 34), a: rng.next() * 3.14 }));
    const ash = Array.from({ length: 16 }, () => ({
      x: rng.int(10, 240), y: rng.int(40, 130), v: rng.int(10, 26), d: rng.next() * 0.4 }));
    return { t: 0, dur: 2.1, render(ctx, p) {
      wash(ctx, '#1a0c10', (seg(p, 0, 0.24) - seg(p, 0.84, 1)) * 0.40);
      // 号：地平线上一道暗红。号角听不见，但天先红了
      const h = pulse(p, 0.02, 0.44);
      if (h > 0.01) {
        ctx.save(); ctx.globalAlpha = h * 0.5;
        const gr = ctx.createLinearGradient(0, FH - 46, 0, FH);
        gr.addColorStop(0, 'rgba(140,40,30,0)'); gr.addColorStop(1, 'rgba(180,60,40,0.9)');
        ctx.fillStyle = gr; ctx.fillRect(0, FH - 46, W, 46); ctx.restore();
      }
      // 旗：六面依次从下沿升起。一堆出事，各堆都要出人——所以是六面，不是一面
      const f = seg(p, 0.18, 0.52), down = seg(p, 0.88, 1);
      if (f > 0) for (const q of flags) {
        const k = Math.max(0, Math.min(1, (f - q.d) / (1 - q.d))); if (k <= 0) continue;
        ctx.globalAlpha = 1 - down;
        banner(ctx, q.x, FH - 6, 22, q.h * ease(k) * (1 - down * 0.8), p * 4.4 + q.ph, '#8f2a20');
      }
      // 阵：旗后面推上来一排人影。看不清脸，也不该看清
      const m = seg(p, 0.44, 0.66);
      if (m > 0) for (const q of men) {
        const k = Math.max(0, (m - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = Math.min(1, k) * (1 - down) * 0.75;
        const by = FH - 8 - ease(k) * 12;
        poly(ctx, [[q.x, by], [q.x, by - q.h], [q.x + q.w / 2, by - q.h - 4],
          [q.x + q.w, by - q.h], [q.x + q.w, by]], '#241016');
      }
      // 斩×6：六道刀光依次划过。第四道压全场唯一的一次闪——放在中间，收得住
      for (let i = 0; i < cuts.length; i++) {
        const q = cuts[i], k = seg(p, q.at, q.at + 0.10);
        if (k <= 0 || k >= 1) continue;
        const dx = Math.cos(q.a) * 26, dy = Math.sin(q.a) * 16;
        beam(ctx, q.x - dx, q.y - dy, q.x + dx, q.y + dy, 3.4 * (1 - k) + 0.8, '#fff2dc', (1 - k) ** 0.7);
        if (i === 3) flash(ctx, Math.sin(k * Math.PI) * 0.30, '#ffd8c0');
      }
      // 收：旗降下，人散成灰
      if (down > 0) for (const q of ash) {
        const k = (down - q.d * 0.5) * 2; if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (1 - k) * 0.7;
        dot(ctx, q.x + Math.sin(k * 3 + q.y) * 3, q.y - q.v * k, 1, k < 0.4 ? '#e0cbb0' : '#7a6a58');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 吕布「辕门射戟」：立(0–.24) → 张(.24–.48) → 射(.48–.56) → 震(.56–1)
  //
  // 全场唯一一个**横着走**的演出。别的召唤都是从天而降或从中心炸开，这一位是一条水平线
  // 从右穿到左——因为辕门射戟本来就是「一箭，一百五十步，射中戟上的小枝」。
  // 尾巴上那几点蓝的是施术者的 MP 被抽走（drain）。他不受香火，请他要付别的。
  lubu: (x, y, rng) => {
    const bx = 232, by = y - 6;                            // 弓在右边，跟队伍同一侧
    const shards = Array.from({ length: 14 }, () => ({
      a: rng.next() * 6.283, v: rng.int(14, 38), d: rng.next() * 0.4, s: rng.int(1, 2) }));
    const drain = Array.from({ length: 12 }, () => ({
      y: PARTY_Y0 + rng.int(0, 3) * PARTY_DY + rng.int(0, 14), d: rng.next() * 0.5 }));
    return { t: 0, dur: 1.8, render(ctx, p) {
      // 张：整场压暗，只留过箭那一条水平亮带。暗是为了让那条线看得见
      wash(ctx, '#0a0c10', (seg(p, 0.20, 0.44) - seg(p, 0.58, 0.86)) * 0.46);
      const lane = pulse(p, 0.26, 0.66);
      if (lane > 0.01) { ctx.save(); ctx.globalAlpha = lane * 0.18; ctx.fillStyle = '#c9d6e8'; ctx.fillRect(0, by - 7, W, 14); ctx.restore(); }
      // 立：戟插在目标那里——杆、尖、外加一枝月牙形的小枝，射的就是那个小枝
      const st = seg(p, 0, 0.26), fall = seg(p, 0.66, 1);
      if (st > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, st * 1.6);
        // 被射中之后戟震两下再倒。是转动不是明暗，幅度 3° 左右，不做高频通断
        const tr = seg(p, 0.54, 0.74);
        ctx.translate(x, y + 14);
        ctx.rotate(fall * 1.15 + (tr > 0 && tr < 1 ? Math.sin(tr * 12.5) * 0.055 * (1 - tr) : 0));
        const hh = 46 * ease(Math.min(1, st));
        ctx.fillStyle = '#3b2a1c'; ctx.fillRect(-1.2, -hh, 2.4, hh);
        poly(ctx, [[-2, -hh], [0, -hh - 11], [2, -hh]], '#cdd8e2');                       // 枪尖
        poly(ctx, [[2, -hh + 6], [11, -hh + 2], [13, -hh + 9], [3, -hh + 12]], '#cdd8e2');// 小枝
        ctx.restore();
      }
      // 张：一张弓拉满。两条线夹角越收越紧
      const d = seg(p, 0.22, 0.50);
      if (d > 0 && d < 1) {
        const pull = ease(d) * 9;
        ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d8cba8'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx, by - 16); ctx.quadraticCurveTo(bx + 9, by, bx, by + 16); ctx.stroke();
        ctx.strokeStyle = '#f2ead2'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(bx, by - 16); ctx.lineTo(bx - pull, by); ctx.lineTo(bx, by + 16); ctx.stroke();
        ctx.restore();
      }
      // 射：一条极细的线横穿画面，快到只看得见拖影。整段唯一的一次闪
      const sh = seg(p, 0.46, 0.60);
      if (sh > 0 && sh < 1) {
        const hx = bx - (bx - x) * ease(sh);
        flash(ctx, Math.sin(sh * Math.PI) * 0.34, '#eef4ff');
        beam(ctx, Math.min(bx, hx + 46), by, hx, by, 2.2, '#ffffff', 1 - sh * 0.3);
      }
      // 震：戟被射中，碎屑四散；同时几点蓝的从右边被抽走——那是施术者的 MP
      if (fall > 0) {
        glow(ctx, x, y, 54, 'rgb(200,220,255)', (1 - fall) * 0.35);
        for (const q of shards) {
          const k = (fall - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
          ctx.globalAlpha = (1 - k) ** 1.2;
          dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7 + k * k * 12, q.s, k < 0.4 ? '#ffffff' : '#8fa8c4');
        }
        ring(ctx, x, y + 14, ease(fall) * 40, '#9fb4d0', (1 - fall) * 0.6, 1.4);
        for (const q of drain) {
          const k = (fall - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
          ctx.globalAlpha = (1 - k) * 0.85;
          dot(ctx, PARTY_X + 8 - k * 34, q.y - k * 8, 1, '#7fb0e8');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};

// 八位合起来。形状与 SPELL_FX 一致，可以直接并进 effects.js 的 FX 表
export const SUMMON_FX = { ...FX_ALLY, ...FX_ENEMY };
