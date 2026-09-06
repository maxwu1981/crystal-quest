#!/usr/bin/env python3
"""给已生成的角色精灵换配色。

用途：Gemini 出的图造型不错，但配色撞上了经典 JRPG 的招牌形象
（白袍红边＝白魔、蓝尖帽＝黑魔、红羽帽＝赤魔）。造型可以留，配色换掉就不像了。
颜色替换按「色相映射」做：把某个色相范围整体挪到新色相，保留原本的明暗层次，
所以换完仍然有立体感，不会变成一片死色。

用法：
  python3 tools/recolor.py --list herbwife          # 看这个角色现在有哪些颜色
  python3 tools/recolor.py herbwife talisman peddler # 按下面 SCHEMES 的配方换色（会改 assets/art/ 里的图）
  python3 tools/recolor.py --restore herbwife        # 从 assets/art/raw/ 重新处理，撤销换色
"""
import argparse, colorsys, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'assets', 'art')
MANIFEST = os.path.join(ART, 'manifest.json')

# 每个角色一条配方：把命中的色相范围整体换成新色相/饱和度
# rule = (色相下限, 色相上限, 饱和度下限, 新色相, 饱和度倍率, 明度倍率)
# 色相用 0–1（0=红, 0.17=黄, 0.33=绿, 0.5=青, 0.67=蓝, 0.83=品红）
SCHEMES = {
    # 白袍红边 → 深靛蓝外套配米色边：先把接近白的压成靛蓝，再把红边转成米黄
    'herbwife': {
        'desc': '白袍红边 → 深靛蓝外套 + 米色滚边',
        'gray': (0.62, 0.45, 0.42),          # 近乎无彩色的像素 → 靛蓝(色相,饱和,明度倍率)
        'rules': [(0.92, 1.01, 0.15, 0.11, 0.75, 1.15), (0.0, 0.06, 0.15, 0.11, 0.75, 1.15)],
    },
    # 蓝尖帽蓝袍 → 焦黑外套，眼睛留一点暗红
    'talisman': {
        'desc': '蓝尖帽蓝袍 → 焦黑外套',
        'rules': [(0.55, 0.75, 0.10, 0.07, 0.35, 0.55)],
    },
    # 红帽红衣 → 橄榄绿旅行装
    'peddler': {
        'desc': '红帽红衣 → 橄榄绿旅行装',
        'rules': [(0.92, 1.01, 0.25, 0.22, 0.55, 0.95), (0.0, 0.10, 0.25, 0.22, 0.55, 0.95)],
    },
}


def recolor_px(px, scheme):
    rules, gray = scheme.get('rules', []), scheme.get('gray')
    for i in range(0, len(px), 4):
        if not px[i + 3]:
            continue
        r, g, b = px[i] / 255, px[i + 1] / 255, px[i + 2] / 255
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        hit = False
        for lo, hi, smin, nh, smul, vmul in rules:
            if lo <= h < hi and s >= smin:
                h, s, v = nh, min(1, s * smul), min(1, v * vmul)
                hit = True
                break
        # 低饱和（白/灰）的像素单独一条规则，用来把白袍染色
        if not hit and gray and s < 0.18 and v > 0.35:
            nh, ns, vmul = gray
            h, s, v = nh, ns, min(1, v * vmul)
        nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
        px[i], px[i + 1], px[i + 2] = int(nr * 255), int(ng * 255), int(nb * 255)
    return px


def files_of(cid, m):
    return list(m['characters'].get(cid, {}).values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--list', metavar='ID')
    ap.add_argument('--restore', action='store_true')
    a = ap.parse_args()
    m = json.load(open(MANIFEST, encoding='utf-8'))

    if a.list:
        import collections
        for f in files_of(a.list, m):
            w, h, px = pixel.decode_png(open(os.path.join(ART, f), 'rb').read())
            c = collections.Counter()
            for i in range(0, len(px), 4):
                if px[i + 3]: c[(px[i], px[i + 1], px[i + 2])] += 1
            print(f, ' '.join('#%02x%02x%02x×%d' % (*k, n) for k, n in c.most_common(6)))
        return

    for cid in a.ids:
        sch = SCHEMES.get(cid)
        if not sch and not a.restore:
            print(f'  ! 没有 {cid} 的配方'); continue
        for f in files_of(cid, m):
            src = os.path.join(ART, 'raw', f) if a.restore else os.path.join(ART, f)
            if not os.path.exists(src):
                print(f'  ! 缺原图 {src}'); continue
            w, h, px = pixel.decode_png(open(src, 'rb').read())
            if a.restore:
                out = pixel.process_sprite(w, h, bytearray(px), 32, 48, anchor='bottom', fit='height')
                open(os.path.join(ART, f), 'wb').write(pixel.encode_png(32, 48, out))
            else:
                open(os.path.join(ART, f), 'wb').write(pixel.encode_png(w, h, recolor_px(bytearray(px), sch)))
            print(f'  ✔ {f}')
        if sch and not a.restore: print(f'    {cid}: {sch["desc"]}')


if __name__ == '__main__':
    main()
