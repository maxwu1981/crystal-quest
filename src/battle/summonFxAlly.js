// 召唤演出（上）：焦点在**我方**的三位——伯公（土）、观世音菩萨（木）、妈祖（水）。
//
// 这三位现在也打敌方全体（data/summons.json 全部改成 target:'enemy' + scope:'all'），
// 但演出的重心仍然在我方：她们的伤害是顺手的，我方那一侧才是她们之所以是她们。
// 所以这个档的结构一点没动，动的是**配色要对上属性**——
// 伯公本来就是一整套土色（埕、田字、土墙），零改动；
// 观音原本是一片水蓝，跟妈祖撞色，现在改成杨柳的绿（她手上那枝本来就是活的）；
// 妈祖的海推到全程，不再在中段退掉——水是她的底，不是开场白。
//
// 八位拆两个档，缝就切在「传进来的 (x, y) 是队伍中心还是敌群中心」。
// 这三位的效果全落在自家人身上，所以它们不怎么用那个 (x, y)：
// 队伍站位是固定的（hudBits 的 PARTY_X / PARTY_Y0 / PARTY_DY），直接算出四个座位，
// 演出按座位走。(x, y) 只当作「整场的重心」用来定全屏光源的位置，传队伍中心 (212, 88) 即可，
// 传偏了也不会散架。另外五位在 summonFx.js，那个档同时负责合并导出 SUMMON_FX。
//
// 演出规矩见 summonKit.js 开头：全屏只闪一次、峰值 ≤0.45、形状优先于粒子。
// 这三位里只有妈祖闪一次（她是「暗到底的时候亮起来的那一点」，那一下就是她的全部）；
// 伯公与观音全程不闪——照 spellFx.js 的 heal 那条：这是好事，不是打击。

import { W, FH, seg, pulse, ease, wash, flash, glow, ring, dot, poly, beam } from './summonKit.js';
import { PARTY_X, PARTY_Y0, PARTY_DY } from './hudBits.js';

// 四个座位的「脚下」坐标。actorRect 里队员的脚落在 PARTY_Y0 + i*PARTY_DY + 16，
// 精灵约 16 逻辑像素宽，所以横向中心是 PARTY_X + 8
const SEATS = [0, 1, 2, 3].map(i => [PARTY_X + 8, PARTY_Y0 + i * PARTY_DY + 16]);

export const FX_ALLY = {
  // 伯公「田头田尾」：埕(0–.22) → 田(.22–.50) → 净(.50–.74) → 墙(.74–1)
  //
  // **属性土**——这一段本来就是一整套土色（埕、田字、土墙、脚下的尘），
  // 定属性的时候是照着它挑的，不是反过来，所以一个颜色都没动。
  // 他是最日常的一位，所以演出刻意不华丽：土色、红纸、一个「田」字。
  // 「田」写在整个战场上是这一段的主意——伯公管的是田头田尾，
  // 那就把战场当成他的田。四条线从中心长出来，比任何光效都说得清他是谁。
  bogong: (x, y, rng) => {
    const dust = Array.from({ length: 16 }, () => ({
      dx: rng.int(-9, 9), v: rng.int(10, 26), d: rng.next() * 0.5, s: rng.int(1, 2) }));
    const bricks = Array.from({ length: 9 }, (_, i) => ({ dx: i * 5 - 20, h: rng.int(5, 9), d: rng.next() * 0.3 }));
    return { t: 0, dur: 1.7, render(ctx, p) {
      wash(ctx, '#7a5a2e', pulse(p, 0.06, 0.94) * 0.20);
      glow(ctx, x, y, 96, 'rgb(210,170,90)', pulse(p, 0.10, 0.90) * 0.30);
      // 埕：每个座位脚下亮起一块方形的地，像伯公坛前那块埕
      const g = seg(p, 0, 0.26);
      if (g > 0) for (const [sx, sy] of SEATS) {
        ctx.globalAlpha = Math.min(1, g * 1.4) * (1 - seg(p, 0.80, 1)) * 0.55;
        ctx.fillStyle = '#e8c274';
        ctx.beginPath(); ctx.ellipse(sx, sy, 11 * ease(g), 4 * ease(g), 0, 0, 6.29); ctx.fill();
      }
      // 田：外框 + 中间一横一竖，四条线都从中心往两头长
      const f = seg(p, 0.22, 0.52), fade = 1 - seg(p, 0.74, 1);
      if (f > 0 && fade > 0) {
        const k = ease(f), cx = W / 2, cy = FH / 2, hw = 100 * k, hh = 58 * k;
        ctx.save(); ctx.globalAlpha = fade * 0.8; ctx.lineWidth = 1.2; ctx.strokeStyle = '#e0b465';
        ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2);
        ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx, cy + hh);
        ctx.moveTo(cx - hw, cy); ctx.lineTo(cx + hw, cy); ctx.stroke(); ctx.restore();
      }
      // 净：一圈土色的环由脚往头扫过每个人，扫过的地方把秽气（紫点）弹出去
      const c = seg(p, 0.48, 0.78);
      if (c > 0 && c < 1) for (const [sx, sy] of SEATS) {
        ring(ctx, sx, sy - c * 26, 12 - c * 4, '#ffe6a8', Math.sin(c * Math.PI) * 0.9, 1.6);
        for (const q of dust) {
          const kk = (c - q.d) / (1 - q.d); if (kk <= 0) continue;
          ctx.globalAlpha = (1 - kk) * 0.7;
          dot(ctx, sx + q.dx * (1 + kk), sy - q.v * kk, q.s, kk < 0.5 ? '#c9a3e0' : '#6a4a86');
        }
      }
      // 墙：队伍前面垒起一道矮土墙，最上头压一张红纸。防护就长这样，不发光
      const b = seg(p, 0.70, 1);
      if (b > 0) for (const [sx, sy] of SEATS) {
        ctx.globalAlpha = Math.min(1, b * 3) * (1 - seg(p, 0.88, 1));
        for (const q of bricks) {
          const kk = Math.max(0, Math.min(1, (b - q.d) / 0.4)); if (kk <= 0) continue;
          const h = q.h * ease(kk);
          ctx.fillStyle = '#8a6636'; ctx.fillRect(sx - 14 + q.dx * 0.55, sy - h, 3, h);
        }
        ctx.fillStyle = '#c0342b'; ctx.fillRect(sx - 13, sy - 11, 4, 6);
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 观世音菩萨「杨枝甘露」：现(0–.24) → 倾(.24–.42) → 洒(.42–.82) → 莲(.82–1)
  //
  // **属性木**：她手上那枝杨柳是活的，六鎮物的樹心那一件也归她。
  // 原本整段是水蓝的，跟妈祖撞在一起（两位都从天上洒水下来），现在底色换成杨柳绿，
  // 只有**甘露的头**还留着水白——那是瓶里的水，落下来的一路才是她的属性。
  // 柳枝也画粗了、多了两片叶：认人的剪影是净瓶 + 那一枝，枝太细就只剩瓶。
  //
  // 她不打人，所以整段没有一次爆开，也没有闪光——这一位的节奏是「落下来」。
  // 认人靠净瓶的剪影：细颈、宽肩、收底。那个轮廓比任何光晕都好认，
  // 而且跟妈祖（从下往上托）刚好是反方向，两位放在一起不会混。
  guanyin: (x, y, rng) => {
    const VASE = [[-1.6, 0], [-1.6, 6], [-5, 9], [-6.4, 15], [-5.4, 23], [-3.6, 26],
      [3.6, 26], [5.4, 23], [6.4, 15], [5, 9], [1.6, 6], [1.6, 0]];
    const drops = Array.from({ length: 34 }, () => ({
      seat: rng.int(0, 3), dx: rng.int(-11, 11), d: rng.next() * 0.62, sway: rng.next() * 6.28, s: rng.int(1, 2) }));
    const leaves = Array.from({ length: 7 }, (_, i) => ({ k: 0.14 + i * 0.13, o: rng.int(-3, 3) }));
    return { t: 0, dur: 2.0, render(ctx, p) {
      wash(ctx, '#2c5236', pulse(p, 0.05, 0.95) * 0.16);
      glow(ctx, x, y, 104, 'rgb(168,228,150)', pulse(p, 0.34, 0.96) * 0.22);
      const vx = W / 2 + 34, vy = 20;
      // 现 + 倾：净瓶浮出来，然后瓶口朝队伍那一侧转过去
      const a = seg(p, 0, 0.26), tilt = seg(p, 0.24, 0.44) * 0.85;
      if (a > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5) * (1 - seg(p, 0.86, 1));
        ctx.translate(vx, vy + (1 - ease(a)) * -10); ctx.rotate(tilt);
        poly(ctx, VASE, '#f2f8ff');
        poly(ctx, VASE.map(([px, py]) => [px * 0.5, py * 0.55 + 3]), '#cfe6f2');   // 瓶身的暗面
        ctx.strokeStyle = '#9ad48c'; ctx.lineWidth = 1.1;                          // 杨柳枝
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(7, -12, 3, -26); ctx.stroke();
        for (const L of leaves) {
          const lx = 7 * Math.sin(L.k * 2) + L.o * 0.4, ly = -L.k * 26;
          poly(ctx, [[lx, ly], [lx + 3.2, ly + 1.6], [lx + 0.6, ly + 4]], '#7ec272');
        }
        ctx.restore();
      }
      // 洒：一道水线从瓶口挂下来，散成许多下落的甘露
      const s = seg(p, 0.40, 0.86);
      if (s > 0 && s < 1) {
        beam(ctx, vx + 6, vy + 22, vx + 10, vy + 22 + 40 * ease(s), 2.6, '#e4f7dc', Math.sin(s * Math.PI) * 0.7);
        for (const q of drops) {
          const kk = (s - q.d) / (1 - q.d); if (kk <= 0) continue;
          const [sx, sy] = SEATS[q.seat];
          const fromX = vx + 8, fromY = vy + 26, e = ease(Math.min(1, kk));
          ctx.globalAlpha = kk < 0.85 ? 0.9 : (1 - kk) * 6;
          dot(ctx, fromX + (sx + q.dx - fromX) * e + Math.sin(kk * 5 + q.sway) * 2,
            fromY + (sy - 12 - fromY) * e, q.s, kk < 0.5 ? '#ffffff' : '#bfe8a4');
          if (kk > 0.9) ring(ctx, sx + q.dx, sy - 12, (kk - 0.9) * 40, '#e4f7dc', (1 - kk) * 8, 0.8);
        }
      }
      // 莲：每人脚下开一朵，三片花瓣。开完就收，不留光
      const l = seg(p, 0.78, 1);
      if (l > 0) for (const [sx, sy] of SEATS) {
        ctx.globalAlpha = Math.sin(l * Math.PI) * 0.85;
        for (let i = 0; i < 3; i++) {
          const ang = -1.57 + (i - 1) * 1.05, r = 9 * ease(l);
          poly(ctx, [[sx, sy], [sx + Math.cos(ang - 0.32) * r, sy + Math.sin(ang - 0.32) * r * 0.5],
            [sx + Math.cos(ang) * r * 1.15, sy + Math.sin(ang) * r * 0.5],
            [sx + Math.cos(ang + 0.32) * r, sy + Math.sin(ang + 0.32) * r * 0.5]], '#ffd9e6');
        }
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 妈祖「妈祖火」：浪(0–.30) → 火(.30–.48) → 罩(.48–.70) → 起(.70–1)
  //
  // **属性水**：浪原本只铺在前三分之一，中段就退掉，最后剩一片金光——
  // 那样读起来她是「火」的。现在浪留到收尾（只压低不撤走），四条线，
  // 托人起来的那一段也混进海色的点。**水是底，妈祖火是底上那一点**，顺序不能反。
  //
  // 全作唯一一处「先把画面压到最暗，再亮一点」的演出，因为她的来历就是这个：
  // 海上起风，桅杆顶亮起一点火。所以前三分之一要真的暗下去——
  // 不暗，后面那一点火就不值钱。整段只闪一次，就在火化开的那一下。
  mazu: (x, y, rng) => {
    const waves = [0, 1, 2, 3].map(i => ({ y: FH - 6 - i * 9, amp: 4.5 - i, ph: rng.next() * 6.28, sp: 2.2 + i * 0.6 }));
    const lift = Array.from({ length: 26 }, () => ({
      seat: rng.int(0, 3), dx: rng.int(-10, 10), v: rng.int(20, 40), d: rng.next() * 0.5, s: rng.int(1, 2) }));
    const mx = W / 2 - 10, my = 16;
    return { t: 0, dur: 2.2, render(ctx, p) {
      // 浪：压暗压蓝，下缘推起三条浪线。暗到 0.42 就够——再暗就看不见自己人了
      wash(ctx, '#08182e', (seg(p, 0, 0.32) - seg(p, 0.50, 0.86)) * 0.42);
      // 罩那一段浪只压到三成（不是撤走）：全场最亮的时候海还在，光才是「在海上」亮的
      const w = seg(p, 0.04, 0.40) * (1 - seg(p, 0.52, 0.72) * 0.7) * (1 - seg(p, 0.92, 1));
      if (w > 0.01) {
        ctx.save(); ctx.globalAlpha = w * 0.7; ctx.strokeStyle = '#2f6f96'; ctx.lineWidth = 1.4;
        for (const q of waves) {
          ctx.beginPath();
          for (let sx = 0; sx <= W; sx += 8) {
            const yy = q.y + Math.sin(sx / 26 + q.ph + p * q.sp) * q.amp - w * 6;
            sx ? ctx.lineTo(sx, yy) : ctx.moveTo(sx, yy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // 火：桅杆顶那一点。先是一颗白点，越烧越大
      const f = seg(p, 0.28, 0.52);
      if (f > 0) {
        ctx.globalAlpha = Math.min(1, f * 2) * (1 - seg(p, 0.66, 0.9));
        ctx.fillStyle = '#6b5a3e'; ctx.fillRect(mx, my, 1, 34);              // 桅杆
        glow(ctx, mx, my, 22 + f * 70, 'rgb(255,232,170)', f * 0.55);
        ctx.fillStyle = '#fffdf0';
        ctx.beginPath(); ctx.arc(mx, my, 1.5 + f * 5, 0, 6.29); ctx.fill();
      }
      // 罩：那一点火化成一圈金光扫过全场。整段唯一的一次闪
      const c = seg(p, 0.46, 0.76);
      if (c > 0 && c < 1) {
        flash(ctx, Math.sin(c * Math.PI) * 0.36, '#fff2cc');
        ring(ctx, mx, my, 10 + ease(c) * 230, '#ffe9a8', (1 - c) ** 1.2, 4 * (1 - c) + 0.6);
        ring(ctx, mx, my, ease(c) * 160, '#fffdf0', (1 - c) * 0.7, 2 * (1 - c) + 0.4);
      }
      // 起：光点从每个人脚下升起把人托住。倒下的那个也一样——她不挑
      const u = seg(p, 0.64, 1);
      if (u > 0) glow(ctx, x, y, 110, 'rgb(255,214,130)', Math.sin(u * Math.PI) * 0.32);
      if (u > 0) for (const q of lift) {
        const kk = (u - q.d) / (1 - q.d); if (kk <= 0) continue;
        const [sx, sy] = SEATS[q.seat];
        ctx.globalAlpha = Math.sin(Math.min(1, kk) * Math.PI) * 0.95;
        // 三点里有一点是海色的：托人起来的是妈祖火，但底下始终是那片水
        dot(ctx, sx + q.dx + Math.sin(kk * 3.4 + q.dx) * 2, sy - q.v * kk, q.s,
          q.v % 3 === 0 ? (kk < 0.5 ? '#e8fbff' : '#6fc4e8') : (kk < 0.5 ? '#fffdf0' : '#ffcf6a'));
      }
      ctx.globalAlpha = 1;
    } };
  },
};
