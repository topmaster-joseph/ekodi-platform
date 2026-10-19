import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const origins=new Set(["https://ekodi.kr","https://www.ekodi.kr"]);
const table="motor_festival_2026_applications";
const json=(body:unknown,status=200,origin="")=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...(origins.has(origin)?{"access-control-allow-origin":origin,"vary":"Origin"}:{})}});
const str=(x:unknown,max:number)=>typeof x==="string"&&x.trim().length>0&&x.trim().length<=max;
const optional=(x:unknown,max:number)=>x===undefined||x===""||(typeof x==="string"&&x.length<=max);
const pick=(x:unknown,values:string[])=>typeof x==="string"&&values.includes(x);
const arr=(x:unknown,values:string[])=>x===undefined||(Array.isArray(x)&&x.length<=10&&x.every(v=>pick(v,values)));
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origins.has(origin)?origin:"https://ekodi.kr","access-control-allow-methods":"POST,GET,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"}});
 if(origin&&!origins.has(origin))return json({error:"invalid_origin"},403);
 if(!url||!secret||!anon)return json({error:"configuration_unavailable"},503,origin);
 const db=createClient(url,secret,{auth:{persistSession:false}});
 if(req.method==="GET"){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return json({error:"unauthorized"},401,origin);
  const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error}=await userDb.auth.getUser();
  if(error||!user?.email)return json({error:"unauthorized"},401,origin);
  const allowed=(Deno.env.get("MOTOR_FESTIVAL_ADMIN_EMAILS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowed.includes(user.email.toLowerCase()))return json({error:"forbidden"},403,origin);
  const {data,error:readError}=await db.from(table).select("*").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1000);
  if(readError)return json({error:"read_failed"},503,origin);
  const applications=data||[];
  return json({summary:{total:applications.length,regular:applications.filter(a=>a.membership==="regular").length,join:applications.filter(a=>a.membership==="join").length,participating:applications.filter(a=>a.intent==="yes").length},applications},200,origin);
 }
 if(req.method!=="POST")return json({error:"method_not_allowed"},405,origin);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"invalid_content_type"},415,origin);
 if(Number(req.headers.get("content-length")||0)>8192)return json({error:"too_large"},413,origin);
 const raw=await req.text();if(raw.length>8192)return json({error:"too_large"},413,origin);
 let a:Record<string,unknown>;try{a=JSON.parse(raw)}catch{return json({error:"invalid_json"},400,origin)}
 if(!a||!str(a.business_name,100)||!str(a.contact_name,60)||!str(a.phone,20)||!/^[-+() 0-9]{9,20}$/.test(a.phone as string)||!str(a.category,100)||!pick(a.membership,["regular","join","info","none"])||!pick(a.intent,["yes","maybe","no"])||!arr(a.activity,["판매","음식·음료","체험","홍보","시식·시연"])||!arr(a.support,["테이블","의자","전기","급수","홍보공간"])||!optional(a.items,300)||!optional(a.notes,1000)||!pick(a.hours,["all","am","pm","discuss"])||!pick(a.staff,["1","2","3+"])||a.consent!=="on")return json({error:"invalid_application"},400,origin);
 if(Date.now()>Date.parse("2026-10-25T08:00:00+09:00"))return json({error:"registration_closed"},410,origin);
 const phone=(a.phone as string).replace(/\D/g,"");
 const key=await hash("motor-festival-2026:"+phone);
 const {data:ok,error:limitError}=await db.rpc("motor_festival_2026_take_slot",{p_fingerprint:key});
 if(limitError)return json({error:"rate_limit_unavailable"},503,origin);
 if(!ok)return json({error:"too_many_requests"},429,origin);
 const record={business_name:(a.business_name as string).trim(),contact_name:(a.contact_name as string).trim(),phone:(a.phone as string).trim(),category:a.category,membership:a.membership,intent:a.intent,activity:a.activity||[],items:a.items||"",hours:a.hours,support:a.support||[],staff:a.staff,notes:a.notes||""};
 const {data,error}=await db.from(table).insert(record).select("id").single();
 if(error||!data?.id)return json({error:"storage_failure"},503,origin);
 return json({receipt_id:data.id},201,origin);
});