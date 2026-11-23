// In-memory implementation of the EKODI funding store contract (tests and isolated staging).
// The D1 store (funding-d1-store.js) implements the same methods with the same semantics.
const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function createMemoryStore({ campaigns = [], pledges = [] } = {}) {
  const C = new Map(campaigns.map(c => [c.id, copy(c)]));
  const P = new Map(pledges.map(p => [p.id, copy(p)]));
  const interest = new Map();
  const profiles = new Map();
  const settlements = new Map();
  const audits = [];
  const live = (p, nowIso) => p.status === 'paid' || (p.status === 'payment_pending' && p.expiresAt > nowIso);
  return {
    audits, interest, profiles, settlements,
    async listCampaigns({ statuses } = {}) {
      return [...C.values()].filter(c => !statuses || statuses.includes(c.status)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(copy);
    },
    async getCampaign(id) { return copy(C.get(id) || null); },
    async getCampaignBySlug(slug) { return copy([...C.values()].find(c => c.slug === slug) || null); },
    async createCampaign(c) { if ([...C.values()].some(x => x.slug === c.slug)) throw new Error('UNIQUE slug'); C.set(c.id, copy(c)); },
    async updateCampaign(id, patch) {
      const c = C.get(id); if (!c) return false;
      const { raisedAmount, backerCount, id: _id, ...rest } = patch; // counters move only through reserve/release/increment
      Object.assign(c, copy(rest)); return true;
    },
    async reserveRaise(id, amount, cap) {
      const c = C.get(id); if (!c || c.raisedAmount + amount >= cap) return false;
      c.raisedAmount += amount; return true;
    },
    async releaseRaise(id, amount) { const c = C.get(id); if (c) c.raisedAmount = Math.max(0, c.raisedAmount - amount); },
    async incrementBackers(id) { const c = C.get(id); if (c) c.backerCount += 1; },
    async createPledge(p) { if (P.has(p.id)) throw new Error('UNIQUE pledge'); P.set(p.id, copy(p)); },
    async getPledge(id) { return copy(P.get(id) || null); },
    async updatePledge(id, patch, fromStatus) {
      const p = P.get(id); if (!p || (fromStatus && p.status !== fromStatus)) return false;
      Object.assign(p, copy(patch)); return true;
    },
    async listPledges(campaignId) { return [...P.values()].filter(p => p.campaignId === campaignId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy); },
    async pendingTotal(campaignId, nowIso) {
      return [...P.values()].filter(p => p.campaignId === campaignId && p.status === 'payment_pending' && p.expiresAt > nowIso).reduce((s, p) => s + p.amount, 0);
    },
    async countRewardCommitted(campaignId, rewardId, nowIso) {
      return [...P.values()].filter(p => p.campaignId === campaignId && p.rewardId === rewardId && live(p, nowIso)).length;
    },
    async countInterest(campaignId) { return [...interest.values()].filter(e => e.campaignId === campaignId).length; },
    async listInterest(campaignId) { return [...interest.values()].filter(e => e.campaignId === campaignId).map(copy); },
    async deleteInterest(campaignId) { let n = 0; for (const [k, e] of interest) if (e.campaignId === campaignId) { interest.delete(k); n += 1; } return n; },
    async getPayoutProfile(userId) { return copy(profiles.get(userId) || null); },
    async savePayoutProfile(p) { profiles.set(p.userId, copy(p)); },
    async getSettlement(campaignId) { return copy(settlements.get(campaignId) || null); },
    async listSettlements() { return [...settlements.values()].map(copy); },
    async createSettlement(s) { if (settlements.has(s.campaignId)) return false; settlements.set(s.campaignId, copy(s)); return true; },
    async updateSettlement(campaignId, patch, fromStatus) { const s = settlements.get(campaignId); if (!s || (fromStatus && s.status !== fromStatus)) return false; Object.assign(s, copy(patch)); return true; },
    async addInterest(entry) { const key = `${entry.campaignId}:${entry.email}`; if (!interest.has(key)) interest.set(key, copy(entry)); },
    async audit(entry) { audits.push(copy(entry)); },
  };
}
