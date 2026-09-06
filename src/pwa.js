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

if ('serviceWorker' in navigator && self.isSecureContext) {
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
      })
      .catch(err => console.warn('[pwa] service worker 没注册上（不影响游戏）：', err.message));
  });
}
