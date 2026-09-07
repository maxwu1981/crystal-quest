// 注册 service worker（离线缓存 + 装到手机主屏幕）。和游戏本体完全解耦：
// index.html 里单独一个 <script type="module">，main.js 不 import 它，
// 这里出任何问题都不该影响游戏跑起来。
//
// 三种「装不上」的情况，全部当正常情况静静跳过，不弹错、不打红字：
//   ① file:// 直接双击 index.html —— 没有 origin，service worker 天生不可用
//      （其实 ES Module 本来也跑不了，README 已经说了要起 http 服务）
//   ② http://192.168.x.x —— 局域网 http 不是 secure context，浏览器会拒绝注册。
//      这不是坏了：同一个 Wi-Fi 下直接玩本来就不需要离线缓存，
//      只是装不了主屏幕。要装主屏幕得走 https（见 docs/手机上玩.md）。
//   ③ 老浏览器 / 隐私模式关掉了 service worker。
// localhost 和 127.0.0.1 被浏览器特批为 secure context，所以本机开发是能注册的，
// 可以在电脑上先验证离线效果再往手机上装。

// **本机开发时不注册，还会把已经装上的注销掉。**
// service worker 是 cache-first 的：一旦装上，改了源码刷新页面也纹丝不动，
// 因为发给你的是缓存里那份。实测踩过——改完 TitleScene 的操作提示，
// 页面上还是旧文案，查了半天才发现是 SW 在发旧文件。
// 每个在这个项目上开发的人都会撞到这一下，所以在源头挡掉：
// localhost / 127.0.0.1 一律跳过；要专门验证离线与主屏幕效果就加 `?pwa`。
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  && !location.search.includes('pwa');
if (DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  caches?.keys().then(ks => ks.forEach(k => caches.delete(k)));
}

if (!DEV && 'serviceWorker' in navigator && self.isSecureContext) {
  // **新版本装好之后自动刷新一次。**
  //
  // sw.js 是 cache-first，install 里已经 skipWaiting、activate 里已经 clients.claim，
  // 可是这些都发生在**页面已经用旧缓存渲染完之后**——新 SW 接管了，屏幕上还是旧的。
  // 结果是：发布之后导演打开 App 看到的是旧版，要**关掉再开一次**才会变。
  // 他不会知道要这么做，只会说「改了跟没改一样」。这件事真的发生过（见 CLAUDE.md 的验收那节）。
  //
  // controllerchange 正是「新 SW 接管了这一页」的信号，收到就重载一次。
  // 加锁是因为它可能连着派两次（skipWaiting + claim），不挡住会变成刷新循环。
  // **要在这里就记下来**：controllerchange 派发的时候 controller 已经换成新的了，
  // 那时候再去读它，首次安装和版本更新看起来一模一样。要分清只能看**页面加载那一刻**
  // 有没有 controller——有，说明这一页是旧缓存渲染的，该刷；没有，是全新访客，
  // 手上本来就是最新的文件，刷新纯属白闪一下。
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });

  // 等 load 之后再注册：预缓存要下 2.5MB，和开局加载抢带宽的话首屏会变慢。
  // 反正第一次访问用不上缓存，晚几百毫秒毫无损失。
  addEventListener('load', () => {
    // sw.js 在仓库根目录，pwa.js 在 src/ 下。用 import.meta.url 算相对路径，
    // 部署到 user.github.io/仓库名/ 这种子目录时也能指对；顺带把 scope 定在根目录，
    // 整个游戏都归它管。
    const url = new URL('../sw.js', import.meta.url);
    navigator.serviceWorker.register(url, { scope: new URL('./', url) })
      .then(reg => {
        if (location.search.includes('debug')) console.log('[pwa] 已注册，scope =', reg.scope);
        // 装成主屏幕 App 之后，页面可能几天都不重新加载一次，浏览器也就不会去问
        // 有没有新版。每次回到前台主动查一遍——查到新的就走上面那条自动刷新。
        const check = () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); };
        addEventListener('visibilitychange', check);
        check();
      })
      .catch(err => console.warn('[pwa] service worker 没注册上（不影响游戏）：', err.message));
  });
}
