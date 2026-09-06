// 手机触控操作：屏幕上的十字键与按钮。
//
// **为什么要有**：游戏原本只监听键盘，手机上打开能显示、完全不能操作——
// 这是「放到手机上玩」唯一真正的拦路虎，PWA 封装和部署都绕不过它。
//
// 做法上有两个决定值得说：
//
// ① **不画在 canvas 上，用 DOM 覆盖层。** 画进 canvas 就得进渲染循环，
//    每帧多画十几个矩形，还要自己处理命中测试与按下态。用 DOM 的话浏览器
//    替我们做完了这些，而且按键落在画面外的黑边上，不遮挡游戏本身。
//
// ② **按下/松开一律走 Input.press / Input.release**，和键盘同一条路径。
//    另起一套状态机就会有「只有手机上才有的 bug」，那种最难查。
//
// 命中测试是自己做的而不是靠每个按钮各挂事件：手指在十字键上**滑动**换方向
// （从「上」滑到「右」）是拇指操作的常态，靠 touchstart/touchend 分别绑在
// 各个按钮上处理不了——滑出去时不会触发离开的那个按钮的 touchend。
// 所以统一在容器上收 touchstart/touchmove/touchend，每次都把全部活动触点
// 重新命中一遍，算出「现在按住哪些动作」，再和上一帧比较做增量。
//
// 排版：十字键在左下、A/B 在右下，中间留空——两个拇指各占一边，
// 谁也不会挡住画面下缘的对话框。

const HTML = `
<div class="tp tp-dpad">
  <div class="tp-b" data-a="up"    style="left:33.3%;top:0;width:33.4%;height:33.4%"></div>
  <div class="tp-b" data-a="left"  style="left:0;top:33.3%;width:33.4%;height:33.4%"></div>
  <div class="tp-b" data-a="right" style="left:66.6%;top:33.3%;width:33.4%;height:33.4%"></div>
  <div class="tp-b" data-a="down"  style="left:33.3%;top:66.6%;width:33.4%;height:33.4%"></div>
  <div class="tp-hub"></div>
</div>
<div class="tp tp-btns">
  <div class="tp-r" data-a="cancel">B</div>
  <div class="tp-r tp-a" data-a="confirm">A</div>
</div>
<div class="tp tp-top">
  <div class="tp-s" data-a="map">图</div>
  <div class="tp-s" data-a="mute">音</div>
</div>`;

const CSS = `
/* 手机上把画面顶到上方：body 默认是上下居中，那会在画面上方空出一大块黑，
   而按键在下面——中间那段既没内容也按不到。顶上去之后画面和按键各据一端。 */
body.tpad-on { align-items: flex-start; padding-top: calc(8px + env(safe-area-inset-top)); }
#tpad { position:fixed; inset:0; pointer-events:none; z-index:5;
  touch-action:none; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
#tpad .tp { position:absolute; pointer-events:auto; }
/* 十字键：左下角，尺寸跟着屏幕宽走但夹在 132–190px，太小按不准、太大占画面 */
#tpad .tp-dpad { left:max(12px, env(safe-area-inset-left)); bottom:var(--tp-bottom, 14px);
  width:clamp(132px, 42vw, 190px); aspect-ratio:1; }
#tpad .tp-b { position:absolute; border-radius:12px;
  background:rgba(26,45,37,0.72); border:2px solid rgba(196,168,90,0.55); box-sizing:border-box; }
#tpad .tp-b::after { content:''; position:absolute; inset:38%; border-radius:2px; background:rgba(226,214,170,0.75); }
#tpad .tp-b.on { background:rgba(70,110,88,0.92); border-color:rgba(240,220,150,0.95); }
#tpad .tp-hub { position:absolute; left:33.3%; top:33.3%; width:33.4%; height:33.4%;
  border-radius:8px; background:rgba(26,45,37,0.5); }
/* A/B：右下角，A 大一点、位置更低，拇指自然落点 */
#tpad .tp-btns { right:max(12px, env(safe-area-inset-right)); bottom:calc(var(--tp-bottom, 14px) + 8px);
  width:clamp(140px, 40vw, 190px); height:clamp(96px, 28vw, 130px); }
#tpad .tp-r { position:absolute; display:flex; align-items:center; justify-content:center;
  border-radius:50%; box-sizing:border-box; font:600 20px/1 system-ui, sans-serif; color:rgba(226,214,170,0.9);
  background:rgba(26,45,37,0.72); border:2px solid rgba(196,168,90,0.55); }
#tpad .tp-r[data-a="cancel"] { right:52%; top:0; width:clamp(56px,17vw,74px); aspect-ratio:1; }
#tpad .tp-a { right:0; bottom:0; width:clamp(66px,20vw,86px); aspect-ratio:1;
  border-color:rgba(220,180,90,0.8); }
#tpad .tp-r.on { background:rgba(70,110,88,0.92); border-color:rgba(240,220,150,0.95); }
/* 右上角两个小钮：全图 / 静音。做小、做淡——它们不该跟主操作抢注意力 */
#tpad .tp-top { right:max(10px, env(safe-area-inset-right)); top:calc(10px + env(safe-area-inset-top)); display:flex; gap:8px; }
#tpad .tp-s { width:38px; height:38px; display:flex; align-items:center; justify-content:center;
  border-radius:9px; font:500 14px/1 system-ui, sans-serif; color:rgba(226,214,170,0.75);
  background:rgba(26,45,37,0.6); border:1px solid rgba(196,168,90,0.4); }
#tpad .tp-s.on { background:rgba(70,110,88,0.9); }`;

// 触控设备才装。用 pointer:coarse 而不是 'ontouchstart' in window：
// 后者在带触摸屏的笔记本上也为真，会给鼠标用户平白扣掉半个屏幕。
export function isTouch() {
  return matchMedia('(pointer: coarse)').matches;
}

// 界面上的操作提示要跟着输入方式变：手机上写「Z 确认」是没有意义的。
// 放在这里而不是各场景各写一份——六处提示分散在标题页、装备、名册、设置、转职里，
// 分开写就一定会漏掉一两处。
const LABEL = { confirm: ['Z', 'A'], cancel: ['X', 'B'], map: ['Tab', '图'] };
export const key = a => (LABEL[a] || ['?', '?'])[isTouch() ? 1 : 0];

export function installTouch(game) {
  if (!isTouch() || document.getElementById('tpad')) return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  document.body.classList.add('tpad-on');
  const pad = document.createElement('div');
  pad.id = 'tpad';
  pad.innerHTML = HTML;
  document.body.appendChild(pad);

  const btns = [...pad.querySelectorAll('[data-a]')];
  const held = new Set();          // 当前按住的动作
  const rects = new Map();         // 按钮 → 屏幕矩形（尺寸变了才重算）
  const measure = () => { for (const b of btns) rects.set(b, b.getBoundingClientRect()); };
  measure();
  addEventListener('resize', measure);
  addEventListener('orientationchange', () => setTimeout(measure, 200));

  const hit = (x, y) => {
    for (const b of btns) {
      const r = rects.get(b);
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b;
    }
    return null;
  };

  // 每次触点变化都整体重算一遍「现在按住哪些」，再和上一次比较做增量。
  // 逐按钮绑事件做不到这一点：手指从「上」滑到「右」时，「上」不会收到 touchend。
  const sync = ev => {
    ev.preventDefault();
    const now = new Set();
    for (const t of ev.touches) {
      const b = hit(t.clientX, t.clientY);
      if (b) now.add(b.dataset.a);
    }
    for (const a of held) if (!now.has(a)) game.input.release(a);
    for (const a of now) if (!held.has(a)) game.input.press(a);
    held.clear(); for (const a of now) held.add(a);
    for (const b of btns) b.classList.toggle('on', now.has(b.dataset.a));
  };

  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    pad.addEventListener(type, sync, { passive: false });
  }
  // 切到后台时手指状态会丢，不清掉会一直朝那个方向走
  addEventListener('blur', () => { for (const a of held) game.input.release(a); held.clear(); measure(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const a of held) game.input.release(a); held.clear(); } });

  const dpad = pad.querySelector('.tp-dpad');

  // 按键区不贴屏幕底，而是**在画面下方的剩余空间里居中**。
  // 竖屏手机上画面只占上面 40%（256:224 的比例，铺满宽度就到顶了），
  // 贴底的话中间会空出三四百像素纯黑——既没内容也按不到，
  // 而拇指还得往下够。居中之后按键落在拇指自然的位置上。
  const place = () => {
    const cv = game.canvas.getBoundingClientRect();
    const h = dpad.getBoundingClientRect().height;
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
    const free = innerHeight - cv.bottom;                 // 画面下方还剩多少
    const bottom = Math.max(14, Math.round((free - h) / 2));
    pad.style.setProperty('--tp-bottom', bottom + 'px');
  };

  // fitCanvas 要知道给按键留多少：十字键高度 + 上下各一点余量
  const padH = () => Math.round(dpad.getBoundingClientRect().height + 48);
  const relayout = () => { game.touchPad = padH(); game.fitCanvas?.(); measure(); place(); };
  relayout();
  addEventListener('resize', relayout);
  addEventListener('orientationchange', () => setTimeout(relayout, 250));

  return { pad, measure, relayout };
}
