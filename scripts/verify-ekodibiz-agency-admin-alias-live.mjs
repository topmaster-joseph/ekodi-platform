// EKODI agency legacy admin alias: read-only real-host canary after protected Site Core promotion.
// Never send private user IDs, credentials, or application/payment requests.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const CANONICAL = 'https://ekodi.kr/ekodibiz/ai-agency/manage';
const PATHS = ['/ekodibiz/ai-agency/admin','/ekodibiz/ai-agency/admin/'];
const SYNTHETIC_QUERY = '?receiptToken=SYNTHETIC-NEVER-ISSUED-ALIAS-PROBE';

export async function verifyAgencyAdminAliasLive({ fetchImpl = fetch } = {}) {
  const checked = [];
  for(const path of PATHS){
    for(const method of ['GET','HEAD']){
      const response = await fetchImpl('https://ekodi.kr'+path+SYNTHETIC_QUERY,{
        method,redirect:'manual',signal:AbortSignal.timeout(15000)
      });
      assert.equal(response.status,308,method+' '+path+' must permanently redirect before workspace admin');
      const destination=response.headers.get('location') || '';
      assert.equal(new URL(destination,'https://ekodi.kr').href,CANONICAL,
        'The old admin URL must target the dedicated agency manager without exposing query parameters');
      assert.ok(!destination.includes('receiptToken')&&!destination.includes('SYNTHETIC'),
        'Never forward application/receipt query values');
      assert.match(response.headers.get('cache-control')||'',/no-store/i);
      assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
      checked.push({path,method,status:response.status});
    }
  }
  return {ok:true,legacyAgencyAdminRedirects:checked.length,canonical:CANONICAL};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  verifyAgencyAdminAliasLive().then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
    .catch(error=>{process.stderr.write('EKODIBIZ agency legacy admin alias canary FAILED: '+error.message+'\n');process.exitCode=1;});
}
