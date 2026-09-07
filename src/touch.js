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
// 排版：**横屏**，画面按高度铺满，十字键与 A/B 半透明浮在画面两侧下角。
//
// 原来是竖屏：画面顶到上面、按键排在下面的黑边里，互不重叠。改横屏是因为
// 这是个 8:7 的画面，竖屏手机上它只能占屏幕上面 40%，下面一大半是黑的；
// 横过来按高度铺满，画面就大了两倍不止。代价是没有黑边留给按键了，
// 所以按键改成半透明浮在画面上——19.5:9 的屏幕放 8:7 的画面，
// 左右各留一条黑边，按键落在最外侧，实际压到画面上的只有一点点。

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

// 调试按钮：只在网址带 ?debug 时挂上去。手机上没有键盘，H（全队回满）按不到——
// 导演在手机上试玩时打完一场没法回血。正式游戏里这两个按钮一个都不会出现。
const DEBUG_HTML = `
<div class="tp tp-dbg">
  <div class="tp-s" data-a="debugHeal">血</div>
  <div class="tp-s" data-a="debugBattle">战</div>
</div>`;

const CSS = `
/* 画面保持居中铺满（index.html 的 flex 居中），按键浮在它上面——
   横屏下没有黑边可以放按键了，见文件头。 */
#tpad { position:fixed; inset:0; pointer-events:none; z-index:5;
  touch-action:none; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
#tpad .tp { position:absolute; pointer-events:auto; }
/* 十字键：左下角，尺寸跟着屏幕宽走但夹在 132–190px，太小按不准、太大占画面 */
/* 十字键：贴最左下角。尺寸跟着**屏幕高度**走而不是宽度——横屏时宽度是长边，
   按 vw 算会大得离谱（19.5:9 的手机上 42vw ≈ 340px，半个画面就没了）。 */
#tpad .tp-dpad { left:max(6px, env(safe-area-inset-left)); bottom:max(8px, env(safe-area-inset-bottom));
  width:clamp(112px, 34vh, 168px); aspect-ratio:1; }
#tpad .tp-b { position:absolute; border-radius:12px;
  background:rgba(20,34,28,0.34); border:2px solid rgba(214,190,120,0.42); box-sizing:border-box;
  backdrop-filter:blur(1px); }
/* 箭头本身反而要**比底板更实**：底板压得再淡，方向指示也得一眼看清 */
#tpad .tp-b::after { content:''; position:absolute; inset:38%; border-radius:2px; background:rgba(240,232,200,0.85); }
#tpad .tp-b.on { background:rgba(78,124,96,0.78); border-color:rgba(245,228,160,0.95); }
#tpad .tp-hub { position:absolute; left:33.3%; top:33.3%; width:33.4%; height:33.4%;
  border-radius:8px; background:rgba(20,34,28,0.28); }
/* A/B：右下角，A 大一点、位置更低，拇指自然落点 */
#tpad .tp-btns { right:max(6px, env(safe-area-inset-right)); bottom:max(12px, env(safe-area-inset-bottom));
  width:clamp(118px, 34vh, 172px); height:clamp(84px, 24vh, 120px); }
#tpad .tp-r { position:absolute; display:flex; align-items:center; justify-content:center;
  border-radius:50%; box-sizing:border-box; font:600 20px/1 system-ui, sans-serif; color:rgba(240,232,200,0.92);
  background:rgba(20,34,28,0.34); border:2px solid rgba(214,190,120,0.42); backdrop-filter:blur(1px);
  text-shadow:0 1px 2px rgba(0,0,0,0.6); }
#tpad .tp-r[data-a="cancel"] { right:52%; top:0; width:clamp(52px,15vh,70px); aspect-ratio:1; }
#tpad .tp-a { right:0; bottom:0; width:clamp(60px,17vh,80px); aspect-ratio:1;
  border-color:rgba(232,196,110,0.7); }
#tpad .tp-r.on { background:rgba(78,124,96,0.78); border-color:rgba(245,228,160,0.95); }
/* 右上角两个小钮：全图 / 静音。做小、做淡——它们不该跟主操作抢注意力 */
#tpad .tp-top { right:max(10px, env(safe-area-inset-right)); top:calc(10px + env(safe-area-inset-top)); display:flex; gap:8px; }
#tpad .tp-s { width:38px; height:38px; display:flex; align-items:center; justify-content:center;
  border-radius:9px; font:500 14px/1 system-ui, sans-serif; color:rgba(226,214,170,0.75);
  background:rgba(20,34,28,0.32); border:1px solid rgba(214,190,120,0.34); }
#tpad .tp-s.on { background:rgba(78,124,96,0.8); }
/* 调试按钮挂在左上角，跟右上角的图/音分开——免得手忙脚乱按错 */
#tpad .tp-dbg { left:max(10px, env(safe-area-inset-left)); top:calc(10px + env(safe-area-inset-top)); display:flex; gap:8px; }
#tpad .tp-dbg .tp-s { color:rgba(232,176,120,0.75); border-color:rgba(200,140,80,0.45); }
/* 竖屏提示：盖住整个屏幕。不做「竖屏也能玩」的第二套排版——见 relayout 那段 */
#tprot { position:fixed; inset:0; z-index:9; display:none; align-items:center; justify-content:center;
  background:#0d1410; color:#e2d6aa; text-align:center; font:600 17px/1.9 system-ui, sans-serif; }
#tprot.on { display:flex; }
#tprot small { display:block; font-weight:400; font-size:13px; color:#8d8674; }
/* 用字符本身而不是 CSS 的 \\21BB 转义：这段 CSS 是写在模板串里的，
   模板串里 \\21 会被 JS 当成八进制转义，整个模块直接 SyntaxError 挂掉 */
#tprot div::before { content:'↻'; display:block; font-size:44px; line-height:1.4; color:#c4a85a; }`;

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

  const pad = document.createElement('div');
  pad.id = 'tpad';
  // ?debug 时多挂两个调试按钮（回血 / 强制遇敌）——手机上没键盘，H 和 B 按不到
  pad.innerHTML = HTML + (new URLSearchParams(location.search).has('debug') ? DEBUG_HTML : '');
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

  // 竖屏提示。横屏是这个游戏在手机上唯一合理的姿势：画面是 8:7 的，
  // 竖屏时按宽度铺满也只占屏幕上面 40%，剩下一大半是黑的，字还小得看不清。
  // 与其做两套排版，不如请玩家转一下——PWA 装到桌面后 manifest 会直接锁横屏，
  // 这个提示只对「在浏览器里直接打开」的情况有用。
  const rotate = document.createElement('div');
  rotate.id = 'tprot';
  rotate.innerHTML = '<div>请把手机横过来<small>横屏才放得下整个画面</small></div>';
  document.body.appendChild(rotate);

  const relayout = () => {
    measure();
    // 竖屏时盖上提示。用宽高比判断而不是 screen.orientation：
    // 后者在 iPad 分屏和桌面浏览器缩窄窗口时都会说谎
    rotate.classList.toggle('on', innerHeight > innerWidth * 1.05);
  };
  relayout();
  addEventListener('resize', relayout);
  addEventListener('orientationchange', () => setTimeout(relayout, 250));

  return { pad, measure, relayout };
}
