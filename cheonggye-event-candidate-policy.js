// EKODI #8506: candidate preparation only. Never grants storage, publish or send authority.
const SOURCES = Object.freeze({
  muan: 'https://www.muan.go.kr/www/openmuan/new/notice',
  mokpoEvents: 'https://event.mokpo.ac.kr/main',
  mokpoNotices: 'https://www.mokpo.ac.kr/www/308/subview.do'
});
export const cheonggyeCandidateSources = SOURCES;
const clean = (v,n=240) => typeof v==='string' ? v.trim().normalize('NFKC').slice(0,n) : '';
const key = v => clean(v).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
const date = v => {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const d=new Date(v+'T00:00:00Z');
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?v:'';
};
function officialUrl(value,sourceId) {
  if(!Object.hasOwn(SOURCES,sourceId)) return '';
  try {
    const u=new URL(value), allowed=new URL(SOURCES[sourceId]);
    if(u.protocol!=='https:'||u.origin!==allowed.origin||u.username||u.password||u.pathname==='/'||u.href.length>600) return '';
    u.hash='';
    for(const k of [...u.searchParams.keys()]) if(/^utm_/i.test(k)||['fbclid','gclid'].includes(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.toString();
  } catch { return ''; }
}
export function prepareCheonggyeCandidates(records,{today,sourceFailures=[]}={}) {
  if(!date(today)||!Array.isArray(records)||!Array.isArray(sourceFailures)) throw Error('INVALID_CANDIDATE_INPUT');
  const report={state:'review_only',coverage:sourceFailures.length?'partial':'not_independently_verified',
    sourceFailures:sourceFailures.map(x=>clean(x)).filter(Boolean),candidates:[],held:[],publications:0,deliveries:0};
  if(today<'2026-11-27'||today>'2026-12-22') return {...report,state:'outside_authorized_window'};
  const groups=new Map();
  for(const r of records){
    if(!r||typeof r!=='object') continue;
    const title=clean(r.title,180),organizer=clean(r.organizer),location=clean(r.location),summary=clean(r.summary,1800);
    const startsOn=date(r.startsOn),endsOn=date(r.endsOn)||startsOn;
    const deadline=date(r.deadline),url=officialUrl(r.url,r.sourceId),occurrence=clean(r.occurrence);
    if(r.status==='cancelled'||r.status==='completed'||r.status==='closed'||(endsOn&&endsOn<today)||(deadline&&deadline<today)) continue;
    // Verification flags must come from an authorized source adapter, not from user-facing inputs.
    if(r.verifiedOriginal!==true||r.residentEligible!==true||r.regionRelevant!==true||!url||!title||!organizer||!location||!summary||!startsOn||endsOn<startsOn||
       (r.endsOn&&!date(r.endsOn))||(r.deadline&&!deadline)||!['organizer','official_repost'].includes(r.sourceRole)){
      report.held.push({title,reason:'insufficient_verified_event_facts'});continue;
    }
    const identity=JSON.stringify([key(title),key(organizer),startsOn,key(location),key(occurrence)]);
    const entry={identity,title,organizer,location,summary,startsOn,endsOn,deadline,url,occurrence,sourceRole:r.sourceRole,sourceId:r.sourceId,
      time:clean(r.time,80),eligibility:clean(r.eligibility),fee:clean(r.fee),connectionReason:clean(r.connectionReason,400)};
    if(!entry.connectionReason){report.held.push({title,reason:'missing_connection_reason'});continue;}
    if(!groups.has(identity)) groups.set(identity,[]);
    groups.get(identity).push(entry);
  }
  for(const [identity,group] of groups){
    const originals=group.filter(r=>r.sourceRole==='organizer');
    if(!originals.length){report.held.push({title:group[0].title,reason:'organizer_original_missing'});continue;}
    const signatures=new Set(group.map(r=>JSON.stringify([r.endsOn,r.time,r.deadline])));
    if(signatures.size>1){report.held.push({title:group[0].title,reason:'conflicting_event_facts'});continue;}
    const r=originals.sort((a,b)=>a.url.localeCompare(b.url))[0];
    report.candidates.push({identity,visibility:'private',status:'planned',kind:'event',title:r.title,summary:r.summary,
      startsOn:r.startsOn,endsOn:r.endsOn,location:r.location,targetUrl:r.url,payload:{reviewState:'pending',organizer:r.organizer,
        time:r.time,deadline:r.deadline,eligibility:r.eligibility,fee:r.fee,connectionReason:r.connectionReason,occurrence:r.occurrence,
        sourceUrls:[...new Set(group.map(x=>x.url))].sort(),automationMayPublish:false}});
  }
  return report;
}
