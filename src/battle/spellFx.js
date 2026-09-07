// 魔法演出。和 effects.js 的分工：那边是「打击反馈」——挥砍、命中、受击闪白，
// 每个都在 0.3 秒内说完一件事；这边是「魔法」——多段式的一场戏，1.2 秒左右。
//
// **为什么要重做**：原来七种属性魔法各是一团 0.6 秒的粒子迸发，只占目标身边二十来个
// 逻辑像素。放在 FF6 旁边，差的不是像素精度而是**尺度与段落**——
// 那边一发火焰是「火星从画面外聚拢 → 白热核心炸开 → 火柱腾起 → 余烬飘散」，
// 有起承转合，还会染整个战场的颜色。我们只有「转」。
//
// 所以每个法术拆成明确的四段，段与段之间**尺度要变**（局部 → 全屏 → 局部），
// 变化本身就是节奏。段落边界写在每个法术开头，改的时候照着调。
//
// **关于全屏闪光**：这是最容易做过头、也最伤眼的东西。三条自律：
//   ① 峰值透明度不超过 0.45，绝不纯白铺满；
//   ② 起落各留 ≥0.08 秒的渐变，不做瞬间开关；
//   ③ 一个法术只闪一次。
// 光敏性风险是真的，宁可欠一点。
//
// 坐标是 256×224 的逻辑坐标，但**战场只到 y=152**（下面是指令窗与队伍面板，
// 见 hudBits.js 的 PANEL_Y）。全屏效果一律裁到这条线以上——盖住 UI 会让人以为界面坏了。

import { snap } from '../core/draw.js';
import { W, FH, PX, seg, pulse, ease, wash, flash, glow, ring, tongue, dot, inward } from './fxKit.js';
import { SKY_FX } from './spellFxSky.js';
import { COLD_FX } from './spellFxCold.js';
import { VOID_FX } from './spellFxVoid.js';

// a 是透明度——由外向内越来越实，目标从外焰的缝隙里透得出来
const LAYERS = [
  { c: '#ff6a1f', w: 1.00, h: 1.00, spread: 1.15, a: 0.62 },
  { c: '#ffc832', w: 0.62, h: 0.80, spread: 0.85, a: 0.78 },
  { c: '#fff6d0', w: 0.30, h: 0.55, spread: 0.55, a: 0.92 },
];


// 火单独留在这个文件里：它是这一套的**基准**——三版试错才定下来的做法
// （画形状不撒粒子、按目标缩放、分层半透明让目标透得出来、底部外扩消掉横切线），
// 其余六种都是照着它往上追的。改火之前先看 fxKit.js 里 tongue() 上面那段。
const FIRE_FX = {
  fire: (x, y, rng, o = {}) => {
    // **按目标大小缩放**，火才真的「罩住」这只怪：
    // 基准 44×44（一般杂鱼的画面尺寸），boss 大一倍火就宽一倍高一倍。
    // 夹在 0.9–2.3 之间——不夹的话小史莱姆身上那撮火小得看不见，
    // 而横向巨怪会撑出一片糊到屏幕边的橙色。
    const S = v => Math.max(0.9, Math.min(2.3, v / 44));
    const kx = S(o.w || 44), ky = S(o.h || 44);
    const foot = y + (o.h ? o.h / 2 : 22);        // 火烧在目标脚下，不是躯干中心
    const gather = inward(rng, 20, x, y, 110);
    // 火柱走「画形状」而不是「撒粒子」——三版试错的结论写在 tongue() 上面。
    // **13 条**火舌而不是 7 条：7 条时彼此不重叠，看起来是几条独立的丝带排成 V 字、
    // 中间还是空的，读作「火」不成立。条数翻倍、每条改窄、间距收紧之后彼此咬合，
    // 才有一整团火的体量——而这正是「完整覆盖在怪身上」的前提。
    const N = 13;
    const tongues = Array.from({ length: N }, (_, i) => {
      const c = 1 - Math.abs(i - (N - 1) / 2) / (N / 2 + 0.6);   // 中间 1、两边 0
      // dy：每条的起脚高低差几个像素。全部对齐同一条基线的话，
      // 就算底部外扩了，那条横线还是隐约在——错开之后才彻底散掉
      return { dx: (i - (N - 1) / 2) * 3.6, dy: rng.int(-3, 3),
               h: (30 + c * 62) * (0.8 + rng.next() * 0.4),
               w: (5.5 + c * 6) * (0.75 + rng.next() * 0.5), ph: rng.next() * 6.28 };
    });
    const embers = Array.from({ length: 26 }, () => ({
      dx: rng.int(-28, 28), vy: rng.int(34, 84), d: rng.next(), w: rng.next() }));
    return { t: 0, dur: 1.25, render(ctx, p) {
      // 底色只压一点点，主要靠加光——见 glow() 上面那段
      wash(ctx, '#5a1e04', pulse(p, 0.18, 0.85) * 0.14);
      glow(ctx, x, y - 6, 120 * kx, 'rgb(255,150,50)', pulse(p, 0.20, 0.90) * 0.42);
      // 聚：火星从四面八方收进来，越近越亮
      const g = seg(p, 0, 0.26);
      if (g > 0 && g < 1) for (const q of gather) {
        const k = Math.max(0, (g - q.d) / (1 - q.d)); if (k <= 0) continue;
        const e = ease(k);
        dot(ctx, q.ax + (x - q.ax) * e, q.ay + (y - q.ay) * e, q.s, k > 0.7 ? '#fff2c4' : '#ff9a3c');
      }
      // 爆：白热核心 + 一次闪光
      const b = pulse(p, 0.22, 0.34);
      if (b > 0) {
        flash(ctx, b * 0.40, '#ffdca0');
        ctx.save(); ctx.globalAlpha = b * 0.9; ctx.fillStyle = '#fff6d0';
        ctx.beginPath(); ctx.arc(x, y, 6 + b * 26, 0, 6.29); ctx.fill();
        ctx.globalAlpha = b * 0.45; ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(x, y, 10 + b * 52, 0, 6.29); ctx.fill(); ctx.restore();
      }
      // 燃：一丛火舌。三层套着画——外橙最宽、中黄、芯白最窄，
      // 每层高度与宽度依次减小，堆出「外焰包着内焰」的层次。
      // 整丛的高度随时间起落（涨得快、落得慢），像真的烧起来又矮下去。
      const f = seg(p, 0.26, 1);
      if (f > 0) {
        const rise = f < 0.30 ? ease(f / 0.30) : 1 - (f - 0.30) / 0.70 * 0.55;   // 涨快落慢
        const baseY = foot + 2;
        const fade = Math.min(1, (1 - f) * 2.4);
        // **火要半透明，让目标透得出来。** 画成实心的话怪整个被盖住，
        // 打击感反而弱了——玩家看不到自己在打谁。FF6 的大魔法也是让目标若隐若现。
        // 外焰最透（0.62）、内焰次之、焰芯最实（0.92）：由外向内越来越不透明，
        // 视线自然被引到最亮的芯上，同时轮廓边缘能看见底下的怪。
        for (const L of LAYERS) {
          ctx.globalAlpha = fade * L.a;
          for (const q of tongues) {
            const h = q.h * ky * rise * L.h, w = q.w * kx * L.w;
            if (h < 2) continue;
            tongue(ctx, x + q.dx * kx * L.spread, baseY + q.dy, h, w, 2.5 + q.w * 0.5, q.ph + p * 5.5, L.c);
          }
        }
        // 火脚下的一摊光：把底部彻底糊开，同时交代「火是烧在地上的」
        ctx.globalAlpha = fade * 0.5;
        glow(ctx, x, baseY + 1, 34 * kx, 'rgb(255,140,40)', 0.55);
      }
      // 熄：余烬往上飘，飘得比火舌慢也比火舌远
      const s = seg(p, 0.60, 1);
      if (s > 0) for (const q of embers) {
        const lp = (s - q.d * 0.5) / 1; if (lp <= 0) continue;
        ctx.globalAlpha = (1 - lp) * 0.8;
        dot(ctx, x + q.dx + Math.sin(lp * 4 + q.w * 6.28) * 6, y - q.vy * lp, 1, '#ffb457');
      }
      ctx.globalAlpha = 1;
    } };
  },

  // 雷：蓄(0–.30) → 击(.30–.38) → 炸(.38–.62) → 残(.62–1)
};

export const SPELL_FX = { ...FIRE_FX, ...SKY_FX, ...COLD_FX, ...VOID_FX };
