// D1-compatible private operation store; apply schema only through guarded migrations.
// No client-supplied identity or approval is trusted by this server-only module.
export const CONTACT_OPERATION_SCHEMA = `CREATE TABLE IF NOT EXISTS personal_contact_operations (
 operation_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, google_subject TEXT NOT NULL,
 resource_name TEXT NOT NULL, digest TEXT NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('approved','executing','verified','blocked_before_write','needs_reconciliation')),
 lease_id TEXT UNIQUE, backup_key_id TEXT, backup_iv TEXT, backup_ciphertext TEXT,
 updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_contact_account_lease ON personal_contact_operations(google_subject)
 WHERE status IN ('executing','needs_reconciliation');`;
const fail=code=>{throw Object.assign(new Error(code),{code})};
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256;
function validate(c){if(!c||!['ownerId','googleSubject','operationId'].every(k=>id(c[k]))||!/^people\/c[\w-]+$/.test(c.resourceName||'')||!(/^[a-f0-9]{64}$/.test(c.digest||'')))fail('INVALID_APPROVAL')}
export function createContactOperationStore(db,{clock=Date.now}={}){
 if(!db?.prepare)fail('CONTACT_STORE_REQUIRED');
 const query=(sql,...args)=>db.prepare(sql).bind(...args);
 return {
  // Caller must authenticate and record explicit human approval of the exact digest.
  async recordApproval(c){validate(c);const now=clock();if(!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||c.expiresAt>now+900000)fail('INVALID_APPROVAL_EXPIRY');
   const row=await query(`INSERT INTO personal_contact_operations(operation_id,owner_id,google_subject,resource_name,digest,expires_at,status,updated_at) VALUES(?,?,?,?,?,?,'approved',?) ON CONFLICT(operation_id) DO NOTHING RETURNING operation_id`,c.operationId,c.ownerId,c.googleSubject,c.resourceName,c.digest,c.expiresAt,now).first();
   if(!row)fail('APPROVAL_ALREADY_EXISTS');return {recorded:true};},
  async claimApproval(c){validate(c);const now=clock(),lease=crypto.randomUUID();
   const row=await query(`UPDATE personal_contact_operations SET status='executing',lease_id=?,updated_at=? WHERE operation_id=? AND owner_id=? AND google_subject=? AND resource_name=? AND digest=? AND status='approved' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM personal_contact_operations WHERE google_subject=? AND status IN ('executing','needs_reconciliation')) RETURNING lease_id`,lease,now,c.operationId,c.ownerId,c.googleSubject,c.resourceName,c.digest,now,c.googleSubject).first();
   return row?{claimed:true,leaseId:row.lease_id}:{claimed:false};},
  async saveBackup(lease,c,e){if(!id(lease)||!id(c?.keyId)||e?.version!==1||e.keyId!==c.keyId||typeof e.iv!=='string'||!(/^[A-Za-z0-9+/]{16}$/.test(e.iv))||typeof e.ciphertext!=='string'||!e.ciphertext||e.ciphertext.length>1000000)fail('INVALID_BACKUP');
   const row=await query(`UPDATE personal_contact_operations SET backup_key_id=?,backup_iv=?,backup_ciphertext=?,updated_at=? WHERE lease_id=? AND operation_id=? AND owner_id=? AND google_subject=? AND resource_name=? AND status='executing' AND backup_ciphertext IS NULL RETURNING operation_id`,c.keyId,e.iv,e.ciphertext,clock(),lease,c.operationId,c.ownerId,c.googleSubject,c.resourceName).first();if(!row)fail('BACKUP_WRITE_BLOCKED');},
  async readBackup(lease,c){const row=await query(`SELECT backup_key_id,backup_iv,backup_ciphertext FROM personal_contact_operations WHERE lease_id=? AND operation_id=? AND owner_id=? AND google_subject=? AND resource_name=? AND backup_key_id=? AND status='executing'`,lease,c.operationId,c.ownerId,c.googleSubject,c.resourceName,c.keyId).first();return row?{version:1,keyId:row.backup_key_id,iv:row.backup_iv,ciphertext:row.backup_ciphertext}:null;},
  async finishOperation(lease,{status}={}){if(!id(lease)||!['verified','blocked_before_write','needs_reconciliation'].includes(status))fail('INVALID_FINISH_STATUS');const row=await query(`UPDATE personal_contact_operations SET status=?,updated_at=? WHERE lease_id=? AND status='executing' AND (? != 'verified' OR backup_ciphertext IS NOT NULL) RETURNING operation_id`,status,clock(),lease,status).first();if(!row)fail('FINISH_BLOCKED');}
 };
}
