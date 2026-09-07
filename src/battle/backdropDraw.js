// 战斗背景的「写景」半边：一套背景分几层、每层跟镜头动多少、光从哪来。
//
// 从 backdrop.js 拆出来——加上远近分层之后那个文件必破 400 行的上限。缝切在「选景」与「写景」
// 之间，因为两边改动的理由完全是两回事：那边改是因为**内容**变了（新地图、新的随机细节），
// 这边改是因为**画法**变了（配色、加细节、调纵深）。依赖单向：backdrop.js → 这里，绕不成环。
// 地平线表 HZ 也放这边：它是「画」出来的常量（决定每层画到哪儿为止），掷骰那边只是顺手
// 拿它当随机范围的上下界——常量跟着「谁定义它」走，箭头才不会掉头（hudBits.js 同一个道理）。
//
// **关于 ART**：这里所有坐标都是**逻辑**像素（256×224）——ctx 进来时 Game.render 已经
// setTransform(ART,0,0,ART,0,0) 缩放过了，所以这些常量**不需要** terrainBits.js 那套
// u() / us() 换算：那套是给「按物理像素烘焙瓦片」的代码用的，在这里套上去等于把整幅背景
// 放大 ART/2 倍。唯一该跟着 ART 走的是**细纹的宽度**——背景一直按整逻辑像素画，而精灵的
// 美术精度是 ART 倍，于是背景反而比敌人糙一档；PX（一个物理像素有多宽）就是补这一档的。
import { snap } from '../core/draw.js';
import { K, LIGHT, SHAFT, M, PX, camOf, layer, grad, halo, band, fillAll, ridge,
  RIDGE_FAR, RIDGE_NEAR, RIDGE_TAIWU, vignette, perspRows, converge } from './backdropKit.js';
import { backdrops } from '../assets/art.js';
import { PANEL_Y } from './hudBits.js';

// 各背景的地平线（地面起始 y）。**抬得很高是故意的**：
// 战斗单位站在 y=44..132（队伍 44/70/96/122、敌人 62/82/114/132），
// 地平线原本在 100，于是上面那半的人**浮在天上**——背景是柔和渐变时看不出来，
// 换成画好的天空之后一眼就是错的。
// 参考歧路旅人：它把镜头压低，让玩家「看进」场景而不是「看到」场景上，
// 于是地面占了四分之三画幅，站在画面上方的角色不是浮着，是**站得更远**。
export const HZ = { plains: 36, cave: 40, deep: 44, shrine: 38 };

// 有正式美术就用整幅画替掉「天空 + 远景」这两层，中景近景照旧程序化。
//
// **为什么只替前两层**：中景与近景承担的是视差和动画——竹丛按 K.mid 移、
// 沟边草丛按 K.near 移、钟乳石在滴水、水面反光在横移。换成静态图这些全没了，
// 而纵深恰恰是靠「近的比远的移得多」读出来的。远景本来就几乎不动（K.sky=0.12），
// 换成画好的一幅，损失最小、收益最大。
//
// **只画地平线以上。** 第一版让整幅画铺满战场，结果生成图自带的地面和程序化的地面
// 叠在一起，中间一道硬边——两种地面打架，玩家分不清哪层是能站的地。
// 地面必须归程序化那两层：它们承担视差（近的比远的移得多，纵深全靠这个），
// 而且角色就站在上面，那块地必须干净、必须可控。
//
// 对齐：母版**整幅就是地平线以上那一段**（出图时明确要求「地平线正好在画面底边，
// 底下什么都没有」），所以整幅拉到 [0, hz] 即可，不需要裁。
// 第一版是让整幅铺满战场再裁上面 62%——那样母版自带的一条地面会露出来，
// 跟程序化的地面接出一道硬边，正是「两种地面打架」。让画根本不带地面才是对的。
// 没有美术就返回 false，调用方照旧走程序化那两层——PNG 少一张不该让背景消失。
const PLATE_H = 120;      // 母版画的天空有多高（逻辑像素）；母版是它的 2 倍 512×240
function plate(ctx, W, kind, cam, hz) {
  const im = backdrops[kind];
  if (!im) return false;
  layer(ctx, cam, K.sky, () => {
    // **只取画的下缘那一段，不要整幅挤进去。** 母版画的是 120 逻辑像素高的天空，
    // 而地平线抬到 36 之后只剩 36 像素可用——整幅压进去等于把山和云全糊成几条线。
    // 取靠近地平线的那 hz/PLATE_H 一段按原比例画，山就还是山。
    // **这一层开插值，全局是关的。** 要放大约 3 倍才铺满战场，
    // 用最近邻会同时吃到两头的坏处：画本身是连续调（不是像素画），放大后
    // 既有绘画的糊、又有最近邻的方块边。开插值之后它就是一幅**高分辨率的背景**，
    // 前面站着低分辨率的角色——这正是 HD-2D 的核心对比（见 docs/HD2D方案.md）。
    ctx.imageSmoothingEnabled = true;
    const keep = Math.min(1, (hz + M) / PLATE_H);          // 用得上画的下缘几成
    ctx.drawImage(im, 0, im.height * (1 - keep), im.width, im.height * keep,
                  -M, -M, W + M * 2, hz + M);
    ctx.imageSmoothingEnabled = false;          // 还回去，后面几层还是像素画
  });
  return true;
}

// ---- 六堆平原：黄昏的水田 ----
// 天与低日 → 大武山系两道稜线 → 竹围与芒草 → 水田、田埂与土沟。
function drawPlains(ctx, W, bg, t, cam) {
  const hz = HZ.plains, lx = LIGHT.plains;
  const painted = plate(ctx, W, 'plains', cam, hz);   // 有正式美术就跳过下面的天空与远景
  if (!painted) layer(ctx, cam, K.sky, () => {
    fillAll(ctx, W, 0, hz, grad(ctx, 0, hz, '#4f7893', '#93aa9f', '#dfc189'));
    // 日头压在地平线上，只留一团暖雾 —— 真画个圆日会跟敌人抢视线，
    // 而「光从哪来」有这团雾就够了：底下三层的亮边全朝着它。
    halo(ctx, lx, hz - 2, 66, [[0, 'rgba(255,228,168,0.30)'], [0.42, 'rgba(255,198,128,0.12)'], [1, 'rgba(255,180,110,0)']]);
    // 云：整层极慢横移（0.8px/秒，一场仗飘过一个身位）。底面被低日烤暖、顶面还是冷的 ——
    // 两档一分，一条横线才有厚度。取模的边界放在画面外 100px，换行的那一下没人看得见
    for (const c of bg.clouds) {
      const x = snap(((c.x + t * 0.8 + 100) % (W + 200)) - 100);
      ctx.fillStyle = 'rgba(250,246,236,0.15)'; ctx.fillRect(x, c.y, c.w, 2);
      ctx.fillStyle = 'rgba(255,206,150,0.22)'; ctx.fillRect(x + 6, c.y + 2, c.w - 16, 1);
    }
  });
  if (!painted) layer(ctx, cam, K.far, () => {
    ridge(ctx, W, hz - 7, RIDGE_FAR, '#7b8ea3', { lx, lit: '#a8a49f', dark: '#5e7288' }); // 空气透视：远的一道更淡更蓝
    band(ctx, W, hz - 13, 8, 'rgba(236,208,164,0.17)');                                   // 山脚的暖霾，把两道稜线隔开
    ridge(ctx, W, hz, RIDGE_NEAR, '#4c684f', { lx, lit: '#7d8a4c', dark: '#39523f' });
  });
  layer(ctx, cam, K.mid, () => {
    // 竹围：客家庄外圈那道刺竹，既挡风也挡贼，是六堆地景的招牌。
    // 迎光的一侧描一条窄边光 —— 同一丛竹子于是有了正面和背面
    for (const b of bg.bamboo) {
      for (let k = 0; k < b.n; k++) {
        const bx = b.x + k * 3, top = hz - b.h + Math.abs(k - (b.n >> 1)) * 3;
        ctx.fillStyle = '#2b4229'; ctx.fillRect(bx, top, 1, b.h + 5);
        ctx.fillStyle = '#3a5a33'; ctx.fillRect(bx - 1, top - 2, 3, 3);
      }
      ctx.fillStyle = 'rgba(226,196,132,0.28)';
      ctx.fillRect(b.x + b.n * 3 / 2 < lx ? b.x + b.n * 3 - 1 : b.x - 1, hz - b.h, PX * 3, b.h + 5);
    }
    // 芒草：秋天的六堆，田埂上全是这个。穗子越靠近落日越透 —— 逆光的草是白的，背光的是灰的。
    // 风让整片极慢地倒向同一边（6 秒一个来回、最多歪 1px），慢到只当「这地方有风」
    const sway = Math.sin(t * (Math.PI * 2) / 6);
    ctx.fillStyle = '#3b482a';
    for (const r of bg.reeds) ctx.fillRect(r.x, hz - r.h + 2, PX * 3, r.h + 4);
    for (const r of bg.reeds) {
      const d = Math.abs(r.x - lx), dx = snap(sway * r.s);
      ctx.fillStyle = d < 46 ? '#e8d3a0' : d < 112 ? '#bba97c' : '#8d855f';
      ctx.fillRect(r.x + dx - 1, hz - r.h, 3, 2); ctx.fillRect(r.x + dx, hz - r.h - 2, 1, 2);
    }
  });
  layer(ctx, cam, K.near, () => {
    // 水田：按透视分段，**越近的一段越大块**（perspRows 的 t^2）。
    // 田埂用「亮顶 + 暗面」两档分隔——一条纯亮线是贴上去的，加一道暗面它才是一道**埂**。
    const rows = perspRows(hz, PANEL_Y + M, 5);
    const cols = ['#5f7e40', '#587739', '#516e34', '#496630', '#425c2a'];
    for (let i = 0; i < rows.length - 1; i++) band(ctx, W, rows[i], rows[i + 1] - rows[i], cols[i]);
    for (let i = 0; i < 3; i++) band(ctx, W, hz + 1 + i, 1, 'rgba(214,220,182,0.18)'); // 最远那段还灌着水
    ctx.fillStyle = 'rgba(255,226,168,0.32)';   // 日头正下方那一段反得最亮：水面认得出光源，这块地才算被同一盏灯照着
    for (let i = 0; i < 5; i++) ctx.fillRect(lx - 7 + (i % 2) * 3, hz + 2 + i * 2, 12 - i, 1);
    for (const y of rows.slice(1, -1)) { band(ctx, W, y, 1, '#948f5c'); band(ctx, W, y + 1, 1, 'rgba(34,52,24,0.42)'); }
    // 畦沟朝灭点收拢：远景全是横线，一组**收拢**的竖线一加，这块地才真的在往前铺。
    // 灭点取光源那个 x——光从哪来、地往哪退，说的是同一个空间。
    converge(ctx, hz, PANEL_Y + M, lx, 26, 13, '36,60,26', 0.42);
    ctx.fillStyle = 'rgba(30,54,22,0.55)';
    for (const c of bg.crops) ctx.fillRect(c.x, c.y, 1, 2);   // 秧苗
    // 土沟：画面最下沿那道排水沟。沟口一条受光的亮边、沟里几乎全黑 ——
    // 前景压着一个近到看得清明暗面的东西，后面三层才退得出去
    band(ctx, W, PANEL_Y - 12, 1, 'rgba(228,206,150,0.20)');
    band(ctx, W, PANEL_Y - 11, 11 + M, 'rgba(18,30,14,0.42)');
    ctx.fillStyle = 'rgba(12,22,10,0.85)';      // 沟边的芒草：只长在画面两侧最边上，敌我的脚都不在那儿
    for (const g of bg.tufts) for (let k = 0; k < 5; k++)
      ctx.fillRect(g.x + k * 2, PANEL_Y - g.h + Math.abs(k - 2) * 4, 1, g.h);
  });
}

// ---- 罗经圈外圈：湿岩壁、积水湖与那座断桥 ----
// 深处的黑 → 后方的湖与断桥 → 岩层、钟乳石与石笋 → 近处地面、碎石与积水 → 那束天光。
// 光：顶上一道裂缝漏下来的天光。外圈离地表还近才有这道光，再往里的「深处」一点自然光都没有 ——
// 两层的差别不只是更暗，是光**换了来源**。
function drawCave(ctx, W, bg, t, cam) {
  const hz = HZ.cave, lx = SHAFT;
  const painted = plate(ctx, W, 'cave', cam, hz);   // 有正式美术就跳过下面的天空与远景
  if (!painted) layer(ctx, cam, K.sky, () => {
    // 岩壁：洞顶没光所以最黑，越靠地面越亮 —— 亮的是积水反上来的那点光。
    // 岩石本身几乎不带彩（和地图里的 cave_wall #221d1d 同一个思路）：底色接近中性灰，
    // 冷是区域色调那一层给的。原本这里是饱和暖褐，光靠 multiply 压不成冷灰 —— 正片叠底只能压暗，压不掉红。
    fillAll(ctx, W, 0, hz, grad(ctx, 0, hz, '#101011', '#232426', '#3a3b3e'));
    halo(ctx, 218, 62, 58, [[0, 'rgba(150,182,196,0.07)'], [1, 'rgba(120,150,170,0)']]);   // 更深处的一点漫光，暗示洞还在往里
  });
  if (!painted) layer(ctx, cam, K.far, () => {
    // 后方积水湖：只占右半边，左边留一块实心岩壁 —— 构图不对称才有纵深
    ctx.fillStyle = grad(ctx, 92, hz + 2, '#0e1a1e', '#1e343c');
    ctx.fillRect(108, 92, W - 108 + M, hz - 90);
    ctx.fillStyle = 'rgba(140,186,196,0.11)';
    for (let i = 0; i < 4; i++) ctx.fillRect(120 + i * 30, 96 + (i % 2) * 3, 18 - i * 2, 1);
    // 断桥：架在湖上的木桥，中间断掉的那一截就是玩家在外围绕路的理由
    ctx.fillStyle = '#1d1713';
    ctx.fillRect(126, 94, 30, 3); ctx.fillRect(178, 94, 30, 3);
    for (const [x, h] of [[130, 12], [152, 10], [182, 10], [204, 13]]) ctx.fillRect(x, 97, 2, h);
    ctx.fillStyle = '#42341f'; // 桥面朝上那道亮边：天光正落在这儿
    ctx.fillRect(126, 94, 30, 1); ctx.fillRect(178, 94, 30, 1);
  });
  layer(ctx, cam, K.mid, () => {
    const wave = s => x => s.y + Math.round(Math.sin((x + s.p) * 0.05) * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';        // 岩层：几条起伏的横带，暗示层积岩
    for (const s of bg.strata) { const f = wave(s); for (let x = -M; x < W + M; x += 6) ctx.fillRect(x, f(x), 6, s.h); }
    ctx.fillStyle = 'rgba(152,182,190,0.07)';  // 每层上缘一道受光边，细到一个物理像素
    for (const s of bg.strata) { const f = wave(s); for (let x = -M; x < W + M; x += 6) ctx.fillRect(x, f(x) - PX * 2, 6, PX * 2); }
    ctx.fillStyle = 'rgba(120,140,140,0.06)';  // 壁上一道道渗水痕
    for (const s of bg.seep) ctx.fillRect(s.x, s.y, PX * 4, s.h);
    // 钟乳石 / 石笋：一个从顶上垂下来、一个从地里长上去，两头对着咬，洞才有高度。
    // 本体和受光边各走一遍（颜色只设两次）—— 逐条切换 fillStyle 是这段唯一会吃掉毫秒的地方
    const taper = (o, k) => Math.max(1, o.w - Math.round(k * o.w / o.h));
    ctx.fillStyle = '#141517';
    for (const d of bg.drips) for (let k = 0; k < d.h; k++) { const w = taper(d, k); ctx.fillRect(d.x - (w >> 1), k, w, 1); }
    for (const s of bg.spikes) for (let k = 0; k < s.h; k++) { const w = taper(s, k); ctx.fillRect(s.x - (w >> 1), hz + 2 - k, w, 1); }
    ctx.fillStyle = 'rgba(158,188,198,0.15)';  // 天光是从左上斜下来的平行光，所以一律左脸受光
    for (const d of bg.drips) for (let k = 0; k < d.h; k++) ctx.fillRect(d.x - (taper(d, k) >> 1), k, PX * 2, 1);
    for (const s of bg.spikes) for (let k = 0; k < s.h; k++) ctx.fillRect(s.x - (taper(s, k) >> 1), hz + 2 - k, PX * 2, 1);
  });
  layer(ctx, cam, K.near, () => {
    // 近处地面：湿石头。比岩壁亮一点，敌人脚下才有一条清楚的地平线
    ctx.fillStyle = grad(ctx, hz, PANEL_Y, '#3a3b3e', '#232426'); ctx.fillRect(-M, hz, W + M * 2, PANEL_Y - hz + M);
    band(ctx, W, hz, 2, 'rgba(0,0,0,0.35)');   // 岸边的暗线
    // 湿石地的层理：跟着透视走，越近越疏。渐变一色到底的话，
    // 地平线抬高之后那块地占了四分之三画幅，读起来是一张纸而不是一块地
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (const y of perspRows(hz, PANEL_Y + M, 5).slice(1, -1)) ctx.fillRect(-M, y, W + M * 2, 1);
    converge(ctx, hz, PANEL_Y + M, lx, 32, 7, '150,170,180', 0.09);
    // 天光落地的那一摊亮：光有来处也得有去处，不然那束光是浮在半空的
    halo(ctx, 176, hz + 14, 48, [[0, 'rgba(190,216,226,0.14)'], [0.5, 'rgba(150,186,206,0.05)'], [1, 'rgba(140,180,200,0)']]);
    ctx.fillStyle = '#4a4d51';
    for (const r of bg.rocks) { ctx.fillRect(r.x, r.y, r.w, 2); ctx.fillRect(r.x + 1, r.y - 1, r.w - 2, 1); }
    ctx.fillStyle = 'rgba(170,196,206,0.16)';
    for (const r of bg.rocks) ctx.fillRect(r.x, r.y - 1, PX * 3, 3);
    // 地上的积水：形状不动，只有反光在极慢地横移（约 11 秒一个来回、最多 6px）——
    // 会晃眼的东西一律不要，只允许「慢到几乎看不出在动」的程度
    for (const p of bg.pools) {
      for (let k = 0; k < 6; k++) {
        const w = p.w - Math.abs(k - 2.5) * 6;
        ctx.fillStyle = k === 0 ? '#425253' : '#14252a'; // 上缘一条亮边，水面才立得起来
        ctx.fillRect(p.x + Math.round((p.w - w) / 2), p.y + k, Math.round(w), 1);
      }
      const drift = Math.round(Math.sin(t * 0.55 + p.ph) * (p.w * 0.16));
      ctx.fillStyle = `rgba(160,205,212,${(0.16 + 0.06 * Math.sin(t * 0.9 + p.ph * 1.7)).toFixed(3)})`;
      ctx.fillRect(p.x + 6 + drift, p.y + 2, (p.w >> 1) - 2, 1);
      ctx.fillRect(p.x + 10 - drift, p.y + 4, (p.w >> 2), 1);
    }
    ctx.fillStyle = '#161719';   // 两侧的落石：把画面框住，也遮掉空荡荡的角落
    ctx.fillRect(-M, PANEL_Y - 16, 20, 22 + M); ctx.fillRect(6, PANEL_Y - 22, 10, 28 + M);
    ctx.fillRect(W - 16, PANEL_Y - 20, 20 + M, 26 + M); ctx.fillRect(W - 26, PANEL_Y - 12, 12, 18 + M);
    ctx.fillStyle = 'rgba(150,178,190,0.10)';
    ctx.fillRect(6, PANEL_Y - 22, PX * 3, 28); ctx.fillRect(W - 26, PANEL_Y - 12, PX * 3, 18);
  });
  // 光束最后画：它是**体积**，在所有东西的前面（连两侧的落石也该被它照到一点）。
  // 用斜切变换一次填出整束，不必逐行画 —— 这是全文件唯一允许边缘发虚的地方，一束光本来就没有硬边。
  // 亮度 4.6 秒一个来回、只在 ±14% 之间浮动：洞里有风，光柱里的浮尘在飘
  layer(ctx, cam, K.mid, () => {
    ctx.transform(1, 0, 0.34, 1, 0, 0);
    ctx.globalAlpha = 0.86 + 0.14 * Math.sin(t * (Math.PI * 2) / 4.6);
    ctx.fillStyle = grad(ctx, -M, hz + 30, 'rgba(206,228,238,0.14)', 'rgba(178,210,224,0.05)', 'rgba(150,190,212,0)');
    ctx.fillRect(SHAFT - 8, -M, 16, hz + 36);
  });
}

// ---- 罗经圈深处：只有磷光照明 ----
// 最深的黑与罗盘花 → 墙里的磷光矿脉 → 两侧石柱与磷光石本体 → 石板地与地面的倒影。
function drawDeep(ctx, W, bg, t, cam) {
  const hz = HZ.deep, lx = LIGHT.deep;
  const painted = plate(ctx, W, 'deep', cam, hz);   // 有正式美术就跳过下面的天空与远景
  if (!painted) layer(ctx, cam, K.sky, () => {
    fillAll(ctx, W, 0, PANEL_Y, grad(ctx, 0, PANEL_Y, '#08080a', '#181a1b', '#2a2c2d'));
    // 罗盘花：后墙上一圈圈同心刻痕加放射线，罗经圈就是这么得名的。
    // 对比压到几乎看不见，只当墙的质地 —— 真画清楚了会跟敌人抢视线
    ctx.strokeStyle = 'rgba(122,204,188,0.05)'; ctx.lineWidth = PX * 3;
    const cx = 128, cy = 82;
    for (const r of [22, 40, 60, 82, 108]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
      ctx.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108); ctx.stroke();
    }
  });
  if (!painted) layer(ctx, cam, K.far, () => {
    // 磷光矿脉：光是从墙**里面**长出来的。脉络本身几乎不亮，靠外面一层晕撑起来 ——
    // 有了脉络，那几颗磷光石才不像凭空摆的，而是这条矿脉冒出头的地方
    for (const v of bg.veins) {
      const k = 0.62 + 0.38 * Math.sin(t * (Math.PI * 2) / v.period + v.phase);
      ctx.beginPath(); ctx.moveTo(v.pts[0][0], v.pts[0][1]);
      for (let i = 1; i < v.pts.length; i++) ctx.lineTo(v.pts[i][0], v.pts[i][1]);
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(66,146,138,${(v.a * k).toFixed(3)})`; ctx.stroke();
      ctx.lineWidth = PX * 4; ctx.strokeStyle = `rgba(158,232,214,${(v.a * 2.2 * k).toFixed(3)})`; ctx.stroke();
    }
    for (const g of bg.grit) { ctx.fillStyle = `rgba(150,200,190,${g.a})`; ctx.fillRect(g.x, g.y, 1, 1); }
  });
  layer(ctx, cam, K.near, () => {
    // 地面：这一层的地是铺过石板的（地图里就是 flagstone），画几道接缝把「人工凿出来」讲清楚
    ctx.fillStyle = grad(ctx, hz, PANEL_Y, '#232425', '#111112'); ctx.fillRect(-M, hz, W + M * 2, PANEL_Y - hz + M);
    band(ctx, W, hz, 1, 'rgba(120,200,186,0.07)');
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    // 岩床的裂缝。原本是「每 9px 一条横线 + 9 条等距竖线」——那是照地平线在 120、
    // 地面只有 32px 高调的；抬到 44 之后整块地铺满等距线，读作**网格**而不是岩石。
    // 改成跟地面一起走透视：横缝按 perspRows（越近越疏），竖缝朝灭点收拢并淡出。
    for (const y of perspRows(hz, PANEL_Y + M, 5).slice(1, -1)) ctx.fillRect(-M, y, W + M * 2, 1);
    converge(ctx, hz, PANEL_Y + M, lx, 34, 7, '120,200,186', 0.10);
    // 地面积水的反光：每颗磷光石在湿石板上拖一道竖直的倒影，亮度跟本体一起呼吸，
    // 横向的碎光 7 秒一个来回。地面认得出光源，这层的光才是同一盏
    for (const s of bg.glow) {
      const k = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / s.period + s.phase);
      const y0 = Math.max(hz, s.y + 2), wob = snap(Math.sin(t * 0.9 + s.phase) * 1.5);
      ctx.fillStyle = grad(ctx, y0, PANEL_Y + 4, `rgba(150,228,210,${(0.10 + 0.05 * k).toFixed(3)})`, 'rgba(110,190,180,0)');
      ctx.fillRect(s.x - 2, y0, 4, PANEL_Y - y0 + 4);
      ctx.fillRect(s.x - 5 + wob, y0 + 6, 10, PX * 3); ctx.fillRect(s.x - 4 - wob, y0 + 13, 8, PX * 3);
    }
  });
  layer(ctx, cam, K.mid, () => {
    ctx.fillStyle = '#0b0b0c';  // 两侧的石柱：把画面框住，也提醒这里是人工凿出来的
    ctx.fillRect(-M, -M, 16 + M, PANEL_Y + M * 2); ctx.fillRect(W - 14, -M, 18 + M, PANEL_Y + M * 2);
    ctx.fillStyle = 'rgba(120,196,184,0.09)';   // 朝着中间（磷光那边）的内侧受光，外侧全黑
    ctx.fillRect(12, -M, PX * 4, PANEL_Y + M * 2); ctx.fillRect(W - 14 - PX * 4, -M, PX * 4, PANEL_Y + M * 2);
    // 磷光石：唯一的光源，冷蓝绿。亮度按各自 3.4–5.2 秒的周期缓慢起伏，振幅小到只像在呼吸
    for (const s of bg.glow) {
      const k = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / s.period + s.phase), a = 0.11 + 0.05 * k;
      halo(ctx, s.x, s.y, s.r, [[0, `rgba(150,235,214,${(a * 1.8).toFixed(3)})`],
        [0.45, `rgba(88,178,168,${(a * 0.75).toFixed(3)})`], [1, 'rgba(60,140,130,0)']]);
      ctx.fillStyle = `rgba(172,232,220,${(0.46 + 0.16 * k).toFixed(3)})`; // 结晶本体
      ctx.fillRect(s.x - 1, s.y - s.c, 2, s.c);
      ctx.fillStyle = s.x < lx ? 'rgba(126,206,192,0.75)' : 'rgba(80,150,144,0.7)'; // 朝中间的一面更亮
      ctx.fillRect(s.x - 3, s.y - (s.c - 2), 1, s.c - 2); ctx.fillRect(s.x + 2, s.y - (s.c - 3), 1, s.c - 3);
    }
  });
}

// ---- 大武山祭场：夜、立石、星空，最终战的仪式感 ----
// 夜空与月 → 稜线与后排立石 → 地面、月光与长影 → 前排立石 → 火塘。
function drawShrine(ctx, W, bg, t, cam) {
  const hz = HZ.shrine, MX = LIGHT.shrine, MY = 24;
  // 立石的**底座**：站在斜面上靠后一点的位置，不是站在地平线上。
  // 原本写死在 hz（那时地平线在 104、地面只剩 48px，两者差不多）；
  // 地平线抬到 38 之后再钉在 hz，石柱就整排飞到天上去了——而画里本来就有一圈立石。
  // 这一排是**近处**那一圈：站在地面上，影子往前拖，玩家从中间打。
  const SY = Math.round(hz + (PANEL_Y - hz) * 0.30);
  const painted = plate(ctx, W, 'shrine', cam, hz);   // 有正式美术就跳过下面的天空与远景
  if (!painted) layer(ctx, cam, K.sky, () => {
    fillAll(ctx, W, 0, hz, grad(ctx, 0, hz, '#06050f', '#100f24', '#251f3d'));
    ctx.save(); ctx.transform(1, 0, 0.9, 1, -46, 0);   // 银河：斜穿过去的一条淡带。夜空只有点没有面就太空，这条带子把星星串起来
    ctx.fillStyle = grad(ctx, 0, hz, 'rgba(150,160,220,0)', 'rgba(160,170,228,0.055)', 'rgba(140,150,210,0)');
    ctx.fillRect(24, -M, 44, hz + M * 2); ctx.restore();
    // 星：每颗自己的周期（2.2–4.8 秒）与相位，明暗差只有 0.16–0.22，慢到像在呼吸而不是在闪
    for (const s of bg.stars) {
      const a = s.base + s.amp * Math.sin(t * (Math.PI * 2) / s.period + s.phase);
      ctx.fillStyle = `rgba(226,234,255,${a.toFixed(3)})`;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big) { // 亮星多描四个邻点，看起来大一圈，不必真的画成 2px 方块
        ctx.fillStyle = `rgba(226,234,255,${(a * 0.4).toFixed(3)})`;
        ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
    // 月：挂在敌我之间那块空档上，也给立石的边光和地上的长影一个来源
    halo(ctx, MX, MY, 24, [[0, 'rgba(200,214,240,0.17)'], [1, 'rgba(200,214,240,0)']]);
    ctx.fillStyle = '#c9d3e8';
    for (let k = -6; k <= 6; k++) { const w = Math.round(Math.sqrt(Math.max(0, 36 - k * k))); ctx.fillRect(MX - w, MY + k, w * 2, 1); }
    ctx.fillStyle = 'rgba(120,134,168,0.5)';
    for (let k = -6; k <= 2; k++) { const w = Math.round(Math.sqrt(Math.max(0, 36 - k * k))); ctx.fillRect(MX - w + 1, MY + k, 3, 1); } // 月面的暗部
  });
  if (!painted) layer(ctx, cam, K.far, () => {
    ridge(ctx, W, hz - 9, RIDGE_TAIWU, '#0d0c1a', { lx: MX, lit: '#242142', dark: '#0a0915' }); // 大武山的稜线：朝月那一面有一线月光
    band(ctx, W, hz - 15, 8, 'rgba(150,132,196,0.06)');   // 山脚下的夜雾，把稜线和祭场分开
    ridge(ctx, W, hz, RIDGE_NEAR, '#0a0914', { lx: MX, lit: '#1a1934', dark: '#07060f' });      // 近一道山脊，压在祭场后面
    ctx.fillStyle = '#100f1d';   // 后排的小立石：更矮更暗，站在地平线上。围成的那一圈于是有了前后
    for (const m of bg.back) ctx.fillRect(m.x, hz - m.h, m.w, m.h + M);
  });
  layer(ctx, cam, K.near, () => {
    // 夯实的土地。上缘必须**刚好**落在地平线上（不能像 fillAll 那样往上溢，会啃掉远景稜线的下半截）
    // 祭场的土面。原本一整块纯色——地平线抬高之后那块地占了四分之三画幅，
    // 一色到底就是一张纸。按 perspRows 分段，越近越暗越大块，人才站得住
    const rows = perspRows(hz, PANEL_Y + M, 4);
    const cols = ['#1d1a30', '#191629', '#161425', '#12101f'];
    for (let i = 0; i < rows.length - 1; i++) band(ctx, W, rows[i], rows[i + 1] - rows[i], cols[i]);
    converge(ctx, hz, PANEL_Y + M, MX, 30, 9, '90,84,140', 0.16);
    halo(ctx, MX, hz + 8, 92, [[0, 'rgba(156,168,216,0.10)'], [0.55, 'rgba(140,150,200,0.035)'], [1, 'rgba(130,140,190,0)']]);
    // 月光在地上拉出的长影：石柱背着月的那一侧，影子往画面前方斜着铺开。
    // 一行一行画（不走路径），影子的边才是硬的 —— 和石柱本身同一种像素味。
    // 这是整张图里最像 FF6 的一笔：地上有影，「那些石头是立着的」这件事才成立
    ctx.fillStyle = 'rgba(4,3,12,0.42)';
    for (const m of bg.stones) {
      const dir = m.x + m.w / 2 < MX ? -1 : 1, len = Math.min(PANEL_Y - SY, Math.round(m.h * 0.7) + 8);
      // 越往前（越靠画面下缘）离镜头越近，影子该**变宽**而不是收窄——收窄会读成一根钉子
      for (let j = 0; j < len; j++) ctx.fillRect(snap(m.x + dir * j * 1.15), SY + j, m.w + (j >> 3), 1);
    }
  });
  layer(ctx, cam, K.mid, () => {
    for (const m of bg.stones) {   // 立石：围成一圈的石柱。朝月亮那一侧留一条窄边光，其余全是剪影
      ctx.fillStyle = '#191828'; ctx.fillRect(m.x, SY - m.h, m.w, m.h + 10);
      ctx.fillStyle = '#3d3a5c';
      ctx.fillRect(m.x + m.w / 2 < MX ? m.x + m.w - PX * 3 : m.x, SY - m.h, PX * 3, m.h + 10);
      ctx.fillStyle = '#2b2844'; ctx.fillRect(m.x, SY - m.h, m.w, 1);   // 顶面也吃得到月光
    }
  });
  layer(ctx, cam, K.near, () => {
    for (const g of bg.grit) { ctx.fillStyle = `rgba(180,170,210,${g.a})`; ctx.fillRect(g.x, g.y, 2, 1); }
    ctx.fillStyle = '#2b2740';   // 地上摆成一圈的祭石：火塘的边
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (i / 12);
      ctx.fillRect(snap(128 - Math.cos(a) * 74), snap(136 + Math.sin(a) * 9), 4, 2);
    }
    // 火塘里剩下的一点炭：出火熄掉之后就只剩这个了。5.5 秒一次的极暗起伏
    const k = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / 5.5);
    halo(ctx, 128, 136, 44, [[0, `rgba(214,124,58,${(0.065 + 0.035 * k).toFixed(3)})`], [1, 'rgba(214,124,58,0)']]);
  });
}

// ---- 通用背景：认不出地图时的退路 ----
// 也分了三层，好让「调试强制遇敌」看到的东西和正式背景是同一种语汇
function drawFallback(ctx, W, cam) {
  layer(ctx, cam, K.sky, () => fillAll(ctx, W, 0, PANEL_Y, grad(ctx, 0, PANEL_Y, '#232a33', '#3b4038', '#565a48')));
  layer(ctx, cam, K.far, () => ridge(ctx, W, PANEL_Y - 40, RIDGE_NEAR, '#3f4a38', { lx: 158, lit: '#5c6742', dark: '#333c2c' }));
  layer(ctx, cam, K.near, () => {
    band(ctx, W, PANEL_Y - 40, 40 + M, '#4a5138'); band(ctx, W, PANEL_Y - 40, 2, '#39402c');
    for (let i = 0; i < 5; i++) band(ctx, W, PANEL_Y - 36 + i * 7, 1, 'rgba(200,190,150,0.06)');
  });
}

// 暗角：地图那边有暗角托底，战斗画面一直没有，所以四角总是「亮着但空着」。
const PAINT = { plains: drawPlains, cave: drawCave, deep: drawDeep, shrine: drawShrine };

// 把一套背景画出来。cam（震屏偏移）在这里读一次，分给每一层 —— 调用方不必知道它存在。
// 暗角用系数 0：镜头晃、暗角不晃 —— 它是镜片，不是景。
// panX 是留给「出手时镜头推一下」的接口：现在没人传，因为 lungeOffset 只挪精灵、没进镜头变换
// （见 K 的注释）。哪天 render.js 愿意把它算进来，那边加一个实参就通了，这边不用再动。
export function paintScene(ctx, W, bg, t, panX = 0) {
  const cam = camOf(ctx), fn = PAINT[bg?.kind];
  cam[0] += panX;
  if (fn) fn(ctx, W, bg, t, cam); else drawFallback(ctx, W, cam);
  layer(ctx, cam, 0, () => vignette(ctx, W));
}
