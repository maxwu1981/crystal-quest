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
