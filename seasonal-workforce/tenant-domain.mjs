// Tenant authorization adapter for the future authenticated API.
// Identity and membership MUST come from verified server-side auth, not request JSON.
import {validateFarmDemand,summarizeFarmDemands} from './demand-domain.mjs';

export function requireTenantAccess(identity, tenantId, allowedRoles) {
  if (!identity || !identity.userId) return {ok:false,status:401,code:'authentication_required'};
  if (!tenantId || typeof tenantId!=='string') return {ok:false,status:400,code:'invalid_tenant'};
  const memberships=Array.isArray(identity.verifiedMemberships)?identity.verifiedMemberships:[];
  const match=memberships.find(m=>m.tenantId===tenantId && allowedRoles.includes(m.role) && m.active===true);
  return match?{ok:true,userId:identity.userId,tenantId,role:match.role}:{ok:false,status:403,code:'forbidden'};
}

export function buildDemandSubmission(input,identity,tenantId) {
  const permission=requireTenantAccess(identity,tenantId,['farm_applicant','municipal_operator']);
  if(!permission.ok) return permission;
  return {ok:true,record:{...validateFarmDemand(input),tenant_id:permission.tenantId,created_by:permission.userId,status:'submitted'}};
}

export function authorizeDemandReview(identity,tenantId,nextStatus) {
  const permission=requireTenantAccess(identity,tenantId,['municipal_operator']);
  if(!permission.ok) return permission;
  if(!['under_review','approved','rejected'].includes(nextStatus)) return {ok:false,status:400,code:'invalid_review_status'};
  return {ok:true,reviewerId:permission.userId,tenantId,status:nextStatus};
}

export function tenantStatistics(records,identity,tenantId) {
  const permission=requireTenantAccess(identity,tenantId,['municipal_operator']);
  if(!permission.ok) return permission;
  // Only trusted DB-filtered records should be passed. Check again defensively.
  if(!Array.isArray(records)||records.some(r=>r.tenant_id!==tenantId)) return {ok:false,status:403,code:'cross_tenant_data'};
  return {ok:true,statistics:summarizeFarmDemands(records)};
}
