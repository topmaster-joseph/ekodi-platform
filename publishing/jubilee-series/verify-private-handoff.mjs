// EKODI Publisher: offline SHA-256 verification of review-9 private handoff folder.
// NO uploads, no GitHub manuscript files, no author/publisher signature or sale.
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, dirname, sep, isAbsolute } from 'node:path';
const hash=v=>createHash('sha256').update(v).digest('hex');
const hex=/^[0-9a-f]{64}$/;
const ok=(v,msg)=>{if(!v)throw Error('PRIVATE_HANDOFF_REJECTED:'+msg);};
export async function verifyJubileePrivateHandoff(sourceRoot){
 const root=await realpath(resolve(sourceRoot));
 const source=await readFile(resolve(root,'manifest.json'));
 const manifest=JSON.parse(source.toString('utf8'));
 ok(manifest.schemaVersion===1&&manifest.packageType==='ekodi-private-editorial-ingest'&&
    manifest.seriesId==='EKODI-JUBILEE-THEOLOGY'&&manifest.sourceRevision==='review-9',
    'package-identity');
 ok(manifest.packageStatus==='handoff-file-ready-not-yet-ingested','premature-ingestion');
 const p=manifest.privateIngress;
 ok(p?.registeredInEKODIPublisherR2===false&&
    p?.registeredInEKODIPublisherDB===false&&p?.verifiedStorageReadback===false&&
    p?.authorApproval===false&&p?.publisherApproval===false&&
    p?.publicCatalog===false&&p?.checkoutEnabled===false&&p?.releaseDate===null,
    'premature-release');
 ok(Array.isArray(manifest.volumes)&&manifest.volumes.length===2&&
    manifest.volumes[0]?.reviewId==='EJT-01-REVIEW'&&
    manifest.volumes[1]?.reviewId==='EJT-02-REVIEW','volume-map');
 ok(Array.isArray(manifest.fileDigests)&&manifest.fileDigests.length===9&&
    manifest.sourceVerification?.fileCount===9,'asset-count');
 const seen=new Set(),entries=[];
 for(const f of manifest.fileDigests){
   const part=f.path;
   ok(typeof part==='string'&&part.length<260&&part.length>4&&
      !isAbsolute(part)&&!part.includes('\\')&&
      !part.split('/').some(x=>x===''||x==='.'||x==='..'), 'unsafe-path');
   ok(!seen.has(part),'duplicate-path');seen.add(part);
   const full=resolve(root,part);
   ok(full.startsWith(root+sep),'path-escape');
   let at=full;
   while(at!==root){ const st=await lstat(at);ok(!st.isSymbolicLink(),'symlink');at=dirname(at); }
   ok(hex.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&
     f.bytes<30_000_000&&part.endsWith('.'+f.kind),'file-metadata');
   const data=await readFile(full);
   ok(data.length===f.bytes&&hash(data)===f.sha256,'digest:'+part);
   entries.push(f);
 }
 for(const v of ['01','02'])for(const ext of ['docx','epub','pdf'])
   ok(entries.filter(f=>f.path.startsWith('editions/'+v+'/')&&
      f.path.endsWith('.'+ext)).length===1,'required-'+v+'-'+ext);
 ok(entries.filter(f=>f.path.startsWith('editorial/')).length===3,'editorial-records');
 return Object.freeze({seriesId:manifest.seriesId,sourceRevision:manifest.sourceRevision,
    verifiedFiles:entries.length,manifestSha256:hash(source),
    bytes:entries.reduce((a,f)=>a+f.bytes,0),
    state:'local-file-integrity-verified',
    privatePublisherStorageVerified:false,authorApproved:false,
    publisherApproved:false,salesEnabled:false});
}
