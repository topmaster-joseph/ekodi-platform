// Atomic private publishing journal and outbox.
// The D1 batch API is transactional: edition state, audit and outbox commit
// together, or none of them commit. Failure is fail-closed.
// This ledger NEVER sends a public listing or commerce message.
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const validTime=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x);
const check=(ok,why)=>{if(!ok)throw new Error('PUBLISHING_ATOMIC:'+why);};
const eventKey=record=>record.editionId+':'+record.revision;
const event=(record,at)=>JSON.stringify({
  editionId:record.editionId,publicationId:record.publicationId,revision:record.revision,
  releaseDigest:record.releaseDigest,state:record.state,
  // No signed approvals, customer records, manuscript body, or private file pointers.
  publishAt:record.publishAt||null,occurredAt:at,
});
const identity=actor=>check(typeof actor==='string'&&ID.test(actor),'trusted-actor-required');
function statements(db,record,actor,nowIso){
  identity(actor);
  check(validTime(nowIso),'canonical-utc-clock-required');
  check(record&&ID.test(record.editionId||'')&&Number.isInteger(record.revision)&&
    record.revision>0&&/^sha256:[a-f0-9]{64}$/.test(record.releaseDigest||''),'invalid-edition');
  const raw=JSON.stringify(record),key=eventKey(record);
  // Construct the SQL explicitly below to avoid an untrusted/reused actor from
  // becoming part of an interpolated query.
  return {
    // A scalar subquery returns NULL if the preceding CAS/INSERT did not persist
    // this exact record. The NOT NULL constraint then fails the D1 batch, forcing
    // rollback instead of silently committing a zero-row INSERT ... SELECT.
    audit:db.prepare(`INSERT INTO publishing_release_audit
      (edition_id,revision,transition,actor_id,release_digest,recorded_at_utc)
      VALUES ((SELECT edition_id FROM publishing_private_editions
        WHERE edition_id=? AND revision=? AND record_json=?),?,?,?,?,?)`)
      .bind(record.editionId,record.revision,raw,record.revision,
        String(record.lastTransition||record.state).slice(0,160),
        actor,record.releaseDigest,nowIso),
    outbox:db.prepare(`INSERT INTO publishing_release_outbox
      (event_key,edition_id,revision,release_digest,event_type,payload_json,created_at_utc)
      VALUES (?,(SELECT edition_id FROM publishing_private_editions
        WHERE edition_id=? AND revision=? AND record_json=?),?,
        ?,'publishing.edition.state.v1',?,?)`)
      .bind(key,record.editionId,record.revision,raw,record.revision,
        record.releaseDigest,event(record,nowIso),nowIso),
  };
}
function validateBatch(results) {
  check(Array.isArray(results)&&results.length===3,'transaction-unavailable');
  // D1 returns meta.changes for each statement; do not accept an ambiguous
  // or partially applied transaction as successful.
  check(results.every(x=>x?.success!==false && Number(x?.meta?.changes)===1),
    'stale-or-audit-outbox-missing');
}
function insertStatement(db,record,nowIso){
  return db.prepare(`INSERT OR IGNORE INTO publishing_private_editions
      (edition_id,publication_id,author_id,title,release_digest,state,visibility,
       checkout_enabled,publish_at_utc,revision,record_json,created_at_utc,updated_at_utc)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(record.editionId,record.publicationId,record.authorId,record.title,
      record.releaseDigest,record.state,record.visibility,record.checkoutEnabled?1:0,
      record.publishAt||null,record.revision,JSON.stringify(record),nowIso,nowIso);
}
function updateStatement(db,previous,record,nowIso){
  check(previous?.editionId===record.editionId&&
    previous?.publicationId===record.publicationId&&
    previous?.releaseDigest===record.releaseDigest&&
    previous?.authorId===record.authorId&&previous?.title===record.title&&
    previous?.createdAt===record.createdAt&&
    record.revision===previous.revision+1,'immutable-edition');
  return db.prepare(`UPDATE publishing_private_editions
      SET state=?,visibility=?,checkout_enabled=?,publish_at_utc=?,revision=?,
          record_json=?,updated_at_utc=?
      WHERE edition_id=? AND revision=? AND state=? AND release_digest=?`)
    .bind(record.state,record.visibility,record.checkoutEnabled?1:0,
      record.publishAt||null,record.revision,JSON.stringify(record),nowIso,
      previous.editionId,previous.revision,previous.state,previous.releaseDigest);
}
export async function commitPrivateRegistration(db,record,actor,nowIso) {
  check(typeof db?.batch==='function','atomic-batch-required');
  check(record?.state==='private_registered'&&record.revision===1 &&
    record.visibility==='private'&&record.checkoutEnabled===false,'private-registration-only');
  const aux=statements(db,record,actor,nowIso);
  const result=await db.batch([insertStatement(db,record,nowIso),aux.audit,aux.outbox]);
  validateBatch(result);
  return {editionId:record.editionId,revision:record.revision};
}
export async function commitPrivateTransition(db,previous,next,actor,nowIso) {
  check(typeof db?.batch==='function','atomic-batch-required');
  check(next?.state==='released'?
    next.visibility==='public'&&next.checkoutEnabled===true:
    next?.visibility==='private'&&next?.checkoutEnabled===false,'visibility-fail-closed');
  const aux=statements(db,next,actor,nowIso);
  const result=await db.batch([updateStatement(db,previous,next,nowIso),aux.audit,aux.outbox]);
  validateBatch(result);
  return {editionId:next.editionId,revision:next.revision,state:next.state};
}
export async function listPrivateOutbox(db,limit=50) {
  check(typeof db?.prepare==='function'&&Number.isInteger(limit)&&limit>=1&&limit<=100,
    'outbox-db-or-limit');
  const result=await db.prepare(`SELECT event_key,edition_id,revision,event_type,
    payload_json,attempts,created_at_utc FROM publishing_release_outbox
    WHERE delivered_at_utc IS NULL ORDER BY created_at_utc,edition_id LIMIT ?`)
    .bind(limit).all();
  return result.results||[];
}
