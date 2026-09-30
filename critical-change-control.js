export const CRITICAL_CHANGE_POLICY = Object.freeze({
  version: '1.0.0',
  restorePointRetention: 10,
  destructiveProductionWritesDirect: false,
  requireImpactAnalysis: true,
  requireRestorePointBeforeMutation: true,
  requireStagingVerification: true,
  requireSuperAdminApproval: true,
  requirePostRestoreVerification: true,
  permanentDeleteSeparateApproval: true,
  d1TimeTravelPreferred: true,
  longTermExportTarget: 'r2',
});

const MASS_WORDS = [
  'all sites','every site','entire site','delete all','remove all','mass delete','bulk delete',
  '모든 사이트','전체 사이트','사이트 전부','모두 삭제','전부 삭제','대량 삭제','일괄 삭제',
];
const STRUCTURE_WORDS = [
  'architecture change','structural change','route migration','domain migration','auth migration',
  '전체 구조','구조 변경','대규모 변경','대규모 구조','경로 체계 변경','도메인 체계 변경','인증 체계 변경',
];
const DESTRUCTIVE_WORDS = [
  'delete','drop','truncate','destroy','purge','remove repository','repository delete',
  '삭제','영구삭제','폐기','저장소 삭제','db 삭제','데이터 삭제',
];

function norm(v){ return String(v ?? '').trim().toLowerCase(); }
function any(text, words){ return words.some((word)=>text.includes(word)); }

export function classifyCriticalChange(request='', action={}) {
  const text=norm(`${request} ${action.type||''} ${action.target||''}`);
  const mass=any(text,MASS_WORDS);
  const structural=any(text,STRUCTURE_WORDS);
  const destructive=any(text,DESTRUCTIVE_WORDS);
  const production=action.production===true || any(text,['production','프로덕션','운영']);
  const critical=mass || structural || (destructive && production);
  const reasons=[];
  if(mass) reasons.push('mass_scope');
  if(structural) reasons.push('structural_change');
  if(destructive) reasons.push('destructive_change');
  if(production) reasons.push('production_scope');
  return Object.freeze({
    critical,
    reasons:Object.freeze(reasons),
    gate:critical?'critical_change_super_admin':null,
    directProductionMutationAllowed:!critical,
    restorePointRequired:critical,
    stagingRequired:critical,
    approvalRequired:critical,
  });
}

export function buildRestorePoint(input={}) {
  const createdAt=input.createdAt || new Date().toISOString();
  const id=String(input.id || `rp-${createdAt.replace(/[^0-9]/g,'').slice(0,14)}-${String(input.commitSha||'unknown').slice(0,8)}`);
  return Object.freeze({
    id,
    createdAt,
    reason:String(input.reason||'critical-change-preflight'),
    actor:String(input.actor||'unknown'),
    taskId:String(input.taskId||''),
    commitSha:String(input.commitSha||''),
    releaseRef:String(input.releaseRef||''),
    d1:Object.freeze({
      database:String(input.d1?.database||''),
      bookmark:String(input.d1?.bookmark||''),
      timestamp:String(input.d1?.timestamp||createdAt),
    }),
    storageExport:Object.freeze({
      provider:String(input.storageExport?.provider||''),
      key:String(input.storageExport?.key||''),
    }),
    verified:Boolean(input.verified),
    immutable:true,
  });
}

export function retainRecentRestorePoints(points=[], limit=CRITICAL_CHANGE_POLICY.restorePointRetention) {
  const safeLimit=Math.max(1,Number(limit)||10);
  const unique=new Map();
  for(const item of points){
    if(!item?.id) continue;
    const prev=unique.get(item.id);
    if(!prev || String(item.createdAt||'') > String(prev.createdAt||'')) unique.set(item.id,item);
  }
  return Object.freeze([...unique.values()]
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .slice(0,safeLimit));
}

export function planCriticalChange(request='', action={}, restorePoints=[]) {
  const classification=classifyCriticalChange(request,action);
  const recent=retainRecentRestorePoints(restorePoints);
  return Object.freeze({
    classification,
    recentRestorePoints:recent,
    retention:CRITICAL_CHANGE_POLICY.restorePointRetention,
    next: classification.critical ? 'create_restore_point_then_stage_then_request_super_admin_approval' : 'normal_guarded_change_flow',
    permanentDeleteRequiresSeparateApproval: classification.critical && any(norm(request),['영구삭제','permanent delete','purge']),
  });
}
