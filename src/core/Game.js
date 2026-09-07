// 游戏总控：持有 canvas、输入、随机数、数据、场景栈、转场；由 main.js 创建。
import { Input } from './Input.js';
import { RNG } from './RNG.js';
import { SceneStack } from './SceneStack.js';
import { startLoop } from './loop.js';
// 分页标题的前缀；调试信息接在它后面
import { initFont } from './text.js';
import { audio } from './audio.js';
import { loadData } from '../data/loader.js';
import { buildSprites } from '../assets/sprites.js';
import { buildTiles } from '../assets/tiles.js';
import { loadArt } from '../assets/art.js';
import { buildEquipLayers } from '../assets/equip.js';
import { ART, LOGICAL_W, LOGICAL_H } from './draw.js';
import { newGameState } from '../game/state.js';
import { normalizeMember } from '../game/jobskill.js';
import { FieldScene } from '../field/FieldScene.js';
import { BattleScene } from '../battle/BattleScene.js';
import { TitleScene } from '../title/TitleScene.js';

// 分页标题的前缀；`?debug` 时调试信息接在它后面（不再画进画面）
const TITLE = '去屏東打怪';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = LOGICAL_W * ART; canvas.height = LOGICAL_H * ART;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.W = LOGICAL_W; this.H = LOGICAL_H;
    this.input = new Input();
    this.scenes = new SceneStack();
    this.fade = { alpha: 0, dir: 0, speed: 4, color: '#000', onMid: null };
    this.debug = new URLSearchParams(location.search).has('debug');
    this.fitCanvas();
    window.addEventListener('resize', () => this.fitCanvas());
    window.addEventListener('keydown', () => audio.ensure()); // 浏览器要求用户交互后才能出声
  }

  fitCanvas() {
    // 显示尺寸按逻辑分辨率取整数倍，保证物理像素也是整数倍（不糊）。
    //
    // 但手机上整数倍会浪费大半个屏幕：390px 宽的手机算下来正好是 1 倍，
    // 画面只占不到一半。所以整数倍算出来只有 1 倍、而实际能放下 1.3 倍以上时，
    // 改用精确比例铺满——`image-rendering: pixelated` 仍然保证是硬边像素，
    // 只是像素大小不再完全均匀。在手机上「铺满」比「绝对均匀」重要得多。
    // 手机是**横屏**，而且按键是半透明浮在画面上的（见 src/touch.js），
    // 所以不给按键预留空间——画面能占多大就占多大。
    // 桌面仍留 24px 给底部那行键盘提示。
    const touch = matchMedia('(pointer: coarse)').matches;
    const pad = touch ? 0 : 24;
    const exact = Math.min(innerWidth / this.W, (innerHeight - pad) / this.H);
    // 手机上一律用精确比例（不取整数倍）：横屏时画面按高度撑满，
    // 8:7 的画面放在 19.5:9 的屏幕上左右会留黑边，按键正好浮在那两条边上。
    const scale = touch ? exact : (exact < 2 && exact > 1.3 ? exact : Math.max(1, Math.floor(exact)));
    this.canvas.style.width = Math.round(this.W * scale) + 'px';
    this.canvas.style.height = Math.round(this.H * scale) + 'px';
  }

  async boot() {
    this.data = await loadData();
    this.pixelFont = await initFont();
    // ?? 不是 ||：写 `seed: 0` 的人是想要固定种子，|| 会把它当没写。
    // config.json 里用 null 表示「每局随机」，写下任何数字（包括 0）都照办。
    this.rng = new RNG(this.data.config.seed ?? (Date.now() >>> 0));
    this.rngFx = new RNG(99); // 纯装饰用（NPC 闲逛等），不影响战斗/遇敌
    this.sprites = buildSprites();
    this.tiles = buildTiles(new RNG(12345));
    // 传 jobs 进去是为了「还没画美术的职业借别人的图」那一步（见 art.js 末尾）
    this.artCount = await loadArt(this.sprites, this.tiles, this.data.jobs); // 有 assets/art/ 正式美术就覆盖占位图
    this.equipCount = buildEquipLayers(this.data.items); // 装备叠加层（穿上就看得见）
    this.state = newGameState(this.data);
    this.scenes.push(new TitleScene(this));
    this.loopStats = startLoop({
      update: dt => { if (!this.paused) this.update(dt); }, // paused：自动试玩时暂停实时循环，改为同步步进
      render: (alpha, stats) => this.render(alpha, stats),
      tickRate: this.data.config.tickRate || 60,
    });
  }

  get transitioning() { return this.fade.dir !== 0; }

  // 淡出 → 执行 onMid（换场景）→ 淡入。转场期间场景冻结。
  fadeTo(onMid, { color = '#000', speed = 4, mosaic = false } = {}) {
    if (mosaic) { // 马赛克转场：先把当前画面按逻辑分辨率存一份
      this.snap ??= document.createElement('canvas'); this.snap.width = this.W; this.snap.height = this.H;
      const sc = this.snap.getContext('2d'); sc.imageSmoothingEnabled = false;
      sc.drawImage(this.canvas, 0, 0, this.W, this.H);
      this.tmp ??= document.createElement('canvas'); this.tmp.width = this.W; this.tmp.height = this.H;
    }
    this.fade = { alpha: 0, dir: 1, speed, color, onMid, mosaic };
  }
  updateFade(dt) {
    const f = this.fade;
    if (!f.dir) return;
    f.alpha += f.dir * f.speed * dt;
    if (f.dir === 1 && f.alpha >= 1) { f.alpha = 1; const fn = f.onMid; f.onMid = null; fn?.(); f.dir = -1; }
    else if (f.dir === -1 && f.alpha <= 0) { f.alpha = 0; f.dir = 0; }
  }

  startBattle(enemyIds, opts = {}) {
    audio.sfx('encounter');
    this.fadeTo(() => this.scenes.push(new BattleScene(this, enemyIds, opts)), { color: '#000', speed: 2.2, mosaic: true });
  }
  newGame() { this.loadState(newGameState(this.data)); }
  loadState(state) {
    this.state = state;
    // 读档的统一入口：旧存档在这里补齐 learned / jobLevels / skillLevels（loadGame 拿不到 data，这里拿得到）
    for (const m of state.party || []) normalizeMember(m, this.data);
    audio.setMute(!!state.settings?.mute);
    this.scenes.clear();
    this.scenes.push(new FieldScene(this));
  }
  gameOver() {
    this.scenes.clear();
    this.scenes.push(new TitleScene(this));
  }

  // 遇敌转场：画面逐渐马赛克化 + 闪白 + 压暗
  renderMosaic(ctx, a) {
    const { W, H } = this, block = 1 + Math.floor(a * 15), sw = Math.ceil(W / block), sh = Math.ceil(H / block);
    const t = this.tmp.getContext('2d'); t.imageSmoothingEnabled = false;
    t.clearRect(0, 0, W, H); t.drawImage(this.snap, 0, 0, W, H, 0, 0, sw, sh);
    ctx.drawImage(this.tmp, 0, 0, sw, sh, 0, 0, sw * block, sh * block);
    // 遇敌闪光：原本是 `Math.floor(a * 10) % 2` 的通断——转场每推进 0.1 就切一次，
    // 实际约 10Hz 的白色频闪，是全项目最后一处真·高频闪烁（其余动效周期都 ≥1.5 秒）。
    // 改成一次性白闪：转场刚起最亮，进度 0.35 之前平滑褪干净。冲击感留着，频闪没了。
    const flash = a < 0.35 ? 0.5 * (1 - a / 0.35) : 0;
    if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.globalAlpha = Math.max(0, a * 1.6 - 0.6); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  }

  update(dt) {
    this.input.beginTick(dt);
    this.updateFade(dt);
    if (this.input.justPressed('mute')) { (this.state.settings ||= {}).mute = audio.toggleMute(); }
    if (!this.transitioning) this.scenes.update(dt);
    audio.playBgm(this.scenes.opaque()?.bgm ?? null);
    this.state.playTime = (this.state.playTime || 0) + dt;
  }

  render(alpha, stats) {
    const ctx = this.ctx;
    ctx.setTransform(ART, 0, 0, ART, 0, 0); // 之后所有绘制都用 256×224 逻辑坐标
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
    this.scenes.render(ctx, alpha);
    const f = this.fade;
    if (f.mosaic && f.dir === 1) this.renderMosaic(ctx, f.alpha);
    else if (f.alpha > 0) {
      ctx.globalAlpha = Math.min(1, f.alpha);
      ctx.fillStyle = f.color; ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    // 调试信息**不画在画面上**。原本是左上角一行青绿字（FPS 60 village (15,17) …），
    // 它压在游戏画面里、也会进每一张截图，导演明确要求拿掉。
    // 改写进分页标题：开发时瞄一眼标题栏就有，玩的人一个字都看不到。
    if (this.debug) {
      const info = `FPS ${stats.fps} ${this.scenes.top?.debugInfo?.() ?? ''}`.trim();
      if (info !== this._dbg) { this._dbg = info; document.title = `${TITLE} · ${info}`; }
    }
  }
}
