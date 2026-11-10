// Site-owned search/promotion oversight: aggregate existing tenant-scoped receipts.
// Read-only projection. No cross-tenant writes, credentials, private campaign contents,
// provider registration or ranking assertions are produced by this module.
const numberOrNull = value => Number.isFinite(Number(value)) && value !== null && value !== undefined
  ? Math.max(0, Math.trunc(Number(value))) : null;
const pathOf = url => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'ekodi.kr' || u.username || u.password || u.search || u.hash) return null;
    const path = u.pathname.replace(new RegExp('/+
    return new RegExp('^/[a-z0-9/_-]* && !path.includes('//') ? path : null;
  } catch { return null; }
};
export function buildSiteSearchPromotionOversight({sites=[],automation={}}={}) {
  const sourceSites = Array.isArray(automation?.sites) ? automation.sites : [];
  const sourceByPath = new Map(sourceSites.map(row=>[String(row?.basePath||'').replace(/\/+$/,'')||'/',row]));
  return (Array.isArray(sites)?sites:[]).map(site=>{
    const canonical=site?.propertyType==='canonical' && pathOf(site.url);
    const record=canonical ? sourceByPath.get(canonical) : null;
    const jobSource=automation?.sources?.jobs === 'ready' && record?.scope==='explicit_subject';
    const connectionSource=automation?.sources?.connections === 'ready' && record?.scope==='explicit_subject';
    const indexSource=automation?.sources?.indexNow === 'ready' && record?.scope==='explicit_subject';
    const failed=jobSource?numberOrNull(record.failedJobs):null;
    const pending=jobSource?numberOrNull(record.pendingJobs):null;
    const published=jobSource?numberOrNull(record.publishedTotal):null;
    const submitted=indexSource?numberOrNull(record.indexNowSubmittedPages):null;
    let status='unreported',recommendation='사이트 자체 운영 보고가 없습니다. 현장 관리 기능과 권한 연결을 점검하세요.';
    if (record && jobSource && failed!==null && failed>0) {
      status='needs_action';
      recommendation='사이트 담당자에게 실패한 홍보 작업의 원인 확인과 안전한 재시도를 요청하세요.';
    } else if (record && jobSource && pending!==null && pending>0) {
      status='review';
      recommendation='사이트의 예약·재시도 작업 결과를 확인하고 보고를 갱신하세요.';
    } else if (record && jobSource && published!==null && connectionSource) {
      status='reported';
      recommendation='사이트 자체 실행을 유지하고 검색 공급자 실측 자료와 승인 대기사항을 검토하세요.';
    } else if (record && (jobSource || indexSource || connectionSource)) {
      status='partial';
      recommendation='일부 실행 근거만 연결되었습니다. 누락된 사이트 보고 계약을 확인하세요.';
    }
    const adminPath=record?.adminPath && /^\/[a-z0-9/_-]+$/i.test(record.adminPath)
      ? record.adminPath : '';
    return {
      siteUrl:String(site?.url||''), siteName:String(site?.name||'사이트'),
      status, recommendation, adminPath, reportScope:record?.scope||'not_integrated',
      publishedJobs:published,pendingJobs:pending,failedJobs:failed,
      indexNowSubmittedPages:submitted,activeChannels:connectionSource?numberOrNull(record.activeChannels):null,
      lastPublishedAt:jobSource?record.lastPublishedAt||null:null,
      lastIndexNowSubmittedAt:indexSource?record.lastIndexNowSubmittedAt||null:null,
      providerVerified:false,
      caveat:'사이트 소유 실행 원장의 요약이며 검색엔진 색인·순위·AI 인용의 증거가 아닙니다.'
    };
  });
}
), '') || '/';
    return /^\/[a-z0-9/_-]*$/i.test(path) && !path.includes('//') ? path : null;
  } catch { return null; }
};
export function buildSiteSearchPromotionOversight({sites=[],automation={}}={}) {
  const sourceSites = Array.isArray(automation?.sites) ? automation.sites : [];
  const sourceByPath = new Map(sourceSites.map(row=>[String(row?.basePath||'').replace(/\/+$/,'')||'/',row]));
  return (Array.isArray(sites)?sites:[]).map(site=>{
    const canonical=site?.propertyType==='canonical' && pathOf(site.url);
    const record=canonical ? sourceByPath.get(canonical) : null;
    const jobSource=automation?.sources?.jobs === 'ready' && record?.scope==='explicit_subject';
    const connectionSource=automation?.sources?.connections === 'ready' && record?.scope==='explicit_subject';
    const indexSource=automation?.sources?.indexNow === 'ready' && record?.scope==='explicit_subject';
    const failed=jobSource?numberOrNull(record.failedJobs):null;
    const pending=jobSource?numberOrNull(record.pendingJobs):null;
    const published=jobSource?numberOrNull(record.publishedTotal):null;
    const submitted=indexSource?numberOrNull(record.indexNowSubmittedPages):null;
    let status='unreported',recommendation='사이트 자체 운영 보고가 없습니다. 현장 관리 기능과 권한 연결을 점검하세요.';
    if (record && jobSource && failed!==null && failed>0) {
      status='needs_action';
      recommendation='사이트 담당자에게 실패한 홍보 작업의 원인 확인과 안전한 재시도를 요청하세요.';
    } else if (record && jobSource && pending!==null && pending>0) {
      status='review';
      recommendation='사이트의 예약·재시도 작업 결과를 확인하고 보고를 갱신하세요.';
    } else if (record && jobSource && published!==null && connectionSource) {
      status='reported';
      recommendation='사이트 자체 실행을 유지하고 검색 공급자 실측 자료와 승인 대기사항을 검토하세요.';
    } else if (record && (jobSource || indexSource || connectionSource)) {
      status='partial';
      recommendation='일부 실행 근거만 연결되었습니다. 누락된 사이트 보고 계약을 확인하세요.';
    }
    const adminPath=record?.adminPath && /^\/[a-z0-9/_-]+$/i.test(record.adminPath)
      ? record.adminPath : '';
    return {
      siteUrl:String(site?.url||''), siteName:String(site?.name||'사이트'),
      status, recommendation, adminPath, reportScope:record?.scope||'not_integrated',
      publishedJobs:published,pendingJobs:pending,failedJobs:failed,
      indexNowSubmittedPages:submitted,activeChannels:connectionSource?numberOrNull(record.activeChannels):null,
      lastPublishedAt:jobSource?record.lastPublishedAt||null:null,
      lastIndexNowSubmittedAt:indexSource?record.lastIndexNowSubmittedAt||null:null,
      providerVerified:false,
      caveat:'사이트 소유 실행 원장의 요약이며 검색엔진 색인·순위·AI 인용의 증거가 아닙니다.'
    };
  });
}
,'i').test(path) && !path.includes('//') ? path : null;
  } catch { return null; }
};
export function buildSiteSearchPromotionOversight({sites=[],automation={}}={}) {
  const sourceSites = Array.isArray(automation?.sites) ? automation.sites : [];
  const sourceByPath = new Map(sourceSites.map(row=>[String(row?.basePath||'').replace(/\/+$/,'')||'/',row]));
  return (Array.isArray(sites)?sites:[]).map(site=>{
    const canonical=site?.propertyType==='canonical' && pathOf(site.url);
    const record=canonical ? sourceByPath.get(canonical) : null;
    const jobSource=automation?.sources?.jobs === 'ready' && record?.scope==='explicit_subject';
    const connectionSource=automation?.sources?.connections === 'ready' && record?.scope==='explicit_subject';
    const indexSource=automation?.sources?.indexNow === 'ready' && record?.scope==='explicit_subject';
    const failed=jobSource?numberOrNull(record.failedJobs):null;
    const pending=jobSource?numberOrNull(record.pendingJobs):null;
    const published=jobSource?numberOrNull(record.publishedTotal):null;
    const submitted=indexSource?numberOrNull(record.indexNowSubmittedPages):null;
    let status='unreported',recommendation='사이트 자체 운영 보고가 없습니다. 현장 관리 기능과 권한 연결을 점검하세요.';
    if (record && jobSource && failed!==null && failed>0) {
      status='needs_action';
      recommendation='사이트 담당자에게 실패한 홍보 작업의 원인 확인과 안전한 재시도를 요청하세요.';
    } else if (record && jobSource && pending!==null && pending>0) {
      status='review';
      recommendation='사이트의 예약·재시도 작업 결과를 확인하고 보고를 갱신하세요.';
    } else if (record && jobSource && published!==null && connectionSource) {
      status='reported';
      recommendation='사이트 자체 실행을 유지하고 검색 공급자 실측 자료와 승인 대기사항을 검토하세요.';
    } else if (record && (jobSource || indexSource || connectionSource)) {
      status='partial';
      recommendation='일부 실행 근거만 연결되었습니다. 누락된 사이트 보고 계약을 확인하세요.';
    }
    const adminPath=record?.adminPath && /^\/[a-z0-9/_-]+$/i.test(record.adminPath)
      ? record.adminPath : '';
    return {
      siteUrl:String(site?.url||''), siteName:String(site?.name||'사이트'),
      status, recommendation, adminPath, reportScope:record?.scope||'not_integrated',
      publishedJobs:published,pendingJobs:pending,failedJobs:failed,
      indexNowSubmittedPages:submitted,activeChannels:connectionSource?numberOrNull(record.activeChannels):null,
      lastPublishedAt:jobSource?record.lastPublishedAt||null:null,
      lastIndexNowSubmittedAt:indexSource?record.lastIndexNowSubmittedAt||null:null,
      providerVerified:false,
      caveat:'사이트 소유 실행 원장의 요약이며 검색엔진 색인·순위·AI 인용의 증거가 아닙니다.'
    };
  });
}
), '') || '/';
    return new RegExp('^/[a-z0-9/_-]* && !path.includes('//') ? path : null;
  } catch { return null; }
};
export function buildSiteSearchPromotionOversight({sites=[],automation={}}={}) {
  const sourceSites = Array.isArray(automation?.sites) ? automation.sites : [];
  const sourceByPath = new Map(sourceSites.map(row=>[String(row?.basePath||'').replace(/\/+$/,'')||'/',row]));
  return (Array.isArray(sites)?sites:[]).map(site=>{
    const canonical=site?.propertyType==='canonical' && pathOf(site.url);
    const record=canonical ? sourceByPath.get(canonical) : null;
    const jobSource=automation?.sources?.jobs === 'ready' && record?.scope==='explicit_subject';
    const connectionSource=automation?.sources?.connections === 'ready' && record?.scope==='explicit_subject';
    const indexSource=automation?.sources?.indexNow === 'ready' && record?.scope==='explicit_subject';
    const failed=jobSource?numberOrNull(record.failedJobs):null;
    const pending=jobSource?numberOrNull(record.pendingJobs):null;
    const published=jobSource?numberOrNull(record.publishedTotal):null;
    const submitted=indexSource?numberOrNull(record.indexNowSubmittedPages):null;
    let status='unreported',recommendation='사이트 자체 운영 보고가 없습니다. 현장 관리 기능과 권한 연결을 점검하세요.';
    if (record && jobSource && failed!==null && failed>0) {
      status='needs_action';
      recommendation='사이트 담당자에게 실패한 홍보 작업의 원인 확인과 안전한 재시도를 요청하세요.';
    } else if (record && jobSource && pending!==null && pending>0) {
      status='review';
      recommendation='사이트의 예약·재시도 작업 결과를 확인하고 보고를 갱신하세요.';
    } else if (record && jobSource && published!==null && connectionSource) {
      status='reported';
      recommendation='사이트 자체 실행을 유지하고 검색 공급자 실측 자료와 승인 대기사항을 검토하세요.';
    } else if (record && (jobSource || indexSource || connectionSource)) {
      status='partial';
      recommendation='일부 실행 근거만 연결되었습니다. 누락된 사이트 보고 계약을 확인하세요.';
    }
    const adminPath=record?.adminPath && /^\/[a-z0-9/_-]+$/i.test(record.adminPath)
      ? record.adminPath : '';
    return {
      siteUrl:String(site?.url||''), siteName:String(site?.name||'사이트'),
      status, recommendation, adminPath, reportScope:record?.scope||'not_integrated',
      publishedJobs:published,pendingJobs:pending,failedJobs:failed,
      indexNowSubmittedPages:submitted,activeChannels:connectionSource?numberOrNull(record.activeChannels):null,
      lastPublishedAt:jobSource?record.lastPublishedAt||null:null,
      lastIndexNowSubmittedAt:indexSource?record.lastIndexNowSubmittedAt||null:null,
      providerVerified:false,
      caveat:'사이트 소유 실행 원장의 요약이며 검색엔진 색인·순위·AI 인용의 증거가 아닙니다.'
    };
  });
}
,'i').test(path) && !path.includes('//') ? path : null;
  } catch { return null; }
};
export function buildSiteSearchPromotionOversight({sites=[],automation={}}={}) {
  const sourceSites = Array.isArray(automation?.sites) ? automation.sites : [];
  const sourceByPath = new Map(sourceSites.map(row=>[String(row?.basePath||'').replace(/\/+$/,'')||'/',row]));
  return (Array.isArray(sites)?sites:[]).map(site=>{
    const canonical=site?.propertyType==='canonical' && pathOf(site.url);
    const record=canonical ? sourceByPath.get(canonical) : null;
    const jobSource=automation?.sources?.jobs === 'ready' && record?.scope==='explicit_subject';
    const connectionSource=automation?.sources?.connections === 'ready' && record?.scope==='explicit_subject';
    const indexSource=automation?.sources?.indexNow === 'ready' && record?.scope==='explicit_subject';
    const failed=jobSource?numberOrNull(record.failedJobs):null;
    const pending=jobSource?numberOrNull(record.pendingJobs):null;
    const published=jobSource?numberOrNull(record.publishedTotal):null;
    const submitted=indexSource?numberOrNull(record.indexNowSubmittedPages):null;
    let status='unreported',recommendation='사이트 자체 운영 보고가 없습니다. 현장 관리 기능과 권한 연결을 점검하세요.';
    if (record && jobSource && failed!==null && failed>0) {
      status='needs_action';
      recommendation='사이트 담당자에게 실패한 홍보 작업의 원인 확인과 안전한 재시도를 요청하세요.';
    } else if (record && jobSource && pending!==null && pending>0) {
      status='review';
      recommendation='사이트의 예약·재시도 작업 결과를 확인하고 보고를 갱신하세요.';
    } else if (record && jobSource && published!==null && connectionSource) {
      status='reported';
      recommendation='사이트 자체 실행을 유지하고 검색 공급자 실측 자료와 승인 대기사항을 검토하세요.';
    } else if (record && (jobSource || indexSource || connectionSource)) {
      status='partial';
      recommendation='일부 실행 근거만 연결되었습니다. 누락된 사이트 보고 계약을 확인하세요.';
    }
    const adminPath=record?.adminPath && /^\/[a-z0-9/_-]+$/i.test(record.adminPath)
      ? record.adminPath : '';
    return {
      siteUrl:String(site?.url||''), siteName:String(site?.name||'사이트'),
      status, recommendation, adminPath, reportScope:record?.scope||'not_integrated',
      publishedJobs:published,pendingJobs:pending,failedJobs:failed,
      indexNowSubmittedPages:submitted,activeChannels:connectionSource?numberOrNull(record.activeChannels):null,
      lastPublishedAt:jobSource?record.lastPublishedAt||null:null,
      lastIndexNowSubmittedAt:indexSource?record.lastIndexNowSubmittedAt||null:null,
      providerVerified:false,
      caveat:'사이트 소유 실행 원장의 요약이며 검색엔진 색인·순위·AI 인용의 증거가 아닙니다.'
    };
  });
}
