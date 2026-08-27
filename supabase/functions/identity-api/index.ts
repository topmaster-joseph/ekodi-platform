import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID="483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5.apps.googleusercontent.com";
const GOOGLE_ISSUERS=new Set(["accounts.google.com","https://accounts.google.com"]);
const JWKS_URL="https://www.googleapis.com/oauth2/v3/certs";
const AUTH_ORIGIN="https://auth.ekodi.kr";
const CHALLENGE_MINUTES=10;
const admin=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
const encoder=new TextEncoder();
let jwksCache:{keys:any[],expiresAt:number}={keys:[],expiresAt:0};

const cors=(req:Request)=>{
  const origin=req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":origin===AUTH_ORIGIN?AUTH_ORIGIN:"null",
    "Access-Control-Allow-Headers":"content-type, apikey, x-client-info, authorization",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin"
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
async function sha256(value:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))))}
function b64bytes(value:string){const normalized=value.replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function b64json(value:string){return JSON.parse(new TextDecoder().decode(b64bytes(value)));}

async function getGoogleKeys(){
  if(jwksCache.expiresAt>Date.now()&&jwksCache.keys.length)return jwksCache.keys;
  const r=await fetch(JWKS_URL,{headers:{accept:"application/json"}});
  if(!r.ok)throw new Error("google_keys_unavailable");
  const d=await r.json();
  const maxAge=Number((r.headers.get("cache-control")||"").match(/max-age=(\d+)/)?.[1]||300);
  jwksCache={keys:Array.isArray(d.keys)?d.keys:[],expiresAt:Date.now()+Math.max(60,maxAge)*1000};
  return jwksCache.keys;
}
async function verifySignature(jwk:any,h:string,p:string,s:string,payload:any,nonce:string){
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const ok=await crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,b64bytes(s),encoder.encode(`${h}.${p}`));
  if(!ok)throw new Error("google_signature_invalid");
  const now=Math.floor(Date.now()/1000);
  const aud=Array.isArray(payload.aud)?payload.aud.includes(GOOGLE_CLIENT_ID):payload.aud===GOOGLE_CLIENT_ID;
  if(!aud)throw new Error("google_audience_invalid");
  if(!GOOGLE_ISSUERS.has(payload.iss))throw new Error("google_issuer_invalid");
  if(!Number.isFinite(Number(payload.exp))||Number(payload.exp)<=now)throw new Error("google_token_expired");
  if(Number(payload.iat||now)>now+300)throw new Error("google_token_time_invalid");
  if(!payload.sub||!payload.email||payload.email_verified!==true)throw new Error("verified_google_email_required");
  if(payload.nonce!==nonce)throw new Error("google_nonce_invalid");
  return payload;
}
async function verifyGoogle(token:string,nonce:string){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new Error("google_token_invalid");
  const [h,p,s]=parts,header=b64json(h),payload=b64json(p);
  if(header.alg!=="RS256"||!header.kid)throw new Error("google_header_invalid");
  let keys=await getGoogleKeys();
  let jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==="RSA");
  if(!jwk){jwksCache.expiresAt=0;keys=await getGoogleKeys();jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==="RSA");}
  if(!jwk)throw new Error("google_key_not_found");
  return verifySignature(jwk,h,p,s,payload,nonce);
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

async function issueChallenge(req:Request,purpose:"login"|"link_google",initiatorUserId:string|null=null){
  const nonce=hex(crypto.getRandomValues(new Uint8Array(24)));
  const nonceHash=await sha256(nonce);
  const now=new Date(),expires=new Date(now.getTime()+CHALLENGE_MINUTES*60*1000);
  await admin.from("identity_challenges").delete().lte("expires_at",now.toISOString());
  const {error}=await admin.from("identity_challenges").insert({nonce_hash:nonceHash,expires_at:expires.toISOString(),purpose,initiator_user_id:initiatorUserId});
  if(error)throw error;
  return json(req,{nonce,clientId:GOOGLE_CLIENT_ID,expiresAt:expires.toISOString(),purpose},201);
}

async function consumeChallenge(nonce:string,purpose:"login"|"link_google",initiatorUserId:string|null=null){
  if(!/^[a-f0-9]{48}$/i.test(nonce))return false;
  const hash=await sha256(nonce),now=new Date().toISOString();
  let query=admin.from("identity_challenges").select("nonce_hash,initiator_user_id,purpose").eq("nonce_hash",hash).eq("purpose",purpose).gt("expires_at",now);
  query=initiatorUserId?query.eq("initiator_user_id",initiatorUserId):query.is("initiator_user_id",null);
  const {data}=await query.maybeSingle();
  if(!data)return false;
  await admin.from("identity_challenges").delete().eq("nonce_hash",hash);
  return true;
}

async function issueSupabaseLink(email:string){
  const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email});
  if(error||!data?.properties?.hashed_token||!data.user?.id){
    console.error("generateLink",error?.message||"missing_link_properties");
    throw new Error("identity_session_issue_failed");
  }
  return {user:data.user,tokenHash:data.properties.hashed_token};
}

async function syncPerson(userId:string){
  const {error}=await admin.rpc("sync_person_access",{p_auth_user_id:userId});
  if(error)throw error;
}

async function platformAdminForUser(userId:string){
  const {data,error}=await admin.from("profiles").select("platform_admin").eq("user_id",userId).maybeSingle();
  if(error){console.error("platform admin lookup",error.message);return false;}
  return data?.platform_admin===true;
}

async function exchange(req:Request){
  const body=await req.json().catch(()=>({}));
  const nonce=String(body?.nonce||"").trim();
  const credential=String(body?.credential||"").trim();
  if(!nonce||!credential)return json(req,{error:"credential_and_nonce_required"},400);
  if(!(await consumeChallenge(nonce,"login",null)))return json(req,{error:"challenge_expired_or_used"},400);
  const profile=await verifyGoogle(credential,nonce);
  const email=String(profile.email).trim().toLowerCase();
  const link=await issueSupabaseLink(email);
  const {error:personError}=await admin.rpc("ensure_person_identity",{
    p_auth_user_id:link.user.id,
    p_provider:"google",
    p_provider_subject:String(profile.sub),
    p_email:email,
    p_display_name:String(profile.name||"").slice(0,120)||null
  });
  if(personError){
    console.error("ensure_person_identity",personError.message);
    const conflict=/already_linked|subject_conflict/i.test(personError.message||"");
    return json(req,{error:conflict?"identity_conflict":"person_identity_failed"},conflict?409:500);
  }
  await syncPerson(link.user.id);
  const {error:legacyError}=await admin.rpc("apply_preregistered_access",{p_user_id:link.user.id});
  if(legacyError)console.error("apply_preregistered_access",legacyError.message);
  const platformAdmin=await platformAdminForUser(link.user.id);
  return json(req,{ok:true,tokenHash:link.tokenHash,type:"email",platformAdmin,user:{email,name:String(profile.name||"").slice(0,120)}},200);
}

async function sessionHandoff(req:Request,user:any){
  const email=String(user?.email||"").trim().toLowerCase();
  if(!email)return json(req,{error:"verified_email_required"},400);
  const link=await issueSupabaseLink(email);
  if(link.user.id!==user.id){
    console.error("session handoff user mismatch",{source:user.id,target:link.user.id});
    return json(req,{error:"session_identity_mismatch"},409);
  }
  const platformAdmin=await platformAdminForUser(user.id);
  return json(req,{ok:true,tokenHash:link.tokenHash,type:"email",platformAdmin,user:{id:user.id,email}},200);
}

async function listIdentities(req:Request,userId:string){
  const personId=await personForUser(userId);
  if(!personId)return json(req,{person:null,identities:[],reloginRequired:true},200);
  const {data,error}=await admin.from("login_identities")
    .select("id,provider,email,is_primary,status,linked_at,last_seen_at")
    .eq("person_id",personId)
    .eq("status","active")
    .order("is_primary",{ascending:false})
    .order("linked_at",{ascending:true});
  if(error)throw error;
  return json(req,{person:{id:personId},identities:data??[],reloginRequired:false},200);
}

async function beginLink(req:Request,userId:string){
  if(!(await personForUser(userId)))return json(req,{error:"relogin_required"},409);
  return issueChallenge(req,"link_google",userId);
}

async function finishLink(req:Request,userId:string){
  const body=await req.json().catch(()=>({}));
  const nonce=String(body?.nonce||"").trim();
  const credential=String(body?.credential||"").trim();
  if(!nonce||!credential)return json(req,{error:"credential_and_nonce_required"},400);
  if(!(await consumeChallenge(nonce,"link_google",userId)))return json(req,{error:"challenge_expired_or_used"},400);

  const profile=await verifyGoogle(credential,nonce);
  const email=String(profile.email).trim().toLowerCase();
  const target=await issueSupabaseLink(email);
  const {error:linkError}=await admin.rpc("link_person_identity",{
    p_initiator_user_id:userId,
    p_target_user_id:target.user.id,
    p_provider:"google",
    p_provider_subject:String(profile.sub),
    p_email:email,
    p_display_name:String(profile.name||"").slice(0,120)||null
  });
  if(linkError){
    console.error("link_person_identity",linkError.message);
    const conflict=/already_linked|target_account|identity_already/i.test(linkError.message||"");
    return json(req,{error:conflict?"identity_already_linked":"identity_link_failed"},conflict?409:500);
  }

  await syncPerson(userId);
  if(target.user.id!==userId)await syncPerson(target.user.id);

  const personId=await personForUser(userId);
  const {data}=await admin.from("login_identities")
    .select("id,provider,email,is_primary,status,linked_at,last_seen_at")
    .eq("person_id",personId)
    .eq("status","active")
    .order("is_primary",{ascending:false})
    .order("linked_at",{ascending:true});
  return json(req,{ok:true,linked:{email,provider:"google"},identities:data??[]},200);
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.headers.get("Origin")!==AUTH_ORIGIN)return json(req,{error:"origin_not_allowed"},403);
  const path=new URL(req.url).pathname.replace(/^\/identity-api/,"")||"/";
  try{
    if(req.method==="POST"&&path==="/challenge")return await issueChallenge(req,"login",null);
    if(req.method==="POST"&&path==="/google/exchange")return await exchange(req);

    const user=await currentUser(req);
    if(!user)return json(req,{error:"unauthorized"},401);

    if(req.method==="POST"&&path==="/session/handoff")return await sessionHandoff(req,user);
    if(req.method==="GET"&&path==="/identities")return await listIdentities(req,user.id);
    if(req.method==="POST"&&path==="/google/link/challenge")return await beginLink(req,user.id);
    if(req.method==="POST"&&path==="/google/link/exchange")return await finishLink(req,user.id);
    return json(req,{error:"not_found"},404);
  }catch(e){
    console.error("identity-api",e);
    return json(req,{error:"identity_api_failed"},500);
  }
});