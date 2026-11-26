// EKODI Print production canary — GET only, no customer data or orders.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const PRINT_PATHS=Object.freeze(['/print/','/print/cards/','/print/banners/','/print/flyers/','/print/posters/','/print/stickers/','/print/booklets/']);
const ORIGIN='https://ekodi.kr';
const HTML_MARKERS=['id="products"','id="editor"','id="cardHandoff"','id="requestQuote"','/ekodibiz/cards/','/print/studio.js','/print/studio.css'];
function inspect(path,type,body){
  if(PRINT_PATHS.includes(path)){
    assert.match(type,/text\/html/i,path+' content-type');
    for(const marker of HTML_MARKERS) assert.ok(body.includes(marker),path+' missing '+marker);
    assert.match(body,/<meta name="robots" content="noindex,nofollow"/,path+' privacy');
  }else if(path==='/print/studio.js'){
    assert.match(type,/javascript/i,path+' content-type');
    for(const marker of ['createObjectURL','mailto:ekodibiz@gmail.com','svgFor(',"'requestQuote'"])
      assert.ok(body.includes(marker),path+' missing '+marker);
  }else{
    assert.match(type,/css/i,path+' content-type');
    for(const marker of ['.products','@media print','@media(max-width:480px)'])
      assert.ok(body.includes(marker),path+' missing '+marker);
  }
}
export async function verifyPrintProduction({fetchImpl=fetch,log=()=>{}}={}){
  const checked=[];
  for(const path of [...PRINT_PATHS,'/print/studio.js','/print/studio.css']){
    let error;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetchImpl(ORIGIN+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000)});
        if(response.status>=500&&attempt<2)continue;
        assert.equal(response.status,200,path+' unexpected status '+response.status);
        const body=await response.text();
        inspect(path,response.headers.get('content-type')||'',body);
        checked.push({path,status:response.status,characters:body.length});
        log('OK '+path);
        error=null;break;
      }catch(err){
        error=err;
        if(err?.name==='AssertionError')break;
      }
    }
    if(error)throw Error('EKODI Print canary failure '+path+': '+String(error.message||error));
  }
  const res=await fetchImpl(ORIGIN+'/__ekodi/version',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000)});
  assert.equal(res.status,200,'Shared Site attestation response');
  const version=await res.json();
  assert.equal(version.service,'shared-site');
  assert.equal(version.ok,true);
  assert.ok(version.versionId&&version.versionId!=='unknown','missing release version');
  log('Verified '+checked.length+' public print routes/assets on Shared Site version '+version.versionId);
  return {checked,versionId:version.versionId};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  verifyPrintProduction({log:console.log}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
