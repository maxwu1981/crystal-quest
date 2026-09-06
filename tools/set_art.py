#!/usr/bin/env python3
"""切换美术精度：从 assets/art/master/ 的高精度母版派生出游戏实际用的 assets/art/。

**为什么要有母版**：`src/core/draw.js` 的 ART 决定画布倍率（逻辑仍是 256×224）。
想提高画面精度就得调大 ART 并把所有美术重新做一遍——但出图管线当初直接把
Gemini 的 1024px 原图处理成 32×48 就落盘了，没留中间产物，于是 78 张资源里
有 56 张想提精度只能重新生成，一张一分钟。

母版把这件事一次性解决：出图时按最高精度（角色 128×192、瓦片 128×128）存进 master/，
游戏用的那份从母版缩下来。之后 ART 想调几次调几次，`python3 tools/set_art.py 4` 就好。
128×192 的 PNG base64 只有 7.5KB，远低于回传通道 64KB 的上限，所以存高精度不花什么代价。

用法：
  python3 tools/set_art.py            # 看当前 ART 与母版覆盖情况
  python3 tools/set_art.py 4          # 切到 ART=4（画布 1024×896，角色 64×96）
  python3 tools/set_art.py 4 --dry    # 只报告不写文件

ART 与实际尺寸的对应（逻辑坐标恒为 256×224）：
  ART=2  画布 512×448    角色 32×48    瓦片 32×32     （初版）
  ART=4  画布 1024×896   角色 64×96    瓦片 64×64
  ART=6  画布 1536×1344  角色 96×144   瓦片 96×96
  ART=8  画布 2048×1792  角色 128×192  瓦片 128×128   （母版精度，再高就得重新出图）
"""
import argparse, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART_DIR = os.path.join(ROOT, 'assets', 'art')
MASTER = os.path.join(ART_DIR, 'master')
DRAW_JS = os.path.join(ROOT, 'src', 'core', 'draw.js')
LOGICAL_CHAR = (16, 24)   # 角色在逻辑坐标下的尺寸
LOGICAL_TILE = (16, 16)


def current_art():
    m = re.search(r'export const ART = (\d+)', open(DRAW_JS, encoding='utf-8').read())
    return int(m.group(1)) if m else None


def is_char(name):
    return name.startswith('char_')


def target_size(name, art):
    lw, lh = LOGICAL_CHAR if is_char(name) else LOGICAL_TILE
    return lw * art, lh * art


def derive(name, art, dry=False):
    src = os.path.join(MASTER, name)
    w, h, px = pixel.decode_png(open(src, 'rb').read())
    tw, th = target_size(name, art)
    if (w, h) == (tw, th):
        return 'already'
    # 母版已经抠好底、裁好框，这里只做等比缩小，不再走一遍抠底/描边
    out = pixel.downscale(w, h, px, (0, 0, w, h), tw, th)
    pixel.threshold_alpha(out)
    if not dry:
        open(os.path.join(ART_DIR, name), 'wb').write(pixel.encode_png(tw, th, out))
    return f'{w}x{h} → {tw}x{th}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('art', nargs='?', type=int)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    cur = current_art()
    masters = sorted(f for f in os.listdir(MASTER) if f.endswith('.png')) if os.path.isdir(MASTER) else []
    manifest = json.load(open(os.path.join(ART_DIR, 'manifest.json'), encoding='utf-8'))
    used = set()
    for v in manifest.get('characters', {}).values(): used.update(v.values())
    used.update(manifest.get('enemies', {}).values())
    used.update(manifest.get('tiles', {}).values())
    missing = sorted(used - set(masters))

    print(f'当前 ART = {cur}（画布 {256*cur}×{224*cur}，角色 {16*cur}×{24*cur}，瓦片 {16*cur}×{16*cur}）')
    print(f'母版覆盖 {len(masters)}/{len(used)} 张')
    if missing:
        print(f'还没有母版的 {len(missing)} 张（这些提不了精度，要重新出图）：')
        for i in range(0, len(missing), 4):
            print('   ', '  '.join(m.replace('.png', '') for m in missing[i:i+4]))
    if a.art is None:
        return
    if a.art not in (2, 4, 6, 8):
        print('ART 只支持 2 / 4 / 6 / 8'); sys.exit(1)

    print()
    n = 0
    for f in masters:
        if f not in used: continue
        r = derive(f, a.art, a.dry)
        if r != 'already': n += 1
    print(f'{"（试跑）" if a.dry else ""}从母版派生了 {n} 张')
    if not a.dry:
        s = open(DRAW_JS, encoding='utf-8').read()
        open(DRAW_JS, 'w', encoding='utf-8').write(
            re.sub(r'export const ART = \d+', f'export const ART = {a.art}', s))
        print(f'draw.js 的 ART 已改成 {a.art}')
        if missing:
            print(f'注意：{len(missing)} 张没有母版的资源仍是旧精度，'
                  f'在新 ART 下会被放大显示，看起来比别的糊。')


if __name__ == '__main__':
    main()
