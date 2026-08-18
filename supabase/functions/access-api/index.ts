import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigin=(origin:string|null)=>{
  if(!origin) return "https://auth.ekodi.kr";
  try{
    const u=new URL(origin);
    if(u.protocol==="https:"&&(u.hostname==="ekodi.kr"||u.hostname.endsWith(".ekodi.kr")||u.hostname==="ekodibiz.kr"||u.hostname.endsWith(".ekodibiz.kr")||u.hostname==="cheonggye-market.pages.dev"))return origin;
  }catch{}
  return "https://auth.ekodi.kr";
};
const cors=(req:Request)=>({
  "Access-Control-Allow-Origin":allowedOrigin(req.headers.get("Origin")),
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
});
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const clip=(v:unknown,n:number)=>String(v??"").trim().slice(0,n);
const plans=new Set(["free","flex","plus","pro","auto","standard","basic","enterprise"]);

async function authClient(req:Request){
  const authorization=req.headers.get("Authorization");
  if(!authorization)return null;
  const db=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await db.auth.getUser();
  if(error||!data.user)return null;
  return {db,user:data.user};
}
async function platformAdmin(userId:string){
  const {data}=await admin.from("profiles").select("platform_admin").eq("user_id",userId).maybeSingle();
  return data?.platform_admin===true;
}
async function tenantReviewer(userId:string,tenantId:string|null){
  if(await platformAdmin(userId))return true;
  if(!tenantId)return false;
  const {data}=await admin.from("tenant_members").select("role,status").eq("tenant_id",tenantId).eq("user_id",userId).eq("status","active").in("role",["tenant_admin","platform_admin"]).limit(1);
  return (data?.length??0)>0;
}
async function tenantBySlug(slug:string){
  if(!slug)return null;
  const {data}=await admin.from("tenants").select("id,slug,name").eq("slug",slug).maybeSingle();
  return data??null;
}
async function personAuthUserIds(userId:string){
  const {data:identity,error}=await admin.from("login_identities").select("person_id").eq("auth_user_id",userId).eq("status","active").maybeSingle();
  if(error)throw error;
  if(!identity?.person_id)return [userId];
  const {data,error:membersError}=await admin.from("login_identities").select("auth_user_id").eq("person_id",identity.person_id).eq("status","active");
  if(membersError)throw membersError;
  const ids=(data??[]).map((item:any)=>item.auth_user_id).filter(Boolean);
  return ids.length?[...new Set(ids)]:[userId];
}
function validHandoff(site:string,raw:string){
  const origins:Record<string,string[]>={
    cgma:["https://cgma.ekodi.kr"],
    marketing:["https://marketing.ekodi.kr","https://jadam.ekodi.kr","https://pizzamaru.ekodi.kr","https://yogurt.ekodi.kr","https://yogurtpurple.ekodi.kr"],
    biz:["https://biz.ekodi.kr"],
    trade:["https://trade.ekodi.kr"],
    mall:["https://mall.ekodi.kr"],
    pay:["https://pay.ekodi.kr"],
    books:["https://books.ekodi.kr"],
    church:["https://church.ekodi.kr"],
    lab:["https://lab.ekodi.kr"],
    mission:["https://mission.ekodi.kr"],
    community:["https://community.ekodi.kr"],
    edu:["https://edu.ekodi.kr"],
    media:["https://media.ekodi.kr"],
    admin:["https://admin.ekodi.kr"],
    portal:["https://ekodi.kr"]
  };
  try{const target=new URL(raw);return target.protocol==="https:"&&(origins[site]||[]).includes(target.origin)?target.href:null}catch{return null}
}
function tenantSlugBase(name:string,email:string){
  const local=(email.split("@")[0]||"").normalize("NFKD").toLowerCase();
  const fromName=name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const fromEmail=local.replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  return (fromName||fromEmail||"client").slice(0,40)||"client";
}
async function createMarketingTenant(row:any){
  if(row.tenant_id){
    const {data}=await admin.from("tenants").select("id,slug,name").eq("id",row.tenant_id).maybeSingle();
    return data??{id:row.tenant_id,slug:null,name:row.business_name||row.email};
  }
  const name=clip(row.business_name,160)||String(row.email);
  const base=tenantSlugBase(name,String(row.email));
  let created:any=null;
  let lastError:any=null;
  for(let attempt=0;attempt<4&&!created;attempt++){
    const suffix=attempt===0?"":`-${crypto.randomUUID().slice(0,6)}`;
    const slug=`${base}${suffix}`.slice(0,48);
    const settings={marketing_plan:plans.has(row.requested_plan)?row.requested_plan:"pro",onboarding_status:"approved",business_number:row.business_number||null,contact_phone:row.contact_phone||null,source:"marketing_pro_request"};
    const {data,error}=await admin.from("tenants").insert({slug,name,kind:"business",status:"active",settings}).select("id,slug,name").single();
    if(!error)created=data;
    else lastError=error;
  }
  if(!created)throw lastError||new Error("tenant_create_failed");
  return created;
}
async function ensurePrimaryStore(tenant:any,row:any){
  if(!tenant?.id)return null;
  const {data:existing}=await admin.from("stores").select("id,slug,name").eq("tenant_id",tenant.id).eq("slug","main").maybeSingle();
  if(existing)return existing;
  const name=clip(row.business_name,160)||tenant.name||String(row.email);
  const {data,error}=await admin.from("stores").insert({tenant_id:tenant.id,slug:"main",name,is_published:false,order_enabled:false}).select("id,slug,name").single();
  if(error)throw error;
  return data;
}
async function syncPersonAccess(userId:string){
  const {error}=await admin.rpc("sync_person_access",{p_auth_user_id:userId});
  if(error&&!/initiator_person_required/i.test(error.message||""))throw error;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(req)});
  const auth=await authClient(req);
  if(!auth)return json(req,{error:"unauthorized"},401);
  const requestUrl=new URL(req.url);
  const path=requestUrl.pathname.replace(/^\/access-api/,"")||"/";
  try{
    if(req.method==="GET"&&path==="/me"){
      const site=clip(requestUrl.searchParams.get("site"),60);
      if(!site)return json(req,{error:"site_required"},400);
      const {data,error}=await auth.db.rpc("current_site_access",{p_site_key:site});
      if(error)throw error;
      return json(req,{...data,user:{id:auth.user.id,email:auth.user.email??null,name:auth.user.user_metadata?.full_name??auth.user.user_metadata?.name??null}});
    }

    if(req.method==="GET"&&path==="/workspaces"){
      const site=clip(requestUrl.searchParams.get("site"),60);
      if(!site)return json(req,{error:"site_required"},400);
      const {data,error}=await auth.db.rpc("current_site_workspaces",{p_site_key:site});
      if(error)throw error;
      return json(req,{workspaces:Array.isArray(data)?data:[],user:{id:auth.user.id,email:auth.user.email??null,name:auth.user.user_metadata?.full_name??auth.user.user_metadata?.name??null}});
    }

    if(req.method==="POST"&&path==="/request"){
      const body=await req.json();
      const site=clip(body?.site,60),tenantSlug=clip(body?.tenant,80),note=clip(body?.note,1000)||null;
      const requestedRole=["member","store_owner","store_staff"].includes(body?.role)?body.role:"member";
      const requestedPlan=plans.has(body?.plan)?body.plan:(site==="marketing"?"pro":"standard");
      const businessName=clip(body?.business_name,160)||null;
      const contactPhone=clip(body?.contact_phone,40)||null;
      const businessNumber=clip(body?.business_number,40)||null;
      if(!site)return json(req,{error:"site_required"},400);
      const {data:access}=await auth.db.rpc("current_site_access",{p_site_key:site});
      if(site!=="marketing"&&(access?.status==="active"||access?.status==="pre_registered"))return json(req,{ok:true,already_authorized:true,access});
      const tenant=tenantSlug?await tenantBySlug(tenantSlug):null;
      if(tenantSlug&&!tenant)return json(req,{error:"tenant_not_found"},404);
      const email=String(auth.user.email??"").toLowerCase();
      if(!email)return json(req,{error:"email_required"},400);
      const relatedUserIds=await personAuthUserIds(auth.user.id);
      let q=admin.from("site_access_requests").select("id,status,requested_at,requested_plan,business_name").in("user_id",relatedUserIds).eq("site_key",site).eq("status","pending");
      q=tenant?.id?q.eq("tenant_id",tenant.id):q.is("tenant_id",null);
      const {data:pendingRows,error:pendingError}=await q.limit(1);
      if(pendingError)throw pendingError;
      const pending=pendingRows?.[0]??null;
      if(pending)return json(req,{ok:true,already_pending:true,request:pending});
      const {data:created,error}=await admin.from("site_access_requests").insert({user_id:auth.user.id,email,site_key:site,tenant_id:tenant?.id??null,requested_role:requestedRole,requested_plan:requestedPlan,business_name:businessName,contact_phone:contactPhone,business_number:businessNumber,status:"pending",applicant_note:note}).select("id,site_key,requested_role,requested_plan,status,business_name,requested_at").single();
      if(error)throw error;
      return json(req,{ok:true,request:created},201);
    }

    if(req.method==="POST"&&path==="/handoff"){
      const body=await req.json();
      const site=clip(body?.site,60);
      const returnTo=validHandoff(site,clip(body?.return_to,500));
      const workspaceKey=clip(body?.workspace_key,180)||null;
      if(!site||!returnTo)return json(req,{error:"invalid_handoff_target"},400);
      const email=String(auth.user.email??"").trim().toLowerCase();
      if(!email)return json(req,{error:"email_required"},400);

      const {data:workspaceData,error:workspaceError}=await auth.db.rpc("current_site_workspaces",{p_site_key:site});
      if(workspaceError)throw workspaceError;
      const workspaces=Array.isArray(workspaceData)?workspaceData:[];
      const selected=workspaceKey
        ?workspaces.find((item:any)=>item?.workspace_key===workspaceKey)
        :workspaces.find((item:any)=>item?.source==="registry"&&item?.requires_handoff===true)
          ??(site==="marketing"?workspaces.find((item:any)=>item?.workspace_kind==="personal"):undefined);
      const status=String(selected?.status||"");
      const statusAllowed=site==="marketing"
        ?["active","pre_registered","free"].includes(status)
        :["active","pre_registered"].includes(status);
      const handoffAllowed=site==="marketing"||selected?.requires_handoff===true;
      if(!selected||!statusAllowed||!handoffAllowed){
        return json(req,{error:"site_access_required"},403);
      }

      const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email});
      const tokenHash=data?.properties?.hashed_token;
      if(error||!tokenHash){
        console.error("handoff generateLink",error?.message||"missing_hashed_token");
        return json(req,{error:"handoff_token_issue_failed"},503);
      }
      return json(req,{ok:true,tokenHash,type:"email",returnTo,expiresFor:"single_use",plan:selected.plan||"free",workspace:selected});
    }

    if(req.method==="GET"&&path==="/pending"){
      const site=clip(requestUrl.searchParams.get("site"),60),tenantSlug=clip(requestUrl.searchParams.get("tenant"),80);
      if(!site)return json(req,{error:"site_required"},400);
      const tenant=tenantSlug?await tenantBySlug(tenantSlug):null;
      if(!(await tenantReviewer(auth.user.id,tenant?.id??null)))return json(req,{error:"reviewer_required"},403);
      let q=admin.from("site_access_requests").select("id,user_id,email,site_key,tenant_id,requested_role,requested_plan,status,business_name,contact_phone,business_number,applicant_note,requested_at").eq("site_key",site).eq("status","pending").order("requested_at");
      if(tenant?.id)q=q.eq("tenant_id",tenant.id);
      const {data,error}=await q;
      if(error)throw error;
      return json(req,{requests:data??[]});
    }

    if(req.method==="POST"&&path==="/review"){
      const body=await req.json(),id=clip(body?.request_id,80),decision=body?.decision==="approve"?"approved":body?.decision==="reject"?"rejected":null,note=clip(body?.admin_note,1000)||null;
      if(!id||!decision)return json(req,{error:"request_and_decision_required"},400);
      const {data:row}=await admin.from("site_access_requests").select("*").eq("id",id).maybeSingle();
      if(!row||row.status!=="pending")return json(req,{error:"request_not_pending"},400);
      if(!(await tenantReviewer(auth.user.id,row.tenant_id)))return json(req,{error:"reviewer_required"},403);
      let tenant:any=null;
      let store:any=null;
      if(decision==="approved"){
        if(row.site_key==="marketing"){
          tenant=await createMarketingTenant(row);
          store=await ensurePrimaryStore(tenant,row);
        }else if(row.tenant_id){
          const {data}=await admin.from("tenants").select("id,slug,name").eq("id",row.tenant_id).maybeSingle();
          tenant=data??null;
        }
        const targetTenantId=tenant?.id??row.tenant_id??null;
        const plan=plans.has(row.requested_plan)?row.requested_plan:"standard";
        const {error:regErr}=await admin.from("site_access_registry").upsert({email:String(row.email).toLowerCase(),site_key:row.site_key,tenant_id:targetTenantId,role:row.requested_role,status:"active",source:"approved_request",note,plan},{onConflict:"email,site_key,tenant_id,role"});
        if(regErr)throw regErr;
        const {error:applyErr}=await admin.rpc("apply_preregistered_access",{p_user_id:row.user_id});
        if(applyErr)throw applyErr;
        await syncPersonAccess(row.user_id);
        if(store?.id){
          const {error:storeMemberErr}=await admin.from("store_members").upsert({store_id:store.id,user_id:row.user_id,role:row.requested_role},{onConflict:"store_id,user_id,role"});
          if(storeMemberErr)throw storeMemberErr;
          await syncPersonAccess(row.user_id);
        }
        if(targetTenantId!==row.tenant_id){
          const {error:requestTenantErr}=await admin.from("site_access_requests").update({tenant_id:targetTenantId}).eq("id",id);
          if(requestTenantErr)throw requestTenantErr;
        }
      }
      const {error:updateErr}=await admin.from("site_access_requests").update({status:decision,admin_note:note,reviewed_by:auth.user.id,reviewed_at:new Date().toISOString()}).eq("id",id);
      if(updateErr)throw updateErr;
      return json(req,{ok:true,status:decision,tenant:tenant?{id:tenant.id,slug:tenant.slug,name:tenant.name}:null,store:store?{id:store.id,slug:store.slug,name:store.name}:null});
    }

    return json(req,{error:"not_found"},404);
  }catch(error){
    console.error("access-api",error);
    return json(req,{error:"access_api_failed"},500);
  }
});
