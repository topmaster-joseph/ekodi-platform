import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// EKODI Secure Documents: server-encrypted, owner/recipient-bound, fail-closed.
const BUCKET="secure-documents-private";
const MAX_BYTES=5*1024*1024;
const KINDS=new Set(["business_registration","bank_account_copy","organization_registration","license","other_redacted"]);
const MIME=new Set(["application/pdf","image/png","image/jpeg","image/webp"]);
const baseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const publishable=Deno.env.get("SUPABASE_ANON_KEY")||"";
const enabled=()=>Deno.env.get("SECURE_DOCUMENTS_ACTIVE")==="true"
  && Deno.env.get("SECURE_DOCUMENTS_LEGAL_APPROVED")==="true"
  && Deno.env.get("SECURE_DOCUMENTS_SCAN_APPROVED")==="true"
  && !!Deno.env.get("SECURE_DOCUMENT_MASTER_KEY_B64")
  && !!Deno.env.get("SECURE_DOCUMENT_RECIPIENT_HMAC_B64")
  && !!Deno.env.get("SECURE_DOCUMENT_SCAN_ENDPOINT")
  && !!Deno.env.get("SECURE_DOCUMENT_SCAN_TOKEN");
const admin=baseUrl&&serviceKey?createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const bytes64=(value)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value||""));
const str=(value,n)=>String(value??"").trim().slice(0,n);
function headers(req){
  const origin=req.headers.get("origin")||"";
  const allowed=new Set(["https://ekodi.kr",...(Deno.env.get("SECURE_DOCUMENTS_ALLOWED_ORIGINS")||"").split(",").map(x=>x.trim()).filter(Boolean)]);
  return {...(allowed.has(origin)?{"access-control-allow-origin":origin}:{}),"vary":"Origin","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff","x-robots-tag":"noindex,nofollow,noarchive"};
}
function json(req,data,status=200){return new Response(JSON.stringify(data),{status,headers:{...headers(req),"content-type":"application/json; charset=utf-8"}});}
function deny(req,error,status=403){return json(req,{ok:false,error},status);}
function originAllowed(req){
 const origin=req.headers.get("origin");
 return !origin||origin==="https://ekodi.kr"||(Deno.env.get("SECURE_DOCUMENTS_ALLOWED_ORIGINS")||"").split(",").map(x=>x.trim()).includes(origin);
}
function token(req){const value=req.headers.get("authorization")||"";return /^Bearer\s+/i.test(value)?value.replace(/^Bearer\s+/i,"").trim():"";}
function jwtPayload(value){try{const part=value.split(".")[1];return JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/")));}catch{return {};}}
async function auth(req){
 const jwt=token(req);
 if(!jwt||jwt.length>8192||!admin)return null;
 const {data,error}=await admin.auth.getUser(jwt);
 const user=data?.user;
 if(error||!user?.id||!user?.email||!user?.email_confirmed_at)return null;
 const {data:account,error:accountError}=await admin.rpc("ekodi_account_for_auth_user",{p_auth_user_id:user.id});
 if(accountError||!account?.person_id||!Array.isArray(account.verified_emails)||!account.verified_emails.length)return null;
 const identities=Array.isArray(account.auth_user_ids)?account.auth_user_ids.filter(uuid):[];
 const claims=jwtPayload(jwt); // JWT already verified through Auth getUser, never from the browser alone
 const recentMfa=Array.isArray(claims.amr)&&claims.amr.some(entry=>
   ["totp","phone","webauthn"].includes(String(entry?.method||""))
   && Number.isFinite(Number(entry?.timestamp))
   && (Date.now()/1000-Number(entry.timestamp))>=0
   && (Date.now()/1000-Number(entry.timestamp))<=900);
 return {userId:user.id,personId:account.person_id,identities:identities.length?identities:[user.id],email:user.email.toLowerCase(),aal2:claims.aal==="aal2"&&recentMfa};
}
async function permit(who,scope,workspaceId){
 if(scope==="person")return {ownerScope:"person",ownerPersonId:who.personId,workspaceId:null};
 if(scope!=="workspace"||!uuid(workspaceId)||!admin)return null;
 const {data:tenant,error:tenantError}=await admin.from("tenants").select("id,status").eq("id",workspaceId).maybeSingle();
 if(tenantError||!tenant||tenant.status!=="active")return null;
 // Platform-global administrators have NO implicit document access.
 const {data, error}=await admin.from("tenant_members").select("role").eq("tenant_id",workspaceId).eq("status","active").in("user_id",who.identities).eq("role","tenant_admin").limit(1);
 return !error&&data?.length?{ownerScope:"workspace",ownerPersonId:null,workspaceId}:null;
}
async function requireRecord(who,documentId){
 if(!uuid(documentId)||!admin)return null;
 const {data}=await admin.from("secure_document_records").select("*").eq("id",documentId).neq("status","deleted").maybeSingle();
 if(!data)return null;
 const allowed=await permit(who,data.owner_scope,data.workspace_id);
 if(!allowed||data.owner_scope==="person"&&data.owner_person_id!==who.personId)return null;
 return data;
}
async function audit(event,actor,doc=null,share=null,status="success"){
 // Fail closed at the caller only for critical mutations, but never log tokens or content.
 if(!admin)return;
 await admin.from("secure_document_access_audit").insert({document_id:doc,share_id:share,actor_person_id:actor,event_type:event,status});
}
async function sha256(bytes){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));}
async function recipientMac(email){
 const raw=Deno.env.get("SECURE_DOCUMENT_RECIPIENT_HMAC_B64")||"";
 const keyBytes=bytes64(raw);
 if(keyBytes.length!==32)throw new Error("recipient_mac_key_missing");
 const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(email.trim().toLowerCase()))));
}
async function itemKey(id,version,salt){
 const bytes=bytes64(Deno.env.get("SECURE_DOCUMENT_MASTER_KEY_B64")||"");
 if(bytes.length!==32)throw new Error("document_encryption_key_missing");
 const master=await crypto.subtle.importKey("raw",bytes,"HKDF",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt,info:enc.encode("ekodi.secure-documents.v1:"+id+":"+version)},master,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function aad(record,version,mime){
 return enc.encode(JSON.stringify([record.owner_scope,record.owner_person_id||record.workspace_id,record.id,version,mime]));
}
async function encrypt(data,record,version,mime){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await itemKey(record.id,version,salt);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(record,version,mime)},key,data));
 return {cipher,meta:{scheme:"AES-256-GCM-HKDF-SHA256",iv:b64(iv),salt:b64(salt),key_version:"v1"}};
}
async function decrypt(cipher,record,version){
 const meta=version.cipher_metadata;
 if(meta?.scheme!=="AES-256-GCM-HKDF-SHA256"||meta.key_version!=="v1")throw new Error("cipher_schema_unsupported");
 const iv=bytes64(meta.iv),salt=bytes64(meta.salt);
 if(iv.length!==12||salt.length!==16)throw new Error("cipher_metadata_invalid");
 const key=await itemKey(record.id,version.id,salt);
 return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:aad(record,version.id,version.mime_type)},key,cipher));
}
function fileLooksValid(data,mime){
 if(mime==="application/pdf")return data.length>=5&&[37,80,68,70,45].every((x,i)=>data[i]===x);
 if(mime==="image/png")return data.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>data[i]===x);
 if(mime==="image/jpeg")return data.length>=4&&data[0]===255&&data[1]===216&&data.at(-2)===255&&data.at(-1)===217;
 return mime==="image/webp"&&data.length>=12&&String.fromCharCode(...data.slice(0,4))==="RIFF"&&String.fromCharCode(...data.slice(8,12))==="WEBP";
}
async function scan(bytes,mime){
 const scanUrl=Deno.env.get("SECURE_DOCUMENT_SCAN_ENDPOINT")||"";
 const key=Deno.env.get("SECURE_DOCUMENT_SCAN_TOKEN")||"";
 let target;
 try{target=new URL(scanUrl);}catch{return false;}
 // Prevent inadvertent forwarding of sensitive bytes to arbitrary public scanners.
 if(target.protocol!=="https:"||!target.hostname.endsWith(".ekodi.kr")||!key)return false;
 const response=await fetch(scanUrl,{method:"POST",headers:{"content-type":"application/octet-stream","x-scanner-token":key,"x-file-mime":mime},body:bytes,signal:AbortSignal.timeout(10000)});
 const result=await response.json().catch(()=>null);
 return response.ok&&result?.verdict==="clean"&&result?.engine_verified===true&&result?.pii_safe===true?result:null;
}
async function latestVersion(documentId){
 const {data,error}=await admin.from("secure_document_versions").select("*").eq("document_id",documentId).eq("state","active").order("version_number",{ascending:false}).limit(1).maybeSingle();
 if(error)throw error;
 return data;
}
async function readEncrypted(req,record,version){
 const {data,error}=await admin.storage.from(BUCKET).download(version.storage_key);
 if(error||!data)throw new Error("ciphertext_unavailable");
 const cipher=new Uint8Array(await data.arrayBuffer());
 if(await sha256(cipher)!==version.cipher_sha256)throw new Error("cipher_integrity_failure");
 const raw=await decrypt(cipher,record,version);
 return new Response(raw,{status:200,headers:{...headers(req),"content-type":version.mime_type,"content-length":String(raw.length),"content-disposition":"inline; filename=\"ekodi-secure-document\"","content-security-policy":"default-src 'none'; sandbox","x-content-type-options":"nosniff"}});
}
async function handleList(req,who,search){
 const scope=search.get("scope")||"person";
 const wid=search.get("workspace_id");
 const scopeGrant=await permit(who,scope,wid);
 if(!scopeGrant)return deny(req,"SCOPE_FORBIDDEN");
 let query=admin.from("secure_document_records").select("id,kind,title,status,issued_on,valid_until,created_at,updated_at").eq("owner_scope",scope).neq("status","deleted").order("created_at",{ascending:false}).limit(100);
 query=scope==="person"?query.eq("owner_person_id",who.personId):query.eq("workspace_id",wid);
 const {data,error}=await query;
 if(error)return deny(req,"LIST_UNAVAILABLE",503);
 return json(req,{ok:true,records:data||[]});
}
async function handleUpload(req,who){
 if(!who.aal2)return deny(req,"STEP_UP_REQUIRED");
 const len=Number(req.headers.get("content-length")||0);
 if(len>MAX_BYTES+50000)return deny(req,"FILE_TOO_LARGE",413);
 if(!Deno.env.get("SECURE_DOCUMENT_MASTER_KEY_B64")||!Deno.env.get("SECURE_DOCUMENT_SCAN_ENDPOINT"))return deny(req,"SECURE_UPLOAD_UNAVAILABLE",503);
 const form=await req.formData();
 const kind=str(form.get("kind"),60),title=str(form.get("title"),120),scope=str(form.get("scope"),12),wid=str(form.get("workspace_id"),50);
 const file=form.get("file");
 if(!KINDS.has(kind)||!title||!(file instanceof File)||file.size<1||file.size>MAX_BYTES)return deny(req,"UPLOAD_INVALID",400);
 const owner=await permit(who,scope,wid);
 if(!owner)return deny(req,"SCOPE_FORBIDDEN");
 const mime=str(file.type,80);
 if(!MIME.has(mime))return deny(req,"UNSUPPORTED_FILE",415);
 const raw=new Uint8Array(await file.arrayBuffer());
 if(!fileLooksValid(raw,mime))return deny(req,"FILE_SIGNATURE_INVALID",415);
 const verdict=await scan(raw,mime).catch(()=>null);
 if(!verdict)return deny(req,"FILE_SCAN_FAILED",422);
 const recordId=crypto.randomUUID(),versionId=crypto.randomUUID();
 const record={id:recordId,owner_scope:scope,owner_person_id:owner.ownerPersonId,workspace_id:owner.workspaceId,kind,title,created_by_person_id:who.personId};
 const envelope=await encrypt(raw,record,versionId,mime);
 const objectKey=scope+"/"+(owner.ownerPersonId||owner.workspaceId)+"/"+recordId+"/"+versionId+".bin";
 const {error:storeError}=await admin.storage.from(BUCKET).upload(objectKey,envelope.cipher,{contentType:"application/octet-stream",upsert:false,cacheControl:"0"});
 if(storeError)return deny(req,"UPLOAD_STORAGE_FAILED",503);
 const {error:createError}=await admin.from("secure_document_records").insert(record);
 if(createError){
   await admin.storage.from(BUCKET).remove([objectKey]);
   return deny(req,"UPLOAD_METADATA_FAILED",503);
 }
 const {error:versionError}=await admin.from("secure_document_versions").insert({id:versionId,document_id:recordId,version_number:1,storage_key:objectKey,mime_type:mime,size_bytes:raw.length,cipher_sha256:await sha256(envelope.cipher),cipher_metadata:envelope.meta,redacted_for_sharing:form.get("redacted_for_sharing")==="true"&&verdict.redaction_verified===true,created_by_person_id:who.personId});
 if(versionError){
   await admin.storage.from(BUCKET).remove([objectKey]);
   await admin.from("secure_document_records").update({status:"deletion_pending"}).eq("id",recordId);
   return deny(req,"UPLOAD_METADATA_FAILED",503);
 }
 await audit("created",who.personId,recordId);
 return json(req,{ok:true,document_id:recordId,version_id:versionId},201);
}
async function handleShare(req,who,body){
 if(!who.aal2)return deny(req,"STEP_UP_REQUIRED");
 const record=await requireRecord(who,body.document_id);
 if(!record||record.status!=="active")return deny(req,"DOCUMENT_FORBIDDEN");
 const version=await latestVersion(record.id);
 // Actual redaction must be provided, reviewed and confirmed by the owner; not OCR inferred.
 if(!version?.redacted_for_sharing)return deny(req,"REDACTED_VERSION_REQUIRED");
 const hours=Number(body.hours||0),views=Number(body.max_views||1),email=str(body.recipient_email,254).toLowerCase();
 if(!Number.isInteger(hours)||hours<1||hours>168||!Number.isInteger(views)||views<1||views>10||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return deny(req,"SHARE_INVALID",400);
 const plain=hex(crypto.getRandomValues(new Uint8Array(32)));
 const tokenHash=await sha256(enc.encode(plain));
 const recipient=await recipientMac(email);
 const expires=new Date(Date.now()+hours*3600000).toISOString();
 const {data,error}=await admin.from("secure_document_shares").insert({document_id:record.id,version_id:version.id,token_hash:tokenHash,recipient_email_mac:recipient,created_by_person_id:who.personId,expires_at:expires,max_views:views}).select("id").single();
 if(error)return deny(req,"SHARE_CREATE_FAILED",503);
 await audit("share_created",who.personId,record.id,data.id);
 return json(req,{ok:true,share_id:data.id,expires_at:expires,url:"https://ekodi.kr/my/docs/secure.html#share="+plain},201);
}
async function handleRevoke(req,who,body){
 if(!who.aal2)return deny(req,"STEP_UP_REQUIRED");
 if(!uuid(body.share_id))return deny(req,"INVALID_SHARE",400);
 const {data:share}=await admin.from("secure_document_shares").select("id,document_id").eq("id",body.share_id).maybeSingle();
 if(!share||!await requireRecord(who,share.document_id))return deny(req,"SHARE_FORBIDDEN");
 const {error}=await admin.from("secure_document_shares").update({status:"revoked",revoked_at:new Date().toISOString()}).eq("id",share.id);
 if(error)return deny(req,"SHARE_REVOKE_FAILED",503);
 await audit("share_revoked",who.personId,share.document_id,share.id);
 return json(req,{ok:true,revoked:true});
}
async function handleOpen(req,who,body){
 const plain=str(body.token,100);
 if(!/^[a-f0-9]{64}$/.test(plain))return deny(req,"SHARE_NOT_FOUND",404);
 const hash=await sha256(enc.encode(plain));
 const {data:share}=await admin.from("secure_document_shares").select("*").eq("token_hash",hash).eq("status","active").gt("expires_at",new Date().toISOString()).maybeSingle();
 if(!share)return deny(req,"SHARE_NOT_FOUND",404);
 if(!who.email||await recipientMac(who.email)!==share.recipient_email_mac)return deny(req,"RECIPIENT_FORBIDDEN");
 const {data:record}=await admin.from("secure_document_records").select("*").eq("id",share.document_id).eq("status","active").maybeSingle();
 const {data:version}=await admin.from("secure_document_versions").select("*").eq("id",share.version_id).eq("document_id",share.document_id).eq("state","active").maybeSingle();
 if(!record||!version?.redacted_for_sharing)return deny(req,"SHARE_NOT_FOUND",404);
 // Optimistic compare-and-swap makes view limit atomic with concurrent opens.
 const {data:claimed,error}=await admin.from("secure_document_shares")
   .update({view_count:share.view_count+1,last_viewed_at:new Date().toISOString()})
   .eq("id",share.id).eq("view_count",share.view_count).eq("status","active")
   .gt("expires_at",new Date().toISOString()).lt("view_count",share.max_views)
   .select("id").maybeSingle();
 if(error||!claimed)return deny(req,"SHARE_VIEW_LIMIT",409);
 await audit("share_viewed",who.personId,record.id,share.id);
 return readEncrypted(req,record,version);
}
async function handleRead(req,who,body){
 if(!who.aal2)return deny(req,"STEP_UP_REQUIRED");
 const record=await requireRecord(who,body.document_id);
 if(!record||record.status!=="active")return deny(req,"DOCUMENT_FORBIDDEN");
 const version=await latestVersion(record.id);
 if(!version)return deny(req,"VERSION_NOT_FOUND",404);
 await audit("viewed",who.personId,record.id);
 return readEncrypted(req,record,version);
}
async function handleExpire(req){
 const expect=Deno.env.get("SECURE_DOCUMENT_SCHEDULER_TOKEN")||"";
 const provided=req.headers.get("x-scheduler-token")||"";
 if(expect.length<32||provided!==expect)return deny(req,"SCHEDULER_FORBIDDEN",403);
 const {data,error}=await admin.from("secure_document_shares").update({status:"expired"}).eq("status","active").lte("expires_at",new Date().toISOString()).select("id");
 return error?deny(req,"EXPIRE_FAILED",503):json(req,{ok:true,expired:data?.length||0});
}
Deno.serve(async req=>{
 if(!originAllowed(req))return deny(req,"ORIGIN_NOT_ALLOWED",403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=="GET"&&req.method!=="POST")return deny(req,"METHOD_NOT_ALLOWED",405);
 const search=new URL(req.url).searchParams,action=search.get("action")||"status";
 if(action==="status")return json(req,{ok:true,contract:"ekodi.secure-documents.v1",active:enabled()&&!!admin});
 if(!enabled()||!admin||!publishable)return deny(req,"SERVICE_NOT_ACTIVATED",503);
 if(action==="expire"&&req.method==="POST")return handleExpire(req);
 const who=await auth(req);
 if(!who)return deny(req,"AUTH_REQUIRED",401);
 try{
   if(action==="list"&&req.method==="GET")return handleList(req,who,search);
   if(action==="upload"&&req.method==="POST")return handleUpload(req,who);
   if(req.method==="POST"){
     const length=Number(req.headers.get("content-length")||0);
     if(length>4096)return deny(req,"REQUEST_TOO_LARGE",413);
     const body=await req.json().catch(()=>null);
     if(!body||typeof body!=="object")return deny(req,"INVALID_JSON",400);
     if(action==="share")return handleShare(req,who,body);
     if(action==="revoke")return handleRevoke(req,who,body);
     if(action==="open")return handleOpen(req,who,body);
     if(action==="read")return handleRead(req,who,body);
   }
   return deny(req,"ACTION_NOT_FOUND",404);
 }catch{
   // Never disclose uploaded content, crypto metadata, filenames or token details.
   return deny(req,"SECURE_DOCUMENT_OPERATION_FAILED",503);
 }
});