#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按「建筑类型」生成迷宫地图 JSON（格式同 data/maps/cave_*.json）。

**为什么不是随机迷宫**：随机走廊没有性格，走进去只知道「这是个洞」。
真实建筑的路线来自用途——城堡有中轴、侧翼与塔楼；墓是甬道串耳室，主室在最深处；
矿坑的巷道沿矿脉走，采空区留矿柱；庙是一圈套一圈，门错开逼你绕环廊。
所以这里每一种都是**按平面图画**再加参数抖动，而不是「挖到通为止」。
判定「像不像那种建筑」的三条硬规矩，五个生成器都守：
  ① 房间是矩形，之间隔着墙，靠**门**相连，不是随手凿的洞；
  ② 走廊笔直、宽度一致（主路宽、服务廊窄），交角是直角；
  ③ 有层级：门厅→大厅→王座厅 是一条能读出来的序列，宝物在**侧翼尽头**而不是主路上。

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
"""
import argparse, collections, json, os, random, sys
from dataclasses import dataclass, field

# ---------- 角色字符 → 瓦片 ----------
# (tile, solid, encounter, 用途, 想要的专用瓦片；空串＝现有瓦片就够)
ROLE = {
    '#': ('cave_wall',   1, 0, '岩体：建筑之外的山体、未开挖的岩石', ''),
    'W': ('wall',        1, 0, '砌筑墙体：城堡/庙/墓的墙',
          'stone_wall 石砌墙——现在借室内白灰墙，城堡看起来像「屋里」而不是城'),
    '.': ('cave_floor',  0, 1, '毛面地：洞窟地面、矿坑巷道、盗洞', ''),
    'o': ('flagstone',   0, 1, '铺石地：厅、廊、甬道', ''),
    ',': ('floor',       0, 1, '中轴地毯 / 圣道——现在借木地板',
          'carpet 红毯，最好三张：中段、端头、转角'),
    'f': ('floor',       0, 1, '木地板：兵房、居室', ''),
    'D': ('door',        0, 0, '门洞',
          'arch_door 拱门——现在借村屋木门，城堡尺度上偏小'),
    'I': ('wall',        1, 0, '廊柱——现在借墙，一根柱子看起来像一小段墙',
          'pillar 廊柱（柱础/柱身/柱头三段，单格）'),
    'A': ('counter',     1, 0, '王座 / 祭坛 / 石棺——现在借商店柜台',
          'throne 王座、altar 祭坛、sarcophagus 石棺（三张，各自形状差很多）'),
    'B': ('bed',         1, 0, '床铺：兵房通铺', ''),
    'c': ('counter',     1, 0, '灶台 / 长桌 / 木箱堆',
          'crate 木箱堆、stove 灶台（现在都借柜台，一间伙房全是柜台有点怪）'),
    'X': ('glowstone',   1, 0, '矿脉 / 壁上磷光',
          'ore_vein 矿脉（铜绿矿石嵌在岩壁里，跟磷光石区分开）'),
    'R': ('mountain',    1, 0, '塌方碎石 / 封门石——现在借山岩',
          'rubble 碎石堆、seal_stone 封门石（墓门那块该是一整块方石）'),
    'w': ('water',       1, 0, '积水 / 池 / 矿坑水仓', ''),
    '=': ('bridge',      0, 0, '栈道 / 桥', 'plank 矿坑木栈道（比石桥窄、有横撑）'),
    'S': ('sand',        0, 1, '土面：庙前庭、内庭空地', ''),
    'g': ('grass',       0, 1, '内庭草地', ''),
    'T': ('tree',        1, 0, '内庭树', ''),
    'C': ('crystal',     1, 0, '圣所神像 / 水晶', 'idol 神像（现在借水晶，会跟结局那颗撞脸）'),
    '<': ('stairs_up',   0, 0, '上行梯（回头路）', ''),
    '>': ('stairs_down', 0, 0, '下行梯（更深一层）', ''),
}
SOLID = {c: bool(v[1]) for c, v in ROLE.items()}
DIRS4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


class Grid:
    def __init__(self, w, h, ch='#'):
        self.w, self.h = w, h
        self.g = [[ch] * w for _ in range(h)]

    def at(self, x, y):
        return self.g[y][x] if 0 <= x < self.w and 0 <= y < self.h else '#'

    def put(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = ch

    def rect(self, x0, y0, x1, y1, ch):
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                self.g[y][x] = ch

    def wall_rect(self, x0, y0, x1, y1, wall):
        """砌墙：只砌在**未开挖**的岩体上。墙填的是空处，不会把已经挖好的房间吃掉一格。"""
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                if self.g[y][x] == '#': self.g[y][x] = wall

    def box(self, x0, y0, x1, y1, wall='W', floor=None):
        """画一间房：外圈墙，内部地板。墙是**画上去**的，房间之间因此天然隔着墙。"""
        self.wall_rect(x0, y0, x1, y0, wall); self.wall_rect(x0, y1, x1, y1, wall)
        self.wall_rect(x0, y0, x0, y1, wall); self.wall_rect(x1, y0, x1, y1, wall)
        if floor: self.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor)

    def corridor(self, x0, y0, x1, y1, floor='o', wall='W'):
        """笔直走廊：先在外圈砌一圈壁，再铺地。走廊有壁＝这是砌出来的，不是凿的洞。"""
        if wall: self.wall_rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, wall)
        self.rect(x0, y0, x1, y1, floor)

    def mirror(self, cx):
        """左半 + 中轴 镜像到右半：中轴对称是**画出来**的，不靠碰运气。"""
        for y in range(self.h):
            for dx in range(1, cx + 1):
                self.g[y][cx + dx] = self.g[y][cx - dx]

    def rows(self):
        return [''.join(r) for r in self.g]


@dataclass
class Plan:
    g: Grid
    name: str
    zone: str
    spawn: tuple
    entry: tuple
    exit: tuple
    spots: list = field(default_factory=list)   # [(x, y, tag)] 宝箱首选位，越前面越「该放好东西」


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
def assemble(plan, mapid, kind, nchests, zone, entry_to, exit_to):
    rows = plan.g.rows()
    used = sorted(set(''.join(rows)))
    legend = {}
    for ch in used:
        tile, solid, enc = ROLE[ch][0], ROLE[ch][1], ROLE[ch][2]
        d = {'tile': tile}
        if solid: d['solid'] = True
        if enc: d['encounter'] = True
        legend[ch] = d
    md = {'name': plan.name, 'encounterZone': zone or plan.zone,
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


def build(kind, seed, mapid, nchests=6, zone=None, entry_to=None, exit_to=None, tries=40):
    for att in range(tries):
        rng = random.Random((seed * 1000003) ^ (att * 7919))     # 同 seed 同结果；失败换子种子重来
        plan = GENS[kind](rng)
        md = assemble(plan, mapid, kind, nchests, zone, entry_to, exit_to)
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
        names = a.check or sorted(f[:-5] for f in os.listdir('data/maps') if f.startswith('gen_'))
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
        md, att = build(kind, seed, mapid, a.chests, a.zone, a.entry, a.exit_to)
        path = a.out if (a.out and not a.samples) else f'data/maps/{mapid}.json'
        write(md, path)
        print(f"{mapid:<16} {kind:<7} seed={seed} 第 {att + 1} 次通过  {len(md['rows'][0])}×{len(md['rows'])} "
              f"宝箱 {sum(1 for e in md['events'] if e['type']=='chest')} → {path}")
        if a.show:
            for r in md['rows']: print('  ' + r)


if __name__ == '__main__':
    main()
