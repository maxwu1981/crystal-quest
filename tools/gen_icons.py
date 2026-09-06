#!/usr/bin/env python3
"""生成 PWA 主屏幕图标 assets/icon-192.png / icon-512.png。

用法：python3 tools/gen_icons.py

不画新美术：主体直接取 assets/art/enemy_knight.png（Boss「乌火」，384×384，已抠好底），
背景与配色取自 src/ui/Window.js 的窗口配色（墨绿 #1a2d25→#08100d、暗金 #e6c46a）。

—— 为什么整张图先在 64×64 上画完再放大 ——
192 = 64×3，512 = 64×8，两个尺寸都是 64 的整数倍。所以先在 64×64 的像素网格上
把背景、火光、乌火全部画完，再用最近邻整数放大，两张图案完全一致、边缘绝对锐利，
和游戏本身的像素风一致。若各自单独缩放，192 那张会被面积平均糊掉。

—— 为什么要有火光 ——
乌火这张图几乎全黑（甲片 rgb(36,36,36)），墨绿底也是暗的，直接叠上去就是一团黑。
在剪影后面垫一圈暖色余烬，剪影才分得出来——名字本来就叫「乌火」，黑甲配火光正好。

—— maskable 安全区 ——
maskable 图标会被系统裁成圆形/方圆形，规范要求主体落在「直径 80% 的中心圆」内。
这里乌火放进中央 37×39 的框，脚本末尾会实测每个不透明像素
到中心的距离，超出安全半径就报错，避免改参数时不知不觉把犄角裁掉。
"""
import os, sys, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'art', 'enemy_knight.png')
OUT = [(192, 'assets/icon-192.png'), (512, 'assets/icon-512.png')]

N = 64                 # 基准网格
FIG_W, FIG_H = 37, 39  # 乌火占的格子（尺寸由文件末尾的安全圆自检卡出来）
FIG_TOP = (64 - 39) // 2  # 垂直居中
SAFE_R = N * 0.40      # maskable 安全圆半径（直径 80%）

TOP = (0x1f, 0x35, 0x2b)    # 背景顶：比窗口的 #1a2d25 稍提亮，小尺寸下才不糊成黑块
BOT = (0x07, 0x0e, 0x0c)    # 背景底
EMBER = (0xff, 0xa8, 0x4a)  # 余烬橙（暗金 #e6c46a 往火里偏一档）
GOLD = (0xe6, 0xc4, 0x6a)   # src/ui/Window.js 的 accent

# 乌火重新上色用的色阶：从最暗到最亮的四档钢蓝黑（原图的黑甲留不出层次，只能重新给）
RAMP = [(0x10, 0x15, 0x1b), (0x1b, 0x23, 0x2c), (0x2b, 0x36, 0x42), (0x44, 0x52, 0x60)]
TRIM = (0x8a, 0x39, 0x2a)   # 甲缝暗红
EYE = (0xff, 0x5f, 0x33)    # 眼睛：整张图唯一的高饱和色，缩到最小也认得出


def blend(dst, i, rgb, a):
    """把 rgb 以 a(0..1) 叠到 dst 的第 i 个像素上（dst 不透明，不用管 alpha 合成）。"""
    for k in range(3):
        dst[i + k] = min(255, max(0, int(dst[i + k] + (rgb[k] - dst[i + k]) * a)))


def knight_layer():
    """把源图裁到包围盒，缩成 FIG_W×FIG_H 的像素画，返回 RGBA bytearray。

    缩完不能直接用：原图九成像素的亮度落在 0–37（中位数 14），37px 高时
    甲片的层次全挤在最暗那一档，看着就是一坨黑。而 pixel.posterize 是逐通道量化的，
    对这种暗图会把相邻像素分到不同档，量出满身红蓝噪点（试过，像撒了彩纸）。

    所以改成按**亮度**重新上色：亮度是一片连续的场，量化出来是成片的面而不是噪点。
    暗部映到 RAMP 的钢蓝黑，红色描边（源图的甲缝和眼睛）单独挑出来给暖色，
    于是小尺寸下还剩两个红点当眼睛——图标缩到 48px 也认得出是谁。
    """
    w, h, px = pixel.decode_png(open(SRC, 'rb').read())
    # 把包围盒撑成 FIG_W:FIG_H 的比例（contain：整个人都装得下），再面积平均缩下去
    box = pixel.fit_box(pixel.alpha_bbox(w, h, px), FIG_W / FIG_H, margin=0, anchor='center')
    fig = pixel.downscale(w, h, px, box, FIG_W, FIG_H)
    pixel.threshold_alpha(fig)   # 边缘二值化，放大后不会出现半透明毛边
    for i in range(0, len(fig), 4):
        if not fig[i + 3]:
            continue
        r, g, b = fig[i], fig[i + 1], fig[i + 2]
        red = r - max(g, b)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if red > 52:      c = EYE          # 眼睛 / 最亮的红甲缝
        elif red > 22:    c = TRIM         # 暗红甲缝
        else:             c = RAMP[min(len(RAMP) - 1, int(lum / 40 * len(RAMP)))]
        fig[i], fig[i + 1], fig[i + 2] = c
    return fig


def distance_field(mask, w, h, maxd):
    """到最近实心像素的距离（BFS，四邻域）。用来做贴着剪影的火光。"""
    from collections import deque
    INF = 10 ** 9
    d = [0 if mask[i] else INF for i in range(w * h)]
    q = deque(i for i in range(w * h) if mask[i])
    while q:
        i = q.popleft()
        if d[i] >= maxd:
            continue
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if d[j] > d[i] + 1:
                    d[j] = d[i] + 1
                    q.append(j)
    return d


def build_base():
    """画出 64×64 的图标（不透明 RGBA）。"""
    out = bytearray(N * N * 4)
    cx, cy = (N - 1) / 2, (N - 1) / 2

    # ① 背景：竖向渐变 + 四角压暗（vignette）。vignette 是圆的，任何裁切形状下都成立
    for y in range(N):
        t = y / (N - 1)
        base = tuple(int(TOP[k] + (BOT[k] - TOP[k]) * t) for k in range(3))
        for x in range(N):
            i = (y * N + x) * 4
            r = math.hypot(x - cx, y - cy) / (N / 2)
            v = max(0.0, 1.0 - 0.55 * max(0.0, r - 0.45) / 0.55)
            out[i] = int(base[0] * v); out[i + 1] = int(base[1] * v); out[i + 2] = int(base[2] * v)
            out[i + 3] = 255

    fig = knight_layer()
    fx, fy = (N - FIG_W) // 2, FIG_TOP

    # 剪影蒙版（放到整张图的坐标系里）
    mask = bytearray(N * N)
    for y in range(FIG_H):
        for x in range(FIG_W):
            if fig[(y * FIG_W + x) * 4 + 3]:
                mask[(fy + y) * N + fx + x] = 1

    # ② 火光盘：剪影后面一团暖光，让黑甲有东西可衬。中心略微上移到胸口高度
    gx, gy, gr = cx, FIG_TOP + FIG_H * 0.42, 25.0
    for y in range(N):
        for x in range(N):
            t = math.hypot(x - gx, y - gy) / gr
            if t >= 1:
                continue
            blend(out, (y * N + x) * 4, EMBER, 0.30 * (1 - t) ** 1.6)

    # ③ 贴边余烬：紧贴剪影 5 格内再加一圈，暗部与背景之间才有一道明确的分界
    d = distance_field(mask, N, N, 5)
    for i in range(N * N):
        if mask[i] or d[i] > 5:
            continue
        a = 0.58 * (1 - (d[i] - 1) / 5) ** 1.5
        blend(out, i * 4, EMBER if d[i] <= 2 else GOLD, a)

    # ④ 贴上乌火本体
    for y in range(FIG_H):
        for x in range(FIG_W):
            s = (y * FIG_W + x) * 4
            if not fig[s + 3]:
                continue
            o = ((fy + y) * N + fx + x) * 4
            out[o:o + 3] = fig[s:s + 3]

    return out, mask


def upscale(src, n, factor):
    """最近邻整数放大，保持像素边缘。"""
    t = n * factor
    out = bytearray(t * t * 4)
    for y in range(t):
        row = (y // factor) * n
        for x in range(t):
            s = (row + x // factor) * 4
            o = (y * t + x) * 4
            out[o:o + 4] = src[s:s + 4]
    return out


def main():
    base, mask = build_base()

    # maskable 自检：主体必须落在中心 80% 直径的圆里
    cx = cy = (N - 1) / 2
    far = max((math.hypot(i % N - cx, i // N - cy) for i in range(N * N) if mask[i]), default=0)
    if far > SAFE_R:
        raise SystemExit(f'主体超出 maskable 安全圆：{far:.1f} > {SAFE_R:.1f}，把 FIG_W/FIG_H 调小')
    print(f'maskable 安全区：主体最远 {far:.1f}px / 允许 {SAFE_R:.1f}px（64 网格）')

    for size, rel in OUT:
        assert size % N == 0, f'{size} 不是 {N} 的整数倍'
        data = pixel.encode_png(size, size, upscale(base, N, size // N))
        path = os.path.join(ROOT, rel)
        open(path, 'wb').write(data)
        print(f'{rel}  {size}×{size}  {len(data) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
