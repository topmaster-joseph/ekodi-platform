// Verified, provider-independent membership subject.
// A provider email or the current Supabase auth user id is never the paid account key.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENT_ACTIVE = new Set(['active','trialing','grace']);

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
  const activePaid = candidates.filter(row => Number(row.monthly_fee || 0) > 0
    && CURRENT_ACTIVE.has(String(row.status || '').toLowerCase()));
  if (activePaid.length > 1) {
    const error = new Error('account_billing_reconciliation_required');
    error.code = 'ACCOUNT_BILLING_RECONCILIATION_REQUIRED';
    throw error;
  }
  if (activePaid.length === 1) return activePaid[0];
  // Preserve a legacy past-due/cancelled billing record for a support review
  // rather than overwriting it with an inherited FREE record.
  const historicallyPaid = candidates.filter(row => Number(row.monthly_fee || 0) > 0);
  if (historicallyPaid.length > 1) {
    const error = new Error('account_billing_reconciliation_required');
    error.code = 'ACCOUNT_BILLING_RECONCILIATION_REQUIRED';
    throw error;
  }
  return historicallyPaid[0] || candidates[0] || null;
}
