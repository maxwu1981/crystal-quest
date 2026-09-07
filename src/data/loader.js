// 一次性加载 data/ 下所有 JSON。地图列表来自 config.maps，挂到 data.maps[id]。
const BASE = ['config', 'jobs', 'spells', 'summons', 'enemies', 'encounters', 'items', 'party', 'story'];

export async function loadData(base = './data/') {
  const get = async f => {
    const res = await fetch(base + f + '.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`加载失败: ${f}.json (${res.status})`);
    return res.json();
  };
  const out = {};
  await Promise.all(BASE.map(async f => { out[f] = await get(f); }));
  out.maps = {};
  await Promise.all((out.config.maps || ['village']).map(async id => { out.maps[id] = await get('maps/' + id); }));
  return out;
}
