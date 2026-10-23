// Read-only canonical D1 evidence. Never mints sessions or authenticates as a named person.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cooperativeGrantDecision } from '../cooperative-core-access.js';
import { tenantGrantCapabilityDecision } from '../tenant-access-authority.js';

export const assignments = Object.freeze([
  { workspaceId:'c88205a8-9a6c-4c51-ae52-508c087a2d50',slug:'jubilee-distribution',representative:'정찬균',email:'topmaster.joseph@gmail.com' },
  { workspaceId:'ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54',slug:'open-distribution',representative:'임동섭',email:'dlaehd12345619@gmail.com' },
]);
export const auditSql = `SELECT p.workspace_id,t.slug,t.status AS tenant_status,
  json_extract(p.snapshot_json,'$.founders[0].id') AS founder_id,
  json_extract(p.snapshot_json,'$.founders[0].representative') AS representative,
  json_extract(p.snapshot_json,'$.founders[0].accountEmail') AS account_email,
  g.email,g.role,g.enabled,g.expires_at,g.capabilities_json,g.denied_capabilities_json,g.principal_type,
  (SELECT COUNT(*) FROM customer_audit_logs l WHERE l.tenant_id=t.id AND l.action='cooperative.admin.assign'
    AND l.resource='cooperative-chair-admin:20261024') AS assignment_audit_count,
  (SELECT COUNT(*) FROM d1_migrations m WHERE m.name='0135_cooperative_chair_admins.sql') AS migration_applied
  FROM customer_tenants t JOIN cooperative_projects p ON p.slug=t.slug
  LEFT JOIN customer_access_grants g ON g.tenant_id=t.id
    AND lower(trim(g.email)) IN ('topmaster.joseph@gmail.com','dlaehd12345619@gmail.com')
  WHERE (t.slug='jubilee-distribution' AND p.workspace_id='c88205a8-9a6c-4c51-ae52-508c087a2d50')
    OR (t.slug='open-distribution' AND p.workspace_id='ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54');`;

export function verifyAssignmentRows(rows) {
  const checked = assignments.map(a => {
    const own = rows.filter(r => r.workspace_id===a.workspaceId && r.slug===a.slug && r.email===a.email);
    if (own.length!==1) throw new Error(`COOP_ADMIN_EXACT_GRANT_REQUIRED:${a.slug}`);
    const r=own[0];
    if (r.tenant_status!=='active' || r.principal_type!=='member' || r.founder_id!==`${a.workspaceId}:founder:1`
      || r.representative!==a.representative || r.account_email!==a.email
      || Number(r.assignment_audit_count)!==1 || Number(r.migration_applied)!==1
      || !cooperativeGrantDecision(r,{administrative:true}).allowed) throw new Error(`COOP_ADMIN_ASSIGNMENT_UNVERIFIED:${a.slug}`);
    const other=assignments.find(x=>x.workspaceId!==a.workspaceId);
    const cross=rows.find(x=>x.workspace_id===other.workspaceId && x.email===a.email);
    return {workspaceId:a.workspaceId,slug:a.slug,representative:a.representative,
      localAdminGrantVerified:true,founderAccountLinkVerified:true,assignmentAuditVerified:true,
      crossCooperativeAdminGranted:cooperativeGrantDecision(cross,{administrative:true}).allowed,
      tenantAccessManagementGranted:tenantGrantCapabilityDecision(r,'tenant.access.manage').allowed};
  });
  return {schemaVersion:1,status:'stored-cooperative-admin-assignments-verified',checked,
    googleLoginVerified:false,authenticatedProductionWritesVerified:false,
    scope:'Canonical D1 grant and founder link checked with current EKODI Core authorization decisions; no session minted or named-user impersonation.'};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if (!process.env.GITHUB_ACTIONS || process.env.GITHUB_REF!=='refs/heads/main') throw new Error('GUARDED_MAIN_READ_ONLY_VERIFIER_REQUIRED');
  const args=['--yes',`wrangler@${process.env.WRANGLER_VERSION || '4.119.0'}`,'d1','execute','ekodi-auth','--remote','--config','wrangler.api.toml','--json','--command',auditSql];
  const parsed=JSON.parse(execFileSync('npx',args,{encoding:'utf8',maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}));
  const sets=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.result)?parsed.result:[parsed]);
  if (!sets.length || sets.some(s=>s.success===false)) throw new Error('COOP_ADMIN_D1_QUERY_FAILED');
  const evidence=verifyAssignmentRows(sets.flatMap(s=>s.results||[]));
  Object.assign(evidence,{observedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
    productionHost:'ekodi.kr',database:'ekodi-auth',taskId:process.env.EKODI_ORCHESTRATION_TASK_ID || null});
  fs.mkdirSync('artifacts/cooperative-admin-grants',{recursive:true});
  fs.writeFileSync('artifacts/cooperative-admin-grants/evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}
