#!/bin/zsh
# 用法: finish_enemy.sh <id> <逻辑尺寸> <旧饱和> <旧明度>
set -e
cd "$(dirname "$0")/.."
python3 tools/ship_enemy.py "$1" "$2" | tail -2
python3 tools/tone_fit.py "enemy_$1.png" --sv "$3" "$4" --master | tail -2
python3 tools/ship_enemy.py "$1" "$2" >/dev/null   # 母版改了色，重新派生一次
