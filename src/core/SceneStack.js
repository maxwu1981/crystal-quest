// 场景栈：Field / Battle / Menu 都是场景。只有栈顶更新；渲染从最近的不透明场景开始往上画。
export class SceneStack {
  constructor() { this.scenes = []; }
  get top() { return this.scenes[this.scenes.length - 1]; }
  push(scene) { this.scenes.push(scene); scene.enter?.(); }
  pop() { const s = this.scenes.pop(); s?.exit?.(); this.top?.resume?.(); return s; }
  replace(scene) { const s = this.scenes.pop(); s?.exit?.(); this.push(scene); }
  clear() { while (this.scenes.length) this.scenes.pop().exit?.(); }
  // 渲染起点：栈顶往下第一个不透明场景（BGM 也跟着它）
  opaque() { let i = this.scenes.length - 1; while (i > 0 && this.scenes[i].transparent) i--; return this.scenes[i]; }
  update(dt) { this.top?.update(dt); }
  render(ctx, alpha) {
    let i = this.scenes.length - 1;
    while (i > 0 && this.scenes[i].transparent) i--;
    for (; i < this.scenes.length; i++) this.scenes[i].render(ctx, alpha);
  }
}
