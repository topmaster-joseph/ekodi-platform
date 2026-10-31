// 출판: server-only private R2 manuscript intake; no HTTP handler, no sales.
// A trusted agent must first validate the ZIP and pass the original manifest
// bytes + the nine files through a protected server binding. Not browser JSON.
const HASH=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const check=(v,why)=>{if(!v)throw Error('PRIVATE_R2_INGEST_REJECTED:'+why);};
const digest=async bytes=>{
  const out=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(out)).map(x=>x.toString(16).padStart(2,'0')).join('');
};
const bytes=v=>v instanceof Uint8Array?v:v instanceof ArrayBuffer?new Uint8Array(v):null;
const safePath=p=>typeof p==='string'&&p.length<260&&
  /^(editions\/(?:01|02)\/|editorial\/)[^\/\\]+\.(?:epub|pdf|docx|md|json)$/.test(p)&&
  !p.includes('..');
const readonly=record=>Object.freeze(record);

/**
 * Auth and object-store bindings are mandatory; this code is NOT wired to an
 * internet route. Confirm the true signed identity before calling, not merely
 * a browser-supplied role or boolean.
 */
export async function stageReview9IntoPrivateR2({
  env,callerContext,expected,manifestBytes,readAsset,
}={}){
  check(env?.PUBLISHING_PRIVATE_ASSETS?.put&&env?.PUBLISHING_PRIVATE_ASSETS?.get &&
    typeof env?.PUBLISHING_INGEST_AUTH?.verifyServiceCaller==='function'&&
    typeof env?.PUBLISHING_INGEST_RECEIPTS?.persistReadbackReceipt==='function' &&
    typeof readAsset==='function','private-bindings-not-configured');
  check(expected?.seriesId==='EKODI-JUBILEE-THEOLOGY'&&
    expected?.sourceRevision==='review-9'&&
    ID.test(expected?.handoffId||'')&&HASH.test(expected?.artifactPackage?.manifestSha256||''),
    'trusted-intent-invalid');
  const auth=await env.PUBLISHING_INGEST_AUTH.verifyServiceCaller(callerContext,{
    capability:'publishing.private-ingest',seriesId:expected.seriesId,
  });
  check(auth?.authorized===true&&auth?.serviceId==='publisher-private-ingestion'&&
    ID.test(auth?.actorId||''),'publisher-principal-not-verified');
  const encoded=bytes(manifestBytes);
  check(encoded&&encoded.byteLength>200&&encoded.byteLength<200_000,'manifest-size');
  check(await digest(encoded)===expected.artifactPackage.manifestSha256,'manifest-digest');
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));
  check(manifest.schemaVersion===1&&manifest.packageType==='ekodi-private-editorial-ingest'&&
    manifest.seriesId===expected.seriesId&&manifest.sourceRevision===expected.sourceRevision&&
    manifest.packageStatus==='handoff-file-ready-not-yet-ingested','manifest-state');
  const ingress=manifest.privateIngress||{};
  for(const flag of ['registeredInEKODIPublisherR2','registeredInEKODIPublisherDB',
    'verifiedStorageReadback','authorApproval','publisherApproval','publicCatalog','checkoutEnabled'])
    check(ingress[flag]===false,'premature-release-'+flag);
  check(ingress.releaseDate===null&&ingress.priceKrw===null&&
    ingress.ISBN===null,'commercial-attributes');
  check(Array.isArray(manifest.fileDigests)&&manifest.fileDigests.length===9,'file-count');
  const volumes=new Map((expected.volumeAssets||[]).map(v=>[v.reviewId,v]));
  check(volumes.size===2&&volumes.has('EJT-01-REVIEW')&&volumes.has('EJT-02-REVIEW'),
    'edition-map');
  const seen=new Set(),plan=[];
  for(const x of manifest.fileDigests){
    check(safePath(x.path)&&!seen.has(x.path)&&HASH.test(x.sha256||'')&&
      Number.isInteger(x.bytes)&&x.bytes>0&&x.bytes<=30_000_000 &&
      x.kind===x.path.split('.').at(-1),'file-record');
    seen.add(x.path);
    const group=/^editions\/(01|02)\/[^/]+\.(epub|pdf|docx)$/.exec(x.path);
    if(group){
      check(x.sha256===volumes.get('EJT-'+group[1]+'-REVIEW')?.[group[2]+'Sha256'],
        'edition-digest-mismatch');
    }
    // Content-addressed immutable private keys; never use original manuscript
    // basename, author identity, URL or client-provided storage path.
    const key='private/editorial/'+expected.handoffId+'/'+x.sha256+'.'+x.kind;
    plan.push({record:x,key,contentType:'application/octet-stream'});
  }
  for(const n of ['01','02'])for(const ext of ['epub','docx','pdf'])
    check(plan.filter(x=>x.record.path.startsWith('editions/'+n+'/')&&
      x.record.kind===ext).length===1,'missing-edition-file');
  check(plan.filter(x=>x.record.path.startsWith('editorial/')).length===3,'missing-editorial');
  const stored=[];
  for(const item of plan){
    const incoming=bytes(await readAsset(item.record.path));
    check(incoming&&incoming.byteLength===item.record.bytes&&
      await digest(incoming)===item.record.sha256,'source-sha256');
    // Atomic create-once. For an existing key, verify instead of overwriting.
    const inserted=await env.PUBLISHING_PRIVATE_ASSETS.put(item.key,incoming,{
      onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:item.contentType,cacheControl:'private, no-store'},
      customMetadata:{seriesId:expected.seriesId,revision:'review-9',privacy:'private'},
    });
    const saved=await env.PUBLISHING_PRIVATE_ASSETS.get(item.key);
    check(saved&&typeof saved.arrayBuffer==='function','readback-missing');
    const actual=bytes(await saved.arrayBuffer());
    check(actual&&actual.byteLength===item.record.bytes&&
      await digest(actual)===item.record.sha256,'readback-sha256');
    stored.push({kind:item.record.kind,path:item.record.path,
      objectKey:item.key,sha256:item.record.sha256,bytes:item.record.bytes});
  }
  check(stored.length===9,'partial-ingestion');
  const proposed=readonly({
    handoffId:expected.handoffId,seriesId:expected.seriesId,sourceRevision:'review-9',
    manifestSha256:expected.artifactPackage.manifestSha256,actorId:auth.actorId,
    objects:stored,stage:'private-editorial-ingested',visibility:'private',
    authorApproved:false,publisherApproved:false,checkoutEnabled:false,
    publicCatalog:false,scheduledReleaseAt:null,
  });
  // Durable receipt must be bound to the same manifest and user identity by
  // the publisher-owned DB's atomic audit/version transaction.
  const receipt=await env.PUBLISHING_INGEST_RECEIPTS.persistReadbackReceipt(proposed);
  check(receipt?.persisted===true&&receipt?.handoffId===proposed.handoffId&&
    receipt?.manifestSha256===proposed.manifestSha256&&
    receipt?.revision==='review-9'&&receipt?.objectCount===9 &&
    typeof receipt?.auditId==='string'&&receipt.auditId.length>=3,
    'transactional-ingest-receipt-missing');
  return readonly({
    handoffId:expected.handoffId,manifestSha256:proposed.manifestSha256,
    stage:'private-editorial-ingested',objectCount:9,
    privateR2ReadbackVerified:true,privatePublisherDbReceiptVerified:true,
    auditId:receipt.auditId,publicCatalog:false,checkoutEnabled:false,
    authorApproved:false,publisherApproved:false,
  });
}
