// 「给目标挂点什么」的两件事：被特效笼罩（veil）、附加状态（inflict）。
//
// 从 actions.js 拆出来是为了让 skillAction.js 也用得上而**不产生循环引用**——
// actions.js 要 import skillAction.js（分派 'skill'），skillAction.js 又要 inflict，
// 留在原处就成了 A↔B。ESM 对提升过的函数声明其实兜得住，但这个项目栽过太多次
// 「测试全绿、跑到那一行才炸」，不值得为省一个文件去赌。
import { STATUS } from '../game/status.js';
import { statusChance } from './formulas.js';

// 给目标挂上「被笼罩」。时长直接取特效自己的 dur——两边各写一个数字，
// 改了特效时长就会有一段「火已经灭了人还是半透明」。
// 具体怎么从看得见渐变到被吞没，见 render.js 的 VEIL 那张表。
export function veilOn(t, fx, tint) {
  t.veil = t.veilDur = fx ? fx.dur : 0.3;
  t.veilTint = tint || null;
}

// 附加状态：免疫 / 已有 → false
// chance 是可选的成功率覆盖，给「一场只能请一次」的召唤用（请下来的神顺手护住自家人，
// 不该再掷一次 75%）。**免疫仍然一票否决**：statusChance 对免疫的目标返回 0，
// 这里只在它本来就 > 0 时才让覆盖值生效。
export function inflict(scene, t, status, chance = null) {
  const def = STATUS[status];
  const base = statusChance(t, status);
  const p = chance != null && base > 0 ? chance : base;
  if (!def || t.status[status] || !scene.rng.chance(p)) return false;
  t.status[status] = def.turns ? scene.rng.int(def.turns[0], def.turns[1]) : true;
  scene.popup(t, def.name, def.color);
  return true;
}
