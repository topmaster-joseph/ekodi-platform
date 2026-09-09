import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
const PROVIDERS=new Set(["baemin","coupang_eats","yogiyo","ddangyo","mukkebi","daangn","naver_order"]);

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
function clip(value:unknown,max:number){return String(value??"").trim().slice(0,max)}
function isService(req:Request){
  const auth=req.headers.get("authorization")||"";
  return Boolean(SERVICE_KEY)&&auth===`Bearer ${SERVICE_KEY}`;
}
function https(value:unknown){
  const raw=clip(value,2000); if(!raw)return null;
  try{const u=new URL(raw);return u.protocol==="https:"?u.href:null}catch{return null}
}
async function storeId(slug:string){
  const {data,error}=await db.from("stores").select("id").eq("operating_space_slug",slug).maybeSingle();
  if(error)throw error; return data?.id as string|undefined;
}
function orderRow(store_id:string,provider:string,row:any){
  return {store_id,provider,external_order_ref:clip(row.external_order_ref??row.order_ref,160),
    order_status:clip(row.order_status??row.status??"unknown",30),fulfillment_type:clip(row.fulfillment_type??"unknown",20),
    subtotal:Number(row.subtotal||0),discount:Number(row.discount||0),delivery_fee:Number(row.delivery_fee||0),
    total:Number(row.total||0),item_count:Number(row.item_count||0),ordered_at:row.ordered_at||new Date().toISOString(),
    source_kind:clip(row.source_kind??"partner_import",30),source_url:https(row.source_url),last_synced_at:new Date().toISOString()};
}
function reviewRow(store_id:string,provider:string,row:any){
  return {store_id,provider,external_review_ref:clip(row.external_review_ref??row.review_ref,160),
    rating:row.rating==null?null:Number(row.rating),author_alias:clip(row.author_alias,120),review_text:clip(row.review_text??row.text,5000),
    reviewed_at:row.reviewed_at||new Date().toISOString(),reply_text:row.reply_text?clip(row.reply_text,2000):null,
    reply_status:clip(row.reply_status??"not_replied",30),source_kind:clip(row.source_kind??"partner_import",30),
    source_url:https(row.source_url),last_synced_at:new Date().toISOString()};
}
async function ingest(slug:string,provider:string,body:any){
  const id=await storeId(slug); if(!id)return json({error:"store_not_found"},404);
  const now=new Date().toISOString();
  const channel={store_id:id,provider,display_name:clip(body.display_name||provider,80),platform_store_name:clip(body.platform_store_name,120)||null,
    connection_status:"active",source_kind:clip(body.source_kind||"partner_import",30),sync_mode:clip(body.sync_mode||"partner_api",30),
    public_order_url:https(body.public_order_url),source_url:https(body.source_url),verified_at:now,last_success_at:now,last_synced_at:now,last_error:null,
    capabilities:body.capabilities&&typeof body.capabilities==="object"?body.capabilities:{store:true,menu:true,orders:true,sales:true,reviews:true,replies:true}};
  const ch=await db.from("store_channel_profiles").upsert(channel,{onConflict:"store_id,provider"}); if(ch.error)throw ch.error;
  const orders=(Array.isArray(body.orders)?body.orders:[]).map((x:any)=>orderRow(id,provider,x)).filter((x:any)=>x.external_order_ref);
  const reviews=(Array.isArray(body.reviews)?body.reviews:[]).map((x:any)=>reviewRow(id,provider,x)).filter((x:any)=>x.external_review_ref);
  if(orders.length){const r=await db.from("store_delivery_orders").upsert(orders,{onConflict:"store_id,provider,external_order_ref"});if(r.error)throw r.error;}
  if(reviews.length){const r=await db.from("store_delivery_reviews").upsert(reviews,{onConflict:"store_id,provider,external_review_ref"});if(r.error)throw r.error;}
  return json({ok:true,provider,orders:orders.length,reviews:reviews.length,synced_at:now});
}
async function pendingActions(slug:string,provider:string){
  const id=await storeId(slug); if(!id)return json({error:"store_not_found"},404);
  const {data,error}=await db.from("store_delivery_actions").select("id,target_type,target_ref,action_type,payload,created_at")
    .eq("store_id",id).eq("provider",provider).eq("status","queued").order("created_at",{ascending:true}).limit(100);
  if(error)throw error; return json({ok:true,actions:data||[]});
}
async function acknowledge(body:any){
  const actionId=clip(body.action_id,80); const status=clip(body.status,20);
  if(!actionId||!["succeeded","failed"].includes(status))return json({error:"invalid_ack"},400);
  const {data:action,error:findError}=await db.from("store_delivery_actions").select("id,store_id,provider,target_type,target_ref,action_type").eq("id",actionId).maybeSingle();
  if(findError)throw findError; if(!action)return json({error:"action_not_found"},404);
  const patch={status,error_message:status==="failed"?clip(body.error_message,1000):null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const {error}=await db.from("store_delivery_actions").update(patch).eq("id",actionId); if(error)throw error;
  if(action.target_type==="review"&&action.action_type==="reply_review"){
    await db.from("store_delivery_reviews").update({reply_status:status==="succeeded"?"sent":"failed",replied_at:status==="succeeded"?new Date().toISOString():null,updated_at:new Date().toISOString()})
      .eq("store_id",action.store_id).eq("provider",action.provider).eq("external_review_ref",action.target_ref);
  }
  return json({ok:true,action_id:actionId,status});
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!isService(req))return json({error:"service_role_required"},403);
  try{
    const body=await req.json().catch(()=>({})); const mode=clip(body.mode||"ingest",30);
    if(mode==="ack")return await acknowledge(body);
    const slug=clip(body.slug,80).toLowerCase(); const provider=clip(body.provider,40).toLowerCase();
    if(!slug||!PROVIDERS.has(provider))return json({error:"invalid_store_or_provider"},400);
    if(mode==="actions")return await pendingActions(slug,provider);
    if(mode==="ingest")return await ingest(slug,provider,body);
    return json({error:"unsupported_mode"},400);
  }catch(error){console.error(error);return json({error:"sync_failed"},500)}
});
