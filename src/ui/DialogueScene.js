// 对话框：说话人头像、逐字显示、句读停顿、多页、可选项。透明场景，压在地图上。
import { drawWindow, drawPlate, UI } from './Window.js';
import { drawText, measure, wrapText, LINE_H } from '../core/text.js';
import { Menu } from './Menu.js';
import { audio } from '../core/audio.js';

// 对话框的横向尺寸是固定的：断行宽度必须保持 256-16 = 240，
// tests/run.js 的「对话每页最多 3 行」按 240 量过所有台词，改窄了会有台词被截掉而测试还是绿的。
// 高度则按这段对话自己的行数长（见 measureRows），底边永远贴着屏幕下缘。
const BOX_X = 0, BOX_W = 256, PAD = 8;
const MIN_ROWS = 2, MAX_ROWS = 4;   // 上限 4 = 原来固定框放得下的行数，不改这条就不会有新的截断
const TAIL = 12;                    // 正文下面留给翻页三角的一条，正文永远压不到它

// 逐字显示的基准速度：每秒 32 字。原来是 40，一页 30 字不到一秒就吐完，
// 快到接近「整页蹦出来」；再慢玩家会开始按快进，反而看不到演出。
const CPS = 32;

// 句读停顿。单位是「一个字的时间」，标点先显示、停顿加在它后面
// （所以计价的是上一个字：句号显示完，下一个字要等 7 个字的时间才出来）。
// FF6 的日文台词靠假名与汉字的疏密自带节奏，中文没有那层分词，
// 标点是唯一的呼吸点——不给停顿，一页字就是均匀地喷出来，没有语气。
// 省略号「……」是两个字符，各停 3，合起来正好是一次长吸气。
const PAUSE = { '。': 7, '！': 7, '？': 7, '，': 4, '、': 4, '；': 4, '：': 4, '…': 3, '—': 2, '\n': 6 };

const OPEN = 0.12;  // 开窗动画时长。再长就挡住第一句话，再短等于没有
const FACE = 36;    // 头像框边长（框内 32×32）

// 断行。整页一次断好、按行逐字揭开，不是每帧拿「已显示的前缀」重断——
// 打开避头尾之后，前缀断行会在句号打出来的那一刻把上一个字弹到下一行，
// 打字打到一半字会跳。整页断一次也省掉了每帧一次的逐字量宽。
const wrap = (ctx, text) => wrapText(ctx, text, BOX_W - PAD * 2, { hang: true });

// 强调色。改不了 data/ 里的台词（没有富文本标记可加），所以规则由这里自己认，两条：
//   ①「…」『…』里的内容——全部 253 句台词里只有 6 处，加上结局的「火种」「以后」，
//     稀少所以值钱：那些引号里装的都是关键词，FF6 也是靠变色把这种词拎出来的
//   ② 连续的数字——金币、价钱、天数。宝箱的「获得了 100 金币！」里，
//     真正要让人看见的就是那个 100
// 返回「下标 → 颜色」的稀疏表；整页都没有强调就返回 null，让绘制走整行一次画完的快路。
function emphasis(text) {
  let map = null;
  const mark = i => { (map ||= {})[i] = UI.accent; };
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '「' || ch === '『') { inQuote = true; mark(i); }
    else if (ch === '」' || ch === '』') { inQuote = false; mark(i); }
    else if (inQuote || (ch >= '0' && ch <= '9')) mark(i);
  }
  return map;
}

// 说话人名牌：挂在对话框左上角（有头像时挪到头像右边）。
// 名字在框外，框里 4 行全归正文——比让名字占掉一行宽裕。
function drawNamePlate(ctx, name, x, y) {
  const w = Math.round(measure(ctx, name)) + 12, h = 16;
  drawPlate(ctx, x, y, w, h);
  drawText(ctx, name, x + 6, y + 2, { color: UI.accent });
}

export class DialogueScene {
  // face：头像用的 sprite id（'elder' / 'boxer' …）。调用方没给就自己去场景栈里认，见 resolveFace。
  constructor(game, { name = '', pages = [], choices = null, onDone = null, face = null } = {}) {
    this.game = game; this.transparent = true;
    this.name = name; this.pages = pages.length ? pages : ['……']; this.choices = choices; this.onDone = onDone;
    this.page = 0; this.shown = 0; this.acc = 0; this.t = 0; this.menu = null;
    this.face = face ?? this.resolveFace();
    this.rows = this.measureRows();
    // 淡入淡出里被推上来的对话（旅馆睡醒、结局回村）不演开窗：转场期间场景是冻结的，
    // this.t 不走，窗口会卡在刚长出一条缝的样子等淡入结束——那才是真的像坏了。
    if (game?.transitioning) this.t = OPEN;
  }
  // 框高按这段对话最长的一页算，底边贴屏幕下缘。
  // 全部 273 页台词里 201 页只有一行、72 页两行，一行也没有三行——
  // 固定 72px 的框等于给一句话套一个四行的空壳，下面永远空着一大块地图被白白盖住。
  // FF6 的对话框本来就是按内容定高的。在「这一段对话」内固定，翻页时不会变，
  // 换一个 NPC 才重新长一次（窗口本来就要重开）。
  measureRows() {
    const ctx = this.game?.ctx;
    if (!ctx) return MAX_ROWS;   // 量不了就退回原来的四行框，宁可空也不要截字
    let n = MIN_ROWS;
    for (const p of this.pages) n = Math.max(n, wrap(ctx, p).length);
    return Math.min(MAX_ROWS, n);
  }
  get box() {
    const h = PAD + this.rows * LINE_H + TAIL;
    return { x: BOX_X, y: (this.game?.H || 224) - h, w: BOX_W, h };
  }
  get text() { return this.pages[this.page]; }
  get done() { return this.shown >= this.text.length; }
  get isLast() { return this.page === this.pages.length - 1; }
  // 当前页断好的行与强调色表，按页算一次就缓存起来（翻页时 this.text 变了才重算）
  sync(ctx) {
    if (this.cachePage === this.page) return;
    this.cachePage = this.page;
    this.lines = wrap(ctx, this.text).slice(0, this.rows);
    this.colors = emphasis(this.text);
  }
  // 下一个字要等多久（单位：一个字的时间）
  get cost() { return this.shown ? (PAUSE[this.text[this.shown - 1]] || 1) : 1; }

  // FieldScene 目前只传 name，不传头像用的 sprite id。退一步：从场景栈里找那张地图，
  // 按名字把 NPC 认回来（36 个 NPC 的名字互不重复）。认不出来——旁白、宝箱、
  // 打完 Boss 之后那只 NPC 已经从地图上消失——就不画头像，不影响任何逻辑。
  // 让 FieldScene 直接传 face: npc.sprite 会更稳，见交接说明。
  resolveFace() {
    if (!this.name) return null;
    const list = this.game?.scenes?.scenes || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const npcs = list[i].npcs;
      if (npcs) return npcs.find(n => n.def?.name === this.name)?.sprite || null;
    }
    return null;
  }
  get faceImg() {
    // 头像一律用「朝下」的站立帧：说话时人是面向读者的，不是面向他刚才走的方向
    return (this.face && this.game?.sprites?.[`${this.face}_down_0`]) || null;
  }

  update(dt) {
    const input = this.game.input;
    this.t += dt;
    if (this.menu) { this.menu.update(input); return; }
    if (!this.done) {
      // 按住 confirm 三倍速（停顿也跟着缩短）；点一下直接整页出来。
      // 「点一下 = 整页」这条不能动：自动试玩连按 confirm 翻页，没有它会卡在打字上超时。
      this.acc += dt * CPS * (input.isDown('confirm') ? 3 : 1);
      while (!this.done && this.acc >= this.cost) { this.acc -= this.cost; this.shown++; }
      if (input.justPressed('confirm') || input.justPressed('cancel')) this.shown = this.text.length;
      if (this.done && this.isLast && this.choices) this.openChoices();
      return;
    }
    if (this.isLast && this.choices) { this.openChoices(); return; }
    if (input.justPressed('confirm') || input.justPressed('cancel')) {
      audio.sfx('cursor');
      if (!this.isLast) { this.page++; this.shown = 0; this.acc = 0; }
      else this.close(null);
    }
  }
  openChoices() {
    // 宽度按最长的选项算。原来固定 80，「住宿 / 不了」右边空掉一大半，
    // 光标和文字缩在左角，像个没画完的框。上下限防止一个字的选项细成一条、长选项撑出屏幕。
    const ctx = this.game?.ctx;
    const lw = ctx ? Math.max(...this.choices.map(c => measure(ctx, c))) : 40;
    const w = Math.min(120, Math.max(64, Math.ceil(lw) + 26));
    const h = 16 + this.choices.length * LINE_H;
    const b = this.box;
    this.menu = new Menu({
      items: this.choices.map((c, i) => ({ label: c, value: i })),
      // 底边压进对话框 2px：和头像、名牌一样「坐」在框上，而不是浮在半空
      x: b.x + b.w - 6 - w, y: b.y + 2 - h, w, h,
      onSelect: it => this.close(it.value), onCancel: () => this.close(this.choices.length - 1),
    });
  }
  close(result) { this.game.scenes.pop(); this.onDone?.(result); }

  // 头像：框内 32×32，从精灵顶端裁一个正方形铺满。
  // 程序化小人是 16×16，裁出来就是整个人；正式美术是 16×24，裁出来正好是头和肩。
  // 一套算法两种素材都成立，而且都放大到 2 倍——头像比地图上的人大一圈才像头像。
  drawFace(ctx, img, x, y) {
    drawPlate(ctx, x, y, FACE, FACE);
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, 0, 0, side, side, x + 2, y + 2, FACE - 4, FACE - 4);
  }

  // 一行正文。整行同色就一次画完（绝大多数情况）；有强调色才切成同色的段落逐段画。
  // from 是这一行第一个字在整页文本里的下标。
  drawLine(ctx, line, x, y, from) {
    const colors = this.colors;
    if (!colors) { drawText(ctx, line, x, y, { color: UI.text }); return; }
    let i = 0, adv = 0;
    while (i < line.length) {
      const c = colors[from + i] || UI.text;
      let j = i + 1;
      while (j < line.length && (colors[from + j] || UI.text) === c) j++;
      const seg = line.slice(i, j);
      drawText(ctx, seg, x + Math.round(adv), y, { color: c });
      adv += measure(ctx, seg);   // 累加浮点宽度、画的时候才取整，段落多了也不会越走越偏
      i = j;
    }
  }

  render(ctx) {
    const { x, y, w, h } = this.box;
    // 开窗：0.12 秒从底边长上来。只改高度、不做缩放变换——窗框是 1px 的线，
    // 一缩放就糊成两像素；整数高度重画一遍才是 SNES 那种「窗口撑开」的手感。
    const k = Math.min(1, this.t / OPEN), ease = k * (2 - k);
    const bh = Math.max(10, Math.round(h * ease)), by = y + h - bh;
    drawWindow(ctx, x, by, w, bh);

    // 正文裁在窗口里：开窗那几帧，字是从长开的缝里露出来的。
    // 断行宽度是 w - PAD*2 = 240，见文件头的说明，不要改。头像挂在框外，不吃正文的宽度。
    this.sync(ctx);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, by, w, bh); ctx.clip();
    let idx = 0;   // 这一行的第一个字在整页文本里的下标：逐字显示与强调色都按它切
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i], vis = Math.min(line.length, Math.max(0, this.shown - idx));
      if (vis > 0) this.drawLine(ctx, line.slice(0, vis), x + PAD, y + PAD + i * LINE_H, idx);
      idx += line.length;
      if (this.text[idx] === '\n') idx++;   // wrapText 把 \n 吃掉了，下标要跟着跳过
    }
    ctx.restore();

    if (k >= 1) {
      const face = this.faceImg;
      if (face) this.drawFace(ctx, face, x + 6, y - FACE + 2);
      if (this.name) drawNamePlate(ctx, this.name, x + (face ? 10 + FACE : 10), y - 14);
      if (this.done && !this.menu && !(this.isLast && this.choices)) {
        // 翻页提示。原来是 3Hz 亮灭（每秒闪 1.5 次），那是频闪不是提示：
        // 改成常亮 + 1.6 秒一个来回的 1px 上下轻移，一样在说「还有」，但不刺眼。
        // 落在正文下面那条 TAIL 里（框高就是为它留的），所以最后一行再长也压不到它。
        const bob = Math.round(Math.sin(this.t * (Math.PI * 2 / 1.6)));
        const cx = x + w - 13, cy = y + h - TAIL + 1 + bob;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath(); ctx.moveTo(cx - 4, cy - 1); ctx.lineTo(cx + 4, cy - 1); ctx.lineTo(cx, cy + 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = UI.accent;
        ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    this.menu?.render(ctx);
  }
}
