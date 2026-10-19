import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.0";
const endpoint=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const table="motor_festival_2026_applications";
const allowedOrigins=new Set(["https://ekodi.kr","https://www.ekodi.kr"]);
const out=(body:unknown,status=200,origin?:string)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...(origin&&allowedOrigins.has(origin)?{"access-control-allow-origin":origin,"vary":"Origin"}:{})}});
const choices=(value:unknown,valid:string[])=>Array.isArray(value)&&value.length<=10&&value.every(v=>typeof v==="string"&&valid.includes(v));
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://ekodi.kr","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"}});
 if(origin&&!allowedOrigins.has(origin))return out({error:"invalid_origin"},403);
 if(!endpoint||!service||!anon)return out({error:"configuration_unavailable"},503,origin);
 const admin=createClient(endpoint,service,{auth:{persistSession:false}});
 if(request.method==="GET"){
  const auth=request.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return out({error:"unauthorized"},401,origin);
  const client=createClient(endpoint,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.email)return out({error:"unauthorized"},401,origin);
  const allowed=(Deno.env.get("MOTOR_FESTIVAL_ADMIN_EMAILS")||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!allowed.includes(user.email.toLowerCase()))return out({error:"forbidden"},403,origin);
  const {data,error:readError}=await admin.from(table).select("*").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1000);
  if(readError)return out({error:"read_failed"},503,origin);
  const applications=data||[];
  return out({summary:{total:applications.length,regular:applications.filter(a=>a.membership==="regular").length,join:applications.filter(a=>a.membership==="join").length,participating:applications.filter(a=>a.intent==="yes").length},applications},200,origin);
 }
 if(request.method!=="POST")return out({error:"method_not_allowed"},405,origin);
 // Public intake is deliberately disabled until a server-side rate limiter is connected.
 if(Deno.env.get("MOTOR_FESTIVAL_RATE_LIMIT_READY")!=="true")return out({error:"rate_limit_unavailable"},503,origin);
 return out({error:"rate_limit_integration_pending"},503,origin);
});
