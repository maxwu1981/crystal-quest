// 8-bit 风格音效 + 简易 BGM 序列器：全部用 Web Audio 合成，零素材文件。按 M 静音。
// 以后要换成真正的音乐：把 SONGS 换成 <audio> 播放即可，sfx() 接口不变。
const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export function noteFreq(n) {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  const midi = 12 * (Number(m[2]) + 1) + NOTE_IDX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const seq = s => s.trim().split(/\s+/);

// 八分音符序列，'-' 休止。自创旋律，可随意改。
const SONGS = {
  title: { bpm: 84, channels: [
    { type: 'triangle', vol: 0.16, notes: seq('C4 E4 G4 C5 - G4 E4 C4  A3 C4 E4 A4 - E4 C4 A3  F3 A3 C4 F4 - C4 A3 F3  G3 B3 D4 G4 - D4 B3 G3') },
    { type: 'sine', vol: 0.14, notes: seq('C3 - - - - - - -  A2 - - - - - - -  F2 - - - - - - -  G2 - - - - - - -') },
  ] },
  field: { bpm: 126, channels: [
    { type: 'square', vol: 0.09, notes: seq('E4 G4 A4 G4 E4 D4 C4 D4  E4 G4 A4 B4 C5 B4 A4 G4  A4 G4 E4 D4 C4 D4 E4 G4  E4 D4 C4 D4 E4 - - -') },
    { type: 'triangle', vol: 0.15, notes: seq('C3 - G3 - A2 - E3 -  F2 - C3 - G2 - D3 -  A2 - E3 - F2 - C3 -  G2 - D3 - C3 - G3 -') },
  ] },
  battle: { bpm: 152, channels: [
    { type: 'square', vol: 0.09, notes: seq('A4 A4 C5 A4 D5 C5 A4 G4  A4 A4 C5 A4 E5 D5 C5 A4  F4 F4 A4 F4 G4 G4 B4 G4  A4 - E5 - A4 C5 A4 -') },
    { type: 'triangle', vol: 0.17, notes: seq('A2 A2 A3 A2 A2 A2 A3 A2  A2 A2 A3 A2 A2 A2 A3 A2  F2 F2 F3 F2 G2 G2 G3 G2  A2 A2 A3 A2 E2 E2 E3 E2') },
  ] },
  boss: { bpm: 140, channels: [
    { type: 'square', vol: 0.09, notes: seq('D4 D4 F4 D4 G#4 G4 F4 D4  D4 D4 F4 D4 A4 G#4 G4 F4  A#3 A#3 D4 A#3 C4 C4 E4 C4  D4 - A4 - G#4 G4 F4 -') },
    { type: 'sawtooth', vol: 0.07, notes: seq('D2 D2 D3 D2 D2 D2 D3 D2  D2 D2 D3 D2 D2 D2 D3 D2  A#1 A#1 A#2 A#1 C2 C2 C3 C2  D2 D2 D3 D2 A1 A1 A2 A1') },
  ] },
};

const SFX = {
  cursor: a => a.tone({ freq: 1200, dur: 0.03, vol: 0.10 }),
  confirm: a => { a.tone({ freq: 880, dur: 0.05, vol: 0.14 }); a.tone({ freq: 1320, dur: 0.08, vol: 0.14, at: 0.05 }); },
  cancel: a => a.tone({ freq: 440, dur: 0.08, vol: 0.12, slide: -200 }),
  buzz: a => a.tone({ freq: 120, type: 'sawtooth', dur: 0.15, vol: 0.14 }),
  hit: a => { a.noise({ dur: 0.12, vol: 0.35 }); a.tone({ freq: 180, dur: 0.1, vol: 0.2, slide: -120 }); },
  crit: a => { a.noise({ dur: 0.2, vol: 0.45 }); a.tone({ freq: 240, dur: 0.15, vol: 0.25, slide: -200 }); },
  miss: a => a.tone({ freq: 500, type: 'triangle', dur: 0.15, vol: 0.15, slide: -350 }),
  magic: a => { for (let i = 0; i < 6; i++) a.tone({ freq: 400 + i * 180, type: 'sine', dur: 0.08, vol: 0.15, at: i * 0.04 }); },
  fire: a => { a.noise({ dur: 0.35, vol: 0.3 }); a.tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.12, slide: -150 }); },
  thunder: a => { a.noise({ dur: 0.08, vol: 0.5 }); a.noise({ dur: 0.25, vol: 0.3, at: 0.1 }); a.tone({ freq: 1800, dur: 0.06, vol: 0.15, slide: -1500 }); },
  heal: a => [660, 880, 1320, 1760].forEach((f, i) => a.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.15, at: i * 0.07 })),
  item: a => [880, 1100].forEach((f, i) => a.tone({ freq: f, type: 'triangle', dur: 0.08, vol: 0.15, at: i * 0.08 })),
  encounter: a => { for (let i = 0; i < 4; i++) a.tone({ freq: 300, dur: 0.12, vol: 0.14, slide: 900, at: i * 0.12 }); },
  door: a => a.tone({ freq: 160, type: 'triangle', dur: 0.12, vol: 0.2, slide: -60 }),
  levelup: a => ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => a.tone({ freq: noteFreq(n), dur: 0.12, vol: 0.13, at: i * 0.09 })),
  victory: a => ['G4', 'C5', 'E5', 'G5', 'E5', 'G5'].forEach((n, i) => a.tone({ freq: noteFreq(n), dur: i === 5 ? 0.5 : 0.13, vol: 0.13, at: i * 0.13 })),
  defeat: a => ['E4', 'D#4', 'D4', 'C#4'].forEach((n, i) => a.tone({ freq: noteFreq(n), type: 'triangle', dur: 0.35, vol: 0.17, at: i * 0.35 })),
  flee: a => a.tone({ freq: 800, dur: 0.25, vol: 0.12, slide: -600 }),
  coin: a => [1500, 2000].forEach((f, i) => a.tone({ freq: f, dur: 0.06, vol: 0.12, at: i * 0.06 })),
};

class AudioSystem {
  constructor() { this.ctx = null; this.muted = false; this.bgmName = null; this.timer = null; this.pos = 0; this.nextTime = 0; }
  // 浏览器要求用户交互后才能出声：Game 在第一次按键时调用
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6; this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5), buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    return buf;
  }
  setMute(v) { this.muted = !!v; if (this.master) this.master.gain.value = this.muted ? 0 : 0.6; return this.muted; }
  toggleMute() { return this.setMute(!this.muted); }

  tone({ freq, type = 'square', dur = 0.1, vol = 0.2, slide = 0, at = 0 }) {
    const ctx = this.ctx; if (!ctx || !freq) return;
    const t0 = ctx.currentTime + at, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master); osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  noise({ dur = 0.1, vol = 0.3, at = 0 }) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + at, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g); g.connect(this.master); src.start(t0); src.stop(t0 + dur + 0.02);
  }
  sfx(name) { if (this.ctx) SFX[name]?.(this); }

  playBgm(name) {
    if (name === this.bgmName && (this.timer || !name)) return;
    this.stopBgm(); this.bgmName = name;
    if (!name || !SONGS[name] || !this.ctx) return;
    this.pos = 0; this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(SONGS[name]), 30);
  }
  stopBgm() { if (this.timer) clearInterval(this.timer); this.timer = null; this.bgmName = null; }
  schedule(song) {
    const step = 60 / song.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const at = Math.max(0, this.nextTime - this.ctx.currentTime);
      for (const ch of song.channels) {
        const n = ch.notes[this.pos % ch.notes.length];
        if (n && n !== '-') this.tone({ freq: noteFreq(n), type: ch.type, dur: step * 0.85, vol: ch.vol, at });
      }
      this.pos++; this.nextTime += step;
    }
  }
}
export const audio = new AudioSystem();
