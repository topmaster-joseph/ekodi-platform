// Private-only D1 adapter for a nine-object readback receipt.
// Called solely by a server-verified publisher intake service; never by the browser.
// A second identical call is idempotent. All changes are audited in one D1 batch.
const HASH=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const guard=(v,s)=>{if(!v)throw Error('PRIVATE_INGEST_RECEIPT_REJECTED:'+s);};
const utc=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&
  Number.isFinite(Date.parse(s));

function validate(candidate,at){
  guard(candidate&&ID.test(candidate.handoffId||'')&&
    candidate.seriesId==='EKODI-JUBILEE-THEOLOGY'&&
    candidate.sourceRevision==='review-9'&&
    HASH.test(candidate.manifestSha256||'')&&ID.test(candidate.actorId||'')&&
    candidate.stage==='private-editorial-ingested'&&candidate.visibility==='private'&&
    candidate.authorApproved===false&&candidate.publisherApproved===false&&
    candidate.checkoutEnabled===false&&candidate.publicCatalog===false&&
    candidate.scheduledReleaseAt===null&&utc(at),'candidate-fail-closed');
  guard(Array.isArray(candidate.objects)&&candidate.objects.length===9,'object-count');
  const seen=new Set();
  for(const x of candidate.objects){
    guard(x&&/^(editions\/(01|02)\/|editorial\/)[^\/\\]+\.(docx|epub|pdf|md|json)$/.test(x.path||'')&&
      HASH.test(x.sha256||'')&&
      x.objectKey==='private/editorial/'+candidate.handoffId+'/'+x.sha256+'.'+x.kind &&
      x.kind===x.path.split('.').at(-1)&&
      Number.isSafeInteger(x.bytes)&&x.bytes>0&&x.bytes<=30_000_000 &&
      !seen.has(x.path),'object-record');
    seen.add(x.path);
  }
  for(const n of ['01','02'])for(const ext of ['docx','epub','pdf'])
    guard(candidate.objects.filter(x=>x.path.startsWith('editions/'+n+'/')&&x.kind===ext).length===1,
      'edition-file');
  guard(candidate.objects.filter(x=>x.path.startsWith('editorial/')).length===3,'editorial-files');
}
const receipt=x=>({
  persisted:true,handoffId:x.handoff_id,manifestSha256:x.manifest_sha256,
  revision:x.source_revision,objectCount:x.object_count,
  auditId:x.audit_id,
});
export async function persistPrivateReview9Receipt(db,candidate,nowIso){
  guard(db?.batch&&db?.prepare,'d1-batch-required');
  validate(candidate,nowIso);
  const payload=JSON.stringify(candidate);
  const auditId=candidate.handoffId+':ingest-audit-v1';
  const read=async()=>await db.prepare(`SELECT r.handoff_id,r.manifest_sha256,
    r.source_revision,r.object_count,a.audit_id,r.receipt_json,r.actor_id
    FROM publishing_private_handoff_receipts r
    JOIN publishing_private_handoff_audit a ON a.handoff_id=r.handoff_id
    WHERE r.handoff_id=? AND a.action='private-r2-readback-verified'`)
    .bind(candidate.handoffId).first();
  const existing=await read();
  if(existing){
    guard(existing.manifest_sha256===candidate.manifestSha256 &&
      existing.receipt_json===payload && existing.actor_id===candidate.actorId &&
      existing.object_count===9,'conflicting-ingest-receipt');
    return receipt(existing);
  }
  const statements=[
    db.prepare(`INSERT OR IGNORE INTO publishing_private_handoff_receipts
      (handoff_id,source_revision,manifest_sha256,actor_id,state,object_count,receipt_json,created_at_utc)
      VALUES (?,?,?,?,'private-editorial-ingested',9,?,?)`)
      .bind(candidate.handoffId,'review-9',candidate.manifestSha256,
        candidate.actorId,payload,nowIso),
    db.prepare(`INSERT INTO publishing_private_handoff_audit
      (audit_id,handoff_id,manifest_sha256,actor_id,action,created_at_utc)
      VALUES (?,(SELECT handoff_id FROM publishing_private_handoff_receipts
        WHERE handoff_id=? AND manifest_sha256=? AND receipt_json=?),?,?,
        'private-r2-readback-verified',?)`)
      .bind(auditId,candidate.handoffId,candidate.manifestSha256,payload,
        candidate.manifestSha256,candidate.actorId,nowIso),
  ];
  // SQL NULL/UNIQUE constraints force the whole batch to roll back when a
  // stale or conflicting candidate is being inserted concurrently.
  const results=await db.batch(statements);
  guard(Array.isArray(results)&&results.length===2&&results.every(v=>
    v?.success!==false&&v?.meta?.changes===1),'transactional-audit-required');
  const recorded=await read();
  guard(recorded?.receipt_json===payload&&recorded?.audit_id===auditId&&
    recorded?.manifest_sha256===candidate.manifestSha256,'db-readback-mismatch');
  return receipt(recorded);
}
