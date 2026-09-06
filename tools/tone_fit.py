#!/usr/bin/env python3
"""把一张精灵图的明度/饱和度收进「现有美术」的区间，**不动色相**。

**和 match_tone.py 的分工**：那个是给同一个角色的不同朝向对齐配色的，
连色相一起对齐——用在怪物身上会把绿史莱姆拧成棕色。这里只压明度和饱和度。

**为什么需要**：分批出图时，同一套提示词在不同时候给出的亮度并不稳定。
实测后出的五只怪平均饱和度比先出的十只高 0.227、明度高 0.195，
放进同一张对照图里一眼就看得出是两批东西——纸糊童子亮得像 NPC 不像怪。
FF6 全部怪物共用一套压得很暗的调色板，这种整体感是它耐看的原因之一。

做法：按非透明像素的 S/V 均值算一个缩放系数，把每个像素的 S/V 乘上去，
每个像素与自身均值的相对偏差按原比例保留，所以明暗层次和高光都在，
只是整体压下来。色相一位不动。

阈值不取旧组均值而取「上界」：旧组本身跨度就大（乌泥明度 0.123、芒神 0.576），
硬拉到均值会把这种差异抹平，让所有怪一样暗。只把出界的收回界内。

用法：
  python3 tools/tone_fit.py enemy_paperkid.png              # 收进默认区间
  python3 tools/tone_fit.py enemy_paperkid.png --sv 0.6 0.5 # 指定饱和/明度上限
  python3 tools/tone_fit.py enemy_*.png --dry               # 只报告
"""
import argparse, colorsys, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')
MASTER = os.path.join(ART, 'master')
# 现有十只怪量出来的上界（见 docstring）。留一点余量，不是硬顶。
S_MAX, V_MAX = 0.68, 0.50


def sv_mean(px):
    S = V = n = 0
    for i in range(0, len(px), 4):
        if px[i + 3] < 128: continue
        _, s, v = colorsys.rgb_to_hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255)
        S += s; V += v; n += 1
    return (S / n, V / n, n) if n else (0, 0, 0)


def fit(path, s_max=S_MAX, v_max=V_MAX, dry=False):
    w, h, px = pixel.decode_png(open(path, 'rb').read())
    s0, v0, n = sv_mean(px)
    if not n: return None
    ks = min(1.0, s_max / s0) if s0 else 1.0
    kv = min(1.0, v_max / v0) if v0 else 1.0
    name = os.path.basename(path)
    if ks > 0.999 and kv > 0.999:
        print(f'  {name:26s} 饱和 {s0:.3f} 明度 {v0:.3f}  → 已在区间内，不动')
        return None
    print(f'  {name:26s} 饱和 {s0:.3f}×{ks:.3f} 明度 {v0:.3f}×{kv:.3f}'
          f'  → 饱和 {s0*ks:.3f} 明度 {v0*kv:.3f}')
    if dry: return None
    out = bytearray(px)
    for i in range(0, len(out), 4):
        if out[i + 3] < 128: continue
        hh, s, v = colorsys.rgb_to_hsv(out[i] / 255, out[i + 1] / 255, out[i + 2] / 255)
        r, g, b = colorsys.hsv_to_rgb(hh, min(1, s * ks), min(1, v * kv))
        out[i], out[i + 1], out[i + 2] = round(r * 255), round(g * 255), round(b * 255)
    open(path, 'wb').write(pixel.encode_png(w, h, out))
    return (ks, kv)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--sv', nargs=2, type=float, metavar=('S_MAX', 'V_MAX'))
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--master', action='store_true', help='同时改 master/ 里的母版（改完游戏图要一起改，否则下次派生又退回去）')
    a = ap.parse_args()
    s_max, v_max = a.sv if a.sv else (S_MAX, V_MAX)
    for f in a.files:
        p = f if os.path.sep in f else os.path.join(ART, f)
        if not os.path.exists(p):
            print(f'  ✗ 找不到 {f}'); continue
        fit(p, s_max, v_max, a.dry)
        if a.master:
            mp = os.path.join(MASTER, os.path.basename(f))
            if os.path.exists(mp): fit(mp, s_max, v_max, a.dry)


if __name__ == '__main__':
    main()
