// 自动试玩：不靠真实按键和 requestAnimationFrame，直接同步步进 game.update()。
// 用法：打开游戏页面，在控制台执行  const t = await import('/tests/playtest.js'); await t.runAll()
// 回到地图场景（标题画面时先开新游戏）
export function toField(g) {
  if (!g.scenes.scenes.some(s => s.constructor.name === 'FieldScene')) g.newGame();
  while (g.scenes.top.constructor.name !== 'FieldScene') g.scenes.pop();
}

export function makeDriver(g) {
  const tick = n => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  const key = a => { g.input.queue.push(a); g.input.down.set(a, 0); tick(1); g.input.down.delete(a); tick(1); };
  return { tick, key };
}

// 打一场：法师优先放第一个魔法，其他人普攻。返回消息日志与结果。
export function playBattle(g, enemyIds, { strategy = 'attack' } = {}) {
  const { tick, key } = makeDriver(g);
  toField(g);
  g.startBattle(enemyIds);
  tick(120);
  const bs = g.scenes.top;
  if (bs.constructor.name !== 'BattleScene') throw new Error('战斗没有开始');
  const log = []; let last = ''; let safety = 0;
  while (g.scenes.top === bs && safety++ < 30000) {
    if (bs.msg && bs.msg !== last) { log.push(bs.msg.replace(/\n/g, ' / ')); last = bs.msg; }
    if (bs.phase === 'input') {
      const a = bs.current;
      if (bs.sub === 'main') {
        if (strategy === 'flee') { key('down'); key('down'); key('down'); if (a.spells.length) key('down'); key('confirm'); }
        else if (strategy === 'item' && a === bs.party[0] && bs.party[0].hp < bs.party[0].maxHp) { key('down'); key('down'); key('confirm'); }
        else if (a.spells.length && a.mp >= 4) { key('down'); key('confirm'); }
        else key('confirm');
      } else key('confirm'); // magic 列表 / 目标：都选第一个
    } else if (bs.phase === 'acting' && bs.wait === 'confirm') key('confirm');
    else tick(1);
  }
  tick(60); // 等淡入结束
  return { log, ticks: safety, ended: g.scenes.top !== bs, top: g.scenes.top.constructor.name, escaped: bs.escaped };
}

// 菜单流程：开菜单 → 道具 → 对 1 号用药水 → 存档 → 关闭
export function playMenu(g) {
  const { tick, key } = makeDriver(g);
  toField(g);
  const potionBefore = g.state.inventory.find(s => s.id === 'potion')?.qty || 0;
  g.state.party[0].hp = 1;
  key('cancel');
  const menuOpened = g.scenes.top.constructor.name === 'MenuScene';
  key('confirm');                       // 道具
  const itemOpened = g.scenes.top.constructor.name === 'ItemScene';
  key('confirm');                       // 药水 → 选目标
  key('confirm');                       // 用在 1 号
  const hpAfter = g.state.party[0].hp;
  key('cancel'); key('cancel');         // 回主菜单
  key('down'); key('down'); key('down'); key('confirm'); // 存档
  const saved = !!localStorage.getItem('crystal-quest-save');
  key('cancel');
  tick(5);
  return { menuOpened, itemOpened, potionBefore, potionAfter: g.state.inventory.find(s => s.id === 'potion')?.qty || 0, hpAfter, saved, top: g.scenes.top.constructor.name };
}

// 按住方向走 steps 格（遇到传送会提前结束）
export function walk(g, drv, dir, steps) {
  const st = g.state.map, mapId = st.id;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const tx = st.x + dx * steps, ty = st.y + dy * steps;
  g.input.down.set(dir, 0);
  for (let i = 0; i < steps * 12 + 20; i++) {
    drv.tick(1);
    if (g.state.map.id !== mapId) break;
    if (g.state.map.x === tx && g.state.map.y === ty) break;
  }
  g.input.down.delete(dir);
  for (let i = 0; i < 30 && (g.scenes.top.p?.moving || g.transitioning); i++) drv.tick(1);
  drv.tick(2);
}
export function skipDialogue(g, drv, max = 40) {
  let n = 0;
  while (g.scenes.top.constructor.name === 'DialogueScene' && n++ < max) { g.scenes.top.shown = 1e9; drv.tick(1); if (g.scenes.top.menu) break; drv.key('confirm'); }
}

// 村庄流程：走进村长家 → 对话 → 拿到任务和 100 金币 → 走出来
export function playVillage(g) {
  const drv = makeDriver(g); toField(g);
  const goldBefore = g.state.gold;
  walk(g, drv, 'left', 10); walk(g, drv, 'up', 2); drv.tick(40);
  const inside = g.state.map.id;
  walk(g, drv, 'up', 3);
  drv.key('confirm');
  const talked = g.scenes.top.constructor.name;
  skipDialogue(g, drv);
  const after = { questStarted: !!g.state.flags.questStarted, gold: g.state.gold, top: g.scenes.top.constructor.name };
  walk(g, drv, 'down', 4); drv.tick(40);
  return { goldBefore, inside, talked, ...after, backTo: g.state.map };
}

// 旅馆：直接调用 runInn（不用走路）
export function playInn(g) {
  const drv = makeDriver(g); toField(g);
  const f = g.scenes.top; g.state.gold = 50; g.state.party[0].hp = 1;
  f.runInn({ name: '旅馆' }, ['住吗？'], { price: 30 });
  skipDialogue(g, drv);
  const choicesShown = !!g.scenes.top.menu;
  drv.key('confirm'); drv.tick(150);           // 选「住宿」→ 淡入淡出 → 早安对话
  const wake = g.scenes.top.constructor.name;
  skipDialogue(g, drv);
  return { choicesShown, wake, gold: g.state.gold, hp0: g.state.party[0].hp, top: g.scenes.top.constructor.name };
}

// 商店：买一瓶药水再卖掉
export async function playShop(g) {
  const drv = makeDriver(g); toField(g);
  const { ShopScene } = await import('../src/field/ShopScene.js');
  g.state.gold = 100; const potions = g.state.inventory.find(s => s.id === 'potion')?.qty || 0;
  g.scenes.push(new ShopScene(g, { items: ['potion', 'dagger'] }, '测试商店'));
  drv.key('confirm'); drv.key('confirm');      // 购买 → 药水
  const afterBuy = { gold: g.state.gold, potions: g.state.inventory.find(s => s.id === 'potion')?.qty || 0 };
  drv.key('cancel'); drv.key('down'); drv.key('confirm'); drv.key('confirm'); // 出售 → 第一项
  const afterSell = { gold: g.state.gold, potions: g.state.inventory.find(s => s.id === 'potion')?.qty || 0 };
  drv.key('cancel'); drv.key('cancel'); // 回到根菜单再取消 = 离开
  return { potionsBefore: potions, afterBuy, afterSell, top: g.scenes.top.constructor.name };
}

export async function runAll(g = window.game) {
  const out = {};
  out.win = playBattle(g, ['goblin', 'goblin']);
  out.partyAfterWin = g.state.party.map(m => ({ name: m.name, level: m.level, exp: m.exp, hp: m.hp, mp: m.mp }));
  out.goldAfterWin = g.state.gold;
  out.flee = playBattle(g, ['slime'], { strategy: 'flee' });
  g.state.party[0].hp = 5;
  out.item = playBattle(g, ['goblin'], { strategy: 'item' });
  out.menu = playMenu(g);
  out.village = playVillage(g);
  out.inn = playInn(g);
  out.shop = await playShop(g);
  // 全灭：把队伍血量压到 1，对上两只狼
  for (const m of g.state.party) m.hp = 1;
  out.lose = playBattle(g, ['wolf', 'wolf']);
  out.stateAfterLose = { top: g.scenes.top.constructor.name, hp: g.state.party.map(m => m.hp), gold: g.state.gold };
  return out;
}
