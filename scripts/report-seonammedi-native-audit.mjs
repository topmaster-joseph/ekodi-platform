import fs from 'node:fs/promises';

const ROOTS=new Set(['canonical','customer']);
const DEVICES=new Set(['desktop','mobile']);
const PATHS=new Set(['/','/board/voices','/board/notices','/board/finance','/minutes/','/admin/']);
const REASONS=[
 'guest_compose_original_return_lost','guest_compose_purpose_mismatch',
 'guest_write_did_not_open_canonical_login','guest_manage_original_return_lost',
 'guest_write_entry_missing','guest_login_button_before_write',
 'guest_voice_session_gate_','guest_voice_admin_gate_','page_http_',
 'guest_write_login_click_failed','guest_manage_login_click_failed'
];
const safeBool=value=>value===true?'true':value===false?'false':'unknown';
export function safeAuditComment(report,runId){
 const rows=Array.isArray(report?.results)?report.results:[];
 const ok=rows.filter(r=>r?.ok===true).length;
 const failures=rows.filter(r=>r?.ok!==true).slice(0,24);
 const lines=[
  'EKODI native Chromium guest audit (redacted summary)',
  '',
  'Run: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/'+String(runId).replace(/[^0-9]/g,''),
  'Result: '+(report?.passed===true?'PASS':'FAIL / INCOMPLETE'),
  'Cases: '+ok+'/'+rows.length+' passed',
  'Authenticated Google write/admin CRUD: NOT TESTED (read-only guest audit)',
 ];
 for(const r of failures){
  const root=ROOTS.has(r?.origin)?r.origin:'unknown';
  const device=DEVICES.has(r?.device)?r.device:'unknown';
  const route=PATHS.has(r?.path)?r.path:'unknown';
  const reason=REASONS.filter(v=>String(r?.reason||'').includes(v)).join(',')||'other';
  lines.push('- '+root+' / '+device+' / '+route+' : '+reason);
  if(route==='/board/voices'){
   lines.push('  composeReturnPathMatches='+safeBool(r.composeReturnPathMatches)+
     ', composePurposeMatches='+safeBool(r.composePurposeMatches)+
     ', manageReturnMatches='+safeBool(r.manageReturnMatches));
  }
 }
 lines.push('No credentials, user identifiers, page text, query strings, or bearer tokens are included.');
 return lines.join('\n').slice(0,6500);
}
const main=process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href;
if(main){
 const issue=String(process.env.AUDIT_ISSUE_NUMBER||'');
 const repo=String(process.env.GITHUB_REPOSITORY||'');
 const run=String(process.env.GITHUB_RUN_ID||'');
 const token=String(process.env.GITHUB_TOKEN||'');
 if(!/^\d+$/.test(issue)||!/^\d+$/.test(run)||!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.]+$/.test(repo)||!token)
   throw new Error('trusted report dispatch configuration missing');
 const source=await fs.readFile('artifacts/seonammedi-nav-guest/report.json','utf8').catch(()=>null);
 const report=source?JSON.parse(source):{passed:false,results:[]};
 const body=safeAuditComment(report,run);
 const res=await fetch('https://api.github.com/repos/'+repo+'/issues/'+issue+'/comments',{
  method:'POST',
  headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json'},
  body:JSON.stringify({body})
 });
 if(!res.ok)throw new Error('GitHub sanitized report comment failed (HTTP '+res.status+')');
 console.log('Safe native audit summary posted to issue '+issue+' for run '+run);
}
