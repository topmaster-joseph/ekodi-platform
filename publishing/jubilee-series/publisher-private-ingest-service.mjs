// 출판: isolated server-only private review-9 ingestion orchestrator.
// It is deliberately NOT routed in publishing-worker.js. A trusted service
// binding must obtain authenticated manuscript bytes and verified actor.
// Staging/production is disabled unless all private R2 + D1 bindings exist.
import { stageReview9IntoPrivateR2 } from './private-r2-ingest.mjs';
import { persistPrivateReview9Receipt } from './private-ingest-receipt.mjs';
const deny=s=>{throw Error('PRIVATE_PUBLISHER_INGEST_DISABLED:'+s);};
export async function ingestReview9ViaProtectedPublisherService(env,{
  callerContext,expected,manifestBytes,readAsset,
}={}){
  if(env?.PUBLISHING_PRIVATE_INGEST_ENABLED!=='true')deny('feature-off');
  const db=env?.PUBLISHING_PRIVATE_INGEST_DB;
  if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')deny('private-db-unconfigured');
  if(typeof env?.PUBLISHING_PRIVATE_ASSETS?.put!=='function'||
    typeof env?.PUBLISHING_PRIVATE_ASSETS?.get!=='function'||
    typeof env?.PUBLISHING_INGEST_AUTH?.verifyServiceCaller!=='function')
    deny('private-asset-or-auth-unconfigured');
  const internal={
    ...env,
    PUBLISHING_INGEST_RECEIPTS:{
      persistReadbackReceipt:proposal=>persistPrivateReview9Receipt(
        db,proposal,new Date().toISOString()),
    },
  };
  return stageReview9IntoPrivateR2({
    env:internal,callerContext,expected,manifestBytes,readAsset,
  });
}
