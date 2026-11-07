// D1 implementation of the ministry-news store contract (see ministry-news-memory-store.js).
const STALE_SENDING_MS = 10 * 60 * 1000;
const parse = (value, fallback) => { try { const v = JSON.parse(value || ''); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };
const now = () => new Date().toISOString();

const item = r => r && ({
  id: r.id, org: r.org, kind: r.kind, eventDate: r.event_date, title: r.title, summary: r.summary, body: r.body,
  photos: parse(r.photos_json, []), visibility: r.visibility, status: r.status,
  createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, updatedBy: r.updated_by,
});
const group = r => r && ({
  id: r.id, org: r.org, name: r.name, channel: r.channel, description: r.description, submitUrl: r.submit_url,
  contactEmail: r.contact_email, publicSubscribe: Number(r.public_subscribe), active: Number(r.active), sortOrder: Number(r.sort_order),
});
const recipient = r => r && ({
  id: r.id, groupId: r.group_id, name: r.name, email: r.email, phone: r.phone, note: r.note,
  consentAt: r.consent_at, consentSource: r.consent_source, consentBy: r.consent_by, unsubscribedAt: r.unsubscribed_at,
  unsubToken: r.unsub_token, createdAt: r.created_at, updatedAt: r.updated_at,
});
const dispatch = r => r && ({
  id: r.id, org: r.org, kind: r.kind, subject: r.subject, body: r.body, periodLabel: r.period_label,
  itemIds: parse(r.item_ids_json, []), groupIds: parse(r.group_ids_json, []), status: r.status,
  sentCount: Number(r.sent_count), failedCount: Number(r.failed_count), approvedAt: r.approved_at, approvedBy: r.approved_by,
  sentAt: r.sent_at, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
});
const delivery = r => r && ({
  id: r.id, dispatchId: r.dispatch_id, groupId: r.group_id, recipientId: r.recipient_id, email: r.email, status: r.status,
  messageId: r.message_id, error: r.error, note: r.note, actor: r.actor, createdAt: r.created_at, updatedAt: r.updated_at,
});

const ITEM_COLS = { org: 'org', kind: 'kind', eventDate: 'event_date', title: 'title', summary: 'summary', body: 'body', photos: 'photos_json', visibility: 'visibility', status: 'status', updatedAt: 'updated_at', updatedBy: 'updated_by' };
const GROUP_COLS = { submitUrl: 'submit_url', contactEmail: 'contact_email', active: 'active', updatedAt: 'updated_at' };
const RECIPIENT_COLS = { name: 'name', phone: 'phone', note: 'note', unsubscribedAt: 'unsubscribed_at', updatedAt: 'updated_at' };
const DISPATCH_COLS = { subject: 'subject', body: 'body', status: 'status', sentCount: 'sent_count', failedCount: 'failed_count', approvedAt: 'approved_at', approvedBy: 'approved_by', sentAt: 'sent_at', updatedAt: 'updated_at' };

async function patchRow(DB, table, cols, id, patch) {
  const sets = []; const values = [];
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] === undefined) continue;
    sets.push(`${col}=?`);
    values.push(key === 'photos' ? JSON.stringify(patch[key]) : (patch[key] ?? ''));
  }
  if (sets.length) await DB.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE id=?`).bind(...values, id).run();
}

export function createD1Store(DB) {
  const first = async (sql, ...args) => DB.prepare(sql).bind(...args).first();
  const all = async (sql, ...args) => (await DB.prepare(sql).bind(...args).all()).results || [];
  const store = {
    async listItems() { return (await all('SELECT * FROM ministry_news_items ORDER BY event_date DESC, created_at DESC LIMIT 1000')).map(item); },
    async getItem(id) { return item(await first('SELECT * FROM ministry_news_items WHERE id=?', id)); },
    async createItem(i) {
      await DB.prepare(`INSERT INTO ministry_news_items (id,org,kind,event_date,title,summary,body,photos_json,visibility,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(i.id, i.org, i.kind, i.eventDate, i.title, i.summary, i.body, JSON.stringify(i.photos || []), i.visibility, i.status, i.createdAt, i.updatedAt, i.createdBy, i.updatedBy).run();
      return store.getItem(i.id);
    },
    async updateItem(id, patch) { await patchRow(DB, 'ministry_news_items', ITEM_COLS, id, patch); return store.getItem(id); },

    async listGroups() { return (await all('SELECT * FROM ministry_news_groups ORDER BY sort_order ASC')).map(group); },
    async getGroup(id) { return group(await first('SELECT * FROM ministry_news_groups WHERE id=?', id)); },
    async updateGroup(id, patch) { await patchRow(DB, 'ministry_news_groups', GROUP_COLS, id, patch); return store.getGroup(id); },

    async listRecipients(groupId) {
      return (groupId ? await all('SELECT * FROM ministry_news_recipients WHERE group_id=? ORDER BY created_at ASC', groupId)
        : await all('SELECT * FROM ministry_news_recipients ORDER BY created_at ASC LIMIT 20000')).map(recipient);
    },
    async getRecipient(id) { return recipient(await first('SELECT * FROM ministry_news_recipients WHERE id=?', id)); },
    async getRecipientByToken(token) { return token ? recipient(await first('SELECT * FROM ministry_news_recipients WHERE unsub_token=?', token)) : null; },
    async upsertRecipient({ groupId, name, email, phone, consentSource, consentBy }) {
      const existing = await first('SELECT id FROM ministry_news_recipients WHERE group_id=? AND email=?', groupId, email);
      const stamp = now();
      if (existing) {
        await DB.prepare(`UPDATE ministry_news_recipients SET name=CASE WHEN ?<>'' THEN ? ELSE name END, phone=CASE WHEN ?<>'' THEN ? ELSE phone END, consent_at=?, consent_source=?, consent_by=?, unsubscribed_at='', updated_at=? WHERE id=?`)
          .bind(name || '', name || '', phone || '', phone || '', stamp, consentSource, consentBy, stamp, existing.id).run();
        return { created: false, recipient: await store.getRecipient(existing.id) };
      }
      const id = `rcp-${crypto.randomUUID()}`;
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      await DB.prepare(`INSERT INTO ministry_news_recipients (id,group_id,name,email,phone,consent_at,consent_source,consent_by,unsub_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, groupId, name || '', email, phone || '', stamp, consentSource, consentBy, token, stamp, stamp).run();
      return { created: true, recipient: await store.getRecipient(id) };
    },
    async updateRecipient(id, patch) { await patchRow(DB, 'ministry_news_recipients', RECIPIENT_COLS, id, { ...patch, updatedAt: now() }); return store.getRecipient(id); },
    async deleteRecipient(id) { await DB.prepare('DELETE FROM ministry_news_recipients WHERE id=?').bind(id).run(); },

    async listDispatches(limit = 200) { return (await all('SELECT * FROM ministry_news_dispatches ORDER BY created_at DESC LIMIT ?', Math.min(1000, limit))).map(dispatch); },
    async getDispatch(id) { return dispatch(await first('SELECT * FROM ministry_news_dispatches WHERE id=?', id)); },
    async createDispatch(d) {
      await DB.prepare(`INSERT INTO ministry_news_dispatches (id,org,kind,subject,body,period_label,item_ids_json,group_ids_json,status,sent_count,failed_count,approved_at,approved_by,sent_at,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(d.id, d.org, d.kind, d.subject, d.body, d.periodLabel || '', JSON.stringify(d.itemIds), JSON.stringify(d.groupIds), d.status, 0, 0, '', '', '', d.createdAt, d.updatedAt, d.createdBy).run();
      return store.getDispatch(d.id);
    },
    async updateDispatch(id, patch) { await patchRow(DB, 'ministry_news_dispatches', DISPATCH_COLS, id, patch); return store.getDispatch(id); },

    async listDeliveries(dispatchId) { return (await all('SELECT * FROM ministry_news_deliveries WHERE dispatch_id=?', dispatchId)).map(delivery); },
    async claimDelivery({ id, dispatchId, groupId, recipientId, email }) {
      const stamp = now();
      const inserted = await DB.prepare(`INSERT OR IGNORE INTO ministry_news_deliveries (id,dispatch_id,group_id,recipient_id,email,status,created_at,updated_at) VALUES (?,?,?,?,?,'SENDING',?,?)`)
        .bind(id, dispatchId, groupId, recipientId, email, stamp, stamp).run();
      if (inserted.meta?.changes) return id;
      const stale = new Date(Date.now() - STALE_SENDING_MS).toISOString();
      const row = await first(`UPDATE ministry_news_deliveries SET status='SENDING', error='', updated_at=? WHERE dispatch_id=? AND recipient_id=? AND (status='FAILED' OR (status='SENDING' AND updated_at<?)) RETURNING id`, stamp, dispatchId, recipientId, stale);
      return row?.id || null;
    },
    async finishDelivery(id, { status, messageId = '', error = '' }) {
      await DB.prepare('UPDATE ministry_news_deliveries SET status=?, message_id=?, error=?, updated_at=? WHERE id=?').bind(status, messageId, error, now(), id).run();
    },
    async recordSubmission({ id, dispatchId, groupId, note, actor }) {
      const stamp = now();
      await DB.prepare(`INSERT OR IGNORE INTO ministry_news_deliveries (id,dispatch_id,group_id,recipient_id,status,note,actor,created_at,updated_at) VALUES (?,?,?,?,'SUBMITTED',?,?,?,?)`)
        .bind(id, dispatchId, groupId, `group:${groupId}`, note || '', actor || '', stamp, stamp).run();
    },
    async audit(e) {
      await DB.prepare('INSERT INTO ministry_news_audit_logs (actor_email,actor_user_id,action,target,detail,created_at) VALUES (?,?,?,?,?,?)')
        .bind(e.actorEmail || '', e.actorUserId || '', e.action, e.target || '', e.detail || '', now()).run();
    },
  };
  return store;
}
