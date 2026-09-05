#!/usr/bin/env python3
"""把浏览器下载的 Gemini 原图导入成游戏用的像素精灵。

配合 Gemini 网页版（Nano Banana）使用，不需要 API key：
  1. 在 gemini.google.com 生成图片，下载到 ~/Downloads，文件名就用目标资产名
     （char_warrior_down.png / enemy_goblin.png / tile_grass.png）
  2. python3 tools/import_downloads.py
     → 原图存进 assets/art/raw/，处理后的像素图存进 assets/art/，并更新 manifest.json

Gemini 下载下来的其实是 JPEG，这里先用 macOS 自带的 sips 转成 PNG（零依赖），
再走 tools/pixel.py 的管线：洋红抠底 → 按包围盒裁剪 → 面积平均缩小 → 色阶量化 → 描边。

用法：
  python3 tools/import_downloads.py                 # 导入 ~/Downloads 里所有匹配的图
  python3 tools/import_downloads.py --dir <目录>     # 从别的目录导入
  python3 tools/import_downloads.py --keep          # 导入后不删除下载目录里的原文件
"""
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel
from gen_art import ART, CHAR_SIZE, ENEMIES, CHARACTERS, TILES

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ARTDIR = os.path.join(ROOT, 'assets', 'art')
RAW = os.path.join(ARTDIR, 'raw')
MANIFEST = os.path.join(ARTDIR, 'manifest.json')
VIEWS = ('down', 'up', 'left')


def target_of(name):
    """文件名 → (kind, id, view, (w,h))；不认识的返回 None"""
    base = os.path.splitext(name)[0]
    if base.startswith('char_'):
        rest = base[5:]
        for v in VIEWS:
            if rest.endswith('_' + v):
                cid = rest[:-len(v) - 1]
                if cid in CHARACTERS: return 'char', cid, v, CHAR_SIZE
    elif base.startswith('enemy_'):
        eid = base[6:]
        if eid in ENEMIES: return 'enemy', eid, None, (ENEMIES[eid][1] * ART,) * 2
    elif base.startswith('tile_'):
        tid = base[5:]
        if tid in TILES: return 'tile', tid, None, (16 * ART, 16 * ART)
    return None


def to_png(path):
    """任何格式 → PNG 字节（用 macOS 的 sips，不需要第三方库）"""
    if open(path, 'rb').read(8) == b'\x89PNG\r\n\x1a\n':
        return open(path, 'rb').read()
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f: tmp = f.name
    r = subprocess.run(['sips', '-s', 'format', 'png', path, '--out', tmp],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode != 0: raise RuntimeError(f'sips 转换失败: {r.stderr.decode()[:200]}')
    data = open(tmp, 'rb').read(); os.unlink(tmp)
    return data


def load_manifest():
    if os.path.exists(MANIFEST):
        try: return json.load(open(MANIFEST))
        except ValueError: pass
    return {'characters': {}, 'enemies': {}, 'tiles': {}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=os.path.expanduser('~/Downloads'))
    ap.add_argument('--keep', action='store_true')
    a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    m = load_manifest()
    done = 0
    for name in sorted(os.listdir(a.dir)):
        t = target_of(name)
        if not t: continue
        kind, cid, view, (tw, th) = t
        src = os.path.join(a.dir, name)
        try:
            png = to_png(src)
            w, h, px = pixel.decode_png(png)
            out = pixel.process_sprite(w, h, bytearray(px), tw, th,
                                       anchor='bottom' if kind == 'char' else 'center',
                                       key=(kind != 'tile'))
            fname = f'{kind if kind != "char" else "char"}_{cid}' + (f'_{view}' if view else '') + '.png'
            open(os.path.join(RAW, fname), 'wb').write(png)
            open(os.path.join(ARTDIR, fname), 'wb').write(pixel.encode_png(tw, th, out))
            if kind == 'char': m['characters'].setdefault(cid, {})[view] = fname
            elif kind == 'enemy': m['enemies'][cid] = fname
            else: m['tiles'][cid] = fname
            if not a.keep: os.unlink(src)
            print(f'  ✔ {fname}  {w}×{h} → {tw}×{th}')
            done += 1
        except Exception as e:
            print(f'  ✘ {name}: {e}')
    json.dump(m, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
    have = len(m['characters']) * 0 + sum(len(v) for v in m['characters'].values()) + len(m['enemies']) + len(m['tiles'])
    print(f'导入 {done} 张；清单里现在共 {have} 张')


if __name__ == '__main__': main()
