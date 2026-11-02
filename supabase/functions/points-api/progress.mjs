// Read-only, non-financial progress projection from server-approved evidence.
// No client claims, page views, attendance or monetary conversions can create awards.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIERS = Object.freeze([
  { id: "seed", label: "새싹", min: 0 },
  { id: "companion", label: "동행", min: 3 },
  { id: "contributor", label: "나눔", min: 10 },
  { id: "steward", label: "섬김", min: 30 },
  { id: "jubilee", label: "희년", min: 90 },
]);
const EXCLUDED = new Set(["devotion_self_report", "attendance_checkin"]);
const KEY = (rule, adapter) => String(rule) + "|" + String(adapter);

export function kstDate(instant) {
  const value = typeof instant === "string" || instant instanceof Date ? new Date(instant).getTime() : NaN;
  return Number.isFinite(value) ? new Date(value + KST_OFFSET_MS).toISOString().slice(0, 10) : null;
}

export function buildPointProgress({ now = new Date(), adapters = [], rules = [], claims = [], truncated = false } = {}) {
  const today = kstDate(now);
  if (!today) throw new Error("invalid_progress_clock");
  const activeRules = new Map(rules.filter(r => r.enabled === true).map(r => [r.rule_id, r]));
  const eligible = adapters.filter(a =>
    a.enabled === true && a.member_claimable === true && a.trust === "verified" &&
    !EXCLUDED.has(a.adapter) && activeRules.has(a.rule_id)
  );
  const keySet = new Set(eligible.map(a => KEY(a.rule_id, a.adapter)));
  const todayMs = Date.parse(today + "T00:00:00Z");
  const dateToMs = d => Date.parse(d + "T00:00:00Z");
  const recent = claims.filter(c => {
    const day = kstDate(c.submitted_at);
    return keySet.has(KEY(c.rule_id, c.adapter)) && day &&
      dateToMs(day) <= todayMs && dateToMs(day) > todayMs - 90 * DAY_MS;
  });
  const approved = recent.filter(c => c.status === "approved");
  const states = new Map();
  for (const c of recent) {
    if (kstDate(c.submitted_at) !== today) continue;
    const k = KEY(c.rule_id, c.adapter);
    const current = states.get(k) || "available";
    if (c.status === "approved") states.set(k, "completed");
    else if (c.status === "pending" && current !== "completed") states.set(k, "pending");
  }
  const approvedDays = new Set(approved.map(c => kstDate(c.submitted_at)).filter(
    day => day && dateToMs(day) <= todayMs && dateToMs(day) > todayMs - 90 * DAY_MS
  ));
  let currentStreak = 0;
  let cursor = todayMs;
  if (!approvedDays.has(today)) cursor -= DAY_MS;
  while (approvedDays.has(new Date(cursor).toISOString().slice(0, 10)) && currentStreak < 90) {
    currentStreak++;
    cursor -= DAY_MS;
  }
  let longestStreak = 0;
  let run = 0;
  let prev = null;
  for (const day of [...approvedDays].sort()) {
    const time = dateToMs(day);
    run = prev !== null && time - prev === DAY_MS ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = time;
  }
  const count = approved.length;
  const tierIndex = TIERS.reduce((index, t, i) => count >= t.min ? i : index, 0);
  const level = TIERS[tierIndex];
  const next = TIERS[tierIndex + 1] || null;
  return {
    date: today,
    window_days: 90,
    complete_window: !truncated,
    reward_policy: "recognition_only",
    level: { id: level.id, label: level.label, verified_activities_90d: count, next_at: next?.min ?? null },
    streak: { current_days: currentStreak, longest_days_90d: longestStreak },
    missions: eligible.map(a => ({
      rule_id: a.rule_id,
      adapter: a.adapter,
      points_if_approved: Number(activeRules.get(a.rule_id).points || 0),
      today_status: states.get(KEY(a.rule_id, a.adapter)) || "available",
    })),
  };
}
