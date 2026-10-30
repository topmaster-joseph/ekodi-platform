/**
 * EKODI Church: native Google Workspace worship draft writer.
 *
 * Service-only internal adapter. Authentication, source content, durable claim,
 * and OAuth refresh belong to EKODI Orchestrator / EKODI Storage, not a browser
 * or ChatGPT scheduler. Creates PRIVATE DRAFTS only; never publishes worship.
 */
const DRIVE='https://www.googleapis.com/drive/v3/files';
const DOCS='https://docs.googleapis.com/v1/documents';
const SLIDES='https://slides.googleapis.com/v1/presentations';
const FOLDER=/^[A-Za-z0-9_-]{10,120}$/;
const DATE=/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const safeText=(v,n=250000)=>typeof v==='string'?v.slice(0,n).trim():'';
const isDate=s=>{if(typeof s!=='string'||!DATE.test(s))return false;const value=Date.parse(s+'T00:00:00Z');return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===s;};
const forbidden=/\u0000|\u0008|\u000b|\u000c|\u000e|\u000f/;
const fail=code=>{const e=new Error(code);e.code=code;return e;};
function checkContent(value,label,min=12,max=80000){
  if(typeof value!=='string'||value.trim().length<min||value.length>max||forbidden.test(value))
    throw fail('CONTENT_INVALID_'+label);
  return value.trim();
}
export function validateWorshipDraftJob(job){
  if(!job||!isDate(job.serviceDate)||job.jobId!=='ekodi:church-weekly:'+job.serviceDate)
    throw fail('JOB_ID_OR_DATE_INVALID');
  if(job.source?.status!=='approved'||!job.source?.registryId||
      !safeText(job.source?.scripture,160))throw fail('APPROVED_SOURCE_REQUIRED');
  const text=job.content||{};
  if(text.scripture!==job.source.scripture)throw fail('SCRIPTURE_SOURCE_MISMATCH');
  const sermon=checkContent(text.sermon,'SERMON',150,80000);
  const bulletin=checkContent(text.bulletin,'BULLETIN',50,20000);
  const slides=text.slides;
  if(!Array.isArray(slides)||slides.length<3||slides.length>40)throw fail('SLIDES_COUNT_INVALID');
  const slideTexts=slides.map((x,i)=>checkContent(x,'SLIDE_'+i,2,3000));
  if(!slideTexts.some(x=>x.includes(job.source.scripture)))throw fail('SLIDE_SCRIPTURE_REFERENCE_MISSING');
  return Object.freeze({
    jobId:job.jobId,date:job.serviceDate,sourceRegistryId:safeText(job.source.registryId,100),
    scripture:job.source.scripture,sermon,bulletin,slides:slideTexts,
    files:[
      {key:'sermonGoogleDocId',type:'application/vnd.google-apps.document',name:'EKODI 교회 '+job.serviceDate+' 설교원고 초안'},
      {key:'bulletinGoogleDocId',type:'application/vnd.google-apps.document',name:'EKODI 교회 '+job.serviceDate+' 주보 초안'},
      {key:'worshipGoogleSlidesId',type:'application/vnd.google-apps.presentation',name:'EKODI 교회 '+job.serviceDate+' 예배 PPT 초안'}
    ],
  });
}
const uri=(base,id,suffix='')=>base+'/'+encodeURIComponent(id)+suffix;
async function google(fetchImpl,token,url,method='GET',body){
  if(![DRIVE,DOCS,SLIDES].some(root=>url===root||url.startsWith(root+'/')||url.startsWith(root+'?')))
    throw fail('GOOGLE_HOST_NOT_ALLOWED');
  let response;
  try{
    response=await fetchImpl(url,{method,redirect:'error',cache:'no-store',headers:{
      'authorization':'Bearer '+token,
      'accept':'application/json',
      ...(body?{'content-type':'application/json; charset=utf-8'}:{})
    },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  }catch{throw fail('GOOGLE_TRANSPORT_UNAVAILABLE');}
  if(response.status===429||response.status===403)throw fail('GOOGLE_RATE_OR_SCOPE_DENIED');
  if(!response.ok)throw fail('GOOGLE_HTTP_'+response.status);
  try{return await response.json();}catch{throw fail('GOOGLE_RESPONSE_INVALID');}
}
function validId(id){return typeof id==='string'&&FOLDER.test(id);}
async function createFile(fetchImpl,token,folder,name,mimeType){
  const result=await google(fetchImpl,token,DRIVE+'?fields=id,name,mimeType,parents', 'POST',{
    name,mimeType,parents:[folder]
  });
  if(!validId(result?.id)||result.mimeType!==mimeType||!result.parents?.includes(folder))
    throw fail('GOOGLE_FILE_CREATION_UNVERIFIED');
  return result.id;
}
async function writeDoc(fetchImpl,token,id,text){
  await google(fetchImpl,token,uri(DOCS,id,':batchUpdate'),'POST',{
    requests:[{insertText:{endOfSegmentLocation:{},text}}]
  });
  const readback=await google(fetchImpl,token,uri(DOCS,id));
  const paragraphs=readback?.body?.content||[];
  const actual=paragraphs.flatMap(x=>x.paragraph?.elements||[])
    .map(x=>x.textRun?.content||'').join('');
  if(readback?.documentId!==id||!actual.includes(text.slice(0,Math.min(48,text.length))))
    throw fail('GOOGLE_DOCS_READBACK_UNVERIFIED');
}
function slideRequests(texts){
  const requests=[];
  for(let i=0;i<texts.length;i++){
    const pageId='ekodi_worship_page_'+String(i+1).padStart(2,'0');
    const shapeId='ekodi_worship_text_'+String(i+1).padStart(2,'0');
    requests.push({createSlide:{objectId:pageId,slideLayoutReference:{predefinedLayout:'BLANK'}}});
    requests.push({createShape:{objectId:shapeId,shapeType:'TEXT_BOX',
      elementProperties:{pageObjectId:pageId,
        size:{width:{magnitude:620,unit:'PT'},height:{magnitude:370,unit:'PT'}},
        transform:{scaleX:1,scaleY:1,translateX:36,translateY:35,unit:'PT'}}}});
    requests.push({insertText:{objectId:shapeId,insertionIndex:0,text:texts[i]}});
  }
  return requests;
}
async function writeSlides(fetchImpl,token,id,texts){
  await google(fetchImpl,token,uri(SLIDES,id,':batchUpdate'),'POST',{requests:slideRequests(texts)});
  const presentation=await google(fetchImpl,token,uri(SLIDES,id));
  if(presentation?.presentationId!==id||!Array.isArray(presentation.slides)||
      presentation.slides.length!==texts.length)throw fail('GOOGLE_SLIDES_READBACK_UNVERIFIED');
  for(let i=0;i<texts.length;i++){
    const actual=(presentation.slides[i]?.pageElements||[])
      .flatMap(x=>x.shape?.text?.textElements||[]).map(x=>x.textRun?.content||'').join('');
    if(!actual.includes(texts[i].slice(0,Math.min(36,texts[i].length))))
      throw fail('GOOGLE_SLIDES_TEXT_UNVERIFIED');
  }
}
/**
 * Required deps (injected by authenticated EKODI runtime):
 *  authority.verify(ctx,job) -> {ok:true,service:'church',role:'pastor|super_admin'}
 *  ledger.claim(key) -> {claimed:true,leaseId:string} (atomic, unique)
 *  ledger.record(key,leaseId,assetReceipt) -> {stored:true}
 *  ledger.finish(key,leaseId,receipt) -> {stored:true}
 *  ledger.block(key,leaseId,code) for failed/uncertain attempts
 *  tokens.getChurchDriveToken(ctx) -> {token, scopes:[drive.file]}
 *
 * NO retry after claim. A network failure during creation may have produced a
 * file; owner must reconcile Google Drive + ledger before a separate retry.
 */
export async function executeWorshipDraftJob(job,{authority,ledger,tokens,fetchImpl=fetch}={},ctx={}){
  const plan=validateWorshipDraftJob(job);
  if(!authority?.verify||!ledger?.claim||!ledger?.record||!ledger?.finish||
     !ledger?.block||!tokens?.getChurchDriveToken)
    throw fail('EKODI_SECURE_DEPENDENCIES_MISSING');
  if(!validId(ctx.targetChurchFolderId))throw fail('EKODI_CHURCH_FOLDER_REQUIRED');
  const allowed=await authority.verify(ctx,plan);
  // The hosting folder must be checked for visibility by EKODI storage;
  // sharing to a public Church folder would inherit unsafe Drive permissions.
  if(allowed?.ok!==true||allowed.service!=='church'||
      !['pastor','super_admin'].includes(allowed.role)||allowed.verifiedServerSide!==true||
      allowed.verifiedFolderId!==ctx.targetChurchFolderId||
      allowed.folderPrivateVerified!==true)
    throw fail('EKODI_AUTHORIZATION_OR_PRIVATE_FOLDER_DENIED');
  const tokenResult=await tokens.getChurchDriveToken(ctx);
  if(typeof tokenResult?.token!=='string'||tokenResult.token.length<12||
      !Array.isArray(tokenResult.scopes)||!tokenResult.scopes.includes('https://www.googleapis.com/auth/drive.file'))
    throw fail('EKODI_DRIVE_OAUTH_SCOPE_MISSING');
  const claim=await ledger.claim(plan.jobId);
  if(claim?.claimed!==true||typeof claim.leaseId!=='string'||claim.leaseId.length<8)
    return {status:'blocked',reason:'EXCLUSIVE_CLAIM_UNAVAILABLE',
      jobId:plan.jobId,created:0,canDisableChatgptTask:false};
  const written={};let created=0;
  try{
    for(const file of plan.files){
      const id=await createFile(fetchImpl,tokenResult.token,ctx.targetChurchFolderId,file.name,file.type);
      created++;
      const stored=await ledger.record(plan.jobId,claim.leaseId,{kind:file.key,fileId:id,
        state:'created_pending_readback',targetFolderId:ctx.targetChurchFolderId});
      if(stored?.stored!==true)throw fail('DURABLE_ASSET_RECORD_FAILED');
      if(file.key==='sermonGoogleDocId')await writeDoc(fetchImpl,tokenResult.token,id,plan.sermon);
      else if(file.key==='bulletinGoogleDocId')await writeDoc(fetchImpl,tokenResult.token,id,plan.bulletin);
      else await writeSlides(fetchImpl,tokenResult.token,id,plan.slides);
      const verified=await ledger.record(plan.jobId,claim.leaseId,{
        kind:file.key,fileId:id,state:'draft_readback_verified',sourceRegistryId:plan.sourceRegistryId});
      if(verified?.stored!==true)throw fail('DURABLE_READBACK_RECORD_FAILED');
      written[file.key]=id;
    }
    const receipt={jobId:plan.jobId,serviceDate:plan.date,
      sourceRegistryId:plan.sourceRegistryId,assets:written,
      approvalState:'pastoral_review_required',publicationState:'private_draft',
      canDisableChatgptTask:false};
    if((await ledger.finish(plan.jobId,claim.leaseId,receipt))?.stored!==true)
      throw fail('DURABLE_COMPLETION_RECORD_FAILED');
    return {status:'draft_ready_for_pastor_review',jobId:plan.jobId,
      created,draftIds:written,publicationState:'private_draft',
      canDisableChatgptTask:false};
  }catch(error){
    const code=typeof error?.code==='string'?error.code:'EKODI_DRAFT_EXECUTION_FAILED';
    try{await ledger.block(plan.jobId,claim.leaseId,code);}catch{/* never overwrite original error */}
    return {status:'blocked_reconciliation_required',jobId:plan.jobId,
      created,reason:code,canDisableChatgptTask:false,noAutomaticRetry:true};
  }
}
