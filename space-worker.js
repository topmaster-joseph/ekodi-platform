import { realtimeTenant } from './realtime-tenant-registry.js';
import { tenantLivePage } from './tenant-live-page.js';
import { isPublicWorkspacePath, workspaceRouteFromPublicPath, workspaceSlugFromPublicPath } from './workspace-route-policy.js';
import { renderStorefrontPage, storefrontCss } from './storefront-page.js';
import { renderJadamStorefrontPage, jadamStorefrontCss } from './jadam-storefront.js';
import { renderRestaurantStorefrontPage, restaurantStorefrontCss } from './restaurant-storefront.js';
import { isOrganizationWorkspaceSlug, renderOrganizationPublicPage } from './organization-public-page.js';
import { isMnuBizWorkspaceSlug, renderMnuBizPublicPage, mnubizPublicCss } from './mnubiz-public-page.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

const EKODIMISSION_PREFIX='/ekodimission';
const EKODIMISSION_PUBLIC_ROUTE='ekodimission-public';
const MISSION_EVENT_RECORD_KEY='260926-chuseok-open-table';
const MISSION_EVENT_SLUG='260926-chuseok-open-table';
const MISSION_EVENT_PATH='/ekodimission/apply/260926-open-table';
const MISSION_EVENT_LEGACY_PATHS=new Set(['/ekodimission/activities/260926-chuseok-open-table','/ekodimission/activities/260925-chuseok-open-table','/ekodimission/activities/2026-chuseok-open-table']);
const MISSION_EVENT_APPLICATION_API=`/ekodimission/api/activities/${MISSION_EVENT_RECORD_KEY}/applications`;
const MISSION_TRIP_RECORD_KEY='261003-autumn-community-trip';
const MISSION_TRIP_PATH='/ekodimission/apply/261003-autumn-trip';
const MISSION_TRIP_APPLICATION_API=`/ekodimission/api/activities/${MISSION_TRIP_RECORD_KEY}/applications`;
const MISSION_TRIP_CONTENT_API=`/ekodimission/api/activities/${MISSION_TRIP_RECORD_KEY}/content`;
const MISSION_TRIP_COLLAB_PATH='/ekodimission/edit/261003-autumn-trip';
const MISSION_COLLAB_API='/ekodimission/api/collab';
const MISSION_ADMIN_ACTIVITY_RPC_API='/ekodimission/api/admin/activity-rpc';
const MISSION_ADMIN_ME_API='/ekodimission/api/admin/me';
const MISSION_ADMIN_ACTIVITY_RPCS=new Set(['activity_admin_snapshot','activity_admin_update_participation','activity_admin_add_participant','activity_admin_share_status','activity_admin_create_share','activity_admin_revoke_share','activity_admin_upsert_media_link','activity_admin_hide_media_link','activity_admin_payment_snapshot','activity_admin_update_payment','activity_admin_message_recipients','activity_admin_record_message','activity_admin_message_history']);
const MISSION_SHARE_PATH_RE=/^\/ekodimission\/share\/([A-Za-z0-9_-]{32,200})$/;
const MISSION_ACTIVITY_ARCHIVE_RE=/^\/ekodimission\/activities\/([a-z0-9-]+)\/archive$/;
const MISSION_ACTIVITY_MEDIA_RE=/^\/ekodimission\/api\/activities\/([a-z0-9-]+)\/media$/;
const MISSION_ACTIVITY_MEDIA_UPLOAD_RE=/^\/ekodimission\/api\/activities\/([a-z0-9-]+)\/media-upload$/;
const MISSION_ACTIVITY_MEDIA_FILE_RE=/^\/ekodimission\/media\/([0-9a-f-]{36})$/;
const MISSION_MEDIA_MAX_FILE_BYTES=8*1024*1024;
const MISSION_ACTIVITY_REGISTRATION_RE=/^\/ekodimission\/api\/activities\/([a-z0-9-]+)\/registration$/;
const MISSION_ACTIVITY_APPLICATION_RE=/^\/ekodimission\/api\/activities\/([0-9]{6}-[a-z0-9][a-z0-9-]{2,79})\/applications$/;
const MISSION_PUBLIC_ADMIN_PATHS=new Set(['/ekodimission/activities',MISSION_EVENT_PATH,MISSION_TRIP_PATH]);
const EKODIMISSION_PAGES=new Map([['/ekodimission','/ekodimission.page'],['/ekodimission/vision','/ekodimission-vision.page'],['/ekodimission/activities','/ekodimission-activities.page'],[MISSION_EVENT_PATH,'/ekodimission-open-table-apply.page'],['/ekodimission/apply/261003-autumn-trip','/ekodimission-autumn-trip-apply.page'],['/ekodimission/prayer','/ekodimission-prayer.page'],['/ekodimission/participate','/ekodimission-participate.page'],['/ekodimission/partners','/ekodimission-partners.page'],['/ekodimission/stories','/ekodimission-stories.page'],['/ekodimission/give','/ekodimission-give.page'],['/ekodimission/transparency','/ekodimission-transparency.page'],['/ekodimission/contact','/ekodimission-contact.page']]);
const EKODIMISSION_ASSETS=new Map([['/ekodimission/assets/site.css','/ekodimission.css'],['/ekodimission/assets/site.js','/ekodimission.js'],['/ekodimission/assets/shell.css','/ekodimission-shell.css'],['/ekodimission/assets/shell.js','/ekodimission-shell.js'],['/ekodimission/assets/mission-table-hero.svg','/mission-table-hero.svg'],['/ekodimission/assets/open-table-hero-260926.svg','/open-table-hero-260926.svg'],['/ekodimission/assets/open-table-meal-260925.jpg','/open-table-meal-260925.jpg'],['/ekodimission/assets/share.css','/ekodimission-share.css'],['/ekodimission/assets/collab.css','/ekodimission-collab.css'],['/ekodimission/assets/collab.js','/ekodimission-collab.js'],['/ekodimission/assets/archive.js','/ekodimission-archive.js']]);
function normalizedMissionPath(pathname){const clean=String(pathname||'').replace(/\/+$/,'');return clean||'/'}
function publishMissionHtml(html){return String(html||'').replace(/<meta name="robots" content="noindex,nofollow,noarchive">/gi,'<meta name="robots" content="index,follow">').replace(/<div class="review-banner">[\s\S]*?<\/div>/i,'')}
function brandSiteResponse(response){response.headers.set('x-ekodi-independent-site','true');response.headers.set('x-ekodi-site-class','brand-site');response.headers.set('x-ekodi-workspace','ekodimission');response.headers.set('x-ekodi-publication-status','published');return response;}
const MISSION_SHARE_STATUS_LABEL=Object.freeze({applied:'신청',waitlist:'대기',confirmed:'확정',attended:'참석',no_show:'불참',cancelled:'취소'});
function missionShareDate(value){
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
function missionShareResponse(env,html,status=200){
  const response=withHeaders(env,new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}),'ekodimission-share');
  response.headers.set('x-ekodi-independent-site','true');
  response.headers.set('x-ekodi-site-class','brand-site');
  response.headers.set('x-ekodi-workspace','ekodimission');
  response.headers.set('x-ekodi-publication-status','private-share');
  response.headers.set('x-robots-tag','noindex, nofollow, noarchive');
  return response;
}
function missionShareUnavailable(env,status=404){
  return missionShareResponse(env,'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>공유 링크 확인 | EKODI</title><link rel="stylesheet" href="/ekodimission/assets/share.css"></head><body><main class="mission-share-page"><p class="mission-share-kicker">EKODI MISSION · READ ONLY</p><h1>사용할 수 없는 공유 링크입니다.</h1><p class="mission-share-meta">링크가 만료되었거나 공유가 중지되었을 수 있습니다. 행사 관리자에게 새 링크를 요청해 주세요.</p></main></body></html>',status);
}
function renderMissionShareHtml(data){
  const activity=data?.activity||{},share=data?.share||{},policy=share?.field_policy||{},participants=Array.isArray(data?.participants)?data.participants:[];
  const showName=policy.name!==false,showStatus=policy.status!==false,showParty=policy.party_size!==false;
  const headers=['<th scope="col">연번</th>',showName?'<th scope="col">이름</th>':'',showStatus?'<th scope="col">상태</th>':'',showParty?'<th scope="col">인원</th>':''].join('');
  const rows=participants.map(item=>'<tr><td>'+htmlText(item?.seq||'')+'</td>'+(showName?'<td>'+htmlText(item?.name||'-')+'</td>':'')+(showStatus?'<td>'+htmlText(MISSION_SHARE_STATUS_LABEL[item?.status]||item?.status||'-')+'</td>':'')+(showParty?'<td>'+htmlText(item?.party_size||1)+'</td>':'')+'</tr>').join('');
  const start=missionShareDate(activity.starts_at),end=missionShareDate(activity.ends_at),venue=String(activity.venue||'').trim();
  const meta=[start,end&&end!==start?'종료 '+end:'',venue].filter(Boolean).map(htmlText).join(' · ');
  const expiry=missionShareDate(share.expires_at);
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+htmlText(activity.title||'신청자 명단')+' · 읽기전용</title><link rel="stylesheet" href="/ekodimission/assets/share.css"></head><body><main class="mission-share-page"><p class="mission-share-kicker">EKODI MISSION · READ ONLY SHARE</p><h1>'+htmlText(activity.title||'신청자 명단')+'</h1><p class="mission-share-meta">'+(meta||'행사 신청자 명단')+'</p><div class="mission-share-notice">이 페이지는 읽기전용 공유본입니다. 전화번호·이메일·역할·후속관리·내부 메모는 포함하지 않습니다.</div><div class="mission-share-table-wrap"><table class="mission-share-table"><thead><tr>'+headers+'</tr></thead><tbody>'+(rows||'<tr><td class="mission-share-empty" colspan="'+(1+Number(showName)+Number(showStatus)+Number(showParty))+'">표시할 신청자가 없습니다.</td></tr>')+'</tbody></table></div><p class="mission-share-footer">공유 만료: '+htmlText(expiry||'관리자 설정 시각')+' · 이 링크는 만료되거나 관리자가 중지하면 더 이상 열리지 않습니다.</p></main></body></html>';
}
async function routeMissionShare(request,env,token){
  if(!['GET','HEAD'].includes(request.method))return missionShareUnavailable(env,405);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return missionShareUnavailable(env,503);
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/activity_public_share_snapshot`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({p_token:token})});
    if(!upstream.ok)return missionShareUnavailable(env,upstream.status>=500?503:404);
    const data=await upstream.json().catch(()=>null);
    if(!data?.ok)return missionShareUnavailable(env,404);
    const html=renderMissionShareHtml(data);
    return missionShareResponse(env,request.method==='HEAD'?null:html,200);
  }catch{return missionShareUnavailable(env,503)}
}
async function missionSupabaseRpc(env,rpc,args){
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return {ok:false,status:503,data:{error:'activity_data_unavailable',message:'활동 데이터 연결을 확인해 주세요.'}};
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpc)}`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(args||{})});
    const raw=await upstream.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={}}
    return {ok:upstream.ok,status:upstream.status,data};
  }catch{return {ok:false,status:503,data:{error:'activity_data_unavailable',message:'활동 데이터 연결을 확인해 주세요.'}}}
}
async function routeMissionTripContent(request,env){
  if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
  const result=await missionSupabaseRpc(env,'activity_collab_public_snapshot',{p_workspace_slug:'ekodimission',p_activity_key:MISSION_TRIP_RECORD_KEY});
  if(!result.ok)return json(env,{error:'activity_content_unavailable',message:'게시된 여행계획을 불러오지 못했습니다.'},result.status>=500?503:404);
  return json(env,result.data,200);
}
async function routeMissionCollabApi(request,env){
  if(request.method!=='POST')return json(env,{error:'method_not_allowed',message:'POST 요청만 허용됩니다.'},405);
  const url=new URL(request.url);const origin=String(request.headers.get('origin')||'');
  if(url.hostname==='ekodi.kr'&&origin&&origin!=='https://ekodi.kr')return json(env,{error:'origin_not_allowed'},403);
  const length=Number(request.headers.get('content-length')||0);if(length>70000)return json(env,{error:'payload_too_large'},413);
  const body=await request.json().catch(()=>null);const action=String(body?.action||'');const token=String(body?.token||'');
  if(!/^[A-Za-z0-9_-]{32,200}$/.test(token))return json(env,{error:'invalid_link',message:'올바른 공동편집 링크로 접속해 주세요.'},403);
  let rpc='',args={p_token:token};
  if(action==='snapshot')rpc='activity_collab_share_snapshot';
  else if(action==='update'){rpc='activity_collab_update';args={p_token:token,p_editor_name:String(body?.editorName||'').slice(0,80),p_content:body?.content&&typeof body.content==='object'?body.content:{},p_expected_revision:Number(body?.expectedRevision||0)}}
  else if(action==='publish'){rpc='activity_collab_publish';args={p_token:token,p_editor_name:String(body?.editorName||'').slice(0,80),p_expected_revision:Number(body?.expectedRevision||0)}}
  else return json(env,{error:'invalid_action',message:'지원하지 않는 공동편집 요청입니다.'},400);
  const result=await missionSupabaseRpc(env,rpc,args);
  if(!result.ok){
    const detail=String(result.data?.message||result.data?.details||'');
    const forbidden=/COLLAB_(LINK_INVALID|EDIT_FORBIDDEN|PUBLISH_FORBIDDEN)/.test(detail);
    return json(env,{error:forbidden?'collab_forbidden':'collab_unavailable',message:forbidden?'공동편집 링크가 만료되었거나 권한이 없습니다.':'공동편집 요청을 처리하지 못했습니다.'},forbidden?403:(result.status>=500?503:400));
  }
  return json(env,result.data,200);
}
async function routeMissionCollabPage(request,env){
  if(!['GET','HEAD'].includes(request.method))return withHeaders(env,new Response('Method Not Allowed',{status:405}),'ekodimission-collab');
  const target=new URL(request.url);target.pathname='/ekodimission-trip-collab.page';target.search='';target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));const headers=new Headers(asset.headers);
  headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');headers.delete('content-length');
  const html=await asset.text();const response=withHeaders(env,new Response(request.method==='HEAD'?null:html,{status:asset.status,headers}),'ekodimission-collab');
  response.headers.set('x-ekodi-independent-site','true');response.headers.set('x-ekodi-workspace','ekodimission');response.headers.set('x-ekodi-publication-status','private-edit');response.headers.set('x-robots-tag','noindex, nofollow, noarchive');return response;
}

async function routeMissionActivityRegistration(request,env,activityKey){
  if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
  const result=await missionSupabaseRpc(env,'activity_public_registration_status',{p_workspace_slug:'ekodimission',p_activity_key:activityKey});
  if(!result.ok||!result.data?.ok)return json(env,{ok:false,error:'activity_not_found'},404);
  return json(env,result.data,200);
}
function missionHex(bytes){return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('')}
function missionBytesToBase64(bytes){
  let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}
function missionDetectedImageMime(bytes){
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return'image/png';
  if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return'image/webp';
  if(bytes.length>=6){const sig=String.fromCharCode(...bytes.subarray(0,6));if(sig==='GIF87a'||sig==='GIF89a')return'image/gif'}
  if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(4,8))==='ftyp'){
    const brand=String.fromCharCode(...bytes.subarray(8,12)).toLowerCase();
    if(['heic','heix','hevc','hevx'].includes(brand))return'image/heic';
    if(['mif1','msf1','heif'].includes(brand))return'image/heif';
  }
  return'';
}
function missionSafeFilename(value){
  const name=String(value||'photo').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim();
  return(name||'photo').slice(0,180);
}
async function routeMissionActivityMediaUpload(request,env,activityKey){
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const url=new URL(request.url),origin=String(request.headers.get('origin')||'');
  if(url.hostname==='ekodi.kr'&&origin&&origin!=='https://ekodi.kr')return json(env,{ok:false,error:'origin_not_allowed'},403);
  if(!env.STORAGE?.fetch)return json(env,{ok:false,error:'storage_unavailable',message:'사진 직접 업로드를 사용할 수 없습니다. 아래 링크 등록을 이용해 주세요.'},503);
  const length=Number(request.headers.get('content-length')||0);
  if(length&&length>MISSION_MEDIA_MAX_FILE_BYTES+524288)return json(env,{ok:false,error:'payload_too_large',message:'사진 한 장은 8MB 이하만 올릴 수 있습니다.'},413);
  const form=await request.formData().catch(()=>null);
  const file=form?.get('file'),submittedBy=String(form?.get('name')||'').trim().slice(0,80),title=String(form?.get('title')||'').trim().slice(0,160);
  if(!(file instanceof File))return json(env,{ok:false,error:'file_required',message:'사진 파일을 선택해 주세요.'},400);
  if(file.size<=0||file.size>MISSION_MEDIA_MAX_FILE_BYTES)return json(env,{ok:false,error:'invalid_file_size',message:'사진 한 장은 8MB 이하만 올릴 수 있습니다.'},413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const detected=missionDetectedImageMime(bytes);
  if(!detected)return json(env,{ok:false,error:'unsupported_media_type',message:'JPG, PNG, WebP, GIF, HEIC 사진만 올릴 수 있습니다.'},415);
  const declared=String(file.type||'').toLowerCase();
  if(declared&&declared.startsWith('image/')&&declared!==detected&&!(declared==='image/heif'&&detected==='image/heic')&&!(declared==='image/heic'&&detected==='image/heif')){
    return json(env,{ok:false,error:'media_signature_mismatch',message:'파일 형식과 실제 사진 데이터가 일치하지 않습니다.'},415);
  }
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const sha256=missionHex(digest),filename=missionSafeFilename(file.name||'photo');
  const reserve=await missionSupabaseRpc(env,'activity_public_reserve_media_upload',{
    p_workspace_slug:'ekodimission',p_activity_key:activityKey,p_sha256:sha256,
    p_title:title||filename,p_original_filename:filename,p_mime_type:detected,p_file_size:file.size,
    p_submitted_by_name:submittedBy,p_perceptual_hash:''
  });
  if(!reserve.ok||!reserve.data?.ok)return json(env,{ok:false,error:reserve.data?.error||'upload_reservation_failed',message:'사진 등록 준비에 실패했습니다.'},reserve.status>=500?503:400);
  if(!reserve.data.reserved){
    return json(env,{ok:true,duplicate:true,pending:Boolean(reserve.data.pending),id:reserve.data.id,url:reserve.data.url||'',message:reserve.data.pending?'같은 사진이 이미 업로드 중입니다.':'같은 사진이 이미 등록되어 있어 한 장으로 정리했습니다.'},reserve.data.pending?202:200);
  }
  const mediaId=String(reserve.data.id||''),uploadToken=String(reserve.data.upload_token||'');
  let storageFileId='';
  try{
    const storageResponse=await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/records',{
      method:'POST',headers:{'content-type':'application/json','x-request-id':mediaId},
      body:JSON.stringify({
        spaceId:'ekodimission',serviceId:'media',storageRoute:'media',recordType:'mission_activity_photo',
        createdBy:'public-activity-participant',retentionClass:'permanent',title:filename,mimeType:detected,
        contentBase64:missionBytesToBase64(bytes),sourceModuleId:'ekodimission.activity-archive',
        subfolderPath:'EKODI Mission/Activities/'+activityKey
      })
    }));
    const stored=await storageResponse.json().catch(()=>({}));
    storageFileId=String(stored?.file?.id||'');
    if(!storageResponse.ok||!stored?.ok||!storageFileId)throw new Error(stored?.code||'storage_write_failed');
    const finalize=await missionSupabaseRpc(env,'activity_public_finalize_media_upload',{
      p_workspace_slug:'ekodimission',p_activity_key:activityKey,p_media_id:mediaId,p_upload_token:uploadToken,p_storage_file_id:storageFileId
    });
    if(!finalize.ok||!finalize.data?.ok)throw new Error(finalize.data?.error||'upload_finalize_failed');
    return json(env,{ok:true,duplicate:false,id:mediaId,url:finalize.data.url||'',archive_url:finalize.data.archive_url||'',filename,size:file.size,mime_type:detected},201);
  }catch(error){
    if(storageFileId){
      await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/delete-file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:storageFileId})})).catch(()=>{});
    }
    await missionSupabaseRpc(env,'activity_public_fail_media_upload',{p_workspace_slug:'ekodimission',p_activity_key:activityKey,p_media_id:mediaId,p_upload_token:uploadToken}).catch(()=>{});
    return json(env,{ok:false,error:'photo_upload_failed',message:'사진 저장에 실패했습니다. 링크 등록은 계속 사용할 수 있습니다.'},503);
  }
}
async function routeMissionActivityMediaFile(request,env,mediaId){
  if(!['GET','HEAD'].includes(request.method))return json(env,{ok:false,error:'method_not_allowed'},405);
  if(!env.STORAGE?.fetch)return json(env,{ok:false,error:'storage_unavailable'},503);
  const ref=await missionSupabaseRpc(env,'activity_public_media_file_ref',{p_media_id:mediaId});
  if(!ref.ok||!ref.data?.ok)return new Response('Not Found',{status:404});
  const fileId=String(ref.data.storage_file_id||'');
  const upstream=await env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1/files/'+encodeURIComponent(fileId),{method:'GET'}));
  if(!upstream.ok)return new Response('Not Found',{status:upstream.status===404?404:503});
  const headers=new Headers(upstream.headers);
  headers.set('content-type',String(ref.data.mime_type||headers.get('content-type')||'application/octet-stream'));
  headers.set('cache-control','public, max-age=3600, stale-while-revalidate=86400');
  headers.set('x-content-type-options','nosniff');
  headers.set('content-disposition','inline; filename="'+missionSafeFilename(ref.data.filename||'photo').replace(/"/g,'_')+'"');
  headers.delete('set-cookie');
  return new Response(request.method==='HEAD'?null:upstream.body,{status:200,headers});
}
async function routeMissionActivityMedia(request,env,activityKey){
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const url=new URL(request.url);const origin=String(request.headers.get('origin')||'');
  if(url.hostname==='ekodi.kr'&&origin&&origin!=='https://ekodi.kr')return json(env,{ok:false,error:'origin_not_allowed'},403);
  const length=Number(request.headers.get('content-length')||0);if(length>16384)return json(env,{ok:false,error:'payload_too_large'},413);
  const body=await request.json().catch(()=>null);
  const rawUrl=String(body?.url||'').trim();if(!rawUrl)return json(env,{ok:false,error:'url_required',message:'사진·영상 또는 채널 링크를 입력해 주세요.'},400);
  let target;try{target=new URL(rawUrl)}catch{return json(env,{ok:false,error:'invalid_url',message:'올바른 https 링크를 입력해 주세요.'},400)}
  if(target.protocol!=='https:'||target.username||target.password)return json(env,{ok:false,error:'invalid_url',message:'https 링크만 등록할 수 있습니다.'},400);
  target.hash='';
  for(const key of [...target.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','si','feature'].includes(key.toLowerCase()))target.searchParams.delete(key);
  target.hostname=target.hostname.toLowerCase();if(target.pathname.length>1)target.pathname=target.pathname.replace(/\/+$/,'');
  const canonical=target.toString();
  const host=target.hostname.replace(/^www\./,'');
  let source='other',type=String(body?.type||'other').trim().toLowerCase();
  if(/youtube\.com$|youtu\.be$/.test(host)){source='youtube';type='video'}
  else if(/facebook\.com$|fb\.watch$/.test(host)){source='facebook'}
  else if(/instagram\.com$/.test(host)){source='instagram'}
  else if(/drive\.google\.com$/.test(host)){source='google_drive'}
  else if(/photos\.app\.goo\.gl$|photos\.google\.com$/.test(host)){source='google_photos';type=type==='other'?'album':type}
  else if(/blog\.|naver\.com$|tistory\.com$/.test(host)){source='blog'}
  const allowed=new Set(['photo','video','album','document','other']);if(!allowed.has(type))type='other';
  const result=await missionSupabaseRpc(env,'activity_public_submit_media_link',{
    p_workspace_slug:'ekodimission',p_activity_key:activityKey,p_media_type:type,
    p_title:String(body?.title||'').trim().slice(0,160),p_url:rawUrl,p_canonical_url:canonical,
    p_source_channel:source,p_submitted_by_name:String(body?.name||'').trim().slice(0,80)
  });
  if(!result.ok)return json(env,{ok:false,error:'media_submit_failed',message:'링크를 저장하지 못했습니다.'},result.status>=500?503:400);
  return json(env,result.data,200);
}
async function routeMissionActivityArchive(request,env,activityKey){
  if(!['GET','HEAD'].includes(request.method))return withHeaders(env,new Response('Method Not Allowed',{status:405}),'ekodimission-archive');
  const result=await missionSupabaseRpc(env,'activity_public_archive_snapshot',{p_workspace_slug:'ekodimission',p_activity_key:activityKey});
  const data=result?.data;
  if(!result.ok||!data?.ok)return withHeaders(env,new Response('Not Found',{status:404}),'ekodimission-archive');
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const media=Array.isArray(data.media)?data.media:[];
  const cards=media.length?media.map(item=>{const direct=item.source_channel==='ekodi_storage'&&item.type==='photo';return '<article class="service-card activity-result-card" data-media-card data-media-id="'+esc(item.id||'')+'"><a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+(direct?'<img class="activity-result-photo" src="'+esc(item.url)+'" alt="" loading="lazy" decoding="async">':'')+'<p class="eyebrow">'+esc(String(item.source_channel||item.type||'media').toUpperCase())+'</p><h2>'+esc(item.title||'사진·영상 보기')+'</h2><p>'+(direct?'사진 크게 보기 →':'원문·원본 보기 →')+'</p></a></article>'}).join(''):'<article class="service-card"><h2>아직 등록된 결과가 없습니다.</h2><p>참여자 누구나 아래에서 사진을 직접 올리거나 영상·채널 링크를 함께 모을 수 있습니다.</p></article>';
  const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>'+esc(data.activity?.title||'행사 결과')+' · 사진·영상</title><link rel="stylesheet" href="/ekodimission/assets/site.css"><link rel="stylesheet" href="/ekodimission/assets/shell.css"><script src="/ekodimission/assets/shell.js" defer></script><script src="/ekodimission/assets/archive.js" defer></script></head><body data-activity-archive data-activity-key="'+esc(activityKey)+'"><header class="mission-site-header"><a class="mission-brand" href="/ekodimission"><span class="mission-brand-mark">E</span><span><strong>에코디선교회</strong><small>EKODI MISSION</small></span></a><nav aria-label="주요 메뉴" data-mission-nav></nav></header><main class="subpage"><a class="back" href="/ekodimission/activities">← 활동</a><section class="sub-hero"><p class="eyebrow">ACTIVITY ARCHIVE</p><h1>'+esc(data.activity?.title||'행사 결과')+'</h1><p>'+esc(data.activity?.venue||'')+'</p></section><section aria-labelledby="activity-photo-upload-title"><div class="section-heading"><p class="eyebrow">TOGETHER · UPLOAD</p><h2 id="activity-photo-upload-title">사진 함께 올리기</h2><p>여러 사람이 같은 사진을 올려도 SHA-256 기준으로 한 장만 보관합니다. JPG·PNG·WebP·GIF·HEIC, 사진 한 장당 8MB 이하입니다.</p></div><form class="apply-form mission-photo-upload" data-photo-upload><div class="field-grid"><label><span>사진 선택 *</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple required></label><label><span>이름 또는 닉네임</span><input name="name" maxlength="80" placeholder="선택"></label></div><button class="apply-submit" type="submit">선택한 사진 올리기</button><p class="share-status" data-photo-status aria-live="polite"></p></form></section><section aria-labelledby="activity-media-add-title"><div class="section-heading"><p class="eyebrow">CHANNEL LINKS</p><h2 id="activity-media-add-title">동영상·채널 링크 추가</h2><p>YouTube·Facebook·Instagram·Google Photos·Drive 등 활동 결과가 올라온 원본 링크도 함께 모을 수 있습니다.</p></div><form class="apply-form" data-media-submit><div class="field-grid"><label><span>원본 링크 *</span><input name="url" type="url" inputmode="url" required placeholder="https://..."></label><label><span>제목</span><input name="title" maxlength="160" placeholder="예: 공동체 여행 영상"></label><label><span>이름 또는 닉네임</span><input name="name" maxlength="80" placeholder="선택"></label><label><span>종류</span><select name="type"><option value="other">자동/기타</option><option value="photo">사진</option><option value="album">사진 모음</option><option value="video">동영상</option><option value="document">문서</option></select></label></div><button class="apply-submit" type="submit">링크 등록</button><p class="share-status" data-media-status aria-live="polite"></p></form></section><section><div class="section-heading"><p class="eyebrow">CURATED RESULTS</p><h2>정리된 활동 결과</h2></div><div class="service-grid" data-media-list>'+cards+'</div></section></main></body></html>';
  const response=withHeaders(env,new Response(request.method==='HEAD'?null:html,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'index, follow'}}),'ekodimission-archive');
  return brandSiteResponse(response);
}

async function routeMissionAdminMe(request,env){
  if(request.method!=='GET')return json(env,{ok:false,error:'method_not_allowed',message:'GET 요청만 허용됩니다.'},405);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json(env,{ok:false,error:'activity_gateway_unavailable',message:'행사 관리 데이터 연결을 확인해 주세요.'},503);
  const authorization=String(request.headers.get('authorization')||'');
  if(!authorization.toLowerCase().startsWith('bearer '))return json(env,{ok:false,authenticated:false,error:'authentication_required'},401);
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/current_site_activity_contexts`,{
      method:'POST',
      headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json','cache-control':'no-store'},
      body:'{}'
    });
    const raw=await upstream.json().catch(()=>[]);
    if(!upstream.ok){
      const response=json(env,{ok:false,authenticated:false,error:'authentication_required'},upstream.status===401?401:403);
      response.headers.set('x-ekodi-activity-admin-auth','mission-public-admin-v1');
      return response;
    }
    const contexts=Array.isArray(raw)?raw:[];
    const context=contexts.find(item=>String(item?.tenant||'').trim().toLowerCase()==='ekodimission')||null;
    const role=String(context?.authorization_role||'').trim().toLowerCase();
    if(!context||!['tenant_admin','store_owner'].includes(role)){
      const response=json(env,{ok:false,authenticated:true,error:'ACTIVITY_ADMIN_FORBIDDEN'},403);
      response.headers.set('x-ekodi-activity-admin-auth','mission-public-admin-v1');
      return response;
    }
    const response=json(env,{
      ok:true,
      authenticated:true,
      workspace:'ekodimission',
      authorizationRole:role,
      activityRole:String(context?.activity_role||'').trim().toLowerCase(),
      permissions:{activities:true,payments:true,messages:true,media:true}
    });
    response.headers.set('x-ekodi-activity-admin-auth','mission-public-admin-v1');
    return response;
  }catch{
    const response=json(env,{ok:false,error:'activity_gateway_upstream_unavailable'},503);
    response.headers.set('x-ekodi-activity-admin-auth','mission-public-admin-v1');
    return response;
  }
}

async function routeMissionAdminActivityRpc(request,env){
  if(request.method!=='POST')return json(env,{error:'method_not_allowed',message:'POST 요청만 허용됩니다.'},405);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json(env,{error:'activity_gateway_unavailable',message:'행사 관리 데이터 연결을 확인해 주세요.'},503);
  const authorization=String(request.headers.get('authorization')||'');
  if(!authorization.toLowerCase().startsWith('bearer '))return json(env,{error:'authentication_required',message:'관리자 로그인이 필요합니다.'},401);
  const payload=await request.json().catch(()=>null),rpc=String(payload?.rpc||'').trim(),args=payload?.args&&typeof payload.args==='object'&&!Array.isArray(payload.args)?payload.args:{};
  if(!MISSION_ADMIN_ACTIVITY_RPCS.has(rpc))return json(env,{error:'activity_rpc_not_allowed',message:'허용되지 않은 행사 관리 요청입니다.'},400);
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpc)}`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(args)});
    const raw=await upstream.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={}}
    if(!upstream.ok){
      const detail=String(data?.message||data?.error||'');const code=String(data?.code||data?.error||'');
      const schemaMissing=code==='PGRST202'||/Could not find the function/i.test(detail);
      const response=json(env,{error:schemaMissing?'activity_schema_not_ready':(code||'activity_rpc_failed'),message:schemaMissing?'행사 공유 기능의 데이터 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.':(detail||'행사 관리 요청을 처리하지 못했습니다.')},schemaMissing?503:upstream.status);
      response.headers.set('x-ekodi-activity-gateway','mission-admin-v1');response.headers.set('x-ekodi-activity-schema',schemaMissing?'missing':'ready');return response;
    }
    const response=json(env,data,200);response.headers.set('x-ekodi-activity-gateway','mission-admin-v1');response.headers.set('x-ekodi-activity-schema','ready');return response;
  }catch{
    const response=json(env,{error:'activity_gateway_upstream_unavailable',message:'행사 관리 데이터 연결을 확인해 주세요.'},503);response.headers.set('x-ekodi-activity-gateway','mission-admin-v1');return response;
  }
}
async function routeEkodiMission(request,env){
  const url=new URL(request.url);const pathname=normalizedMissionPath(url.pathname);if(pathname===MISSION_ADMIN_ME_API)return routeMissionAdminMe(request,env);if(pathname===MISSION_ADMIN_ACTIVITY_RPC_API)return routeMissionAdminActivityRpc(request,env);if(pathname===MISSION_TRIP_CONTENT_API)return routeMissionTripContent(request,env);if(pathname===MISSION_COLLAB_API)return routeMissionCollabApi(request,env);if(pathname===MISSION_TRIP_COLLAB_PATH)return routeMissionCollabPage(request,env);const registrationMatch=pathname.match(MISSION_ACTIVITY_REGISTRATION_RE);if(registrationMatch)return routeMissionActivityRegistration(request,env,registrationMatch[1]);const uploadMatch=pathname.match(MISSION_ACTIVITY_MEDIA_UPLOAD_RE);if(uploadMatch)return routeMissionActivityMediaUpload(request,env,uploadMatch[1]);const mediaFileMatch=pathname.match(MISSION_ACTIVITY_MEDIA_FILE_RE);if(mediaFileMatch)return routeMissionActivityMediaFile(request,env,mediaFileMatch[1]);const mediaMatch=pathname.match(MISSION_ACTIVITY_MEDIA_RE);if(mediaMatch)return routeMissionActivityMedia(request,env,mediaMatch[1]);const archiveMatch=pathname.match(MISSION_ACTIVITY_ARCHIVE_RE);if(archiveMatch)return routeMissionActivityArchive(request,env,archiveMatch[1]);const shareMatch=pathname.match(MISSION_SHARE_PATH_RE);
  if(shareMatch)return routeMissionShare(request,env,shareMatch[1]);
  if(MISSION_EVENT_LEGACY_PATHS.has(pathname)){const target=new URL(MISSION_EVENT_PATH+url.search,'https://ekodi.kr');return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-route':'ekodimission-event-canonical','x-ekodi-publication-status':'published'}});}
  if(pathname==='/ekodimission/live'){
    const tenant=realtimeTenant('ekodimission');if(!tenant)return withHeaders(env,new Response('Not Found',{status:404}),'ekodimission-not-found');
    return brandSiteResponse(withHeaders(env,tenantLivePage(tenant),EKODIMISSION_PUBLIC_ROUTE));
  }
  const assetPath=EKODIMISSION_PAGES.get(pathname)||EKODIMISSION_ASSETS.get(pathname);
  if(!assetPath)return brandSiteResponse(withHeaders(env,new Response('Not Found',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}}),'ekodimission-not-found'));
  const target=new URL(request.url);target.pathname=assetPath;target.search='';const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  const isPage=EKODIMISSION_PAGES.has(pathname);let served=asset;
  if(isPage){const headers=new Headers(asset.headers);headers.set('content-type','text/html; charset=utf-8');headers.delete('content-length');const html=publishMissionHtml(await asset.text());served=new Response(request.method==='HEAD'?null:html,{status:asset.status,statusText:asset.statusText,headers});}
  const branded=brandSiteResponse(withHeaders(env,served,EKODIMISSION_ASSETS.has(pathname)?'ekodimission-asset':EKODIMISSION_PUBLIC_ROUTE));
  if(isPage&&MISSION_PUBLIC_ADMIN_PATHS.has(pathname)&&typeof HTMLRewriter==='function'){
    return injectEkodiShell(branded,'mission','public',{existingHeader:true,memberGate:'service-owned'});
  }
  return branded;
}

const DEFAULT_PAGE_PROFILE=Object.freeze({
  documentTitle:'운영공간 · EKODI',name:'내 운영공간',kicker:'OPERATING SPACE',
  lead:'로그인 후 내가 운영하거나 참여하는 점포와 조직만 표시합니다.',theme:'default',
  description:'EKODI 점포 운영공간',robots:'noindex,nofollow,noarchive'
});
const STORE_PAGE_PROFILES=Object.freeze({
  jadam:{documentTitle:'자담치킨 목포대점 · EKODI',name:'자담치킨 목포대점',kicker:'CHICKEN STORE USER PAGE',lead:'치킨 메뉴·가격·배달채널을 자담치킨 데이터로만 분리해 운영합니다.',theme:'jadam',description:'자담치킨 목포대점 사용자 운영페이지',robots:'index,follow'},
  pizzamaru:{documentTitle:'피자마루 목포대점 · EKODI',name:'피자마루 목포대점',kicker:'PIZZA STORE USER PAGE',lead:'피자 메뉴·옵션·판매가·배달채널을 피자마루 데이터로만 분리해 운영합니다.',theme:'pizzamaru',description:'피자마루 목포대점 사용자 운영페이지',robots:'index,follow'},
  yogurt:{documentTitle:'요거트퍼플 목포대점 · 메뉴 · 배달주문',name:'요거트퍼플 목포대점',kicker:'YOGURT PURPLE · MOKPO UNIVERSITY',lead:'국립목포대학교 후문, 요거트퍼플 목포대점에서 상큼한 디저트를 만나보세요.',theme:'yogurt',description:'요거트퍼플 목포대점 메뉴·매장안내·배달주문',robots:'index,follow'},
});
function staticPageProfile(pathname){const slug=workspaceSlugFromPublicPath(pathname);return STORE_PAGE_PROFILES[slug]||DEFAULT_PAGE_PROFILE}
async function pageProfile(pathname,env){
  const slug=workspaceSlugFromPublicPath(pathname);
  const fallback=staticPageProfile(pathname);
  if(!slug||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return {profile:fallback,canonicalSlug:slug,status:'active',source:'static',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_profile`,{
      method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})
    });
    if(!response.ok)return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
    const data=await response.json().catch(()=>null);
    if(!data||typeof data!=='object')return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
    return {profile:{documentTitle:data.document_title||`${data.name||fallback.name} · EKODI`,name:data.name||fallback.name,kicker:data.kicker||fallback.kicker,lead:data.lead||fallback.lead,theme:data.theme||fallback.theme,description:data.description||fallback.description,robots:fallback.robots||'index,follow'},canonicalSlug:data.canonical_slug||slug,status:data.status||'active',source:'store-user-sites',storefront:true};
  }catch{return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])}}
}
function htmlText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), usb=()',
    'x-ekodi-service':'space',
  };
}
function withHeaders(env,response,route='asset'){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);
  headers.set('x-ekodi-route',route);
  const contentType=headers.get('content-type')||'';
  if(contentType.includes('text/html')){
    headers.set('cache-control','no-store');
    headers.set('x-robots-tag',['space-storefront','space-organization',EKODIMISSION_PUBLIC_ROUTE].includes(route)?'index, follow':'noindex, nofollow, noarchive');
  }else if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function json(env,data,status=200){return withHeaders(env,new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}),'api')}
function missionApplicationError(message=''){
  const text=String(message||'');
  if(text.includes('APPLICATION_CLOSED'))return ['application_closed','신청이 마감되었습니다.',409];
  if(text.includes('PRIVACY_CONSENT_REQUIRED'))return ['privacy_consent_required','개인정보 수집·이용 동의가 필요합니다.',400];
  if(text.includes('INVALID_NAME'))return ['invalid_name','이름을 확인해 주세요.',400];
  if(text.includes('INVALID_PHONE'))return ['invalid_phone','연락처를 확인해 주세요.',400];
  if(text.includes('INVALID_EMAIL'))return ['invalid_email','이메일 주소를 확인해 주세요.',400];
  if(text.includes('INVALID_PARTY_SIZE'))return ['invalid_party_size','참여 인원을 확인해 주세요.',400];
  return ['application_unavailable','신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',503];
}
async function submitMissionEventApplication(request,env,eventKey=MISSION_EVENT_RECORD_KEY,eventSlug=MISSION_EVENT_SLUG){
  if(request.method==='OPTIONS')return withHeaders(env,new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}}),'ekodimission-application-api');
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const url=new URL(request.url);const origin=String(request.headers.get('origin')||'');
  if(url.hostname==='ekodi.kr'&&origin&&origin!=='https://ekodi.kr')return json(env,{ok:false,error:'origin_not_allowed'},403);
  const length=Number(request.headers.get('content-length')||0);if(length>16384)return json(env,{ok:false,error:'payload_too_large'},413);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json(env,{ok:false,error:'application_storage_unavailable'},503);
  let body;try{body=await request.json();}catch{return json(env,{ok:false,error:'invalid_json'},400)}
  const name=String(body?.name||'').trim();const phone=String(body?.phone||'').trim();const email=String(body?.email||'').trim();const partySize=Number(body?.partySize||1);
  if(!name||name.length>80)return json(env,{ok:false,error:'invalid_name',message:'이름을 확인해 주세요.'},400);
  if(phone.replace(/[^0-9+]/g,'').length<8||phone.length>40)return json(env,{ok:false,error:'invalid_phone',message:'연락처를 확인해 주세요.'},400);
  if(!Number.isInteger(partySize)||partySize<1||partySize>20)return json(env,{ok:false,error:'invalid_party_size',message:'참여 인원을 확인해 주세요.'},400);
  if(body?.privacyConsent!==true)return json(env,{ok:false,error:'privacy_consent_required',message:'개인정보 수집·이용 동의가 필요합니다.'},400);
  const rpcBody={p_event_key:eventKey,p_name:name,p_phone:phone,p_email:email,p_party_size:partySize,p_language:String(body?.language||'ko').slice(0,24),p_dietary:String(body?.dietary||'').slice(0,500),p_note:String(body?.note||'').slice(0,2000),p_photo_consent:body?.photoConsent===true,p_privacy_consent:true,p_website:String(body?.website||'').slice(0,200)};
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mission_submit_event_application`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(rpcBody)});
    const data=await upstream.json().catch(()=>null);
    if(!upstream.ok){const [error,message,status]=missionApplicationError(data?.message||data?.details||'');return json(env,{ok:false,error,message},status);}
    if(!data?.ok||!data?.application_id)return json(env,{ok:false,error:'application_persistence_unverified',message:'신청 저장을 확인하지 못했습니다. 다시 신청해 주세요.'},503);
    return json(env,{ok:true,eventKey:eventSlug,applicationId:data.application_id,message:'신청이 접수되었습니다.'},200);
  }catch{return json(env,{ok:false,error:'application_unavailable',message:'신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503)}
}
async function publicSiteChrome(slug){
  try{const r=await fetch(`https://workspace-api.ekodi.kr/v1/site-chrome/public?subject_key=${encodeURIComponent(slug)}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const data=await r.json().catch(()=>null);return data&&typeof data==='object'?data:null}catch{return null}
}
async function publicStorefront(slug,env){
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_public_storefront`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})});
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    return data&&typeof data==='object'?data:null;
  }catch{return null}
}
function runtimeConfig(env){
  const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
  return {dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',workspaceApi:dataEnabled?`${env.SUPABASE_URL}/functions/v1/workspace-api`:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=space',canonicalOrigin:'https://ekodi.kr',routeModel:['/{slug}','/{slug}/{service}'],memberNamespaceRequired:false,identityModel:'path -> slug(locator) -> workspace_id -> relationship/policy -> role -> capability'};
}
function authRedirect(request,env){
  const current=new URL(request.url);current.hash='';
  const canonical=new URL(current.pathname+current.search,'https://ekodi.kr');
  const target=new URL(env.AUTH_URL||'https://auth.ekodi.kr/?site=space');
  target.searchParams.set('site','space');target.searchParams.set('return_to',canonical.href);
  return withHeaders(env,Response.redirect(target.href,302),'auth-start');
}
async function appShell(request,env,route='space-home',profile=DEFAULT_PAGE_PROFILE){
  const target=new URL(request.url);target.pathname='/';target.search='';target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  const contentType=asset.headers.get('content-type')||'';
  if(!contentType.includes('text/html'))return withHeaders(env,asset,route);
  let html=await asset.text();
  const tokens={
    '__SPACE_PAGE_DOCUMENT_TITLE__':profile.documentTitle,
    '__SPACE_PAGE_NAME__':profile.name,
    '__SPACE_PAGE_KICKER__':profile.kicker,
    '__SPACE_PAGE_LEAD__':profile.lead,
    '__SPACE_PAGE_THEME__':profile.theme,
    '__SPACE_PAGE_DESCRIPTION__':profile.description,
    '__SPACE_PAGE_ROBOTS__':profile.robots||'noindex,nofollow,noarchive',
    '__SPACE_PUBLIC_CLASS__':profile.theme==='yogurt'?'':'hidden',
    '__SPACE_INTERNAL_CLASS__':profile.theme==='yogurt'?'hidden':'',
  };
  for(const [token,value] of Object.entries(tokens))html=html.replaceAll(token,htmlText(value));
  const headers=new Headers(asset.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return withHeaders(env,new Response(html,{status:asset.status,statusText:asset.statusText,headers}),route);
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const legacyAlias=url.hostname.toLowerCase()==='space.ekodi.kr';
    const canonicalRedirect=()=>{
      const target=new URL(url.pathname+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    };
    const missionApplicationMatch=normalizedMissionPath(url.pathname).match(MISSION_ACTIVITY_APPLICATION_RE);
    if(missionApplicationMatch)return submitMissionEventApplication(request,env,missionApplicationMatch[1],missionApplicationMatch[1]);
    if(normalizedMissionPath(url.pathname)===MISSION_TRIP_CONTENT_API)return routeMissionTripContent(request,env);
    if(normalizedMissionPath(url.pathname)===MISSION_COLLAB_API)return routeMissionCollabApi(request,env);
    if(normalizedMissionPath(url.pathname)===MISSION_ADMIN_ACTIVITY_RPC_API)return routeEkodiMission(request,env);
    if(['GET','HEAD'].includes(request.method)&&(normalizedMissionPath(url.pathname)===EKODIMISSION_PREFIX||normalizedMissionPath(url.pathname).startsWith(EKODIMISSION_PREFIX+'/')))return routeEkodiMission(request,env);
    if(url.pathname==='/health')return json(env,{ok:true,service:'ekodi-space',product:'operating-space',identity:'ekodi-id',workspaceIdentity:'workspace-id',routeModel:['root-slug','workspace-service'],memberNamespaceRequired:false,dataEnabled:runtimeConfig(env).dataEnabled,dataMode:runtimeConfig(env).dataMode});
    if(url.pathname==='/config.js')return withHeaders(env,new Response(`window.EKODI_SPACE_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}}),'config');
    if(url.pathname==='/storefront.json'){
      const slug=String(url.searchParams.get('slug')||'').toLowerCase();
      if(!['jadam','pizzamaru','yogurt'].includes(slug))return json(env,{error:'storefront_not_found'},404);
      const data=await publicStorefront(slug,env);
      return data?json(env,data):json(env,{error:'storefront_unavailable'},503);
    }
    if(url.pathname==='/storefront.css'||url.pathname==='/_ekodi/space/storefront.css')return withHeaders(env,restaurantStorefrontCss(),'storefront-asset');
    if(url.pathname==='/jadam-storefront.css'||url.pathname==='/_ekodi/space/jadam-storefront.css')return withHeaders(env,jadamStorefrontCss(),'storefront-asset');
    if(url.pathname==='/restaurant-storefront.css'||url.pathname==='/_ekodi/space/restaurant-storefront.css')return withHeaders(env,restaurantStorefrontCss(),'storefront-asset');
    if(url.pathname==='/mnubiz/assets/site.css')return withHeaders(env,mnubizPublicCss(),'mnubiz-asset');
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=workspace&source=space.ekodi.kr',307);
    if(url.pathname==='/auth/start'){
      if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
      return authRedirect(request,env);
    }
    if(['GET','HEAD'].includes(request.method)&&(url.pathname==='/pizzamaru/mokpodae'||url.pathname==='/pizzamaru/mokpodae/')){
      const target=new URL('/pizzamaru'+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':'pizzamaru/mokpodae->pizzamaru'}});
    }
    if(url.pathname==='/yogurtpurple'||url.pathname==='/yogurtpurple/'){
      return withHeaders(env,new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>삭제된 주소</title><body><main><h1>삭제된 주소입니다.</h1></main></body></html>',{status:410,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}),'space-gone');
    }
    if(legacyAlias&&(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html'))return new Response(null,{status:308,headers:{location:'https://ekodi.kr/my/','cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    if(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html')return appShell(request,env,'space-home');
    if(isPublicWorkspacePath(url.pathname)){
      const workspaceRoute=workspaceRouteFromPublicPath(url.pathname);
      if(legacyAlias&&url.pathname!=='/deployment-probe')return canonicalRedirect();
      const resolved=await pageProfile(url.pathname,env);
      const requested=workspaceRoute?.slug||workspaceSlugFromPublicPath(url.pathname);
      if(resolved.canonicalSlug&&requested&&resolved.canonicalSlug!==requested){
        const target=new URL(`/${resolved.canonicalSlug}${url.search}`,'https://ekodi.kr');
        return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':`${requested}->${resolved.canonicalSlug}`}});
      }
      if(resolved.status==='paused')return withHeaders(env,new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>사용자 사이트 일시중지 · EKODI</title><body><main><h1>사용자 사이트가 일시중지되었습니다.</h1><p>운영공간 관리자 설정에서 다시 활성화할 수 있습니다.</p></main></body></html>',{status:404,headers:{'content-type':'text/html; charset=utf-8'}}),'space-paused');
      if(isMnuBizWorkspaceSlug(requested)&&workspaceRoute?.service==='community'){
        const target=new URL('/community/', 'https://ekodi.kr');target.searchParams.set('workspace','mnubiz');
        return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-service':'mnubiz/community'}});
      }
      if(isMnuBizWorkspaceSlug(requested)&&!workspaceRoute?.service){
        const page=withHeaders(env,renderMnuBizPublicPage(),'space-organization');
        return injectEkodiShell(page,'community','public',{existingHeader:true});
      }
      if(isOrganizationWorkspaceSlug(requested)&&!workspaceRoute?.service){
        return withHeaders(env,await renderOrganizationPublicPage(request,env,resolved,requested),'space-organization');
      }
      if(resolved.storefront&&!workspaceRoute?.service){
        resolved.chrome=await publicSiteChrome(requested);
        const storefront=requested==='jadam'
          ?await renderJadamStorefrontPage(request,env,resolved,requested)
          :['pizzamaru','yogurt'].includes(requested)
            ?await renderRestaurantStorefrontPage(request,env,resolved,requested)
            :await renderStorefrontPage(request,env,resolved,requested);
        return withHeaders(env,storefront,'space-storefront');
      }
      return appShell(request,env,workspaceRoute?.service?'space-workspace-service':'space-workspace',resolved.profile);
    }
    return withHeaders(env,await env.ASSETS.fetch(request),'space-asset');
  }
};