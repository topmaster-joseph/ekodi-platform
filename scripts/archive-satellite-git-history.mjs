import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const execFile=promisify(execFileCallback);
const readJson=async file=>JSON.parse((await readFile(new URL('../'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const run=async (binary,args,options={})=>{
  const {stdout}=await execFile(binary,args,{maxBuffer:16*1024*1024,windowsHide:true,...options});
  return stdout.trim();
};
const refMap=async gitDir=>{
  const raw=await run('git',['-C',gitDir,'for-each-ref','--format=%(refname) %(objectname)']);
  return raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).sort();
};
export const validateArchiveSource=(repository,registry)=>{
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||''))throw Error('Repository argument must be owner/repo');
  if(repository===registry?.canonicalPlatformRepository)throw Error('Canonical repository is not a satellite retirement candidate');
  if(!(registry?.repositories||[]).some(x=>x.name===repository && x.role!=='canonical-platform'))throw Error('Unregistered satellite rejected');
  return repository;
};

/**
 * Read-only Git acquisition, then local bundle + full restore drill.
 * Does not contact GitHub APIs for deletion, read private secrets, or mutate source repos.
 * The destination must be a new, private directory; never overwrites previous proof.
 */
export async function createRestorableGitArchive({repository,source,destination}) {
  if(typeof destination!=='string'||!isAbsolute(destination))throw Error('Archive destination must be absolute');
  const root=resolve(destination);
  if(existsSync(root))throw Error('Archive destination already exists; refusing overwrite');
  await mkdir(dirname(root),{recursive:true});
  await mkdir(root);
  const mirror=join(root,'mirror.git');
  if(source){
    await run('git',['clone','--mirror',source,mirror]);
  }else{
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||''))throw Error('Invalid repository');
    await run('gh',['repo','clone',repository,mirror,'--','--mirror']);
  }
  await run('git',['-C',mirror,'fsck','--full','--no-reflogs']);
  const originalRefs=await refMap(mirror);
  if(!originalRefs.length||!originalRefs.some(x=>x.startsWith('refs/heads/main ')))throw Error('Source has no main branch or visible refs');
  const mainSha=await run('git',['-C',mirror,'rev-parse','refs/heads/main']);
  const bundle=join(root,'all-refs.bundle');
  await run('git',['-C',mirror,'bundle','create',bundle,'--all']);
  await run('git',['-C',mirror,'bundle','verify',bundle]);
  const restored=join(root,'restore-drill.git');
  await run('git',['clone','--mirror',bundle,restored]);
  await run('git',['-C',restored,'fsck','--full','--no-reflogs']);
  const restoredRefs=await refMap(restored);
  if(originalRefs.join('\n')!==restoredRefs.join('\n'))throw Error('All-ref restore mismatch');
  const restoredMain=await run('git',['-C',restored,'rev-parse','refs/heads/main']);
  if(restoredMain!==mainSha)throw Error('Restored main SHA mismatch');
  const bytes=await readFile(bundle);
  const report={
    contract:'ekodi.satellite-history-backup.v1',
    repository:repository||'synthetic-local-fixture',
    sourceMainSha:mainSha,
    restoredMainSha:restoredMain,
    gitRefCount:originalRefs.length,
    bundleBytes:(await stat(bundle)).size,
    bundleSha256:createHash('sha256').update(bytes).digest('hex'),
    check:'mirror-git-fsck-bundle-verify-full-ref-restore-git-fsck',
    offsiteCopyVerified:false,
    productionReleaseVerified:false,
    independentRollbackVerified:false,
    deletionAuthorized:false,
    deletionPerformed:false
  };
  await writeFile(join(root,'restore-evidence.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}
async function main(){
  const args=process.argv.slice(2);
  const at=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]||null};
  const repository=at('--repository'),destination=at('--destination');
  if(!repository||!destination||args.some(x=>!['--repository','--destination',repository,destination].includes(x))){
    throw Error('Usage: node scripts/archive-satellite-git-history.mjs --repository OWNER/REPO --destination ABSOLUTE_NEW_PRIVATE_DIRECTORY');
  }
  const registry=await readJson('config/repository-source-of-truth.json');
  validateArchiveSource(repository,registry);
  const report=await createRestorableGitArchive({repository,destination});
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error('Satellite history backup failed (source unchanged): '+error.message);process.exitCode=1;});
}
