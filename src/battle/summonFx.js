// 召唤演出（下）：焦点在**敌方**的三位——钟馗（光）、中坛元帅（風）、义民爷（暗）。
// 另外三位（伯公、观世音菩萨、妈祖）在 summonFxAlly.js，
// 拿刀的两位（关圣帝君、吕布）在 summonFxWar.js——那两位是一对，理由写在那个档头上。
// 这个档负责把八位（加上【八部齐至】共九个）合并成 SUMMON_FX。
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
// **召唤为什么要比魔法长**：魔法 1.2 秒说一件事（这一下是火）；召唤 1.7–2.2 秒要说三件事
// （谁来了 → 他做了什么 → 走了）。中间那件必须有**剪影**——召唤的全部意义就是「一眼认出是谁」。
// 五个认人的形：关刀的月牙、乌纱帽的两只帽翅、两只火轮、六面旗、一支立着的戟。
// 演出的其余规矩（只闪一次、峰值 ≤0.45、形状优先于粒子）见 summonKit.js 开头。
//
// **配色跟属性走**（八属性见 battle/elements.js）：关帝改火（本来就是暗红天 + 橙光，
// 是数据落后于演出）、中坛元帅改風、义民爷改暗、吕布改金。各自的做法写在下面每一位头上。
// 以前关帝和钟馗两位都挂 light，现在光只剩钟馗一位。

import { W, FH, seg, pulse, ease, wash, flash, glow, ring, dot, poly, beam, banner, flame, gust } from './summonKit.js';
import { FX_ALLY } from './summonFxAlly.js';
import { FINALE_FX } from './summonFxFinale.js';
import { FX_WAR } from './summonFxWar.js';

const FX_ENEMY = {

  // 钟馗「跳钟馗」：锣(0–.20) → 炮(.20–.54) → 影(.54–.72) → 扫(.72–1)
  //
  // **属性光**，八位里唯一的一位（关帝改成火之后就不撞了）。整段的看点就是
  // 「先把场子压黑，再一串火把点过去」，那正是光该长的样子，所以配色一个都没动。
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
  // **属性風**——风火轮，風在前面。火轮不能拿掉（那是认他的剪影），
  // 所以改法是换层次：底色、扩散的光、三下乾坤圈全走风的青白，
  // **火只留在轮缘那一圈火舌和收尾的余烬上**——风在前、火在后，才读得成风火轮，
  // 而不是一个青色的火球。轮后拖的风线是这次加的：轮在转，要靠被它带起来的东西说。
  //
  // 三段伤害要看得出是三下，所以三次乾坤圈砸下来的间隔是死的（0.13），
  // 前两下只给局部的光，第三下才闪一次全屏。三下一样亮就没有终点了。
  nezha: (x, y, rng) => {
    const wheels = [{ from: -30, to: x - 26 }, { from: W + 30, to: x + 26 }];
    const spark = Array.from({ length: 20 }, () => ({
      a: rng.next() * 6.283, v: rng.int(16, 44), d: rng.next() * 0.5, s: rng.int(1, 2) }));
    // 满场的风线：位置一次定死，逐帧只推进度（逐帧掷骰会闪成噪点）
    const gusts = Array.from({ length: 7 }, () => ({
      y: rng.int(16, 132), len: rng.int(30, 64), bow: rng.int(-7, 7), d: rng.next() * 0.6, w: rng.next() }));
    const ph = rng.next() * 6.28;
    return { t: 0, dur: 1.9, render(ctx, p) {
      wash(ctx, '#123c38', pulse(p, 0.10, 0.92) * 0.18);
      glow(ctx, x, y, 96, 'rgb(150,240,215)', pulse(p, 0.20, 0.94) * 0.34);
      // 风：几条横过整个战场的线，从左往右刮。全程都有，是这一段的底
      const gp = seg(p, 0.04, 0.94);
      for (const q of gusts) {
        const k = (gp - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
        gust(ctx, -20 + (W + 60) * ease(k), q.y, q.len, q.bow,
          q.w > 0.7 ? '#eafff8' : '#9fe8d4', Math.sin(k * Math.PI) * 0.55, 0.7 + q.w);
      }
      // 轮：两只火轮从画面两侧滚进来，滚到目标两边停住
      const r = seg(p, 0, 0.30), out = seg(p, 0.86, 1);
      if (r > 0) for (const w of wheels) {
        const cx = w.from + (w.to - w.from) * ease(Math.min(1, r)) + (w.from < 0 ? -1 : 1) * out * 90;
        const spin = p * 9 + ph;
        ctx.globalAlpha = 1 - out;
        // 轮后面拖两条风线：轮在转这件事要靠被它带起来的东西说
        gust(ctx, cx - 26 * Math.sign(w.to - w.from || 1), y + 8, 22, 5, '#cdf6ea', (1 - out) * 0.7, 1);
        gust(ctx, cx - 22 * Math.sign(w.to - w.from || 1), y + 17, 17, -4, '#9fe8d4', (1 - out) * 0.5, 0.8);
        ctx.strokeStyle = '#ffc832'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(cx, y + 12, 11, 7, 0, 0, 6.29); ctx.stroke();
        ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 2.2;
        for (let i = 0; i < 10; i++) {                       // 沿轮缘的火舌（火只留在这一圈）
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
        ring(ctx, x, y, 34 * (1 - ease(k)) + 5, '#cff8ec', 1 - k * 0.4, 2.6 * (1 - k) + 0.8);
        if (k > 0.55) {
          glow(ctx, x, y, 60, 'rgb(170,240,220)', (k - 0.55) * 1.4);
          // 正中一条火舌（轮上带下来的），两边是被砸出去的风
          flame(ctx, x, y + 12, 18 * (1 - k), 6, ph + p * 6, '#fff6d0');
          for (const j of [-1, 1]) gust(ctx, x + j * 6, y + 6 - k * 8, j * 26, j * 8, '#eafff8', (1 - k) * 0.85, 1.1);
        }
      }
      // 只有第三下闪，而且**单独走一条更宽的曲线**：挂在那 0.14 宽的命中段上
      // 起落只有 0.055 秒，低于 0.08 秒的下限——那就是频闪，不是冲击
      flash(ctx, pulse(p, 0.70, 0.92) * 0.32, '#dff8f0');
      // 收：风把余烬卷散。三个点里有一个是暖的——轮子烧过的那一份
      const emb = seg(p, 0.70, 1);
      if (emb > 0) for (const q of spark) {
        const k = (emb - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (1 - k) * 0.8;
        dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7 - k * 10, q.s,
          q.v % 3 === 0 ? '#ffb457' : '#bff2e4');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 义民爷「六堆齐到」：号(0–.20) → 旗(.20–.48) → 阵(.48–.62) → 斩×6(.58–.90) → 收(.90–1)
  //
  // **属性暗**：请的是三百年前替这庄死过的人，阴兵就是阴兵——跟好兄弟同一种东西
  // （两边现在同属性），差别只在一个有主、一个无主。所以这不是「反派的暗」：
  // 底色换暗紫、地面漫一层阴气、六道刀光各拖一道紫黑的影子。
  // **刀本身还是白的**（他们拿的是刀，不是法术），旗也还是红的（那是义民旗，是身份）。
  //
  // 请的不是神，是人，所以整段没有一点神光：暗紫的天、六面旗、一排看不清脸的人影、六下刀。
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
      wash(ctx, '#150f24', (seg(p, 0, 0.24) - seg(p, 0.84, 1)) * 0.44);
      // 号：地平线上一道暗红。号角听不见，但天先红了
      const h = pulse(p, 0.02, 0.44);
      if (h > 0.01) {
        ctx.save(); ctx.globalAlpha = h * 0.5;
        const gr = ctx.createLinearGradient(0, FH - 46, 0, FH);
        gr.addColorStop(0, 'rgba(140,40,30,0)'); gr.addColorStop(1, 'rgba(180,60,40,0.9)');
        ctx.fillStyle = gr; ctx.fillRect(0, FH - 46, W, 46); ctx.restore();
      }
      // 阴：旗立起来之后地面漫上一层阴气，人是从这里面走出来的。
      // 用渐变不用亮点——阴气不发光，它是把底下那一截「看不清」
      const yin = pulse(p, 0.30, 0.92);
      if (yin > 0.01) {
        ctx.save(); ctx.globalAlpha = yin * 0.45;
        const gy = ctx.createLinearGradient(0, FH - 62, 0, FH);
        gy.addColorStop(0, 'rgba(60,36,92,0)'); gy.addColorStop(1, 'rgba(52,28,84,0.95)');
        ctx.fillStyle = gy; ctx.fillRect(0, FH - 62, W, 62); ctx.restore();
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
          [q.x + q.w, by - q.h], [q.x + q.w, by]], '#1c1226');
      }
      // 斩×6：六道刀光依次划过。第四道压全场唯一的一次闪——放在中间，收得住
      for (let i = 0; i < cuts.length; i++) {
        const q = cuts[i], k = seg(p, q.at, q.at + 0.10);
        if (k <= 0 || k >= 1) continue;
        const dx = Math.cos(q.a) * 26, dy = Math.sin(q.a) * 16;
        // 影先到、刀后到：紫黑的一道拖在白刀后面，慢半拍、宽一倍
        beam(ctx, q.x - dx * 1.15, q.y - dy * 1.15, q.x + dx * 1.15, q.y + dy * 1.15,
          6 * (1 - k) + 1.4, '#6a4a96', (1 - k) ** 0.5 * 0.6);
        beam(ctx, q.x - dx, q.y - dy, q.x + dx, q.y + dy, 3.4 * (1 - k) + 0.8, '#fff2dc', (1 - k) ** 0.7);
        if (i === 3) flash(ctx, Math.sin(k * Math.PI) * 0.30, '#d9c8f2');
      }
      // 收：旗降下，人散成灰
      if (down > 0) for (const q of ash) {
        const k = (down - q.d * 0.5) * 2; if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (1 - k) * 0.7;
        dot(ctx, q.x + Math.sin(k * 3 + q.y) * 3, q.y - q.v * k, 1, k < 0.4 ? '#cbb6e0' : '#584a6a');
      }
      ctx.globalAlpha = 1;
    } };
  },
};

// 八位合起来。形状与 SPELL_FX 一致，可以直接并进 effects.js 的 FX 表
// （八尊练满才解锁的【八部齐至】在 summonFxFinale.js，键 babu，一并汇总进来）
export const SUMMON_FX = { ...FX_ALLY, ...FX_ENEMY, ...FX_WAR, ...FINALE_FX };
