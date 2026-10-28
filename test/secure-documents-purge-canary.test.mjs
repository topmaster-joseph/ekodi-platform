import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPurgeEligibility,expectedCiphertextKeys,removeVerifiedCiphertexts} from '../supabase/functions/secure-documents-api/purge-guards.mjs';

const DOC='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const VERSION='33333333-3333-4333-8333-333333333333';
const LEASE='2026-10-28T00:03:00.000Z';
const now=Date.parse('2026-10-28T00:01:00.000Z');
const record=(changes={})=>({id:DOC,status:'deletion_pending',legal_hold:false,
 owner_scope:'person',owner_person_id:OWNER,workspace_id:null,
 retention_until:'2026-10-27T00:00:00Z',purge_authorized_at:'2026-10-28T00:00:00Z',
 backup_policy_reviewed_at:'2026-10-28T00:00:00Z',purge_lease_until:LEASE,...changes});
const key=`person/${OWNER}/${DOC}/${VERSION}.bin`;
const versions=[{id:VERSION,storage_key:key}];
function memoryStore(files){
 const live=new Set(files); const calls=[];
 return {calls,live,
  async remove(paths){calls.push(['remove',paths]);for(const x of paths)live.delete(x);return {data:paths,error:null};},
  async info(path){calls.push(['info',path]);return live.has(path)?{data:{name:path},error:null}:{data:null,error:{statusCode:'404'}};},
  async list(prefix){calls.push(['list',prefix]);return {data:[...live].filter(x=>x.startsWith(prefix)).map(x=>({name:x.slice(prefix.length)})),error:null};}
 };
}
test('synthetic live-file removal is verified and no backup deletion is claimed',async()=>{
 assert.equal(assertPurgeEligibility(record(),{now,lease:LEASE}),true);
 const store=memoryStore([key]);
 const receipt=await removeVerifiedCiphertexts(store,record(),versions);
 assert.equal(receipt.fileCount,1);
 assert.equal(store.live.size,0);
 assert.deepEqual(store.calls.map(c=>c[0]),['remove','info','list']);
});
test('replayed removal succeeds only when independent 404 and empty folder checks agree',async()=>{
 const store=memoryStore([]);
 const result=await removeVerifiedCiphertexts(store,record(),versions);
 assert.equal(result.fileCount,1);
});
test('changed legal hold, retention, reviewer grant or lease fail before deleting',()=>{
 for(const change of [{legal_hold:true},{status:'active'},{retention_until:'2099-01-01T00:00:00Z'},
   {purge_authorized_at:null},{backup_policy_reviewed_at:null},
   {backup_policy_reviewed_at:'2099-01-01T00:00:00Z'},
   {purge_lease_until:'2099-01-01T00:00:00Z'}]){
   assert.throws(()=>assertPurgeEligibility(record(change),{now,lease:LEASE}),
     /RETENTION_REVIEW_CHANGED|PURGE_LEASE_CHANGED/);
 }
});
test('cross-owner path, mismatched version id and duplicate path are rejected',()=>{
 const r=record();
 const bad=[
  [{id:VERSION,storage_key:`workspace/${OWNER}/${DOC}/${VERSION}.bin`}],
  [{id:'44444444-4444-4444-8444-444444444444',storage_key:key}],
  [versions[0],versions[0]],
  [{id:VERSION,storage_key:key.replace('.bin','/../escape.bin')}]
 ];
 for(const list of bad)assert.throws(()=>expectedCiphertextKeys(r,list),/PURGE_KEY_SCOPE_INVALID/);
 assert.throws(()=>expectedCiphertextKeys(record({owner_person_id:'invalid'}),versions),/PURGE_VERSION_SET_INVALID/);
});
test('orphaned object after documented versions are removed blocks a completion receipt',async()=>{
 const store=memoryStore([key,`person/${OWNER}/${DOC}/untracked.bin`]);
 await assert.rejects(removeVerifiedCiphertexts(store,record(),versions),/STORAGE_PREFIX_NOT_EMPTY/);
 assert.equal(store.live.has(key),false);
});
test('unverified Storage failures fail closed and leave documented file at risk of retry',async()=>{
 const storage=memoryStore([key]);
 storage.remove=async()=>({data:null,error:{message:'transient'}});
 await assert.rejects(removeVerifiedCiphertexts(storage,record(),versions),/STORAGE_REMOVE_FAILED/);
 assert.equal(storage.live.has(key),true);
 const wrong=memoryStore([key]);
 wrong.info=async()=>({data:null,error:{statusCode:'500'}});
 await assert.rejects(removeVerifiedCiphertexts(wrong,record(),versions),/STORAGE_REMOVAL_UNVERIFIED/);
 const folder=memoryStore([key]);
 folder.list=async()=>({data:null,error:{message:'unavailable'}});
 await assert.rejects(removeVerifiedCiphertexts(folder,record(),versions),/STORAGE_PREFIX_NOT_EMPTY/);
});
