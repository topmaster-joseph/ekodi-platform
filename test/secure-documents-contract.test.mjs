import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const policy=JSON.parse(read('config/secure-documents-policy.json'));
const sql=read('supabase/migrations/20261028054700_secure_documents_core.sql');
const api=read('supabase/functions/secure-documents-api/index.ts');
const widget=read('my/docs/secure-widget.js');
test('secure documents are an independent default-off central service',()=>{
 assert.equal(policy.status,'security-review');
 assert.equal(policy.productionActivationDefault,false);
 assert.equal(policy.contract,'ekodi.secure-documents.v1');
 assert.ok(policy.forbiddenKinds.includes('government_identity_document'));
 assert.equal(policy.siteReuse.sameOriginWidget,'/my/docs/secure-widget.js');
 assert.match(api,/SECURE_DOCUMENTS_ACTIVE/);
 assert.match(api,/SECURE_DOCUMENTS_LEGAL_APPROVED/);
});
test('server-only tables and opaque nonpublic bucket',()=>{
 for(const table of ['secure_document_records','secure_document_versions','secure_document_shares','secure_document_access_audit']){
   assert.ok(sql.includes('public.'+table));
 }
 assert.match(sql,/enable row level security/);
 for(const table of ['secure_document_records','secure_document_versions','secure_document_shares','secure_document_access_audit']){
   assert.ok(sql.includes('alter table public.'+table+' enable row level security;'));
   assert.ok(sql.includes('revoke all on table public.'+table+' from PUBLIC, anon, authenticated;'));
 }
 assert.match(sql,/secure-documents-private/);
 assert.match(sql,/values \('secure-documents-private','secure-documents-private',false/);
 assert.match(sql,/token_hash text not null unique/);
 assert.match(sql,/recipient_email_mac text not null/);
});
test('scope and share are checked by server, not client identity hints',()=>{
 assert.match(api,/ekodi_account_for_auth_user/);
 assert.match(api,/tenant_members/);
 assert.match(api,/tenant_admin/);
 assert.match(api,/who\.personId/);
 assert.match(api,/recipientMac\(who\.email\)/);
 assert.match(api,/eq\("view_count",share\.view_count\)/);
 assert.match(api,/gt\("expires_at"/);
 assert.match(api,/who\.aal2/);
 assert.ok(api.includes('async function handleOpen(req,who,body){\n if(!who.aal2)'), 'recipient open requires recent MFA');
 assert.doesNotMatch(api,/createSignedUrl|createSignedUploadUrl|publicUrl/);
});
test('server encrypts bytes and rejects unsafe formats',()=>{
 assert.match(api,/AES-GCM/);assert.match(api,/HKDF/);
 assert.match(api,/SECURE_DOCUMENT_SCAN_ENDPOINT/);
 assert.match(api,/FILE_SIGNATURE_INVALID/);
 assert.match(api,/redacted_for_sharing/);
 assert.match(api,/SECURE_DOCUMENT_MASTER_KEY_B64/);
});
test('reusable site UI is not an authorization boundary',()=>{
 assert.match(widget,/mountSecureDocuments/);
 assert.match(widget,/scope==="workspace"/);
 assert.match(widget,/authorization:"Bearer "/);
 assert.ok(widget.includes('.get("share")'));
 assert.match(widget,/history\.replaceState/);
 assert.match(read('my/docs/secure.html'),/secure-page\.js/);
 assert.match(widget,/data-shares/);assert.match(widget,/data-revoke/);
 assert.match(widget,/name="issued_on"/);assert.match(widget,/name="valid_until"/);
 assert.match(api,/handleShares/);assert.match(api,/INVALID_DOCUMENT_DATES/);
});

test('deletion request is owner-verified, step-up gated and fails closed before physical purge',()=>{
 assert.match(api,/async function handleDeletionRequest/);
 assert.match(api,/if\(!who\.aal2\)return deny\(req,"STEP_UP_REQUIRED"\)/);
 assert.match(api,/const record=await requireRecord\(who,body\.document_id\)/);
 assert.match(api,/status:"deletion_pending"/);
 assert.match(api,/DELETE_GRANT_RECONCILIATION_PENDING/);
 assert.match(api,/storage_purged:false,backup_purged:false/);
 assert.match(api,/action==="delete_request"/);
 assert.ok(widget.includes('data-delete-request'));
 assert.ok(widget.includes('물리삭제 확인 대기'));
});
