const PREFIX='/api/public/church/worship';
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
function kstDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function json(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=45','x-ekodi-source-of-truth':'church_worship_materials','x-content-type-options':'nosniff'}});}
export async function handlePublicChurchWorship(request,env={},dependencies={}){
  const url=new URL(request.url);
  if(url.pathname.replace(/\/+$/,'')!==PREFIX)return null;
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
  const requested=String(url.searchParams.get('from')||kstDate());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||Number.isNaN(Date.parse(requested+'T00:00:00+09:00')))return json({ok:false,code:'INVALID_DATE'},400);
  const from=requested>=kstDate()?requested:kstDate();
  const params=new URLSearchParams({select:'service_type,service_date,service_name,service_time,scripture,title,preacher',is_published:'eq.true',service_date:'gte.'+from,order:'service_date.asc',limit:'3'});
  const origin=String(env.SUPABASE_URL||SUPABASE).replace(/\/+$/,'');
  const key=String(env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||PUBLIC_KEY);
  try{
    const res=await (dependencies.fetch||fetch)(origin+'/rest/v1/church_worship_materials?'+params,{headers:{apikey:key,accept:'application/json'},redirect:'error'});
    if(!res.ok)return json({ok:false,code:'WORSHIP_SOURCE_UNAVAILABLE'},502);
    const data=await res.json();
    if(!Array.isArray(data))return json({ok:false,code:'WORSHIP_SOURCE_INVALID'},502);
    const items=data.filter(x=>x&&['saturday','sunday'].includes(x.service_type)&&/^\d{4}-\d{2}-\d{2}$/.test(x.service_date)&&x.service_date>=from).slice(0,3).map(x=>({
      service_type:x.service_type,service_date:x.service_date,service_name:String(x.service_name||'').slice(0,120),
      service_time:String(x.service_time||'').slice(0,12),scripture:String(x.scripture||'').slice(0,150),
      title:String(x.title||'').slice(0,180),preacher:String(x.preacher||'').slice(0,120)
    }));
    return json({ok:true,source:'EKODI published Church worship materials',from,items});
  }catch{return json({ok:false,code:'WORSHIP_SOURCE_UNAVAILABLE'},502);}
}
