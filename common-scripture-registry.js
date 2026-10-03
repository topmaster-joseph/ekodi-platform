import COMMON_OCTOBER_2026 from './config/common-scripture/2026-10.json' with { type: 'json' };

const REGISTRIES=Object.freeze({'2026-10':COMMON_OCTOBER_2026});

export function resolveCommonScripture(dateValue=''){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))?String(dateValue):new Date().toISOString().slice(0,10);
  const month=date.slice(0,7),day=Number(date.slice(8,10)),registry=REGISTRIES[month];
  if(!registry||day<1||day>registry.readings.length)return {found:false,date,month};
  return {found:true,date,month,day,passage:registry.readings[day-1],registryId:registry.id,schema:registry.schema,status:registry.status,authority:registry.authority,name:registry.nameKo};
}
export function commonScriptureSnapshot(month='2026-10'){
  const registry=REGISTRIES[month];
  if(!registry)return null;
  return {...registry,readings:registry.readings.map((passage,index)=>({date:`${month}-${String(index+1).padStart(2,'0')}`,day:index+1,passage}))};
}
export function handlePublicCommonScripture(request){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/public/scripture/common')return null;
  const date=url.searchParams.get('date')||'';
  const month=url.searchParams.get('month')||'';
  const data=month?commonScriptureSnapshot(month):resolveCommonScripture(date);
  return new Response(JSON.stringify(data||{found:false,month}),{status:data?200:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300, s-maxage=900','x-ekodi-source-of-truth':'common-scripture-registry'}});
}
