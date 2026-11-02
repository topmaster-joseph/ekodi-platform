import {maskLoginEmail,mutationGate,recentStepUp,requireMutationReason,UUID_PATTERN,siteMayView} from "./admin-person-security.ts";

// All database calls use server-side service credentials; no caller-supplied role or site is trusted.
// The caller's access token is verified by identity-api before entering this handler.
export function createIdentityAdminHandler(deps:{
  db:any;
  json:(req:Request,body:unknown,status?:number)=>Response;
  verifyGoogle:(credential:string,nonce:string)=>Promise<any>;
  sha256:(nonce:string)=>Promise<string>;
  googleClientId:string;
}){
  const {db,json,verifyGoogle,sha256,googleClientId}=deps;
  const bootstrap=new Set(["topmaster.joseph@gmail.com","joseph@ekodi.kr"]);
  const roles=new Set(["tenant_admin","site_admin","admin","owner"]);
  const normalized=(v:unknown)=>String(v||"").trim().toLowerCase();
  const noError=(r:any)=>{if(r.error)throw r.error;return r.data;};
  const unique=(values:any[])=>[...new Set(values.filter(Boolean))];
  const contactLink="https://ekodi.kr/auth/?manage=1";

  async function account(userId:string){
    const data=noError(await db.rpc("ekodi_account_for_auth_user",{p_auth_user_id:userId}));
    return data&&typeof data==="object"?data:null;
  }
  async function access(userId:string){
    const a=await account(userId);
    if(!a?.person_id)return {platform:false,allowed:false,tenantIds:[],siteKeys:[],personId:null};
    const ids=unique(Array.isArray(a.auth_user_ids)?a.auth_user_ids:[userId]);
    const emails=unique((Array.isArray(a.verified_emails)?a.verified_emails:[]).map(normalized));
    const googleRows=noError(await db.from("login_identities").select("email")
      .eq("person_id",a.person_id).eq("provider","google").eq("email_verified",true).eq("status","active"))||[];
    const googleEmails=googleRows.map((r:any)=>normalized(r.email)).filter((e:string)=>emails.includes(e));
    let platform=false;
    if(googleEmails.length){
      const privileged=noError(await db.from("profiles").select("platform_admin").in("user_id",ids)
        .eq("platform_admin",true).limit(1))||[];
      platform=privileged.length>0||googleEmails.some((email:string)=>bootstrap.has(email));
    }
    if(platform)return {platform:true,allowed:true,tenantIds:[],siteKeys:[],personId:a.person_id};
    const [members,grants]=await Promise.all([
      ids.length?db.from("tenant_members").select("tenant_id,role,status").in("user_id",ids)
        .eq("status","active"):Promise.resolve({data:[],error:null}),
      emails.length?db.from("site_access_registry").select("tenant_id,site_key,role,status")
        .in("email",emails).eq("status","active"):Promise.resolve({data:[],error:null})
    ]);
    const tenantIds=unique((noError(members)||[]).filter((r:any)=>roles.has(normalized(r.role))).map((r:any)=>r.tenant_id));
    const grantsValid=(noError(grants)||[]).filter((r:any)=>roles.has(normalized(r.role)));
    const siteKeys=unique(grantsValid.map((r:any)=>r.site_key));
    // A site-key grant does not implicitly authorize viewing every tenant member.
    // Only an explicit tenant-admin membership grants tenant-wide member visibility.
    return {platform:false,allowed:Boolean(tenantIds.length||siteKeys.length),tenantIds,siteKeys,personId:a.person_id};
  }

  async function visiblePerson(personId:string,scope:any){
    if(scope.platform)return true;
    if(!scope.allowed)return false;
    const rows=noError(await db.from("login_identities")
      .select("auth_user_id,email,email_verified").eq("person_id",personId).eq("status","active"))||[];
    if(!rows.length)return false;
    const userIds=unique(rows.map((r:any)=>r.auth_user_id));
    const verifiedEmails=unique(rows.filter((r:any)=>r.email_verified).map((r:any)=>normalized(r.email)));
    const [members,grants]=await Promise.all([
      scope.tenantIds.length?db.from("tenant_members").select("user_id").in("user_id",userIds)
        .in("tenant_id",scope.tenantIds).eq("status","active"):Promise.resolve({data:[],error:null}),
      scope.siteKeys.length&&verifiedEmails.length?db.from("site_access_registry").select("email")
        .in("site_key",scope.siteKeys).in("email",verifiedEmails).eq("status","active"):Promise.resolve({data:[],error:null})
    ]);
    return siteMayView({userIds,verifiedEmails},{
      userIds:(noError(members)||[]).map((r:any)=>r.user_id),
      emails:(noError(grants)||[]).map((r:any)=>r.email)
    });
  }

  async function personSummary(id:string,scope:any){
    if(!await visiblePerson(id,scope))return null;
    const person=noError(await db.from("people").select("id,ekodi_id,display_name,status").eq("id",id).maybeSingle());
    if(!person)return null;
    return {id:person.id,ekodiId:person.ekodi_id,displayName:person.display_name||"이름 없음",status:person.status};
  }
  async function identities(req:Request,id:string,scope:any){
    const person=await personSummary(id,scope);
    if(!person)return json(req,{error:"person_not_found"},404);
    const list=noError(await db.from("login_identities")
      .select("id,provider,email,is_primary,status,linked_at,last_seen_at")
      .eq("person_id",id).order("linked_at",{ascending:true}))||[];
    const mergeRows=scope.platform?(noError(await db.from("person_merge_requests")
      .select("id,status,executed_at,absorbed_person_id").eq("survivor_person_id",id)
      .eq("status","executed").order("executed_at",{ascending:false}).limit(10))||[]):[];
    return json(req,{ok:true,person,canManage:scope.platform,manageLink:contactLink,
      identities:list.map((row:any)=>({id:row.id,provider:row.provider,email:maskLoginEmail(row.email),
        isPrimary:row.is_primary,status:row.status,linkedAt:row.linked_at,lastSeenAt:row.last_seen_at})),
      merges:mergeRows.map((r:any)=>({id:r.id,status:r.status,executedAt:r.executed_at}))});
  }

  async function search(req:Request,scope:any){
    const q=(new URL(req.url).searchParams.get("query")||"").trim();
    if(q.length<3||q.length>100)return json(req,{error:"query_length_invalid"},400);
    // Avoid wildcard-based full enumeration; results remain bounded and then scope-filtered.
    const like="%"+q.replace(/[%,()]/g,"")+"%";
    const [names,ekodiIds,emails]=await Promise.all([
      db.from("people").select("id").ilike("display_name",like).limit(30),
      db.from("people").select("id").ilike("ekodi_id",like).limit(30),
      db.from("login_identities").select("person_id").ilike("email",like).limit(30)
    ]);
    const ids=unique([...(noError(names)||[]).map((x:any)=>x.id),...(noError(ekodiIds)||[]).map((x:any)=>x.id),
      ...(noError(emails)||[]).map((x:any)=>x.person_id)]).slice(0,30);
    const results=[];
    for(const id of ids){const result=await personSummary(id,scope);if(result)results.push(result);if(results.length>=20)break;}
    return json(req,{ok:true,people:results,canManage:scope.platform,limited:true});
  }

  async function stepUpChallenge(req:Request,userId:string){
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    noError(await db.from("identity_challenges").insert({nonce_hash:await sha256(nonce),
      expires_at:expiresAt,purpose:"admin_step_up",provider:"google",initiator_user_id:userId}));
    return json(req,{ok:true,nonce,clientId:googleClientId,expiresAt});
  }
  async function stepUpVerify(req:Request,userId:string){
    const body=await req.json().catch(()=>null);
    if(!/^[a-f0-9]{48}$/.test(String(body?.nonce||""))||typeof body?.credential!=="string")
      return json(req,{error:"google_step_up_invalid"},400);
    const nonceHash=await sha256(body.nonce);
    const challenge=noError(await db.from("identity_challenges").select("nonce_hash")
      .eq("nonce_hash",nonceHash).eq("initiator_user_id",userId).eq("provider","google")
      .eq("purpose","admin_step_up").gt("expires_at",new Date().toISOString()).maybeSingle());
    if(!challenge)return json(req,{error:"google_step_up_expired"},401);
    let profile;
    try{profile=await verifyGoogle(body.credential,body.nonce);}
    catch{return json(req,{error:"google_step_up_invalid"},401);}
    if(profile.emailVerified!==true)return json(req,{error:"google_email_not_verified"},403);
    const a=await account(userId);
    const verifiedEmail=normalized(profile.email);
    const rows=noError(await db.from("login_identities").select("id,email").eq("person_id",a?.person_id||"")
      .eq("provider","google").eq("provider_subject",profile.subject)
      .eq("email_verified",true).eq("status","active"))||[];
    if(!rows.some((r:any)=>normalized(r.email)===verifiedEmail))
      return json(req,{error:"google_person_mismatch"},403);
    // One-time challenge prevents an old Google assertion being replayed.
    const consumed=noError(await db.from("identity_challenges").delete().eq("nonce_hash",nonceHash)
      .eq("initiator_user_id",userId).eq("purpose","admin_step_up")
      .select("nonce_hash").maybeSingle());
    if(!consumed)return json(req,{error:"google_step_up_already_used"},401);
    const issuedAt=new Date().toISOString();
    noError(await db.from("identity_admin_step_ups").upsert({auth_user_id:userId,
      verified_person_id:a.person_id,session_hash:await sha256(req.headers.get("Authorization")||""),
      verified_at:issuedAt},{onConflict:"auth_user_id"}));
    return json(req,{ok:true,verifiedAt:issuedAt,expiresInSeconds:900});
  }
  async function freshGoogle(req:Request,userId:string,personId:string){
    const proof=noError(await db.from("identity_admin_step_ups").select("verified_at,verified_person_id,session_hash")
      .eq("auth_user_id",userId).maybeSingle());
    return Boolean(proof?.verified_person_id===personId
      &&proof.session_hash===await sha256(req.headers.get("Authorization")||"")
      &&recentStepUp(new Date(proof.verified_at).getTime()));
  }
  async function notification(personId:string,kind:string){
    const rows=noError(await db.from("login_identities").select("email,email_verified")
      .eq("person_id",personId).eq("status","active").eq("email_verified",true))||[];
    const email=rows.map((x:any)=>normalized(x.email)).find((s:string)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)&&!s.includes("noreply"));
    const apiKey=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("EKODI_IDENTITY_NOTICE_FROM");
    let delivery="confirmation_required";
    if(email&&apiKey&&from){
      try{
        const response=await fetch("https://api.resend.com/emails",{
          method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
          body:JSON.stringify({from,to:[email],subject:"EKODI 로그인 수단 변경 안내",
            text:kind==="guide"?"EKODI 로그인 수단 연결 안내: "+contactLink:
              "EKODI 계정의 "+(kind==="disconnect"?"로그인 수단이 해제되었습니다.":"계정 합치기가 되돌려졌습니다.")+
              "\n본인이 요청하지 않았다면 EKODI 관리자에게 즉시 문의해 주십시오.\n"+contactLink})});
        if(response.ok)delivery="sent";
      }catch{/* Delivery is explicitly reported as unconfirmed; never hide it. */}
    }
    const audit=await db.from("identity_audit_logs").insert({person_id:personId,
      action:"identity.admin_notification",metadata:{event:kind,delivery,channel:email?"email":"none"}});
    if(audit.error)console.error("identity notification audit failed");
    return delivery;
  }

  async function sendGuide(req:Request,scope:any,id:string){
    if(!scope.platform)return json(req,{error:"platform_admin_required"},403);
    if(!await personSummary(id,scope))return json(req,{error:"person_not_found"},404);
    const status=await notification(id,"guide");
    return json(req,{ok:status==="sent",notification:status,requiresConfirmation:status!=="sent"});
  }
  async function unlink(req:Request,userId:string,scope:any,id:string){
    if(!scope.platform)return json(req,{error:"platform_admin_required"},403);
    const body=await req.json().catch(()=>null),reason=requireMutationReason(body?.reason);
    if(!reason)return json(req,{error:"reason_required"},400);
    const row=noError(await db.from("login_identities")
      .select("id,person_id,is_primary,status").eq("id",id).eq("status","active").maybeSingle());
    if(!row)return json(req,{error:"identity_not_found"},404);
    // Supabase count lives on the result envelope, not data.
    const countResult=await db.from("login_identities").select("id",{count:"exact",head:true})
      .eq("person_id",row.person_id).eq("status","active");
    if(countResult.error)throw countResult.error;
    const gate=mutationGate({platform:scope.platform,recentGoogle:await freshGoogle(req,userId,scope.personId),
      reason,activeCount:countResult.count||0,isPrimary:row.is_primary});
    if(gate)return json(req,{error:gate.error},gate.status);
    const result=noError(await db.rpc("admin_disconnect_person_identity",{
      p_identity:id,p_actor:userId,p_reason:reason}));
    if(result?.ok!==true)return json(req,{error:result?.error||"identity_disconnect_failed"},
      result?.error==="reason_required"?400:result?.error==="identity_not_found"?404:409);
    const notices=await Promise.all([row.person_id,result.newPersonId]
      .filter(Boolean).map((id:string)=>notification(id,"disconnect")));
    const notice=notices.every(x=>x==="sent")?"sent":"confirmation_required";
    return json(req,{ok:true,newPersonId:result.newPersonId,notification:notice,
      requiresConfirmation:notice!=="sent"});
  }
  async function revert(req:Request,userId:string,scope:any,id:string){
    if(!scope.platform)return json(req,{error:"platform_admin_required"},403);
    const body=await req.json().catch(()=>null),reason=requireMutationReason(body?.reason);
    if(!reason)return json(req,{error:"reason_required"},400);
    if(!await freshGoogle(req,userId,scope.personId))return json(req,{error:"google_step_up_required"},401);
    const row=noError(await db.from("person_merge_requests")
      .select("survivor_person_id,absorbed_person_id,status").eq("id",id).maybeSingle());
    if(!row)return json(req,{error:"merge_request_not_found"},404);
    const result=noError(await db.rpc("admin_person_merge_revert",{
      p_request:id,p_actor:userId,p_reason:reason}));
    if(result?.ok!==true)return json(req,{error:result?.error||"merge_revert_failed"},409);
    const statuses=await Promise.all([row.survivor_person_id,row.absorbed_person_id].map(p=>notification(p,"revert")));
    return json(req,{ok:true,restored:result.restored,notification:
      statuses.every(x=>x==="sent")?"sent":"confirmation_required"});
  }

  return async function handle(req:Request,userId:string,path:string):Promise<Response>{
    const scope=await access(userId);
    if(!scope.allowed)return json(req,{error:"admin_access_required"},403);
    if(req.method==="GET"&&path==="/admin/persons")return search(req,scope);
    if(req.method==="POST"&&path==="/admin/step-up/challenge"){
      if(!scope.platform)return json(req,{error:"platform_admin_required"},403);
      return stepUpChallenge(req,userId);
    }
    if(req.method==="POST"&&path==="/admin/step-up/verify"){
      if(!scope.platform)return json(req,{error:"platform_admin_required"},403);
      return stepUpVerify(req,userId);
    }
    const view=path.match(/^\/admin\/persons\/([0-9a-f-]{36})\/identities$/i);
    if(req.method==="GET"&&view&&UUID_PATTERN.test(view[1]))return identities(req,view[1],scope);
    const guide=path.match(/^\/admin\/persons\/([0-9a-f-]{36})\/send-link$/i);
    if(req.method==="POST"&&guide&&UUID_PATTERN.test(guide[1]))return sendGuide(req,scope,guide[1]);
    const del=path.match(/^\/admin\/identities\/([0-9a-f-]{36})$/i);
    if(req.method==="DELETE"&&del&&UUID_PATTERN.test(del[1]))return unlink(req,userId,scope,del[1]);
    const undo=path.match(/^\/admin\/merge-requests\/([0-9a-f-]{36})\/revert$/i);
    if(req.method==="POST"&&undo&&UUID_PATTERN.test(undo[1]))return revert(req,userId,scope,undo[1]);
    return json(req,{error:"not_found"},404);
  };
}
