// Verified, provider-independent membership subject.
// A provider email or the current Supabase auth user id is never the paid account key.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBillingIdentity(payload, authUser) {
  const personId = String(payload?.person_id || '').trim().toLowerCase();
  const ekodiId = String(payload?.ekodi_id || '').trim();
  const userId = String(authUser?.id || '').trim().toLowerCase();
  if (!UUID.test(personId) || !UUID.test(userId) || !ekodiId) return null;
  const linkedAuthUserIds = [...new Set(
    (Array.isArray(payload?.auth_user_ids) ? payload.auth_user_ids : [])
      .map(value => String(value || '').trim().toLowerCase()).filter(value => UUID.test(value))
  )];
  // A real session must be one of the identities the server just resolved.
  if (!linkedAuthUserIds.includes(userId)) return null;
  const verifiedEmails = [...new Set(
    (Array.isArray(payload?.verified_emails) ? payload.verified_emails : [])
      .map(value => String(value || '').trim().toLowerCase())
      .filter(value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  )];
  return {
    id: userId,
    authUserId: userId,
    email: verifiedEmails[0] || String(authUser?.email || '').trim().toLowerCase(),
    verifiedEmails,
    personId,
    ekodiId,
    subjectKey: `person:${personId}`,
    legacySubjectKeys: [...new Set([personId, ...linkedAuthUserIds])],
  };
}

export async function loadBillingIdentity({accessToken, authUser, supabaseUrl, publishableKey, fetchImpl = fetch}) {
  if (!accessToken || !authUser?.id) return null;
  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/current_ekodi_billing_identity`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return null; // Fail closed if the protected SQL release has not happened.
    return parseBillingIdentity(await response.json(), authUser);
  } catch {
    return null;
  }
}

export function personalSubscriptionLookupKeys(identity) {
  return [...new Set([identity?.subjectKey, ...(identity?.legacySubjectKeys || [])]
    .filter(key => typeof key === 'string' && key.length > 0))];
}

// Never silently replace a valid paid subscription with a FREE row from a
// different login method, and never invent a winner between two active payers.
export function choosePersonalSubscription(rows) {
  const candidates = rows.filter(Boolean);
  const paid = candidates.filter(row => Number(row.monthly_fee || 0) > 0);
  // An active and a past-due billing key still represent two independent
  // charges. Never display one as safe to re-subscribe while hiding the other.
  if (paid.length > 1) {
    const error = new Error('account_billing_reconciliation_required');
    error.code = 'ACCOUNT_BILLING_RECONCILIATION_REQUIRED';
    throw error;
  }
  // Preserve a legacy past-due/cancelled billing record for review rather
  // than overwriting its paid history with an inherited FREE record.
  return paid[0] || candidates[0] || null;
}

const collisionError = () => Object.assign(
  new Error('account_billing_reconciliation_required'),
  { code:'ACCOUNT_BILLING_RECONCILIATION_REQUIRED' }
);

// Maintain a server-verified alias projection in the D1 billing database.
// This is additive, contains no provider emails, and does not move or erase payments.
export async function saveVerifiedBillingAliases(db, identity) {
  if (!identity?.personId || identity.subjectKey !== `person:${identity.personId}`) {
    throw Object.assign(new Error('invalid_canonical_billing_identity'), {code:'BILLING_IDENTITY_REQUIRED'});
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS membership_person_aliases (
    alias_key TEXT PRIMARY KEY,
    person_key TEXT NOT NULL,
    verified_at TEXT NOT NULL
  )`).run();
  const keys = personalSubscriptionLookupKeys(identity);
  const now = new Date().toISOString();
  // D1 batch is transactional: the scheduler never sees half of a verified
  // alias group during a provider-link or paid checkout race.
  await db.batch(keys.map(alias => db.prepare(
    'INSERT OR IGNORE INTO membership_person_aliases(alias_key,person_key,verified_at) VALUES (?,?,?)'
  ).bind(alias,identity.subjectKey,now)));
  for (const alias of keys) {
    const stored = await db.prepare('SELECT person_key FROM membership_person_aliases WHERE alias_key=?')
      .bind(alias).first();
    if (stored?.person_key !== identity.subjectKey) {
      throw Object.assign(new Error('billing_identity_alias_conflict'), {code:'BILLING_IDENTITY_ALIAS_CONFLICT'});
    }
  }
}

// Used before *every scheduled charge*. A linked Person may retain two legacy
// recurring subscriptions from separate login methods. Never charge either
// until an operator reconciles the historical payment and subscription ledger.
export async function recurringBillingCollision(db, row) {
  if (row?.subject_type !== 'person') return false;
  const identity = await db.prepare('SELECT person_key FROM membership_person_aliases WHERE alias_key=?')
    .bind(String(row.subject_key || '')).first();
  if (!identity?.person_key) return false; // Historical unmapped rows are unchanged.
  const found = await db.prepare(`SELECT COUNT(*) AS count
    FROM service_subscriptions s
    JOIN membership_person_aliases a ON a.alias_key=s.subject_key
    WHERE s.subject_type='person' AND a.person_key=? AND s.site=?
      AND s.monthly_fee>0 AND s.status IN ('active','trialing','grace','past_due')`)
    .bind(identity.person_key, String(row.site || '')).first();
  return Number(found?.count || 0) > 1;
}
