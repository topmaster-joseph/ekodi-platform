/**
 * EKODI-first-party workload readiness manifests for native scheduled runs.
 *
 * Generates deterministic, auditable draft task *requirements*, not documents,
 * published books or task completion receipts. No provider AI APIs, accounts,
 * private data, database writes, task dispatch or Cloudflare deployment.
 */
import {readFile} from 'node:fs/promises';
import {monthlyEditorialSlots} from '../publishing/human/editorial-policy.js';

const ISO_DATE=/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ISO_MONTH=/^\d{4}-(?:0[1-9]|1[0-2])$/;
const KST='Asia/Seoul';
const pad=n=>String(n).padStart(2,'0');
function kstParts(date){
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:KST,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  if(!/^[0-9]{4}$/.test(parts.year))throw new Error('KST_CLOCK_UNAVAILABLE');
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),weekday:parts.weekday};
}
export function nextSundayKst(now=new Date()){
  const p=kstParts(now);
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday];
  if(!Number.isInteger(weekday))throw new Error('KST_WEEKDAY_UNAVAILABLE');
  const d=new Date(Date.UTC(p.year,p.month-1,p.day+(7-weekday)%7));
  return d.toISOString().slice(0,10);
}
export function monthKst(now=new Date()){
  const p=kstParts(now);
  return p.year+'-'+pad(p.month);
}
const fail=(reason,other={})=>({status:'blocked',reason,...other});
/**
 * Only the approved daily passage for this date is taken from the registry.
 * Approval of this registry is NOT pastoral approval of a sermon or slides.
 */
export function worshipPreparation(date,registry){
  if(typeof date!=='string'||!ISO_DATE.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z')))
    return fail('invalid_worship_date');
  const month=date.slice(0,7),day=Number(date.slice(8));
  if(registry?.status!=='approved'||registry?.month!==month||!Array.isArray(registry?.readings)||
      registry.readings.length<day||!registry?.approvedBy)
    return fail('approved_date_scripture_missing',{date});
  const scripture=registry.readings[day-1];
  const title=registry?.titles?.[day-1];
  if(typeof scripture!=='string'||scripture.trim().length<3||scripture.length>160)
    return fail('scripture_entry_invalid',{date});
  return {
    id:'ekodi:church-weekly:'+date,
    cadence:'wednesday_0826_kst',
    scheduledFor:date,
    status:'awaiting_authorized_writer_and_pastoral_review',
    scriptureAuthority:'EKODI approved common scripture registry',
    scriptureRegistryId:String(registry.id).slice(0,100),
    scripture,
    devotionTitle:typeof title==='string'?title.slice(0,160):null,
    gate:'pastor_review_and_authenticated_docs_slides_creation',
    requires:[
      'separately approved Sunday sermon scope',
      'persisted sermon Google Doc ID and readback',
      'persisted bulletin Google Doc ID and readback',
      'persisted worship Google Slides ID and readback',
      'human owner approval and distinct-run receipts',
      'exclusive native execution lease and idempotency'
    ],
    deliverables:{sermonGoogleDocId:null,bulletinGoogleDocId:null,worshipGoogleSlidesId:null},
    evidenceVerified:false,canDisableChatgptTask:false,dispatched:false,mutations:0
  };
}
export function publishingPreparation(month,slots){
  if(typeof month!=='string'||!ISO_MONTH.test(month)||!Array.isArray(slots)||slots.length!==6)
    return fail('published_editorial_policy_unavailable');
  const ids=new Set(slots.map(x=>x?.id));
  if(ids.size!==6||slots.some(x=>x.month!==month||!x?.fieldId||!x?.id))
    return fail('editorial_slots_invalid');
  return{
    id:'ekodi:human-publishing:'+month,
    cadence:'monday_0800_kst',
    month,status:'awaiting_authorized_editorial_writer_and_storage',
    owner:'EKODI Human Publishing',
    slots:slots.map(x=>({id:String(x.id).slice(0,90),fieldId:String(x.fieldId).slice(0,60),
      state:'planning_only',releaseVerified:false})),
    requiredBeforeRelease:[
      'persisted per-(month,fieldId) edition plan and original manuscript',
      'verified authorship and rights licenses',
      'human editorial approval and immutable edition digest',
      'EPUBCheck and Ace accessibility receipts',
      'authenticated publication storage and dual-channel delivery receipts',
      'exclusive native execution lease and idempotency'
    ],
    verifiedPublications:0,evidenceVerified:false,canDisableChatgptTask:false,
    dispatched:false,mutations:0
  };
}
/**
 * Injected loader enables reliable tests; production reads ONLY approved
 * repository config/common-scripture/YYYY-MM.json and never guesses scripture.
 */
export async function collectNativePreparation({now=new Date(),loadRegistry=async month=>{
  const url=new URL('../config/common-scripture/'+month+'.json',import.meta.url);
  return JSON.parse(await readFile(url,'utf8'));
}}={}){
  const sunday=nextSundayKst(now),month=monthKst(now);
  let registry=null;
  try{registry=await loadRegistry(sunday.slice(0,7));}catch{/* blocked, no model fallback */}
  let editorial;
  try{editorial=publishingPreparation(month,monthlyEditorialSlots(month));}
  catch{editorial=fail('editorial_policy_failed');}
  return{
    owner:'EKODI Orchestrator',runtime:'EKODI native read-only operations watch',
    source:'approved first-party registry and editorial policy',
    observedAt:now.toISOString(),mode:'read_only_preparation',
    church:worshipPreparation(sunday,registry),
    publishing:editorial,
    scheduledWrites:0,modelCalls:0,salesOrPublicationActions:0,
    chatgptTaskDisables:0,
    complete:false
  };
}
