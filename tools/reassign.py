#!/usr/bin/env python3
"""按配色重新认领角色图，修掉多次改名后「张冠李戴」的问题。

背景：职业改过两轮名字（FF 风 → 原创 → 台湾），每轮都在重命名 PNG，
中途有文件被覆盖，最后出现「山猎人的正面是战士的图、背面走路帧是青草婆的图」这种错位。
文件名已经不可信，但**图像本身的配色**是可信的，所以改用配色来判断每张图属于谁。

做法：
  1. 读 assets/art/raw/ 里的原图（洋红底、未处理），统计主色
  2. 归到一个「色系」（金发红甲 / 橙发青绿 / 橙武服 / 白袍 / 蓝尖帽 / 红羽帽 / 苔绿披风）
  3. 每个色系按原文件名里的视角后缀（down/left/up，可带 _walk）认领槽位，
     同槽位撞车时保留实心像素多的那张
  4. 按 JOBS 的对应关系重新处理并写出 assets/art/，重建 manifest.json

用法：python3 tools/reassign.py           # 试跑，只打印结果
      python3 tools/reassign.py --apply   # 真的写文件
"""
import argparse, collections, colorsys, json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'assets', 'art')
RAW = os.path.join(ART, 'raw')
MANIFEST = os.path.join(ART, 'manifest.json')
VIEWS = ('down', 'up', 'left')

# 色系 → 现在的职业 id
FAMILY_TO_JOB = {
    'warrior_like': 'boxer',      # 金发 + 红甲
    'thief_like':   'hunter',     # 橙发 + 青绿衣
    'monk_like':    'general',    # 大面积橙色武服
    'white_like':   'herbwife',   # 白袍（换色前）
    'blue_like':    'talisman',   # 蓝尖帽（换色前）
    'red_like':     'peddler',    # 红衣红帽
    'mossy':        None,         # 今天新生成的苔绿披风，暂时没有对应职业
}


def profile(path):
    """统计主色占比，顺便返回实心像素数（用来在撞车时挑更完整的那张）"""
    w, h, px = pixel.decode_png(open(path, 'rb').read())
    b = collections.Counter(); n = 0; solid = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            i = (y * w + x) * 4
            r, g, bl = px[i] / 255, px[i + 1] / 255, px[i + 2] / 255
            hh, s, v = colorsys.rgb_to_hsv(r, g, bl)
            if 0.78 < hh < 0.92 and s > 0.55: continue      # 洋红背景不算
            solid += 1
            if v < 0.12: b['dark'] += 1
            elif s < 0.15 and v > 0.75: b['white'] += 1
            elif 0.55 < hh < 0.72 and s > 0.35: b['blue'] += 1
            elif 0.40 < hh < 0.55 and s > 0.30: b['teal'] += 1
            elif 0.11 < hh < 0.20 and s > 0.45 and v > 0.6: b['yellow'] += 1
            elif 0.02 < hh < 0.11 and s > 0.50: b['orange'] += 1
            elif (hh < 0.02 or hh > 0.95) and s > 0.45: b['red'] += 1
            elif 0.18 < hh < 0.40 and s > 0.20: b['green'] += 1
            n += 1
    pct = {k: v * 100 // max(1, n) for k, v in b.items()}
    return pct, solid


def family_of(p):
    """按主色占比判断色系。阈值来自实际统计，注释里写的是典型值。"""
    w, t, bl, o, y, r, g = (p.get(k, 0) for k in ('white', 'teal', 'blue', 'orange', 'yellow', 'red', 'green'))
    if w >= 35: return 'white_like'                     # 白袍 44–59%
    if bl >= 55: return 'blue_like'                     # 蓝袍尖帽 64–78%
    if t >= 18: return 'thief_like'                     # 青绿衣 21–47%
    if r >= 35: return 'red_like'                       # 红衣 43–48%
    if g >= 12 and o < 25: return 'mossy'               # 苔绿披风 16%
    if o >= 45: return 'monk_like'                      # 大面积橙武服 50–72%
    if y >= 15: return 'warrior_like'                   # 金发 22–28%
    return 'monk_like'


def slot_of(name):
    """从文件名尾巴取视角槽位，例如 char_xxx_left_walk.png → left_walk"""
    base = os.path.splitext(name)[0]
    walk = base.endswith('_walk')
    if walk: base = base[:-5]
    for v in VIEWS:
        if base.endswith('_' + v): return v + ('_walk' if walk else '')
    return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()

    claims = collections.defaultdict(dict)   # family -> slot -> (solid, filename)
    spare = collections.defaultdict(list)    # family -> [(solid, filename)]  撞车挤出来的
    for f in sorted(os.listdir(RAW)):
        if not f.startswith('char_') or not f.endswith('.png'): continue
        pct, solid = profile(os.path.join(RAW, f))
        fam, slot = family_of(pct), slot_of(f)
        if not slot: print(f'  ? {f} 认不出视角，跳过'); continue
        prev = claims[fam].get(slot)
        if prev is None:
            claims[fam][slot] = (solid, f); continue
        # 撞车：留更完整的占槽，另一张进备用池，稍后补到同色系的空槽
        if solid > prev[0]:
            claims[fam][slot] = (solid, f); spare[fam].append(prev)
            print(f'  · {fam}/{slot}: {f} 比 {prev[1]} 完整，后者转备用')
        else:
            spare[fam].append((solid, f))
            print(f'  · {fam}/{slot}: {f} 与 {prev[1]} 撞车，前者转备用')

    # 备用图补进同色系缺的槽位（走路帧优先补走路帧的空位）
    ALL_SLOTS = [v for v in VIEWS] + [v + '_walk' for v in VIEWS]
    for fam, pool in spare.items():
        for solid, f in sorted(pool, reverse=True):
            want_walk = f.endswith('_walk.png')
            empty = [s for s in ALL_SLOTS if s not in claims[fam] and s.endswith('_walk') == want_walk]
            empty = empty or [s for s in ALL_SLOTS if s not in claims[fam]]
            if not empty:
                print(f'  · {f} 在 {fam} 里没有空槽可放，弃用'); continue
            claims[fam][empty[0]] = (solid, f)
            print(f'  · {f} 补进 {fam}/{empty[0]}')

    print()
    manifest = {'characters': {}, 'enemies': {}, 'tiles': {}, 'icons': {}}
    if os.path.exists(MANIFEST):
        old = json.load(open(MANIFEST, encoding='utf-8'))
        for k in ('enemies', 'tiles', 'icons'): manifest[k] = old.get(k, {})

    tmp = os.path.join(ART, '_reassign')
    if a.apply:
        os.makedirs(tmp, exist_ok=True)
    for fam, slots in sorted(claims.items()):
        job = FAMILY_TO_JOB.get(fam)
        tag = job or '(暂无职业)'
        print(f'{fam:<14} → {tag:<12} {len(slots)} 张: {" ".join(sorted(slots))}')
        if not job: continue
        for slot, (solid, src) in slots.items():
            dst = f'char_{job}_{slot}.png'
            manifest['characters'].setdefault(job, {})[slot] = dst
            if not a.apply: continue
            w, h, px = pixel.decode_png(open(os.path.join(RAW, src), 'rb').read())
            out = pixel.process_sprite(w, h, bytearray(px), 32, 48, anchor='bottom', fit='height')
            open(os.path.join(tmp, dst), 'wb').write(pixel.encode_png(32, 48, out))
            shutil.copyfile(os.path.join(RAW, src), os.path.join(tmp, '_raw_' + dst))

    if not a.apply:
        print('\n（试跑，没有改动文件。加 --apply 才真的写。）'); return

    for f in os.listdir(ART):
        if f.startswith('char_') and f.endswith('.png'): os.remove(os.path.join(ART, f))
    for f in os.listdir(RAW):
        if f.startswith('char_'): os.remove(os.path.join(RAW, f))
    for f in os.listdir(tmp):
        if f.startswith('_raw_'): shutil.move(os.path.join(tmp, f), os.path.join(RAW, f[5:]))
        else: shutil.move(os.path.join(tmp, f), os.path.join(ART, f))
    os.rmdir(tmp)
    json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(len(v) for v in manifest['characters'].values())
    print(f'\n已重建 {total} 张角色图与 manifest。')


if __name__ == '__main__':
    main()
