# 水晶传说 Crystal Quest — 项目规则（Claude 必读）

FF1 / FF3 / FF5 风格的 2D 回合制 JRPG。现代 JavaScript（ES Modules）+ HTML5 Canvas，
**零运行时依赖、零构建步骤**。运行：`python3 tools/serve.py`（禁缓存的静态服务器），打开 http://localhost:8123 。

## 目录
```
index.html          入口（canvas 256×224，整数倍放大）
src/main.js         启动
src/core/           引擎：Game / 固定步长循环 / 输入 / 场景栈 / 可播种随机数 / 文字
src/field/          地图行走（网格移动、遇敌、门传送）、NPC、商店
src/ui/DialogueScene.js 对话框
src/battle/         战斗场景、纯函数公式、敌人 AI、角色构造
src/ui/             FF 蓝色窗口、光标菜单
src/menu/           主菜单 / 道具 / 装备 / 状态（透明场景，叠在地图上）
src/title/          标题画面（新游戏 / 继续）
src/game/           全局状态（可序列化）、队伍属性计算、升级
src/assets/         代码生成的占位像素图与瓦片（以后换成 PNG 图集只改这里）
src/data/loader.js  加载 data/*.json
data/               **所有游戏内容**：职业、魔法、敌人、遇敌表、地图、初始队伍
tests/              浏览器内测试（公式 + 数据完整性）
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
- `jobs.json`  `{ id: { name, base:{hp,mp,str,agi,int,vit,acc,eva}, growth:{同上/每级}, commands:[...], spells:[...] } }`
- `spells.json` `{ id: { name, mp, power, element?, target:'enemy'|'ally', heal?:true, scope:'single' } }`
- `enemies.json` `{ id: { name, sprite, hp, mp, atk, def, acc, eva, spd, mdef, int, crit, exp, gold, weak:[], resist:[], immune:[], spells:[], ai } }`
- `encounters.json` `{ zoneId: { steps:[min,max], groups:[{ enemies:[ids], weight }] } }`
- `maps/*.json` `{ name, encounterZone|null, spawn:{x,y}, legend:{ 字符: {tile, solid?, encounter?, counter?} }, rows:[字符串],
  events:[{x,y,type:'warp',to:{map,x,y,facing}}], npcs:[{id,name,sprite,x,y,dir,wander?,radius?,script?,dialogue:[变体]}] }`
  对话变体 `{ if?:flag, unless?:flag, set?:[flags], give?:{gold, items:[{id,qty}]}, lines:[每页一条] }`，取第一个条件成立的；每页 ≤ 3 行
  脚本 `{type:'inn', price, wake:[], poor:[]}` / `{type:'shop', items:[ids]}` / `{type:'boss', enemies:[ids], winFlag, after:[]}`（NPC 用 `unless: winFlag` 打完消失）
  事件还有 `{type:'chest', id, gold|item, qty}`（开过记 `flags['chest:'+id]`）、`{type:'crystal', needFlag}`（触发结局）
- `story.json` 水晶三段文本 + 结局字幕（`# ` 开头为大标题，`·` 开头为灰色小字）
- `config.json` `maps:[加载的地图 id 列表]`
- `items.json` `{ id: { name, type:'consumable'|'weapon'|'armor', effect?:{hp|mp|revive|camp}, atk?, def?, acc?, price, jobs?:[], battle?, field?, desc? } }`
- `party.json` `[{ name, jobId, level, equipment:{weapon, armor} }]`
- `config.json` `startInventory:[{id, qty}]`、`battleMode:'turn'|'atb'`、`expSplit`

## 字体与声音
- 像素字体「缝合怪 Fusion Pixel 12px」在 assets/fonts/（OFL 许可，可商用）；text.js 用测宽法检测，检测不到就退回系统字体
- 所有声音都是 Web Audio 合成（audio.js 的 SFX / SONGS 表），没有音频文件；M 键静音

## 调试
- URL 加 `?debug` 显示 FPS/坐标/遇敌倒计时
- 地图上按 `B` 强制遇敌，按 `H` 全员回满
- 自动试玩：控制台 `const t = await import('/tests/playtest.js'); await t.runAll()`（同步步进，不依赖真实按键）

## 剧情设定（自创，勿用 SE 名词）
铃兰村靠『风之水晶』庇护四百年；三天前黑甲骑士从村北「回音洞窟」夺走水晶，怪物开始袭人。
村长托付四名少年（雷欧/莉娜/艾露/凯）取回水晶。任务标志 `questStarted`。Boss 暂定「暗甲骑士 维恩」。

## 路线图
- [x] 0 骨架：循环 / 输入 / 场景栈 / RNG / 文字
- [x] 1 垂直切片：地图行走 + 步数遇敌 + 回合制战斗 + 胜利/失败/逃跑 + 经验升级
- [x] 2a 标题画面、主菜单（X 键）、道具、装备、状态、存档/读档（localStorage）、战斗中道具
- [x] 2b 对话框（打字机/翻页/选项）、NPC（闲逛、隔柜台说话、按标志位选台词）、门传送、旅馆、商店、剧情前提
- [ ] 3 职业转职、更多魔法、状态异常、ATB 模式打磨（调度器已预留 `battleMode:'atb'`）
- [ ] 4 NPC 对话、剧情标志位、多地图传送（门已是可走瓦片）
- [x] 5 回音洞窟三层（宝箱/楼梯/Boss 剧情战/水晶/结局滚动字幕）；世界地图与飞空艇未做
- [x] 6a 音效/BGM（Web Audio 合成，src/core/audio.js）、战斗特效（src/battle/effects.js）、遇敌马赛克转场、像素字体（assets/fonts，OFL）
- [ ] 6b 正式美术、数值平衡、打包发布
