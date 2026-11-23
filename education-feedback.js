// 강의 피드백 설문 (QR 응답, 익명) — 2026-11-16.
// Public: POST /study/live/feedback/api/responses (anonymous, one answer per device per 차수, overwrite).
// Instructor-only: GET /study/live/feedback/api/summary?c=&s= (signed instructor session cookie).
// Answers live in the existing R2 bucket (EDU_DOCS) under edu/feedback/<course>/s<n>/<device>.json.
// No names, no contact data, no IP stored.
import {hasInstructorSession} from './education-instructor-gate.js';

const BASE='/study/live/feedback/api/';
export const FEEDBACK_PREFIX='edu/feedback/';
export const FEEDBACK_COURSES=Object.freeze({'mnu-factchat-2026':{sessions:6}});
export const SCORE_KEYS=Object.freeze(['overall','practice','clarity','apply']);
export const FIELDS=Object.freeze(['planning','academic','student','research','admin','outreach','facility','other']);
export const USEFUL=Object.freeze(['hwp','minutes','ppt','chat','research','screen']);
const TEXT_LIMITS=Object.freeze({good:300,improve:500,next:300});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const cleanText=(v,max)=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);

export function validateResponse(body){
  const course=String(body?.course||'');const conf=FEEDBACK_COURSES[course];
  if(!conf)return {ok:false,code:'unknown_course'};
  const session=Number(body?.session);
  if(!Number.isInteger(session)||session<1||session>conf.sessions)return {ok:false,code:'bad_session'};
  if(!/^[a-f0-9]{32}$/.test(String(body?.device||'')))return {ok:false,code:'bad_device'};
  const scores={};
  for(const k of SCORE_KEYS){const v=Number(body?.scores?.[k]);if(!Number.isInteger(v)||v<1||v>5)return {ok:false,code:'score_required',field:k};scores[k]=v;}
  const field=FIELDS.includes(body?.field)?body.field:'other';
  const useful=[...new Set((Array.isArray(body?.useful)?body.useful:[]).filter(x=>USEFUL.includes(x)))];
  const text={};for(const [k,max] of Object.entries(TEXT_LIMITS))text[k]=cleanText(body?.text?.[k],max);
  return {ok:true,record:{course,session,device:body.device,scores,field,useful,text}};
}

export function summarize(records){
  const n=records.length,avg={},dist={},fields={},useful={},comments={good:[],improve:[],next:[]};
  for(const k of SCORE_KEYS){const vals=records.map(r=>r.scores?.[k]).filter(Number.isFinite);avg[k]=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100:null;dist[k]=[1,2,3,4,5].map(v=>vals.filter(x=>x===v).length);}
  for(const r of records){fields[r.field]=(fields[r.field]||0)+1;for(const u of r.useful||[])useful[u]=(useful[u]||0)+1;for(const k of Object.keys(comments))if(r.text?.[k])comments[k].push(r.text[k]);}
  return {count:n,avg,dist,fields,useful,comments};
}

async function listRecords(bucket,prefix){
  const keys=[];let cursor;
  do{const page=await bucket.list({prefix,cursor,limit:1000});for(const o of page.objects||[])keys.push(o.key);cursor=page.truncated?page.cursor:undefined;}while(cursor);
  const records=[];
  for(const key of keys){const obj=await bucket.get(key);if(!obj)continue;try{records.push(await obj.json());}catch{}}
  return records;
}

export async function educationFeedback(request,env,{url=new URL(request.url),now=Date.now()}={}){
  if(!url.pathname.startsWith(BASE))return null;
  const bucket=env.EDU_DOCS;
  if(!bucket)return json({ok:false,code:'not_configured'},503);
  if(url.pathname===BASE+'responses'&&request.method==='POST'){
    const origin=request.headers.get('origin');
    if(origin&&origin!=='https://ekodi.kr'&&origin!==url.origin)return json({ok:false,code:'origin_forbidden'},403);
    const raw=await request.text();
    if(raw.length>6000)return json({ok:false,code:'too_large'},413);
    let body;try{body=JSON.parse(raw);}catch{return json({ok:false,code:'bad_json'},400);}
    const v=validateResponse(body);if(!v.ok)return json(v,400);
    const r=v.record;
    await bucket.put(FEEDBACK_PREFIX+r.course+'/s'+r.session+'/'+r.device+'.json',JSON.stringify({...r,at:new Date(now).toISOString()}),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true});
  }
  if(url.pathname===BASE+'summary'&&request.method==='GET'){
    if(!await hasInstructorSession(request,env))return json({ok:false,code:'instructor_login_required'},401);
    const course=url.searchParams.get('c')||'mnu-factchat-2026';const conf=FEEDBACK_COURSES[course];
    if(!conf)return json({ok:false,code:'unknown_course'},400);
    const s=url.searchParams.get('s')||'all';
    if(s!=='all'&&!(Number.isInteger(+s)&&+s>=1&&+s<=conf.sessions))return json({ok:false,code:'bad_session'},400);
    const records=await listRecords(bucket,FEEDBACK_PREFIX+course+'/'+(s==='all'?'':'s'+s+'/'));
    const bySession={};for(const r of records)bySession[r.session]=(bySession[r.session]||0)+1;
    return json({ok:true,course,session:s,bySession,...summarize(records)});
  }
  return json({ok:false,code:'not_found'},404);
}
