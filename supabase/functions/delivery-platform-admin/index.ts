import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function rpc(name:string,payload:unknown,auth:string){
 const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");if(!base||!key)throw new Error("supabase_runtime_not_configured");
 const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,authorization:auth,"content-type":"application/json"},body:JSON.stringify(payload)});
 const body=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(body?.message||`rpc_${name}_${r.status}`),{status:r.status});return body;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"authentication_required"},401);
 let input:Record<string,unknown>;try{input=await req.json();}catch{return json({error:"invalid_json"},400);}
 try{
  const action=String(input.action||"snapshot"),slug=String(input.slug||"");
  if(action==="snapshot")return json(await rpc("store_delivery_platform_admin_snapshot",{p_slug:slug,p_days:Number(input.days||30)},auth));
  if(action==="commerce-snapshot")return json(await rpc("delivery_commerce_admin_snapshot",{p_slug:slug},auth));
  if(action==="queue-sync")return json(await rpc("delivery_commerce_enqueue",{p_slug:slug,p_provider:String(input.provider||""),p_acquisition_mode:String(input.mode||"browser_session"),p_source_url:input.source_url?String(input.source_url):null,p_priority:Number(input.priority||50)},auth));
  if(action==="save-review-draft")return json(await rpc("store_platform_review_save_draft",{p_slug:slug,p_review_id:String(input.review_id||""),p_draft:String(input.draft||"")},auth));
  if(action==="queue-review-reply")return json(await rpc("store_platform_review_queue_reply",{p_slug:slug,p_review_id:String(input.review_id||""),p_reply:String(input.reply||"")},auth));
  return json({error:"unsupported_action"},400);
 }catch(error){const status=Number((error as {status?:number})?.status||500);return json({error:(error as Error).message||"delivery_platform_admin_failed"},status>=400&&status<600?status:500);}
});
