// 测试入口：按顺序载入各组（import 的副作用就是注册测试），然后渲染结果。
// 各组在 cases/ 下，前置在 context.js——拆开的理由写在那个档头上。
// **顺序有意义**：报错时从上往下读，先看公式再看数据再看行为，定位最快。

import { results, test, assert } from './context.js';
import './cases/formulas.js';
import './cases/data.js';
import './cases/maps.js';
import './cases/party.js';
import './cases/gear.js';
import './cases/battle.js';
import './cases/art.js';


// **每个模块都要 import 得动。** 语法错误只有加载那一刻才炸，
// 而 tests/run.js 只 import 它自己用得到的那些——touch.js、pwa.js、各个 scene
// 一个都不在里面。实际踩过：touch.js 里的一段 CSS 写在模板串里，
// 里面的 `\21BB` 被 JS 当成八进制转义，整个模块 SyntaxError，游戏白屏，
// 而 55 条测试全绿、lint_modules.py 三项全过——两边都看不见语法。
//
// 文件清单从**目录列表**拿：开发服务器就是 python 的 http.server，
// 它自带目录列表。硬编码一份清单一定会跟不上新增的文件（这个月新增了 9 个）。
async function jsUnder(dir) {
  const html = await (await fetch(dir)).text();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => decodeURIComponent(m[1]));
  let out = [];
  for (const h of hrefs) {
    if (h.startsWith('/') || h.startsWith('.')) continue;
    if (h.endsWith('.js')) out.push(dir + h);
    else if (h.endsWith('/')) out = out.concat(await jsUnder(dir + h));
  }
  return out;
}
try {
  // main.js 跳过：它是入口，import 的一刻就要拿 #game 画布、起 RAF 循环、开音频。
  // 少查它损失不大——入口一挂就是白屏，打开游戏立刻看得见；
  // 真正会静悄悄坏掉的是那些叶子模块（touch.js 那次正是如此）。
  const files = (await jsUnder('/src/')).filter(f => f !== '/src/main.js');
  const bad = [];
  for (const f of files) {
    try { await import(f); } catch (e) { bad.push(`${f}: ${e.message || e}`); }
  }
  test(`每个模块都 import 得动（${files.length} 个）`, () => {
    assert(files.length > 30, '只找到 ' + files.length + ' 个模块，目录列表大概没取到');
    assert(!bad.length, '\n    ' + bad.join('\n    '));
  });
} catch (e) {
  test('每个模块都 import 得动', () => assert(false, '取模块清单失败：' + e));
}

const out = document.getElementById('out');
out.innerHTML = results.map(r => `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : '\n    ' + r.err}</span>`).join('\n')
  + `\n\n${results.filter(r => r.ok).length}/${results.length} 通过`;
window.__testResults = results;
console.log('tests', results);
