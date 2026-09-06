#!/usr/bin/env python3
"""把刚回传的角色帧母版落成游戏美术：派生尺寸 + 出一张放大预览给人眼看。

角色母版一律 128×192（ART=8 下 16×24 逻辑尺寸的实际需求），所有帧同尺寸，
所以不像怪物那样要显式给逻辑大小——直接走 set_art 的派生逻辑。

**每出一张就要看预览，尤其是朝向**：方向错误任何数值都测不出来
（比例、实心面积、朝向槽位全都正常，因为「朝左」「朝右」「背面」在这些度量上一样）。
踩过一次：char_boxer_left 出成了背面，ship 上去还覆盖了原本正确的那张。

用法：python3 tools/ship_char.py char_talisman_down.png [更多...]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART_DIR = os.path.join(ROOT, 'assets', 'art')
MASTER = os.path.join(ART_DIR, 'master')
CAP = os.path.join(ROOT, 'tools', '_cap')
ART = int(re.search(r'export const ART = (\d+)',
                    open(os.path.join(ROOT, 'src', 'core', 'draw.js'), encoding='utf-8').read()).group(1))


def one(fname):
    src = os.path.join(MASTER, fname)
    if not os.path.exists(src):
        print(f'  ✗ 没有母版 {fname}'); return None
    w, h, px = pixel.decode_png(open(src, 'rb').read())
    if (w, h) != (128, 192):
        print(f'  ⚠ {fname} 母版是 {w}×{h}，期望 128×192')
    tw, th = 16 * ART, 24 * ART
    out = pixel.downscale(w, h, px, (0, 0, w, h), tw, th)
    pixel.threshold_alpha(out)
    open(os.path.join(ART_DIR, fname), 'wb').write(pixel.encode_png(tw, th, out))
    print(f'  {fname:30s} 母版 {w}×{h} → 游戏 {tw}×{th}')
    return (tw, th, out)


def main():
    names = sys.argv[1:]
    if not names:
        print(__doc__); sys.exit(1)
    os.makedirs(CAP, exist_ok=True)
    frames = []
    for n in names:
        r = one(n if n.endswith('.png') else n + '.png')
        if r: frames.append((n, r))
    if not frames: return
    # 并成一张放大对照图（母版精度，看得清朝向和头发位置）
    S = 2
    CW, CH = 128 * S, 192 * S
    W, H = CW * len(frames), CH
    buf = bytearray(W * H * 4)
    for i in range(0, len(buf), 4): buf[i:i+4] = bytes((34, 40, 36, 255))
    for i, (n, _) in enumerate(frames):
        mw, mh, mp = pixel.decode_png(open(os.path.join(MASTER, n if n.endswith('.png') else n + '.png'), 'rb').read())
        for y in range(CH):
            for x in range(CW):
                si = ((y // S) * mw + (x // S)) * 4
                if si + 3 >= len(mp) or mp[si+3] < 128: continue
                di = (y * W + i * CW + x) * 4
                buf[di:di+4] = mp[si:si+4]
    p = os.path.join(CAP, 'sheet_chars.png')
    open(p, 'wb').write(pixel.encode_png(W, H, buf))
    print(f'预览 → {p}')


if __name__ == '__main__':
    main()
