#!/usr/bin/env python3
"""打包发布：把游戏需要的文件复制到 dist/ 并压成一个 zip（名字取自 data/config.json 的 title）。
零构建：因为是纯 ES Module + 静态资源，"打包" 只是挑出运行时文件（不含测试、工具、原图缓存、git）。

用法：python3 tools/build.py
发布：
  - itch.io：上传 dist/ 里的 zip，勾选 "This file will be played in the browser"，入口是 index.html
  - GitHub Pages：仓库根目录本身就能直接发（index.html 在根目录），不需要先 build；
    只想发一个干净目录的话，把 dist/ 内容推到 gh-pages 分支
  - 本地试玩：cd dist && python3 -m http.server 8080
路径：index.html 里所有资源路径都是相对的（./assets/...），子目录部署（user.github.io/仓库名/）不用改任何东西。
sw.js：本脚本会先跑一遍 tools/gen_sw.py，保证打进包里的离线清单是最新的。"""
import os, sys, shutil, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_sw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIST = os.path.join(ROOT, 'dist')
INCLUDE = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'data',
           'assets/fonts', 'assets/art', 'assets/icon-192.png', 'assets/icon-512.png']
# master/ 是 128px 高清母版，只有 tools/ 里的美术脚本用，游戏从不加载（sw.js 的清单也不收）
EXCLUDE_DIRS = {'raw', 'master', '__pycache__'}

def copy(src, dst):
    if os.path.isdir(src):
        for name in os.listdir(src):
            if name in EXCLUDE_DIRS or name.startswith('.'): continue
            copy(os.path.join(src, name), os.path.join(dst, name))
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst)

def main():
    gen_sw.main(check=False)   # 先刷新离线清单，免得打包出去的 sw.js 还缓存着上一版资源
    if os.path.exists(DIST): shutil.rmtree(DIST)
    for rel in INCLUDE:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p): copy(p, os.path.join(DIST, rel))
    import json
    title = json.load(open(os.path.join(ROOT, 'data', 'config.json'), encoding='utf-8')).get('title', 'game')
    zpath = os.path.join(DIST, f'{title}.zip'); total = 0
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(DIST):
            for f in files:
                if f.endswith('.zip'): continue
                full = os.path.join(base, f); z.write(full, os.path.relpath(full, DIST)); total += os.path.getsize(full)
    print(f'dist/ 已生成，{total // 1024} KB，压缩包 {os.path.getsize(zpath) // 1024} KB → {zpath}')

if __name__ == '__main__': main()
