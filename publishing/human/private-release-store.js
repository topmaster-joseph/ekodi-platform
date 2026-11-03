// EKODI publisher-owned isolated private D1 registration store.
// Only the authenticated Publishing backend may call this module; it exposes no public endpoints.
// A scheduled Worker must be configured separately by the protected release pipeline.
const STATES = new Set(['private_registered','scheduled','preparing','prepared','activating',
  'ready_to_release','released','cancelled','blocked']);
const invariant = (ok, reason) => { if (!ok) throw new Error('PRIVATE_RELEASE_STORE:' + reason); };
const digestOk = v => /^sha256:[a-f0-9]{64}$/.test(v || '');
const check = r => {
  invariant(r && typeof r.editionId === 'string' && r.editionId.length >= 3 &&
    r.editionId.length <= 160 && digestOk(r.releaseDigest) &&
    STATES.has(r.state) && Number.isInteger(r.revision) && r.revision > 0, 'invalid-record');
  invariant(r.state === 'released' ? r.visibility === 'public' && r.checkoutEnabled === true :
    r.visibility === 'private' && r.checkoutEnabled === false, 'visibility-fail-closed');
  invariant(!['scheduled','preparing','prepared','activating','ready_to_release','released'].includes(r.state) ||
    typeof r.publishAt === 'string', 'schedule-required');
};
const row = (r, time) => ({
  editionId:r.editionId, publicationId:r.publicationId, authorId:r.authorId, title:r.title,
  digest:r.releaseDigest, state:r.state, visibility:r.visibility, checkout:r.checkoutEnabled?1:0,
  publishAt:r.publishAt || null, revision:r.revision, recordJson:JSON.stringify(r), time,
});
export async function storePrivateEdition(db, record, nowIso) {
  invariant(db?.prepare && typeof nowIso === 'string', 'unavailable');
  check(record);
  invariant(record.state === 'private_registered' && record.revision === 1, 'not-first-private-registration');
  const v=row(record,nowIso);
  const result=await db.prepare(`INSERT OR IGNORE INTO publishing_private_editions
    (edition_id,publication_id,author_id,title,release_digest,state,visibility,
     checkout_enabled,publish_at_utc,revision,record_json,created_at_utc,updated_at_utc)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(v.editionId,v.publicationId,v.authorId,v.title,v.digest,v.state,v.visibility,
      v.checkout,v.publishAt,v.revision,v.recordJson,v.time,v.time).run();
  invariant(result?.meta?.changes === 1, 'edition-exists-or-write-failed');
  return { editionId:record.editionId,revision:record.revision };
}
export async function readPrivateEdition(db, editionId) {
  invariant(db?.prepare, 'unavailable');
  const result=await db.prepare('SELECT record_json FROM publishing_private_editions WHERE edition_id=?')
    .bind(editionId).first();
  if (!result) return null;
  const record=JSON.parse(result.record_json);
  check(record);
  return record;
}
export async function savePrivateTransition(db, previous, next, nowIso) {
  invariant(db?.prepare && typeof nowIso === 'string', 'unavailable');
  check(previous);check(next);
  invariant(next.editionId === previous.editionId && next.publicationId === previous.publicationId &&
    next.releaseDigest === previous.releaseDigest && next.revision === previous.revision+1,
    'immutable-edition-or-stale-revision');
  const v=row(next,nowIso);
  const result=await db.prepare(`UPDATE publishing_private_editions
      SET state=?, visibility=?, checkout_enabled=?, publish_at_utc=?, revision=?,
          record_json=?, updated_at_utc=?
      WHERE edition_id=? AND revision=? AND release_digest=? AND state=?`)
    .bind(v.state,v.visibility,v.checkout,v.publishAt,v.revision,v.recordJson,v.time,
      v.editionId,previous.revision,previous.releaseDigest,previous.state).run();
  invariant(result?.meta?.changes === 1, 'stale-revision-or-write-failed');
  return { editionId:next.editionId,revision:next.revision,state:next.state };
}
export async function listDuePrivateEditions(db, nowIso, max=20) {
  invariant(db?.prepare && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(nowIso), 'utc-clock-required');
  invariant(Number.isInteger(max) && max > 0 && max <= 100, 'limit');
  const result=await db.prepare(`SELECT record_json FROM publishing_private_editions
    WHERE state IN ('scheduled','preparing','prepared','activating','ready_to_release')
      AND publish_at_utc <= ? ORDER BY publish_at_utc, edition_id LIMIT ?`).bind(nowIso,max).all();
  return (result.results || []).map(r => { const item=JSON.parse(r.record_json);check(item);return item; });
}

/** Publisher-admin only: non-public edition queue, newest edits first. */
export async function listPrivateReleaseRecords(db, max=50) {
  invariant(db?.prepare && Number.isInteger(max) && max > 0 && max <= 100, 'invalid-list');
  const result=await db.prepare(`SELECT record_json FROM publishing_private_editions
    ORDER BY updated_at_utc DESC, edition_id LIMIT ?`).bind(max).all();
  return (result.results || []).map(row => {
    const record=JSON.parse(row.record_json); check(record); return record;
  });
}
