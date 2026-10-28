import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_KINDS={
  business_registration:"사업자등록증",
  bank_account_copy:"통장 사본",
  organization_registration:"고유번호증·단체등록증",
  license:"인허가·자격증",
  other_redacted:"기타 가림 처리된 증빙"
};
const $=(node,selector)=>node.querySelector(selector);
const text=(node,str)=>{node.textContent=str;};
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const endpoint=(url)=>String(url||"").replace(/\/$/,"")+"/functions/v1/secure-documents-api";
const sessionProvider=(opts)=>{
 const cfg=opts.config||window.EKODI_MY_CONFIG||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)return null;
 const db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true}});
 return {url:endpoint(cfg.supabaseUrl),key:cfg.supabasePublishableKey,
   token:async()=>{const {data}=await db.auth.getSession();return data.session?.access_token||"";}};
};
export async function mountSecureDocuments(root,opts={}){
 if(!root||root.dataset.secureDocumentsMounted)return;
 root.dataset.secureDocumentsMounted="true";
 const scope=opts.scope==="workspace"?"workspace":"person";
 const workspaceId=scope==="workspace"?String(opts.workspaceId||""):"";
 const context=sessionProvider(opts);
 root.innerHTML=`<section class="ekodi-secure-documents" aria-label="에코디 보안문서 관리">
  <div class="secure-head"><div><p class="secure-kicker">EKODI SECURE DOCUMENTS · CORE</p><h2>보안문서</h2><p>원본과 공유권한은 서로 분리하여 관리합니다.</p></div><span class="secure-status" data-state>상태 확인 중</span></div>
  <p class="secure-info" data-message role="status" aria-live="polite">민감 문서는 허가된 보안 저장소에서만 처리합니다.</p>
  <div data-content hidden>
    <div class="secure-actions"><button type="button" data-refresh>새로고침</button><span>${scope==="person"?"개인 문서":"조직 문서"}</span></div>
    <div data-list aria-live="polite"></div>
    <form data-upload>
      <h3>새 문서 등록</h3>
      <label>문서 종류 <select name="kind">${Object.entries(DEFAULT_KINDS).map(([id,label])=>`<option value="${id}">${label}</option>`).join("")}</select></label>
      <label>문서명 <input name="title" maxlength="120" required placeholder="예: 사업자등록증 최신본"></label>
      <label>발급일 <input name="issued_on" type="date"></label>
      <label>유효기간 (해당할 경우) <input name="valid_until" type="date"></label>
      <label>PDF 또는 이미지 <input name="file" required type="file" accept="application/pdf,image/png,image/jpeg,image/webp"></label>
      <label class="secure-check"><input type="checkbox" name="redacted_for_sharing" value="true"> 공유용 가림 처리가 완료된 문서입니다 (검증 없이는 공유되지 않음)</label>
      <button type="submit">안전하게 등록</button>
      <small>5MB 이하 · 신분증 및 주민등록번호 노출 문서 업로드 금지 · MFA 재인증 필요</small>
    </form>
  </div>
 </section>`;
 const status=$(root,"[data-state]"),message=$(root,"[data-message]"),content=$(root,"[data-content]"),list=$(root,"[data-list]");
 const tell=(msg)=>text(message,msg);
 async function request(action,{method="GET",data=null,binary=false,params={}}={}){
   if(!context)throw new Error("중앙 인증 환경이 연결되지 않았습니다.");
   const bearer=await context.token();
   if(!bearer)throw new Error("로그인 후 이용할 수 있습니다.");
   const qs=new URLSearchParams({action});
   if(action==="list"){qs.set("scope",scope);if(workspaceId)qs.set("workspace_id",workspaceId);}
   for(const [key,value] of Object.entries(params))if(value!=null)qs.set(key,String(value));
   const isForm=data instanceof FormData;
   const response=await fetch(context.url+"?"+qs,{method,headers:{apikey:context.key,authorization:"Bearer "+bearer,...(!isForm&&data?{"content-type":"application/json"}:{})},body:data?(isForm?data:JSON.stringify(data)):undefined,cache:"no-store",credentials:"omit"});
   if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error?.error||"문서 요청을 처리하지 못했습니다.");}
   return binary?response.blob():response.json();
 }
 async function refresh(){
   const records=(await request("list")).records||[];
   if(!records.length){list.innerHTML='<p class="secure-empty">등록한 문서가 없습니다.</p>';return;}
   list.innerHTML=records.map(d=>`<article class="secure-doc" data-id="${esc(d.id)}"><div><strong>${esc(d.title)}</strong><small>${esc(DEFAULT_KINDS[d.kind]||d.kind)} · ${esc(d.status)} · 등록 ${esc(String(d.created_at||"").slice(0,10))}${d.issued_on?" · 발급 "+esc(d.issued_on):""}${d.valid_until?" · 유효 "+esc(d.valid_until):""}</small></div><div class="secure-row-actions">${d.status==="deletion_pending"?(d.storage_purged_at?'<span class="secure-deletion-pending">저장소 삭제 확인 · 백업 보존 확인 대기</span>':'<span class="secure-deletion-pending">삭제 요청됨 · 접근 차단 · 물리삭제 확인 대기</span>'):'<button type="button" data-read>내 원본 열기</button><button type="button" data-share>기간제 공유</button><button type="button" data-shares>공유내역·철회</button><button type="button" data-delete-request>삭제 요청</button>'}</div><div class="secure-share-list" data-share-list hidden></div></article>`).join("");
 }
 const openBlob=(blob)=>{
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement("a");anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";anchor.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 async function run(action){
   try{tell("보안 요청을 확인하고 있습니다.");await action();tell("처리가 완료되었습니다.");}
   catch(error){tell(error?.message||"보안 요청에 실패했습니다.");}
 }
 async function openShareToken(tokenValue){
   if(!tokenValue)return;
   // The token was removed from browser history before the service status request.
   if(!/^[a-f0-9]{64}$/.test(tokenValue)){tell("공유 주소가 올바르지 않습니다.");return;}
   await run(async()=>{const blob=await request("open",{method:"POST",data:{token:tokenValue},binary:true});openBlob(blob);});
 }
 async function startup(){
   const shareToken=new URLSearchParams(location.hash.slice(1)).get("share");
   if(shareToken)history.replaceState(null,"",location.pathname+location.search);
   if(!context){text(status,"인증 연결 필요");tell("서비스 설정을 확인할 수 없습니다.");return;}
   try{
     const statusResponse=await fetch(context.url+"?action=status",{cache:"no-store"});
     const state=await statusResponse.json();
     if(!state.active){text(status,"보안 검토 중");tell("안전성·개인정보 처리·암호화·삭제 검증 전까지 원본 보관과 외부 공유를 비활성화합니다.");return;}
     if(scope==="workspace"&&!/^[a-f0-9-]{36}$/i.test(workspaceId)){text(status,"조직 지정 필요");tell("사이트 운영주체의 고유 ID가 필요합니다.");return;}
     text(status,"사용 가능");content.hidden=false;
     await run(refresh);
     if(shareToken)await openShareToken(shareToken);
   }catch{ text(status,"연결 확인 필요");tell("보안 서비스를 확인할 수 없습니다.");}
 }
 $(root,"[data-refresh]").addEventListener("click",()=>run(refresh));
 $(root,"[data-upload]").addEventListener("submit",event=>{event.preventDefault();run(async()=>{
   const data=new FormData(event.currentTarget);
   data.set("scope",scope);if(workspaceId)data.set("workspace_id",workspaceId);
   await request("upload",{method:"POST",data});
   event.currentTarget.reset();await refresh();
 });});
 list.addEventListener("click",event=>{
   const btn=event.target.closest("button"),doc=btn?.closest("[data-id]")?.dataset.id;
   if(!doc)return;
   if(btn.matches("[data-shares]"))run(async()=>{
     const target=btn.closest("[data-id]").querySelector("[data-share-list]");
     if(!target.hidden){target.hidden=true;return;}
     const response=await request("shares",{params:{document_id:doc}});
     const shares=response.shares||[];
     target.innerHTML=shares.length?shares.map(s=>`<p><span>공유 ${esc(String(s.created_at||"").slice(0,16).replace("T"," "))} · 만료 ${esc(String(s.expires_at||"").slice(0,16).replace("T"," "))} · ${esc(s.status)} · 열람 ${Number(s.view_count)||0}/${Number(s.max_views)||1}</span>${s.status==="active"?`<button type="button" data-revoke data-share-id="${esc(s.id)}">즉시 철회</button>`:""}</p>`).join(""):"<p>공유내역이 없습니다.</p>";
     target.hidden=false;
   });
   if(btn.matches("[data-delete-request]"))run(async()=>{
     if(!confirm("이 문서의 열람·공유를 즉시 차단하고 삭제 처리를 요청합니까? 물리삭제·백업삭제 완료를 의미하지 않습니다."))return;
     const result=await request("delete_request",{method:"POST",data:{document_id:doc}});
     if(!result?.deletion_pending)throw new Error("삭제 요청 상태를 확인하지 못했습니다.");
     await refresh();
     tell("문서 접근을 차단했습니다. 원본 및 백업 정리는 보관 의무 검토 후 별도 확인됩니다.");
   });
   if(btn.matches("[data-revoke]"))run(async()=>{
     if(!confirm("이 공유권한을 즉시 철회합니까? 이미 내려받은 사본은 회수할 수 없습니다."))return;
     await request("revoke",{method:"POST",data:{share_id:btn.dataset.shareId}});
     btn.closest("[data-share-list]").hidden=true;
   });
   if(btn.matches("[data-read]"))run(async()=>openBlob(await request("read",{method:"POST",data:{document_id:doc},binary:true})));
   if(btn.matches("[data-share]"))run(async()=>{
     const email=prompt("공유받을 사람의 로그인 이메일을 입력하세요.");if(!email)return;
     const hours=Number(prompt("공유기간 (시간 단위, 1~168)", "24"));if(!hours)return;
     const output=await request("share",{method:"POST",data:{document_id:doc,recipient_email:email,hours,max_views:1}});
     tell("공유주소가 생성되었습니다. 별도 인증이 필요한 수신자에게만 전달하세요.");
     if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(output.url);
     else prompt("공유주소를 복사하세요.",output.url);
   });
 });
 await startup();
 return {refresh,scope,workspaceId};
}
