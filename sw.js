// 本文件由 tools/gen_sw.py 生成，请勿手改。
// 改了 src/ data/ assets/ index.html 之后重新跑：python3 tools/gen_sw.py
//
// 策略：cache-first。这是个不联网的单机游戏，装好之后就该完全走本地，
// 每次都先问网络只会让弱网下开局卡住。资源变了靠版本号换缓存名来更新。
//
// 共 217 个文件，约 3.6 MB。
const VERSION = 'f1b700ce8995';
const CACHE = 'crystal-quest-' + VERSION;

const PRECACHE = [
  './',
  './assets/art/bg_cave.png',
  './assets/art/bg_deep.png',
  './assets/art/bg_plains.png',
  './assets/art/bg_shrine.png',
  './assets/art/char_boxer_down.png',
  './assets/art/char_boxer_down_walk.png',
  './assets/art/char_boxer_left.png',
  './assets/art/char_boxer_left_walk.png',
  './assets/art/char_boxer_up.png',
  './assets/art/char_boxer_up_walk.png',
  './assets/art/char_elder_down.png',
  './assets/art/char_general_down.png',
  './assets/art/char_general_down_walk.png',
  './assets/art/char_general_left.png',
  './assets/art/char_general_left_walk.png',
  './assets/art/char_general_up.png',
  './assets/art/char_general_up_walk.png',
  './assets/art/char_guard_down.png',
  './assets/art/char_herbwife_down.png',
  './assets/art/char_herbwife_down_walk.png',
  './assets/art/char_herbwife_left.png',
  './assets/art/char_herbwife_left_walk.png',
  './assets/art/char_herbwife_up.png',
  './assets/art/char_herbwife_up_walk.png',
  './assets/art/char_hunter_down.png',
  './assets/art/char_hunter_down_walk.png',
  './assets/art/char_hunter_left.png',
  './assets/art/char_hunter_left_walk.png',
  './assets/art/char_hunter_up.png',
  './assets/art/char_hunter_up_walk.png',
  './assets/art/char_innkeeper_down.png',
  './assets/art/char_kid_down.png',
  './assets/art/char_man_down.png',
  './assets/art/char_man_left.png',
  './assets/art/char_merchant_down.png',
  './assets/art/char_peddler_down.png',
  './assets/art/char_peddler_down_walk.png',
  './assets/art/char_peddler_left.png',
  './assets/art/char_peddler_left_walk.png',
  './assets/art/char_peddler_up.png',
  './assets/art/char_peddler_up_walk.png',
  './assets/art/char_talisman_down.png',
  './assets/art/char_talisman_down_walk.png',
  './assets/art/char_talisman_left.png',
  './assets/art/char_talisman_left_walk.png',
  './assets/art/char_talisman_up.png',
  './assets/art/char_talisman_up_walk.png',
  './assets/art/char_tangki_down.png',
  './assets/art/char_tangki_down_walk.png',
  './assets/art/char_tangki_left.png',
  './assets/art/char_tangki_left_walk.png',
  './assets/art/char_tangki_up.png',
  './assets/art/char_tangki_up_walk.png',
  './assets/art/char_woman_down.png',
  './assets/art/enemy_bat.png',
  './assets/art/enemy_bee.png',
  './assets/art/enemy_darkslime.png',
  './assets/art/enemy_earthox.png',
  './assets/art/enemy_ghost.png',
  './assets/art/enemy_goblin.png',
  './assets/art/enemy_knight.png',
  './assets/art/enemy_mandrake.png',
  './assets/art/enemy_muntjac.png',
  './assets/art/enemy_paperkid.png',
  './assets/art/enemy_skeleton.png',
  './assets/art/enemy_slime.png',
  './assets/art/enemy_stinkbug.png',
  './assets/art/enemy_tigergran.png',
  './assets/art/enemy_viper.png',
  './assets/art/enemy_wolf.png',
  './assets/art/manifest.json',
  './assets/art/tile_altar.png',
  './assets/art/tile_arch_door.png',
  './assets/art/tile_bed.png',
  './assets/art/tile_bridge.png',
  './assets/art/tile_carpet.png',
  './assets/art/tile_cave_entrance.png',
  './assets/art/tile_cave_floor.png',
  './assets/art/tile_cave_wall.png',
  './assets/art/tile_chest.png',
  './assets/art/tile_chest_open.png',
  './assets/art/tile_counter.png',
  './assets/art/tile_crate.png',
  './assets/art/tile_crystal.png',
  './assets/art/tile_door.png',
  './assets/art/tile_flagstone.png',
  './assets/art/tile_floor.png',
  './assets/art/tile_forest.png',
  './assets/art/tile_glowstone.png',
  './assets/art/tile_grass.png',
  './assets/art/tile_idol.png',
  './assets/art/tile_mountain.png',
  './assets/art/tile_ore_vein.png',
  './assets/art/tile_path.png',
  './assets/art/tile_pillar.png',
  './assets/art/tile_plank.png',
  './assets/art/tile_roof.png',
  './assets/art/tile_rubble.png',
  './assets/art/tile_sand.png',
  './assets/art/tile_sarcophagus.png',
  './assets/art/tile_seal_stone.png',
  './assets/art/tile_stairs_down.png',
  './assets/art/tile_stairs_up.png',
  './assets/art/tile_stone_wall.png',
  './assets/art/tile_stove.png',
  './assets/art/tile_throne.png',
  './assets/art/tile_town.png',
  './assets/art/tile_tree.png',
  './assets/art/tile_wall.png',
  './assets/art/tile_water.png',
  './assets/fonts/fusion-pixel-12px-proportional-latin.otf.woff2',
  './assets/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './data/config.json',
  './data/encounters.json',
  './data/enemies.json',
  './data/items.json',
  './data/jobs.json',
  './data/lore.json',
  './data/maps/bogong.json',
  './data/maps/cave_1.json',
  './data/maps/cave_2.json',
  './data/maps/cave_3.json',
  './data/maps/fort_ailiao.json',
  './data/maps/gen_castle_1.json',
  './data/maps/gen_castle_2.json',
  './data/maps/gen_cave_1.json',
  './data/maps/gen_mine_1.json',
  './data/maps/gen_temple_1.json',
  './data/maps/gen_tomb_1.json',
  './data/maps/house_elder.json',
  './data/maps/house_hakka.json',
  './data/maps/inn.json',
  './data/maps/overworld.json',
  './data/maps/shop.json',
  './data/maps/tomb_wanjin.json',
  './data/maps/village.json',
  './data/party.json',
  './data/spells.json',
  './data/story.json',
  './data/summons.json',
  './index.html',
  './manifest.webmanifest',
  './src/assets/art.js',
  './src/assets/enemyArt.js',
  './src/assets/equip.js',
  './src/assets/itemIcon.js',
  './src/assets/sprites.js',
  './src/assets/terrain.js',
  './src/assets/terrainBake.js',
  './src/assets/terrainBits.js',
  './src/assets/terrainDeco.js',
  './src/assets/tiles.js',
  './src/battle/BattleScene.js',
  './src/battle/actions.js',
  './src/battle/actors.js',
  './src/battle/ai.js',
  './src/battle/autoBattle.js',
  './src/battle/backdrop.js',
  './src/battle/backdropDraw.js',
  './src/battle/backdropKit.js',
  './src/battle/effects.js',
  './src/battle/elements.js',
  './src/battle/formulas.js',
  './src/battle/fxKit.js',
  './src/battle/hud.js',
  './src/battle/hudBits.js',
  './src/battle/render.js',
  './src/battle/spellFx.js',
  './src/battle/spellFxCold.js',
  './src/battle/spellFxSky.js',
  './src/battle/spellFxVoid.js',
  './src/battle/summonFx.js',
  './src/battle/summonFxAlly.js',
  './src/battle/summonFxFinale.js',
  './src/battle/summonFxWar.js',
  './src/battle/summonKit.js',
  './src/battle/victory.js',
  './src/core/Game.js',
  './src/core/Input.js',
  './src/core/RNG.js',
  './src/core/SceneStack.js',
  './src/core/audio.js',
  './src/core/draw.js',
  './src/core/loop.js',
  './src/core/text.js',
  './src/data/loader.js',
  './src/field/FieldScene.js',
  './src/field/ShopScene.js',
  './src/field/ambience.js',
  './src/field/grid.js',
  './src/field/minimap.js',
  './src/field/npc.js',
  './src/game/items.js',
  './src/game/jobskill.js',
  './src/game/party.js',
  './src/game/shop.js',
  './src/game/state.js',
  './src/game/status.js',
  './src/main.js',
  './src/menu/EquipScene.js',
  './src/menu/ItemScene.js',
  './src/menu/JobScene.js',
  './src/menu/MenuScene.js',
  './src/menu/SettingsScene.js',
  './src/menu/StatusScene.js',
  './src/menu/common.js',
  './src/menu/icons.js',
  './src/pwa.js',
  './src/title/EndingScene.js',
  './src/title/TitleScene.js',
  './src/touch.js',
  './src/ui/DialogueScene.js',
  './src/ui/Menu.js',
  './src/ui/Window.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个 put，不用 cache.addAll()：addAll 只要有一个文件 404，整批就失败，
    // service worker 装不上 = 一点都不能离线。宁可缺一张图也要先装上。
    // cache: 'reload' 绕开 HTTP 缓存，确保存进去的是服务器上的当前版本。
    const results = await Promise.allSettled(PRECACHE.map(async url => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(res.status + ' ' + url);
      await cache.put(url, res);
    }));
    const bad = results.filter(r => r.status === 'rejected');
    if (bad.length) console.warn('[sw] 有资源没缓存上：', bad.map(r => String(r.reason)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 版本号变了 → 缓存名变了 → 把本站所有旧版本缓存删掉，不然手机上会越积越多
    for (const k of await caches.keys()) {
      if (k.startsWith('crystal-quest-') && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;  // 外链交给浏览器自己处理

  e.respondWith((async () => {
    // 导航请求：**先按真实路径找**，取不到才回首页。
    //
    // 原本是「一律回首页」——那是 SPA 的写法，而这个项目不是 SPA：
    // `/tests/` 是一张独立的测试页（浏览器内跑 53 条单元测试）。
    // 无条件兜底会让装过 SW 的浏览器再也打不开它，将来新增任何页面同样被吞。
    // ignoreSearch 是关键：`?debug` 不能让缓存查不中。
    if (req.mode === 'navigate') {
      const exact = await caches.match(req, { ignoreSearch: true });
      if (exact) return exact;
      try { const net = await fetch(req); if (net.ok) return net; } catch { /* 断网，往下走兜底 */ }
      const home = await caches.match('./index.html', { ignoreSearch: true })
                || await caches.match('./', { ignoreSearch: true });
      if (home) return home;
    }

    const hit = await caches.match(req);
    if (hit) return hit;

    // 清单没覆盖到的同源文件：正常取，顺手存一份，下次断网也有
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  })());
});
