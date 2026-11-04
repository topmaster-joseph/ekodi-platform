// Only called by a server-verified publisher ingest service; no public route.
const HASH=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const check=(value,reason)=>{if(!value)throw Error('PRIVATE_CURRENT_RECEIPT_REJECTED:'+reason);};
const REQUIRED=new Map([
  ['volume1/review9/manuscript.docx','review-9'],
  ['volume1/review9/reading.pdf','review-9'],
  ['volume1/review9/accessible.epub','review-9-a11y-20261102'],
  ['volume2/review10/manuscript.docx','review-10-editorial-candidate'],
  ['volume2/review10/reading.pdf','review-10-editorial-candidate'],
  ['volume2/review10/accessible.epub','review-10-editorial-a11y-candidate'],
]);
function validate(x,at){
  check(x&&ID.test(x.handoffId||'')&&
    x.seriesId==='EKODI-JUBILEE-THEOLOGY'&&
    x.sourceRevision==='review-9+review-10'&&
    HASH.test(x.manifestSha256||'')&&ID.test(x.actorId||'')&&
    !Number.isNaN(Date.parse(at)),'trusted-candidate');
  check(x.stage==='private-editorial-ingested'&&x.visibility==='private'&&
    x.authorApproved===false&&x.publisherApproved===false&&
    x.checkoutEnabled===false&&x.publicCatalog===false&&
    x.scheduledReleaseAt===null,'release-gate');
  check(ID.test(x.projectIds?.volume1||'')&&ID.test(x.projectIds?.volume2||'')&&
    x.projectIds.volume1!==x.projectIds.volume2,'project-binding');
  check(Array.isArray(x.objects)&&x.objects.length===6,'file-count');
  const paths=new Set();
  for(const item of x.objects){
    const ext=item.path?.split('.').at(-1);
    check(REQUIRED.get(item.path)===item.edition&&
      ext===item.kind&&HASH.test(item.sha256||'')&&
      Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=30000000&&
      item.objectKey==='private/editorial/v2/'+x.handoffId+'/'+item.sha256+'.'+ext&&
      !paths.has(item.path),'file');
    paths.add(item.path);
  }
  check([...REQUIRED.keys()].every(x=>paths.has(x)),'missing-files');
}
const receipt=x=>({persisted:true,handoffId:x.handoff_id,
  manifestSha256:x.manifest_sha256,revision:x.source_revision,
  objectCount:x.object_count,auditId:x.audit_id});
export async function persistCurrentJubileeReceipt(db,proposal,nowIso){
  check(db?.prepare&&db?.batch,'d1-batch-required');
  validate(proposal,nowIso);
  const payload=JSON.stringify(proposal);
  const auditId=proposal.handoffId+':current-intake-audit-v2';
  const read=async()=>db.prepare(
    "SELECT r.handoff_id,r.manifest_sha256,r.source_revision,r.object_count,r.actor_id,"+
    "r.project1_id,r.project2_id,r.receipt_json,a.audit_id "+
    "FROM publishing_private_current_receipts r "+
    "JOIN publishing_private_current_audit a ON a.handoff_id=r.handoff_id "+
    "WHERE r.handoff_id=? AND a.action='private-r2-readback-verified'")
    .bind(proposal.handoffId).first();
  const existing=await read();
  if(existing){
    check(existing.manifest_sha256===proposal.manifestSha256&&
      existing.receipt_json===payload&&existing.actor_id===proposal.actorId&&
      existing.project1_id===proposal.projectIds.volume1&&
      existing.project2_id===proposal.projectIds.volume2&&
      existing.object_count===6,'conflicting-receipt');
    return receipt(existing);
  }
  const batch=[
    db.prepare("INSERT OR IGNORE INTO publishing_private_current_receipts "+
      "(handoff_id,source_revision,manifest_sha256,actor_id,project1_id,project2_id,"+
      "state,object_count,receipt_json,created_at_utc) "+
      "VALUES (?,?,?,?,?,?,'private-editorial-ingested',6,?,?)")
      .bind(proposal.handoffId,proposal.sourceRevision,proposal.manifestSha256,
        proposal.actorId,proposal.projectIds.volume1,proposal.projectIds.volume2,payload,nowIso),
    db.prepare("INSERT INTO publishing_private_current_audit "+
      "(audit_id,handoff_id,manifest_sha256,actor_id,action,created_at_utc) "+
      "VALUES (?,(SELECT handoff_id FROM publishing_private_current_receipts "+
      "WHERE handoff_id=? AND manifest_sha256=? AND receipt_json=?),?,?,"+
      "'private-r2-readback-verified',?)")
      .bind(auditId,proposal.handoffId,proposal.manifestSha256,payload,
        proposal.manifestSha256,proposal.actorId,nowIso),
  ];
  const out=await db.batch(batch);
  check(Array.isArray(out)&&out.length===2&&out.every(x=>
    x?.success!==false&&x?.meta?.changes===1),'atomic-receipt-required');
  const saved=await read();
  check(saved?.receipt_json===payload&&saved.audit_id===auditId&&
    saved.manifest_sha256===proposal.manifestSha256,'readback');
  return receipt(saved);
}
