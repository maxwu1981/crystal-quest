#!/usr/bin/env python3
"""把一张精灵图的整体色调对齐到同一角色的另一张图。

**为什么需要**：单独补生成某个方向的图时，Gemini 不会记得同一个角色上一次的配色。
符仔仙的正面是焦黑长袍，补出来的侧面却成了红棕；青草婆的侧面是深靛蓝，
补出来的正面偏紫。走起路来一换方向颜色就跳，看着像换了个人。

做法：取两张图非透明像素的 HSV 均值，把源图整体平移/缩放到目标图的色调上，
再把每个像素与自身均值的偏差按原比例加回去，所以明暗层次和高光都保留。
只调色调，不动造型。

近乎无彩的深色角色（例如符仔仙的焦黑长袍）色相分布很散，整体平移会把它拧成另一种颜色
（实测把红棕平移成了橄榄绿），这种情况加 --pin 把色相钉到目标均值。

用法：
  python3 tools/match_tone.py char_talisman_left.png char_talisman_down.png
  python3 tools/match_tone.py --dry ...      # 只打印数字，不写文件
"""
import argparse, colorsys, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')


def hsv_pixels(path):
    w, h, px = pixel.decode_png(open(path, 'rb').read())
    out = []
    for i in range(0, len(px), 4):
        if px[i + 3] < 128:
            continue
        out.append(colorsys.rgb_to_hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255))
    return w, h, bytearray(px), out


def circ_mean_hue(hs):
    """色相是环形的，直接取算术平均会在红色附近绕回去出错"""
    import math
    x = sum(math.cos(2 * math.pi * h) for h in hs) / max(1, len(hs))
    y = sum(math.sin(2 * math.pi * h) for h in hs) / max(1, len(hs))
    return (math.atan2(y, x) / (2 * math.pi)) % 1.0


def stats(hsv):
    hs = [h for h, s, v in hsv if s > 0.12]        # 近乎无彩的像素不参与色相统计
    sm = sum(s for _, s, _ in hsv) / max(1, len(hsv))
    vm = sum(v for _, _, v in hsv) / max(1, len(hsv))
    return circ_mean_hue(hs) if hs else 0.0, sm, vm


def match(src_name, ref_name, dry=False, pin=False):
    sp, rp = os.path.join(ART, src_name), os.path.join(ART, ref_name)
    w, h, px, shsv = hsv_pixels(sp)
    _, _, _, rhsv = hsv_pixels(rp)
    sh, ss, sv = stats(shsv)
    rh, rs, rv = stats(rhsv)
    dh = (rh - sh) % 1.0
    ks = rs / ss if ss > 0.01 else 1.0
    kv = rv / sv if sv > 0.01 else 1.0
    mode = '钉定' if pin else f'平移 {dh:+.3f}'
    print(f'  {src_name} 色相 {sh:.3f}→{rh:.3f} ({mode})  饱和 ×{ks:.2f}  明度 ×{kv:.2f}')
    if dry:
        return
    shutil.copyfile(sp, os.path.join(ART, 'raw', src_name))
    for i in range(0, len(px), 4):
        if px[i + 3] < 128:
            continue
        hh, s, v = colorsys.rgb_to_hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255)
        hh = rh if pin else (hh + dh) % 1.0
        s = min(1.0, s * ks)
        v = min(1.0, v * kv)
        r, g, b = colorsys.hsv_to_rgb(hh, s, v)
        px[i], px[i + 1], px[i + 2] = int(r * 255), int(g * 255), int(b * 255)
    open(sp, 'wb').write(pixel.encode_png(w, h, px))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('ref'); ap.add_argument('--dry', action='store_true')
    ap.add_argument('--pin', action='store_true',
                    help='把色相钉到目标均值，而不是整体平移。近乎无彩的深色角色（焦黑袍之类）'
                         '色相分布很散，平移会整体跑偏成别的颜色，这时用钉定')
    a = ap.parse_args()
    match(a.src, a.ref, a.dry, a.pin)
    print('  完成' if not a.dry else '  （试跑，没写文件）')
