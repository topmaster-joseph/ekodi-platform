// Shared pure rules: never infer consent or combine organization recipient rosters.
export const ORGANIZATIONS = Object.freeze(['church','mission','joint']);
export const AUDIENCES = Object.freeze(['supporters','prayer','fan','missionfund','site']);
export const FORMATS = Object.freeze(['letter','report','prayer','missionfund']);
export const KINDS = Object.freeze(['worship','meeting','service','education','prayer','other']);
export const PUBLIC_DEFAULT = 'supporters';
export function clean(value, max = 2000) { return String(value ?? '').trim().slice(0,max); }
export function email(value) { const s=clean(value,254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:''; }
export function organizationMatches(entryOrg,targetOrg) { return entryOrg === targetOrg || entryOrg === 'joint'; }
export function permittedForAudience(entry,audience,org) {
  if(!organizationMatches(entry.organization,org)) return false;
  if(audience === 'site') return entry.visibility === 'public' && entry.public_consent === 1 && !!entry.published_at;
  const external = audience === 'fan' || audience === 'missionfund';
  if(entry.visibility === 'external' && !external) return false;
  if(external && entry.people_present === 1 && entry.external_consent !== 1) return false;
  return true;
}
export function canPublishPublic(entry) {
  return entry.visibility === 'public' && entry.public_consent === 1;
}
export function giftDisclosure(org) {
  return org === 'church'
    ? '후원 안내: 에코디교회(307-82-82097) · 기부금영수증 발급 가능(발급 요건 확인 후 처리).'
    : '후원 안내: 에코디선교회(120-82-72255) · 기부금영수증 발급 불가.';
}
export function draftText(entries,{organization,format,title}) {
  const orgName=organization === 'church'?'에코디교회':'에코디선교회';
  const heading=format === 'prayer'?'함께 드리는 기도':format === 'report'?'사역보고':'사역소식과 기도편지';
  const body=[heading,orgName+' · '+clean(title,150),'','안녕하세요. 함께해 주시는 모든 분께 사역의 소식을 전합니다.',''];
  entries.forEach((entry,index)=>{
    body.push(String(index+1)+'. '+clean(entry.title,240)+' ('+clean(entry.occurred_on,10)+')');
    body.push(clean(entry.body,5000) || '상세 기록 확인필요'); body.push('');
  });
  body.push('기도와 협력 요청','위 사역을 위해 함께 기도해 주시기 바랍니다. 구체적인 기도 제목은 발행자가 확인하여 보완합니다.','',''+giftDisclosure(organization));
  body.push('','이 글은 기록을 바탕으로 만든 초안입니다. 최종 발송 전에 정찬균 목사의 검토와 승인이 필요합니다.');
  return body.join('\n');
}
export function duplicateFingerprint(entries) {
  return entries.map(x=>clean(x.id,100)).sort().join('|');
}
export function safePhotoKey(value) { return /^sosik\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(String(value||'')); }
export function photoKeys(value) {
  return Array.isArray(value) ? [...new Set(value.filter(safePhotoKey))].slice(0,8) : [];
}
export function csvRows(text) {
  // RFC4180-compatible basic CSV parser: preserve quoted commas and newlines.
  const rows=[];let current='',cells=[],quoted=false;
  const src=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<src.length;i++) {
    const c=src[i];
    if(c==='"' && quoted && src[i+1]==='"') {current+='"';i++;continue;}
    if(c==='"') {quoted=!quoted;continue;}
    if(c===','&&!quoted){cells.push(current);current='';continue;}
    if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&src[i+1]==='\n')i++;cells.push(current);if(cells.some(x=>x.trim()))rows.push(cells);current='';cells=[];continue;}
    current+=c;
  }
  if(quoted)throw new Error('닫히지 않은 CSV 따옴표');
  cells.push(current);if(cells.some(x=>x.trim()))rows.push(cells);
  return rows;
}
