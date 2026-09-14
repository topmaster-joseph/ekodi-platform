export const ADMIN_SERVICE_CATALOG = Object.freeze([
  { id:'church', name:'에코디교회', basePath:'/ekodichurch', group:'community' },
  { id:'biz', name:'에코디비즈', basePath:'/ekodibiz', group:'business' },
  { id:'mall', name:'에코디몰', basePath:'/ekodibiz/ekodimall', group:'business' },
  { id:'marketing', name:'마케팅 AI', basePath:'/ekodibiz/marketing-ai', group:'business' },
  { id:'trade', name:'에코디 트레이딩', basePath:'/ekodibiz/trade', group:'business' },
  { id:'invest', name:'에코디 투자', basePath:'/ekodibiz/invest', group:'business' },
  { id:'bible', name:'에코디 말씀대화', basePath:'/bible', group:'knowledge' },
  { id:'books', name:'에코디서점', basePath:'/books', group:'knowledge' },
  { id:'publishing', name:'출판', basePath:'/publishing', group:'knowledge' },
  { id:'author', name:'크리에이터 AI', basePath:'/author', group:'knowledge' },
  { id:'journal', name:'에코디 저널', basePath:'/journal', group:'knowledge' },
  { id:'business', name:'비즈니스 OS', basePath:'/business', group:'business' },
  { id:'management', name:'경영플랫폼', basePath:'/management', group:'business' },
  { id:'support', name:'지원사업 AI', basePath:'/support', group:'business' },
  { id:'money', name:'에코디 머니', basePath:'/money', group:'business' },
  { id:'pay', name:'에코디 페이', basePath:'/pay', group:'business' },
  { id:'insurance', name:'보험', basePath:'/insurance', group:'professional' },
  { id:'community', name:'커뮤니티', basePath:'/community', group:'community' },
  { id:'social', name:'에코디 소셜', basePath:'/social', group:'community' },
  { id:'education', name:'교육', basePath:'/education', group:'knowledge' },
  { id:'life', name:'인생 AI', basePath:'/life', group:'professional' },
  { id:'experience', name:'체험서비스', basePath:'/experience', group:'public' },
  { id:'energy', name:'에너지', basePath:'/energy', group:'professional' },
  { id:'live', name:'에코디 라이브', basePath:'/live', group:'public' },
  { id:'mail', name:'에코디 메일', basePath:'/mail', group:'public' },
  { id:'work', name:'에코디 워크', basePath:'/work', group:'professional' },
  { id:'lab', name:'에코디연구소', basePath:'/ekodilab', group:'knowledge' },
  { id:'cafe', name:'에코디 카페', basePath:'/cafe', group:'community' },
  { id:'cmpmyi', name:'통합 매장 운영', basePath:'/cmpmyi', group:'sites' },
  { id:'developer', name:'개발자 서비스', basePath:'/developer', group:'professional' },
  { id:'tax', name:'세금·증빙', basePath:'/tax', group:'professional' },
  { id:'cgma', name:'청계면상인회', basePath:'/cgma', group:'sites' },
  { id:'jadam', name:'자담치킨 목포대점', basePath:'/jadam', group:'sites' },
  { id:'pizzamaru', name:'피자마루 목포대점', basePath:'/pizzamaru', group:'sites' },
  { id:'yogurt', name:'요거트퍼플 목포대점', basePath:'/yogurt', group:'sites' },
]);

export const ADMIN_SERVICE_GROUPS = Object.freeze([
  { id:'business', label:'비즈니스·상거래' },
  { id:'community', label:'교회·커뮤니티' },
  { id:'knowledge', label:'지식·콘텐츠' },
  { id:'professional', label:'전문서비스' },
  { id:'public', label:'공개서비스' },
  { id:'sites', label:'운영사이트·매장' },
]);

function normalizeBasePath(value){
  const raw=String(value||'').trim().split(/[?#]/)[0];
  if(!raw||raw==='/')return '/';
  return `/${raw.replace(/^\/+|\/+$/g,'')}`.replace(/\/{2,}/g,'/');
}

export function canonicalServiceAdminPath(basePath){
  const base=normalizeBasePath(basePath);
  return base==='/'?'/admin':`${base}/admin`;
}

export function canonicalServiceUrl(basePath){
  const base=normalizeBasePath(basePath);
  return `https://ekodi.kr${base==='/'?'':base}`;
}

export function canonicalServiceAdminUrl(basePath){
  return `https://ekodi.kr${canonicalServiceAdminPath(basePath)}`;
}

const BY_ID=new Map(ADMIN_SERVICE_CATALOG.map(item=>[item.id,item]));
const BY_BASE=new Map(ADMIN_SERVICE_CATALOG.map(item=>[normalizeBasePath(item.basePath),item]));

export function getAdminService(id){return BY_ID.get(String(id||'').trim().toLowerCase())||null}
export function getAdminServiceByBasePath(path){return BY_BASE.get(normalizeBasePath(path))||null}
