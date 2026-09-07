#!/usr/bin/env python3
"""八元素迁移：把旧属性 id 换成 金木水火土風光暗，并在迁移前后做统计对比。

  python3 tools/migrate_elements.py --snapshot 路径     # 存一份「谁对什么是什么关系」的摊平表
  python3 tools/migrate_elements.py --apply             # 就地改 data/{enemies,spells,items}.json
  python3 tools/migrate_elements.py --diff 前 后        # 比对；有任何一条丢失就 exit 1

**为什么需要这个脚本**：旧 id `poison` 同时是**属性**（毒雾的 element）和**状态**
（src/game/status.js 的中毒），而 `immune` 字段两种都收。
`weak`/`resist` 只可能是属性 → 直接换成 wood；
`immune: ["poison"]` 是「毒属性伤害无效 + 不会中毒」两件事 → 拆成 ["wood", "poison"]。
迁移前后把每条关系还原成不随改名变化的语义标签（W_*）再比，才能证明一条都没丢。
"""
import json, sys, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, 'data', *p)
FMT = {'enemies.json': (2, ''), 'items.json': (2, ''), 'spells.json': (1, '\n')}

ELEM_MAP = {'fire': 'fire', 'thunder': 'metal', 'ice': 'water',
            'poison': 'wood', 'light': 'light', 'dark': 'dark'}
STATUSES = {'poison', 'sleep', 'blind', 'protect'}
# 语义标签：新旧 id 都归到同一个标签上，改名本身就不会被算成差异
CANON = {'thunder': 'W_METAL', 'metal': 'W_METAL', 'ice': 'W_WATER', 'water': 'W_WATER',
         'poison': 'W_WOOD', 'wood': 'W_WOOD', 'fire': 'W_FIRE', 'light': 'W_LIGHT',
         'dark': 'W_DARK', 'earth': 'W_EARTH', 'wind': 'W_WIND'}

def load(p): return json.load(open(D(p), encoding='utf-8'))
def save(p, d):
    ind, tail = FMT[p]
    open(D(p), 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=ind) + tail)

POST = False   # True = 用「迁移后」的语义读 immune（poison 只算状态）

def snapshot():
    rows = []
    for eid, e in load('enemies.json').items():
        for field in ('weak', 'resist'):
            for tag in e.get(field, []):
                rows.append([eid, field, 'element', CANON[tag]])
        for tag in e.get('immune', []):
            # 迁移前 poison 一名两用（属性 + 状态），展开成两条；迁移后 wood 管属性、poison 只管状态
            if tag == 'poison' and not POST:
                rows += [[eid, 'immune', 'element', 'W_WOOD'], [eid, 'immune', 'status', 'poison']]
            elif tag in STATUSES:
                rows.append([eid, 'immune', 'status', tag])
            else:
                rows.append([eid, 'immune', 'element', CANON[tag]])
    for pre, f in (('spell:', 'spells.json'), ('item:', 'items.json')):
        for k, v in load(f).items():
            if isinstance(v, dict) and v.get('element'):
                rows.append([pre + k, 'element', 'element', CANON[v['element']]])
    rows.sort()
    return rows

def apply():
    en = load('enemies.json')
    for e in en.values():
        for field in ('weak', 'resist'):
            e[field] = [ELEM_MAP[t] for t in e.get(field, [])]
        out = []
        for t in e.get('immune', []):
            if t == 'poison': out += ['wood', 'poison']     # 属性毒 + 状态毒，两个都要留
            elif t in STATUSES: out.append(t)
            else: out.append(ELEM_MAP[t])
        e['immune'] = out
    save('enemies.json', en)
    for f in ('spells.json', 'items.json'):
        d = load(f)
        for v in d.values():
            if isinstance(v, dict) and v.get('element'): v['element'] = ELEM_MAP[v['element']]
        save(f, d)

def diff(a, b):
    A = [tuple(r) for r in json.load(open(a))]; B = [tuple(r) for r in json.load(open(b))]
    ca, cb = collections.Counter(A), collections.Counter(B)
    lost, gained = sorted((ca - cb).elements()), sorted((cb - ca).elements())
    print(f'迁移前 {len(A)} 条关系，迁移后 {len(B)} 条')
    print(f'\n丢失 {len(lost)} 条' + ('（一条都没丢）' if not lost else '：'))
    for r in lost: print('   -', ' '.join(r))
    print(f'新增 {len(gained)} 条' + ('（没有新增）' if not gained else '：'))
    for r in gained: print('   +', ' '.join(r))
    for label, rows in (('迁移前', A), ('迁移后', B)):
        c = collections.Counter((r[1], r[2], r[3]) for r in rows)
        print(f'\n{label}按语义计数（共 {len(rows)}）：')
        for k in sorted(c): print(f'   {k[0]:8s} {k[1]:8s} {k[2]:9s} × {c[k]}')
    return 1 if lost else 0

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd in ('--snapshot', '--snapshot-post'):
        globals()['POST'] = cmd.endswith('-post')
        rows = snapshot(); json.dump(rows, open(sys.argv[2], 'w'), ensure_ascii=False)
        print('存档', sys.argv[2], len(rows), '条')
    elif cmd == '--apply': apply(); print('已迁移 enemies.json / spells.json / items.json')
    elif cmd == '--diff': sys.exit(diff(sys.argv[2], sys.argv[3]))

# ---------------------------------------------------------------------------
# 第二步：拆开 poison 之后暴露出来的那处**旧数据的歧义**，单独处理、单独记账。
#
# 纯迁移（第一步）把 immune:["poison"] 一律拆成 ["wood","poison"]，
# 行为跟改名前一模一样——70 条一条不差。但那个「毒属性伤害无效」多半从来不是作者的意思：
# 七只怪里有五只的 immune 是 ["poison","sleep"] / ["poison","sleep","blind"] 这种**纯状态清单**
# （sleep 和 blind 根本没有属性含义）。属性免疫是 id 一名两用蹭出来的。
# 留着的后果很实：木会变成十六只怪里七只完全免疫、零只弱点的废属性，
# 而木现在是观世音的属性，不是只挂在毒雾上的一个标签。
#
# 所以：只在 poison **单独出现**的两只身上保留属性免疫（那两只的免疫本来就是「毒」这件事本身），
# 其余五只回到纯状态免疫；再按五行给木补两个弱点（木克土）。
# 每一条都列在下面，diff 会照实报出来。
CORRECTIONS = {
    'drop_wood_immune': ['skeleton', 'knight', 'ghost', 'paperkid', 'earthox'],
    # 芒神本身就是草木——草木不毒草木；龟壳花整只怪就是「毒」。这两只留着属性免疫
    'keep_wood_immune': ['mandrake', 'viper'],
    'add_wood_weak': [('earthox', '地牛是土，木克土：根把土撑开'),
                      ('darkslime', '乌泥也是土性的一坨')],
}

def correct():
    en = load('enemies.json')
    for eid in CORRECTIONS['drop_wood_immune']:
        en[eid]['immune'] = [t for t in en[eid]['immune'] if t != 'wood']
    for eid, _why in CORRECTIONS['add_wood_weak']:
        if 'wood' not in en[eid]['weak']: en[eid]['weak'].append('wood')
    save('enemies.json', en)
    for eid in CORRECTIONS['drop_wood_immune']: print('  -', en[eid]['name'], '木属性免疫 → 只免疫中毒状态')
    for eid, why in CORRECTIONS['add_wood_weak']: print('  +', en[eid]['name'], '弱木：', why)
