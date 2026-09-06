#!/usr/bin/env python3
"""把一条 768×192 的六格长图切成六张 128×192 的角色母版。

**为什么走长图**：逐帧单独生成压不住漂移——同一个角色的六帧，帽檐几何、袍色
会在帧与帧之间跳（实测符仔仙的袍色从褐漂到灰又漂到橄榄绿），
而「和上一张保持一致」这句话传过去的特征不稳定，还会把视角一起传过来
（把侧面帧的帽子几何复制到正面帧上）。一次出一整张精灵表，六个姿势画在同一张图里，
配色比例服装天生一致。

**为什么拼成长图再传**：Gemini 是公网源，`<img>` 往 127.0.0.1 发数据会被 Chrome 的
Private Network Access 挡掉，只能顶层跳转；而跳转一次就丢一次页面。
六格拼成一条一次传完，比传六次少五次来回。

六格的顺序固定：down / down_walk / left / left_walk / up / up_walk

用法：python3 tools/split_strip.py char_talisman
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MASTER = os.path.join(ROOT, 'assets', 'art', 'master')
VIEWS = ['down', 'down_walk', 'left', 'left_walk', 'up', 'up_walk']


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    prefix = sys.argv[1]
    src = os.path.join(MASTER, prefix + '_STRIP.png')
    if not os.path.exists(src):
        print(f'✗ 没有 {prefix}_STRIP.png'); sys.exit(1)
    w, h, px = pixel.decode_png(open(src, 'rb').read())
    if (w, h) != (768, 192):
        print(f'⚠ 长图是 {w}×{h}，期望 768×192'); sys.exit(1)
    for i, v in enumerate(VIEWS):
        cell = bytearray(128 * 192 * 4)
        for y in range(192):
            row = (y * w + i * 128) * 4
            cell[y*128*4:(y+1)*128*4] = px[row:row + 128*4]
        name = f'{prefix}_{v}.png'
        open(os.path.join(MASTER, name), 'wb').write(pixel.encode_png(128, 192, cell))
        n = sum(1 for k in range(3, len(cell), 4) if cell[k] > 128)
        print(f'  {name:30s} 实心 {n:5d} px')
    os.remove(src)


if __name__ == '__main__':
    main()
