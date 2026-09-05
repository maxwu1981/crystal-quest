# 水晶传说 Crystal Quest

FF1/3/5 风格的 2D 回合制 JRPG。纯 JavaScript + Canvas，无依赖、无构建。
一个 1–2 小时的完整体验：铃兰村 → 铃兰平原 → 回音洞窟三层 → 黑甲骑士 → 取回风之水晶 → 结局字幕。

## 运行
ES Module 不能用 `file://` 直接打开，需要任意静态 HTTP 服务器：

```bash
python3 tools/serve.py
```
然后打开 <http://localhost:8123>（调试模式：<http://localhost:8123/?debug>）。
没有 python3 也可以用 `ruby -run -e httpd . -p 8123`，或 VS Code 的 Live Server 插件。

## 操作
| 键 | 作用 |
|---|---|
| 方向键 / WASD | 移动、选菜单 |
| Z / Enter / Space | 确认、和 NPC 说话、开宝箱（战斗中按住可加速） |
| X / Esc | 取消 / 打开主菜单（道具 装备 状态 转职 设置 存档 读档） |
| M | 静音 |
| B（调试） | 强制遇敌 |
| H（调试） | 全员回满 |

## 系统
- 回合制指令战斗（设置里可切换 FF5 式 ATB），物理 / 属性魔法 / 全体魔法 / 会心 / 防御 / 逃跑
- 状态异常：中毒（战斗后持续，走路掉血）、睡眠、黑暗、防护；解毒药、眼药水、净化、旅馆
- 6 种职业（战士 盗贼 武僧 白魔 黑魔 赤魔），村长给水晶碎片后可在菜单里随时转职，魔法按等级学
- 道具、装备（职业限制、攻防预览）、商店、旅馆、宝箱、存档（localStorage）
- 步数制遇敌、马赛克转场、Web Audio 合成的音效与 BGM、开源像素字体

## 测试
- 单元 / 数据完整性测试：<http://localhost:8123/tests/>
- 数值平衡模拟（各区域各等级的胜率与掉血）：<http://localhost:8123/tests/?balance>
- 自动试玩（在游戏页控制台）：`const t = await import('/tests/playtest.js'); await t.runAll()`

## 用 Gemini 生成正式美术
所有角色 / NPC / 敌人 / 瓦片都能用 Gemini 一键生成并处理成像素图，替换代码画的占位图：

```bash
export GEMINI_API_KEY=你的key      # 或写进项目根目录 .gemini_key（已 gitignore）
python3 tools/gen_art.py           # 约 70 张图；原图缓存在 assets/art/raw/，重跑不重复扣费
python3 tools/gen_art.py --list    # 只看清单和提示词
python3 tools/gen_art.py --only goblin,warrior --force   # 不满意的单独重做
```
生成的 PNG 和 `assets/art/manifest.json` 会被游戏启动时自动读取；删掉某张 PNG 就退回占位图。
想改画风或角色描述：只改 `tools/gen_art.py` 顶部的清单。

## 打包发布
```bash
python3 tools/build.py    # 生成 dist/ 与 dist/crystal-quest.zip
```
上传到 itch.io（HTML 游戏，入口 index.html）或推到 GitHub Pages 即可。

## 目录
见 `CLAUDE.md`（同时也是给 AI 协作者的项目规则与数据 schema）。
