#!/usr/bin/env python3
"""检查宝箱位置是否合格，并挑出可用的新位置。

**为什么需要这个工具**：宝箱格在游戏里是不可通行的（FieldScene.passable 对 chest 返回 false）。
往一格宽的走廊里放宝箱会把后面的路整条堵死。加宝箱时如果只用「地形可走」来选点，
必然踩坑——我就把埃癸斯放进了罗经圈深处那条一格宽的磷光石斜廊，直接堵死了通往大武山祭场的楼梯。

用法：
  python3 tools/chestfit.py                 # 体检所有地图
  python3 tools/chestfit.py cave_2 4        # 在 cave_2 找 4 个合格的新宝箱位

判定规则跟 tests/run.js 的 reach() 完全一致：从出生点 BFS，solid 与宝箱格都不能走。
合格条件：① 箱子旁边至少一格可达 ② 放下之后，所有事件/NPC 仍然够得到。
规则跟 tests/run.js 的 reach() 一致：从出生点 BFS，solid 与宝箱格都不能走。
合格条件：① 箱子旁边至少一格可达 ② 放下之后，所有事件/NPC 仍然够得到。"""
import json, collections, sys

def load(name):
    m = json.load(open(f'data/maps/{name}.json', encoding='utf-8'))
    return m, m['rows'], {k: bool(v.get('solid')) for k, v in m['legend'].items()}

def reach(rows, solid, sx, sy, chests):
    H, W = len(rows), len(rows[0])
    seen = {(sx, sy)}; q = collections.deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if not (0 <= nx < W and 0 <= ny < H) or (nx,ny) in seen: continue
            if solid.get(rows[ny][nx], True) or (nx,ny) in chests: continue
            seen.add((nx,ny)); q.append((nx,ny))
    return seen

def audit(name, extra=()):
    m, rows, solid = load(name)
    sx, sy = m['spawn']['x'], m['spawn']['y']
    evs = list(m.get('events') or []); npcs = list(m.get('npcs') or [])
    chests = {(e['x'], e['y']) for e in evs if e.get('type') == 'chest'} | set(extra)
    r = reach(rows, solid, sx, sy, chests)
    near = lambda x, y: any((x+dx, y+dy) in r for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)))
    bad = []
    for e in evs:
        if e.get('type') == 'warp':
            if (e['x'], e['y']) not in r: bad.append(f"传送点 ({e['x']},{e['y']}) 走不到")
        elif not near(e['x'], e['y']):
            bad.append(f"{e.get('type')} {e.get('id','')} ({e['x']},{e['y']}) 旁边走不到")
    for n in npcs:
        if not (near(n['x'], n['y']) or (n['x'], n['y']) in r): bad.append(f"NPC {n['id']} 走不到")
    return bad, r, rows, solid, chests, (sx, sy)

def candidates(name, want, avoid_ids=()):
    """在地图上找 want 个合格的宝箱位：放下去不堵路，且离出生点远、彼此分散。"""
    m, rows, solid = load(name)
    sx, sy = m['spawn']['x'], m['spawn']['y']
    evs = [e for e in (m.get('events') or []) if e.get('id') not in avoid_ids]
    base_chests = {(e['x'], e['y']) for e in evs if e.get('type') == 'chest'}
    occ = base_chests | {(e['x'], e['y']) for e in evs} | {(n['x'], n['y']) for n in (m.get('npcs') or [])}
    r0 = reach(rows, solid, sx, sy, base_chests)
    ok = []
    for (x, y) in sorted(r0, key=lambda p: abs(p[0]-sx)+abs(p[1]-sy), reverse=True):
        if (x, y) in occ: continue
        r = reach(rows, solid, sx, sy, base_chests | {(x, y)})
        # 放下箱子后不能让任何原本可达的格子失联（等价于不堵路），且自己旁边要够得着
        if len(r) != len(r0) - 1: continue
        if not any((x+dx, y+dy) in r for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): continue
        if any(abs(x-a)+abs(y-b) < 4 for a, b in ok): continue
        ok.append((x, y))
        if len(ok) >= want: break
    return ok, rows


if __name__ == '__main__':
    import os
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    MAPS = [f[:-5] for f in sorted(os.listdir('data/maps')) if f.endswith('.json')]
    if len(sys.argv) > 1:
        name = sys.argv[1]; want = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        ok, rows = candidates(name, want)
        print(f'{name} 合格的新宝箱位（离出生点由远到近，彼此至少隔 4 格）：')
        for x, y in ok: print(f'  ({x:2},{y:2}) 地形 {rows[y][x]!r}')
        if not ok: print('  （没有找到——这张图放不下更多宝箱了）')
    else:
        bad_any = False
        for n in MAPS:
            bad, *_ = audit(n)
            print(f'{n:<14}', '✔' if not bad else '✘ ' + ' | '.join(bad))
            bad_any |= bool(bad)
        sys.exit(1 if bad_any else 0)
