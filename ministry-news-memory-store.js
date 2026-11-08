// In-memory store with the same contract as the D1 store.
// Used by the isolated staging worker (no production data) and by tests.
import { SEED_GROUPS } from './ministry-news-core.js';

const STALE_SENDING_MS = 10 * 60 * 1000;
const copy = value => (value == null ? value : structuredClone(value));

export function createMemoryStore({ items = [], recipients = [] } = {}) {
  const db = {
    items: items.map(copy),
    groups: SEED_GROUPS.map(g => ({ submitUrl: '', contactEmail: '', active: 1, ...g })),
    recipients: recipients.map(copy),
    dispatches: [],
    deliveries: [],
    audit: [],
  };
  const now = () => new Date().toISOString();
  const byDate = (a, b) => String(b.eventDate).localeCompare(String(a.eventDate)) || String(b.createdAt).localeCompare(String(a.createdAt));

  return {
    _db: db,
    async listItems() { return db.items.slice().sort(byDate).map(copy); },
    async getItem(id) { return copy(db.items.find(i => i.id === id) || null); },
    async createItem(item) { db.items.push(copy(item)); return copy(item); },
    async updateItem(id, patch) { const i = db.items.find(x => x.id === id); if (!i) return null; Object.assign(i, copy(patch)); return copy(i); },

    async listGroups() { return db.groups.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(copy); },
    async getGroup(id) { return copy(db.groups.find(g => g.id === id) || null); },
    async updateGroup(id, patch) { const g = db.groups.find(x => x.id === id); if (!g) return null; Object.assign(g, copy(patch)); return copy(g); },

    async listRecipients(groupId) { return db.recipients.filter(r => !groupId || r.groupId === groupId).map(copy); },
    async getRecipient(id) { return copy(db.recipients.find(r => r.id === id) || null); },
    async getRecipientByToken(token) { return token ? copy(db.recipients.find(r => r.unsubToken === token) || null) : null; },
    async upsertRecipient({ groupId, name, email, phone, consentSource, consentBy }) {
      const existing = db.recipients.find(r => r.groupId === groupId && r.email === email);
      const stamp = now();
      if (existing) {
        Object.assign(existing, { name: name || existing.name, phone: phone || existing.phone, consentAt: stamp, consentSource, consentBy, unsubscribedAt: '', updatedAt: stamp });
        return { created: false, recipient: copy(existing) };
      }
      const recipient = { id: `rcp-${crypto.randomUUID()}`, groupId, name, email, phone, note: '', consentAt: stamp, consentSource, consentBy, unsubscribedAt: '', unsubToken: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''), createdAt: stamp, updatedAt: stamp };
      db.recipients.push(recipient);
      return { created: true, recipient: copy(recipient) };
    },
    async updateRecipient(id, patch) { const r = db.recipients.find(x => x.id === id); if (!r) return null; Object.assign(r, copy(patch), { updatedAt: now() }); return copy(r); },
    async deleteRecipient(id) { db.recipients = db.recipients.filter(r => r.id !== id); },

    async listDispatches(limit = 200) { return db.dispatches.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit).map(copy); },
    async getDispatch(id) { return copy(db.dispatches.find(d => d.id === id) || null); },
    async createDispatch(dispatch) { db.dispatches.push(copy(dispatch)); return copy(dispatch); },
    async updateDispatch(id, patch) { const d = db.dispatches.find(x => x.id === id); if (!d) return null; Object.assign(d, copy(patch)); return copy(d); },

    async listDeliveries(dispatchId) { return db.deliveries.filter(d => d.dispatchId === dispatchId).map(copy); },
    async claimDelivery({ id, dispatchId, groupId, recipientId, email }) {
      const existing = db.deliveries.find(d => d.dispatchId === dispatchId && d.recipientId === recipientId);
      const stamp = now();
      if (existing) {
        const stale = existing.status === 'SENDING' && Date.now() - Date.parse(existing.updatedAt) > STALE_SENDING_MS;
        if (existing.status !== 'FAILED' && !stale) return null;
        Object.assign(existing, { status: 'SENDING', error: '', updatedAt: stamp });
        return existing.id;
      }
      db.deliveries.push({ id, dispatchId, groupId, recipientId, email, status: 'SENDING', messageId: '', error: '', note: '', actor: '', createdAt: stamp, updatedAt: stamp });
      return id;
    },
    async finishDelivery(id, { status, messageId = '', error = '' }) {
      const d = db.deliveries.find(x => x.id === id); if (d) Object.assign(d, { status, messageId, error, updatedAt: now() });
    },
    async recordSubmission({ id, dispatchId, groupId, note, actor }) {
      if (db.deliveries.some(d => d.dispatchId === dispatchId && d.recipientId === `group:${groupId}`)) return;
      const stamp = now();
      db.deliveries.push({ id, dispatchId, groupId, recipientId: `group:${groupId}`, email: '', status: 'SUBMITTED', messageId: '', error: '', note, actor, createdAt: stamp, updatedAt: stamp });
    },
    async audit(entry) { db.audit.push({ ...entry, createdAt: now() }); },
  };
}
