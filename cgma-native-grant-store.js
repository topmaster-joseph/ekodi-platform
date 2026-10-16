// CGMA native write canary: server-only, one-use D1 state store.
// NOT an HTTP issuer or permission grant; hybrid queue still fails AUTH_REQUIRED.
// A future trusted server handler MUST independently verify true session auth,
// board-local owner/admin rights, human consent and device isolation before
// invoking issue; clients may not provide attestation fields.
import { randomUUID } from 'node:crypto';
import { CGMA_NATIVE_CANARY, inspectCgmaCanaryPayload } from './cgma-native-canary-policy.js';

const DEFAULT_TTL_MS = 90000;
const CONSENT_FRESHNESS_MS = 60000;
const principalPattern = /^[a-zA-Z0-9:_@.-]{3,160}$/;
const devicePattern = /^[a-zA-Z0-9._:-]{8,128}$/;
const taskPattern = /^hyb_[a-f0-9-]{36}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const bad = code => Object.freeze({ok:false,code});
const validTime = value => Number.isSafeInteger(value) && value > 0;
const validPrincipal = value => typeof value === 'string' && principalPattern.test(value);
const validDevice = value => typeof value === 'string' && devicePattern.test(value);
function requireD1(db) { if (typeof db?.prepare !== 'function') throw new TypeError('D1 required'); }
function requireTime(nowMs) { if (!validTime(nowMs)) throw new TypeError('Trusted server clock required'); }

export const CGMA_NATIVE_GRANT_STORE = Object.freeze({
  boardId:'site:cgma:main', origin:'https://ekodi.kr',
  taskType:'board.cgma.authenticated-crud.verify',
  maxLeaseMs:CGMA_NATIVE_CANARY.maxLeaseMs,
});

export async function ensureCgmaNativeGrantSchema(db) {
  requireD1(db);
  await db.prepare("CREATE TABLE IF NOT EXISTS cgma_native_canary_grants (grant_ref TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, origin TEXT NOT NULL CHECK(origin='https://ekodi.kr'), board_id TEXT NOT NULL CHECK(board_id='site:cgma:main'), principal_id TEXT NOT NULL, device_id TEXT NOT NULL, task_type TEXT NOT NULL CHECK(task_type='board.cgma.authenticated-crud.verify'), board_role TEXT NOT NULL CHECK(board_role IN ('owner','admin')), status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','consumed','revoked')), issued_at_ms INTEGER NOT NULL, expires_at_ms INTEGER NOT NULL, approved_at_ms INTEGER NOT NULL, consumed_at_ms INTEGER, consumed_job_id TEXT)").run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cgma_native_canary_grants_expiry ON cgma_native_canary_grants(status,expires_at_ms)').run();
}

// Authoritative attestation must be supplied by a PRIVATE, trusted server
// integration, NEVER by an untrusted request body. This library deliberately
// has no HTTP routes and does not enable live writes.
export async function issueCgmaNativeGrant(db,{
  principalId,deviceId,boardRole,approvedAtMs,nowMs,
  verifiedSession,verifiedBoardMembership,humanConsent,attestedIsolation,
  ttlMs=DEFAULT_TTL_MS,
},{uuid=randomUUID}={}){
  requireD1(db);requireTime(nowMs);
  if(!validPrincipal(principalId)||!validDevice(deviceId))return bad('IDENTITY_SCOPE_INVALID');
  if(!['owner','admin'].includes(boardRole))return bad('BOARD_MANAGE_ROLE_REQUIRED');
  if(verifiedSession!==true||verifiedBoardMembership!==true)return bad('AUTHORITATIVE_AUTH_REQUIRED');
  if(humanConsent!==true||!validTime(approvedAtMs)||approvedAtMs>nowMs||
     nowMs-approvedAtMs>CONSENT_FRESHNESS_MS)return bad('FRESH_HUMAN_CONSENT_REQUIRED');
  if(attestedIsolation!==true)return bad('ATTESTED_ISOLATION_REQUIRED');
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>CGMA_NATIVE_CANARY.maxLeaseMs)
    return bad('LEASE_SCOPE_INVALID');
  const id=uuid(),nonceId=uuid();
  if(!uuidPattern.test(id)||!uuidPattern.test(nonceId)||id===nonceId)return bad('SERVER_RANDOM_ID_INVALID');
  const grantRef='cgma_grant_'+id,nonce='cgma_'+nonceId,expiresAtMs=nowMs+ttlMs;
  if(!Number.isSafeInteger(expiresAtMs))return bad('LEASE_SCOPE_INVALID');
  await db.prepare("INSERT INTO cgma_native_canary_grants (grant_ref,nonce,origin,board_id,principal_id,device_id,task_type,board_role,status,issued_at_ms,expires_at_ms,approved_at_ms) VALUES (?,?,?,?,?,?,?,?, 'issued',?,?,?)")
    .bind(grantRef,nonce,CGMA_NATIVE_CANARY.origin,CGMA_NATIVE_CANARY.boardId,
      principalId,deviceId,CGMA_NATIVE_CANARY.taskType,boardRole,nowMs,expiresAtMs,approvedAtMs).run();
  return Object.freeze({ok:true,code:'GRANT_REFERENCE_ISSUED_NOT_AUTHORIZED',
    grantRef,nonce,origin:CGMA_NATIVE_CANARY.origin,boardId:CGMA_NATIVE_CANARY.boardId,expiresAtMs});
}

// Only a trusted server may call this with an authenticated DEVICE identity.
// The atomic conditional UPDATE prevents concurrent or replayed consumption.
// Grant reference plus nonce alone MUST NEVER authorize CGMA board writes.
export async function consumeCgmaNativeGrant(db,{payload,principalId,deviceId,taskId,nowMs}){
  requireD1(db);requireTime(nowMs);
  const shape=inspectCgmaCanaryPayload(payload);
  if(!shape.ok)return bad(shape.code);
  if(!validPrincipal(principalId)||!validDevice(deviceId)||!taskPattern.test(taskId))
    return bad('IDENTITY_SCOPE_INVALID');
  const changed=await db.prepare("UPDATE cgma_native_canary_grants SET status='consumed',consumed_at_ms=?,consumed_job_id=? WHERE grant_ref=? AND nonce=? AND principal_id=? AND device_id=? AND origin=? AND board_id=? AND task_type=? AND status='issued' AND expires_at_ms>? AND issued_at_ms<=?")
    .bind(nowMs,taskId,shape.grantRef,shape.nonce,principalId,deviceId,
      CGMA_NATIVE_CANARY.origin,CGMA_NATIVE_CANARY.boardId,CGMA_NATIVE_CANARY.taskType,nowMs,nowMs).run();
  return Number(changed?.meta?.changes||0)===1
    ? Object.freeze({ok:true,code:'SINGLE_USE_CONSUMED_NOT_BOARD_AUTHORIZED',taskId})
    : bad('GRANT_EXPIRED_USED_REVOKED_OR_SCOPE_MISMATCH');
}

export async function revokeCgmaNativeGrant(db,{grantRef,principalId,nowMs}){
  requireD1(db);requireTime(nowMs);
  if(!/^cgma_grant_[a-f0-9-]{36}$/.test(grantRef)||!validPrincipal(principalId))
    return bad('IDENTITY_SCOPE_INVALID');
  const changed=await db.prepare("UPDATE cgma_native_canary_grants SET status='revoked' WHERE grant_ref=? AND principal_id=? AND status='issued'")
    .bind(grantRef,principalId).run();
  return Number(changed?.meta?.changes||0)===1
    ? Object.freeze({ok:true,code:'UNUSED_GRANT_REVOKED'})
    : bad('GRANT_ALREADY_TERMINAL_OR_NOT_OWNED');
}
