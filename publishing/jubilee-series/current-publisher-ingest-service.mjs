// Fail-closed private service integration for current mixed Jubilee review files.
// Intentionally no HTTP handler and no automatic sales or publication.
import {stageCurrentJubileeIntoPrivateR2} from './current-private-intake.mjs';
import {persistCurrentJubileeReceipt} from './current-private-receipt.mjs';
const deny=reason=>{throw Error('CURRENT_JUBILEE_SERVICE_DISABLED:'+reason);};
const TITLES=[
  ['volume1','희년과 하나님 나라의 회복'],
  ['volume2','우리는 다시 돌아갈 수 있는가'],
];
export async function ingestCurrentJubileeViaProtectedPublisherService(env,args={}){
  if(env?.PUBLISHING_CURRENT_INGEST_ENABLED!=='true')deny('feature-off');
  const db=env?.PUBLISHING_PRIVATE_INGEST_DB;
  if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')deny('private-db-missing');
  if(typeof env?.PUBLISH_DB?.prepare!=='function')deny('workflow-project-db-missing');
  if(typeof env?.PUBLISHING_PRIVATE_ASSETS?.put!=='function'||
    typeof env?.PUBLISHING_PRIVATE_ASSETS?.get!=='function'||
    typeof env?.PUBLISHING_INGEST_AUTH?.verifyServiceCaller!=='function')
    deny('private-r2-or-service-auth-missing');
  const owner=String(env?.PUBLISHING_JUBILEE_AUTHOR_USER_ID||'').trim();
  if(!owner)deny('verified-owner-config-missing');
  // No project or manuscript access before trusted publisher service identity.
  const principal=await env.PUBLISHING_INGEST_AUTH.verifyServiceCaller(args.callerContext,{
    capability:'publishing.private-ingest',seriesId:'EKODI-JUBILEE-THEOLOGY',
  });
  if(principal?.authorized!==true||principal.serviceId!=='publisher-private-ingestion'||
    !principal.actorId)deny('service-caller-denied');
  const ids={};
  for(const [volume,title] of TITLES){
    const result=await env.PUBLISH_DB.prepare(
      "SELECT id,stage,author_user_id FROM publishing_workflow_projects "+
      "WHERE author_user_id=? AND title=? AND field_id='humanities' "+
      "AND collection_id='human' ORDER BY created_at ASC LIMIT 1")
      .bind(owner,title).first();
    if(!result?.id||result.author_user_id!==owner||
      !['planning','drafting','changes_requested','in_review'].includes(result.stage))
      deny('registered-private-owner-project-required');
    ids[volume]=result.id;
  }
  if(ids.volume1===ids.volume2)deny('duplicate-project-ids');
  // The trust anchor comes from a publisher-controlled binding, never the intake request.
  const expected=env?.PUBLISHING_CURRENT_INTAKE_INTENT;
  if(expected?.schemaVersion!==2||!expected?.artifactPackage?.manifestSha256)
    deny('publisher-signed-intent-missing');
  const internal={...env,PUBLISHING_INGEST_RECEIPTS:{
    persistReadbackReceipt:proposal=>persistCurrentJubileeReceipt(
      db,proposal,new Date().toISOString()),
  }};
  return stageCurrentJubileeIntoPrivateR2({...args,env:internal,expected,projectIds:ids});
}
