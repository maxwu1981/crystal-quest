#!/usr/bin/env python3
"""把石材瓦片里的粉红噪点转成中性灰。**只动落在粉色区间的像素**，其他色相一位不动。

**为什么需要**：Gemini 画石材爱带粉红——铺石地踩过两次，石墙这次又中了。
ART=2 时这些粉点会糊成中性灰，看不出来；提到 ART=6 之后一眼就是「带粉斑的惨白灰泥」，
不是石砖。属于「提高精度反而暴露旧问题」的一类。

**为什么不能用 match_tone --pin**：那个会把**整张图**的色相钉到一个值，
石墙上的青苔、木门的暖褐、楼梯的铁件会一起变成同一个颜色。
这里只挑 `色相 ∈ [290°,360°) ∪ [0°,20°)` 且饱和度超过阈值的像素动手。

**为什么不能只降饱和度**：粉点降饱和后变成浅灰，和周围的白墙融成一片，
纹理就没了。所以同时把色相推到暖褐（0.085），保留一点脏色当石材的质感。

用法：
  python3 tools/depink.py tile_wall.png --master            # 去粉
  python3 tools/depink.py tile_wall.png --master --dim 0.72 # 顺便压暗（石墙别惨白）
  python3 tools/depink.py tile_*.png --dry                  # 只报告
"""
import argparse, colorsys, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')
WARM = 0.085          # 暖褐色相，石材脏色该有的方向
KEEP = 0.22           # 去粉后保留的饱和度比例


def is_pink(h, s, cut):
    if s <= cut: return False
    d = h * 360
    return d >= 290 or d < 20


def run(path, cut=0.12, dim=1.0, dry=False):
    w, h, px = pixel.decode_png(open(path, 'rb').read())
    out = bytearray(px)
    n = tot = 0
    for i in range(0, len(out), 4):
        if out[i + 3] < 128: continue
        tot += 1
        hh, s, v = colorsys.rgb_to_hsv(out[i] / 255, out[i + 1] / 255, out[i + 2] / 255)
        changed = False
        if is_pink(hh, s, cut):
            hh, s, n, changed = WARM, s * KEEP, n + 1, True
        if dim != 1.0:
            v, changed = v * dim, True
        if not changed: continue
        r, g, b = colorsys.hsv_to_rgb(hh, min(1, s), min(1, v))
        out[i], out[i+1], out[i+2] = round(r*255), round(g*255), round(b*255)
    name = os.path.basename(path)
    print(f'  {name:22s} 粉 {n*100//max(1,tot):2d}% → 转灰' + (f'，明度 ×{dim}' if dim != 1.0 else ''))
    if not dry:
        open(path, 'wb').write(pixel.encode_png(w, h, out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--cut', type=float, default=0.12, help='饱和度低于这个的粉不算粉（石材本来就有一点脏色）')
    ap.add_argument('--dim', type=float, default=1.0, help='顺便把明度乘上这个数')
    ap.add_argument('--master', action='store_true')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    for f in a.files:
        for base in ([os.path.join(ART, 'master'), ART] if a.master else [ART]):
            p = f if os.path.sep in f else os.path.join(base, os.path.basename(f))
            if os.path.exists(p): run(p, a.cut, a.dim, a.dry)


if __name__ == '__main__':
    main()
