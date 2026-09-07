// 美术与像素换算：尺寸一致性、ART 倍数、镜像名单、防闪周期、属性图标。
// 切 ART 会暴露一整类「写死的物理像素」问题，这一组把那些换算钉成断言。
// 「每个职业都取得到自己的精灵」是新加的——童乩没图时转职菜单光标一移上去当场崩。
//
// 这一组从 tests/run.js 拆出来（那个档到了 1028 行，超 CLAUDE.md 的 400 行上限两倍半）。
// test/assert 与 data 等前置都在 ../context.js，import 进来即注册——
// run.js 只负责按顺序 import 各组再渲染结果。

import { assert, test, data, artRows, artSizes, artManifest } from '../context.js';
import { MIRROR, NO_TOUCH } from '../../src/assets/terrain.js';
import { U, u, us } from '../../src/assets/terrainBits.js';
import { ART, snap } from '../../src/core/draw.js';
import { TILE_FX, DRAW } from '../../src/assets/tiles.js';
import { ELEMENTS, ELEMENT_IDS } from '../../src/battle/elements.js';
import { ELEM_SHAPE, spellIcon } from '../../src/menu/icons.js';

test('每个职业都取得到自己的精灵（含借图的），五处按 jobId 取图的地方才不会拿到 undefined', () => {
  // 精灵是按 `${jobId}_${dir}_${frame}` 直接取的，转职预览、走地图、战斗、
  // 胜利结算五处都这么取。少一个职业的图，光标一移到它上面就是 TypeError 当场崩——
  // 童乩加进 jobs.json 那次正是如此，而 67 条测试全绿。
  // 没画美术的职业用 jobs.json 的 `art` 借别人的（assets/art.js 末尾那段）。
  if (!artManifest) return;                      // 还没生成正式美术就跳过
  const chars = artManifest.characters || {};
  const miss = [];
  for (const id of Object.keys(data.jobs)) {
    const src = data.jobs[id].art || id;         // art 指向谁就查谁
    const v = chars[src];
    if (!v) { miss.push(`${id}${data.jobs[id].art ? `（借 ${src}，但 ${src} 也没有图）` : ''}`); continue; }
    // 至少要有一张基准图（down / left / up 任一），art.js 会从它派生出全部十三张
    if (!(v.down || v.left || v.up)) miss.push(`${id}（${src} 没有基准视角）`);
  }
  assert(!miss.length, '这些职业取不到精灵：' + miss.join(' '));
});

test('正式美术：所有角色精灵一样高、尺寸一致（防止某个职业显得特别小）', () => {
  if (!artRows || !artRows.length) return; // 还没生成正式美术就跳过
  const sizes = new Set(artRows.map(r => r.w + 'x' + r.h));
  assert(sizes.size === 1, '角色图尺寸不统一: ' + [...sizes].join(' '));
  const lo = Math.min(...artRows.map(r => r.ratio)), hi = Math.max(...artRows.map(r => r.ratio));
  const worst = artRows.slice().sort((a, b) => a.ratio - b.ratio)[0];
  assert(hi - lo <= 0.12, `角色身高不一致 ${(lo*100).toFixed(0)}%–${(hi*100).toFixed(0)}%，最矮的是 ${worst.cid}_${worst.view}`);
  assert(lo > 0.8, `${worst.cid}_${worst.view} 只占画布高度 ${(worst.ratio*100).toFixed(0)}%，角色应该几乎占满`);
});

test('正式美术：同一角色同一方向，站姿与迈步帧必须是同一个体型', () => {
  if (!artRows || !artRows.length) return;
  // 只量身高会漏掉「等高但胖瘦两样」——实际踩过：补生成的拳头师侧面站姿
  // 比他自己的侧面迈步少 41% 的实心面积，两张都是 46px 高，旧体检一路绿灯。
  // 只卡实心面积：宽度类指标会被姿势带偏（腿张开、手臂摆动、斗笠帽尖高低），不可靠。
  // 数值抓不到「站着戴斗笠、走起来变兜帽」这种服装漂移，那要靠
  // `python3 tools/proportion_check.py --sheet` 导出的对照图人眼看。
  const by = {};
  for (const r of artRows) (by[r.cid] ||= {})[r.view] = r;
  const bad = [];
  for (const [cid, views] of Object.entries(by)) {
    for (const v of ['down', 'up', 'left', 'right']) {
      const a = views[v], b = views[v + '_walk'];
      if (!a || !b) continue;
      const dev = Math.abs(a.mass - b.mass) / Math.max(a.mass, b.mass);
      if (dev > 0.30) bad.push(`${cid}/${v} 的实心面积差 ${(dev * 100).toFixed(0)}%（${a.mass} vs ${b.mass}）`);
    }
  }
  assert(!bad.length, '这些帧的体型对不上，看起来像两个人：\n      ' + bad.join('\n      '));
});

// ---------------------------------------------------------------------------
// ART 换算的契约。这一组守的是「提高 ART 会暴露一整类写死的物理像素常量」那批坑
// （见项目 CLAUDE.md 的复查表）——每一条都对应一个真踩过的问题。
// ---------------------------------------------------------------------------

test('u() 给尺寸：永远不小于 1 物理像素', () => {
  // 尺寸缩成 0 宽等于这块东西直接消失。ART 再小也得留 1 像素。
  for (const v of [0, 0.1, 0.4, 1, 2, 5, 9]) assert(u(v) >= 1, `u(${v}) = ${u(v)}，小于 1`);
  assert(u(4) === Math.max(1, Math.round(4 * U)), 'u() 的换算比例不对');
});

test('us() 给有符号偏移：必须保号，不能被 u() 的 max(1) 夹住', () => {
  // 真踩过：把 u() 用在 rng.int(-1,1) 上，u(-1) 变成 +1，
  // 于是裂缝只往一边歪、草叶全偏同一侧，抖动整个消失。
  assert(us(-1) < 0, `us(-1) = ${us(-1)}，应该是负的`);
  assert(us(0) === 0, `us(0) = ${us(0)}，应该是 0`);
  assert(us(1) > 0, `us(1) = ${us(1)}，应该是正的`);
  assert(us(-1) === -us(1), 'us() 应该对称');
  assert(u(-1) >= 1, 'u() 本来就该夹取（这条是提醒两者别混用）');
});

test('snap() 把逻辑坐标对齐到物理像素网格', () => {
  // 特效原本用 Math.round(x)，那是对齐**逻辑**网格，等于每步至少挪 ART 个物理像素。
  for (const v of [0, 0.1, 1.4, 7.77, -3.2]) {
    const p = snap(v) * ART;
    assert(Math.abs(p - Math.round(p)) < 1e-9, `snap(${v})*ART = ${p}，不是整数`);
  }
  // 最小步长应当是 1 个物理像素，不是 1 个逻辑像素
  assert(snap(1 / ART) !== snap(0) || ART === 1, 'snap() 的分辨率没有跟着 ART 变细');
});

test('镜像名单里不能出现有方向含义的瓦片', () => {
  // 楼梯/门/屋顶/桥/柜台翻过来就是错的（门开向反了、楼梯朝向反了）。
  // 房子那一套还在 tiles.js 里手工画好了从屋脊到墙脚的明暗序，翻转会把受光面翻到底下。
  const DIRECTIONAL = ['stairs_up', 'stairs_down', 'door', 'door_front', 'bridge', 'counter', 'bed',
    'roof', 'roof_ridge', 'roof_eave', 'wall_upper', 'wall_window', 'wall_base', 'cave_entrance'];
  const bad = DIRECTIONAL.filter(t => MIRROR.has(t));
  assert(!bad.length, '这些瓦片有方向含义，不能镜像：' + bad.join(' '));
  // NO_TOUCH 是「从不接受任何叠加」的那批，和镜像名单必须互斥
  const overlap = [...MIRROR].filter(t => NO_TOUCH.has(t));
  assert(!overlap.length, 'MIRROR 与 NO_TOUCH 重叠：' + overlap.join(' '));
});

test('角色与瓦片的美术尺寸必须正好是 逻辑尺寸 × ART', () => {
  if (!artSizes) return;
  const bad = [];
  for (const [k, [w, h]] of Object.entries(artSizes.characters))
    if (w !== 16 * ART || h !== 24 * ART) bad.push(`char ${k} 是 ${w}×${h}，应为 ${16 * ART}×${24 * ART}`);
  for (const [k, [w, h]] of Object.entries(artSizes.tiles))
    if (w !== 16 * ART || h !== 16 * ART) bad.push(`tile ${k} 是 ${w}×${h}，应为 ${16 * ART}×${16 * ART}`);
  assert(!bad.length, bad.join('\n      '));
});

test('怪物的逻辑尺寸各不相同，且没有被压成瓦片大小', () => {
  if (!artSizes) return;
  // 这条守的是一个真出现过、而且**零报错**的坑：
  // set_art.py 早先把所有非角色资源一律按瓦片（16×16）派生，
  // 而战斗画面是用 `artW = img.width / ART` 反推逻辑宽度的，
  // 于是每只怪都会被压成 16 逻辑像素——山猪本该 44、乌火本该 64。
  const logical = {};
  const bad = [];
  for (const [id, [w, h]] of Object.entries(artSizes.enemies)) {
    if (w % ART || h % ART) { bad.push(`${id} 的 ${w}×${h} 不是 ART(${ART}) 的整数倍`); continue; }
    const lw = w / ART;
    logical[id] = lw;
    if (lw < 24) bad.push(`${id} 只有 ${lw} 逻辑像素宽——像是被按瓦片尺寸派生了`);
    if (lw > 96) bad.push(`${id} 有 ${lw} 逻辑像素宽，超出战斗画面能放下的范围`);
  }
  assert(!bad.length, bad.join('\n      '));
  const vals = Object.values(logical);
  if (vals.length > 3) {
    // 全部一样大 = 逐只的逻辑尺寸丢了。小虫该比 Boss 小。
    assert(new Set(vals).size > 1, `${vals.length} 只怪全是同一个尺寸（${vals[0]}），逐只的逻辑尺寸丢了`);
    assert(Math.max(...vals) >= Math.min(...vals) * 1.5,
      `最大的怪只有最小的 ${(Math.max(...vals) / Math.min(...vals)).toFixed(2)} 倍，体型差被抹平了`);
  }
});

test('每只怪都能取到自己的美术，没有指向不存在的图', () => {
  const miss = [];
  for (const [id, e] of Object.entries(data.enemies)) {
    const key = e.sprite || id;
    if (!artSizes) continue;
    if (!(key in artSizes.enemies)) miss.push(`${id}${e.sprite ? `（借用 ${e.sprite}）` : ''}`);
  }
  assert(!miss.length, '这些怪取不到美术：' + miss.join(' '));
});

test('地图图例引用的瓦片都取得到：要么有程序化画法，要么有正式美术', () => {
  // 瓦片是按名字取的（tiles[legend[ch].tile]），少一张就是 undefined，
  // 画到那一格当场崩——而地图 JSON 看起来完全正常，图例里那一行也在。
  // 新加迷宫瓦片时最容易漏：改了 legend 却忘了在 tiles.js 补兜底、或忘了登记 manifest。
  const have = new Set([...Object.keys(DRAW), ...Object.keys(artManifest?.tiles || {})]);
  const miss = new Set();
  for (const [id, m] of Object.entries(data.maps)) {
    for (const [ch, def] of Object.entries(m.legend || {}))
      if (def.tile && !have.has(def.tile)) miss.add(`${id} 的 '${ch}' → ${def.tile}`);
  }
  assert(!miss.size, '这些瓦片取不到：' + [...miss].join('；'));
});

test('瓦片动画的循环周期不能太快（防闪）', () => {
  // 全项目的规矩：位移动画周期 ≥1.5 秒。瓦片是最占面积的一类——
  // 满屏两百多格一起变，人眼会直接读成「闪」而不是「在动」，所以这里卡得更紧。
  // 现存六种都在 4.8–6.4 秒，留出余量卡在 3 秒。
  const bad = [];
  for (const [id, spec] of Object.entries(TILE_FX)) {
    const period = spec.n * spec.dur;
    if (period < 3) bad.push(`${id} 一圈只有 ${period.toFixed(1)}s`);
  }
  assert(!bad.length, '这些瓦片动画太快，会看成闪烁：' + bad.join('，'));
});

test('每一种魔法属性都有自己的图标形状，不能退回无属性', () => {
  // 战斗里的魔法列表靠属性图标让玩家一眼分辨该不该对这只怪用。
  // 新加一种属性却忘了配图标，会静默退回「无属性宝珠」——
  // 列表看起来正常，但两个不同属性的魔法长得一模一样。
  // 清单不再手写：从 elements.js 那张表拿，加属性时忘了改测试的路直接堵死。
  const miss = new Set();
  for (const id of ELEMENT_IDS) if (!ELEM_SHAPE[id]) miss.add(id);
  for (const sp of Object.values(data.spells)) if (sp.element && !ELEM_SHAPE[sp.element]) miss.add(sp.element);
  for (const sm of Object.values(data.summons || {})) if (sm.element && !ELEM_SHAPE[sm.element]) miss.add(sm.element);
  assert(!miss.size, '这些属性没有配图标（menu/icons.js 的 ELEM_SHAPE）：' + [...miss].join(' '));
});

test('八种属性的图标形状两两不同，没有一对长得一样', () => {
  // 上一条只查「有没有配」。配了但两种属性画的是同一个形，一样分不出来——
  // 旧的「冰」（十字 + 四角点）和「光」（四芒星）就差点撞车，两个都是放射状十字。
  // 这里真的把图标渲染出来比像素：形状一样、只有颜色不同也算撞。
  const sig = new Map();
  for (const id of ELEMENT_IDS) {
    const c = spellIcon({ element: id });
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // 只看不透明的位置，忽略颜色：撞形状比撞颜色严重得多
    let bits = '';
    for (let i = 3; i < px.length; i += 4) bits += px[i] > 32 ? '1' : '0';
    if (sig.has(bits)) assert(false, `${ELEMENTS[id].cn}(${id}) 和 ${ELEMENTS[sig.get(bits)].cn}(${sig.get(bits)}) 的图标形状一模一样`);
    sig.set(bits, id);
    assert(bits.includes('1'), `${id} 的图标是空的`);
  }
  assert(sig.size === 8, `八种属性应该有八个不同的形，实际 ${sig.size} 个`);
});
