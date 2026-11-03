import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyJubileePrivateHandoff } from '../publishing/jubilee-series/verify-private-handoff.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
async function fake(){
 const root=await mkdtemp(join(tmpdir(),'ekodi-private-'));
 const paths=[
 ...['01','02'].flatMap(v=>['docx','epub','pdf'].map(x=>'editions/'+v+'/test.'+x)),
 'editorial/footnotes.md','editorial/quality.md','editorial/sha.json',
 ];
 const files=[];
 for(const path of paths){
   const content=Buffer.from('private revision 9 '+path);
   await mkdir(dirname(join(root,path)),{recursive:true});
   await writeFile(join(root,path),content);
   files.push({path,bytes:content.length,sha256:sha(content),kind:path.split('.').at(-1)});
 }
 const manifest={
   schemaVersion:1,packageType:'ekodi-private-editorial-ingest',
   seriesId:'EKODI-JUBILEE-THEOLOGY',sourceRevision:'review-9',
   packageStatus:'handoff-file-ready-not-yet-ingested',
   volumes:[{reviewId:'EJT-01-REVIEW'},{reviewId:'EJT-02-REVIEW'}],
   fileDigests:files,sourceVerification:{fileCount:9},
   privateIngress:{
     registeredInEKODIPublisherR2:false,registeredInEKODIPublisherDB:false,
     verifiedStorageReadback:false,authorApproval:false,publisherApproval:false,
     publicCatalog:false,checkoutEnabled:false,releaseDate:null,
   },
 };
 const save=()=>writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
 await save();return {root,manifest,save,cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('nine private handoff files pass local digest check; never mark sales enabled',async()=>{
 const f=await fake();try{
   const receipt=await verifyJubileePrivateHandoff(f.root);
   assert.equal(receipt.verifiedFiles,9);
   assert.equal(receipt.privatePublisherStorageVerified,false);
   assert.equal(receipt.salesEnabled,false);
   assert.match(receipt.manifestSha256,/^[a-f0-9]{64}$/);
 }finally{await f.cleanup();}
});
test('corrupted source byte, forged approval, wrong revision or unsafe path fail closed',async()=>{
 const f=await fake();try{
   await writeFile(join(f.root,'editions','01','test.epub'),'tampered');
   await assert.rejects(verifyJubileePrivateHandoff(f.root),/digest:/);
   f.manifest.fileDigests[0].sha256='bad';await f.save();
   await assert.rejects(verifyJubileePrivateHandoff(f.root),/file-metadata/);
   f.manifest.privateIngress.checkoutEnabled=true;await f.save();
   await assert.rejects(verifyJubileePrivateHandoff(f.root),/premature-release/);
   f.manifest.privateIngress.checkoutEnabled=false;
   f.manifest.sourceRevision='review-8';await f.save();
   await assert.rejects(verifyJubileePrivateHandoff(f.root),/package-identity/);
   f.manifest.sourceRevision='review-9';
   f.manifest.fileDigests[0].path='../escape.docx';await f.save();
   await assert.rejects(verifyJubileePrivateHandoff(f.root),/unsafe-path/);
 }finally{await f.cleanup();}
});
