#!/usr/bin/env python3
"""角色精灵的比例体检：同一个角色的各个方向/帧，体型必须是同一个人。

**为什么需要这个**：导入管线用 `fit='height'` 把所有角色归一化到同样的身高，
`import_downloads.py` 的体检也只量身高——于是「等高但胖瘦完全不同」这种问题
一路绿灯通过。实际发生过：补生成的拳头师侧面站姿比他自己的侧面迈步帧
少了 35% 的实心面积、窄了 40%，摆在一起像两个人，但两张都是 46px 高。

量四个东西：
  mass    实心像素总数 —— 最能反映胖瘦
  maxw    最大宽度
  shw     肩部宽度（身高的 35%–55% 那一带）
  loww    下四成的最大宽度（腿 / 袍脚）

**为什么量肩不量头顶**：一开始量的是顶部三成的宽度，结果对戴宽檐斗笠的符仔仙完全失准——
那一带量到的是帽尖画得多高，帽檐落在带子里还是带子外，跟胖瘦无关，于是四张一致的图被判成不一致。
肩部那一带不受帽子、兜帽、披风影响，才是稳定的身份特征。

**只用实心面积做自动门禁**。试过用宽度（肩宽、上身宽、最大宽）当指标，全部不可靠：
迈步时腿要张开、手臂要摆动，任何一条宽度带都会被姿势带偏，一致的图会被判成不一致；
戴宽檐斗笠的角色更糟——量到的是帽尖画得多高，跟胖瘦毫无关系。
实心面积对姿势不敏感，能抓住真正的「画成了另一个体型」（实测拳头师侧面站姿曾比迈步少 41%）。

**数值测不出来的，工具不假装能测**：「站着戴斗笠、走起来变兜帽」「站着连衣裙、走起来宽披风」
这类服装/剪影漂移，任何比例指标都抓不到，只能看图。所以 `--sheet` 会把每个角色的
站姿/迈步并排导出成一张对照图，人眼扫一遍才是这一关的主体，数值只是兜底。

不做脖子/头高这类特征检测——帽檐、兜帽、披风会让它整个失准（实测量出过 3px 宽的头）。

用法：
  python3 tools/proportion_check.py             # 体检，有问题时退出码 1
  python3 tools/proportion_check.py -v          # 连每一帧的数字一起打印
  python3 tools/proportion_check.py --sheet     # 另外导出 /tmp/char_sheet.png 供人眼审
  python3 tools/proportion_check.py --tol 0.35  # 放宽阈值（默认 0.30）
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'assets', 'art')


def row_spans(path):
    w, h, px = pixel.decode_png(open(path, 'rb').read())
    out = []
    for y in range(h):
        xs = [x for x in range(w) if px[(y * w + x) * 4 + 3] > 128]
        out.append((min(xs), max(xs), len(xs)) if xs else None)
    return out


def measure(path):
    rows = row_spans(path)
    solid = [i for i, r in enumerate(rows) if r]
    if not solid:
        return None
    top, bot = solid[0], solid[-1]
    H = bot - top + 1
    body = [(i, r) for i, r in enumerate(rows) if r]
    W = lambda lo, hi: max((r[1] - r[0] + 1 for i, r in body
                            if top + H * lo <= i < top + H * hi), default=0)
    return dict(H=H,
                mass=sum(r[2] for _, r in body),
                maxw=max(r[1] - r[0] + 1 for _, r in body),
                shw=W(0.35, 0.55),     # 肩 —— 不受帽子/兜帽高低影响
                loww=W(0.60, 1.0))     # 腿 / 袍脚


def is_side(view):
    return view.startswith('left') or view.startswith('right')


def check(tol=0.22, verbose=False):
    m = json.load(open(os.path.join(ART, 'manifest.json'), encoding='utf-8'))
    problems = []
    for job, files in sorted(m.get('characters', {}).items()):
        vals = {}
        for k in sorted(files):
            p = os.path.join(ART, files[k])
            if not os.path.exists(p):
                problems.append(f'{job}/{k} 图不存在: {files[k]}'); continue
            v = measure(p)
            if v: vals[k] = v
        if len(vals) < 2:
            continue
        if verbose:
            print(f'{job}:')
            for k, v in vals.items():
                print(f"    {k:<12}[{'side ' if is_side(k) else 'front'}] 高{v['H']:>3} 实心{v['mass']:>5} "
                      f"最宽{v['maxw']:>3} 肩宽{v['shw']:>3} 下宽{v['loww']:>3}")
        # 同方向的站姿 vs 迈步，只比实心面积（宽度类指标会被姿势带偏，见文件头说明）
        for view in ('down', 'up', 'left', 'right'):
            a, b = vals.get(view), vals.get(view + '_walk')
            if not (a and b): continue
            dev = abs(a['mass'] - b['mass']) / max(a['mass'], b['mass'])
            if dev > tol:
                problems.append(
                    f"{job} 的 {view} 站姿与迈步帧实心面积差 {dev*100:.0f}%"
                    f"（{a['mass']} vs {b['mass']}，阈值 {tol*100:.0f}%）——"
                    f"同一个人同一个方向，换个姿势不该胖瘦两样")
        # 侧面整体不该比正面瘦太多
        fm = sorted(v['mass'] for k, v in vals.items() if not is_side(k))
        sm = sorted(v['mass'] for k, v in vals.items() if is_side(k))
        if fm and sm:
            f, sd = fm[len(fm) // 2], sm[len(sm) // 2]
            if sd < f * 0.55:
                problems.append(f'{job} 侧面实心面积中位数 {sd} 只有正面 {f} 的 '
                                f'{sd/f*100:.0f}%（下限 55%）——侧面被画成了另一个体型')
        if verbose: print()
    return problems


def make_sheet(path):
    """把每个角色的「站姿 / 迈步」并排导出。服装漂移（斗笠变兜帽之类）数值测不出，只能看。"""
    m = json.load(open(os.path.join(ART, 'manifest.json'), encoding='utf-8'))
    rows = []
    for job in sorted(m.get('characters', {})):
        for v in ('down', 'up', 'left'):
            fs = m['characters'][job]
            if v in fs and v + '_walk' in fs:
                rows.append((job, v, fs[v], fs[v + '_walk']))
    if not rows:
        return '(没有可对照的帧)'
    # 输出格固定 128x192：按源图**实际尺寸**等比例映射，不能假设源图是当年 ART=2 的 32x48——
    # 之前硬编码 `y // 4` 只在源图正好 32x48 时成立，ART 切到 6（96x144）之后
    # 这条只读得到源图左上角一小块，对照图变成只看得见头。
    CW, CH = 32 * 4, 48 * 4
    W, H = CW * 2, CH * len(rows)
    out = bytearray(W * H * 4)
    for r, (_, _, fa, fb) in enumerate(rows):
        for c, f in enumerate((fa, fb)):
            w, h, px = pixel.decode_png(open(os.path.join(ART, f), 'rb').read())
            for y in range(CH):
                sy = min(h - 1, y * h // CH)
                for x in range(CW):
                    sx = min(w - 1, x * w // CW)
                    si = (sy * w + sx) * 4
                    if not px[si + 3]: continue
                    di = ((r * CH + y) * W + c * CW + x) * 4
                    out[di:di + 4] = px[si:si + 4]
    open(path, 'wb').write(pixel.encode_png(W, H, out))
    return f"{path}（左站姿右迈步，从上到下：{' '.join(j + '/' + v for j, v, _, _ in rows)}）"


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', '--verbose', action='store_true')
    ap.add_argument('--tol', type=float, default=0.30)
    ap.add_argument('--sheet', metavar='PNG', nargs='?', const='/tmp/char_sheet.png',
                    help='导出站姿/迈步对照图，服装与剪影漂移只能靠看这张图')
    a = ap.parse_args()
    if a.sheet: print('对照图 →', make_sheet(a.sheet))
    probs = check(a.tol, a.verbose)
    if probs:
        print('比例体检没过：')
        for p in probs: print('  ✘', p)
        sys.exit(1)
    print('比例体检通过：每个角色的各方向体型一致')
