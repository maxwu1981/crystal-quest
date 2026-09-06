#!/usr/bin/env python3
"""把刚回传的怪物母版落成游戏可用的美术：派生尺寸、注册 manifest、去掉借用别人图的 sprite、出一张放大预览。

母版统一是 512×512（ART=8 下最大那只怪的实际需求），游戏用的那份从母版缩下来。
尺寸要显式给：怪物的逻辑大小各是各的（小虫 36、走兽 44、Boss 64），
不能像瓦片那样按一个常数算——战斗画面是用 `img.width / ART` 反推逻辑宽度的。

用法：python3 tools/ship_enemy.py <id> <逻辑尺寸>     例：ship_enemy.py muntjac 44
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART_DIR = os.path.join(ROOT, 'assets', 'art')
MASTER = os.path.join(ART_DIR, 'master')
import re
ART = int(re.search(r'export const ART = (\d+)',
                    open(os.path.join(ROOT, 'src', 'core', 'draw.js'), encoding='utf-8').read()).group(1))


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    eid, logical = sys.argv[1], int(sys.argv[2])
    fname = f'enemy_{eid}.png'
    src = os.path.join(MASTER, fname)
    if not os.path.exists(src):
        print(f'✗ 没有母版 {fname}——先在浏览器里 __shipM'); sys.exit(1)

    w, h, px = pixel.decode_png(open(src, 'rb').read())
    if (w, h) != (512, 512):
        print(f'⚠ 母版是 {w}×{h}，不是 512×512。ART=6 下逻辑 {logical} 需要 {logical*6}px，'
              f'{"够用" if min(w,h) >= logical*6 else "不够，切 ART 会糊"}')
    size = logical * ART
    out = pixel.downscale(w, h, px, (0, 0, w, h), size, size)
    pixel.threshold_alpha(out)
    open(os.path.join(ART_DIR, fname), 'wb').write(pixel.encode_png(size, size, out))
    print(f'派生 {size}×{size}（逻辑 {logical}，ART={ART}）→ assets/art/{fname}')

    # 注册进 manifest
    mp = os.path.join(ART_DIR, 'manifest.json')
    m = json.load(open(mp, encoding='utf-8'))
    m.setdefault('enemies', {})[eid] = fname
    json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    # 去掉「借用别的怪的图」那个字段——有自己的造型之后它就是错的
    ep = os.path.join(ROOT, 'data', 'enemies.json')
    d = json.load(open(ep, encoding='utf-8'))
    es = d if isinstance(d, list) else d.get('enemies', d)
    items = es.values() if isinstance(es, dict) else es
    for e in items:
        if (e.get('id') == eid or (isinstance(es, dict) and es.get(eid) is e)) and e.get('sprite'):
            print(f'  去掉借用 sprite: {e.pop("sprite")}')
    json.dump(d, open(ep, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    # 放大预览，给人眼看
    os.makedirs(os.path.join(ROOT, 'tools', '_cap'), exist_ok=True)
    S = max(1, 288 // size)
    big = bytearray(size * S * size * S * 4)
    for y in range(size * S):
        for x in range(size * S):
            si = ((y // S) * size + (x // S)) * 4
            di = (y * size * S + x) * 4
            big[di:di+4] = out[si:si+4]
    prev = os.path.join(ROOT, 'tools', '_cap', f'prev_{eid}.png')
    open(prev, 'wb').write(pixel.encode_png(size * S, size * S, big))
    print(f'预览 → {prev}')


if __name__ == '__main__':
    main()
