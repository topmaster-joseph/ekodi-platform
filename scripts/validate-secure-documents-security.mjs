import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const file=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

export function auditSecureDocuments({policy,release,sql,edge,widget}) {
  const issues=[];
  const fail=(condition,message)=>{if(!condition)issues.push(message)};
  fail(policy.contract==='ekodi.secure-documents.v1','unexpected public service contract');
  fail(policy.status==='security-review' && policy.productionActivationDefault===false,'review must be pending and activation default OFF');
  fail(policy.accessPrinciple==='no-platform-admin-plaintext-override','admins cannot bypass document owner authorization');
  for(const kind of ['government_identity_document','unredacted_resident_registration_number','biometric_template'])
    fail(policy.forbiddenKinds.includes(kind),'forbidden document kind missing: '+kind);
  for(const gate of ['data-residency-and-legal-review','signed-off-file-scanner',
    'encryption-key-management-and-rotation','step-up-auth-integration',
    'recipient-access-negative-tests','RLS-and-storage-policy-review',
    'expiry-and-delete-reconciliation','synthetic-file-canary','guarded-platform-deployment'])
    fail(policy.activationGates.includes(gate),'required activation gate missing: '+gate);
  fail(release.status==='blocked'&&release.productionActivationDefault===false,'release policy must stay fail-closed');
  fail(release.requiredIndependentSecurityReview===true,'independent reviewer cannot be skipped');
  fail(release.requiredPrivacyAndDataResidencyReview===true,'privacy and residency review cannot be skipped');
  fail(release.requiredExactShaHumanGate===true,'release human gate must bind exact commit SHA');
  fail(release.manualApprovalCannotBeReplacedByStaticCi===true,'static CI cannot be represented as independent signoff');
  for(const table of ['secure_document_records','secure_document_versions',
    'secure_document_shares','secure_document_access_audit']) {
    fail(sql.includes('alter table public.'+table+' enable row level security;'),'RLS missing: '+table);
    fail(sql.includes('revoke all on table public.'+table+' from PUBLIC, anon, authenticated;'),'client grants not explicitly denied: '+table);
  }
  fail(/values\s*\('secure-documents-private','secure-documents-private',false/.test(sql),'private ciphertext-only bucket missing');
  fail(/token_hash text not null unique/.test(sql) && /recipient_email_mac text not null/.test(sql),'hashed recipient-bound share grants required');
  fail(edge.includes('SECURE_DOCUMENTS_ACTIVE')&&edge.includes('SECURE_DOCUMENTS_LEGAL_APPROVED')&&
    edge.includes('SECURE_DOCUMENTS_SCAN_APPROVED'),'runtime multi-gate fail-closed flags missing');
  fail(edge.includes('SECURE_DOCUMENT_MASTER_KEY_B64')&&edge.includes('AES-GCM')&&edge.includes('HKDF'),'AES-GCM HKDF envelope crypto required');
  fail(edge.includes('ekodi_account_for_auth_user')&&edge.includes('tenant_members')&&
    edge.includes('tenant_admin'),'verified central person and tenant authorization required');
  fail(edge.includes('recipientMac(who.email)')&&edge.includes('who.aal2') &&
    edge.includes('.lt("view_count",share.max_views)'),'verified recipient MFA, view count and expiry required');
  fail(edge.includes('handleDeletionRequest')&&edge.includes('status:"deletion_pending"')&&
    edge.includes('DELETE_GRANT_RECONCILIATION_PENDING')&&
    edge.includes('storage_purged:false,backup_purged:false'),
    'deletion must revoke access before asynchronous purge and never claim erased backups');
  fail(edge.includes('redaction_verified===true')&&edge.includes('pii_safe===true')&&
    edge.includes('engine_verified===true'),'independent file scan/redaction evidence required');
  fail(!/createSignedUrl|createSignedUploadUrl|publicUrl/.test(edge),'persistent signed URLs forbidden');
  fail(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(widget),'client script must not expose service role key');
  fail(widget.includes('mountSecureDocuments')&&widget.includes('workspaceId'),'site-reuse adapter is required');
  fail(edge.includes('const isoDate=/^\\d{4}-\\d{2}-\\d{2}$/;'),'real ISO date regular expression required');
  return issues;
}
export function productionReleaseAllowed(_release) {
  // Deliberate fail-closed rule: a repository JSON file cannot authenticate
  // independent reviewer identity, attest an exact SHA, or prove a Human Gate
  // receipt. This static validator must NEVER issue release authorization.
  // Only the EKODI Orchestrator's independently verified protected release
  // control plane can approve actual activation.
  return false;
}
export function checkRepository() {
  const input={
    policy:JSON.parse(file('config/secure-documents-policy.json')),
    release:JSON.parse(file('config/secure-documents-release-policy.json')),
    sql:file('supabase/migrations/20261028054700_secure_documents_core.sql'),
    edge:file('supabase/functions/secure-documents-api/index.ts'),
    widget:file('my/docs/secure-widget.js')
  };
  return {issues:auditSecureDocuments(input), release:input.release};
}
function main(){
  const {issues,release}=checkRepository();
  for(const issue of issues)console.error('[SECURE-DOCUMENTS][BLOCK] '+issue);
  if(issues.length)process.exit(1);
  if(process.argv.includes('--release')){
    if(!productionReleaseAllowed(release)){
      console.error('[SECURE-DOCUMENTS][BLOCK] independent security/legal review and exact SHA owner gate not approved');
      process.exit(1);
    }
    // This validator is only one check. Protected GitHub deployment and
    // actual release verification are separate required controls.
  }
  console.log('[SECURE-DOCUMENTS] static security contract passed; production activation is '+(productionReleaseAllowed(release)?'eligible for guarded human review':'BLOCKED'));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main();
