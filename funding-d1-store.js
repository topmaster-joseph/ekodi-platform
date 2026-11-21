// D1 implementation of the EKODI funding store contract (see funding-memory-store.js).
// Money counters change only through conditional SQL (reserveRaise/releaseRaise/incrementBackers),
// so concurrent confirmations can never push a campaign to or past the public cap.
const parse = (value, fallback) => { try { const v = JSON.parse(value || ''); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };

const campaign = r => r && ({
  id: r.id, slug: r.slug, title: r.title, summary: r.summary, story: r.story, kind: r.kind, ownerOrg: r.owner_org,
  organizerUserId: r.organizer_user_id, organizerEmail: r.organizer_email, organizerName: r.organizer_name, contactEmail: r.contact_email,
  goalAmount: Number(r.goal_amount), raisedAmount: Number(r.raised_amount), backerCount: Number(r.backer_count),
  startsOn: r.starts_on, endsOn: r.ends_on, refundPolicy: r.refund_policy, rewards: parse(r.rewards_json, []),
  status: r.status, reviewNote: r.review_note, approvedBy: r.approved_by, approvedAt: r.approved_at, createdAt: r.created_at, updatedAt: r.updated_at,
});
const pledge = r => r && ({
  id: r.id, campaignId: r.campaign_id, rewardId: r.reward_id, rewardTitle: r.reward_title, amount: Number(r.amount),
  backerName: r.backer_name, backerEmail: r.backer_email, backerPhone: r.backer_phone, status: r.status, expiresAt: r.expires_at,
  paymentKey: r.payment_key, method: r.method, approvedAt: r.approved_at, receiptUrl: r.receipt_url, createdAt: r.created_at, updatedAt: r.updated_at,
});

const CAMPAIGN_COLS = {
  slug: 'slug', title: 'title', summary: 'summary', story: 'story', kind: 'kind', ownerOrg: 'owner_org', organizerName: 'organizer_name',
  contactEmail: 'contact_email', goalAmount: 'goal_amount', startsOn: 'starts_on', endsOn: 'ends_on', refundPolicy: 'refund_policy',
  rewards: 'rewards_json', status: 'status', reviewNote: 'review_note', approvedBy: 'approved_by', approvedAt: 'approved_at', updatedAt: 'updated_at',
};
const PLEDGE_COLS = { status: 'status', paymentKey: 'payment_key', method: 'method', approvedAt: 'approved_at', receiptUrl: 'receipt_url', updatedAt: 'updated_at' };

function sets(cols, patch) {
  const parts = []; const values = [];
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] === undefined) continue;
    parts.push(`${col}=?`); values.push(key === 'rewards' ? JSON.stringify(patch[key]) : patch[key]);
  }
  return { parts, values };
}

export function createD1Store(DB) {
  return {
    async listCampaigns({ statuses } = {}) {
      const where = statuses?.length ? `WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
      const { results } = await DB.prepare(`SELECT * FROM funding_campaigns ${where} ORDER BY created_at DESC LIMIT 500`).bind(...(statuses || [])).all();
      return (results || []).map(campaign);
    },
    async getCampaign(id) { return campaign(await DB.prepare('SELECT * FROM funding_campaigns WHERE id=?').bind(id).first()); },
    async getCampaignBySlug(slug) { return campaign(await DB.prepare('SELECT * FROM funding_campaigns WHERE slug=?').bind(slug).first()); },
    async createCampaign(c) {
      await DB.prepare(`INSERT INTO funding_campaigns (id,slug,title,summary,story,kind,owner_org,organizer_user_id,organizer_email,organizer_name,contact_email,goal_amount,raised_amount,backer_count,starts_on,ends_on,refund_policy,rewards_json,status,review_note,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?)`).bind(c.id, c.slug, c.title, c.summary, c.story, c.kind, c.ownerOrg, c.organizerUserId, c.organizerEmail, c.organizerName, c.contactEmail,
        c.goalAmount, c.startsOn, c.endsOn, c.refundPolicy, JSON.stringify(c.rewards || []), c.status, c.reviewNote || '', c.createdAt, c.updatedAt).run();
    },
    async updateCampaign(id, patch) {
      const { parts, values } = sets(CAMPAIGN_COLS, patch);
      if (!parts.length) return false;
      const r = await DB.prepare(`UPDATE funding_campaigns SET ${parts.join(',')} WHERE id=?`).bind(...values, id).run();
      return Number(r?.meta?.changes || 0) > 0;
    },
    async reserveRaise(id, amount, cap) {
      const r = await DB.prepare('UPDATE funding_campaigns SET raised_amount=raised_amount+? WHERE id=? AND raised_amount+?<?').bind(amount, id, amount, cap).run();
      return Number(r?.meta?.changes || 0) === 1;
    },
    async releaseRaise(id, amount) {
      await DB.prepare('UPDATE funding_campaigns SET raised_amount=MAX(0,raised_amount-?) WHERE id=?').bind(amount, id).run();
    },
    async incrementBackers(id) { await DB.prepare('UPDATE funding_campaigns SET backer_count=backer_count+1 WHERE id=?').bind(id).run(); },
    async createPledge(p) {
      await DB.prepare(`INSERT INTO funding_pledges (id,campaign_id,reward_id,reward_title,amount,backer_name,backer_email,backer_phone,status,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(p.id, p.campaignId, p.rewardId, p.rewardTitle, p.amount, p.backerName, p.backerEmail, p.backerPhone, p.status, p.expiresAt, p.createdAt, p.updatedAt).run();
    },
    async getPledge(id) { return pledge(await DB.prepare('SELECT * FROM funding_pledges WHERE id=?').bind(id).first()); },
    async updatePledge(id, patch, fromStatus) {
      const { parts, values } = sets(PLEDGE_COLS, patch);
      if (!parts.length) return false;
      const guard = fromStatus ? ' AND status=?' : '';
      const r = await DB.prepare(`UPDATE funding_pledges SET ${parts.join(',')} WHERE id=?${guard}`).bind(...values, id, ...(fromStatus ? [fromStatus] : [])).run();
      return Number(r?.meta?.changes || 0) > 0;
    },
    async listPledges(campaignId) {
      const { results } = await DB.prepare('SELECT * FROM funding_pledges WHERE campaign_id=? ORDER BY created_at DESC LIMIT 2000').bind(campaignId).all();
      return (results || []).map(pledge);
    },
    async pendingTotal(campaignId, nowIso) {
      const r = await DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM funding_pledges WHERE campaign_id=? AND status='payment_pending' AND expires_at>?").bind(campaignId, nowIso).first();
      return Number(r?.total || 0);
    },
    async countRewardCommitted(campaignId, rewardId, nowIso) {
      const r = await DB.prepare("SELECT COUNT(*) n FROM funding_pledges WHERE campaign_id=? AND reward_id=? AND (status='paid' OR (status='payment_pending' AND expires_at>?))").bind(campaignId, rewardId, nowIso).first();
      return Number(r?.n || 0);
    },
    async countInterest(campaignId) {
      const r = await DB.prepare('SELECT COUNT(*) n FROM funding_interest WHERE campaign_id=?').bind(campaignId).first();
      return Number(r?.n || 0);
    },
    async listInterest(campaignId) {
      const { results } = await DB.prepare('SELECT email, consent_at FROM funding_interest WHERE campaign_id=? ORDER BY consent_at LIMIT 5000').bind(campaignId).all();
      return (results || []).map(r => ({ email: r.email, consentAt: r.consent_at }));
    },
    async deleteInterest(campaignId) {
      const r = await DB.prepare('DELETE FROM funding_interest WHERE campaign_id=?').bind(campaignId).run();
      return Number(r?.meta?.changes || 0);
    },
    async addInterest(e) {
      await DB.prepare('INSERT OR IGNORE INTO funding_interest (id,campaign_id,email,consent_at) VALUES (?,?,?,?)').bind(e.id, e.campaignId, e.email, e.consentAt).run();
    },
    async audit(e) {
      await DB.prepare('INSERT INTO funding_audit (actor,action,target,detail,created_at) VALUES (?,?,?,?,?)').bind(e.actor, e.action, e.target, e.detail, e.createdAt).run();
    },
  };
}
