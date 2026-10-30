/**
 * EKODI-only durable D1 claim/receipt adapter.
 * Caller must verify EKODI Church authority and private folder *before*
 * passing this adapter to executeWorshipDraftJob. This module exposes no HTTP.
 */
const KINDS=new Set(['sermonGoogleDocId','bulletinGoogleDocId','worshipGoogleSlidesId']);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{10,120}$/.test(v);
const job=v=>typeof v==='string'&&/^ekodi:church-weekly:\d{4}-\d{2}-\d{2}$/.test(v);
const fail=code=>{const e=new Error(code);e.code=code;return e;};
const changes=r=>Number(r?.meta?.changes??r?.changes??0);
export function createWorshipD1Ledger(db,{newLease=()=>crypto.randomUUID()}={}){
  if(!db?.prepare)throw fail('EKODI_D1_REQUIRED');
  const statement=(sql,...params)=>db.prepare(sql).bind(...params);
  return Object.freeze({
    async claim(key){
      if(!job(key))throw fail('INVALID_JOB_KEY');
      const lease=newLease();
      if(!id(lease))throw fail('INVALID_NATIVE_LEASE');
      const date=key.slice('ekodi:church-weekly:'.length);
      const result=await statement(
        'INSERT OR IGNORE INTO ekodi_church_native_draft_runs(job_id,service_date,lease_id,state) VALUES (?,?,?,\'claimed\')',
        key,date,lease
      ).run();
      return changes(result)===1?{claimed:true,leaseId:lease}:{claimed:false};
    },
    async record(key,lease,receipt){
      if(!job(key)||!id(lease)||!KINDS.has(receipt?.kind)||!id(receipt?.fileId)||
         !['created_pending_readback','draft_readback_verified'].includes(receipt?.state))
        throw fail('INVALID_ASSET_RECEIPT');
      let result;
      if(receipt.state==='created_pending_readback'){
        result=await statement(
          `INSERT OR IGNORE INTO ekodi_church_native_draft_assets(job_id,asset_kind,file_id,state)
           SELECT ?,?,?,'created_pending_readback' WHERE EXISTS
           (SELECT 1 FROM ekodi_church_native_draft_runs
            WHERE job_id=? AND lease_id=? AND state='claimed')`,
          key,receipt.kind,receipt.fileId,key,lease
        ).run();
      }else{
        result=await statement(
          `UPDATE ekodi_church_native_draft_assets SET
             state='draft_readback_verified',updated_at=datetime('now')
           WHERE job_id=? AND asset_kind=? AND file_id=? AND state='created_pending_readback'
             AND EXISTS (SELECT 1 FROM ekodi_church_native_draft_runs
               WHERE job_id=? AND lease_id=? AND state='claimed')`,
          key,receipt.kind,receipt.fileId,key,lease
        ).run();
      }
      return {stored:changes(result)===1};
    },
    async finish(key,lease,receipt){
      if(!job(key)||!id(lease)||receipt?.jobId!==key||
         receipt?.publicationState!=='private_draft'||
         receipt?.approvalState!=='pastoral_review_required')throw fail('INVALID_DRAFT_FINISH');
      const assets=receipt.assets||{};
      const rows=await statement(
        `SELECT asset_kind,file_id,state FROM ekodi_church_native_draft_assets WHERE job_id=?`,key
      ).all();
      const list=Array.isArray(rows?.results)?rows.results:[];
      if(list.length!==3||!list.every(row=>KINDS.has(row.asset_kind)&&
         row.state==='draft_readback_verified'&&assets[row.asset_kind]===row.file_id))
        return {stored:false};
      const result=await statement(
        `UPDATE ekodi_church_native_draft_runs SET
          state='draft_ready_for_pastor_review',reason=NULL,source_registry_id=?,
          updated_at=datetime('now') WHERE job_id=? AND lease_id=? AND state='claimed'`,
        String(receipt.sourceRegistryId||'').slice(0,100),key,lease
      ).run();
      return {stored:changes(result)===1};
    },
    async block(key,lease,reason){
      if(!job(key)||!id(lease))throw fail('INVALID_BLOCK_KEY');
      const code=typeof reason==='string'&&/^[A-Z0-9_]{3,80}$/.test(reason)
        ?reason:'EKODI_DRAFT_RECONCILIATION_REQUIRED';
      const result=await statement(
        `UPDATE ekodi_church_native_draft_runs
         SET state='blocked_reconciliation_required',reason=?,
             updated_at=datetime('now')
         WHERE job_id=? AND lease_id=? AND state='claimed'`,code,key,lease
      ).run();
      return {stored:changes(result)===1};
    }
  });
}
