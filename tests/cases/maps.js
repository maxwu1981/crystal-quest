// 地图：事件与 NPC 的格式、可达性、宝箱、联通。
// 可达性那几条是这个项目最值钱的测试——宝箱格不可通行，放进一格宽走廊会把路堵死，
// 而那种地图看起来完全正常，只有走过去才发现过不去。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data } from '../context.js';
import { CASTER, SEAMABLE, NO_TOUCH } from '../../src/assets/terrain.js';
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
// 传送的落点不能压在另一个传送格上——落地的那一刻会立刻再被传走，
// 两张图之间来回弹，玩家按什么都出不来。可走性那条查不到这个：那一格是可走的。
// 现有的每一对都是**错开一格**的（overworld(20,3) 下去落在 cave_1(1,17)，
// 而回程的门在 cave_1(1,18)），新接的壇下与爐底也照这个来。
test('传送的落点不能压在另一个传送格上，否则会来回弹出不来', () => {
  const bad = [];
  for (const [id, md] of Object.entries(data.maps)) {
    for (const ev of md.events || []) {
      if (ev.type !== 'warp') continue;
      const tm = data.maps[ev.to.map];
      if (!tm) continue;                       // 「目标存在」由另一条测试卡着
      const onTop = (tm.events || []).some(e => e.type === 'warp' && e.x === ev.to.x && e.y === ev.to.y);
      if (onTop) bad.push(`${id}(${ev.x},${ev.y}) → ${ev.to.map}(${ev.to.x},${ev.to.y})`);
    }
  }
  assert(!bad.length, '这些传送落在另一个传送格上：\n    ' + bad.join('\n    '));
});

test('地图联通：从村子经楼梯能到最深处', () => {
  const seen = new Set(['village']), q = ['village'];
  while (q.length) { const id = q.pop(); for (const ev of data.maps[id].events || []) if (ev.type === 'warp' && !seen.has(ev.to.map)) { seen.add(ev.to.map); q.push(ev.to.map); } }
  assert(seen.has('cave_3'), '到不了 cave_3'); assert(seen.size === Object.keys(data.maps).length, '有地图没连上');
});

// ── 「站着挡路」的瓦片必须登记成投影源 ─────────────────────────────────────
// 漏登记的后果不只是少一道影子：terrain.js 的 `inert` 是拿 CASTER 判的，
// 所以漏掉的墙**还会反过来接受地面那一套**——崖影投在墙上、青苔裂缝长到墙面上。
// 而这一切都不报错、不影响测试，只是那张图读起来是平的。
//
// 真事：stone_wall 漏在表外，隘寮石城整整 351 格是它，
// 而它和自家地板 flagstone 的明度差只有 10.9/255（墙 85,92,94 / 地 105,101,97）——
// 本来就快分不出来了，再少一道墙脚影，整张图就读不出哪里是路。
// 补上之后墙脚的明暗落差从 13.6 涨到 37.4（在实机画面上量的）。
test('每一种「站着挡路」的瓦片都登记成了投影源，漏了整张图会读不出路', () => {
  // 三类例外：
  //   FLAT   本来就是地面的一部分，不是立起来的东西
  //   SEAMABLE 抠底合成那一批——影子按自己的轮廓烘进合成图（terrainBake 的 seamTile），
  //            按格子铺反而会落成一个方框
  //   NO_TOUCH 房子那一套，明暗从屋脊到墙脚是手工画好的，再加一层就是双重影子
  const FLAT = new Set(['water', 'glowstone']);
  const missing = [];
  for (const [id, md] of Object.entries(data.maps)) {
    const used = new Set();
    for (const row of md.rows) for (const ch of row) used.add(ch);
    for (const [ch, def] of Object.entries(md.legend)) {
      if (!def.solid || !used.has(ch)) continue;
      const t = def.tile;
      if (CASTER[t] !== undefined || SEAMABLE.has(t) || NO_TOUCH.has(t) || FLAT.has(t)) continue;
      missing.push(`${id} 的「${t}」`);
    }
  }
  assert(!missing.length, '这些瓦片挡路却不投影，也不属于任何一类例外：\n    ' + [...new Set(missing)].join('\n    '));
});
