/**
 * Explicit post-cutover purge of old citizen data. DOES NOT run on import/deploy.
 * Operator runs only after a guarded Worker cutover has disabled legacy routes
 * and its queue consumer. No content backup or migration is created.
 *
 * Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 * Usage: node services/independent-board/voices-fresh/purge-legacy.mjs --execute
 */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DB='ekodi-independent-board';
const BUCKET='ekodi-independent-board-files';
const PREFIX='seonammedi/voices/';
const CONFIG=resolve(process.env.EKODI_BOARD_WRANGLER_CONFIG||'.wrangler.independent-board.runtime.toml');

export function keysFromCitizenRows(rows){
 const keys=new Set();
 for(const row of rows){
   let list=[];
   try{list=JSON.parse(row.image_keys||'[]')}catch{throw Error('malformed_legacy_image_index')}
   if(!Array.isArray(list))throw Error('malformed_legacy_image_index');
   for(const value of list){
     if(typeof value!=='string'||!value.startsWith(PREFIX)||value.includes('..')||value.includes('\\')||value.length>1024)
       throw Error('untrusted_legacy_media_key');
     keys.add(value);
   }
 }
 return [...keys];
}
export async function verifyReady(fetcher=fetch){
 for(const origin of ['https://seonammedi.kr/board','https://ekodi.kr/seonammedi/board']){
   const page=await fetcher(origin+'/voices',{cache:'no-store'});
   if(!page.ok||!(await page.text()).includes('id="freshWrite"'))throw Error('fresh_ui_not_live');
   const old=await fetcher(origin+'/api/posts',{cache:'no-store'});
   if(old.status!==410)throw Error('old_api_not_disabled');
   const health=await fetcher(origin+'/health',{cache:'no-store'});
   const data=await health.json().catch(()=>({}));
   if(!health.ok||data.legacyQueue!=='disabled')throw Error('old_queue_not_disabled');
 }
}
export async function purgeOldRecords({loadRows,deleteFile,execute,counts,verify=verifyReady}){
 await verify();
 const before=await counts();
 const rows=await loadRows();
 const keys=keysFromCitizenRows(rows);
 for(const key of keys)await deleteFile(key);
 await execute("DELETE FROM board_replies; DELETE FROM board_files; DELETE FROM board_posts;");
 const after=await counts();
 if(after.posts!==0||after.replies!==0||after.files!==0)throw Error('legacy_data_purge_unconfirmed');
 if(after.notices!==before.notices||after.finance!==before.finance)throw Error('unrelated_board_modified');
 return {removedRows:{posts:before.posts,replies:before.replies,files:before.files},removedReferencedMedia:keys.length,noticesRetained:after.notices,financeRetained:after.finance};
}
function wrangler(args){
 const result=spawnSync('npx',['--yes','wrangler@4.119.0',...args,'--config',CONFIG],{
  encoding:'utf8',env:process.env,maxBuffer:32*1024*1024
 });
 if(result.error||result.status!==0)throw Error('wrangler_command_failed');
 return result.stdout||'';
}
function sql(statement){
 const data=JSON.parse(wrangler(['d1','execute',DB,'--remote','--json','--command',statement]));
 if(!Array.isArray(data)||data.some(x=>x.success===false))throw Error('d1_query_failed');
 return data.flatMap(x=>x.results||[]);
}
function countTables(){
 const sqlText=[
  "(SELECT count(*) FROM board_posts) AS posts",
  "(SELECT count(*) FROM board_replies) AS replies",
  "(SELECT count(*) FROM board_files) AS files",
  "(SELECT count(*) FROM notice_posts) AS notices",
  "(SELECT count(*) FROM finance_posts) AS finance"
 ].join(', ');
 const row=sql('SELECT '+sqlText)[0]||{};
 return Object.fromEntries(['posts','replies','files','notices','finance'].map(k=>[k,Number(row[k]||0)]));
}
async function main(){
 if(!process.argv.includes('--execute'))throw Error('explicit_execute_flag_required');
 if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('cloudflare_credentials_required');
 const result=await purgeOldRecords({
  loadRows:()=>sql('SELECT id,image_keys FROM board_posts'),
  deleteFile:async key=>{wrangler(['r2','object','delete',BUCKET+'/'+key,'--remote','--force'])},
  execute:async statement=>{sql(statement)},
  counts:async()=>countTables()
 });
 // Report counts only, never any personal content or object keys.
 console.log(JSON.stringify({ok:true,...result,mediaScope:'referenced-legacy-voice-objects-only'}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('legacy-citizen-purge-blocked:',String(error.message||error));process.exitCode=1});
}
