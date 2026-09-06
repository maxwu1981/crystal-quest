# 去屏東打怪 — 项目规则（Claude 必读）

台湾屏东六堆背景的 2D 回合制 RPG。玩法骨架是经典 JRPG，但设定、命名与美术都刻意避开 FF 的招牌形象。
现代 JavaScript（ES Modules）+ HTML5 Canvas，
**零运行时依赖、零构建步骤**。运行：`python3 tools/serve.py`（禁缓存的静态服务器），打开 http://localhost:8123 。

## 目录
```
index.html          入口（canvas 256×224，整数倍放大）
src/main.js         启动
src/core/           引擎：Game / 固定步长循环 / 输入 / 场景栈 / 可播种随机数 / 文字
src/field/          地图行走（网格移动、遇敌、门传送）、NPC、商店
src/ui/DialogueScene.js 对话框
src/battle/         战斗场景（流程/UI）、actions.js（行动协程）、纯函数公式、敌人 AI、角色构造
src/game/status.js  状态异常定义（中毒/睡眠/黑暗/防护）
src/ui/             褪色墨绿+暗铜的窗口、光标菜单（刻意避开经典 JRPG 的亮蓝玻璃框）
src/menu/           主菜单 / 道具 / 装备 / 状态 / 转职 / 设置（透明场景，叠在地图上）
src/title/          标题画面（新游戏 / 继续）
src/game/           全局状态（可序列化）、队伍属性计算、升级
src/assets/         代码生成的占位像素图与瓦片；art.js 在 assets/art/manifest.json 存在时用 PNG 覆盖
assets/art/         tools/gen_art.py 用 Gemini 生成的正式美术（raw/ 是原图缓存，不进 git）
tools/              serve.py 开发服务器、gen_art.py + pixel.py 美术管线、build.py 打包
src/data/loader.js  加载 data/*.json
data/               **所有游戏内容**：职业、魔法、敌人、遇敌表、地图、初始队伍
tests/              run.js 单元/数据测试、playtest.js 自动试玩、balance.js 数值平衡模拟（?balance）
```

## 架构铁律
1. **引擎与内容分离**：`src/` 只写机制，`data/*.json` 只写内容。新怪物/魔法/地图 = 改 JSON，不改代码。
2. **场景栈**：Field / Battle / Menu 都是 Scene（`update(dt)` / `render(ctx)` / 可选 `enter` `exit` `resume`）。
   用 `game.scenes.push/pop`，场景之间不直接互相引用。
3. **所有游戏状态在 `game.state`**，必须能 `JSON.stringify`。禁止把状态藏在闭包、DOM 或模块级变量里。
4. **固定时间步长**：逻辑只在 `update(dt)`，dt 恒为 1/60。`render` 只读状态，不改状态。
5. **随机数只用 `game.rng`**（可播种，mulberry32）。禁止 `Math.random`。
6. **数值公式全部是 `src/battle/formulas.js` 的纯函数**。改公式必须同步改 `tests/run.js`。
7. 单文件不超过 400 行，超了就拆。
8. 内部分辨率 256×224，瓦片 16px，所有绘制坐标取整。
9. 精灵由 `src/assets/` 生成；替换正式素材时只改 assets 层，场景代码不动。
10. 玩家可见文本一律中文，且尽量放在 `data/` 里。

## 禁止
- 引入 npm 依赖或构建工具（除非用户明确要求）
- 使用 Square Enix 的美术、音乐、专有名词（陆行鸟、席德、莫古利、巴哈姆特…）
- 用计时器做遇敌（必须步数制）
- 像素级碰撞（一律网格制）

## 数据 schema
- `jobs.json`  `{ id: { name, desc, base:{hp,mp,str,agi,int,vit,acc,eva}, growth:{同上/每级}, commands:[...], spells:["id" | {id, level}], unarmed?, hits? } }`
  职业 id：`boxer` 拳头师 / `hunter` 山猎人 / `general` 家将 / `herbwife` 青草婆 / `talisman` 符仔仙 / `peddler` 走贩
  攻击 = 力量/2 + 武器（武僧空手 = 力量/2 + unarmed×等级，hits 是命中数倍率）
- `spells.json` `{ id: { name, mp, power, element?, target:'enemy'|'ally', scope:'single'|'all', heal?, status?, cure?:[状态], revive?:比例, desc } }`
  power 为 0 且有 status = 纯状态魔法；状态 id 见 src/game/status.js（poison sleep blind protect）
- `enemies.json` `{ id: { name, sprite, hp, mp, atk, def, acc, eva, spd, mdef, int, crit, exp, gold, weak:[], resist:[], immune:[元素或状态], spells:[], onHit?:{status, chance}, ai } }`
- `encounters.json` `{ zoneId: { steps:[min,max], groups:[{ enemies:[ids], weight }] } }`
- `maps/*.json` `{ name, encounterZone|null, spawn:{x,y}, legend:{ 字符: {tile, solid?, encounter?, counter?} }, rows:[字符串],
  events:[{x,y,type:'warp',to:{map,x,y,facing}}], npcs:[{id,name,sprite,x,y,dir,wander?,radius?,script?,dialogue:[变体]}] }`
  对话变体 `{ if?:flag, unless?:flag, set?:[flags], give?:{gold, items:[{id,qty}]}, lines:[每页一条] }`，取第一个条件成立的；每页 ≤ 3 行
  脚本 `{type:'inn', price, wake:[], poor:[]}` / `{type:'shop', items:[ids]}` / `{type:'boss', enemies:[ids], winFlag, after:[]}`（NPC 用 `unless: winFlag` 打完消失）
  事件还有 `{type:'chest', id, gold|item, qty}`（开过记 `flags['chest:'+id]`）、`{type:'crystal', needFlag}`（触发结局）
- `story.json` 水晶三段文本 + 结局字幕（`# ` 开头为大标题，`·` 开头为灰色小字）
- `config.json` `maps:[加载的地图 id 列表]`
- `items.json` `{ id: { name, type:'consumable'|'weapon'|'armor'|'accessory', cat?, tier?, myth?, icon?, lore?,
  effect?:{hp|mp|revive|camp|cure}, atk?, def?, acc?, eva?, mdef?, crit?, spd?, hits?, element?, status?,
  hpBonus?, mpBonus?, atkBonus?, defBonus?, intBonus?, immuneAll?, price, jobs?:[], battle?, field?, desc? } }`
  材质线按 `tier` 递增（硬度排序）；`myth:true` 的是神话装备，价格 0、商店永不出售，
  靠宝箱 / Boss 掉落 / NPC 赠予取得（有测试强制每一件都必须有出处），
  且在 `src/assets/equip.js` 里有专属造型
- 地图事件 `chest` 支持可选的 `text`（字符串或数组）：开箱时先讲这东西的来历，再报「拾到了 X」
- Boss NPC 的 `script.reward:[{id, qty}]` 打赢后直接进背包；NPC 对话变体的 `give:{gold?, items?:[{id,qty}]}` 同理
- NPC 的 `if` / `unless` 控制是否出现（例如北口「守庄门的」`unless: questStarted`，接了任务就让路）
- `party.json` `[{ name, jobId, level, equipment:{weapon, armor, accessory} }]`
- `config.json` `startInventory:[{id, qty}]`、`battleMode:'turn'|'atb'`（玩家可在设置里覆盖，存 state.settings）、`expSplit`
- `state.party[i].status` 持久状态（目前只有 poison）；`state.settings` 设置；`state.flags.jobUnlocked` 转职解锁（昌黎祠的庙祝给六堆令旗）

## 美术管线
- 逻辑分辨率仍是 256×224，但画布是它的 `ART` 倍（`src/core/draw.js`，现在 ART=2 → 512×448）。
  瓦片 32×32、角色 32×48，绘制一律走 `drawArt()`，UI 坐标不受影响。
- 角色图由 Gemini 生成，`tools/import_downloads.py` 处理导入；`assets/art/raw/` 存原图，改处理参数可直接重算。
- 处理链：洋红抠底 → `largest_blob` 只留最大连通块（Gemini 有时一张画两个姿势）→ 按身高归一化裁剪
  → 面积平均缩小 → 色阶量化 → 描边。**角色一律 `fit='height'`**，否则宽袍角色会被整体缩小。
- `tools/reassign.py` 按配色重新归位（多轮改名后错乱时用）、`tools/recolor.py` 换配色。
- 每个方向可有两帧：`<view>` 站立、`<view>_walk` 迈步；缺迈步帧就退回程序化的上身下沉。
- 装备外观在 `src/assets/equip.js`：按类别 + 材质程序化生成叠加层，神话装备有专属形状。

## 字体与声音
- 像素字体「缝合怪 Fusion Pixel 12px」在 assets/fonts/（OFL 许可，可商用）；text.js 用测宽法检测，检测不到就退回系统字体
- 所有声音都是 Web Audio 合成（audio.js 的 SFX / SONGS 表），没有音频文件；M 键静音

## 调试
- URL 加 `?debug` 显示 FPS/坐标/遇敌倒计时
- 地图上按 `B` 强制遇敌，按 `H` 全员回满
- 数值平衡：`tests/?balance` 跑模拟。目标：普通遇敌 2–3 回合；Boss 要按**两档装备**分别看——
  「决战装备」（迷宫宝箱都开了，正常流程）7 级 90%+、6 回合左右、会倒一个人；
  「商店装备」（漏拿宝箱）应该打不过，逼玩家回去开箱，而不是卡死。
  **只看商店档会严重低估玩家强度**，改 Boss 数值必须两档都看。
- 自动试玩：控制台 `const t = await import('/tests/playtest.js'); await t.runAll()`（同步步进，不依赖真实按键）

## 剧情设定（台湾屏东六堆，自创）
恒春的「出火」三百年没熄过，上个月熄了。老册子写：那把火是先民留下来压山的。
火熄第三天起，内埔庄开始有人被「魔神仔」牵走。昌黎祠的庙祝阿伯托付四个庄内年轻人
（阿勇 拳头师 / 巴冷 山猎人 / 秀琴 青草婆 / 文彬 符仔仙）上大武山取回火种。任务标志 `questStarted`。
Boss 是「乌火」——它说自己不是妖不是鬼，是这块地欠的债。
地名全部用屏东真实地名：内埔庄、六堆平原、罗经圈（迷宫，路像罗盘一样绕）、大武山祭场、昌黎祠。
怪物取自台湾民俗与在地生物：魔神仔、山猪、好兄弟、虎头蜂、水鬼、芒神、食果蝠。


## 路线图
- [x] 0–2 引擎骨架、地图行走、步数遇敌、回合制战斗、菜单、道具装备存档、对话 NPC 旅馆商店
- [x] 3 状态异常、按等级学魔法、全体魔法、六职业转职、设置（回合制/ATB 切换）
- [x] 5 罗经圈两层 + 大武山祭场（宝箱/Boss/火种/结局）、世界地图六堆平原
- [x] 6a 音效 BGM 战斗特效 像素字体
- [x] 6b 数值平衡（tests/?balance）、打包（tools/build.py）
- [x] 美术精度翻倍（ART=2）、角色三视角与迈步帧、装备穿戴外观、23 件神话装备造型
- [x] 补齐角色帧：6 职业 × 6 帧全齐，朝向与身高都体检过（`fit='height'`，实心高度一律 46）
- [x] 怪物与瓦片换成 Gemini 正式美术（10 只怪 + 25 张瓦片；`tiles.js` 里仍留程序化 fallback）
- [ ] 第二个村庄 / 更多迷宫 / 真正的音乐文件 / 手柄与触屏

### Boss 曲线目前对不上目标（2026-09-07 查明，未改）

`tests/?balance` 的「决战装备」档实测：乌火 6 级 77% / 7 级 97% / 8 级 100%，
而记录的目标是 6 级 ~30% / 7 级 ~90% / 8 级起稳赢。**6 级明显偏易。**

成因是更早那轮并行改动给玩家加强（补装备档位断档、让光属性真的有用、
拳头师买得到拳套）之后，没有回头复核 Boss 曲线。

**靠调 Boss 数值修不了**，试过三组：
- HP 1550 / 攻 34 → 30% / 73% / 87%
- HP 1500 / 攻 31 → 50% / 83% / 93%
- HP 1300 / 攻 30 / 防 16→24 → 63% / 83% / 93%

把 6 级压到 30% 的代价一定是 8 级不再稳赢，这比现状更糟
（练到 8 级还有十几分之一翻车率，在十回合的 Boss 战后很挫败）。
防御那一组几乎没动曲线：决战装备档下队伍攻击约 91，`攻击×1.5 = 136`，
防御 16 还是 24 都只是零头。

**根因是结构性的：决战装备档里角色等级几乎不影响胜负，装备才是。**
曲线天生就是平的，Boss 数值只能整条上下平移，不能改变陡峭度。
真要修得动装备侧（把最强装备卡在 Boss 之后、或让装备加成随等级缩放），
或者让乌火更依赖魔法（魔法伤害被 mdef 削减，而 mdef 随等级长，
等级才会重新变得重要）——这是设计决策，没有擅自改。

### 提高 ART 会暴露一整类「写死的物理像素」问题（2026-09-07 踩透）

凡是手调出来的几何/幅度常量，当初都是在 ART=2、PX=32 下调的，
ART 一提高就全部缩到 1/(ART/2)。**每一处单看都不像 bug**，
症状是「过渡边界变硬、装饰看不见、特效一格格蹦、水面不流了」。
已经修完的清单（下次再调 ART 时按这张表复查）：

| 位置 | 常量 | 换算工具 |
|---|---|---|
| `terrain.js` | FRINGE 的 depth/jag | `u()` |
| `terrainBake.js` | blotch 半径与抖幅、DECO_PAINT 的花草石头、崖影 SH_N/SH_W、浪花 SCALLOP/SHALLOW、咬合舌头宽度、边缘碎点 | `u()` / `us()` |
| `tiles.js` | WAVE_X / WAVE_Y / SWAY 动画幅度 | `ART / 2` |
| `battle/effects.js`、`field/FieldScene.js`、`battle/hud.js` | 粒子坐标的 `Math.round` | `snap()` |

两个换算单位（`assets/terrainBits.js`）：
- `u(v)` 给**尺寸**，带 `max(1,…)` 防零宽
- `us(v)` 给**有符号偏移**，不能用 u()——`u(-1)` 会变成 `+1`，抖动会全偏一侧

特效用 `core/draw.js` 的 `snap(v) = round(v*ART)/ART` 对齐**物理**像素网格：
边缘仍是硬的，但运动最小步长跟着 ART 变细。

**注意分辨真假规则**：防闪那条「相邻两帧差不超过 1 像素」管的是**逻辑**位移，
不是物理像素数。按 U 换算后逻辑位移不变，分寸没有放宽。
