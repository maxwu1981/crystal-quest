// 固定时间步长游戏循环：逻辑固定 tickRate Hz，渲染每帧一次。
export function startLoop({ update, render, tickRate = 60 }) {
  const step = 1000 / tickRate;
  let last = performance.now();
  let acc = 0;
  let frames = 0, fpsTimer = 0;
  const stats = { fps: 0 };

  function frame(now) {
    let delta = now - last;
    last = now;
    if (delta > 250) delta = 250; // 切后台回来不要狂追帧
    acc += delta;
    while (acc >= step) {
      update(step / 1000);
      acc -= step;
    }
    render(acc / step, stats);
    frames++; fpsTimer += delta;
    if (fpsTimer >= 1000) { stats.fps = frames; frames = 0; fpsTimer -= 1000; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return stats;
}
