// 窗口样式：墨绿底 + 暗铜外框 + 米色内线，四角有小刻痕。
// 界面基调是旧纸与铜锈，刻意避开经典 JRPG 的亮蓝色玻璃框。
//
// 边框由外往内四圈（厚度感来自「多圈细线」，不是一条粗线）：
//   0px    近黑外影 —— 窗口才像浮在地图上，而不是印在地板上；窗口相邻时也变成一道凹缝
//   1–2px  暗铜主框 —— 上浅下深的渐变，等于「光从上面来」
//   4px    米色内线 —— 同样上亮下暗
//   5px 起 内容区（各处 pad 一律 8，离内线还有 3px 余白，所以改边框不用动任何布局）
// 圆角只做最外一圈：256×224 上再往里圆就糊成一团，而且窗口并排时缺口会变大。
export const UI = {
  text:   '#e8e2cc', // 主文字（米白）
  dim:    '#8a8468', // 次要文字
  accent: '#e6c46a', // 高亮（暗金）
  danger: '#c8705a', // 危险
  good:   '#9ecf7a', // 恢复
  cool:   '#8fb9a8', // MP / 冷色数值
  gray:   '#6b6858', // 禁用 / 倒下
  paper:  '#d8cfa8', // 大字与窗口内线的米色（标题、结局字幕）
};

const R = 3; // 外框圆角半径。再大，并排的两个窗口中间会露出明显的缺口

// 圆角矩形路径。不用 ctx.roundRect（较新的 API，能不依赖就不依赖），
// 半径随 inset 一起收缩，几圈线才是同心的。
function roundPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWindow(ctx, x, y, w, h) {
  ctx.save();
  // ① 外影
  roundPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, R);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

  // ② 底色：上浅下深的墨绿。试过半透明（FF6 那种玻璃感），3.5% 就能看见地图的路和
  //    NPC 轮廓在字底下晃，菜单又是整屏铺满，透出来的东西没有任何信息量——所以做成不透明，
  //    「玻璃」交给下面那道上缘高光去表现。
  roundPath(ctx, x + 1, y + 1, w - 2, h - 2, R - 1);
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#1a2d25');
  bg.addColorStop(1, '#08100d');
  ctx.fillStyle = bg; ctx.fill();

  // ③ 内侧上缘的受光：一道渐隐高光，玻璃感就靠它。高度不超过窗高一半，
  //    否则 26px 高的小窗（地名条）会整块发白。
  ctx.save(); ctx.clip();
  const band = Math.min(14, h / 2);
  const hi = ctx.createLinearGradient(0, y + 1, 0, y + 1 + band);
  hi.addColorStop(0, 'rgba(198,222,198,0.10)'); hi.addColorStop(1, 'rgba(198,222,198,0)');
  ctx.fillStyle = hi; ctx.fillRect(x, y, w, band + 2);
  ctx.restore();

  // ④ 暗铜主框（2px）：上浅下深 = 立体
  roundPath(ctx, x + 2, y + 2, w - 4, h - 4, R - 2);
  const br = ctx.createLinearGradient(0, y, 0, y + h);
  br.addColorStop(0, '#9c7f50'); br.addColorStop(0.45, '#6b5637'); br.addColorStop(1, '#3d3120');
  ctx.strokeStyle = br; ctx.lineWidth = 2; ctx.stroke();

  // ⑤ 米色内线（1px，直角）。半像素对齐，缩放后才不会糊成两像素。
  //    窗口小于 4 圈边框的总厚度时（w 或 h < 10）就没有内线可画，直接跳过，免得画出反向矩形
  if (w < 10 || h < 10) { ctx.restore(); return; }
  ctx.beginPath(); ctx.rect(x + 4.5, y + 4.5, w - 9, h - 9);
  const inner = ctx.createLinearGradient(0, y, 0, y + h);
  inner.addColorStop(0, 'rgba(216,207,168,0.9)'); inner.addColorStop(1, 'rgba(216,207,168,0.34)');
  ctx.strokeStyle = inner; ctx.lineWidth = 1; ctx.stroke();

  // ⑥ 四角刻痕：内线拐角上各点一颗更亮的像素，像铆钉
  ctx.fillStyle = '#efe6bd';
  for (const [cx, cy] of [[x + 4, y + 4], [x + w - 5, y + 4], [x + 4, y + h - 5], [x + w - 5, y + h - 5]])
    ctx.fillRect(cx, cy, 1, 1);
  ctx.restore();
}

// 分隔线：一暗一亮两条 1px，看起来像刻进面板里。
// 分组用它，不要用空行——224px 高度里没有空行可以浪费。
export function drawDivider(ctx, x, y, w) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = 'rgba(216,207,168,0.14)'; ctx.fillRect(x, y + 1, w, 1);
  ctx.restore();
}

// 细横条（HP/MP/经验）：2px 彩色 + 1px 下沿阴影，总高 3px。
// 再粗会压过文字，再细就分不出颜色。ratio 允许 NaN/越界，内部夹到 0..1。
export function drawGauge(ctx, x, y, w, ratio, color) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 3);   // 槽（含下沿阴影）
  ctx.fillStyle = '#33463a'; ctx.fillRect(x, y, w, 2);           // 空槽底色：空着也看得见槽在哪
  const fw = Math.round(w * r);
  if (fw > 0) {
    ctx.fillStyle = color; ctx.fillRect(x, y, fw, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x, y, fw, 1); // 顶缘受光，和窗口同一个光源
  }
  ctx.restore();
}

// 选中底：左端最亮、向右淡出的一条暗金，左缘再加一道竖线。
// 不做成整条实色块——那会盖掉窗口底色的层次，也会和右侧的数值抢注意力。
export function drawHighlight(ctx, x, y, w, h) {
  ctx.save();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(230,196,106,0.20)');
  g.addColorStop(0.75, 'rgba(230,196,106,0.03)');
  g.addColorStop(1, 'rgba(230,196,106,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(230,196,106,0.5)'; ctx.fillRect(x, y, 1, h);
  ctx.restore();
}
