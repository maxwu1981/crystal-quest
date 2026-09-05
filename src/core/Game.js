// 游戏总控：持有 canvas、输入、随机数、数据、场景栈、转场；由 main.js 创建。
import { Input } from './Input.js';
import { RNG } from './RNG.js';
import { SceneStack } from './SceneStack.js';
import { startLoop } from './loop.js';
import { drawText, initFont } from './text.js';
import { audio } from './audio.js';
import { loadData } from '../data/loader.js';
import { buildSprites } from '../assets/sprites.js';
import { buildTiles } from '../assets/tiles.js';
import { loadArt } from '../assets/art.js';
import { newGameState } from '../game/state.js';
import { FieldScene } from '../field/FieldScene.js';
import { BattleScene } from '../battle/BattleScene.js';
import { TitleScene } from '../title/TitleScene.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.W = canvas.width; this.H = canvas.height;
    this.input = new Input();
    this.scenes = new SceneStack();
    this.fade = { alpha: 0, dir: 0, speed: 4, color: '#000', onMid: null };
    this.debug = new URLSearchParams(location.search).has('debug');
    this.fitCanvas();
    window.addEventListener('resize', () => this.fitCanvas());
    window.addEventListener('keydown', () => audio.ensure()); // 浏览器要求用户交互后才能出声
  }

  fitCanvas() {
    const scale = Math.max(1, Math.floor(Math.min(innerWidth / this.W, (innerHeight - 24) / this.H)));
    this.canvas.style.width = this.W * scale + 'px';
    this.canvas.style.height = this.H * scale + 'px';
  }

  async boot() {
    this.data = await loadData();
    this.pixelFont = await initFont();
    this.rng = new RNG(this.data.config.seed || (Date.now() >>> 0));
    this.rngFx = new RNG(99); // 纯装饰用（NPC 闲逛等），不影响战斗/遇敌
    this.sprites = buildSprites();
    this.tiles = buildTiles(new RNG(12345));
    this.artCount = await loadArt(this.sprites, this.tiles); // 有 assets/art/ 正式美术就覆盖占位图
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
    if (mosaic) { // 马赛克转场：先把当前画面存下来
      this.snap ??= document.createElement('canvas'); this.snap.width = this.W; this.snap.height = this.H;
      this.snap.getContext('2d').drawImage(this.canvas, 0, 0);
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
    if (a < 0.6 && Math.floor(a * 10) % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, 0, W, H); }
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
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
    this.scenes.render(ctx, alpha);
    const f = this.fade;
    if (f.mosaic && f.dir === 1) this.renderMosaic(ctx, f.alpha);
    else if (f.alpha > 0) {
      ctx.globalAlpha = Math.min(1, f.alpha);
      ctx.fillStyle = f.color; ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    if (this.debug) drawText(ctx, `FPS ${stats.fps} ${this.scenes.top?.debugInfo?.() ?? ''}`, 2, 2, { color: '#7cff7c' });
  }
}
