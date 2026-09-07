// 八位召唤演出的无头体检。这台机器没有 Node，用 macOS 自带的 JavaScriptCore：
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -m tools/fx_headless.mjs
//
// **为什么值得跑**：召唤的 render 每帧要算几十个坐标，一处 NaN 在画面上是「什么都没画」——
// 不报错、不崩，只是那一段不见了，肉眼看两秒的预览很容易漏掉。
// 顺便把三条演出自律也变成机器能查的：
//   ① 全屏闪光峰值 ≤0.45；② 起落各 ≥0.08 秒的渐变；③ 一次演出只闪一次。
//
// 做法是**假的 ctx**：不画东西，只记录每一次调用的参数，任何一个非有限数立刻记一笔。
// flash() 走的是 globalCompositeOperation='lighter' + fillRect(0,0,W,FH)，
// 按这个特征把「全屏闪」从别的 fillRect 里认出来，逐帧记它的 alpha，就能算峰值和起落。

import { SUMMON_FX } from '../src/battle/summonFx.js';

// jsc 没有 console，只有全局 print()
const log = typeof console !== 'undefined' && console.log ? console.log.bind(console) : print;

const W = 256, FH = 152, FPS = 60;
const bad = [];
let frame = '';

const num = (v, where) => {
  if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${frame} ${where} = ${v}`);
  return v;
};
const nums = (where, ...vs) => vs.forEach((v, i) => num(v, `${where}[${i}]`));

// 记录本帧的全屏闪光 alpha（flash 的特征：lighter + 覆盖整个战场的 fillRect）
let flashA = 0;

function makeCtx() {
  const st = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '' };
  const stack = [];
  const ctx = {
    get globalAlpha() { return st.globalAlpha; },
    set globalAlpha(v) { num(v, 'globalAlpha'); st.globalAlpha = v; },
    get globalCompositeOperation() { return st.globalCompositeOperation; },
    set globalCompositeOperation(v) { st.globalCompositeOperation = v; },
    set fillStyle(v) { st.fillStyle = v; }, get fillStyle() { return st.fillStyle; },
    set strokeStyle(v) { st.strokeStyle = v; }, get strokeStyle() { return st.strokeStyle; },
    set lineWidth(v) { num(v, 'lineWidth'); if (v <= 0) bad.push(`${frame} lineWidth ${v} ≤ 0`); st.lineWidth = v; },
    set lineCap(v) { st.lineCap = v; },
    save() { stack.push({ ...st }); },
    restore() { Object.assign(st, stack.pop() || st); },
    translate(x, y) { nums('translate', x, y); },
    rotate(a) { num(a, 'rotate'); },
    scale(x, y) { nums('scale', x, y); },
    beginPath() {}, closePath() {}, stroke() {}, fill() {},
    moveTo(x, y) { nums('moveTo', x, y); },
    lineTo(x, y) { nums('lineTo', x, y); },
    quadraticCurveTo(a, b, c, d) { nums('quadraticCurveTo', a, b, c, d); },
    arc(x, y, r, s, e) { nums('arc', x, y, r, s, e); if (r < 0) bad.push(`${frame} arc r=${r} < 0`); },
    ellipse(x, y, rx, ry, rot, s, e) {
      nums('ellipse', x, y, rx, ry, rot, s, e);
      if (rx < 0 || ry < 0) bad.push(`${frame} ellipse 半径为负 ${rx},${ry}`);
    },
    strokeRect(x, y, w, h) { nums('strokeRect', x, y, w, h); },
    fillRect(x, y, w, h) {
      nums('fillRect', x, y, w, h);
      // flash 与 glow 的调用长得一模一样（都是 lighter + 铺满整个战场的 fillRect），
      // 差别只在 fillStyle：flash 是一个纯色，glow 是一张径向渐变。
      // 认错的话 glow 会被算成闪光，峰值凭空多出 0.3——第一版就是这么误报的。
      const full = x <= 0 && y <= 0 && w >= W && h >= FH;
      if (full && st.globalCompositeOperation === 'lighter' && typeof st.fillStyle === 'string')
        flashA = Math.max(flashA, st.globalAlpha);
    },
    createRadialGradient(...a) { nums('radialGradient', ...a); return grad(); },
    createLinearGradient(...a) { nums('linearGradient', ...a); return grad(); },
  };
  const grad = () => ({ __gradient: true, addColorStop(o, c) { num(o, 'colorStop'); } });
  return ctx;
}

// 可播种随机数，跟 src/core/RNG.js 同一套 mulberry32（那个档 import 不动，它没别的依赖但保持独立）
class RNG {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(a) { return a[Math.floor(this.next() * a.length)]; }
}

const SEEDS = [1, 7, 42, 1337, 90210];
const ids = Object.keys(SUMMON_FX);
let fail = 0;
log(`八位召唤 × ${SEEDS.length} 个种子 × 全帧（60fps）\n`);
log('召唤        时长   帧数  闪光峰值  起落(秒)  闪几次  NaN');
for (const id of ids) {
  let peak = 0, minRamp = Infinity, maxBursts = 0, nanAt = bad.length, dur = 0;
  for (const seed of SEEDS) {
    const rng = new RNG(seed);
    const fx = SUMMON_FX[id](128, 96, rng);
    dur = fx.dur;
    const ctx = makeCtx();
    const n = Math.max(2, Math.round(dur * FPS));
    const track = [];
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      frame = `${id} seed${seed} p=${p.toFixed(3)}`;
      flashA = 0;
      fx.render(ctx, p);
      track.push(flashA);
    }
    peak = Math.max(peak, ...track);
    // 一次「闪」= 一段连续 >0.02 的区间。段数 = 闪几次。
    // **起落时间的定义**：从这一段第一次看得见到最亮（起），以及从最亮到看不见（落）。
    // 要卡的是「不许啪一下亮起来」，所以量的是整条斜坡，不是爬到一半用了多久。
    let i = 0, bursts = 0;
    while (i < track.length) {
      if (track[i] <= 0.02) { i++; continue; }
      let j = i; while (j < track.length && track[j] > 0.02) j++;
      bursts++;
      const seg = track.slice(i, j), pk = Math.max(...seg), at = seg.indexOf(pk);
      minRamp = Math.min(minRamp, (at + 1) / FPS, (seg.length - at) / FPS);
      i = j;
    }
    maxBursts = Math.max(maxBursts, bursts);
  }
  const nans = bad.length - nanAt;
  const okPeak = peak <= 0.4501, okRamp = !Number.isFinite(minRamp) || minRamp >= 0.0799, okOnce = maxBursts <= 1;
  const ok = okPeak && okRamp && okOnce && nans === 0;
  if (!ok) fail++;
  log(`${id.padEnd(10)} ${dur.toFixed(1)}s ${String(Math.round(dur * FPS) + 1).padStart(5)}` +
    `  ${peak.toFixed(3).padStart(7)}${okPeak ? ' ' : '!'}` +
    ` ${(Number.isFinite(minRamp) ? minRamp.toFixed(3) : '  —  ').padStart(8)}${okRamp ? ' ' : '!'}` +
    ` ${String(maxBursts).padStart(6)}${okOnce ? ' ' : '!'} ${String(nans).padStart(4)}  ${ok ? '通过' : '不合格'}`);
}
log('');
if (bad.length) { log(`非有限数 ${bad.length} 处，前 20 处：`); bad.slice(0, 20).forEach(b => log('  ' + b)); }
log(bad.length === 0 && fail === 0
  ? `全部通过：${ids.length} 位 × ${SEEDS.length} 种子，无 NaN，闪光峰值 ≤0.45、起落 ≥0.08 秒、每位只闪一次`
  : `不合格 ${fail} 位`);
