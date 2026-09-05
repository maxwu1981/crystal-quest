#!/usr/bin/env python3
"""打包发布：把游戏需要的文件复制到 dist/ 并压成 dist/crystal-quest.zip。
零构建：因为是纯 ES Module + 静态资源，"打包" 只是挑出运行时文件（不含测试、工具、原图缓存、git）。

用法：python3 tools/build.py
发布：
  - itch.io：上传 dist/crystal-quest.zip，勾选 "This file will be played in the browser"，入口是 index.html
  - GitHub Pages：把 dist/ 内容推到 gh-pages 分支（或直接开启仓库根目录的 Pages，index.html 在根目录即可）
  - 本地试玩：cd dist && python3 -m http.server 8080
注意：index.html 里字体路径是 /assets/...（绝对路径）。放到子目录（如 user.github.io/repo/）时本脚本会改成相对路径。"""
import os, shutil, zipfile, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIST = os.path.join(ROOT, 'dist')
INCLUDE = ['index.html', 'src', 'data', 'assets/fonts', 'assets/art']
EXCLUDE_DIRS = {'raw', '__pycache__'}

def copy(src, dst):
    if os.path.isdir(src):
        for name in os.listdir(src):
            if name in EXCLUDE_DIRS or name.startswith('.'): continue
            copy(os.path.join(src, name), os.path.join(dst, name))
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst)

def main():
    if os.path.exists(DIST): shutil.rmtree(DIST)
    for rel in INCLUDE:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p): copy(p, os.path.join(DIST, rel))
    # 绝对路径 → 相对路径，方便放在子目录
    idx = os.path.join(DIST, 'index.html'); html = open(idx, encoding='utf-8').read()
    html = re.sub(r'url\("/assets/', 'url("./assets/', html)
    open(idx, 'w', encoding='utf-8').write(html)
    zpath = os.path.join(DIST, 'crystal-quest.zip'); total = 0
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(DIST):
            for f in files:
                if f.endswith('.zip'): continue
                full = os.path.join(base, f); z.write(full, os.path.relpath(full, DIST)); total += os.path.getsize(full)
    print(f'dist/ 已生成，{total // 1024} KB，压缩包 {os.path.getsize(zpath) // 1024} KB → {zpath}')

if __name__ == '__main__': main()
