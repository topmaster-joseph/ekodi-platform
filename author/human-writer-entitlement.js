// Client-side presentation ONLY. Supabase RLS is the sole authority for writes.
// All timestamps and subscription metadata are untrusted here; NEVER use this
// helper to grant a plan, charge money, or bypass a server authorization check.
export function mayAppendHumanInterview({ userId, enrollment, subscription, now = Date.now() }) {
  if (!userId || !enrollment || !subscription) return false;
  if (enrollment.owner_user_id !== userId || subscription.owner_user_id !== userId) return false;
  if (enrollment.writing_mode !== 'human' || enrollment.status !== 'active') return false;
  if (subscription.plan_id !== enrollment.plan_id || !['writer1', 'writer3'].includes(subscription.plan_id)) return false;
  if (subscription.status !== 'active' || !subscription.verified_payment_at) return false;
  const paidUntil = Date.parse(subscription.paid_until || '');
  return Number.isFinite(paidUntil) && paidUntil > now;
}
