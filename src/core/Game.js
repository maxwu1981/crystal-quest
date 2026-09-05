// 游戏总控：持有 canvas、输入、随机数、数据、场景栈、转场；由 main.js 创建。
import { Input } from './Input.js';
import { RNG } from './RNG.js';
import { SceneStack } from './SceneStack.js';
import { startLoop } from './loop.js';
import { drawText } from './text.js';
import { loadData } from '../data/loader.js';
import { buildSprites } from '../assets/sprites.js';
import { buildTiles } from '../assets/tiles.js';
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
  }

  fitCanvas() {
    const scale = Math.max(1, Math.floor(Math.min(innerWidth / this.W, (innerHeight - 24) / this.H)));
    this.canvas.style.width = this.W * scale + 'px';
    this.canvas.style.height = this.H * scale + 'px';
  }

  async boot() {
    this.data = await loadData();
    this.rng = new RNG(this.data.config.seed || (Date.now() >>> 0));
    this.sprites = buildSprites();
    this.tiles = buildTiles(new RNG(12345));
    this.state = newGameState(this.data);
    this.scenes.push(new TitleScene(this));
    this.loopStats = startLoop({
      update: dt => this.update(dt),
      render: (alpha, stats) => this.render(alpha, stats),
      tickRate: this.data.config.tickRate || 60,
    });
  }

  get transitioning() { return this.fade.dir !== 0; }

  // 淡出 → 执行 onMid（换场景）→ 淡入。转场期间场景冻结。
  fadeTo(onMid, { color = '#000', speed = 4 } = {}) {
    this.fade = { alpha: 0, dir: 1, speed, color, onMid };
  }
  updateFade(dt) {
    const f = this.fade;
    if (!f.dir) return;
    f.alpha += f.dir * f.speed * dt;
    if (f.dir === 1 && f.alpha >= 1) { f.alpha = 1; const fn = f.onMid; f.onMid = null; fn?.(); f.dir = -1; }
    else if (f.dir === -1 && f.alpha <= 0) { f.alpha = 0; f.dir = 0; }
  }

  startBattle(enemyIds, opts = {}) {
    this.fadeTo(() => this.scenes.push(new BattleScene(this, enemyIds, opts)), { color: '#fff', speed: 5 });
  }
  newGame() { this.loadState(newGameState(this.data)); }
  loadState(state) {
    this.state = state;
    this.scenes.clear();
    this.scenes.push(new FieldScene(this));
  }
  gameOver() {
    this.scenes.clear();
    this.scenes.push(new TitleScene(this));
  }

  update(dt) {
    this.input.beginTick(dt);
    this.updateFade(dt);
    if (!this.transitioning) this.scenes.update(dt);
    this.state.playTime = (this.state.playTime || 0) + dt;
  }

  render(alpha, stats) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
    this.scenes.render(ctx, alpha);
    if (this.fade.alpha > 0) {
      ctx.globalAlpha = Math.min(1, this.fade.alpha);
      ctx.fillStyle = this.fade.color; ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    if (this.debug) drawText(ctx, `FPS ${stats.fps} ${this.scenes.top?.debugInfo?.() ?? ''}`, 2, 2, { color: '#7cff7c' });
  }
}
