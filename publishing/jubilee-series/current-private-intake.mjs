// Protected server-only current Jubilee intake (vol.1 review-9, vol.2 review-10).
// This module is not routed from the public Worker. Manuscript bytes remain private.
const HASH=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const REQUIRED=Object.freeze([
  ['volume1/review9/manuscript.docx','review-9'],
  ['volume1/review9/reading.pdf','review-9'],
  ['volume1/review9/accessible.epub','review-9-a11y-20261102'],
  ['volume2/review10/manuscript.docx','review-10-editorial-candidate'],
  ['volume2/review10/reading.pdf','review-10-editorial-candidate'],
  ['volume2/review10/accessible.epub','review-10-editorial-a11y-candidate'],
]);
const fail=(why)=>{throw Error('CURRENT_JUBILEE_INGEST_REJECTED:'+why);};
const requireTrue=(condition,why)=>{if(!condition)fail(why);};
const asBytes=value=>value instanceof Uint8Array?value:
  value instanceof ArrayBuffer?new Uint8Array(value):null;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
  .map(b=>b.toString(16).padStart(2,'0')).join('');
const safeKey=(expected,record)=>
  'private/editorial/v2/'+expected.handoffId+'/'+record.sha256+'.'+record.path.split('.').at(-1);

/**
 * expected is a publisher-controlled, SHA-pinned intent, not browser JSON.
 * readAsset is an authenticated publisher transport of current/<manifest path>.
 * Neither method exposes an HTTP upload or accepts a client-supplied storage key.
 */
export async function stageCurrentJubileeIntoPrivateR2({
  env,callerContext,expected,manifestBytes,readAsset,projectIds,
}={}){
  requireTrue(env?.PUBLISHING_PRIVATE_ASSETS?.put&&env?.PUBLISHING_PRIVATE_ASSETS?.get &&
    typeof env?.PUBLISHING_INGEST_AUTH?.verifyServiceCaller==='function'&&
    typeof env?.PUBLISHING_INGEST_RECEIPTS?.persistReadbackReceipt==='function'&&
    typeof readAsset==='function','private-service-bindings');
  requireTrue(expected?.schemaVersion===2&&expected?.seriesId==='EKODI-JUBILEE-THEOLOGY'&&
    ID.test(expected?.handoffId||'')&&HASH.test(expected?.artifactPackage?.manifestSha256||'')&&
    Array.isArray(expected?.primaryFiles)&&expected.primaryFiles.length===6,
    'trusted-intent');
  requireTrue(projectIds&&ID.test(projectIds.volume1||'')&&ID.test(projectIds.volume2||'')&&
    projectIds.volume1!==projectIds.volume2,'verified-project-link-required');
  const identity=await env.PUBLISHING_INGEST_AUTH.verifyServiceCaller(callerContext,{
    capability:'publishing.private-ingest',seriesId:expected.seriesId,
  });
  requireTrue(identity?.authorized===true&&identity.serviceId==='publisher-private-ingestion'&&
    ID.test(identity.actorId||''),'publisher-identity');
  const raw=asBytes(manifestBytes);
  requireTrue(raw&&raw.byteLength>300&&raw.byteLength<30000,'manifest-size');
  requireTrue(await sha(raw)===expected.artifactPackage.manifestSha256,'manifest-sha256');
  let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{fail('manifest-json');}
  requireTrue(manifest?.series==='에코디 희년신학 시리즈'&&
    manifest.status==='EDITORIAL_AND_AUTOMATED_CHECKS_COMPLETE__AUTHENTICATED_REGISTRATION_PENDING'&&
    manifest.publisherIngestCompleted===false&&manifest.authorFinalApproval===false&&
    manifest.publisherFinalApproval===false&&manifest.publicOrSaleEnabled===false&&
    manifest.projectIds?.volume1===null&&manifest.projectIds?.volume2===null,
    'unapproved-source-only');
  requireTrue(Array.isArray(manifest.primaryFiles)&&manifest.primaryFiles.length===6,
    'six-primary-files-required');
  requireTrue(expected.release?.authorApproved===false&&
    expected.release?.publisherApproved===false&&expected.release?.publicCatalog===false&&
    expected.release?.checkoutEnabled===false&&expected.release?.saleAllowed===false&&
    expected.release?.priceKrw===null&&expected.release?.isbn===null,
    'trusted-publication-gate');
  const seen=new Set(),source=[];
  for(const [path,edition] of REQUIRED){
    const x=manifest.primaryFiles.find(f=>f.path===path);
    const pin=expected.primaryFiles.find(f=>f.path===path);
    requireTrue(x&&pin&&x.edition===edition&&pin.edition===edition&&
      x.path===pin.path&&HASH.test(pin.sha256||'')&&
      x.sha256===pin.sha256&&Number.isSafeInteger(pin.bytes)&&
      pin.bytes>0&&pin.bytes<=30000000&&x.bytes===pin.bytes,'file-manifest-pin');
    requireTrue(!seen.has(x.path),'duplicate-file');
    seen.add(x.path);
    const body=asBytes(await readAsset('current/'+x.path));
    requireTrue(body&&body.byteLength===pin.bytes&&await sha(body)===pin.sha256,
      'source-byte-sha256');
    source.push({record:pin,body});
  }
  requireTrue(manifest.primaryFiles.every(x=>seen.has(x.path)),'unexpected-extra-asset');
  // Preflight every file before any private R2 mutation.
  const objects=[];
  for(const {record,body} of source){
    const key=safeKey(expected,record);
    await env.PUBLISHING_PRIVATE_ASSETS.put(key,body,{
      onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'},
      customMetadata:{seriesId:expected.seriesId,source:'private-editorial-v2',privacy:'private'},
    });
    const reread=await env.PUBLISHING_PRIVATE_ASSETS.get(key);
    requireTrue(reread&&typeof reread.arrayBuffer==='function','private-readback-missing');
    const stored=asBytes(await reread.arrayBuffer());
    requireTrue(stored&&stored.byteLength===record.bytes&&
      await sha(stored)===record.sha256,'private-readback-mismatch');
    objects.push({path:record.path,edition:record.edition,kind:record.path.split('.').at(-1),
      sha256:record.sha256,bytes:record.bytes,objectKey:key});
  }
  const proposal=Object.freeze({
    handoffId:expected.handoffId,seriesId:expected.seriesId,sourceRevision:'review-9+review-10',
    manifestSha256:expected.artifactPackage.manifestSha256,actorId:identity.actorId,
    projectIds:{...projectIds},objects,stage:'private-editorial-ingested',
    visibility:'private',authorApproved:false,publisherApproved:false,
    checkoutEnabled:false,publicCatalog:false,scheduledReleaseAt:null,
  });
  const receipt=await env.PUBLISHING_INGEST_RECEIPTS.persistReadbackReceipt(proposal);
  requireTrue(receipt?.persisted===true&&receipt.handoffId===proposal.handoffId&&
    receipt.manifestSha256===proposal.manifestSha256&&
    receipt.revision===proposal.sourceRevision&&receipt.objectCount===6&&
    typeof receipt.auditId==='string'&&receipt.auditId.length>=3,
    'durable-audit-readback-required');
  return Object.freeze({
    handoffId:proposal.handoffId,stage:proposal.stage,objectCount:6,
    privateR2ReadbackVerified:true,privatePublisherDbReceiptVerified:true,
    auditId:receipt.auditId,authorApproved:false,publisherApproved:false,
    checkoutEnabled:false,publicCatalog:false,
  });
}
