import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_HOSTS=new Set([
  "www.pizzamaru.co.kr","pizzamaru.co.kr","www.daangn.com","daangn.com",
  "map.naver.com","m.place.naver.com","naver.me","www.baemin.com","baemin.com",
  "www.yogiyo.co.kr","yogiyo.co.kr","www.ddangyo.com","ddangyo.com",
  "www.mukkebi.com","mukkebi.com","www.coupangeats.com","coupangeats.com"
]);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const strip=(v:string)=>v.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const titleOf=(html:string)=>strip((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||"").slice(0,300));

function structuredSignals(html:string){
  const signals:Record<string,unknown>[]=[];
  const blocks=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0,12);
  const walk=(value:unknown)=>{
    if(!value||typeof value!=="object")return;
    if(Array.isArray(value)){value.forEach(walk);return;}
    const obj=value as Record<string,unknown>;
    const type=String(obj["@type"]||"");
    if(/(Restaurant|FoodEstablishment|Menu|MenuItem|Product|Offer)/i.test(type)){
      const out:Record<string,unknown>={type};
      for(const key of ["name","description","price","priceCurrency","url","image","telephone","address","availability"]){if(obj[key]!=null)out[key]=obj[key];}
      signals.push(out);
    }
    for(const child of Object.values(obj))walk(child);
  };
  for(const block of blocks){try{walk(JSON.parse(block[1]));}catch{/* ignore malformed public JSON-LD */}if(signals.length>=80)break;}
  return signals.slice(0,80);
}

async function rpc(name:string,payload:unknown,auth:string){
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!base||!key)throw new Error("supabase_runtime_not_configured");
  const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers:{"content-type":"application/json","apikey":key,"authorization":auth},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(body?.message||`rpc_${name}_${response.status}`),{status:response.status});
  return body;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return json({error:"authentication_required"},401);
  let input:Record<string,unknown>;
  try{input=await req.json();}catch{return json({error:"invalid_json"},400);}
  try{
    const action=String(input.action||"scan");
    if(action==="snapshot")return json(await rpc("delivery_commerce_admin_snapshot",{p_slug:String(input.slug||"")},auth));
    if(action==="queue")return json(await rpc("delivery_commerce_enqueue",{
      p_slug:String(input.slug||""),p_provider:String(input.provider||""),p_acquisition_mode:String(input.mode||"public_web"),p_source_url:input.source_url?String(input.source_url):null,p_priority:Number(input.priority||50)
    },auth));
    let jobId=input.job_id?String(input.job_id):"";
    if(!jobId){const queued=await rpc("delivery_commerce_enqueue",{p_slug:String(input.slug||""),p_provider:String(input.provider||""),p_acquisition_mode:String(input.mode||"public_web"),p_source_url:input.source_url?String(input.source_url):null,p_priority:Number(input.priority||50)},auth);jobId=String(queued?.job_id||"");}
    const job=await rpc("delivery_commerce_claim_job",{p_job_id:jobId},auth);
    const mode=String(job?.mode||"");
    if(mode==="browser_session")return json(await rpc("delivery_commerce_complete_scan",{p_job_id:jobId,p_status:"needs_browser",p_metadata:{reason:"authorized_browser_session_required",provider:job?.provider}},auth));
    if(mode==="merchant_portal")return json(await rpc("delivery_commerce_complete_scan",{p_job_id:jobId,p_status:"needs_merchant_auth",p_metadata:{reason:"merchant_authorization_required",provider:job?.provider}},auth));
    if(mode!=="public_web")return json({error:"mode_requires_dedicated_connector",mode},409);
    const sourceUrl=String(job?.source_url||"");
    if(!sourceUrl)return json({error:"source_url_required"},400);
    const url=new URL(sourceUrl);
    if(url.protocol!=="https:"||!ALLOWED_HOSTS.has(url.hostname.toLowerCase()))return json({error:"source_host_not_allowlisted",host:url.hostname},400);
    const page=await fetch(url.href,{headers:{"user-agent":"EKODI-Delivery-Commerce-Intelligence/1.0 (+https://ekodi.kr)",accept:"text/html,application/xhtml+xml"},redirect:"follow"});
    if(page.status===401||page.status===403)return json(await rpc("delivery_commerce_complete_scan",{p_job_id:jobId,p_status:"needs_browser",p_metadata:{source_url:url.href,http_status:page.status,reason:"public_fetch_restricted"}},auth));
    if(!page.ok)return json(await rpc("delivery_commerce_complete_scan",{p_job_id:jobId,p_status:"failed",p_metadata:{source_url:url.href,http_status:page.status},p_error_code:"public_fetch_failed",p_error_message:`HTTP ${page.status}`},auth),502);
    const html=(await page.text()).slice(0,2_000_000),signals=structuredSignals(html);
    const trusted=String(job?.verification_policy||"")==="trusted_official";
    const metadata={source_url:page.url||url.href,provider:job?.provider,title:titleOf(html),structured_signals:signals,signal_count:signals.length,confidence:trusted?0.95:(signals.length?0.78:0.62),verified:trusted,acquired_via:"public_web",fetched_at:new Date().toISOString()};
    const result=await rpc("delivery_commerce_complete_scan",{p_job_id:jobId,p_status:"complete",p_metadata:metadata},auth);
    return json({...result,metadata});
  }catch(error){const status=Number((error as {status?:number})?.status||500);return json({error:(error as Error).message||"delivery_commerce_sync_failed"},status>=400&&status<600?status:500);}
});
