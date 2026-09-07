#!/usr/bin/env bash
# 把游戏发到 GitHub Pages，让任何网络下的手机／电脑都能玩（还能装成 App 离线跑）。
#
# **为什么这条路走得通**：整个游戏是纯静态文件——HTML + JS + JSON + PNG，没有后端。
# 而且所有路径都是相对的（`./`），实测放在 `/仓库名/` 这种子路径下美术一张不少，
# 所以不用为了上线改任何代码。
#
# 用法：bash tools/deploy.sh
#
# 这个脚本**不碰你的密码**。需要登录时它会把浏览器交给你，你自己登。
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f index.html ] || die "这里不像游戏目录（找不到 index.html）"

say "① 刷新离线清单"
python3 tools/gen_sw.py

say "② 准备 gh（GitHub 官方命令行）"
# **不依赖 Homebrew**：gh 有官方的独立二进制，解压就能用，不需要 sudo。
# 这台机器上没有 brew，而为了发一个静态网站去装一整套包管理器不划算。
# 下载后一律拿官方 checksums 校验 SHA-256 才使用——不校验就执行下载来的东西是不行的。
GH="$PWD/tools/bin/gh"
if [ -x "$GH" ]; then
  echo "用项目自带的 gh（$($GH --version | head -1)）"
elif command -v gh >/dev/null 2>&1; then
  GH="$(command -v gh)"; echo "用系统的 gh"
else
  echo "没有 gh，正在下载官方二进制……"
  ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && ARCH=amd64
  V="$(curl -sSL https://api.github.com/repos/cli/cli/releases/latest \
        | python3 -c 'import json,sys;print(json.load(sys.stdin)["tag_name"].lstrip("v"))')"
  T="$(mktemp -d)"
  curl -sSL -o "$T/gh.zip"  "https://github.com/cli/cli/releases/download/v$V/gh_${V}_macOS_${ARCH}.zip"
  curl -sSL -o "$T/sums"    "https://github.com/cli/cli/releases/download/v$V/gh_${V}_checksums.txt"
  WANT="$(grep "gh_${V}_macOS_${ARCH}.zip" "$T/sums" | awk '{print $1}')"
  GOT="$(shasum -a 256 "$T/gh.zip" | awk '{print $1}')"
  [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || die "gh 下载校验失败，已中止（官方 $WANT / 实得 $GOT）"
  (cd "$T" && unzip -q gh.zip)
  mkdir -p tools/bin && cp "$T"/gh_*/bin/gh "$GH" && chmod +x "$GH"
  xattr -d com.apple.quarantine "$GH" 2>/dev/null || true
  rm -rf "$T"
  echo "装好了：$($GH --version | head -1)"
fi

say "③ 登录 GitHub"
if "$GH" auth status >/dev/null 2>&1; then
  echo "已经登录过了，跳过。"
else
  echo "接下来会打开浏览器，请在浏览器里完成登录（脚本不会看到你的密码）。"
  "$GH" auth login --web --git-protocol https
fi

say "④ 提交尚未保存的改动"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "上线前的快照" >/dev/null
  echo "已提交。"
else
  echo "工作区干净，跳过。"
fi

say "⑤ 建仓库并推上去"
REPO="${REPO_NAME:-crystal-quest}"
if git remote get-url origin >/dev/null 2>&1; then
  echo "已经有远端了，直接推。"
  git push -u origin HEAD
else
  "$GH" repo create "$REPO" --public --source=. --remote=origin --push \
    --description "《去屏東打怪》—— 屏东六堆客家庄的 2D 回合制 RPG"
fi

say "⑥ 打开 GitHub Pages"
USER="$("$GH" api user --jq .login)"
BRANCH="$(git branch --show-current)"
"$GH" api -X POST "repos/$USER/$REPO/pages" \
  -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 \
  || "$GH" api -X PUT "repos/$USER/$REPO/pages" \
       -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "（Pages 可能已经开过了，继续）"

URL="https://$USER.github.io/$REPO/"
say "完成"
cat <<EOF

  网址：$URL

  第一次上线要等 1–2 分钟 GitHub 才会构建好，太早打开会是 404，刷新几次就行。

  手机上：用 Safari（iPhone）或 Chrome（Android）打开上面的网址，
  等它跑起来之后，按「分享 → 加到主画面」。
  之后主屏幕上会有图标，点开是全屏横屏，**飞航模式也能玩**。

  以后改了东西要更新，重跑一次这个脚本就好。

EOF
