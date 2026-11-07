/** EKODI Ed25519 family consent replay lock (SQLite / Cloudflare D1 adapter).
 * Does not connect to or create a database by itself. A separately authorized
 * store must install the schema and supply an atomic prepare/bind/run adapter.
 * No in-memory fallback: missing database means no native execution.
 */
const NONCE=/^[A-Za-z0-9_-]{22,96}$/;
const JOB=/^hyb_[a-f0-9-]{36}$/i;
const DEVICE=/^[a-zA-Z0-9._:-]{1,128}$/;
const RETENTION_MS=24*60*60*1000;

export const FAMILY_CONSENT_NONCE_SCHEMA=[
  'CREATE TABLE IF NOT EXISTS ai_family_consumed_nonces (',
  '  nonce TEXT PRIMARY KEY NOT NULL,',
  '  job_id TEXT NOT NULL,',
  '  device_id TEXT NOT NULL,',
  '  consumed_at TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_ai_family_consumed_nonces_at',
  '  ON ai_family_consumed_nonces(consumed_at);',
].join('\n');

const CONSUME=[
  'INSERT INTO ai_family_consumed_nonces(nonce,job_id,device_id,consumed_at)',
  'VALUES (?,?,?,?)',
  'ON CONFLICT(nonce) DO NOTHING',
].join('\n');

const PRUNE='DELETE FROM ai_family_consumed_nonces WHERE consumed_at < ?';

/** Requires a trusted transaction-capable durable adapter: db.prepare().bind().run().
 * The nonce's primary key is global to that store, not scoped by device/user.
 * Exactly one invocation can receive the one-time success result.
 */
export function createDurableFamilyNonceConsumer(db,{clock=Date.now}={}){
  return async function consumeNonce(nonce,{jobId,deviceId}={}){
    if(!db||typeof db.prepare!=='function')return false;
    if(!NONCE.test(String(nonce||''))||!JOB.test(String(jobId||''))||
       !DEVICE.test(String(deviceId||'')))return false;
    const now=clock();
    if(!Number.isFinite(now))return false;
    try{
      const stmt=db.prepare(CONSUME);
      if(!stmt||typeof stmt.bind!=='function')return false;
      const result=await stmt.bind(nonce,jobId,deviceId,new Date(now).toISOString()).run();
      return Number(result?.meta?.changes)===1;
    }catch{
      return false;
    }
  };
}

/** Explicitly invoked maintenance only; never purge within a signed consent's
 * <=10 minute validity period. Automatic purging is not enabled. */
export async function pruneExpiredFamilyNonces(db,{clock=Date.now}={}){
  if(!db||typeof db.prepare!=='function')return {ok:false,code:'DURABLE_NONCE_STORE_REQUIRED'};
  const now=clock();
  if(!Number.isFinite(now))return {ok:false,code:'INVALID_TIME'};
  try{
    const result=await db.prepare(PRUNE).bind(new Date(now-RETENTION_MS).toISOString()).run();
    return {ok:true,deleted:Number(result?.meta?.changes)||0};
  }catch{return {ok:false,code:'NONCE_PRUNE_UNAVAILABLE'};}
}
