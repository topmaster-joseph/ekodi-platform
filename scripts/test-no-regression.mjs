import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const baseRef=String(process.env.GITHUB_BASE_REF||'').trim();
const cwd=process.cwd();
const gitOptions={cwd,encoding:'utf8',shell:process.platform==='win32'};
const normalize=s=>String(s||'').replace(/\\/g,'/');
const run=(dir)=>spawnSync(process.execPath,['--test','--test-reporter=tap','test/*.test.mjs'],{
  cwd:dir,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,NO_COLOR:'1'}
});
const failures=text=>{
  const counts=new Map();
  for(const line of normalize(text).split(/\r?\n/)){
    const m=line.match(/^not ok \d+ - (.+)$/);
    if(m) counts.set(m[1],(counts.get(m[1])||0)+1);
  }
  return counts;
};
const current=run(cwd);
const currentText=`${current.stdout||''}\n${current.stderr||''}`;
if(current.status===0){
  console.log('Full test suite: PASS');
  process.exit(0);
}
if(!baseRef){
  process.stdout.write(currentText);
  console.error('Full test suite failed outside a pull request; inherited failures are not waived on main.');
  process.exit(current.status||1);
}
const tmpRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ekodi-test-base-'));
const baseDir=path.join(tmpRoot,'base');
let base;
try{
  const fetch=spawnSync('git',['fetch','--no-tags','origin',`${baseRef}:refs/remotes/origin/${baseRef}`],gitOptions);
  if(fetch.status!==0) throw new Error(`cannot fetch base ${baseRef}: ${fetch.error?.message||fetch.stderr}`);
  const add=spawnSync('git',['worktree','add','--detach',baseDir,`origin/${baseRef}`],gitOptions);
  if(add.status!==0) throw new Error(`cannot create base worktree: ${add.error?.message||add.stderr}`);
  base=run(baseDir);
} finally {
  spawnSync('git',['worktree','remove','--force',baseDir],gitOptions);
  fs.rmSync(tmpRoot,{recursive:true,force:true});
}
const baseText=`${base.stdout||''}\n${base.stderr||''}`;
const cur=failures(currentText), old=failures(baseText), newFailures=[];
for(const [name,count] of cur){if(count>(old.get(name)||0)) newFailures.push(`${name} (${count} > ${old.get(name)||0})`);}
const currentTotal=[...cur.values()].reduce((a,b)=>a+b,0);
const baseTotal=[...old.values()].reduce((a,b)=>a+b,0);
console.log(`PR test regression gate: current failing tests=${currentTotal}, base failing tests=${baseTotal}`);
if(base.status===0||newFailures.length||currentTotal>baseTotal){
  console.error('New or worsened test failures detected.');
  for(const item of newFailures.slice(0,50)) console.error(`- ${item}`);
  process.exit(1);
}
console.log('No new test failures versus base branch. Existing base failures remain visible technical debt.');
