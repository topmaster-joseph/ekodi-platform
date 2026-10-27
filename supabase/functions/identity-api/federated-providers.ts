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

