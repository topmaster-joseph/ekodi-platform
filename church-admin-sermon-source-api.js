// These source identifiers are server-side only. Never include manuscript IDs in public worship JSON/HTML.
const CHURCH_MANUSCRIPTS=Object.freeze({
  '2026-10-18':Object.freeze({
    id:'15WKmDyYo7lfB3UwBze_dgPb2c0K0Lw8BePWiL-sByKY',
    title:'261018 에코디 말씀',
    date:'2026-10-18',
    reference:'신명기 33:12–19',
    template:'immediately-previous-published-Sunday',
    type:'native-google-document'
  })
});
const AUTH_URL='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api?scope=worship-access';
const j=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer',
 'vary':'Authorization'
}});
const isDate=v=>/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
export async function handleChurchAdminSermonSource(request,env={},deps={}){
 const url=new URL(request.url);
 if(url.pathname.replace(/\/+$/,'')!=='/api/admin/church-worship-drive-source')return null;
 if(request.method!=='GET')return j({ok:false,code:'METHOD_NOT_ALLOWED'},405);
 const auth=request.headers.get('authorization')||'';
 const origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return j({ok:false,code:'INVALID_ORIGIN'},403);
 if(!/^Bearer\s+\S+$/i.test(auth)||auth.length>8192)return j({ok:false,code:'AUTH_REQUIRED'},401);
 const date=url.searchParams.get('date')||'';
 if(!isDate(date))return j({ok:false,code:'INVALID_DATE'},400);
 let permit=false;
 try{
   const res=await (deps.fetch||fetch)(AUTH_URL,{headers:{authorization:auth,accept:'application/json'},redirect:'error'});
   if(res.ok){const data=await res.json();permit=data?.permissions?.worship===true;}
 }catch{return j({ok:false,code:'AUTH_UNAVAILABLE'},503);}
 if(!permit)return j({ok:false,code:'ACCESS_DENIED'},403);
 const source=CHURCH_MANUSCRIPTS[date];
 if(!source)return j({ok:false,code:'DOCUMENT_NOT_REGISTERED'},404);
 const base='https://docs.google.com/document/d/'+source.id;
 return j({ok:true,date,manuscript:{
   title:source.title,reference:source.reference,format:source.type,
   editUrl:base+'/edit',previewUrl:base+'/preview',
   refreshSeconds:60,sourceOfTruth:'google-drive-original',
   sharingWarning:'Google 원본 읽기 공개 권한은 소유자가 별도로 제한해야 합니다.'
 }});
}
