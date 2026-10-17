/**
 * Manually dispatched production canary for *real*, separately Google-authenticated
 * Citizen Voices writer and site-authorized administrator accounts.
 *
 * Secrets are supplied only by GitHub Actions. Never log bearer tokens, email
 * addresses, response bodies or private admin listings. No production bypass.
 * This script creates at most one uniquely marked canary per public domain,
 * updates it once and soft-deletes only that same canary by verified post id.
 */
import {pathToFileURL} from 'node:url';

const HOSTS=[
  'https://seonammedi.kr/board',
  'https://ekodi.kr/seonammedi/board'
];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fail=reason=>{throw Error('citizen_live_google_canary:'+reason)};
const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;

export async function runCanary({
  writerToken=process.env.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN,
  adminToken=process.env.SEONAMMEDI_BOARD_CANARY_ADMIN_GOOGLE_TOKEN,
  runId=process.env.GITHUB_RUN_ID,
  fetchFn=globalThis.fetch,
  sleep=pause,
  log=console.log
}={}){
  if(typeof writerToken!=='string'||writerToken.length<32)fail('writer_Google_token_missing');
  if(typeof adminToken!=='string'||adminToken.length<32)fail('admin_Google_token_missing');
  if(writerToken===adminToken)fail('writer_and_admin_must_be_distinct_accounts');
  if(!/^\d{1,18}$/.test(String(runId||'')))fail('workflow_run_id_missing');
  if(typeof fetchFn!=='function')fail('fetch_unavailable');

  async function http(url,{method='GET',token=null,body=null}={}){
    const headers={'accept':'application/json'};
    if(token)headers.authorization='Bearer '+token;
    if(body!==null)headers['content-type']='application/json';
    // No request URL contains tokens, and errors must never include credentials.
    let response;
    try{response=await fetchFn(url,{method,headers,cache:'no-store',
      ...(body!==null?{body:JSON.stringify(body)}:{})});}
    catch{fail('network_unavailable')}
    const data=await response.json().catch(()=>({}));
    return {status:response.status,data};
  }
  function expect(result,status,stage){
    if(result.status!==status||result.data?.ok===false){
      fail(stage+'_http_'+result.status);
    }
    return result.data;
  }
  const identities={writer:[],admin:[]};
  for(const origin of HOSTS){
    for(const [role,token] of [['writer',writerToken],['admin',adminToken]]){
      const proof=expect(await http(origin+'/api/auth/session',{token}),200,role+'_session');
      if(proof.authenticated!==true||proof.provider!=='google'||!proof.email)fail(role+'_not_verified_Google');
      identities[role].push(String(proof.email).toLowerCase());
    }
    const denied=await http(origin+'/api/voices-fresh/admin',{token:writerToken});
    if(denied.status!==403)fail('writer_must_not_have_site_admin_permission_http_'+denied.status);
    const moderator=expect(await http(origin+'/api/voices-fresh/admin',{token:adminToken}),200,'admin_permission');
    if(!Array.isArray(moderator.items))fail('admin_permission_payload_invalid');
    log('[LIVE-GOOGLE-CANARY] Google identity, distinct writer/admin roles and server-owned permission verified: '+new URL(origin).hostname);
  }
  if(new Set(identities.writer).size!==1||new Set(identities.admin).size!==1)
    fail('identity_mismatch_across_domains');
  if(identities.writer[0]===identities.admin[0])fail('writer_and_admin_same_Google_identity');

  const created=[];
  async function listed(id,origin){
    const data=expect(await http(origin+'/api/voices-fresh'),200,'list');
    if(!Array.isArray(data.items))fail('list_payload_invalid');
    return data.items.find(item=>Number(item.id)===Number(id))||null;
  }
  async function awaitPublish(submissionId,origin,attempts=30){
    for(let attempt=0;attempt<attempts;attempt++){
      const item=expect(await http(origin+'/api/voices-fresh/submissions/'+submissionId),200,'publication_poll');
      if(item.status==='published'&&validId(item.id))return Number(item.id);
      await sleep(850);
    }
    return null;
  }
  async function cleanup(entry){
    if(entry.deleted)return;
    if(!entry.id&&entry.submissionId)entry.id=await awaitPublish(entry.submissionId,entry.origin,25);
    // Search only for the unique marker created by this very workflow run.
    if(!entry.id){
      const response=expect(await http(entry.origin+'/api/voices-fresh?q='+encodeURIComponent(entry.marker)),200,'cleanup_search');
      const exact=(response.items||[]).filter(item=>
        item.message===entry.marker||item.message===entry.marker+'-EDITED');
      if(exact.length===1&&validId(exact[0].id))entry.id=Number(exact[0].id);
    }
    if(!entry.id)fail('manual_canary_cleanup_may_be_needed_'+entry.marker);
    const existing=await listed(entry.id,entry.origin);
    if(!existing){entry.deleted=true;return;}
    if(existing.message!==entry.marker&&existing.message!==entry.marker+'-EDITED')
      fail('refusing_cleanup_unrelated_post_'+entry.id);
    expect(await http(entry.origin+'/api/voices-fresh/'+entry.id,{method:'DELETE',token:adminToken}),200,'cleanup_delete');
    if(await listed(entry.id,entry.origin))fail('cleanup_readback_failed_'+entry.id);
    entry.deleted=true;
  }

  try{
    for(let i=0;i<HOSTS.length;i++){
      const origin=HOSTS[i];
      const other=HOSTS[(i+1)%HOSTS.length];
      const entry={origin,other,marker:'EKODI-SEONAM-LIVE-GOOGLE-CANARY-'+runId+'-'+(i+1),
        submissionId:null,id:null,deleted:false};
      const accepted=expect(await http(origin+'/api/voices-fresh',{
        method:'POST',token:writerToken,body:{message:entry.marker}
      }),202,'writer_publish_ingress');
      if(accepted.queued!==true||!isUuid(accepted.submissionId))fail('write_queue_rejected');
      entry.submissionId=accepted.submissionId;
      created.push(entry);
      entry.id=await awaitPublish(entry.submissionId,origin);
      if(!entry.id)fail('durable_queue_publication_not_confirmed_'+entry.marker);

      for(const checked of [origin,other]){
        const row=await listed(entry.id,checked);
        if(!row||row.message!==entry.marker)fail('post_readback_mismatch_'+(checked===origin?'writer':'alternate'));
      }
      log('[LIVE-GOOGLE-CANARY] writer accepted, queued, published and cross-domain readback passed: host '+(i+1));

      const edited=entry.marker+'-EDITED';
      expect(await http(other+'/api/voices-fresh/'+entry.id,{
        method:'PUT',token:adminToken,body:{message:edited}
      }),200,'authorized_admin_edit');
      for(const checked of [origin,other]){
        const row=await listed(entry.id,checked);
        if(!row||row.message!==edited)fail('admin_edit_readback_mismatch');
      }
      log('[LIVE-GOOGLE-CANARY] authorized admin edit and cross-domain readback passed: host '+(i+1));

      await cleanup(entry);
      for(const checked of [origin,other]){
        if(await listed(entry.id,checked))fail('admin_delete_readback_mismatch');
      }
      log('[LIVE-GOOGLE-CANARY] authorized admin delete confirmed on both domains: host '+(i+1));
    }
    log('[LIVE-GOOGLE-CANARY] PASS: real Google writer queued CRUD and independent site-admin edit/delete, 2 domains');
    return {ok:true,hosts:HOSTS.length,postsCreated:created.length,postsCleaned:created.filter(item=>item.deleted).length};
  }finally{
    // Cleanup targets only IDs whose exact unique marker was confirmed.
    // Failure to clean is reported; never delete any unrelated citizen entry.
    for(const entry of created.filter(item=>!item.deleted)){
      try{await cleanup(entry);log('[LIVE-GOOGLE-CANARY] post-failure canary cleanup confirmed: '+entry.marker);}
      catch{console.error('[LIVE-GOOGLE-CANARY] cleanup needs manual review for marker: '+entry.marker);}
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCanary().catch(error=>{
    console.error('[LIVE-GOOGLE-CANARY] FAIL: '+String(error.message||'verification_failed').slice(0,180));
    process.exitCode=1;
  });
}
