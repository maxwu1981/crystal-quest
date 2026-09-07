#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""五个建筑类型的平面图生成器：城堡 / 地宫 / 矿坑 / 神庙 / 天然洞窟。

从 gen_dungeon.py 拆出来（画布与字符表在 dungeon_kit.py，校验与命令行在 gen_dungeon.py）。
每个生成器都是 `f(rng) -> Plan`：只管**按平面图画**，不管连通性与宝箱——
那两件事在 gen_dungeon.py 里统一做（画坏了会被 verify() 挡下来，换个子种子重画）。

判定「像不像那种建筑」的三条硬规矩，五个都守：
  ① 房间是矩形，之间隔着墙，靠**门**相连，不是随手凿的洞；
  ② 走廊笔直、宽度一致（主路宽、服务廊窄），交角是直角；
  ③ 有层级：门厅→大厅→王座厅 是一条能读出来的序列，宝物在**侧翼尽头**而不是主路上。

随机数一律用传进来的 `rng`（`random.Random(seed)` 的显式实例），不用模块级 random。
返回的 Plan 里 `spots` 是宝箱首选位 [(x, y, tag)]，tag 对应 gen_dungeon.TEXTS 的来历文案。
"""
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dungeon_kit import DIRS4, SOLID, Grid, Plan          # noqa: E402

# ---------- 城堡：中轴 + 侧翼 + 塔楼 ----------
# 平面图逻辑：整块砌体里「掏」出房间。竖向是一条能读出来的序列——
# 门厅 → 内庭（露天）→ 大厅（廊柱夹着中轴地毯）→ 王座厅（王座压在轴线尽头）。
# 横向左右各一条纵向长廊（服务廊），长廊外侧挂一串带门的房间：兵房/伙房/库房/礼拜堂/塔楼。
# 主路只走中轴，宝物全在侧翼尽头与塔楼里——玩家要「离开正路」才拿得到。
CASTLE_ROOMS = ['兵房', '伙房', '库房', '礼拜堂']


def gen_castle(rng):
    W = H = 27
    cx = W // 2                       # 13，奇数宽才有真正的中轴
    g = Grid(W, H, 'W')               # 一开始整块是砌体
    xw_out, xw_in = 6, 9              # 侧翼：房间 1..5 | 墙 6 | 长廊 7..8 | 墙 9 | 中庭 10..16
    # 四段的高度，抖一抖但保持总高（5+6+6+5 + 3 道横墙 = 25 = 内部高度）
    hs, floor_h = [5, 5, 7, 5], [4, 4, 7, 4]     # 内庭至少 7 行，不然摆不下水池还剩草地
    for _ in range(4):
        i, j = rng.randrange(4), rng.randrange(4)
        if i != j and hs[i] - 1 >= floor_h[i] and hs[j] < 9:
            hs[i] -= 1; hs[j] += 1
    bands, y = [], 1
    for name, hh in zip(['throne', 'hall', 'court', 'entry'], hs):
        bands.append((name, y, y + hh - 1)); y += hh + 1     # 每段之后留一行墙
    band = dict((n, (a, b)) for n, a, b in bands)

    for n, y0, y1 in bands:                                   # 中庭各段的地
        g.rect(xw_in + 1, y0, W - xw_in - 2, y1, 'o')
        if n != 'entry':                                      # 段与段之间那道墙上开中轴门
            g.put(cx, y1 + 1, 'D')
    # 门厅：中轴铺毯，进门两根柱子夹道（前庭的仪式感，也把「这条是主路」讲明白）
    y0, y1 = band['entry']
    g.rect(cx, y0, cx, y1, ',')
    g.put(cx - 2, y1 - 1, 'I')
    # 内庭：露天草地 + 沿墙一圈铺石走道 + 中央水池。
    # 水池压在中轴上——正路到这里必须一分为二绕过去，绕完在池后合上。真实的内庭就是这样走的。
    y0, y1 = band['court']
    g.rect(xw_in + 1, y0, W - xw_in - 2, y1, 'g')
    g.rect(xw_in + 1, y0, W - xw_in - 2, y0, 'o'); g.rect(xw_in + 1, y1, W - xw_in - 2, y1, 'o')
    g.rect(xw_in + 1, y0, xw_in + 1, y1, 'o')
    py0 = y0 + (y1 - y0) // 2 - 1
    g.rect(cx - 1, py0, cx + 1, min(y1 - 1, py0 + 2), 'w')
    g.put(cx - 2, y0 + 1, 'T'); g.put(cx - 2, y1 - 1, 'T')
    # 大厅：中轴地毯，两列廊柱夹着它。柱距 2 行，重复即节奏，一眼看出是「厅」不是「路」
    y0, y1 = band['hall']
    g.rect(cx, y0, cx, y1, ',')
    for yy in range(y0 + 1, y1, 2):
        g.put(cx - 2, yy, 'I')
    # 王座厅：王座压轴线尽头，两根柱子夹着
    y0, y1 = band['throne']
    g.rect(cx, y0 + 1, cx, y1, ',')
    g.put(cx, y0, 'A'); g.put(cx - 2, y0, 'I')

    # 侧翼：长廊贯通全高，外侧挂房间；房间之间有墙，各自开一扇门到长廊
    g.rect(xw_out + 1, 1, xw_in - 1, H - 2, 'o')
    k = rng.randrange(4, 7)                                    # 侧翼房间数
    avail = H - 2                                              # 1..H-2 共 25 行
    hh = [5] + [4] * (k - 1)                                   # 第一间是角楼，尺寸固定才像塔
    while sum(hh) < avail:
        pick = [i for i in range(1, k) if hh[i] < 8]
        if not pick: break
        hh[rng.choice(pick)] += 1
    yy, rooms = 1, []
    for i, seg in enumerate(hh):
        y0, y1 = yy, min(H - 2, yy + seg - 1)
        if i < k - 1: g.rect(1, y1, xw_out, y1, 'W')           # 房间之间的隔墙
        rooms.append((y0, y1 - (1 if i < k - 1 else 0)))
        yy = y1 + 1
    for i, (y0, y1) in enumerate(rooms):
        if y1 - y0 < 1: continue
        kind = '塔楼' if i == 0 else CASTLE_ROOMS[(i - 1) % len(CASTLE_ROOMS)]
        g.rect(1, y0, xw_out - 1, y1, 'f' if kind == '兵房' else 'o')
        dy0, dy1 = (y0 + 1, y1 - 1) if y1 - y0 >= 2 else (y0, y1)
        g.put(xw_out, rng.randrange(dy0, dy1 + 1), 'D')        # 门开在朝长廊那面墙上，不开在墙角
        if kind == '兵房':                                     # 通铺沿外墙排开
            for by in range(y0, y1 + 1, 2): g.put(1, by, 'B')
        elif kind == '伙房':
            g.rect(1, y0, 2, y0, 'c')
        elif kind == '库房':
            for _ in range(2): g.put(rng.randrange(1, 4), rng.randrange(y0, y1 + 1), 'c')
        elif kind == '礼拜堂':
            g.put(1, (y0 + y1) // 2, 'A'); g.rect(2, (y0 + y1) // 2, xw_out - 1, (y0 + y1) // 2, ',')
        else:                                                  # 塔楼：切角 + 中心楼梯芯
            for cxy in ((1, y0), (1, y1), (xw_out - 1, y0), (xw_out - 1, y1)): g.put(*cxy, 'W')
            g.put(xw_out // 2, (y0 + y1) // 2, 'I')
    # 长廊 ↔ 中庭：门厅一扇、大厅一扇（服务门，正式场合走中轴，下人走边门）
    for bn in ('entry', 'hall'):
        y0, y1 = band[bn]
        g.put(xw_in, rng.randrange(y0 + 1, y1), 'D')

    g.mirror(cx)                                               # 到此为止的一切左右对称
    # 对称之后再放不对称的家具：城门、内梯、宝箱位
    g.put(cx, H - 1, 'D')
    ty0 = band['throne'][0]
    g.put(xw_in + 1, ty0, '>')                                 # 王座旁的私梯，通往更深一层
    spots = [(W - xw_in - 2, ty0, 'throne')]                    # 王座另一侧的角落
    for i, (y0, y1) in enumerate(rooms):                        # 每间房「离门最远的角」
        if y1 - y0 < 1: continue
        tag = 'tower' if i == 0 else {'兵房': 'barracks', '伙房': 'kitchen',
                                      '库房': 'store', '礼拜堂': 'chapel'}[CASTLE_ROOMS[(i - 1) % 4]]
        for sx in (1, W - 2):
            spots.append((sx, y1 if i % 2 else y0, tag))
    rng.shuffle(spots)
    return Plan(g, '隘寮石城 内堂', 'cave', (cx, H - 2), (cx, H - 1), (xw_in + 1, ty0), spots)


# ---------- 地宫：轴线 + 耳室 + 盗洞 ----------
# 平面图逻辑：一条笔直的墓道往里走，前室左右各挂一间耳室（陪葬品在耳室，不在主室），
# 主墓室在最深处，石棺居中，四角有壁龛。轴线上有一块**封门石**堵死正路——
# 唯一的过法是盗墓贼掏的那条歪歪扭扭的盗洞（毛面地，跟砌得笔直的墓道对比强烈）。
def gen_tomb(rng):
    W, H = 21, 31
    cx = W // 2
    g = Grid(W, H, '#')
    bur_h = rng.randrange(5, 9)                                 # 主墓室
    bur = (cx - 4, 2, cx + 4, 2 + bur_h - 1)
    ante_h = rng.randrange(5, 7)                                # 前室
    ante_y0 = bur[3] + 2 + rng.randrange(4, 8)
    ante = (cx - 3, ante_y0, cx + 3, ante_y0 + ante_h - 1)
    g.box(*bur, wall='W', floor='o')
    g.box(*ante, wall='W', floor='o')
    g.corridor(cx, bur[3] + 1, cx, ante[1] - 1)                 # 甬道（主室↔前室）：笔直，宽 1
    g.corridor(cx, ante[3] + 1, cx, H - 2)                      # 墓道（前室↔墓门）
    g.put(cx, bur[3], 'D'); g.put(cx, ante[1], 'D'); g.put(cx, ante[3], 'D')
    ey = (ante[1] + ante[3]) // 2                               # 耳室：前室两侧，短通道 + 两道门
    ear = (cx - 9, ey - 2, cx - 5, ey + 2)
    g.box(*ear, wall='W', floor='o')
    g.corridor(ear[2], ey, ante[0], ey)
    g.put(ante[0], ey, 'D'); g.put(ear[2], ey, 'D')
    for i, ny in enumerate(range(ante[3] + 3, H - 3, 3)):       # 墓道两侧交替的供台小龛：一格深，有的搁灯
        g.put(cx - 1, ny, 'X' if i % 2 else 'o')
    sy = (bur[1] + bur[3]) // 2                                 # 石棺居中，头朝里
    g.rect(cx, sy, cx, min(bur[3] - 1, sy + 1), 'A')
    for ny in (bur[1] + 1, bur[3] - 1):                         # 四角壁龛：凿进侧墙一格，正好搁得下箱子
        g.put(bur[0], ny, 'o')
    g.put(bur[0] + 2, bur[1] + 1, 'X'); g.put(bur[0] + 2, bur[3] - 1, 'X')   # 长明灯
    g.mirror(cx)

    g.put(cx, (bur[3] + ante[1]) // 2, 'R')                     # 封门石：正路到此为止
    # 盗洞：从耳室外壁凿进来，歪歪扭扭地掏到主墓室——封门石之后唯一的活路。
    # 它是**凿**出来的：毛面地、没有直角、宽窄不一，跟砌得笔直的甬道一眼分得开。
    tx, ty = bur[0], rng.randrange(bur[1] + 2, bur[3] - 1)      # 目标：主墓室侧墙
    x, y, tunnel = ear[0], ey, []
    dx, dy = 0, -1
    for _ in range(400):
        if x >= tx and bur[1] < y < bur[3]: break                # 一破进主室就停手，不再沿着墙乱掏
        if rng.random() < 0.45:                                 # 顺着上一步走＝有惯性，路线才歪得自然
            pass
        elif rng.random() < 0.62:                               # 朝目标修正
            dx, dy = (0, 1 if ty > y else -1) if y != ty and rng.random() < 0.55 else (1 if tx > x else -1, 0)
        else:                                                   # 随手挖歪
            dx, dy = rng.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
        x = max(2, min(W - 3, x + dx)); y = max(bur[1] + 1, min(H - 2, y + dy))
        if g.at(x, y) in '#W': g.put(x, y, '.')
        tunnel.append((x, y))
    bx, by = tunnel[len(tunnel) // 2] if tunnel else (ear[0] + 1, ey)
    for _ in range(rng.randrange(2, 4)):                        # 盗贼的岔洞：死路，尽头丢着他们的东西
        if g.at(bx, by + 1) in '#W': g.put(bx, by + 1, '.'); by += 1
    g.put(cx, bur[1], '>')                                      # 石棺后的下行梯
    g.put(cx, H - 1, '<')
    spots = [(bur[0], bur[1] + 1, 'niche'), (W - 1 - bur[0], bur[1] + 1, 'niche'),
             (bur[0], bur[3] - 1, 'niche'), (W - 1 - bur[0], bur[3] - 1, 'niche'),
             (ear[0] + 1, ey - 1, 'ear'), (W - 2 - ear[0], ey + 1, 'ear'), (bx, by, 'robber')]
    return Plan(g, '万金 古塚', 'cave_deep', (cx, H - 2), (cx, H - 1), (cx, bur[1]), spots)


# ---------- 矿坑：主巷道沿矿脉 + 采空区留矿柱 ----------
# 平面图逻辑：先长一条**矿脉**（有动量的折线），主巷道（宽 2）沿着它走——巷道拐弯是因为矿脉拐弯。
# 每隔几格向上/下开一条联络巷，尽头要么是采空区（房柱法：一片挖空的地里留一格格矿柱），
# 要么是废弃的支巷（死路，尽头塌方，箱子就丢在塌方前）。最深处一口竖井下一层。
def gen_mine(rng):
    W, H = 31, 23
    g = Grid(W, H, '#')
    y = rng.randrange(7, H - 9)
    vein, x = [], 2
    while x < W - 3:                                            # 矿脉：走一段、拐一下
        for _ in range(rng.randrange(3, 8)):
            if x >= W - 3: break
            vein.append((x, y)); x += 1
        for _ in range(rng.randrange(1, 4)):
            ny = min(max(4, y + rng.choice((-1, 1))), H - 7)
            if ny != y: y = ny; vein.append((x, y))
    for (vx, vy) in vein:                                       # 主巷道：宽 2，沿矿脉走——巷道拐弯是因为矿脉拐弯
        g.rect(vx, vy, vx, vy + 1, '.')
    spots, xs = [], sorted(set(vx for vx, _ in vein))
    step = rng.randrange(6, 9)
    branch_x = [bx for bx in xs if bx > 5 and (bx - xs[0]) % step == 0]
    for i, bx in enumerate(branch_x[:6]):
        vy = max(vy2 for vx2, vy2 in vein if vx2 == bx)
        up = i % 2 == 0
        ln = rng.randrange(3, 7)
        y0 = max(2, vy - ln) if up else min(H - 3, vy + 1 + ln)
        g.rect(bx, min(vy, y0), bx, max(vy + 1, y0), '.')       # 联络巷（宽 1，笔直，垂直于主巷）
        if rng.random() < 0.55:                                 # 采空区：房柱法留矿柱
            rw, rh = rng.randrange(6, 10), rng.randrange(4, 6)
            rx0 = max(1, min(W - 2 - rw, bx - rw // 2))
            ry0 = max(1, y0 - rh) if up else min(H - 2 - rh, y0)
            g.rect(rx0, ry0, rx0 + rw, ry0 + rh, '.')
            for py in range(ry0 + 1, ry0 + rh, 2):              # 留下的矿柱：规则网格＝人挖的，不是塌出来的
                for px in range(rx0 + 1, rx0 + rw, 3):
                    g.put(px, py, '#')
            spots.append((rx0 if up else rx0 + rw, ry0 if up else ry0 + rh, 'stope'))
        else:                                                   # 废巷：死路 + 塌方，箱子丢在塌方前
            g.put(bx, y0, 'R')
            spots.append((bx, y0 + 1 if up else y0 - 1, 'abandoned'))
    # 采空区的矿柱可能正好落在主巷上：主巷是运料的命脉，最后再清一遍，谁也不许挡
    for (vx, vy) in vein:
        g.rect(vx, vy, vx, vy + 1, '.')
    for (vx, vy) in vein:                                       # 矿脉镶在巷道顶板上：一路跟着巷道走
        if g.at(vx, vy - 1) == '#' and rng.random() < 0.45: g.put(vx, vy - 1, 'X')
    # 水仓：巷道低处积水，一条木栈道跨过去。只挑主巷平直的一段，免得把拐弯处堵死
    ycol = {}
    for vx2, vy2 in vein: ycol.setdefault(vx2, set()).add(vy2)
    flat = [wx for wx in xs[len(xs) // 3:len(xs) * 2 // 3]
            if all(len(ycol.get(wx + d, ())) == 1 for d in (-1, 0, 1))
            and len({tuple(ycol[wx + d]) for d in (-1, 0, 1)}) == 1]
    if flat:
        wx = flat[len(flat) // 2]; wvy = min(ycol[wx])
        g.rect(wx - 1, wvy, wx + 1, wvy + 1, 'w'); g.rect(wx - 1, wvy, wx + 1, wvy, '=')
    # 井底车场 + 竖井：主巷走到头，车场是方的（人砌的），竖井下一层
    ex = xs[-1]; evy = max(vy2 for vx2, vy2 in vein if vx2 == ex)
    ey0, ey1 = max(1, evy - 2), min(H - 2, evy + 4)
    g.box(ex - 4, ey0, ex + 1, ey1, wall='#', floor='.')
    g.rect(ex - 4, evy, ex - 4, evy + 1, '.')                   # 车场朝主巷开口
    g.put(ex, ey1 - 1, '>')
    for oy in (ey0 + 1, ey1 - 1): g.put(ex - 3, oy, 'X')
    sy = min(vy2 for vx2, vy2 in vein if vx2 == xs[0])
    g.put(1, sy, '<'); g.put(2, sy, '.')
    spots.append((ex - 2, ey1 - 1, 'shaft'))
    return Plan(g, '牡丹坑 主巷', 'cave', (2, sy), (1, sy), (ex, ey1 - 1), spots)


# ---------- 神庙：同心方形 + 环廊 ----------
# 平面图逻辑：一圈套一圈，每圈墙只开**一个**门，而且每一圈的门在不同的方向——
# 进来之后你得沿环廊绕四分之一圈才找得到下一道门，一层层收到中心圣所。
# 这是绕行礼（circumambulation）的真实做法，也顺手把「一眼看穿」这件事挡掉了。
def gen_temple(rng):
    W = H = 25
    g = Grid(W, H, '#')
    cx = W // 2
    rings = [0, 4, 8]                                           # 三道墙的内缩量
    g.rect(1, 1, W - 2, H - 2, 'o')                             # 外墙内先全铺石
    sides = ['S', 'E', 'N', 'W']
    turn = rng.choice((1, -1)); s0 = rng.randrange(4)
    gates = []
    for i, r in enumerate(rings):
        g.rect(r, r, W - 1 - r, r, 'W'); g.rect(r, H - 1 - r, W - 1 - r, H - 1 - r, 'W')
        g.rect(r, r, r, H - 1 - r, 'W'); g.rect(W - 1 - r, r, W - 1 - r, H - 1 - r, 'W')
        side = sides[(s0 + turn * i) % 4]
        off = rng.randrange(-2, 3)
        gx, gy = {'S': (cx + off, H - 1 - r), 'N': (cx + off, r),
                  'E': (W - 1 - r, cx + off), 'W': (r, cx + off)}[side]
        g.put(gx, gy, 'D'); gates.append((gx, gy, side))
    inner = rings[-1] + 1                                       # 圣所
    g.rect(inner, inner, W - 1 - inner, H - 1 - inner, 'o')
    g.put(cx, cx, 'C')
    for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2)): g.put(cx + dx, cx + dy, 'I')
    g.put(cx, cx - 2, '>')
    for r in rings[:-1]:                                        # 环廊内侧的列柱：隔一格一根，走起来有节奏
        for t in range(r + 2, W - 1 - r - 1, 2):
            g.put(t, r + 3, 'I'); g.put(t, H - 1 - r - 3, 'I')
            g.put(r + 3, t, 'I'); g.put(W - 1 - r - 3, t, 'I')
    for gx, gy, side in gates:                                  # 门前不立柱：柱子挡在门口，那道门就废了
        nx, ny = {'S': (0, -1), 'N': (0, 1), 'E': (-1, 0), 'W': (1, 0)}[side]
        for s in (1, 2, -1, -2):
            if g.at(gx + nx * s, gy + ny * s) == 'I': g.put(gx + nx * s, gy + ny * s, 'o')
    spots = [(x, y, 'shrine') for r in rings[1:] for x in (r, W - 1 - r) for y in (r, H - 1 - r)]
    for (sx, sy, _) in spots:                                   # 转角小龛：凿进环墙的角里，龛口同样不许立柱
        g.put(sx, sy, 'o')
        for dx, dy in DIRS4:
            if g.at(sx + dx, sy + dy) == 'I': g.put(sx + dx, sy + dy, 'o')
    ent = gates[0]
    for side, (bx, by) in (('S', (cx, H - 1)), ('N', (cx, 0)), ('E', (W - 1, cx)), ('W', (0, cx))):
        if side != ent[2] and g.at(bx, by) == 'W':
            g.put(bx, by, 'R')                                  # 另外三面的门封死了：看得见，走不通
    sp = {'S': (ent[0], ent[1] - 1), 'N': (ent[0], ent[1] + 1),
          'E': (ent[0] - 1, ent[1]), 'W': (ent[0] + 1, ent[1])}[ent[2]]
    g.put(ent[0], ent[1], '<')
    return Plan(g, '三地门 环庙', 'cave_deep', sp, (ent[0], ent[1]), (cx, cx - 2), spots)


# ---------- 天然洞窟：有机形态（对照组） ----------
# 这一张故意**不讲建筑**：元胞自动机长出来的洞，边界是毛的，没有直角也没有门。
# 留着当对照——走完前面四张再走这张，能立刻感到「这里没人住过」。
def gen_cave(rng):
    W, H = 27, 23
    g = Grid(W, H, '#')
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if rng.random() > 0.45: g.put(x, y, '.')
    for _ in range(5):
        new = [row[:] for row in g.g]
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                n = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                        if (dx or dy) and g.at(x + dx, y + dy) == '#')
                new[y][x] = '#' if n >= 5 else '.'
        g.g = new
    comp, seen = [], set()                                       # 只留最大的一块
    for y in range(H):
        for x in range(W):
            if g.at(x, y) != '.' or (x, y) in seen: continue
            q, cur = collections.deque([(x, y)]), []
            seen.add((x, y))
            while q:
                px, py = q.popleft(); cur.append((px, py))
                for dx, dy in DIRS4:
                    if g.at(px + dx, py + dy) == '.' and (px + dx, py + dy) not in seen:
                        seen.add((px + dx, py + dy)); q.append((px + dx, py + dy))
            comp.append(cur)
    comp.sort(key=len, reverse=True)
    for c in comp[1:]:
        for (x, y) in c: g.put(x, y, '#')
    main = set(comp[0])
    far = _farthest(g, next(iter(main)))
    a = _farthest(g, far); b = _farthest(g, a)                   # 双向 BFS 取最远的两点
    px, py = rng.choice(sorted(main))                            # 一潭死水 + 一条沙岸
    for (x, y) in sorted(main):
        if abs(x - px) + abs(y - py) <= 2 and (x, y) not in (a, b): g.put(x, y, 'w')
    for (x, y) in sorted(main):
        if g.at(x, y) == '.' and any(g.at(x + dx, y + dy) == 'w' for dx, dy in DIRS4): g.put(x, y, 'S')
    for (x, y) in sorted(main):
        if g.at(x, y) == '#' and rng.random() < 0.03: g.put(x, y, 'X')
    g.put(a[0], a[1], '<'); g.put(b[0], b[1], '>')
    spots = [(x, y, 'deadend') for (x, y) in sorted(main)
             if sum(1 for dx, dy in DIRS4 if SOLID.get(g.at(x + dx, y + dy), True)) >= 3]
    rng.shuffle(spots)
    sp = next(((a[0] + dx, a[1] + dy) for dx, dy in DIRS4 if g.at(a[0] + dx, a[1] + dy) == '.'), a)
    return Plan(g, '出火 地窟', 'cave', sp, a, b, spots)


def _farthest(g, start):
    seen, q, last = {start}, collections.deque([start]), start
    while q:
        x, y = q.popleft(); last = (x, y)
        for dx, dy in DIRS4:
            n = (x + dx, y + dy)
            if n not in seen and not SOLID.get(g.at(*n), True):
                seen.add(n); q.append(n)
    return last


GENS = {'castle': gen_castle, 'tomb': gen_tomb, 'mine': gen_mine, 'temple': gen_temple, 'cave': gen_cave}
