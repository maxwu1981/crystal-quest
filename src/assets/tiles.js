// 程序生成的 16×16 占位瓦片。换正式素材时：把这里改成从 PNG 图集切图即可。
export const TILE = 16;

function fill(ctx, c) { ctx.fillStyle = c; ctx.fillRect(0, 0, TILE, TILE); }
function scatter(ctx, rng, n, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rng.int(0, 15), rng.int(0, 15), 1, 1);
}
function hlines(ctx, ys, color) { ctx.fillStyle = color; for (const y of ys) ctx.fillRect(0, y, TILE, 1); }

const DRAW = {
  grass(ctx, rng) { fill(ctx, '#5cb85c'); scatter(ctx, rng, 10, '#4e9f4e'); scatter(ctx, rng, 5, '#72c872'); },
  path(ctx, rng) { fill(ctx, '#d2b47a'); scatter(ctx, rng, 8, '#c19d5f'); scatter(ctx, rng, 3, '#e0c58f'); },
  tree(ctx, rng) {
    DRAW.grass(ctx, rng);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(6, 10, 4, 6);
    ctx.fillStyle = '#1b5e20'; ctx.fillRect(2, 3, 12, 9); ctx.fillRect(4, 1, 8, 2); ctx.fillRect(1, 5, 14, 5);
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(4, 3, 6, 4); ctx.fillRect(3, 7, 4, 2);
  },
  water(ctx) {
    fill(ctx, '#2f7fd6');
    ctx.fillStyle = '#6ab0f0'; ctx.fillRect(2, 4, 5, 1); ctx.fillRect(9, 10, 5, 1); ctx.fillRect(1, 12, 3, 1); ctx.fillRect(11, 2, 3, 1);
  },
  wall(ctx) {
    fill(ctx, '#bdbdbd'); hlines(ctx, [3, 7, 11, 15], '#8d8d8d');
    ctx.fillStyle = '#8d8d8d';
    ctx.fillRect(4, 0, 1, 3); ctx.fillRect(12, 0, 1, 3); ctx.fillRect(8, 4, 1, 3);
    ctx.fillRect(4, 8, 1, 3); ctx.fillRect(12, 8, 1, 3); ctx.fillRect(8, 12, 1, 3);
  },
  roof(ctx) { fill(ctx, '#c62828'); hlines(ctx, [3, 7, 11, 15], '#8e1b1b'); hlines(ctx, [0, 4, 8, 12], '#e05353'); },
  door(ctx) { DRAW.wall(ctx); ctx.fillStyle = '#4e342e'; ctx.fillRect(4, 3, 8, 13); ctx.fillStyle = '#ffca28'; ctx.fillRect(10, 10, 1, 1); },
  floor(ctx) { fill(ctx, '#a1887f'); hlines(ctx, [3, 7, 11, 15], '#795548'); },
  counter(ctx) { DRAW.floor(ctx); ctx.fillStyle = '#8d6e63'; ctx.fillRect(0, 0, 16, 10); ctx.fillStyle = '#d7a86e'; ctx.fillRect(0, 0, 16, 5); ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 10, 16, 1); },
  cave_floor(ctx, rng) { fill(ctx, '#4a4242'); scatter(ctx, rng, 8, '#3d3636'); scatter(ctx, rng, 4, '#574d4d'); },
  cave_wall(ctx, rng) { fill(ctx, '#221d1d'); ctx.fillStyle = '#332c2c'; ctx.fillRect(0, 0, 7, 7); ctx.fillRect(8, 8, 8, 8); ctx.fillRect(9, 1, 6, 5); ctx.fillRect(1, 9, 6, 5); scatter(ctx, rng, 5, '#443b3b'); },
  stairs_down(ctx, rng) { DRAW.cave_floor(ctx, rng); ['#3a3333', '#2c2626', '#1e1a1a', '#110e0e'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(2, 2 + i * 3, 12, 3); }); },
  stairs_up(ctx, rng) { DRAW.cave_floor(ctx, rng); ['#9a8f8f', '#7d7373', '#655c5c', '#4f4747'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(2, 2 + i * 3, 12, 3); }); },
  chest(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#5d4037'; ctx.fillRect(2, 4, 12, 10); ctx.fillStyle = '#8d6e63'; ctx.fillRect(3, 5, 10, 3); ctx.fillStyle = '#ffca28'; ctx.fillRect(7, 8, 2, 3); },
  chest_open(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#5d4037'; ctx.fillRect(2, 7, 12, 7); ctx.fillRect(2, 2, 12, 3); ctx.fillStyle = '#1a1414'; ctx.fillRect(3, 8, 10, 3); },
  crystal(ctx, rng) { DRAW.cave_floor(ctx, rng); ctx.fillStyle = '#6d6060'; ctx.fillRect(3, 11, 10, 4); ctx.fillStyle = '#8a7c7c'; ctx.fillRect(4, 10, 8, 1); ctx.fillStyle = '#4dd0e1'; ctx.beginPath(); ctx.moveTo(8, 1); ctx.lineTo(12, 6); ctx.lineTo(8, 11); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e0f7fa'; ctx.fillRect(7, 3, 1, 4); },
  cave_entrance(ctx, rng) { DRAW.grass(ctx, rng); ctx.fillStyle = '#5d5252'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#6e6262'; ctx.fillRect(1, 1, 4, 4); ctx.fillRect(11, 2, 4, 3); ctx.fillStyle = '#0d0a0a'; ctx.fillRect(4, 5, 8, 11); ctx.fillRect(5, 3, 6, 2); },
  bed(ctx) { DRAW.floor(ctx); ctx.fillStyle = '#5d4037'; ctx.fillRect(1, 0, 14, 16); ctx.fillStyle = '#1e88e5'; ctx.fillRect(2, 6, 12, 9); ctx.fillStyle = '#fafafa'; ctx.fillRect(3, 1, 10, 4); },
};

export function buildTiles(rng) {
  const out = {};
  for (const name of Object.keys(DRAW)) {
    const c = document.createElement('canvas'); c.width = TILE; c.height = TILE;
    DRAW[name](c.getContext('2d'), rng);
    out[name] = c;
  }
  return out;
}
