#!/usr/bin/env python3
"""模块体检：查 import/export 对不对得上，以及「用了某个名字却忘了 import」。

**为什么要有这个工具**：这一类问题在本项目栽过两次，而且两次都是拆文件之后。
它的可怕之处在于**测试全绿**——单元测试不渲染画面，浏览器加载模块时也不报错，
只有真正跑到那一行才炸：
  ① 拆 terrain.js 之后漏了 `RNG` / `TILE_FX` / `tileFrames` 三个 import，
     44 条测试全过，只有实际渲染那张地图才发现。
  ② 拆 BattleScene 的渲染层之后，两处 `drawEnemyList(ctx, this)` 里的 `this`
     没被换成 `scene`（机械替换找的是 `this.`，这两处后面没有点），
     模块作用域里 `this` 是 undefined，55 条测试仍然全绿。

两项检查是**互补**的，缺一不可：
  A. 「import 进来的名字，目标模块真的导出了吗」——链接期错误，浏览器会报
  B. 「用到的名字，本文件真的绑定过吗」——**运行期**错误，只有执行到才报，
     也就是上面两次踩坑的那一类。B 才是这个工具存在的理由。

用法：
  python3 tools/lint_modules.py          # 全项目
  python3 tools/lint_modules.py --quiet  # 只在有问题时输出（适合挂 pre-commit）
退出码：有问题为 1，干净为 0。
"""
import argparse, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCAN = ['src', 'tests']
SKIP_DIRS = {'.git', 'dist', 'node_modules', '_cap', 'raw', 'master'}

# JS 里「看起来像标识符但其实不是」的东西，扫描前一律抹掉，否则假阳性会把真问题淹掉。
# 实测：字符串里的模块名（'../ui/Menu.js' 里的 Menu）、正则内容（/ring|ouroboros/）、
# 对象字面量的键、模板串里的文字，都会冒充标识符。
STRIP = [
    (re.compile(r'/\*[\s\S]*?\*/'), ' '),          # 块注释
    (re.compile(r'(?<![:\w])//[^\n]*'), ' '),      # 行注释（避开 http:// ）
    (re.compile(r'`(?:\\.|[^`\\])*`'), ' `` '),    # 模板串（连同内嵌表达式一起去掉，宁可漏报不误报）
    (re.compile(r"'(?:\\.|[^'\\])*'"), " '' "),
    (re.compile(r'"(?:\\.|[^"\\])*"'), ' "" '),
]

# 全局对象与语言关键字：用到它们不需要 import
GLOBALS = set("""
window document navigator location performance console Math JSON Object Array String Number Boolean
Set Map WeakMap WeakSet Promise Symbol Date RegExp Error TypeError RangeError Infinity NaN undefined null
true false this arguments globalThis self isNaN parseInt parseFloat encodeURIComponent decodeURIComponent
setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame
addEventListener removeEventListener matchMedia fetch Image Audio Canvas CanvasRenderingContext2D
localStorage sessionStorage caches Touch TouchEvent InputEvent Event CustomEvent DOMException
Uint8Array Uint8ClampedArray Int32Array Float32Array ArrayBuffer TextEncoder TextDecoder structuredClone
innerWidth innerHeight devicePixelRatio getComputedStyle AbortController URL URLSearchParams
if else for while do return function class const let var new typeof instanceof in of delete void
try catch finally throw switch case default break continue yield await async static get set extends super
import export from as
""".split())


def strip_noise(s):
    for rx, rep in STRIP:
        s = rx.sub(rep, s)
    return s


def exports_of(src):
    """一个模块导出了哪些名字。要处理 `export function*`（生成器）
    和 `export const A = 1, B = 2;`（一行多声明）——这两种写法漏掉就会产生假阳性。"""
    names = set()
    for m in re.finditer(r'^export\s+(?:async\s+)?(?:function\s*\*?|class)\s+(\w+)', src, re.M):
        names.add(m.group(1))
    for m in re.finditer(r'^export\s*\{([^}]*)\}', src, re.M):
        for n in m.group(1).split(','):
            n = n.strip()
            if n:
                names.add(n.split(' as ')[-1].strip())
    for m in re.finditer(r'^export\s+(?:const|let|var)\s+(.+?)(?:;|$)', src, re.M):
        depth, cur = 0, ''
        for ch in m.group(1):
            if ch in '([{':
                depth += 1
            elif ch in ')]}':
                depth -= 1
            if ch == ',' and depth == 0:
                nm = re.match(r'\s*(\w+)', cur)
                if nm:
                    names.add(nm.group(1))
                cur = ''
            else:
                cur += ch
        nm = re.match(r'\s*(\w+)', cur)
        if nm:
            names.add(nm.group(1))
    return names


def imports_of(src):
    """[(名字列表, 相对路径)]"""
    out = []
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", src):
        names = [n.strip().split(' as ')[0].strip() for n in m.group(1).split(',') if n.strip()]
        out.append((names, m.group(2)))
    return out


def bound_names(src):
    """本文件里绑定过的名字：import 进来的、声明的、函数形参、解构、类名、标签。
    宁可多算（漏报）也不要少算（误报）——这个工具的价值在于零噪音。"""
    n = set()
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from", src):
        for x in m.group(1).split(','):
            x = x.strip()
            if x:
                n.add(x.split(' as ')[-1].strip())
    for m in re.finditer(r"import\s+(\w+)\s*,?\s*(?:\{|from)", src):
        n.add(m.group(1))
    for m in re.finditer(r"import\s*\*\s*as\s+(\w+)", src):
        n.add(m.group(1))
    for m in re.finditer(r'\b(?:const|let|var)\s+([^=;]+)', src):
        for w in re.findall(r'\w+', m.group(1)):
            n.add(w)
    for m in re.finditer(r'\bfunction\s*\*?\s*(\w+)?\s*\(([^)]*)\)', src):
        if m.group(1):
            n.add(m.group(1))
        for w in re.findall(r'\w+', m.group(2)):
            n.add(w)
    for m in re.finditer(r'\bclass\s+(\w+)', src):
        n.add(m.group(1))
    # 箭头函数与方法的形参
    for m in re.finditer(r'\(([^()]*)\)\s*(?:=>|\{)', src):
        for w in re.findall(r'\w+', m.group(1)):
            n.add(w)
    for m in re.finditer(r'\b(\w+)\s*=>', src):
        n.add(m.group(1))
    for m in re.finditer(r'\bcatch\s*\(\s*(\w+)', src):
        n.add(m.group(1))
    # 对象字面量里的方法简写 `{ run(a) { … } }` 与类方法。
    # 不认它就会把「定义」当成「调用」报出来（实测 tests/run.js 的 `run(a) {` 中过枪）。
    # 前面必须是 { , ; 或行首——`s.run(...)` 前面是点，不会误吞。
    for m in re.finditer(r'(?:^|[{,;])\s*(?:async\s+|\*\s*)?(\w+)\s*\([^()]*\)\s*\{', src, re.M):
        n.add(m.group(1))
    for m in re.finditer(r'\bfor\s*\(\s*(?:const|let|var)?\s*([\w{}\[\],\s]+?)\s+(?:of|in)\b', src):
        for w in re.findall(r'\w+', m.group(1)):
            n.add(w)
    return n


def walk_js():
    for base in SCAN:
        for cur, dirs, files in os.walk(os.path.join(ROOT, base)):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f.endswith('.js'):
                    yield os.path.normpath(os.path.join(cur, f))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quiet', action='store_true', help='只在有问题时输出')
    a = ap.parse_args()

    raw, clean, exp = {}, {}, {}
    for p in walk_js():
        s = open(p, encoding='utf-8').read()
        raw[p] = s
        clean[p] = strip_noise(s)
        exp[p] = exports_of(s)

    all_exports = set()
    for v in exp.values():
        all_exports |= v

    bad_a, bad_b, n_imp = [], [], 0
    for p, s in raw.items():
        for names, rel in imports_of(s):
            tgt = os.path.normpath(os.path.join(os.path.dirname(p), rel))
            if tgt not in exp:
                continue                      # 外部或路径解析不到，交给浏览器报
            for nm in names:
                n_imp += 1
                if nm not in exp[tgt]:
                    bad_a.append(f'{os.path.relpath(p, ROOT)} 导入 {nm}，'
                                 f'但 {os.path.relpath(tgt, ROOT)} 没有导出')

        bound = bound_names(s)
        used = set(re.findall(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', clean[p]))   # 只查被调用的
        for nm in sorted(used):
            if nm in bound or nm in GLOBALS:
                continue
            if nm in all_exports:            # 全项目有人导出它，说明是忘了 import
                bad_b.append(f'{os.path.relpath(p, ROOT)} 调用了 {nm}()，'
                             f'但本文件既没 import 也没声明它')

    ok = not bad_a and not bad_b
    if not a.quiet or not ok:
        print(f'扫描 {len(raw)} 个模块 / {n_imp} 个导入名')
        print('  A 导入的名字目标模块有没有导出：' + ('通过' if not bad_a else f'{len(bad_a)} 处'))
        for x in bad_a:
            print('      ' + x)
        print('  B 用到的名字有没有 import（测试查不出、只有跑到才炸的那一类）：'
              + ('通过' if not bad_b else f'{len(bad_b)} 处'))
        for x in bad_b:
            print('      ' + x)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
