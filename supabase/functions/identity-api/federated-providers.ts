// Pure provider adapters for redirect (authorization-code) logins.
// No Supabase or Deno-only imports, so the same code runs under Deno (edge) and Node (tests).
export type VerifiedIdentity={subject:string;email:string;emailVerified:boolean;displayName:string|null};
// Apex-domain plus-address; no mail is sent to it (sessions are issued via generateLink token hashes).
export const FEDERATED_ALIAS_LOCAL="identity";
export const FEDERATED_ALIAS_DOMAIN="ekodi.kr";

async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function authorizeUrl(base:string,params:Record<string,string>){
  const url=new URL(base);
  for(const [key,value] of Object.entries(params))if(value)url.searchParams.set(key,value);
  return url.toString();
}
async function providerJson(response:Response,label:string){
  const text=await response.text();
  let data:any={};try{data=text?JSON.parse(text):{}}catch{data={}}
  if(!response.ok)throw new Error(`${label}_http_${response.status}`);
  return data;
}

export async function verifyNaverCode(code:string,state:string,deps:{clientId:string;clientSecret:string;fetcher?:typeof fetch}):Promise<VerifiedIdentity>{
  const fetcher=deps.fetcher??fetch;
  if(!code||!state)throw new Error("naver_code_required");
  const tokenUrl=authorizeUrl("https://nid.naver.com/oauth2.0/token",{grant_type:"authorization_code",client_id:deps.clientId,client_secret:deps.clientSecret,code,state});
  const token=await providerJson(await fetcher(tokenUrl,{method:"POST",headers:{accept:"application/json"}}),"naver_token");
  if(!token.access_token)throw new Error("naver_token_invalid");
  const me=await providerJson(await fetcher("https://openapi.naver.com/v1/nid/me",{headers:{authorization:`Bearer ${token.access_token}`,accept:"application/json"}}),"naver_profile");
  const profile=me?.response;
  if(me?.resultcode!=="00"||!profile?.id)throw new Error("naver_profile_invalid");
  const email=String(profile.email||"").trim().toLowerCase();
  return {
    subject:String(profile.id),
    email,
    // Naver does not publish an email-verification flag; never treat it as verified proof of ownership.
    emailVerified:false,
    displayName:String(profile.name||profile.nickname||"").slice(0,120)||null
  };
}

export async function verifyKakaoCode(code:string,_state:string,deps:{clientId:string;clientSecret:string;redirectUri:string;fetcher?:typeof fetch}):Promise<VerifiedIdentity>{
  const fetcher=deps.fetcher??fetch;
  if(!code)throw new Error("kakao_code_required");
  const form=new URLSearchParams({grant_type:"authorization_code",client_id:deps.clientId,redirect_uri:deps.redirectUri,code});
  if(deps.clientSecret)form.set("client_secret",deps.clientSecret);
  const token=await providerJson(await fetcher("https://kauth.kakao.com/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded;charset=utf-8",accept:"application/json"},body:form.toString()}),"kakao_token");
  if(!token.access_token)throw new Error("kakao_token_invalid");
  const me=await providerJson(await fetcher("https://kapi.kakao.com/v2/user/me",{headers:{authorization:`Bearer ${token.access_token}`,accept:"application/json"}}),"kakao_profile");
  if(!me?.id)throw new Error("kakao_profile_invalid");
  const account=me.kakao_account||{};
  const email=String(account.email||"").trim().toLowerCase();
  return {
    subject:String(me.id),
    email,
    emailVerified:Boolean(email)&&account.is_email_valid===true&&account.is_email_verified===true,
    displayName:String(account.profile?.nickname||me.properties?.nickname||"").slice(0,120)||null
  };
}

// Supabase auth users are email-addressed. Redirect providers get their own alias auth user
// keyed by the stable provider subject, so a Naver/Kakao login can never land on (or take over)
// another person's Google-backed auth user just because the email matches. Joining several
// login paths into one EKODI account is done only through the explicit, signed-in link flow.
export async function federatedAuthEmail(provider:string,subject:string){
  const digest=(await sha256Hex(`${provider}:${subject}`)).slice(0,32);
  return `${FEDERATED_ALIAS_LOCAL}+${provider}.${digest}@${FEDERATED_ALIAS_DOMAIN}`;
}


// ── Sign in with Apple (web, authorization code, response_mode=query) ─────────
// No name/email scope is requested, so Apple permits a plain query redirect to the
// static auth page and the stable `sub` is the only identifier: like Naver/Kakao it
// gets its own alias auth user and joins an EKODI account only through explicit linking.
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const b64urlJson=(value:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(value)));
function pemBody(pem:string){
  const normalized=String(pem||"").replace(/\\n/g,"\n");
  const body=normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,"");
  if(!body)throw new Error("apple_private_key_missing");
  return Uint8Array.from(atob(body),c=>c.charCodeAt(0));
}
export async function appleClientSecret(deps:{teamId:string;keyId:string;servicesId:string;privateKey:string;now?:number}){
  if(!deps.teamId||!deps.keyId||!deps.servicesId)throw new Error("apple_config_missing");
  const key=await crypto.subtle.importKey("pkcs8",pemBody(deps.privateKey),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const iat=Math.floor((deps.now??Date.now())/1000);
  const unsigned=`${b64urlJson({alg:"ES256",kid:deps.keyId,typ:"JWT"})}.${b64urlJson({iss:deps.teamId,iat,exp:iat+300,aud:"https://appleid.apple.com",sub:deps.servicesId})}`;
  // WebCrypto ECDSA returns IEEE-P1363 (r||s), which is exactly the JWS ES256 encoding.
  const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(signature)}`;
}
function decodeJwtPayload(jwt:string){
  const part=String(jwt||"").split(".")[1];
  if(!part)throw new Error("apple_id_token_invalid");
  const json=atob(part.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((part.length+3)%4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json,c=>c.charCodeAt(0))));
}
export async function verifyAppleCode(code:string,_state:string,deps:{teamId:string;keyId:string;servicesId:string;privateKey:string;redirectUri:string;fetcher?:typeof fetch;now?:number}):Promise<VerifiedIdentity>{
  const fetcher=deps.fetcher??fetch;
  if(!code)throw new Error("apple_code_required");
  const form=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:deps.redirectUri,client_id:deps.servicesId,client_secret:await appleClientSecret(deps)});
  const token=await providerJson(await fetcher("https://appleid.apple.com/auth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:form.toString()}),"apple_token");
  // The id_token arrives directly from Apple's token endpoint over TLS in exchange for a
  // code bound to our signed client secret (OIDC Core 3.1.3.7), so claims are checked, not re-signed.
  const claims=decodeJwtPayload(token.id_token);
  const nowSec=Math.floor((deps.now??Date.now())/1000);
  if(claims.iss!=="https://appleid.apple.com"||claims.aud!==deps.servicesId||!claims.sub||!(Number(claims.exp)>nowSec))throw new Error("apple_id_token_invalid");
  const email=String(claims.email||"").trim().toLowerCase();
  const relay=/@privaterelay\.appleid\.com$/.test(email);
  return {
    subject:String(claims.sub),
    email:relay?"":email,
    emailVerified:Boolean(email)&&!relay&&(claims.email_verified===true||claims.email_verified==="true"),
    displayName:null
  };
}
