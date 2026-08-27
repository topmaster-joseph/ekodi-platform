import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS=new Set([
  "https://my.ekodi.kr",
  "https://ekodi-my-staging.topmaster-joseph.workers.dev",
  "https://support.ekodi.kr",
]);
const admin=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});

function cors(req:Request){
  const origin=req.headers.get("Origin")||"";
  return {
    "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"null",
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"GET,PATCH,OPTIONS",
    "Vary":"Origin",
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
async function currentUser(req:Request){
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer "))return null;
  const {data,error}=await admin.auth.getUser(authorization.slice(7));
  if(error||!data.user)return null;
  return data.user;
}
async function personForUser(userId:string){
  const {data,error}=await admin.from("login_identities").select("person_id").eq("auth_user_id",userId).eq("status","active").maybeSingle();
  if(error)throw error;
  return data?.person_id??null;
}
async function profileForPerson(personId:string){
  const [{data:person,error:personError},{data:identities,error:identityError}]=await Promise.all([
    admin.from("people").select("display_name,status,updated_at").eq("id",personId).single(),
    admin.from("login_identities").select("auth_user_id,provider,email,is_primary,status,created_at").eq("person_id",personId).eq("status","active").order("is_primary",{ascending:false}).order("created_at",{ascending:true}),
  ]);
  if(personError)throw personError;
  if(identityError)throw identityError;
  return {
    profile:{display_name:String(person?.display_name||"").trim(),status:person?.status||"active",updated_at:person?.updated_at||null},
    identities:(identities||[]).map(({auth_user_id:_,...identity})=>identity),
  };
}
function displayName(value:unknown){
  const name=String(value??"").trim().replace(/\s+/g," ");
  if(name.length<1||name.length>120)return null;
  return name;
}
async function updateDisplayName(personId:string,name:string){
  const {data:person,error}=await admin.from("people").update({display_name:name}).eq("id",personId).select("display_name,status,updated_at").single();
  if(error)throw error;
  const {data:links,error:linksError}=await admin.from("login_identities").select("auth_user_id").eq("person_id",personId).eq("status","active");
  if(linksError)throw linksError;
  const userIds=(links||[]).map(row=>row.auth_user_id).filter(Boolean);
  if(userIds.length){
    const {error:profileError}=await admin.from("profiles").update({display_name:name}).in("user_id",userIds);
    if(profileError)console.warn("profile legacy display name sync skipped",profileError.message);
  }
  return person;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const origin=req.headers.get("Origin")||"";
  if(!ALLOWED_ORIGINS.has(origin))return json(req,{error:"origin_not_allowed"},403);
  const user=await currentUser(req);
  if(!user)return json(req,{error:"unauthorized"},401);
  const personId=await personForUser(user.id);
  if(!personId)return json(req,{error:"person_not_linked"},404);
  const url=new URL(req.url);
  const path=url.pathname.replace(/^\/profile-api(?:-staging)?/,"")||"/";
  try{
    if(req.method==="GET"&&(path==="/"||path==="/me")){
      const data=await profileForPerson(personId);
      return json(req,{...data,user:{email:user.email??null}});
    }
    if(req.method==="PATCH"&&(path==="/"||path==="/me")){
      const body=await req.json().catch(()=>({}));
      const name=displayName(body?.display_name);
      if(!name)return json(req,{error:"display_name_required",message:"이름은 1자 이상 120자 이하로 입력해 주세요."},400);
      await updateDisplayName(personId,name);
      const data=await profileForPerson(personId);
      return json(req,{ok:true,...data});
    }
    return json(req,{error:"not_found"},404);
  }catch(error){
    console.error("profile-api",error);
    return json(req,{error:"profile_api_failed"},500);
  }
});
