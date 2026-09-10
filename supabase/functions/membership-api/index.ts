import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const adminDb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const clip=(v:unknown,n:number)=>String(v??"").trim().slice(0,n);

async function authClient(req:Request){
  const authorization=req.headers.get("Authorization");
  if(!authorization)return null;
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await db.auth.getUser();
  if(error||!data.user)return null;
  return {db,user:data.user};
}
async function tenantReviewer(db:any,userId:string,tenantId:string){
  const {data:profile}=await adminDb.from("profiles").select("platform_admin").eq("user_id",userId).maybeSingle();
  if(profile?.platform_admin===true)return {allowed:true,authority:"platform",role:"platform_admin"};
  const {data,error}=await db.rpc("has_tenant_admin_access",{p_tenant:tenantId});
  return {allowed:!error&&data===true,authority:!error&&data===true?"tenant":"none",role:!error&&data===true?"tenant_admin":null};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});  const auth=await authClient(req);
  if(!auth)return json({error:"unauthorized"},401);
  const requestUrl=new URL(req.url),path=requestUrl.pathname.replace(/^\/membership-api/,"")||"/";
  try{
    if(req.method==="GET"&&path==="/mine"){
      const [{data:claims,error},{data:profile}]=await Promise.all([
        auth.db.from("store_claims").select("id,tenant_id,store_id,requested_role,status,applicant_note,admin_note,requested_at,reviewed_at").eq("user_id",auth.user.id).order("requested_at",{ascending:false}),
        auth.db.from("profiles").select("display_name,phone").eq("user_id",auth.user.id).maybeSingle()
      ]);
      if(error)throw error;
      const ids=(claims??[]).map((claim:any)=>claim.store_id);
      const {data:stores}=ids.length?await adminDb.from("stores").select("id,name,slug,tenant_id").in("id",ids):{data:[]};
      const map=new Map((stores??[]).map((store:any)=>[store.id,store]));
      return json({profile:profile??null,claims:(claims??[]).map((claim:any)=>({...claim,store:map.get(claim.store_id)??null}))});
    }

    if(req.method==="POST"&&path==="/claim"){
      const body=await req.json(),storeId=clip(body?.store_id,80),note=clip(body?.note,1000)||null;
      const displayName=clip(body?.display_name,100),phone=clip(body?.phone,40);
      if(!storeId)return json({error:"store_id_required"},400);
      if(!displayName||!phone)return json({error:"name_phone_required"},400);
      const {data:store}=await adminDb.from("stores").select("id,tenant_id,name,is_published").eq("id",storeId).maybeSingle();
      if(!store?.is_published)return json({error:"store_not_found"},404);
      const {data:existingMember}=await adminDb.from("store_members").select("role").eq("store_id",store.id).eq("user_id",auth.user.id).limit(1);
      if((existingMember?.length??0)>0)return json({error:"already_store_member"},409);      await adminDb.from("profiles").upsert({user_id:auth.user.id,display_name:displayName,phone},{onConflict:"user_id"});
      const {data:pending}=await adminDb.from("store_claims").select("id,status").eq("store_id",store.id).eq("user_id",auth.user.id).eq("status","pending").maybeSingle();
      if(pending)return json({claim:pending,already_pending:true});
      const {data:claim,error}=await adminDb.from("store_claims").insert({tenant_id:store.tenant_id,store_id:store.id,user_id:auth.user.id,requested_role:"store_owner",applicant_note:note,status:"pending"}).select("id,tenant_id,store_id,status,requested_at").single();
      if(error)throw error;
      await adminDb.from("audit_logs").insert({tenant_id:store.tenant_id,store_id:null,actor_user_id:auth.user.id,action:"membership.store_claim_requested",entity_type:"store_claim",entity_id:claim.id,metadata:{store_id:store.id}});
      return json({claim,store:{id:store.id,name:store.name}},201);
    }

    if(req.method==="POST"&&path==="/withdraw"){
      const body=await req.json(),claimId=clip(body?.claim_id,80);
      if(!claimId)return json({error:"claim_id_required"},400);
      const {data:claim}=await auth.db.from("store_claims").select("id,tenant_id,store_id,user_id,status").eq("id",claimId).eq("user_id",auth.user.id).maybeSingle();
      if(!claim||claim.status!=="pending")return json({error:"claim_not_withdrawable"},400);
      await adminDb.from("store_claims").update({status:"withdrawn",reviewed_at:new Date().toISOString()}).eq("id",claim.id);
      return json({ok:true,status:"withdrawn"});
    }

    if(req.method==="GET"&&path==="/pending"){
      const tenantSlug=clip(requestUrl.searchParams.get("tenant"),80);
      if(!tenantSlug)return json({error:"tenant_required"},400);
      const {data:tenant}=await adminDb.from("tenants").select("id,slug,name").eq("slug",tenantSlug).maybeSingle();
      if(!tenant)return json({error:"tenant_not_found"},404);
      const reviewer=await tenantReviewer(auth.db,auth.user.id,tenant.id);
      if(!reviewer.allowed)return json({error:"tenant_admin_required"},403);      const {data:claims,error}=await auth.db.from("store_claims").select("id,store_id,user_id,requested_role,status,applicant_note,requested_at").eq("tenant_id",tenant.id).eq("status","pending").order("requested_at");
      if(error)throw error;
      const storeIds=[...new Set((claims??[]).map((claim:any)=>claim.store_id))];
      const userIds=[...new Set((claims??[]).map((claim:any)=>claim.user_id))];
      const [{data:stores},{data:profiles}]=await Promise.all([
        storeIds.length?adminDb.from("stores").select("id,name,slug,public_address").in("id",storeIds):Promise.resolve({data:[]}),
        userIds.length?adminDb.from("profiles").select("user_id,display_name,phone").in("user_id",userIds):Promise.resolve({data:[]})
      ]);
      const storeMap=new Map((stores??[]).map((store:any)=>[store.id,store]));
      const profileMap=new Map((profiles??[]).map((profile:any)=>[profile.user_id,profile]));
      return json({tenant,reviewer:{authority:reviewer.authority,role:reviewer.role},claims:(claims??[]).map((claim:any)=>({...claim,store:storeMap.get(claim.store_id)??null,applicant:profileMap.get(claim.user_id)??null}))});
    }

    if(req.method==="POST"&&path==="/review"){
      const body=await req.json(),claimId=clip(body?.claim_id,80);
      const decision=body?.decision==="approve"?"approved":body?.decision==="reject"?"rejected":null;
      const adminNote=clip(body?.admin_note,1000)||null;
      if(!claimId||!decision)return json({error:"claim_and_decision_required"},400);
      const {data:claim}=await adminDb.from("store_claims").select("id,tenant_id,store_id,user_id,status").eq("id",claimId).maybeSingle();
      if(!claim||claim.status!=="pending")return json({error:"claim_not_pending"},400);
      const reviewer=await tenantReviewer(auth.db,auth.user.id,claim.tenant_id);
      if(!reviewer.allowed)return json({error:"tenant_admin_required"},403);
      if(decision==="approved"){
        const {error:storeMemberError}=await adminDb.from("store_members").upsert({store_id:claim.store_id,user_id:claim.user_id,role:"store_owner"},{onConflict:"store_id,user_id,role"});
        if(storeMemberError)throw storeMemberError;        const {error:tenantMemberError}=await adminDb.from("tenant_members").upsert({tenant_id:claim.tenant_id,user_id:claim.user_id,role:"member",status:"active"},{onConflict:"tenant_id,user_id,role"});
        if(tenantMemberError)throw tenantMemberError;
      }
      await adminDb.from("store_claims").update({status:decision,admin_note:adminNote,reviewed_by:auth.user.id,reviewed_at:new Date().toISOString()}).eq("id",claim.id);
      await adminDb.from("audit_logs").insert({
        tenant_id:claim.tenant_id,
        store_id:null,
        actor_user_id:auth.user.id,
        action:decision==="approved"?"membership.store_claim_approved":"membership.store_claim_rejected",
        entity_type:"store_claim",
        entity_id:claim.id,
        metadata:{store_id:claim.store_id,user_id:claim.user_id,reviewer_authority:reviewer.authority,reviewer_role:reviewer.role}
      });
      return json({ok:true,status:decision,reviewer:{authority:reviewer.authority,role:reviewer.role}});
    }

    return json({error:"not_found"},404);
  }catch(error){
    console.error("membership-api",error);
    return json({error:"membership_api_failed"},500);
  }
});
