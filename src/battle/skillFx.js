// 战技的演出。和 spellFx.js 的分工是**时长与尺度**：
// 魔法是一场 1.2–1.7 秒的多段戏（聚 → 炸 → 燃 → 熄），会染整个战场；
// 战技是身法，一下就说完——0.45–0.7 秒，只在目标身上，不铺全屏。
// 一招战技要是拖成魔法那个长度，一场战斗放三次就开始等了。
//
// **全体技（踏罡 / 扫山）绝对不能用 wash / flash / glow 那三支全屏笔。**
// skillVolley 是在**每个目标**身上各加一次特效，三只敌人就是三层全屏色叠在一起，
// 透明度直接翻三倍——自律条款里「峰值不超过 0.45」当场破功。
// 所以这个档里一律只画局部。
//
// 画法照 CLAUDE.md 那条：**画形状，不要撒粒子**。最小笔触用 PX（一个物理像素），
// 不用 1——写 1 落到屏幕上是 ART×ART 的方块，收尖会一级一级跳。
import { PX, seg, pulse, ease, ring, dot } from './fxKit.js';

// 挥击的弧：月牙形，半径张开、线宽收细。effects.js 的 slash 是同一个语汇，
// 这里抽出来是因为战技有五招都要用，只是角度、色、层数不一样。
function arc(ctx, r, a0, a1, color, alpha, thick) {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(PX, thick); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
}

// 一条直的裂纹：从原点往某个方向走，每隔几个物理像素折一次。
// 折点一次定死（不逐帧掷骰），否则整条裂纹每帧都在抖。
function crack(ctx, ang, len, jag, color, alpha, thick = PX * 2) {
  if (alpha <= 0.002) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineJoin = 'miter';
  ctx.beginPath(); ctx.moveTo(0, 0);
  const n = jag.length;
  for (let i = 1; i <= n; i++) {
    const d = len * (i / n), a = ang + jag[i - 1];
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.stroke();
}

export const SKILL_FX = {
  // ── 拳头师 ────────────────────────────────────────────────────────────────
  // 连环拳：一步两拳，**两下要错开**才读得出是两下。第二下比第一下更靠里、更亮。
  fist2: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1;
    const sparks = Array.from({ length: 9 }, () => ({ a: rng.next() * 6.28, v: 12 + rng.next() * 20, s: rng.next() < 0.35 ? 2 : 1 }));
    return { t: 0, dur: 0.45, render(ctx, p) {
      ctx.translate(x, y); ctx.scale(dir, 1);
      for (const [t0, t1, off, R0, col] of [[0, 0.55, -7, 5, '#ffffff'], [0.28, 1, 5, 4, '#ffe9b0']]) {
        const k = seg(p, t0, t1); if (k <= 0 || k >= 1) continue;
        ctx.save(); ctx.translate(off, k < 0.5 ? -3 : 3);
        arc(ctx, R0 + k * 15, -1.1, 1.1, col, (1 - k) ** 0.7, 3.6 * (1 - k) + PX);
        ctx.restore();
      }
      ctx.scale(dir, 1);
      const s = seg(p, 0.3, 1);
      for (const q of sparks) { const d = q.v * s; ctx.globalAlpha = (1 - s) ** 1.4; dot(ctx, Math.cos(q.a) * d, Math.sin(q.a) * d, q.s, '#ffe9b0'); }
      ctx.globalAlpha = 1;
    } };
  },

  // 碎甲：拳头找的是接缝。先一记闷响（短促的实心冲击），再从命中点炸出裂纹，
  // 最后碎片往下掉——「甲被敲开了」这件事全靠裂纹说，颜色跟破甲状态同一支（#d98f5a）。
  sunder: (x, y, rng, o = {}) => {
    const R = Math.max(14, (o.w || 44) * 0.42);
    const cracks = Array.from({ length: 6 }, (_, i) => ({
      ang: (i / 6) * 6.28 + rng.next() * 0.5,
      len: R * (0.7 + rng.next() * 0.7),
      jag: Array.from({ length: 3 }, () => (rng.next() - 0.5) * 0.7),
    }));
    const shards = Array.from({ length: 7 }, () => ({ dx: rng.int(-10, 10), vy: rng.int(18, 40), d: rng.next() * 0.3, s: rng.next() < 0.4 ? 2 : 1 }));
    return { t: 0, dur: 0.55, render(ctx, p) {
      ctx.translate(x, y);
      const hit = pulse(p, 0, 0.18);
      if (hit > 0) { ctx.globalAlpha = hit * 0.9; ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.arc(0, 0, 1.5 + hit * 3.5, 0, 6.29); ctx.fill(); }
      const c = seg(p, 0.10, 0.55);
      // 裂纹分两层画：底下一条深的当描边、上面一条亮的当高光。
      // 只画一层的话它落在灰扑扑的怪身上几乎看不见——预览里量过。
      if (c > 0) { const a = Math.min(1, (1 - seg(p, 0.6, 1)));
        for (const q of cracks) crack(ctx, q.ang, q.len * ease(c), q.jag, '#3a2414', a * 0.9, PX * 4);
        for (const q of cracks) crack(ctx, q.ang, q.len * ease(c), q.jag, '#ffca8a', a, PX * 2);
      }
      const f = seg(p, 0.35, 1);
      if (f > 0) for (const q of shards) {
        const k = Math.max(0, (f - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * 0.9;
        dot(ctx, q.dx, -4 + q.vy * k * k, q.s, '#c8804a');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 拼命：全场最重的一下。一记宽刃劈落 + 一圈冲击环 + 命中点炸白。
  // 放血的代价要在画面上兑现，所以这一招是九招里唯一有红的。
  allout: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1, H = Math.max(30, (o.h || 44) * 0.9);
    const bits = Array.from({ length: 12 }, () => ({ a: rng.next() * 6.28, v: 20 + rng.next() * 34, s: rng.next() < 0.5 ? 2 : 1 }));
    return { t: 0, dur: 0.6, render(ctx, p) {
      ctx.translate(x, y); ctx.scale(dir, 1);
      // 劈：一条从上往下扫过目标的宽刃，落到底才结算
      const c = seg(p, 0, 0.3);
      if (c > 0 && c < 1) {
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff6e6'; ctx.lineWidth = 4.5 * (1 - c) + PX; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-16, -H / 2 + H * c - 8); ctx.lineTo(14, -H / 2 + H * c + 8); ctx.stroke();
      }
      ctx.scale(dir, 1);
      // 白团半径压到 9：原本 4+b*16 是二十逻辑像素，比整只怪还宽，糊成一坨白饼。
      // 这一下的重量交给下面那两圈冲击环去说，核心只要一点白热。
      const b = pulse(p, 0.24, 0.44);
      if (b > 0) { ctx.globalAlpha = b * 0.95; ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.arc(0, 0, 2 + b * 7, 0, 6.29); ctx.fill(); }
      const r = seg(p, 0.26, 0.9);
      if (r > 0) { ring(ctx, 0, 0, 6 + r * 34, '#ff9a6a', (1 - r) * 0.75, 3.2 * (1 - r) + PX); ring(ctx, 0, 0, 2 + r * 24, '#ffe0c0', (1 - r) * 0.55, 2 * (1 - r) + PX); }
      const s = seg(p, 0.28, 1);
      for (const q of bits) { const d = q.v * ease(s); ctx.globalAlpha = (1 - s) ** 1.3; dot(ctx, Math.cos(q.a) * d, Math.sin(q.a) * d * 0.8, q.s, s < 0.5 ? '#ffd0a8' : '#e07050'); }
      ctx.globalAlpha = 1;
    } };
  },

  // ── 家将 ──────────────────────────────────────────────────────────────────
  // 开脸：八家将画上脸就不是人了。演的是「脸谱浮起来罩在自己身上」——
  // 两道竖纹 + 眉心一点，由淡转实再化开。这一招打的是自己，所以不该有冲击感。
  openface: (x, y, rng, o = {}) => {
    const H = Math.max(26, (o.h || 44) * 0.6);
    return { t: 0, dur: 0.75, render(ctx, p) {
      ctx.translate(x, y - 2);
      const a = pulse(p, 0, 1) ** 0.6;
      // 竖纹：左右各一道，从眉骨拉到下颌
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = '#e0a06a'; ctx.lineWidth = Math.max(PX, 2.2); ctx.lineCap = 'round';
      for (const dx of [-6, 6]) {
        ctx.beginPath(); ctx.moveTo(dx, -H * 0.42); ctx.lineTo(dx * 1.25, H * 0.28); ctx.stroke();
      }
      // 眉心：一点朱砂，比竖纹晚一拍亮起来
      const m = pulse(p, 0.18, 1);
      ctx.globalAlpha = m * 0.95; ctx.fillStyle = '#f0d0a0';
      ctx.beginPath(); ctx.arc(0, -H * 0.34, 1.6 + m * 1.6, 0, 6.29); ctx.fill();
      // 罩下来的那一圈：由外往内收，收到贴着身体就停
      const k = seg(p, 0.1, 0.7);
      if (k > 0) ring(ctx, 0, 0, H * (1.5 - k * 0.75), '#e0a06a', (1 - Math.abs(k * 2 - 1)) * 0.55, 2 * PX * 3);
      ctx.globalAlpha = 1;
    } };
  },

  // 踏罡：一脚下去，地在震。同心圈从脚下往外摊（椭圆，因为地面是斜的），
  // 外加几块被震起来的碎石。**全局部**——它是全体技，见档头那段。
  stomp: (x, y, rng, o = {}) => {
    const foot = y + (o.h ? o.h / 2 : 20), R = Math.max(22, (o.w || 44) * 0.8);
    const rubble = Array.from({ length: 8 }, () => ({ dx: rng.int(-16, 16), vy: rng.int(14, 32), d: rng.next() * 0.25, s: rng.next() < 0.4 ? 2 : 1 }));
    return { t: 0, dur: 0.6, render(ctx, p) {
      ctx.translate(x, foot);
      for (const [t0, col] of [[0, '#f0e4c8'], [0.14, '#c8b48c'], [0.28, '#9c8a6a']]) {
        const k = seg(p, t0, t0 + 0.62); if (k <= 0 || k >= 1) continue;
        ring(ctx, 0, 0, R * ease(k), col, (1 - k) ** 1.2 * 0.8, 2.6 * (1 - k) + PX);
      }
      const f = seg(p, 0.05, 1);
      for (const q of rubble) {
        const k = Math.max(0, (f - q.d) / (1 - q.d)); if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * 0.85;
        dot(ctx, q.dx * (0.4 + k), -q.vy * Math.sin(k * Math.PI) , q.s, '#a89070');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 七星步：七个脚位走完，人已经绕到旁边去了。
  // **这一招的画面就是那七个点**——按北斗的形状排开，一个个亮起来，
  // 走过的连成线。这是九招里唯一一眼认得出「是哪一招」的图形，值得多花几行。
  sevenstar: (x, y, rng, o = {}) => {
    // 跨度要**比目标宽**：只取半个身宽的话七颗星全躲在怪的剪影里，等于没画（预览里量过）。
    const S = Math.max(26, (o.w || 44) * 0.95);
    // 北斗七星的相对位置（斗身四颗 + 斗柄三颗），归一化到 ±1
    const RAW = [[-1, 0.35], [-0.45, 0.55], [-0.3, 0.05], [-0.85, -0.1], [0.2, -0.15], [0.68, -0.05], [1, 0.4]];
    const pts = RAW.map(([a, b]) => [a * S, b * S * 0.8]);
    return { t: 0, dur: 0.7, render(ctx, p) {
      ctx.translate(x, y);
      const k = seg(p, 0, 0.72) * 7;                 // 走到第几颗（可为小数）
      const fade = 1 - seg(p, 0.72, 1);
      // 连线：只连已经走过的那几段
      ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = PX * 3;
      ctx.beginPath();
      for (let i = 0; i < 7 && i < k; i++) {
        const [px, py] = pts[i];
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // 星：走到的那一颗最亮，之前的留一层余辉
      for (let i = 0; i < 7; i++) {
        const age = k - i; if (age <= 0) continue;
        const hot = Math.max(0, 1 - age * 1.6);
        const [px, py] = pts[i];
        ctx.globalAlpha = fade * (0.55 + hot * 0.45);
        ctx.fillStyle = hot > 0.35 ? '#ffffff' : '#bcd4ff';
        const r = 2.2 + hot * 4;
        ctx.beginPath(); ctx.arc(px, py, r, 0, 6.29); ctx.fill();
        if (hot > 0.5) { ctx.globalAlpha = fade * hot * 0.5; ctx.beginPath(); ctx.arc(px, py, r * 2.4, 0, 6.29); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    } };
  },

  // ── 山猎人 ────────────────────────────────────────────────────────────────
  // 屏息：山里等一只山猪要等半天。四个角往内收成一个准星，收到底才出手——
  // 「必中」这件事要在动手**之前**就看得出来，不然它和普通一刀没差别。
  aim: (x, y, rng, o = {}) => {
    const R = Math.max(16, (o.w || 44) * 0.55), dir = o.dir ?? -1;
    return { t: 0, dur: 0.5, render(ctx, p) {
      ctx.translate(x, y);
      const k = seg(p, 0, 0.55);
      if (k < 1) {
        const d = R * (1.6 - ease(k) * 1.0);
        // 两层：深的一层当描边，亮的一层压上去。准星画在怪身上，
        // 单层 1 物理像素的细线会整个融进灰色剪影里——而「必中」这件事全靠它先说出来。
        ctx.lineCap = 'butt';
        for (const [col, th, al] of [['#1a2a1c', PX * 6, 0.75], ['#d8f4d8', PX * 3, 1]]) {
          ctx.globalAlpha = (0.55 + k * 0.45) * al; ctx.strokeStyle = col; ctx.lineWidth = th;
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(sx * d, sy * d - sy * 7); ctx.lineTo(sx * d, sy * d); ctx.lineTo(sx * d - sx * 7, sy * d);
            ctx.stroke();
          }
        }
      }
      // 出手：一条贴着水平的锐线穿过去
      const s = seg(p, 0.5, 0.86);
      if (s > 0 && s < 1) {
        ctx.save(); ctx.scale(dir, 1);
        ctx.globalAlpha = (1 - s) ** 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6 * (1 - s) + PX; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-R * 1.5 + s * R * 2.4, -2); ctx.lineTo(-R * 0.4 + s * R * 2.4, 2); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 抹毒：刀口在草汁里过一遍。绿色的弧 + 顺着弧往下淌的几滴。
  venom: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1;
    const drips = Array.from({ length: 6 }, () => ({ dx: rng.int(-12, 12), vy: rng.int(16, 30), d: rng.next() * 0.35 }));
    return { t: 0, dur: 0.5, render(ctx, p) {
      ctx.translate(x, y); ctx.scale(dir, 1);
      const k = seg(p, 0, 0.62);
      if (k < 1) { arc(ctx, 5 + k * 20, -1.05, 1.05, '#e2f6b8', (1 - k) ** 0.6, 4 * (1 - k) + PX); arc(ctx, 3 + k * 16, -0.85, 0.85, '#7fbf5a', (1 - k) ** 0.6 * 0.95, 2.4 * (1 - k) + PX); }
      ctx.scale(dir, 1);
      const f = seg(p, 0.2, 1);
      for (const q of drips) {
        const t = Math.max(0, (f - q.d) / (1 - q.d)); if (t <= 0) continue;
        ctx.globalAlpha = (1 - t) * 0.95;
        dot(ctx, q.dx, -2 + q.vy * t * t, 2, '#8fcf6a');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 扫山：赶山的走法，不挑一只打。一道**横**的长弧从一侧扫到另一侧——
  // 和上面几招的竖向月牙区别开，一眼能认出这是「扫」不是「劈」。
  sweep: (x, y, rng, o = {}) => {
    const dir = o.dir ?? -1, Wd = Math.max(26, (o.w || 44) * 1.05);
    return { t: 0, dur: 0.5, render(ctx, p) {
      ctx.translate(x, y); ctx.scale(dir, 1);
      const k = seg(p, 0, 0.62);
      if (k < 1) {
        const a = (1 - k) ** 0.7;
        for (const [dy, col, th] of [[-3, '#e8f0e0', 3.2], [1, '#b8c8a8', 2.0]]) {
          ctx.globalAlpha = a * (dy < 0 ? 1 : 0.7);
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(PX, th * (1 - k)); ctx.lineCap = 'round';
          ctx.beginPath();
          const x0 = -Wd * 0.9 + Wd * 1.9 * ease(k);
          ctx.moveTo(x0 - Wd * 0.55, dy + 4); ctx.quadraticCurveTo(x0, dy - 5, x0 + Wd * 0.55, dy + 4);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    } };
  },
};
