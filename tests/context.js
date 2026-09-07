// 测试的共享前置：test / assert、加载好的数据、以及量美术的那两个工具。
//
// **为什么单独成档**：run.js 曾经到了 1028 行——69 条测试加上它们的前置全挤在一起，
// 超 CLAUDE.md 的 400 行上限两倍半，想加一条测试得先滚半分钟找地方。
// 拆开之后 run.js 只剩「按顺序 import 各组，然后渲染结果」。
//
// **各组靠 import 副作用注册**：case 文件在模块顶层直接调 test()，
// 往这里的 results 数组里推。所以 run.js 里 import 的先后 = 测试出现的先后。
// 用共享数组而不是「每组导出一个函数再收集」，是因为前者改动最小——
// 69 条测试一行都不用动，拆分才可能做到零风险。

import { loadData } from '../src/data/loader.js';
import { normalizeMember } from '../src/game/jobskill.js';

// 浏览器内测试：公式 + 数据完整性。打开 tests/index.html 查看；window.__testResults 供自动化读取。

export const results = [];
export const assert = (c, m = 'assert') => { if (!c) throw new Error(m); };
export function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e) }); } }

export const data = await loadData('../data/');

// 正式美术的角色精灵：量出每张图里角色实际占的高度，用来保证大小一致
async function measureArt() {
  let m; try { const r = await fetch('../assets/art/manifest.json', { cache: 'no-store' }); if (!r.ok) return null; m = await r.json(); } catch { return null; }
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const out = [];
  for (const [cid, views] of Object.entries(m.characters || {})) {
    for (const [view, file] of Object.entries(views)) {
      const im = await load('../assets/art/' + file); if (!im) continue;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height).data;
      // 逐行统计：实心像素数与左右边界。只量身高抓不出「等高但胖瘦两样」，
      // 实际踩过——补生成的拳头师侧面站姿比他自己的侧面迈步少 41% 的实心面积。
      let y0 = im.height, y1 = -1, mass = 0;
      const span = [];
      for (let y = 0; y < im.height; y++) {
        let lo = -1, hi = -1, n = 0;
        for (let px = 0; px < im.width; px++) {
          if (d[(y * im.width + px) * 4 + 3] > 8) { if (lo < 0) lo = px; hi = px; n++; }
        }
        span.push(n ? [lo, hi, n] : null);
        if (n) { if (y < y0) y0 = y; if (y > y1) y1 = y; mass += n; }
      }
      if (y1 < 0) continue;
      const H = y1 - y0 + 1;
      const bandW = (a, b) => { let w = 0; for (let y = Math.round(y0 + H * a); y < Math.round(y0 + H * b); y++) { const r = span[y]; if (r) w = Math.max(w, r[1] - r[0] + 1); } return w; };
      void bandW;   // 宽度带留着备查，但不做门禁：迈步时腿张开、手臂摆动会把任何宽度指标带偏
      out.push({ cid, view, ratio: H / im.height, w: im.width, h: im.height, mass });
    }
  }
  return out;
}
// 量所有美术的**原始像素尺寸**（不看内容，只看长宽），给 ART 换算的那组测试用
async function measureSizes() {
  let m; try { const r = await fetch('../assets/art/manifest.json', { cache: 'no-store' }); if (!r.ok) return null; m = await r.json(); } catch { return null; }
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const out = { characters: {}, enemies: {}, tiles: {} };
  for (const [cid, views] of Object.entries(m.characters || {}))
    for (const [view, file] of Object.entries(views)) {
      const im = await load('../assets/art/' + file);
      if (im) out.characters[`${cid}_${view}`] = [im.width, im.height];
    }
  for (const [kind, key] of [['enemies', 'enemies'], ['tiles', 'tiles']])
    for (const [id, file] of Object.entries(m[key] || {})) {
      const im = await load('../assets/art/' + file);
      if (im) out[kind][id] = [im.width, im.height];
    }
  return out;
}

export const artRows = await measureArt();
export const artManifest = await fetch('/assets/art/manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
export const artSizes = await measureSizes();

// ── 职业等级 / 技能等级 / 承接（src/game/jobskill.js）──────────────────────
export const jsMember = (jobId, level = 1, extra = {}) =>
  normalizeMember({ jobId, level, exp: 0, hp: 20, mp: 20, status: {}, equipment: {}, ...extra }, data);
