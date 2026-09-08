// 载具：state.vehicle 是一个字符串（null | 'oxcart' | …），不是地图上的实体——
// 没有一台停在原地的牛車，上下车只在定点（cartstop 之类）换这个字符串。
// 为什么这么做、例外只有会飞的火輪：见 docs/交通与世界移动.md §7.4。
//
// only：骑上之后只准站的 tile 名单（牛車反而收窄能走的地方，不是放宽）。
// fly：不看 only，任何非 solid 格都能站（火輪那一级用）。
// step：每格秒数，覆盖 FieldScene 的 STEP_TIME。noEnc：骑着完全不计遇敌步数。
// board：面朝哪种 tile 触发上/下车的对话。
export const VEHICLES = {
  oxcart: { name: '牛車', only: ['path', 'cartstop'], step: 0.11, noEnc: true, board: 'cartstop' },
};

import { DialogueScene } from '../ui/DialogueScene.js';

// 面朝的格子是不是某台载具的上/下车点；是的话弹一句问话。
// 回传 true＝这次 interact() 已经处理掉，FieldScene 不用再往下找 NPC/事件。
export function tryBoard(scene, x, y) {
  const tile = scene.cell(x, y)?.tile;
  const id = Object.keys(VEHICLES).find(k => VEHICLES[k].board === tile);
  if (!id) return false;
  const g = scene.game, v = VEHICLES[id], riding = g.state.vehicle === id;
  g.scenes.push(new DialogueScene(g, {
    pages: [riding ? `要在这里下${v.name}吗？` : `要坐上${v.name}吗？`],
    choices: ['要', '不用'],
    onDone: r => {
      if (r !== 0) return;
      g.state.vehicle = riding ? null : id;
      scene.resetEncounter();   // 跨图带着走的计数器，上下车不重置会「一下车立刻遇敌」
    },
  }));
  return true;
}
