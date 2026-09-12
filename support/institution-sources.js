const freeze=value=>Object.freeze(value);
const clean=value=>String(value??'').trim();
export const INSTITUTION_SOURCE_CLASSES=freeze([
  freeze({id:'central_government',label:'central government'}),
  freeze({id:'local_government',label:'local government'}),
  freeze({id:'quasi_government',label:'quasi-government institution'}),
  freeze({id:'public_institution',label:'public institution'}),
  freeze({id:'government_funded_research',label:'government-funded research institute'}),
  freeze({id:'public_foundation',label:'public foundation or promotion agency'}),
  freeze({id:'regional_public_innovation',label:'regional public innovation institution'}),
  freeze({id:'university_public_startup_support',label:'university or public startup support organization'})
]);
const VERIFIED_INSTITUTIONS=freeze([
  freeze({name:'\uC911\uC18C\uBCA4\uCC98\uAE30\uC5C5\uBD80',classId:'central_government'}),
  freeze({name:'\uCC3D\uC5C5\uC9C4\uD765\uC6D0',classId:'public_institution'}),
  freeze({name:'\uC18C\uC0C1\uACF5\uC778\uC2DC\uC7A5\uC9C4\uD765\uACF5\uB2E8',classId:'quasi_government'}),
  freeze({name:'\uC911\uC18C\uBCA4\uCC98\uAE30\uC5C5\uC9C4\uD765\uACF5\uB2E8',classId:'quasi_government'}),
  freeze({name:'\uD55C\uAD6D\uC804\uC790\uD1B5\uC2E0\uC5F0\uAD6C\uC6D0',classId:'government_funded_research'}),
  freeze({name:'\uD55C\uAD6D\uACFC\uD559\uAE30\uC220\uC5F0\uAD6C\uC6D0',classId:'government_funded_research'}),
  freeze({name:'\uD55C\uAD6D\uAC1C\uBC1C\uC5F0\uAD6C\uC6D0',classId:'government_funded_research'})
]);
const VERIFIED_OPPORTUNITIES=freeze([
  freeze({id:'mss-modoo-startup-2026-round2',source:'trusted-institutions',sourceName:'\uC911\uC18C\uBCA4\uCC98\uAE30\uC5C5\uBD80',sourceMode:'verified-registry',official:true,title:'\uBAA8\uB450\uC758 \uCC3D\uC5C5 \uD504\uB85C\uC81D\uD2B8 \uD1B5\uD569 \uBAA8\uC9D1 \uACF5\uACE0 (2\uCC28)',url:'https://www.mss.go.kr/site/chungnam/ex/bbs/View.do?bcIdx=1070616&cbIdx=315',agency:'\uC911\uC18C\uBCA4\uCC98\uAE30\uC5C5\uBD80',operator:'',summary:'Official 2026 second-round Modoo Startup recruitment notice.',category:'startup',target:'open-to-public-with-innovative-idea',applicationMethod:'official-platform',applicationUrl:'https://www.modoo.or.kr',contact:'',applicationPeriod:'2026-08-20 ~ 2026-09-17 16:00',publishedAt:'2026-08-20',attachmentUrl:'',attachmentName:'',tags:['startup','national','idea'],region:'',industry:'',businessType:'',institutionClass:'central_government',provenance:'official-ministry-notice',verifiedAt:'2026-09-12'})
]);
export function classifyInstitution(name=''){const value=clean(name);if(!value)return null;const exact=VERIFIED_INSTITUTIONS.find(item=>value===item.name||value.includes(item.name));return exact?freeze({...exact}):null}
export function enrichInstitutionProvenance(item={}){const match=classifyInstitution(item.operator)||classifyInstitution(item.agency)||classifyInstitution(item.sourceName);return match?{...item,institutionClass:match.classId,institutionName:match.name,provenance:item.provenance||'official-aggregator-verified-institution'}:{...item}}
export function institutionCoverageStatus(){return[{id:'trusted-institutions',name:'public-and-public-interest-institution-registry',official:true,mode:'verified_registry',endpoint:'',credential:'none',ingestion:true,capabilities:['verified-official-notices','institution-classification','active-window-filter','quasi-government','public-institution','government-funded-research','public-foundation','regional-public-innovation','university-startup-support'],coverageClasses:INSTITUTION_SOURCE_CLASSES.map(item=>item.id)}]}
export function verifiedInstitutionOpportunities(options={}){const now=clean(options.now)||new Date().toISOString();const date=now.slice(0,10);const includeExpired=options.includeExpired===true;return VERIFIED_OPPORTUNITIES.filter(item=>includeExpired||!item.applicationPeriod||date<='2026-09-17').map(item=>freeze({...item}))}
