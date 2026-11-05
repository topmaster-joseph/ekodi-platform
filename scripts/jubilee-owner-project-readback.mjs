// Private output from wrangler D1 only. Never log project IDs, author IDs or source bytes.
import {readFileSync} from 'node:fs';
const BOOKS=Object.freeze([
  ['volume1','희년과 하나님 나라의 회복'],
  ['volume2','우리는 다시 돌아갈 수 있는가'],
]);
const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function analyzeJubileeProjects(wranglerJson,expectedOwner){
  if(!VALID_ID.test(expectedOwner||''))throw Error('OWNER_BINDING_INVALID');
  let payload=wranglerJson;
  if(typeof payload==='string')payload=JSON.parse(payload);
  const rows=Array.isArray(payload)?payload.flatMap(x=>x?.results||[]):payload?.results||[];
  if(!Array.isArray(rows))throw Error('D1_RESULT_MALFORMED');
  const result={registered:0,distinct:false,books:[]};
  const ids=[];
  for(const [volume,title] of BOOKS){
    const matching=rows.filter(x=>x?.title===title);
    const duplicate=matching.length>1;
    const valid=matching.length===1&&matching[0]?.author_user_id===expectedOwner
      &&VALID_ID.test(matching[0]?.id||'');
    if(valid)ids.push(matching[0].id);
    result.books.push({
      volume,registered:valid,duplicate,
      stage:valid?String(matching[0].stage||'unknown'):'not-registered',
      digestRecorded:valid&&/^[0-9a-f]{64}$/.test(matching[0].manuscript_digest||''),
      revision:valid?Number(matching[0].revision)||null:null,
    });
    if(valid)result.registered++;
  }
  result.distinct=ids.length===2&&ids[0]!==ids[1];
  result.readyForPrivateIntake=result.registered===2&&result.distinct&&!result.books.some(x=>x.duplicate);
  return result;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/jubilee-owner-project-readback.mjs')){
  const p=process.argv[2];
  if(!p)throw Error('D1_QUERY_FILE_REQUIRED');
  const report=analyzeJubileeProjects(readFileSync(p,'utf8'),
    process.env.PUBLISHING_JUBILEE_AUTHOR_USER_ID);
  for(const b of report.books)
    console.log('JUBILEE_PROJECT_'+b.volume.toUpperCase(),
      'registered='+b.registered,'duplicate='+b.duplicate,
      'stage='+b.stage,'digestRecorded='+b.digestRecorded,'revision='+b.revision);
  console.log('JUBILEE_PROJECT_LINK_READY_FOR_PRIVATE_INTAKE='+report.readyForPrivateIntake);
  if(!report.readyForPrivateIntake)process.exitCode=2;
}
