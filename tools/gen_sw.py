#!/usr/bin/env python3
"""扫描运行时资源，生成根目录的 sw.js（离线缓存清单）。

用法：python3 tools/gen_sw.py        # 重写 sw.js
      python3 tools/gen_sw.py --check # 只检查是否已是最新（CI/提交前用），不写文件

**改动任何 src/ data/ assets/ index.html 之后都要重跑一遍**，否则手机上装好的旧版本
不会更新——service worker 是 cache-first，版本号不变就永远吃缓存。

—— 版本号为什么用内容哈希而不是日期/自增 ——
版本号 = 全部资源内容的 sha256 前 12 位。于是：
  · 资源没变时重跑，sw.js 一个字节都不变（不会污染 git diff）
  · 任何一张图、一行代码变了，版本号必变 → 缓存名变 → 旧缓存在 activate 时被删干净
如果用日期，每次跑都会让所有手机重下 3MB；如果用手写自增，迟早忘记加。

—— 哪些文件进清单 ——
只收游戏运行时真正会请求的东西。特别排除 assets/art/master/（1.4MB 高清母版，
只有 tools/ 里的美术脚本用，manifest.json 从不引用它）和 assets/art/raw/（Gemini 原图，
本来就在 .gitignore 里）。这两个目录加起来 5MB，收进来就是让手机白下 5MB。
"""
import os, sys, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'sw.js')
CACHE_PREFIX = 'crystal-quest-'

# (目录, 后缀集合, 是否递归)。assets/art 只收顶层，master/ raw/ 自然被挡在外面
RULES = [
    ('src', {'.js'}, True),
    ('data', {'.json'}, True),
    ('assets/fonts', {'.woff2'}, False),
    ('assets/art', {'.png', '.json'}, False),
    ('assets', {'.png'}, False),   # icon-192 / icon-512
]
ROOT_FILES = ['index.html', 'manifest.webmanifest']


def collect():
    """返回 [(相对路径, 内容 sha256)]，路径排序，保证结果可复现。"""
    found = {}
    for rel in ROOT_FILES:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            found[rel] = p
        else:
            print(f'警告：找不到 {rel}', file=sys.stderr)
    for d, exts, deep in RULES:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for cur, dirs, files in os.walk(base):
            if not deep:
                dirs[:] = []
            dirs[:] = [x for x in dirs if not x.startswith('.') and x not in ('__pycache__',)]
            for f in sorted(files):
                if f.startswith('.') or os.path.splitext(f)[1] not in exts:
                    continue
                p = os.path.join(cur, f)
                found[os.path.relpath(p, ROOT).replace(os.sep, '/')] = p
    out = []
    for rel in sorted(found):
        with open(found[rel], 'rb') as fh:
            out.append((rel, hashlib.sha256(fh.read()).hexdigest()))
    return out


def render(files):
    version = hashlib.sha256(''.join(f'{r}:{h}\n' for r, h in files).encode()).hexdigest()[:12]
    total = sum(os.path.getsize(os.path.join(ROOT, r)) for r, _ in files)
    # './' 是 manifest 里的 start_url：点主屏图标进来请求的是目录本身，不是 index.html，
    # 两个都得进缓存，离线才打得开
    urls = ['./'] + [f'./{r}' for r, _ in files]
    listing = '\n'.join(f"  '{u}'," for u in urls)
    return TEMPLATE.format(version=version, count=len(urls), mb=total / 1048576, listing=listing), version


TEMPLATE = '''// 本文件由 tools/gen_sw.py 生成，请勿手改。
// 改了 src/ data/ assets/ index.html 之后重新跑：python3 tools/gen_sw.py
//
// 策略：cache-first。这是个不联网的单机游戏，装好之后就该完全走本地，
// 每次都先问网络只会让弱网下开局卡住。资源变了靠版本号换缓存名来更新。
//
// 共 {count} 个文件，约 {mb:.1f} MB。
const VERSION = '{version}';
const CACHE = 'crystal-quest-' + VERSION;

const PRECACHE = [
{listing}
];

self.addEventListener('install', e => {{
  e.waitUntil((async () => {{
    const cache = await caches.open(CACHE);
    // 逐个 put，不用 cache.addAll()：addAll 只要有一个文件 404，整批就失败，
    // service worker 装不上 = 一点都不能离线。宁可缺一张图也要先装上。
    // cache: 'reload' 绕开 HTTP 缓存，确保存进去的是服务器上的当前版本。
    const results = await Promise.allSettled(PRECACHE.map(async url => {{
      const res = await fetch(new Request(url, {{ cache: 'reload' }}));
      if (!res.ok) throw new Error(res.status + ' ' + url);
      await cache.put(url, res);
    }}));
    const bad = results.filter(r => r.status === 'rejected');
    if (bad.length) console.warn('[sw] 有资源没缓存上：', bad.map(r => String(r.reason)));
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', e => {{
  e.waitUntil((async () => {{
    // 版本号变了 → 缓存名变了 → 把本站所有旧版本缓存删掉，不然手机上会越积越多
    for (const k of await caches.keys()) {{
      if (k.startsWith('crystal-quest-') && k !== CACHE) await caches.delete(k);
    }}
    await self.clients.claim();
  }})());
}});

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;  // 外链交给浏览器自己处理

  e.respondWith((async () => {{
    // 导航请求：**先按真实路径找**，取不到才回首页。
    //
    // 原本是「一律回首页」——那是 SPA 的写法，而这个项目不是 SPA：
    // `/tests/` 是一张独立的测试页（浏览器内跑 53 条单元测试）。
    // 无条件兜底会让装过 SW 的浏览器再也打不开它，将来新增任何页面同样被吞。
    // ignoreSearch 是关键：`?debug` 不能让缓存查不中。
    if (req.mode === 'navigate') {{
      const exact = await caches.match(req, {{ ignoreSearch: true }});
      if (exact) return exact;
      try {{ const net = await fetch(req); if (net.ok) return net; }} catch {{ /* 断网，往下走兜底 */ }}
      const home = await caches.match('./index.html', {{ ignoreSearch: true }})
                || await caches.match('./', {{ ignoreSearch: true }});
      if (home) return home;
    }}

    const hit = await caches.match(req);
    if (hit) return hit;

    // 清单没覆盖到的同源文件：正常取，顺手存一份，下次断网也有
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {{
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {{}});
    }}
    return res;
  }})());
}});
'''


def main(check=None):
    """check=True 只检查不写（返回 1 表示过期）；None 表示看命令行的 --check。"""
    files = collect()
    text, version = render(files)
    if check is None:
        check = '--check' in sys.argv
    old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else None
    if old == text:
        print(f'sw.js 已是最新（版本 {version}，{len(files) + 1} 个文件）')
        return 0
    if check:
        print(f'sw.js 过期了，请跑 python3 tools/gen_sw.py（应为版本 {version}）', file=sys.stderr)
        return 1
    open(OUT, 'w', encoding='utf-8').write(text)
    total = sum(os.path.getsize(os.path.join(ROOT, r)) for r, _ in files)
    print(f'写好 sw.js：版本 {version}，{len(files) + 1} 个文件，{total / 1048576:.1f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
