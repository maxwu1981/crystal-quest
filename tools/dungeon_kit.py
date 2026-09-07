#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""迷宫生成的画布与字符表——五个平面图生成器共用的那几件东西。

从 gen_dungeon.py 拆出来（三份的最底层，不 import 任何本项目的模块）：
  dungeon_kit.py   角色字符表 ROLE + 画布 Grid + 交件 Plan   ← 本档
  dungeon_plans.py 五个建筑类型的平面图生成器
  gen_dungeon.py   连通性校验 / 宝箱铺放 / 组装 / 命令行

**Grid 的方法就是这套生成器的「画法」**：box() 画房（墙画在岩体上，房间之间因此天然
隔着墙）、corridor() 画笔直走廊（先砌壁再铺地）、mirror() 把左半镜像成右半（中轴对称
是画出来的，不靠碰运气）。想加第六种建筑，先看这三个方法能不能表达它的平面图。
"""
from dataclasses import dataclass, field

# ---------- 角色字符 → 瓦片 ----------
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
