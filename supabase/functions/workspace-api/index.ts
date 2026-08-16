import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const IDENTITY_API=`${SUPABASE_URL}/functions/v1/identity-api`;
const AUTH_ORIGIN="https://auth.ekodi.kr";
const OPEN_SSO_ORIGINS:Record<string,string[]>={
  social:["https://social.ekodi.kr"],
  energy:["https://energy.ekodi.kr"],
};
const PERSON_WORKSPACE_SITES=["church","biz","books","author","lab","community","work","business","mall","marketing"];
const ACTIVE_STATUSES=new Set(["active","pre_registered"]);

function allowedOrigin(origin:string|null){
  if(!origin)return AUTH_ORIGIN;
  try{
    const url=new URL(origin);
    if(url.protocol==="https:"&&(url.hostname==="ekodi.kr"||url.hostname.endsWith(".ekodi.kr")))return origin;
  }catch{}
  return AUTH_ORIGIN;
}
function cors(req:Request){
  return {
    "Access-Control-Allow-Origin":allowedOrigin(req.headers.get("Origin")),
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin",
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
function clip(value:unknown,max:number){return String(value??"").trim().slice(0,max)}
function safeReturn(site:string,raw:string){
  const origins=OPEN_SSO_ORIGINS[site]||[];
  try{
    const target=new URL(raw||origins[0]);
    return target.protocol==="https:"&&origins.includes(target.origin)?target.href:null;
  }catch{return null}
}
async function authenticatedClient(req:Request){
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer "))return null;
  const db=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await db.auth.getUser();
  if(error||!data.user)return null;
  return {db,user:data.user,authorization};
}
function planRank(value:unknown){
  return ({free:0,basic:1,standard:2,pro:3,enterprise:4})[String(value||"free").toLowerCase()]??0;
}
async function personWorkspaces(db:any){
  const results=await Promise.all(PERSON_WORKSPACE_SITES.map(async(site)=>{
    const {data,error}=await db.rpc("current_site_workspaces",{p_site_key:site});
    if(error){console.warn("workspace source unavailable",site,error.message);return {site,rows:[] as any[]};}
    return {site,rows:Array.isArray(data)?data:[]};
  }));
  const merged=new Map<string,any>();
  for(const {site,rows} of results){
    for(const row of rows){
      const key=clip(row?.workspace_key,180);
      if(!key||!ACTIVE_STATUSES.has(String(row?.status||"")))continue;
      const existing=merged.get(key);
      if(!existing){
        merged.set(key,{...row,workspace_key:key,services:[site],requires_handoff:true,workspace_scope:"person"});
        continue;
      }
      if(!existing.services.includes(site))existing.services.push(site);
      if(String(row?.status)==="active")existing.status="active";
      if(planRank(row?.plan)>planRank(existing.plan))existing.plan=row.plan;
      if(!existing.tenant_id&&row?.tenant_id)existing.tenant_id=row.tenant_id;
      if(!existing.store_id&&row?.store_id)existing.store_id=row.store_id;
      if(!existing.workspace_name&&row?.workspace_name)existing.workspace_name=row.workspace_name;
      if(!existing.workspace_kind&&row?.workspace_kind)existing.workspace_kind=row.workspace_kind;
    }
  }
  return [...merged.values()].sort((a,b)=>{
    const status=Number(b.status==="active")-Number(a.status==="active");
    if(status)return status;
    const personal=Number(b.workspace_kind==="personal")-Number(a.workspace_kind==="personal");
    if(personal)return personal;
    return String(a.workspace_name||a.workspace_key).localeCompare(String(b.workspace_name||b.workspace_key),"ko");
  });
}
async function issueIdentityHandoff(authorization:string){
  const response=await fetch(`${IDENTITY_API}/session/handoff`,{
    method:"POST",
    headers:{Authorization:authorization,apikey:ANON_KEY,Origin:AUTH_ORIGIN,"content-type":"application/json"},
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body?.tokenHash)throw new Error(body?.error||"identity_handoff_failed");
  return body;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const auth=await authenticatedClient(req);
  if(!auth)return json(req,{error:"unauthorized"},401);
  const url=new URL(req.url);
  const path=url.pathname.replace(/^\/workspace-api/,"")||"/";
  try{
    if(req.method==="GET"&&path==="/health")return json(req,{ok:true,service:"workspace-api",scope:"person",sites:Object.keys(OPEN_SSO_ORIGINS)});
    if(req.method==="GET"&&path==="/workspaces"){
      const site=clip(url.searchParams.get("site"),40);
      if(!OPEN_SSO_ORIGINS[site])return json(req,{error:"site_not_supported"},400);
      const workspaces=await personWorkspaces(auth.db);
      return json(req,{workspaces,user:{id:auth.user.id,email:auth.user.email??null},scope:"person"});
    }
    if(req.method==="POST"&&path==="/handoff"){
      const body=await req.json().catch(()=>({}));
      const site=clip(body?.site,40),workspaceKey=clip(body?.workspace_key,180);
      const returnTo=safeReturn(site,clip(body?.return_to,500));
      if(!OPEN_SSO_ORIGINS[site]||!workspaceKey||!returnTo)return json(req,{error:"invalid_handoff_target"},400);
      const workspaces=await personWorkspaces(auth.db);
      const selected=workspaces.find(item=>item.workspace_key===workspaceKey&&item.requires_handoff===true&&ACTIVE_STATUSES.has(String(item.status||"")));
      if(!selected)return json(req,{error:"workspace_access_required"},403);
      const proof=await issueIdentityHandoff(auth.authorization);
      return json(req,{ok:true,tokenHash:proof.tokenHash,type:proof.type||"email",returnTo,expiresFor:"single_use",workspace:selected});
    }
    return json(req,{error:"not_found"},404);
  }catch(error){
    console.error("workspace-api",error);
    return json(req,{error:"workspace_api_failed"},500);
  }
});
