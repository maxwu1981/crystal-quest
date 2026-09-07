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


def is_enemy(name):
    return name.startswith('enemy_')


# 战斗背景**不派生**：它不是瓦片也不是角色，是一整幅按战场画幅（256×152 逻辑）画的画。
# 走 target_size 的话会被当成瓦片压成 16×16 逻辑——这正是当初怪物被压扁的同一个坑
# （那次是所有非角色资源都按瓦片尺寸派生，16 只怪全成了方块）。
# 背景直接用母版：它已经是 2× 逻辑分辨率，比现在程序化画的背景还细一档。
def is_bg(name):
    return name.startswith('bg_')


# 怪物没有统一尺寸：山猪 44 逻辑像素宽、乌火 64、椿象 36，各是各的。
# 而战斗画面用 `artW = img.width / ART` 反推逻辑宽度，所以怪物图的像素尺寸
# 必须是「该怪的逻辑尺寸 × ART」。早先这里把所有非角色资源一律当瓦片（16×16）算，
# 真跑起来会把每只怪压成三分之一大，且全程不报错——切 ART 之前必须先修掉。
#
# 每只怪的逻辑尺寸没有单独记在哪，但**现有的游戏美术**就是权威：
# 拿 assets/art/ 里那张的像素尺寸除以当前 ART 就是逻辑尺寸。
# 这要求在改写 draw.js 之前读，所以 current_art() 在 main 开头就取好了。
def enemy_logical(name, cur_art):
    cur = os.path.join(ART_DIR, name)
    if cur_art and os.path.exists(cur):
        w, h, _ = pixel.decode_png(open(cur, 'rb').read())
        if w % cur_art == 0 and h % cur_art == 0:
            return w // cur_art, h // cur_art
    return None


def target_size(name, art, cur_art=None):
    if is_char(name):
        lw, lh = LOGICAL_CHAR
    elif is_enemy(name):
        lg = enemy_logical(name, cur_art)
        if lg is None:
            # 没有现成的游戏图可参照（全新的怪，母版刚出）——按母版的长边折算成
            # 一只中等体型的怪（44 逻辑像素，山猪那一档），保持母版的长宽比。
            src = os.path.join(MASTER, name)
            w, h, _ = pixel.decode_png(open(src, 'rb').read())
            k = 44 / max(w, h)
            lg = (max(1, round(w * k)), max(1, round(h * k)))
        lw, lh = lg
    else:
        lw, lh = LOGICAL_TILE
    return lw * art, lh * art


def derive(name, art, dry=False, cur_art=None):
    src = os.path.join(MASTER, name)
    w, h, px = pixel.decode_png(open(src, 'rb').read())
    tw, th = target_size(name, art, cur_art)
    if (w, h) == (tw, th):
        return 'already'
    # 母版已经抠好底、裁好框，这里只做等比缩小，不再走一遍抠底/描边
    out = pixel.downscale(w, h, px, (0, 0, w, h), tw, th)
    pixel.threshold_alpha(out)
    if not dry:
        open(os.path.join(ART_DIR, name), 'wb').write(pixel.encode_png(tw, th, out))
    return f'{w}x{h} → {tw}x{th}'



def stale_masters(tol=22):
    """找出「母版和当前美术已经对不上」的那些。

    为什么必须查：`assets/art/raw/` 里的原图是当初出图时存的，
    后来我为了修比例、修服装重新生成过很多帧，但那些重生成走的是浏览器管线、
    没回写原图。于是从这些旧原图做出来的母版是**几轮之前的设计**——
    实测符仔仙的母版还是兜帽金边袍，而当前游戏里已经是宽檐斗笠了。
    直接派生就会把修好的美术悄悄退回去。
    做法是把母版缩到当前美术的尺寸逐像素比，差异超过 tol% 就判定过期。

    试过用文件时间当捷径（母版比成品新就认它权威），结果反而更糟：
    我为了修抠底把**所有**母版重写了一遍，mtime 全变新，于是从旧原图做的那批
    也被当成权威，把修好的角色图覆盖回了旧设计。像素比对慢但可靠。
    新出的母版会被这条判成「过期」（因为成品还是旧的），做法是出完立刻
    `set_art.py <当前ART>` 派生一次，成品跟上了，之后就一致了。
    """
    out = []
    for f in sorted(os.listdir(MASTER)) if os.path.isdir(MASTER) else []:
        if not f.endswith('.png'): continue
        cur = os.path.join(ART_DIR, f)
        if not os.path.exists(cur): continue
        mw, mh, mp = pixel.decode_png(open(os.path.join(MASTER, f), 'rb').read())
        cw, ch, cp = pixel.decode_png(open(cur, 'rb').read())
        small = pixel.downscale(mw, mh, bytearray(mp), (0, 0, mw, mh), cw, ch)
        pixel.threshold_alpha(small)
        diff = tot = 0
        for i in range(0, len(cp), 4):
            a1, a2 = small[i + 3] > 128, cp[i + 3] > 128
            tot += 1
            if a1 != a2: diff += 1
            elif a1 and abs(small[i] - cp[i]) + abs(small[i+1] - cp[i+1]) + abs(small[i+2] - cp[i+2]) > 150:
                diff += 1
        pct = diff * 100 // max(1, tot)
        if pct > tol: out.append((f, pct))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('art', nargs='?', type=int)
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--force', action='store_true',
                    help='忽略过期判定，全部派生。刚出完一批新母版时用——'
                         '那时成品还是旧的，逐像素比会把新母版判成过期而跳过，成品永远追不上（死锁）。'
                         '只有在确认 master/ 里全是刚出的权威图时才用。')
    a = ap.parse_args()

    cur = current_art()
    masters = sorted(f for f in os.listdir(MASTER) if f.endswith('.png') and not is_bg(f)) if os.path.isdir(MASTER) else []
    manifest = json.load(open(os.path.join(ART_DIR, 'manifest.json'), encoding='utf-8'))
    used = set()
    for v in manifest.get('characters', {}).values(): used.update(v.values())
    used.update(manifest.get('enemies', {}).values())
    used.update(manifest.get('tiles', {}).values())
    missing = sorted(used - set(masters))

    print(f'当前 ART = {cur}（画布 {256*cur}×{224*cur}，角色 {16*cur}×{24*cur}，瓦片 {16*cur}×{16*cur}）')
    stale = [] if getattr(a, 'force', False) else stale_masters()
    print(f'母版覆盖 {len(masters)}/{len(used)} 张' + (f'，其中 {len(stale)} 张已过期' if stale else ''))
    if stale:
        print('过期母版（比当前美术旧，派生会把美术退回去，必须重新出图）：')
        for f, pct in stale: print(f'    {f.replace(".png","")}  差异 {pct}%')
    if missing:
        print(f'还没有母版的 {len(missing)} 张（这些提不了精度，要重新出图）：')
        for i in range(0, len(missing), 4):
            print('   ', '  '.join(m.replace('.png', '') for m in missing[i:i+4]))
    if a.art is None:
        return
    if a.art not in (2, 4, 6, 8):
        print('ART 只支持 2 / 4 / 6 / 8'); sys.exit(1)

    print()
    stale_names = {f for f, _ in stale}
    n = skipped = 0
    for f in masters:
        if f not in used: continue
        if f in stale_names and not a.force:
            skipped += 1; continue        # 过期母版一律不派生，宁可保持旧精度也不能退回旧设计
        r = derive(f, a.art, a.dry, cur)
        if r != 'already': n += 1
    print(f'{"（试跑）" if a.dry else ""}从母版派生了 {n} 张' + (f'，跳过 {skipped} 张过期母版' if skipped else ''))
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
