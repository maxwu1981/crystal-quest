#!/usr/bin/env python3
"""把 Gemini 出的瓦片母版做**明度量化**，让它跟程序化瓦片同一种画法。

**为什么要有**：程序化瓦片是硬边平涂（铺石 48 色、洞窟地 65 色），
而 Gemini 直接出的图是连续调（木箱 4670 色、碎石 3830 色）。两种画法并排铺在
同一张地图上，看起来就是「不同材质混在一起、分不清哪是路哪是背景」——
导演原话。**这不是内容问题，是画法问题**：同样一张图，量化之后就能跟老瓦片坐在一起。

只处理母版；游戏用的那份由 tools/set_art.py 从母版派生。

用法：python3 tools/posterize_tiles.py tile_throne tile_crate ...
      python3 tools/posterize_tiles.py --all   # 母版里所有 tile_*，跳过已经够少色的
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MASTER = os.path.join(ROOT, 'assets', 'art', 'master')
# 用 posterize_luma 而不是 posterize：后者三通道独立取整，会把接近灰的石头**染蓝**
# （(120,125,135) → (109,109,146)）。实测整面城墙变成蓝紫色，比不量化还糟。
LEVELS = 8      # 跟项目其余美术同一档。实测那 900~5000 色
                # 大半是抗锯齿噪声，8 档压完落在 16~76 色，正好跟老瓦片的 48~305 同一量级。
KEEP = 400      # 已经少于这个色数的就别再压了（多半是程序化来的，压了会更糊）


def colors(w, h, px):
    return len({tuple(px[i:i + 3]) for i in range(0, len(px), 4) if px[i + 3] > 8})


def run(name):
    p = os.path.join(MASTER, name if name.endswith('.png') else name + '.png')
    if not os.path.exists(p):
        return f'  ✗ 没有 {name}'
    w, h, px = pixel.decode_png(open(p, 'rb').read())
    before = colors(w, h, px)
    if before <= KEEP:
        return f'  · {name:22s} {before} 色，已经够少，跳过'
    pixel.posterize_luma(px, LEVELS)
    after = colors(w, h, px)
    open(p, 'wb').write(pixel.encode_png(w, h, px))
    return f'  ✔ {name:22s} {before} → {after} 色'


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    names = ([f[:-4] for f in sorted(os.listdir(MASTER)) if f.startswith('tile_')]
             if args[0] == '--all' else args)
    print(f'色阶量化（每通道 {LEVELS} 档）：')
    for n in names:
        print(run(n))
