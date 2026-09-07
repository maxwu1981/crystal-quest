// 走地图的**镜头层**：纵向光度渐变（空气透视）+ 上下两条移轴景深带。
//
// 战斗那边把地面画成朝里退的斜面（backdropKit.js 的 perspRows / converge），
// 于是镜头是压低的；走地图是正俯视的网格，斜面没法画（要重画所有瓦片）。
// 但压低机位的**另外两个读法**是屏幕空间的，跟地图内容一点关系都没有：
//   ① 上＝远 → 压暗、偏冷、降对比；下＝近 → 微暖。一条纵向渐变就说完了。
//   ② 焦平面只有一条 → 画面上下两端脱焦。这就是移轴。
// 两条合起来，走地图和战斗才像同一台摄影机拍的。
//
// **模糊一律自己降采样，不用 `ctx.filter = 'blur()'`**：
// docs/HD2D方案.md 第五节第 3 条实测，小半径反而比大半径贵好几倍
// （Skia 只有大 sigma 才走「先降采样再模糊」的近似路径，小半径老老实实做卷积）。
// 这里降到 1/4 再放大回来，效果等价、成本可控，而且**跟地图滚不滚动无关**——
// 它读的是画好的整幅画面，跟镜头在哪里没有关系。
//
// **防闪**：两样都与时间无关，逐帧画的是同一条渐变、同一次缩放。不可能闪。
import { ART } from '../core/draw.js';

const DOWN = 4;              // 降采样倍数
const TOP = 0.19, BOT = 0.12; // 两条带各占屏幕高度的多少
// 内缘的交叉淡入：把一条带切三小条，模糊版依次盖 100% / 62% / 28%，
// 相当于清晰版与模糊版做渐变混合 —— 一条带直接整块盖上去会切出一条硬边。
const FADE = [1, 0.62, 0.28];

let buf = null;
function scratch(w, h) {
  if (!buf) buf = document.createElement('canvas');
  if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
  return buf;
}
const on = (k, d) => (typeof window !== 'undefined' && window[k] !== undefined ? window[k] : d);

// 空气透视：上缘偏冷偏暗、42% 处透明、下缘微暖。
// 用 multiply 而不是蒙半透明色 —— 蒙色会把暗部提亮成灰（洞窟会变雾），
// 乘法是给画面调子，暗的地方仍然是暗的。和 ambience.js 的 tint 同一个理由。
export function cameraRamp(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(150,168,196,0.30)');
  g.addColorStop(0.42, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,236,206,0.16)');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 移轴：整幅画降到 1/4，再把上下两条带放大回来。
// 画布是 canvas（物理像素），而 ctx 挂着 ART 倍的变换，所以目标坐标写逻辑像素。
export function tiltShift(ctx, canvas, W, H) {
  const qw = Math.max(1, Math.round(canvas.width / DOWN)), qh = Math.max(1, Math.round(canvas.height / DOWN));
  const q = scratch(qw, qh), qg = q.getContext('2d');
  qg.imageSmoothingEnabled = true;
  qg.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, qw, qh);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const k = ART / DOWN;                       // 逻辑像素 → 降采样图上的像素
  const put = (y0, y1, a) => {
    if (y1 <= y0) return;
    ctx.globalAlpha = a;
    ctx.drawImage(q, 0, y0 * k, qw, (y1 - y0) * k, 0, y0, W, y1 - y0);
  };
  const top = Math.round(H * TOP), bot = Math.round(H * BOT);
  for (let i = 0; i < FADE.length; i++) {     // 上带：外缘全糊，往里逐级淡出
    const a = Math.round(top * i / FADE.length), b = Math.round(top * (i + 1) / FADE.length);
    put(a, b, FADE[i]);
  }
  for (let i = 0; i < FADE.length; i++) {     // 下带：反过来，内缘最淡
    const a = H - Math.round(bot * (i + 1) / FADE.length), b = H - Math.round(bot * i / FADE.length);
    put(a, b, FADE[FADE.length - 1 - i]);
  }
  ctx.restore();
}

// FieldScene 只调这一个。mh 是地图的像素高度：**比屏幕矮的图（室内小房间）整个关掉**，
// 那种图画面居中、主角可能站在任何高度，两条带会直接糊到人脸上。
export function renderPostFx(scene, ctx, mh) {
  const { W, H, canvas } = scene.game;
  if (scene.game.state?.settings?.dof === false) return;   // 给设置菜单留的口（菜单这一轮不碰）
  if (on('__RAMP', true)) cameraRamp(ctx, W, H);
  if (on('__DOF', true) && mh > H) tiltShift(ctx, canvas, W, H);
}
