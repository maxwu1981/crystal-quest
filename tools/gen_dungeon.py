#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按「建筑类型」生成迷宫地图 JSON（格式同 data/maps/cave_*.json）。

**为什么不是随机迷宫**：随机走廊没有性格，走进去只知道「这是个洞」。
真实建筑的路线来自用途——城堡有中轴、侧翼与塔楼；墓是甬道串耳室，主室在最深处；
矿坑的巷道沿矿脉走，采空区留矿柱；庙是一圈套一圈，门错开逼你绕环廊。
所以这里每一种都是**按平面图画**再加参数抖动，而不是「挖到通为止」。

**三份分工**（原本一份 682 行，超了 CLAUDE.md 的 400 行上限）：
  dungeon_kit.py   角色字符表 ROLE + 画布 Grid + 交件 Plan
  dungeon_plans.py 五个平面图生成器（gen_castle / gen_tomb / gen_mine / gen_temple / gen_cave）
  gen_dungeon.py   连通性校验 verify() / 宝箱铺放 place_chests() / 组装 / 命令行   ← 本档
依赖是单向的 gen_dungeon → dungeon_plans → dungeon_kit，没有环。

随机数一律用 `random.Random(seed)` 显式实例（项目全局禁 Math.random，python 侧照办）。
同 seed 同结果；生成时就跑连通性检查（规则与 tests/run.js 的 reach() 一致：
solid 与宝箱格都不能走），不过就换个子种子重来。

用法：
  python3 tools/gen_dungeon.py castle --seed 7 --out data/maps/gen_castle_1.json --print
  python3 tools/gen_dungeon.py --samples      # 生成全套示例图（data/maps/gen_*.json）
  python3 tools/gen_dungeon.py --check        # 体检所有 data/maps/gen_*.json
  python3 tools/gen_dungeon.py --tiles        # 打印「还缺哪些瓦片」清单
类型：castle 城堡 / tomb 地宫 / mine 矿坑 / temple 神庙 / cave 天然洞窟
入口出口默认**不带 warp 事件**（免得指向不存在的地图），要接线加
  --entry overworld:20,4   （站上入口格 → 传送到 overworld(20,4)）
  --exit  gen_castle_2:9,25
地图名（生成器给的是通名，接进主线时该改成那张图自己的名字）：
  --name 隘寮石城
"""
import argparse, collections, json, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dungeon_kit import DIRS4, ROLE, SOLID                # noqa: E402
from dungeon_plans import GENS                            # noqa: E402


# ---------- 连通性（规则与 tests/run.js 的 reach() 一致：solid 与宝箱格都不能走） ----------
# 返回 {格子: 从出生点走几步}——`in` 和 `len()` 用法跟集合一样，另外还能拿来排「谁更深」。
def reach(rows, solid, sx, sy, blocked=()):
    H, W = len(rows), len(rows[0])
    seen, q = {(sx, sy): 0}, collections.deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS4:
            n = (x + dx, y + dy)
            if not (0 <= n[0] < W and 0 <= n[1] < H) or n in seen: continue
            if solid.get(rows[n[1]][n[0]], True) or n in blocked: continue
            seen[n] = seen[(x, y)] + 1; q.append(n)
    return seen


def verify(md, extra=None):
    """返回问题清单，空＝合格。检查项：行等长 / 图例完整 / 出生点可走 /
    入口→出口连通 / 每个事件（宝箱旁、传送点上）够得到 / 宝箱 id 唯一。"""
    bad, rows = [], md['rows']
    w = len(rows[0]) if rows else 0
    for i, r in enumerate(rows):
        if len(r) != w: bad.append(f'第 {i} 行长度 {len(r)} ≠ {w}')
    solid = {}
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            d = md['legend'].get(ch)
            if d is None: bad.append(f"未定义字符 {ch!r} at ({x},{y})"); continue
            solid[ch] = bool(d.get('solid'))
    for ch, d in md['legend'].items():
        if 'tile' not in d: bad.append(f'图例 {ch!r} 没有 tile')
    if bad: return bad
    sx, sy = md['spawn']['x'], md['spawn']['y']
    if solid.get(rows[sy][sx], True): bad.append(f'出生点 ({sx},{sy}) 不可走')
    evs = md.get('events') or []
    chests = frozenset((e['x'], e['y']) for e in evs if e.get('type') == 'chest')
    r = reach(rows, solid, sx, sy, chests)
    near = lambda x, y: any((x + dx, y + dy) in r for dx, dy in DIRS4)
    for e in evs:
        if e.get('type') == 'warp':
            if (e['x'], e['y']) not in r: bad.append(f"传送点 ({e['x']},{e['y']}) 走不到")
        elif not near(e['x'], e['y']):
            bad.append(f"{e.get('type')} {e.get('id','')} ({e['x']},{e['y']}) 旁边走不到")
    ids = set()
    for e in evs:
        if e.get('type') != 'chest': continue
        if not e.get('id') or e['id'] in ids: bad.append(f"宝箱 id 重复/缺失 {e.get('id')}")
        ids.add(e.get('id'))
    for n in md.get('npcs') or []:
        if not (near(n['x'], n['y']) or (n['x'], n['y']) in r): bad.append(f"NPC {n['id']} 走不到")
    ex = (extra or {}).get('exit')
    if ex and tuple(ex) not in r: bad.append(f'出口 {tuple(ex)} 从入口走不到')
    en = (extra or {}).get('entry')
    if en and tuple(en) not in r: bad.append(f'入口 {tuple(en)} 走不到')
    return bad


# ---------- 宝箱 ----------
# 规则跟 tools/chestfit.py 一样：宝箱格不可通行，所以放下去**不能让任何原本可达的格子失联**。
# 首选位来自各生成器给的「侧翼尽头 / 壁龛 / 废巷尽头」，不够再全图扫。
# 每张表按「越后面越好」排；箱子按**离出生点的步数**从近到远配对，走得越深拿得越好。
LOOT = {
    'castle': [('item', 'hipotion', 2), ('item', 'ether', 2), ('gold', 200), ('item', 'phoenix', 1),
               ('item', 'bronze_armor', 1), ('gold', 320), ('item', 'power_band', 1)],
    'tomb': [('item', 'antidote', 3), ('item', 'hiether', 2), ('gold', 260), ('item', 'phoenix', 2),
             ('item', 'guard_band', 1), ('gold', 380), ('item', 'xpotion', 1)],
    'mine': [('item', 'potion', 3), ('gold', 150), ('item', 'eyedrop', 3), ('item', 'tent', 1),
             ('item', 'copper_ring', 1), ('gold', 300), ('item', 'hipotion', 2)],
    'temple': [('item', 'ether', 3), ('item', 'bell', 2), ('gold', 240), ('item', 'hipotion', 2),
               ('item', 'silk_robe', 1), ('gold', 400), ('item', 'elixir', 1)],
    'cave': [('item', 'potion', 3), ('item', 'antidote', 2), ('gold', 120), ('item', 'ether', 1),
             ('item', 'tent', 1), ('gold', 220), ('item', 'phoenix', 1)],
}
TEXTS = {
    'barracks': ['通铺上叠着六床被，叠得整整齐齐。', '第七床没叠，摊开着，人像是刚起身。'],
    'kitchen': ['灶还是温的。锅里有饭，粒粒分明，没人动过。'],
    'store': ['木箱上写着堆数与年份。年份比庄里最老的人还老。'],
    'chapel': ['神案上三炷香烧到一半就断了。', '断口是齐的——不是烧断的，是掐断的。'],
    'tower': ['塔顶的窗朝北。北边是山，山那边这几日一直没有烟。'],
    'throne': ['椅子的扶手磨得发亮，坐的人爱把左手往外搭。'],
    'niche': ['壁龛里的陶俑面朝墙站着，一排十二个。', '摆的人知道它们该朝哪边——朝里，不朝外。'],
    'ear': ['耳室是给活人放东西的，不是给死人用的。', '东西还在，放东西的人不在。'],
    'robber': ['洞是从外面掏进来的，边上还留着凿子的斜口。', '掏洞的人东西丢了一地，没带走。'],
    'stope': ['矿柱一根根留着，间距分毫不差。', '挖到这里就停了。不是挖完了，是不敢再挖。'],
    'abandoned': ['支巷尽头塌了一半，撑木断在半空。', '断口朝里——是从里面顶出来的。'],
    'shaft': ['井口的绞盘还在，绳子垂到底下，绳头是断的。'],
    'shrine': ['龛里的灯油干了，灯芯还立着。'],
    'deadend': ['石缝里卡着东西，不知道卡了多久。'],
}


def place_chests(plan, mapid, kind, want):
    rows = plan.g.rows()
    base = reach(rows, SOLID, *plan.spawn)
    fixed = {plan.entry, plan.exit, plan.spawn}
    cands = [(x, y, t) for (x, y, t) in plan.spots]
    scan = []
    for (x, y) in sorted(base):                                  # 补位：离出生点远、三面是墙的凹角优先
        n_solid = sum(1 for dx, dy in DIRS4 if SOLID.get(plan.g.at(x + dx, y + dy), True))
        scan.append((-(n_solid * 6 + abs(x - plan.spawn[0]) + abs(y - plan.spawn[1])), x, y))
    scan.sort()
    cands += [(x, y, 'deadend') for _, x, y in scan]
    picked, blocked = [], set()
    for (x, y, tag) in cands:
        if len(picked) >= want: break
        if (x, y) in fixed or (x, y) in blocked or (x, y) not in base: continue
        if plan.g.at(x, y) in '<>D=': continue
        if any(abs(x - px) + abs(y - py) < 4 for px, py, _ in picked): continue
        r = reach(rows, SOLID, *plan.spawn, blocked=blocked | {(x, y)})
        if len(r) != len(base) - len(blocked) - 1: continue       # 放下去堵了别的路 → 换一个
        if not any((x + dx, y + dy) in r for dx, dy in DIRS4): continue
        blocked.add((x, y)); picked.append((x, y, tag))
    picked.sort(key=lambda p: min(base.get((p[0] + dx, p[1] + dy), 1 << 20) for dx, dy in DIRS4))
    evs, pool, used = [], LOOT[kind], set()
    for i, (x, y, tag) in enumerate(picked):
        loot = pool[i % len(pool)]
        e = {'x': x, 'y': y, 'type': 'chest', 'id': f'{mapid}_{i + 1}'}
        if loot[0] == 'gold': e['gold'] = loot[1]
        else: e['item'] = loot[1]; e['qty'] = loot[2]
        if tag in TEXTS and tag not in used:
            used.add(tag); e['text'] = TEXTS[tag]
        evs.append(e)
    return evs


# ---------- 组装 / 生成 ----------
def assemble(plan, mapid, kind, nchests, zone, entry_to, exit_to, name=None):
    rows = plan.g.rows()
    used = sorted(set(''.join(rows)))
    legend = {}
    for ch in used:
        tile, solid, enc = ROLE[ch][0], ROLE[ch][1], ROLE[ch][2]
        d = {'tile': tile}
        if solid: d['solid'] = True
        if enc: d['encounter'] = True
        legend[ch] = d
    md = {'name': name or plan.name, 'encounterZone': zone or plan.zone,
          'spawn': {'x': plan.spawn[0], 'y': plan.spawn[1]}, 'legend': legend, 'rows': rows,
          'events': [], 'npcs': [],
          'gen': {'kind': kind, 'entry': list(plan.entry), 'exit': list(plan.exit)}}
    md['events'] = place_chests(plan, mapid, kind, nchests)
    for pos, to in ((plan.entry, entry_to), (plan.exit, exit_to)):
        if not to: continue
        m, xy = to.split(':'); x, y = xy.split(',')
        md['events'].insert(0, {'x': pos[0], 'y': pos[1], 'type': 'warp',
                                'to': {'map': m, 'x': int(x), 'y': int(y), 'facing': 'down'}})
    return md


def build(kind, seed, mapid, nchests=6, zone=None, entry_to=None, exit_to=None, name=None, tries=40):
    for att in range(tries):
        rng = random.Random((seed * 1000003) ^ (att * 7919))     # 同 seed 同结果；失败换子种子重来
        plan = GENS[kind](rng)
        md = assemble(plan, mapid, kind, nchests, zone, entry_to, exit_to, name)
        bad = verify(md, md['gen'])
        if not bad:
            md['gen']['seed'] = seed; md['gen']['attempt'] = att
            return md, att
    raise SystemExit(f'{kind} seed={seed}: {tries} 次都没生成出合格的图\n  最后一次：' + ' | '.join(bad))


SAMPLES = [('castle', 11, 'gen_castle_1'), ('castle', 23, 'gen_castle_2'), ('tomb', 5, 'gen_tomb_1'),
           ('mine', 3, 'gen_mine_1'), ('temple', 9, 'gen_temple_1'), ('cave', 17, 'gen_cave_1')]


def write(md, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(md, f, ensure_ascii=False, indent=1)
        f.write('\n')


def main():
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    ap = argparse.ArgumentParser(description='按建筑类型生成迷宫地图')
    ap.add_argument('kind', nargs='?', choices=sorted(GENS))
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out'); ap.add_argument('--chests', type=int, default=6)
    ap.add_argument('--zone'); ap.add_argument('--entry'); ap.add_argument('--exit', dest='exit_to')
    ap.add_argument('--name', help='地图名；不给就用生成器的通名（接进主线时该给一个专名）')
    ap.add_argument('--print', dest='show', action='store_true', help='终端画一张 ASCII 预览')
    ap.add_argument('--samples', action='store_true'); ap.add_argument('--check', nargs='*')
    ap.add_argument('--tiles', action='store_true')
    a = ap.parse_args()

    if a.tiles:
        print('生成器用到的角色字符 → 现有瓦片；「想要」一栏是建议新增的美术：')
        for ch, (tile, s, e, use, want) in ROLE.items():
            print(f"  {ch}  {tile:<12}{'实心' if s else '可走'}  {use}")
            if want: print(f"       想要：{want}")
        return
    if a.check is not None:
        # 不给名字就体检所有「生成出来的」图。认的是 JSON 里的 gen 块，不是 gen_ 这个文件名前缀——
        # 接进主线的图会改成自己的名字（fort_ailiao / tomb_wanjin），按文件名筛就漏掉了。
        names = a.check or [f[:-5] for f in sorted(os.listdir('data/maps')) if f.endswith('.json')
                            and 'gen' in json.load(open(f'data/maps/{f}', encoding='utf-8'))]
        rc = 0
        for n in names:
            n = n[:-5] if n.endswith('.json') else n
            md = json.load(open(f'data/maps/{os.path.basename(n)}.json', encoding='utf-8'))
            bad = verify(md, md.get('gen'))
            rows = md['rows']
            walk = sum(1 for r in rows for ch in r if not md['legend'][ch].get('solid'))
            print(f"{n:<16} {len(rows[0])}×{len(rows)} 可走 {walk:4} 宝箱 "
                  f"{sum(1 for e in md.get('events',[]) if e['type']=='chest')}  " +
                  ('✔ 连通' if not bad else '✘ ' + ' | '.join(bad)))
            rc |= bool(bad)
        sys.exit(rc)
    if not a.samples and not a.kind: ap.error('要么给类型（castle/tomb/mine/temple/cave），要么 --samples')
    jobs = SAMPLES if a.samples else [(a.kind, a.seed, os.path.basename(a.out or '').replace('.json', '')
                                       or f'gen_{a.kind}_{a.seed}')]
    for kind, seed, mapid in jobs:
        md, att = build(kind, seed, mapid, a.chests, a.zone, a.entry, a.exit_to,
                        None if a.samples else a.name)
        path = a.out if (a.out and not a.samples) else f'data/maps/{mapid}.json'
        write(md, path)
        print(f"{mapid:<16} {kind:<7} seed={seed} 第 {att + 1} 次通过  {len(md['rows'][0])}×{len(md['rows'])} "
              f"宝箱 {sum(1 for e in md['events'] if e['type']=='chest')} → {path}")
        if a.show:
            for r in md['rows']: print('  ' + r)


if __name__ == '__main__':
    main()
