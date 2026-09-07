// 战斗背景的「选景」半边：按玩家当前所在地选一套写景（平原 / 洞窟 / 洞窟深处 / 祭场 / 通用），
// 把这一局的随机细节一次性掷定，最后对上区域色调。**怎么画**在 backdropDraw.js（缝的理由见那边的头注）。
//
// 这个文件本身是从 hud.js 拆出来的——那个文件 409 行，破了项目单文件 400 行的上限，
// 而缝就切在它原本第 13 行那道「战斗背景」横幅上。
// 这条缝干净的理由：横幅两边只共用面板坐标（PANEL_Y，已经挪进 hudBits.js），
// 没有一个函数调用往来；改动的理由也完全是两回事——
// 这半边是写景美术（配色、加细节、对色温），那半边是 UI 排版（一行放得下几个字）。
import { RNG } from '../core/RNG.js';
import { PANEL_Y } from './hudBits.js';
import { HZ, paintScene } from './backdropDraw.js';

// ============ 战斗背景 ============
// 一张灰绿渐变打遍平原、洞窟、祭场，是这个战斗画面和 FF6 差距最大的地方——
// 那边是每种地形一张专属背景，「换了地方」这件事全靠背景说。这里按玩家当前所在地选一套。
// 判断只看 game.state.map / opts.zone，所以 FieldScene 不用改，也不必多传参数。
// 认不出的地图一律退回通用背景（调试强制遇敌、以后新加的地图都走这条路）。
// **新增遇敌区必须在这里登记**，否则战斗背景静默退回 drawFallback()——
// 那条路没有正式美术、没有透视地面、地平线还停在 PANEL_Y-40，
// 于是上半场的人整个浮在天上。而地图本身、遇敌表、测试全都正常，
// 只有真的在那张图上打一场才看得出来。隘寮石城与万金古塚就这么漏了一整轮。
// **新开一个遇敌区就要在这里登记**，漏了会静默退回通用背景：地平线停在旧位置、
// 人浮在天上，而地图、遇敌表、测试全都正常（隘寮石城与万金古塚漏了一整轮）。
// tests/cases/data.js 有一条专门卡这件事。
const ZONE_BG = { village_field: 'plains', plains: 'plains', cave: 'cave', cave_deep: 'deep',
                  fort: 'cave', tomb: 'deep',
                  // 壇下：伯公壇底下三层，越下越旧。头两层还是砌石的坛基，底层已经是生土
                  altar: 'cave', altar_deep: 'deep',
                  // 爐底：炉渣巷道，渣还没冷。采空区更深更黑
                  furnace: 'cave', furnace_deep: 'deep' };
const MAP_BG = { village: 'plains', overworld: 'plains', cave_1: 'cave', cave_2: 'deep', cave_3: 'shrine',
                 fort_ailiao: 'cave', tomb_wanjin: 'deep',
                 altar_1: 'cave', altar_2: 'cave', altar_3: 'deep',
                 furnace_1: 'cave', furnace_2: 'deep' };

// 背景里的随机细节（星星、钟乳石、竹丛…）只能掷一次骰子：每帧重掷会变成一整片雪花。
// 所以由 BattleScene 在 constructor 里调用本函数把结果存下来，render 只读不掷。
// 掷出来的每一样都标了它属于哪一层（天 / 远 / 中 / 近），因为分层之后
// 「这东西该长多大」是跟着层走的：同样是草，中景那排芒草和近景沟边那几丛不是一个尺度。
export function makeBackdrop(game, opts = {}) {
  const kind = ZONE_BG[opts.zone] || MAP_BG[game?.state?.map?.id] || 'default';
  const rng = game?.rngFx || new RNG(20260905); // rngFx 是纯装饰用的 RNG；万一没有也不能让背景炸掉
  const bg = { kind };
  const list = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

  if (kind === 'plains') {
    bg.clouds = list(4, i => ({ x: rng.int(-20, 200), y: 10 + i * 11 + rng.int(-3, 3), w: rng.int(38, 84) })); // 天
    // 竹围：客家庄外圈那道刺竹，既挡风也挡贼，是六堆地景的招牌（中景）
    bg.bamboo = list(9, i => ({ x: i * 29 + rng.int(-6, 6), h: rng.int(13, 24), n: rng.int(3, 5) }));
    // 芒草：秋天的六堆田埂上全是这个。s 是被风吹歪的幅度（中景）
    bg.reeds = list(30, () => ({ x: rng.int(-2, 256), h: rng.int(6, 13), s: rng.int(6, 14) / 10 }));
    bg.crops = list(54, () => ({ x: rng.int(-2, 256), y: rng.int(HZ.plains + 3, PANEL_Y - 15) })); // 秧苗（近景）
    // 沟边的芒草丛：只长在画面两侧最边上——敌我的脚都不在那儿，挡不着谁（近景，最前）
    bg.tufts = list(4, i => ({ x: [-2, 9, 237, 247][i], h: rng.int(10, 18) }));
  } else if (kind === 'cave') {
    bg.strata = list(4, i => ({ y: 26 + i * 20 + rng.int(-4, 4), h: rng.int(2, 4), p: rng.int(0, 60) })); // 岩层
    bg.seep = list(6, () => ({ x: rng.int(4, 250), y: rng.int(10, 60), h: rng.int(14, 40) }));            // 壁上渗水
    bg.drips = list(11, i => ({ x: i * 24 + rng.int(-8, 8), w: rng.int(3, 7), h: rng.int(8, 22) }));      // 钟乳石（顶上垂下来）
    bg.spikes = list(8, i => ({ x: i * 32 + rng.int(-9, 9), w: rng.int(4, 9), h: rng.int(6, 16) }));      // 石笋（地上长起来）
    // 地上的积水：位置固定，只有反光在缓慢横移
    bg.pools = list(3, i => ({ x: 26 + i * 78 + rng.int(-10, 10), y: 124 + rng.int(0, 14), w: rng.int(30, 46), ph: rng.int(0, 60) / 10 }));
    bg.rocks = list(7, () => ({ x: rng.int(0, 252), y: rng.int(HZ.cave + 2, PANEL_Y - 4), w: rng.int(3, 8) }));
  } else if (kind === 'deep') {
    // 磷光矿脉：墙里的一条条光。折线走点也一次掷定——每帧重掷会变成一团抽搐的电流
    bg.veins = list(4, i => {
      let x = i * 62 + rng.int(-16, 10), y = rng.int(12, 92);
      const pts = [[x, y]];
      for (let k = 0; k < 6; k++) { x += rng.int(9, 24); y += rng.int(-15, 15); pts.push([x, y]); }
      return { pts, a: rng.int(6, 11) / 100, period: 3.6 + rng.int(0, 16) / 10, phase: rng.int(0, 62) / 10 };
    });
    // 磷光石：这层唯一的光源，是矿脉冒出头的地方。贴着墙脚与两侧，尽量不抢敌人所在的画面中段
    bg.glow = list(6, i => ({
      x: [10, 32, 226, 246, 120, 200][i] + rng.int(-4, 4),
      y: [96, 128, 92, 130, 138, 122][i] + rng.int(-4, 4),
      r: rng.int(16, 26), c: rng.int(4, 8),
      period: 3.4 + rng.int(0, 18) / 10, phase: rng.int(0, 62) / 10, // 周期 3.4–5.2 秒，够慢才不刺眼
    }));
    bg.grit = list(40, () => ({ x: rng.int(0, 254), y: rng.int(6, PANEL_Y - 2), a: rng.int(3, 8) / 100 }));
  } else if (kind === 'shrine') {
    // 星空：每颗星自己的周期与相位，最亮最暗只差一点点，看起来是「有呼吸」而不是「在闪」
    bg.stars = list(46, () => {
      const big = rng.chance(0.18);
      return { x: rng.int(1, 254), y: rng.int(2, HZ.shrine - 12), big,
        base: (big ? 62 : 42) / 100, amp: (big ? 22 : 16) / 100,
        period: 2.2 + rng.int(0, 26) / 10, phase: rng.int(0, 62) / 10 };
    });
    // 立石：祭场围成一圈的石柱。后排（远景）矮而暗，前排（中景）中间高两边矮，
    // 两排一分，那一圈才是「围起来的」而不是「排成一列的」
    bg.back = list(9, i => ({ x: i * 29 + rng.int(-5, 5), w: rng.int(6, 11), h: rng.int(12, 24) }));
    bg.stones = list(7, i => ({ x: [2, 30, 64, 106, 150, 194, 230][i] + rng.int(-3, 3), w: rng.int(10, 17), h: rng.int(20, 40) }));
    bg.grit = list(34, () => ({ x: rng.int(0, 254), y: rng.int(HZ.shrine + 2, PANEL_Y - 2), a: rng.int(4, 9) / 100 }));
  }
  return bg;
}

// ---- 区域色调：和地图那边对上 ----
// FieldScene 给每张地图蒙了一层 multiply 色调（村庄暖黄、洞窟冷蓝、祭场夜紫），
// 战斗背景却是自成一套的配色，于是「在冷蓝的洞里走着走着遇敌」会切进一片暖褐色，色温跳一下。
// 这里用同一种做法、同一组颜色，让两边落在同一个色系里：
//   plains ← village / overworld，cave ← cave_1，deep ← cave_2，shrine ← cave_3
// 用 multiply（正片叠底）而不是蒙一层半透明色：蒙色会把暗部提亮成灰，洞窟会糊成一片雾。
// 色调是常数、不含时间项 —— 结构上就不可能闪。
// 强度比地图那边低一档：地图有暗角托底，照抄 0.28 / 0.34 会把背景压得发闷。
// （写景那边现在也补上暗角了，但那是构图用的，托底还是靠这里手调。）
const TONE = {
  plains: { c: '#ffdfad', a: 0.14 }, // village(#ffd9a2 .16) 与 overworld(#ffe6bb .11) 的折中：两张地图共用这一套背景
  cave:   { c: '#7d9ec2', a: 0.26 }, // cave_1：这套原本是暖褐色，色温跳得最凶，要的就是这一层
  deep:   { c: '#6f92c0', a: 0.22 }, // cave_2：本来就是冷色，点到为止，压太狠会吃掉磷光石
  shrine: { c: '#8d7fc6', a: 0.20 }, // cave_3：夜色本就暗，只把蓝夜往紫里推一点
};

// bg 由 makeBackdrop 生成（缺省时退回通用背景），t 是战斗经过的秒数。
// save/restore 包起来：背景改了 fillStyle / strokeStyle / lineWidth / 变换 / 合成模式，
// 不能漏给后面画敌人的代码（restore 会把 globalAlpha 与 globalCompositeOperation 一起还原）。
export function drawBackground(ctx, W, bg = null, t = 0, panX = 0) {
  ctx.save();
  paintScene(ctx, W, bg, t, panX);
  const tone = TONE[bg?.kind];
  if (tone) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tone.a;
    ctx.fillStyle = tone.c;
    ctx.fillRect(-4, -4, W + 8, PANEL_Y + 8); // 和写景那边一样往外多铺：震屏会把画面推开 ±2px
  }
  ctx.restore();
}
