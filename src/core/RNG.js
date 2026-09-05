// 可播种随机数（mulberry32）。全游戏只用这个，保证可复现、可测试。
export class RNG {
  constructor(seed = 1) { this.seed = seed >>> 0; this.s = this.seed || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); } // 含两端
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(items, weightOf) {
    let total = 0;
    const ws = items.map((it, i) => { const w = Math.max(0, weightOf(it, i)); total += w; return w; });
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
}
