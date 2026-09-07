// 召唤演出：**拿刀的两位** —— 关圣帝君（火）与吕布（金）。
//
// 为什么这两位单独一档，而不是随便挑两位凑行数：`data/summons.json` 的 `lubu.note`
// 已经写死「这是关圣帝君『义气』的反面，两位要放在一起读」。一个是义气，
// 一个是请他不讲情分、一箭出去 MP 见底。改其中一位的演出，另一位多半也要跟着调，
// 放在同一个档里才看得见这层关系。
//
// 形状和 SPELL_FX 一致：`(x, y, rng) => ({ t, dur, render(ctx, p) })`。
// 传进来的 (x, y) 是敌方那一侧的焦点（关圣帝君打全体传敌群中心 (74,96)，
// 吕布打单体传 scene.center(t)）。全屏部分用固定屏幕几何，只有局部跟着 (x,y) 走。
// 演出的规矩（只闪一次、峰值 ≤0.45、形状优先于粒子）见 summonKit.js 开头。

import { W, seg, pulse, ease, wash, flash, glow, ring, dot, poly, beam, banner, inward } from './summonKit.js';
import { PARTY_X, PARTY_Y0, PARTY_DY } from './hudBits.js';

// 关刀的剪影，画在原点朝上：杆往下、月牙刀身在上头。L 是杆长
function guandao(ctx, L) {
  ctx.fillStyle = '#4a3a26'; ctx.fillRect(-1.4, -L, 2.8, L);                        // 杆
  poly(ctx, [[0, -L - 1], [4, -L - 11], [11, -L - 22], [20, -L - 27],
    [23, -L - 18], [16, -L - 8], [5, -L - 2]], '#e6eef5');                          // 月牙刀身
  poly(ctx, [[-2, -L + 2], [2, -L + 2], [1, -L + 12], [-1, -L + 12]], '#8a1f1a');   // 红缨
}

export const FX_WAR = {
  // 关圣帝君「义气」：立(0–.26) → 举(.26–.46) → 劈(.46–.64) → 护(.64–1)
  //
  // **属性火**：面如重枣，赤兔赤马，而他解锁在火種那一幕的恆春。
  // 这一段的暗红天 + 橙火星本来就是照火画的，改属性只是让数据追上演出，颜色没动，
  // 只在刀痕上补了一串余烬——刀过去之后那条线还在烧，火才落到实处。
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
        // 余烬：刀走过的弧上留一串火星，刀过去了那条线还在烧
        for (let i = 0; i < 9; i++) {
          const aa = a0 + (a1 - a0) * (i / 8), rr = L * (0.34 + i * 0.075);
          ctx.globalAlpha = (1 - cut) ** 1.4 * 0.9;
          dot(ctx, PX + Math.sin(aa) * rr, PY - Math.cos(aa) * rr + cut * 6,
            i % 3 ? 1 : 2, i % 2 ? '#ffb27a' : '#ffe0b0');
        }
        ctx.globalAlpha = 1;
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

  // 吕布「辕门射戟」：立(0–.24) → 张(.24–.48) → 射(.48–.56) → 震(.56–1)
  //
  // **属性金**：那支戟是断的，接起来才请得动，爐心鐵那一件也归他。
  // 这一段本来就是一片冷钢，只是白得没有性格。命中那一下改成金：金光、金环、磕出来的火星。
  // 戟身和箭仍然冷白（那是铁的颜色），**金只出现在铁碰铁的那一瞬**。
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
      if (lane > 0.01) { ctx.save(); ctx.globalAlpha = lane * 0.18; ctx.fillStyle = '#e8dcb0'; ctx.fillRect(0, by - 7, W, 14); ctx.restore(); }
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
        flash(ctx, Math.sin(sh * Math.PI) * 0.34, '#fff2d0');
        beam(ctx, Math.min(bx, hx + 46), by, hx, by, 2.2, '#ffffff', 1 - sh * 0.3);
      }
      // 震：戟被射中，碎屑四散；同时几点蓝的从右边被抽走——那是施术者的 MP
      if (fall > 0) {
        glow(ctx, x, y, 54, 'rgb(255,229,150)', (1 - fall) * 0.35);
        for (const q of shards) {
          const k = (fall - q.d) / (1 - q.d); if (k <= 0 || k >= 1) continue;
          ctx.globalAlpha = (1 - k) ** 1.2;
          // 铁碰铁磕出来的火星混在铁屑里：三片里有一片是金的
          const hot = q.v % 3 === 0;
          dot(ctx, x + Math.cos(q.a) * q.v * k, y + Math.sin(q.a) * q.v * k * 0.7 + k * k * 12, q.s,
            k < 0.4 ? '#ffffff' : (hot ? '#ffe08a' : '#8fa8c4'));
        }
        ring(ctx, x, y + 14, ease(fall) * 40, '#e8d79a', (1 - fall) * 0.6, 1.4);
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
