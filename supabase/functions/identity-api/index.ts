import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authorizeUrl, federatedAuthEmail, verifyKakaoCode, verifyNaverCode, type VerifiedIdentity } from "./federated-providers.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_IDS={
  development:"483044030492-qvk96u0rvptsshat0pi8g522puq9ju16.apps.googleusercontent.com",
  staging:"483044030492-j9dml7tsb7vq4a4ud041ttctavlgdskg.apps.googleusercontent.com",
  production:"483044030492-ej1ie2boa4e01lglm75e9q1r6m25pkp2.apps.googleusercontent.com",
} as const;
const IDENTITY_ENV=String(Deno.env.get("EKODI_ENVIRONMENT")||Deno.env.get("ENVIRONMENT")||"production").trim().toLowerCase();
const GOOGLE_CLIENT_ID=String(Deno.env.get("GOOGLE_CLIENT_ID")||GOOGLE_CLIENT_IDS[IDENTITY_ENV as keyof typeof GOOGLE_CLIENT_IDS]||"").trim();
if(!Object.values(GOOGLE_CLIENT_IDS).includes(GOOGLE_CLIENT_ID as any))throw new Error("google_client_id_not_allowed_for_ekodi_environment");
const GOOGLE_ISSUERS=new Set(["accounts.google.com","https://accounts.google.com"]);
const GOOGLE_JWKS_URL="https://www.googleapis.com/oauth2/v3/certs";
const AUTH_ORIGINS=new Set(["https://ekodi.kr"]);
const CHALLENGE_MINUTES=10;
const admin=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
const encoder=new TextEncoder();
let googleJwksCache:{keys:any[],expiresAt:number}={keys:[],expiresAt:0};

type ProviderAdapter={
  id:string;
  clientId?:string;
  redirect?:boolean;
  authorizeUrl?:(nonce:string)=>string;
  verify:(credential:string,nonce:string)=>Promise<VerifiedIdentity>;
};

const cors=(req:Request)=>{
  const origin=req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":origin&&AUTH_ORIGINS.has(origin)?origin:"null",
    "Access-Control-Allow-Headers":"content-type, apikey, x-client-info, authorization",
    "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
    "Vary":"Origin"
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
async function sha256(value:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))))}
function b64bytes(value:string){const normalized=value.replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function b64json(value:string){return JSON.parse(new TextDecoder().decode(b64bytes(value)));}

async function getGoogleKeys(){
  if(googleJwksCache.expiresAt>Date.now()&&googleJwksCache.keys.length)return googleJwksCache.keys;
  const r=await fetch(GOOGLE_JWKS_URL,{headers:{accept:"application/json"}});
  if(!r.ok)throw new Error("google_keys_unavailable");
  const d=await r.json();
  const maxAge=Number((r.headers.get("cache-control")||"").match(/max-age=(\d+)/)?.[1]||300);
  googleJwksCache={keys:Array.isArray(d.keys)?d.keys:[],expiresAt:Date.now()+Math.max(60,maxAge)*1000};
  return googleJwksCache.keys;
}
async function verifyGoogleSignature(jwk:any,h:string,p:string,s:string,payload:any,nonce:string){
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
async function verifyGoogle(token:string,nonce:string):Promise<VerifiedIdentity>{
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new Error("google_token_invalid");
  const [h,p,s]=parts,header=b64json(h),payload=b64json(p);
  if(header.alg!=="RS256"||!header.kid)throw new Error("google_header_invalid");
  let keys=await getGoogleKeys();
  let jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==="RSA");
  if(!jwk){googleJwksCache.expiresAt=0;keys=await getGoogleKeys();jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==="RSA");}
  if(!jwk)throw new Error("google_key_not_found");
  const verified=await verifyGoogleSignature(jwk,h,p,s,payload,nonce);
  return {
    subject:String(verified.sub),
    email:String(verified.email).trim().toLowerCase(),
    emailVerified:verified.email_verified===true,
    displayName:String(verified.name||"").slice(0,120)||null
  };
}

// ── Redirect (authorization-code) providers: Naver, Kakao ──────────────────
// Dormant by default. A provider can sign anyone in only when BOTH gates open:
//   1) its secrets are present in this function's environment (adapter is registered), and
//   2) public.identity_providers.enabled = true for it (operator switch).
// Every provider resolves to the same EKODI account model (people + login_identities);
// login_identities.provider records which path a person authenticated through.
const FEDERATED_REDIRECT_URI=String(Deno.env.get("EKODI_FEDERATED_REDIRECT_URI")||"https://ekodi.kr/auth/").trim();
const envValue=(name:string)=>String(Deno.env.get(name)||"").trim();

const adapters=new Map<string,ProviderAdapter>([
  ["google",{id:"google",clientId:GOOGLE_CLIENT_ID,verify:verifyGoogle}]
]);
{
  const naverId=envValue("NAVER_CLIENT_ID"),naverSecret=envValue("NAVER_CLIENT_SECRET");
  if(naverId&&naverSecret)adapters.set("naver",{
    id:"naver",clientId:naverId,redirect:true,
    authorizeUrl:(nonce)=>authorizeUrl("https://nid.naver.com/oauth2.0/authorize",{response_type:"code",client_id:naverId,redirect_uri:FEDERATED_REDIRECT_URI,state:nonce}),
    verify:(code,nonce)=>verifyNaverCode(code,nonce,{clientId:naverId,clientSecret:naverSecret})
  });
  const kakaoId=envValue("KAKAO_REST_API_KEY"),kakaoSecret=envValue("KAKAO_CLIENT_SECRET");
  if(kakaoId)adapters.set("kakao",{
    id:"kakao",clientId:kakaoId,redirect:true,
    authorizeUrl:(nonce)=>authorizeUrl("https://kauth.kakao.com/oauth/authorize",{response_type:"code",client_id:kakaoId,redirect_uri:FEDERATED_REDIRECT_URI,state:nonce}),
    verify:(code,nonce)=>verifyKakaoCode(code,nonce,{clientId:kakaoId,clientSecret:kakaoSecret,redirectUri:FEDERATED_REDIRECT_URI})
  });
}

async function authEmailFor(provider:string,profile:VerifiedIdentity){
  return adapters.get(provider)?.redirect?await federatedAuthEmail(provider,profile.subject):profile.email;
}
async function contactEmailFor(provider:string,profile:VerifiedIdentity){
  return profile.email||await federatedAuthEmail(provider,profile.subject);
}

async function enabledProvider(provider:string){
  const normalized=String(provider||"").trim().toLowerCase();
  const adapter=adapters.get(normalized);
  if(!adapter)return null;
  const {data,error}=await admin.from("identity_providers")
    .select("provider,display_name,strategy,enabled,supports_login,supports_link,requires_verified_email,sort_order")
    .eq("provider",normalized)
    .eq("enabled",true)
    .maybeSingle();
  if(error)throw error;
  return data?{...data,adapter}:null;
}

async function listProviders(req:Request){
  const {data,error}=await admin.from("identity_providers")
    .select("provider,display_name,strategy,supports_login,supports_link,requires_verified_email,sort_order")
    .eq("enabled",true)
    .order("sort_order",{ascending:true});
  if(error)throw error;
  const providers=(data??[]).filter((row:any)=>adapters.has(row.provider)).map((row:any)=>({
    id:row.provider,
    name:row.display_name,
    redirect:adapters.get(row.provider)?.redirect===true,
    strategy:row.strategy,
    supportsLogin:row.supports_login,
    supportsLink:row.supports_link,
    requiresVerifiedEmail:row.requires_verified_email
  }));
  return json(req,{providers},200);
}

// Operator readiness: which login paths have their keys installed and which are switched on.
// Booleans only — never key material. Lets the release lane and admins confirm that keys
// synced from repository secrets actually reached this function before a path is enabled.
async function providerReadiness(req:Request){
  const {data,error}=await admin.from("identity_providers")
    .select("provider,display_name,enabled,sort_order")
    .order("sort_order",{ascending:true});
  if(error)throw error;
  const providers=(data??[]).map((row:any)=>({
    id:row.provider,
    name:row.display_name,
    keysInstalled:adapters.has(row.provider),
    enabled:row.enabled===true,
    live:row.enabled===true&&adapters.has(row.provider)
  }));
  return json(req,{providers},200);
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

async function ekodiIdForPerson(personId:string|null){
  if(!personId)return null;
  const {data,error}=await admin.from("people").select("ekodi_id").eq("id",personId).maybeSingle();
  if(error)throw error;
  return data?.ekodi_id??null;
}

async function writeIdentityAudit(personId:string|null,authUserId:string|null,action:string,provider:string|null,identityId:string|null=null,metadata:Record<string,unknown>={}){
  const {error}=await admin.from("identity_audit_logs").insert({person_id:personId,auth_user_id:authUserId,action,provider,identity_id:identityId,metadata});
  if(error)console.error("identity audit",error.message);
}

async function issueChallenge(req:Request,provider:string,purpose:"login"|"link",initiatorUserId:string|null=null){
  const config=await enabledProvider(provider);
  if(!config)return json(req,{error:"provider_unavailable"},404);
  if(purpose==="login"&&!config.supports_login)return json(req,{error:"provider_login_disabled"},403);
  if(purpose==="link"&&!config.supports_link)return json(req,{error:"provider_link_disabled"},403);
  const nonce=hex(crypto.getRandomValues(new Uint8Array(24)));
  const nonceHash=await sha256(nonce);
  const now=new Date(),expires=new Date(now.getTime()+CHALLENGE_MINUTES*60*1000);
  const storedPurpose=purpose==="login"?"login":`link_${provider}`;
  await admin.from("identity_challenges").delete().lte("expires_at",now.toISOString());
  const {error}=await admin.from("identity_challenges").insert({nonce_hash:nonceHash,expires_at:expires.toISOString(),purpose:storedPurpose,provider,initiator_user_id:initiatorUserId});
  if(error)throw error;
  return json(req,{provider,nonce,clientId:config.adapter.clientId??null,authorizeUrl:config.adapter.authorizeUrl?.(nonce)??null,expiresAt:expires.toISOString(),purpose},201);
}

async function consumeChallenge(nonce:string,provider:string,purpose:"login"|"link",initiatorUserId:string|null=null){
  if(!/^[a-f0-9]{48}$/i.test(nonce))return false;
  const hash=await sha256(nonce),now=new Date().toISOString();
  const storedPurpose=purpose==="login"?"login":`link_${provider}`;
  let query=admin.from("identity_challenges").select("nonce_hash,initiator_user_id,purpose,provider").eq("nonce_hash",hash).eq("purpose",storedPurpose).eq("provider",provider).gt("expires_at",now);
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

async function recordEmailVerification(provider:string,subject:string,verified:boolean){
  // Only verified emails may satisfy email-keyed grants (see sync_person_access).
  const {error}=await admin.from("login_identities").update({email_verified:verified})
    .eq("provider",provider).eq("provider_subject",subject).eq("status","active");
  if(!error)return;
  // Google rows are verified by default, so a deployment that briefly precedes the
  // email_verified migration must not block Google sign-in. Other paths fail closed.
  if(provider==="google"&&verified){console.error("email_verified update skipped",error.message);return;}
  throw error;
}

async function accountProof(userId:string){
  const {data,error}=await admin.rpc("ekodi_account_for_auth_user",{p_auth_user_id:userId});
  if(error){console.error("ekodi_account_for_auth_user",error.message);return null;}
  return data??null;
}

// Redirect-provider logins (Naver, Kakao) sign the person into the EKODI account's
// primary auth user when one exists, so every feature — including those historically
// bound to a Google identity — sees the same account. The primary is preferred, then
// a Google identity, then the oldest link. A person with only this login path keeps
// its own auth user.
async function canonicalAccountSession(personId:string|null,link:{user:any;tokenHash:string}){
  if(!personId)return {...link,canonical:false};
  const {data,error}=await admin.from("login_identities")
    .select("auth_user_id,provider,is_primary,linked_at")
    .eq("person_id",personId).eq("status","active")
    .order("is_primary",{ascending:false}).order("linked_at",{ascending:true});
  if(error)throw error;
  const rows=data??[];
  const primary=rows.find((r:any)=>r.is_primary)??rows.find((r:any)=>r.provider==="google")??rows[0];
  if(!primary||primary.auth_user_id===link.user.id)return {...link,canonical:false};
  const {data:target,error:targetError}=await admin.auth.admin.getUserById(primary.auth_user_id);
  const email=String(target?.user?.email||"").trim().toLowerCase();
  if(targetError||!email){console.error("canonical account session",targetError?.message||"missing_email");return {...link,canonical:false};}
  const canonical=await issueSupabaseLink(email);
  if(canonical.user.id!==primary.auth_user_id){
    console.error("canonical account session mismatch",{expected:primary.auth_user_id,got:canonical.user.id});
    return {...link,canonical:false};
  }
  await syncPerson(canonical.user.id);
  return {...canonical,canonical:true};
}

async function exchangeProvider(req:Request,provider:string){
  const config=await enabledProvider(provider);
  if(!config)return json(req,{error:"provider_unavailable"},404);
  const body=await req.json().catch(()=>({}));
  const nonce=String(body?.nonce||"").trim();
  const credential=String(body?.credential||"").trim();
  if(!nonce||!credential)return json(req,{error:"credential_and_nonce_required"},400);
  if(!(await consumeChallenge(nonce,provider,"login",null)))return json(req,{error:"challenge_expired_or_used"},400);
  const profile=await config.adapter.verify(credential,nonce);
  if(config.requires_verified_email&&!profile.emailVerified)return json(req,{error:"verified_email_required"},400);
  const contactEmail=await contactEmailFor(provider,profile);
  const link=await issueSupabaseLink(await authEmailFor(provider,profile));
  const {data:personId,error:personError}=await admin.rpc("ensure_person_identity",{
    p_auth_user_id:link.user.id,
    p_provider:provider,
    p_provider_subject:profile.subject,
    p_email:contactEmail,
    p_display_name:profile.displayName
  });
  if(personError){
    console.error("ensure_person_identity",personError.message);
    const conflict=/already_linked|subject_conflict|requires_relink/i.test(personError.message||"");
    return json(req,{error:conflict?"identity_conflict":"person_identity_failed"},conflict?409:500);
  }
  await recordEmailVerification(provider,profile.subject,provider==="google"||profile.emailVerified===true);
  await syncPerson(link.user.id);
  const {error:legacyError}=await admin.rpc("apply_preregistered_access",{p_user_id:link.user.id});
  if(legacyError)console.error("apply_preregistered_access",legacyError.message);
  // Whatever door was used, the session is the EKODI account's canonical session.
  const session=adapters.get(provider)?.redirect?await canonicalAccountSession(personId,link):{...link,canonical:false};
  const platformAdmin=await platformAdminForUser(session.user.id);
  const ekodiId=await ekodiIdForPerson(personId);
  await writeIdentityAudit(personId,session.user.id,"identity.login",provider,null,{platformAdmin,canonicalSession:session.canonical,loginAuthUser:link.user.id});
  return json(req,{ok:true,provider,accountSession:session.canonical,tokenHash:session.tokenHash,type:"email",platformAdmin,ekodiId,user:{email:contactEmail,name:profile.displayName}},200);
}

// EMAIL-ID-001: public signup never opens until an operator has verified the
// Supabase Auth Confirm Email setting, EKODI Mail custom SMTP and delivery.
// All flags are independently required. This is NOT the channel OAuth switch.
function emailPasswordReady(){
  return Deno.env.get("EKODI_EMAIL_PASSWORD_ENABLED")==="true" &&
    Deno.env.get("EKODI_AUTH_EMAIL_CONFIRM_VERIFIED")==="true" &&
    Deno.env.get("EKODI_AUTH_SMTP_VERIFIED")==="true";
}
function emailPasswordReadiness(req:Request){
  return json(req,{enabled:emailPasswordReady(),sender:"EKODI Mail"},200);
}

async function sessionHandoff(req:Request,user:any){
  const email=String(user?.email||"").trim().toLowerCase();
  if(!email)return json(req,{error:"verified_email_required"},400);
  const personBeforeHandoff=await personForUser(user.id);
  // Google logins also use email-backed Supabase magic-link sessions. Only an
  // UNPROVISIONED password-style email user must pass these additional gates;
  // never block already-linked Google identities just because app_metadata
  // reports "email" for their underlying Supabase Auth user.
  const newEmailPerson=!personBeforeHandoff&&user.app_metadata?.provider==="email";
  if(newEmailPerson){
    if(!emailPasswordReady())return json(req,{error:"email_password_unavailable"},503);
    if(!user.email_confirmed_at)return json(req,{error:"verified_email_required"},403);
  }
  // Gate the account *before* minting a one-use session link. Link ownership
  // must be checked before provisioning the EKODI Person as well.
  const link=await issueSupabaseLink(email);
  if(link.user.id!==user.id){
    console.error("session handoff user mismatch",{source:user.id,target:link.user.id});
    return json(req,{error:"session_identity_mismatch"},409);
  }
  let personId=personBeforeHandoff;
  // Never infer the person from matching email text.
  if(newEmailPerson){
    const {data:created,error:createError}=await admin.rpc("ensure_person_identity",{
      p_auth_user_id:user.id,
      p_provider:"email",
      p_provider_subject:user.id,
      p_email:email,
      p_display_name:null
    });
    if(createError||!created){
      console.error("email EKODI person provisioning",createError?.message||"no_person");
      return json(req,{error:"ekodi_identity_unavailable"},503);
    }
    await recordEmailVerification("email",user.id,true);
    await syncPerson(user.id);
    personId=await personForUser(user.id);
    if(personId!==created)return json(req,{error:"ekodi_identity_mismatch"},409);
  }
  if(user.app_metadata?.provider==="email"&&!personId)
    return json(req,{error:"ekodi_identity_required"},409);
  const ekodiId=await ekodiIdForPerson(personId);
  if(user.app_metadata?.provider==="email"&&!ekodiId)return json(req,{error:"ekodi_id_unavailable"},503);
  const platformAdmin=await platformAdminForUser(user.id);
  return json(req,{ok:true,tokenHash:link.tokenHash,type:"email",platformAdmin,ekodiId,user:{id:user.id,email}},200);
}

async function listIdentities(req:Request,userId:string){
  const personId=await personForUser(userId);
  if(!personId)return json(req,{person:null,identities:[],reloginRequired:true},200);
  const ekodiId=await ekodiIdForPerson(personId);
  const {data,error}=await admin.from("login_identities")
    .select("id,provider,email,is_primary,status,linked_at,last_seen_at,auth_user_id")
    .eq("person_id",personId)
    .eq("status","active")
    .order("is_primary",{ascending:false})
    .order("linked_at",{ascending:true});
  if(error)throw error;
  const identities=(data??[]).map((identity:any)=>({
    id:identity.id,
    provider:identity.provider,
    email:identity.email,
    is_primary:identity.is_primary,
    status:identity.status,
    linked_at:identity.linked_at,
    last_seen_at:identity.last_seen_at,
    is_current:identity.auth_user_id===userId
  }));
  const account=await accountProof(userId);
  const verifiedEmails=Array.isArray(account?.verified_emails)?account.verified_emails:[];
  return json(req,{person:{id:personId,ekodiId,verifiedEmails,accountEmail:verifiedEmails[0]??null,providers:account?.providers??[]},identities,reloginRequired:false},200);
}

async function beginLink(req:Request,userId:string,provider:string){
  if(!(await personForUser(userId)))return json(req,{error:"relogin_required"},409);
  return issueChallenge(req,provider,"link",userId);
}

async function finishLink(req:Request,userId:string,provider:string){
  const config=await enabledProvider(provider);
  if(!config)return json(req,{error:"provider_unavailable"},404);
  const body=await req.json().catch(()=>({}));
  const nonce=String(body?.nonce||"").trim();
  const credential=String(body?.credential||"").trim();
  if(!nonce||!credential)return json(req,{error:"credential_and_nonce_required"},400);
  if(!(await consumeChallenge(nonce,provider,"link",userId)))return json(req,{error:"challenge_expired_or_used"},400);

  const profile=await config.adapter.verify(credential,nonce);
  if(config.requires_verified_email&&!profile.emailVerified)return json(req,{error:"verified_email_required"},400);
  const contactEmail=await contactEmailFor(provider,profile);
  const target=await issueSupabaseLink(await authEmailFor(provider,profile));
  const {data:personId,error:linkError}=await admin.rpc("link_person_identity",{
    p_initiator_user_id:userId,
    p_target_user_id:target.user.id,
    p_provider:provider,
    p_provider_subject:profile.subject,
    p_email:contactEmail,
    p_display_name:profile.displayName
  });
  if(linkError){
    console.error("link_person_identity",linkError.message);
    const conflict=/already_linked|target_account|identity_already|requires_relink/i.test(linkError.message||"");
    return json(req,{error:conflict?"identity_already_linked":"identity_link_failed"},conflict?409:500);
  }

  await recordEmailVerification(provider,profile.subject,provider==="google"||profile.emailVerified===true);
  await syncPerson(userId);
  if(target.user.id!==userId)await syncPerson(target.user.id);
  await writeIdentityAudit(personId,userId,"identity.linked",provider,null,{targetUserDifferent:target.user.id!==userId});
  const ekodiId=await ekodiIdForPerson(personId);
  const {data}=await admin.from("login_identities")
    .select("id,provider,email,is_primary,status,linked_at,last_seen_at")
    .eq("person_id",personId)
    .eq("status","active")
    .order("is_primary",{ascending:false})
    .order("linked_at",{ascending:true});
  return json(req,{ok:true,ekodiId,linked:{email:contactEmail,provider},identities:data??[]},200);
}

async function disconnectIdentity(req:Request,userId:string,identityId:string){
  if(!/^[0-9a-f-]{36}$/i.test(identityId))return json(req,{error:"identity_id_invalid"},400);
  const {data:personId,error}=await admin.rpc("disconnect_person_identity",{p_initiator_user_id:userId,p_identity_id:identityId});
  if(error){
    const message=String(error.message||"");
    if(/last_identity_cannot_disconnect/.test(message))return json(req,{error:"last_identity_cannot_disconnect"},409);
    if(/current_identity_cannot_disconnect/.test(message))return json(req,{error:"current_identity_cannot_disconnect"},409);
    if(/identity_not_found/.test(message))return json(req,{error:"identity_not_found"},404);
    throw error;
  }
  const ekodiId=await ekodiIdForPerson(personId);
  return json(req,{ok:true,ekodiId},200);
}

function providerFrom(path:string,suffix:string){
  const match=path.match(new RegExp(`^/providers/([a-z0-9_-]+)${suffix.replaceAll("/","\\/")}$`));
  return match?.[1]??null;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const origin=req.headers.get("Origin");
  if(!origin||!AUTH_ORIGINS.has(origin))return json(req,{error:"origin_not_allowed"},403);
  const path=new URL(req.url).pathname.replace(/^\/identity-api/,"")||"/";
  try{
    if(req.method==="GET"&&path==="/email/readiness")return emailPasswordReadiness(req);
    if(req.method==="GET"&&path==="/providers")return await listProviders(req);
    if(req.method==="GET"&&path==="/providers/readiness")return await providerReadiness(req);
    if(req.method==="POST"&&path==="/challenge")return await issueChallenge(req,"google","login",null);
    if(req.method==="POST"&&path==="/google/exchange")return await exchangeProvider(req,"google");

    const loginChallengeProvider=providerFrom(path,"/challenge");
    if(req.method==="POST"&&loginChallengeProvider)return await issueChallenge(req,loginChallengeProvider,"login",null);
    const loginExchangeProvider=providerFrom(path,"/exchange");
    if(req.method==="POST"&&loginExchangeProvider)return await exchangeProvider(req,loginExchangeProvider);

    const user=await currentUser(req);
    if(!user)return json(req,{error:"unauthorized"},401);

    if(req.method==="POST"&&path==="/session/handoff")return await sessionHandoff(req,user);
    if(req.method==="GET"&&path==="/identities")return await listIdentities(req,user.id);
    if(req.method==="POST"&&path==="/google/link/challenge")return await beginLink(req,user.id,"google");
    if(req.method==="POST"&&path==="/google/link/exchange")return await finishLink(req,user.id,"google");

    const linkChallengeProvider=providerFrom(path,"/link/challenge");
    if(req.method==="POST"&&linkChallengeProvider)return await beginLink(req,user.id,linkChallengeProvider);
    const linkExchangeProvider=providerFrom(path,"/link/exchange");
    if(req.method==="POST"&&linkExchangeProvider)return await finishLink(req,user.id,linkExchangeProvider);

    const identityMatch=path.match(/^\/identities\/([0-9a-f-]{36})$/i);
    if(req.method==="DELETE"&&identityMatch)return await disconnectIdentity(req,user.id,identityMatch[1]);
    return json(req,{error:"not_found"},404);
  }catch(e){
    console.error("identity-api",e);
    return json(req,{error:"identity_api_failed"},500);
  }
});