const clean=(value,max=320)=>String(value??'').trim().slice(0,max);

export const ACCESS_PRINCIPAL_TYPES=Object.freeze({
  member:'member',
  externalCollaborator:'external_collaborator',
  ai:'ai',
});

export const EXTERNAL_DEVELOPER_ALLOWED=Object.freeze([
  'tenant.dashboard.read',
  'tenant.site.source.read',
  'tenant.preview.read',
  'tenant.logs.read',
  'tenant.test.run',
  'tenant.pr.create',
]);

export const EXTERNAL_DEVELOPER_DENIED=Object.freeze([
  'tenant.access.manage',
  'tenant.member.private.read',
  'tenant.member-roster.manage',
  'tenant.billing.read',
  'tenant.billing.manage',
  'tenant.finance.read',
  'tenant.secrets.read',
  'tenant.production.deploy',
  'platform.admin',
  'platform.secrets.read',
  'platform.production.deploy',
]);

export const ACCESS_ROLE_PRESETS=Object.freeze({
  external_vendor:Object.freeze({
    principalType:ACCESS_PRINCIPAL_TYPES.externalCollaborator,
    allowed:Object.freeze([
      'tenant.dashboard.read',
      'tenant.preview.read',
      'tenant.logs.read',
      'tenant.integration.inspect',
      'tenant.integration.test',
    ]),
    denied:Object.freeze([
      'tenant.access.manage',
      'tenant.member.private.read',
      'tenant.member-roster.manage',
      'tenant.billing.read',
      'tenant.billing.manage',
      'tenant.finance.read',
      'tenant.finance.manage',
      'tenant.secrets.read',
      'tenant.production.deploy',
      'platform.admin',
      'platform.secrets.read',
      'platform.production.deploy',
    ]),
    requiresExpiry:true,
    requiresGithubUsername:false,
    maxDurationDays:180,
  }),
  external_developer:Object.freeze({
    principalType:ACCESS_PRINCIPAL_TYPES.externalCollaborator,
    allowed:EXTERNAL_DEVELOPER_ALLOWED,
    denied:EXTERNAL_DEVELOPER_DENIED,
    requiresExpiry:true,
    requiresGithubUsername:true,
    maxDurationDays:180,
  }),
});

export function normalizeAccessRole(value){return clean(value,80).toLowerCase();}
export function normalizePrincipalType(value){
  const normalized=clean(value,80).toLowerCase();
  return Object.values(ACCESS_PRINCIPAL_TYPES).includes(normalized)?normalized:ACCESS_PRINCIPAL_TYPES.member;
}
export function normalizeGithubUsername(value){
  const normalized=clean(value,80).replace(/^@/,'');
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(normalized)?normalized:'';
}
export function parseCapabilityList(value){
  if(Array.isArray(value))return [...new Set(value.map(item=>clean(item,160)).filter(Boolean))];
  try{return parseCapabilityList(JSON.parse(String(value||'[]')));}catch{return [];}
}
export function stringifyCapabilityList(value){return JSON.stringify(parseCapabilityList(value));}
export function accessRolePreset(role){return ACCESS_ROLE_PRESETS[normalizeAccessRole(role)]||null;}
export function accessGrantExpired(grant,now=new Date()){
  const raw=clean(grant?.expires_at??grant?.expiresAt,64);
  if(!raw)return false;
  const expires=Date.parse(raw);
  return Number.isFinite(expires)&&expires<=now.getTime();
}
export function accessGrantIsActive(grant,now=new Date()){
  return Boolean(grant)&&Number(grant.enabled)===1&&!accessGrantExpired(grant,now);
}
export function effectiveAccessCapabilities(grant){
  if(!grant)return [];
  const preset=accessRolePreset(grant.role);
  const allowed=new Set(preset?.allowed||parseCapabilityList(grant.capabilities_json??grant.capabilities));
  const denied=new Set([...(preset?.denied||[]),...parseCapabilityList(grant.denied_capabilities_json??grant.deniedCapabilities)]);
  return [...allowed].filter(capability=>!denied.has(capability));
}
export function accessGrantCan(grant,capability,now=new Date()){
  if(!accessGrantIsActive(grant,now))return false;
  const target=clean(capability,160);
  const denied=new Set([...(accessRolePreset(grant.role)?.denied||[]),...parseCapabilityList(grant.denied_capabilities_json??grant.deniedCapabilities)]);
  if(denied.has(target))return false;
  return effectiveAccessCapabilities(grant).includes(target);
}
export function validateAccessGrantInput(input,{now=new Date()}={}){
  const role=normalizeAccessRole(input?.role);
  const preset=accessRolePreset(role);
  if(!preset)return {ok:true,role,principalType:normalizePrincipalType(input?.principalType),githubUsername:normalizeGithubUsername(input?.githubUsername),expiresAt:clean(input?.expiresAt,64),allowed:parseCapabilityList(input?.capabilities),denied:parseCapabilityList(input?.deniedCapabilities)};
  const githubUsername=normalizeGithubUsername(input?.githubUsername);
  const expiresAt=clean(input?.expiresAt,64);
  if(preset.requiresGithubUsername&&!githubUsername)return {ok:false,error:'GITHUB_USERNAME_REQUIRED'};
  if(preset.requiresExpiry&&!expiresAt)return {ok:false,error:'EXPIRY_REQUIRED'};
  const expires=Date.parse(expiresAt);
  if(!Number.isFinite(expires)||expires<=now.getTime())return {ok:false,error:'INVALID_EXPIRY'};
  if(preset.maxDurationDays&&expires-now.getTime()>preset.maxDurationDays*86400000)return {ok:false,error:'EXPIRY_TOO_LONG'};
  return {ok:true,role,principalType:preset.principalType,githubUsername,expiresAt:new Date(expires).toISOString(),allowed:[...preset.allowed],denied:[...preset.denied]};
}
export function canTenantActorAssignRole(actorRole,targetRole){
  const actor=normalizeAccessRole(actorRole),target=normalizeAccessRole(targetRole);
  if(!['owner','tenant_admin','admin','store_owner','client_admin','workspace_admin'].includes(actor))return false;
  return target==='external_developer'||['manager','marketer','accountant','staff','member','viewer','marketing_manager','accounting_manager','client_editor','client_viewer'].includes(target);
}
export function accessGovernanceSnapshot(){return Object.freeze({version:2,denyOverridesAllow:true,tenantScopeRequired:true,externalVendor:ACCESS_ROLE_PRESETS.external_vendor,externalDeveloper:ACCESS_ROLE_PRESETS.external_developer});}
