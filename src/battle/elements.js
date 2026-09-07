// 八属性：金木水火土風光暗。**这张表是唯一的真相来源**，
// 菜单图标（menu/icons.js）、商店说明（game/shop.js）、战斗演出（battle/actions.js）
// 都从这里取，不再各写一份。
//
// **为什么是这八种**：六鎮物就是金木水火土風（data/lore.json 的 the_six），
// 加上光与暗正好八种，八位召唤一人一种（data/summons.json）。
// 属性体系跟主线骨架对齐之后，「拿到土的鎮物那一幕解锁土的那一位」才成立。
//
// **旧 id 怎么换过来的**（tools/migrate_elements.py 做的，跑过前后比对，70 条一条没丢）：
//   thunder → metal  雷走金。金主肃杀，刀兵与雷霆同类：都是「一下就断」。
//                    避雷针是铁的；草薙剑、金刚杵这两把带电的兵器本来就归金。
//   ice     → water  冰是水冻硬的样子，不是另一种东西。
//   poison  → wood   草木自己带的那一份毒。
//   fire / light / dark 不动。
//   新增 earth / wind——迁移前这两种一条数据都没有。
//
// **`poison` 这个 id 以前身兼二职**：既是属性（毒雾的 element）又是状态
// （game/status.js 的中毒），而 enemies.json 的 `immune` 两种都收，
// 于是 `immune:["poison"]` 到底是「毒伤害无效」还是「不会中毒」分不出来——
// 两个都算，但代码里没有一处说得清。拆成 wood（属性）+ poison（状态）之后
// 这个歧义没了，迁移时把两条语义都写进 immune，行为一模一样。
//
// 字段：
//   cn    中文名，玩家看得到（商店的「金属性」、CLAUDE.md 的对照表）
//   color 图标与刀光的颜色（menu/icons.js、actions.js 的 ELEMENT_COLOR）
//   tint  特效期间盖在目标身上那层薄影的**深色调**——不是属性色的暗版，
//         是「物体在这团东西里逆光时的样子」。染成属性的中间色等于没画（试过）。
//   fx    effects.js / spellFx.js 里的特效键；null = 还没有专属特效，退回 'spark'
//   sfx   core/audio.js 的 SFX 键

export const ELEMENTS = {
  metal: { cn: '金', color: '#ffe98a', tint: '#20265e', fx: 'thunder', sfx: 'thunder' },
  wood:  { cn: '木', color: '#8ad06a', tint: '#1c3a12', fx: 'poison',  sfx: 'buzz'    },
  water: { cn: '水', color: '#a8e4ff', tint: '#123a52', fx: 'ice',     sfx: 'magic'   },
  fire:  { cn: '火', color: '#ffb060', tint: '#6b2408', fx: 'fire',    sfx: 'fire'    },
  earth: { cn: '土', color: '#c69a63', tint: '#2e2214', fx: null,      sfx: 'hit'     },
  wind:  { cn: '風', color: '#b6f0e2', tint: '#123c38', fx: null,      sfx: 'magic'   },
  light: { cn: '光', color: '#fff3c0', tint: '#4e4118', fx: null,      sfx: 'hit'     },
  dark:  { cn: '暗', color: '#b28fd0', tint: '#150f24', fx: 'dark',    sfx: 'hit'     },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);
export const elementName = id => ELEMENTS[id]?.cn || id;

// battle/actions.js 用的三张表。原本在那个档里各写一份常量，
// 属性一改名就得三处一起改（改漏一处的表现是「特效静默退回 spark」，不报错）。
const pick = k => Object.fromEntries(
  ELEMENT_IDS.filter(id => ELEMENTS[id][k] != null).map(id => [id, ELEMENTS[id][k]]));
export const ELEMENT_FX = pick('fx');
export const ELEMENT_TINT = pick('tint');
export const ELEMENT_SFX = pick('sfx');
export const ELEMENT_COLOR = pick('color');
