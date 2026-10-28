// Side-effect-free checks and injectable Storage API operations for EKODI
// Secure Documents. Shared by the Deno API and deterministic Node canaries.
// This module does NOT authorize a purge or bypass an Orchestrator Human Gate.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny=code=>{throw new Error(code)};
const validPast=(date,now)=>{
 const ms=Date.parse(String(date??""));
 return Number.isFinite(ms)&&ms<=now;
};
export function assertPurgeEligibility(record,{now=Date.now(),lease=null}={}){
 if(!record||record.status!=="deletion_pending"||record.legal_hold!==false)
   deny("RETENTION_REVIEW_CHANGED");
 if(!validPast(record.retention_until,now)||
    !validPast(record.purge_authorized_at,now)||
    !validPast(record.backup_policy_reviewed_at,now))
   deny("RETENTION_REVIEW_CHANGED");
 if(lease!==null&&record.purge_lease_until!==lease)
   deny("PURGE_LEASE_CHANGED");
 return true;
}
export function expectedCiphertextKeys(record,versions){
 const scope=record?.owner_scope;
 const owner=scope==="person"?record?.owner_person_id:scope==="workspace"?record?.workspace_id:null;
 if(!uuid.test(String(record?.id??""))||!uuid.test(String(owner??""))||
    !Array.isArray(versions)||!versions.length||versions.length>=10000)
   deny("PURGE_VERSION_SET_INVALID");
 const prefix=scope+"/"+owner+"/"+record.id+"/";
 const used=new Set(), keys=[];
 for(const version of versions){
   if(!uuid.test(String(version?.id??""))||
      typeof version?.storage_key!=="string"||
      version.storage_key!==prefix+version.id+".bin"||
      used.has(version.storage_key))deny("PURGE_KEY_SCOPE_INVALID");
   used.add(version.storage_key);
   keys.push(version.storage_key);
 }
 return {prefix,keys};
}
const isMissing=e=>Number(e?.statusCode??e?.status)===404;
export async function removeVerifiedCiphertexts(storage,record,versions){
 const {keys,prefix}=expectedCiphertextKeys(record,versions);
 // Storage API, NOT SQL deletes. No cached success on failed verification.
 for(let i=0;i<keys.length;i+=100){
   const batch=keys.slice(i,i+100);
   const result=await storage.remove(batch);
   if(result?.error)deny("STORAGE_REMOVE_FAILED");
   for(const key of batch){
     const res=await storage.info(key);
     if(res?.data||!isMissing(res?.error))deny("STORAGE_REMOVAL_UNVERIFIED");
   }
 }
 // Catch orphans (including nested unexpected paths) absent from version rows.
 // Any nonempty prefix prevents a premature 'storage_purged_at' receipt.
 const residual=await storage.list(prefix,{limit:1,offset:0});
 if(residual?.error||!Array.isArray(residual?.data)||residual.data.length)
   deny("STORAGE_PREFIX_NOT_EMPTY");
 return {fileCount:keys.length};
}
