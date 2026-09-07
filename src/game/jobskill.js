// 职业等级 / 技能等级 / 已学魔法——角色等级之外的另外两条线。
//
// 角色等级（member.level）管 HP/MP 与八项属性，**转职之后照旧按角色等级走**（computeStats 不看职业等级）。
// 这个文件管的是：
//   ① 职业等级：每个职业各记一条，转职不清零，决定「請神」这一栏请得动几位。
//   ② 技能等级：每个技能各记一条，靠**使用**来练，决定这一下有多重、多贵，满 5 级封顶。
//
// member 上新增的字段（全部进存档；旧存档缺了由 normalizeMember 补，不会崩）：
//   learned:     [spellId]         已学会的魔法。转职之前先记进来，所以旧魔法不会掉
//   jobLevels:   { jobId: 等级 }    没练过的职业不在表里（jobLevel() 回 0）
//   jobExp:      { jobId: 累计JP }  ↑ 的真相来源，jobLevels 是它算出来的缓存
//   skillLevels: { skillId: 等级 }
//   skillUses:   { skillId: 累计次数 } ↑ 的真相来源，skillLevels 是缓存
//
// 为什么是五个字段而不是三个：「等级」和「离下一级还差多少」是两件事。
// 把计数塞进 jobLevels / skillLevels 会让它们不再是 `{ id: 数字 }`，
// 而那个形状正是战斗与菜单要读的。所以成对存：一条是累计值（真相），一条是等级（缓存）。
// 两者对不上时一律以「大的那个」为准，读档只会补齐、不会倒退。

// ── 技能等级 ───────────────────────────────────────────────────────────────
export const SKILL_MAX = 5;
// 升到第 n 级需要的**累计**使用次数（index = 等级）。1 级是生来就有的。
// 30 次练满：召唤一场撑死请一尊 → 约 30 场；攻击魔法一场放三四次 → 约 8 场。
// 这个差是故意的——你天天放的那一招本来就该先练熟，而召唤要挑一尊来练。
export const SKILL_USES = [0, 0, 4, 10, 18, 30];
// 等级 → 威力倍率 / MP 倍率。**第 5 级那一步是双倍**（+0.20 而不是 +0.10），
// 这就是「练满」均一发给每一个技能的奖励——连天生 pierce 的吕布、义民爷也吃得到。
export const SKILL_POWER = [1, 1, 1.10, 1.20, 1.30, 1.50];
export const SKILL_MP = [1, 1, 0.96, 0.92, 0.88, 0.84];

const clampLv = lv => Math.max(1, Math.min(SKILL_MAX, Math.floor(lv || 1)));

export function levelForUses(uses) {
  let lv = 1;
  for (let n = 2; n <= SKILL_MAX; n++) if ((uses || 0) >= SKILL_USES[n]) lv = n;
  return lv;
}

export function skillLevelOf(member, skillId) {
  const uses = member.skillUses?.[skillId];
  if (uses != null) return levelForUses(uses);
  return clampLv(member.skillLevels?.[skillId] ?? 1);
}

// 用掉一次某个技能（战斗里施放成功后调）。返回 { leveled, level, mastered }。
// 只认 member，不认 data——战斗里手上未必有 data，而这一步不需要它。
export function useSkill(member, skillId) {
  const uses = (member.skillUses ||= {}), lvs = (member.skillLevels ||= {});
  // 旧存档可能只有 skillLevels 没有 skillUses：先把次数补到该等级的门槛，别让等级倒退
  const prev = Math.max(uses[skillId] || 0, SKILL_USES[clampLv(lvs[skillId] ?? 1)]);
  const before = levelForUses(prev);
  uses[skillId] = prev + 1;
  const level = levelForUses(uses[skillId]);
  lvs[skillId] = level;
  return { leveled: level > before, level, mastered: level >= SKILL_MAX };
}

// 技能等级对威力/消耗的修正。base 是 spells.json / summons.json 里那一条（也收纯数字 = 只算威力）。
// power 为 0 的纯状态魔法照旧是 0；mp 为 0 的不会被抬成 1。
export function skillScale(base, skillLevel) {
  const lv = clampLv(skillLevel);
  const src = typeof base === 'number' ? { power: base, mp: 0 } : (base || {});
  return {
    power: Math.max(0, Math.round((src.power || 0) * SKILL_POWER[lv])),
    mp: src.mp ? Math.max(1, Math.round(src.mp * SKILL_MP[lv])) : 0,
  };
}

// ── 已学魔法（承接）───────────────────────────────────────────────────────
// 职业魔法表项可写成 "cure" 或 { id: "cure", level: 3 }；返回该等级已学会的魔法 id 列表
export function spellsFor(job, level) {
  return (job?.spells || []).map(s => typeof s === 'string' ? { id: s, level: 1 } : s)
    .filter(s => level >= (s.level || 1)).map(s => s.id);
}

// 这个队员现在会的全部魔法：learned ∪ spellsFor(现职, 角色等级)。
// 并集这一步保证「就算某处忘了 syncLearned，本职业该会的也一个不少」。
export function memberSpells(member, data) {
  const out = (member.learned || []).slice();
  for (const id of spellsFor(data.jobs[member.jobId], member.level)) if (!out.includes(id)) out.push(id);
  return data.spells ? out.filter(id => data.spells[id]) : out;
}

// 把「现职 + 现等级该会的」并进 learned，让它落进存档。
// 升级时、转职前后、开新档时都要调——转职前那一次是「承接」成立的关键。
export function syncLearned(member, data) {
  const arr = (member.learned ||= []);
  for (const id of spellsFor(data.jobs[member.jobId], member.level)) if (!arr.includes(id)) arr.push(id);
  return arr;
}

// ── 职业等级 ───────────────────────────────────────────────────────────────
export const JP_PER_LEVEL = 11;  // 每 11 点 JP 涨一级
export const JP_PER_BATTLE = 1;  // 打完一场，每个活着的队员各拿 1（不分摊，和 expSplit:false 同调）
export const JP_ACT_BONUS = 40;  // 六鎮物每一幕结算时给的一大笔

export const jobLevelForJp = jp => 1 + Math.floor(Math.max(0, jp || 0) / JP_PER_LEVEL);
export const jpForJobLevel = lv => Math.max(0, (lv || 1) - 1) * JP_PER_LEVEL;

// 某个职业的职业等级。没练过 = 0；**现职**没记录时算 1（旧存档直接读得动，不必先迁移）。
export function jobLevel(member, jobId) {
  const lv = member.jobLevels?.[jobId];
  if (lv != null) return lv;
  const jp = member.jobExp?.[jobId];
  if (jp != null) return jobLevelForJp(jp);
  return jobId === member.jobId ? 1 : 0;
}

// 踏进一个职业：没练过的从 1 级起，练过的等级还在（练过的不会白练）。
export function enterJob(member, jobId) {
  const lvs = (member.jobLevels ||= {}), exp = (member.jobExp ||= {});
  if (lvs[jobId] == null) lvs[jobId] = jobLevelForJp(exp[jobId] || 0);
  exp[jobId] = Math.max(exp[jobId] || 0, jpForJobLevel(lvs[jobId]));
  return lvs[jobId];
}

// 打完一场（或走完一幕）加职业经验，只加给**现在这个职业**。
// 返回升级记录 [{ jobId, level, unlocked:[召唤id] }]。
export function grantJobExp(member, amount, data) {
  const jobId = member.jobId;
  const exp = (member.jobExp ||= {}); (member.jobLevels ||= {});
  const before = Math.max(1, jobLevel(member, jobId));
  exp[jobId] = Math.max(exp[jobId] || 0, jpForJobLevel(before)) + Math.max(0, Math.floor(amount || 0));
  const after = jobLevelForJp(exp[jobId]);
  member.jobLevels[jobId] = after;
  const gains = [];
  for (let n = before + 1; n <= after; n++) gains.push({ jobId, level: n, unlocked: summonsAtJobLevel(n, data) });
  return gains;
}

// ── 八位召唤的解锁 ─────────────────────────────────────────────────────────
// 第 1 位在职业 1 级，之后每 +7 一位：1 / 7 / 14 / 21 / 28 / 35 / 42 / 49
// （第一步只有 6 级是故意的——「一开始就先给他一个」，之后才是整齐的 7 级一台阶）
export const SUMMON_STEP = 7;
export const summonUnlockLevel = i => i <= 0 ? 1 : SUMMON_STEP * i;

// 顺序 ＝ 主线幕序（docs/主线设计.md §2 总表、lore.summons_eight「六鎮物各解锁一位」），
// 只把关圣帝君从第七幕提到最前（导演点名「关羽先给他」），**其余七位相对顺序一个没动**：
//   伯公(二·土) → 义民爷(二·忠義祠) → 吕布(三·金) → 观世音(四·木) → 妈祖(五·水)
//   → 中坛元帅(六·風) → 钟馗(六幕之后)。钟馗压在最后一格是对的——他是最终战的钥匙。
// 这张表是**内容**，按架构铁律 1 该住在 data/ 里（summons.json 加一个 order 字段最自然）。
// 现在那个文件归别人管，所以先放这儿，并留退路：表里没列到的召唤按 summons.json 的键序接在后面。
export const SUMMON_ORDER = ['guangong', 'bogong', 'yimin', 'lubu', 'guanyin', 'mazu', 'nezha', 'zhongkui'];

// 【八部齐至】不走职业等级这条路，走的是**八尊全部练满**（导演拍板）。
// 它必须排除在职业等级那张表之外：留在表里就掉到第九格 ＝ 职业 56 级，
// 而那既不是设计要的条件，也远在玩家会去的范围之外。
export const FINALE_ID = 'babu';
export const isFinale = id => id === FINALE_ID;

// 八尊是不是都到 5 级了。判的是**那八尊**，不是「所有召唤」——
// 后者会把八部齐至自己也算进去，于是永远解不开（要解开它得先练它）。
export function finaleReady(member, data) {
  const eight = summonOrder(data).filter(id => !isFinale(id));
  return eight.length > 0 && eight.every(id => skillLevelOf(member, id) >= SKILL_MAX);
}

export function summonOrder(data) {
  const all = Object.keys(data?.summons || {}).filter(id => !isFinale(id));
  const out = SUMMON_ORDER.filter(id => all.includes(id));
  for (const id of all) if (!out.includes(id)) out.push(id);
  return out;
}

export function summonsAtJobLevel(level, data) {
  return summonOrder(data).filter((id, i) => summonUnlockLevel(i) === level);
}

// 现在请得动的召唤：[{ id, skillLevel, mastered }]，按**现职**的职业等级过滤。
// 只管职业等级这一道闸；剧情 flag（summons.json 的 unlock）那一道由调用方另外查。
export function availableSummons(member, data) {
  const list = summonOrder(data)
    .filter((id, i) => jobLevel(member, member.jobId) >= summonUnlockLevel(i));
  // 八尊全满才把终极那一招接在最后（见 finaleReady）
  if (data?.summons?.[FINALE_ID] && finaleReady(member, data)) list.push(FINALE_ID);
  return list.map(id => { const skillLevel = skillLevelOf(member, id); return { id, skillLevel, mastered: skillLevel >= SKILL_MAX }; });
}

// ── 存档兼容 ───────────────────────────────────────────────────────────────
// 新档与读档都走这里。旧存档没有任何新字段也读得进来：缺的补默认值，
// 等级与累计值互相对齐（取大的那个），现职至少 1 级。data 可以不给（loadGame 就没有）。
export function normalizeMember(member, data) {
  member.learned ||= [];
  member.jobLevels ||= {}; member.jobExp ||= {};
  member.skillLevels ||= {}; member.skillUses ||= {};
  for (const [id, lv] of Object.entries(member.jobLevels)) {
    member.jobExp[id] = Math.max(member.jobExp[id] || 0, jpForJobLevel(lv));
  }
  for (const [id, jp] of Object.entries(member.jobExp)) member.jobLevels[id] = jobLevelForJp(jp);
  enterJob(member, member.jobId);
  for (const [id, lv] of Object.entries(member.skillLevels)) {
    member.skillUses[id] = Math.max(member.skillUses[id] || 0, SKILL_USES[clampLv(lv)]);
  }
  for (const [id, uses] of Object.entries(member.skillUses)) member.skillLevels[id] = levelForUses(uses);
  if (data) syncLearned(member, data);
  return member;
}
