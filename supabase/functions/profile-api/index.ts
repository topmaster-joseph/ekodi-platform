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
    "Access-Control-Allow-Methods":"GET,PATCH,DELETE,OPTIONS",
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
function characterPreference(user:any){
  const raw=user?.user_metadata?.ekodi_character_identity;
  const profile=raw?.identity_profile==='personal'&&raw?.subject_authorized===true?'personal':'canonical';
  return {version:1,identity_profile:profile,subject_authorized:profile==='personal',portrait_mode:profile==='personal'?'local_device':'none',updated_at:raw?.updated_at||null};
}
async function identityUserIds(personId:string){
  const {data,error}=await admin.from("login_identities").select("auth_user_id").eq("person_id",personId).eq("status","active");
  if(error)throw error;
  return (data||[]).map(row=>String(row.auth_user_id||"")).filter(Boolean);
}
async function saveCharacterPreference(personId:string,preference:any|null){
  const ids=await identityUserIds(personId);
  await Promise.all(ids.map(async id=>{
    const {data,error}=await admin.auth.admin.getUserById(id);
    if(error||!data.user)throw error||new Error("identity_user_missing");
    const metadata={...(data.user.user_metadata||{})};
    if(preference)metadata.ekodi_character_identity=preference;else delete metadata.ekodi_character_identity;
    const {error:updateError}=await admin.auth.admin.updateUserById(id,{user_metadata:metadata});
    if(updateError)throw updateError;
  }));
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
      return json(req,{...data,user:{email:user.email??null},character:characterPreference(user)});
    }
    if(req.method==="GET"&&path==="/character")return json(req,{character:characterPreference(user)});
    if(req.method==="PATCH"&&path==="/character"){
      const body=await req.json().catch(()=>({}));
      if(!body||typeof body!=="object")return json(req,{error:"character_payload_invalid"},400);
      if('portrait_url' in body||'portrait' in body||'face_embedding' in body||'biometric' in body)return json(req,{error:"character_biometric_payload_forbidden"},400);
      const identityProfile=String(body?.identity_profile||"").trim().toLowerCase();
      if(!['canonical','personal'].includes(identityProfile))return json(req,{error:"character_identity_invalid"},400);
      if(identityProfile==='personal'&&body?.subject_authorized!==true)return json(req,{error:"character_subject_authorization_required"},400);
      const preference={version:1,identity_profile:identityProfile,subject_authorized:identityProfile==='personal',portrait_mode:identityProfile==='personal'?'local_device':'none',updated_at:new Date().toISOString()};
      await saveCharacterPreference(personId,preference);
      return json(req,{ok:true,character:preference});
    }
    if(req.method==="DELETE"&&path==="/character"){
      await saveCharacterPreference(personId,null);
      return json(req,{ok:true,character:{version:1,identity_profile:'canonical',subject_authorized:false,portrait_mode:'none',updated_at:new Date().toISOString()}});
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
