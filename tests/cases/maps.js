// 地图：事件与 NPC 的格式、可达性、宝箱、联通。
// 可达性那几条是这个项目最值钱的测试——宝箱格不可通行，放进一格宽走廊会把路堵死，
// 而那种地图看起来完全正常，只有走过去才发现过不去。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data } from '../context.js';
import { parseMap } from '../../src/field/FieldScene.js';
import { countItem } from '../../src/game/items.js';
import { wrapText } from '../../src/core/text.js';
import { pickVariant, applyVariant } from '../../src/field/npc.js';
import { buyItem, sellItem } from '../../src/game/shop.js';

test('地图事件与 NPC：传送目标存在且可走、NPC 站在可走格、对话/脚本格式正确', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md);
    for (const ev of md.events || []) {
      if (ev.type !== 'warp') continue;
      const to = data.maps[ev.to.map]; assert(to, `${id} 传送到不存在的地图 ${ev.to.map}`);
      const tm = parseMap(to), c = tm.cells[ev.to.y * tm.w + ev.to.x];
      assert(c && !c.solid, `${id} 传送目标 ${ev.to.map}(${ev.to.x},${ev.to.y}) 不可走`);
      assert(!tm.events[`${ev.to.x},${ev.to.y}`], `${id} 传送目标落在另一个传送点上`);
    }
    for (const n of md.npcs || []) {
      const c = m.cells[n.y * m.w + n.x]; assert(c && !c.solid, `${id}/${n.id} 站在不可走格`);
      assert(Array.isArray(n.dialogue) && n.dialogue.length, `${id}/${n.id} 没有对话`);
      for (const v of n.dialogue) assert(Array.isArray(v.lines) && v.lines.length, `${id}/${n.id} 对话缺 lines`);
      if (n.script) { assert(['inn', 'shop', 'boss'].includes(n.script.type), `${n.id} 脚本类型`); for (const it of n.script.items || []) assert(data.items[it], `${n.id} 商店卖不存在的 ${it}`); }
    }
  }
});
test('对话每页最多 3 行（240px 宽，带名字）', () => {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const p of [...data.story.crystal.take, ...data.story.crystal.locked]) assert(wrapText(ctx, p, 240).length <= 4, `story: ${p.slice(0, 12)}…`);
  for (const [id, md] of Object.entries(data.maps)) for (const n of md.npcs || []) {
    const pages = [...n.dialogue.flatMap(v => v.lines), ...(n.script?.wake || []), ...(n.script?.poor || []), ...(n.script?.after || [])];
    for (const p of pages) assert(wrapText(ctx, p, 240).length <= 3, `${id}/${n.id} 这页太长：${p.slice(0, 12)}…`);
  }
});
test('pickVariant / applyVariant：按标志选变体，副作用生效', () => {
  const d = [{ if: 'a', lines: ['A'] }, { unless: 'b', set: ['b'], give: { gold: 5, items: [{ id: 'potion', qty: 2 }] }, lines: ['B'] }, { lines: ['C'] }];
  const st = { flags: {}, gold: 0, inventory: [] };
  assert(applyVariant(pickVariant(d, st.flags), st)[0] === 'B'); assert(st.flags.b && st.gold === 5 && st.inventory[0].qty === 2);
  assert(pickVariant(d, st.flags).lines[0] === 'C'); st.flags.a = true; assert(pickVariant(d, st.flags).lines[0] === 'A');
  assert(pickVariant([], {}) === null && applyVariant(null, st)[0] === '……');
});
test('商店买卖金额', () => {
  const st = { gold: 100, inventory: [] };
  assert(buyItem(st, 'potion', data).ok && st.gold === 70 && countItem(st.inventory, 'potion') === 1);
  assert(!buyItem(st, 'iron_sword', data).ok && st.gold === 70);
  assert(sellItem(st, 'potion', data).ok && st.gold === 85 && st.inventory.length === 0);
  assert(!sellItem(st, 'potion', data).ok);
});

// BFS：从起点能走到的格子集合（宝箱视为障碍）
function reach(m, md, sx, sy) {
  const chests = new Set((md.events || []).filter(e => e.type === 'chest').map(e => `${e.x},${e.y}`));
  const seen = new Set([`${sx},${sy}`]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen.has(k)) continue;
      const c = m.cells[ny * m.w + nx];
      if (c.solid || chests.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
test('可达性：每张地图从出生点能走到所有楼梯/门/水晶旁/宝箱旁；传送落点也可达', () => {
  for (const [id, md] of Object.entries(data.maps)) {
    const m = parseMap(md), r = reach(m, md, md.spawn.x, md.spawn.y);
    const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => r.has(`${x + dx},${y + dy}`));
    for (const ev of md.events || []) {
      if (ev.type === 'warp') { assert(r.has(`${ev.x},${ev.y}`), `${id} 传送点 (${ev.x},${ev.y}) 走不到`); const tm = parseMap(data.maps[ev.to.map]), tr = reach(tm, data.maps[ev.to.map], data.maps[ev.to.map].spawn.x, data.maps[ev.to.map].spawn.y); assert(tr.has(`${ev.to.x},${ev.to.y}`), `${id}→${ev.to.map} 落点 (${ev.to.x},${ev.to.y}) 与目标地图出生点不连通`); }
      else assert(near(ev.x, ev.y), `${id} ${ev.type} (${ev.x},${ev.y}) 旁边走不到`);
    }
    for (const n of md.npcs || []) assert(near(n.x, n.y) || r.has(`${n.x},${n.y}`), `${id}/${n.id} 走不到`);
  }
});
test('宝箱 id 唯一、内容合法；Boss/水晶事件合法；结局文本存在', () => {
  const ids = new Set();
  for (const [id, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) {
      if (ev.type === 'chest') { assert(ev.id && !ids.has(ev.id), `${id} 宝箱 id 重复/缺失`); ids.add(ev.id); assert(ev.gold > 0 || data.items[ev.item], `${id} 宝箱 ${ev.id} 内容无效`); }
      else if (ev.type === 'crystal') assert(!ev.needFlag || typeof ev.needFlag === 'string');
      else assert(ev.type === 'warp', `${id} 未知事件 ${ev.type}`);
    }
    for (const n of md.npcs || []) if (n.script?.type === 'boss') { for (const e of n.script.enemies) assert(data.enemies[e], `${n.id} Boss 敌人 ${e}`); assert(n.script.winFlag && n.unless === n.script.winFlag, `${n.id} Boss 打完应消失`); }
  }
  assert(ids.size >= 5, '宝箱太少'); assert(data.story.ending.lines.length > 5 && data.story.crystal.take.length);
});
test('地图联通：从村子经楼梯能到最深处', () => {
  const seen = new Set(['village']), q = ['village'];
  while (q.length) { const id = q.pop(); for (const ev of data.maps[id].events || []) if (ev.type === 'warp' && !seen.has(ev.to.map)) { seen.add(ev.to.map); q.push(ev.to.map); } }
  assert(seen.has('cave_3'), '到不了 cave_3'); assert(seen.size === Object.keys(data.maps).length, '有地图没连上');
});
