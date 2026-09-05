// 一次性加载 data/ 下所有 JSON。'maps/village' 会挂到 data.maps.village。
const FILES = ['config', 'jobs', 'spells', 'enemies', 'encounters', 'items', 'party', 'maps/village'];

export async function loadData(base = './data/') {
  const out = {};
  await Promise.all(FILES.map(async f => {
    const res = await fetch(base + f + '.json');
    if (!res.ok) throw new Error(`加载失败: ${f}.json (${res.status})`);
    const json = await res.json();
    const [dir, name] = f.includes('/') ? f.split('/') : [null, f];
    if (dir) (out[dir] ??= {})[name] = json; else out[name] = json;
  }));
  return out;
}
