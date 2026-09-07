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

say "② 检查 gh（GitHub 官方命令行）"
if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "没装 gh，正在用 Homebrew 装（约一分钟）……"
    brew install gh
  else
    die "需要 gh，但这台机器没有 Homebrew。
请先装 Homebrew：https://brew.sh
再重跑这个脚本。"
  fi
fi

say "③ 登录 GitHub"
if gh auth status >/dev/null 2>&1; then
  echo "已经登录过了，跳过。"
else
  echo "接下来会打开浏览器，请在浏览器里完成登录（脚本不会看到你的密码）。"
  gh auth login --web --git-protocol https
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
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "《去屏東打怪》—— 屏东六堆客家庄的 2D 回合制 RPG"
fi

say "⑥ 打开 GitHub Pages"
USER="$(gh api user --jq .login)"
BRANCH="$(git branch --show-current)"
gh api -X POST "repos/$USER/$REPO/pages" \
  -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$USER/$REPO/pages" \
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
