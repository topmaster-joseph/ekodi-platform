// Read-only AI Control artifact identity verifier.
// This is NOT proof of Cloudflare production promotion, rollback readiness,
// or an EKODI owner approval. It proves only that BOTH Worker configurations
// point to this independently checked, exact-byte application artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const digest=data=>'sha256:'+crypto.createHash('sha256').update(data).digest('hex');
const IDENTITY=/^sha256:[0-9a-f]{64}$/;
const SHA=/^[0-9a-f]{40}$/;
const CANONICAL_MAIN='.release/ai-control/worker.js';
const CANONICAL_ASSETS='./.release/ai-control/assets';

const fail=reason=>{throw new Error('EKODI_STAGED_APPLICATION_IDENTITY_'+reason)};
const configValue=(body,key)=>{
  const match=body.match(new RegExp('^\\s*'+key+'\\s*=\\s*"([^"\\n]+)"\\s*$','m'));
  return match?.[1]||null;
};
const walk=(dir,prefix='',out=[])=>{
  for(const name of fs.readdirSync(dir).sort()){
    const relative=prefix?prefix+'/'+name:name;
    const file=path.join(dir,name);
    const stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())fail('SYMLINK_FORBIDDEN');
    if(stat.isDirectory())walk(file,relative,out);
    else if(stat.isFile())out.push(relative);
    else fail('UNSUPPORTED_FILE_TYPE');
  }
  return out;
};
export function verifyStagedApplicationIdentity({
  root=process.cwd(),expectedDigest,sourceSha,
}={}){
  if(typeof root!=='string'||!path.isAbsolute(root))fail('INVALID_ROOT');
  const release=path.join(root,'.release','ai-control');
  const manifestPath=path.join(release,'artifact-manifest.json');
  if(!fs.existsSync(manifestPath))fail('MANIFEST_MISSING');
  let m;
  try{m=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{fail('MANIFEST_INVALID')}
  if(m?.schemaVersion!==1||m.artifact!=='ekodi-ai-control'||!Array.isArray(m.files)||
     !m.files.length||!IDENTITY.test(m.artifactDigest||''))fail('MANIFEST_CONTRACT_INVALID');
  if(!IDENTITY.test(expectedDigest||'')||m.artifactDigest!==expectedDigest)fail('EXPECTED_DIGEST_MISMATCH');
  if(!SHA.test(sourceSha||'')||m.sourceCommit!==sourceSha)fail('SOURCE_COMMIT_MISMATCH');

  const actual=walk(release).filter(p=>p!=='artifact-manifest.json').sort();
  const expected=m.files.map(x=>x?.path);
  if(expected.some(p=>typeof p!=='string'||!p||p.startsWith('/')||
       p.split('/').some(s=>!s||s==='.'||s==='..')||p.includes('\\')))fail('UNSAFE_MANIFEST_PATH');
  if(new Set(expected).size!==expected.length)fail('DUPLICATE_MANIFEST_PATH');
  if(JSON.stringify([...expected].sort())!==JSON.stringify(actual))fail('APPLICATION_FILE_SET_MISMATCH');
  if(!expected.includes('worker.js'))fail('WORKER_ENTRY_MISSING');
  for(const file of m.files){
    if(!IDENTITY.test(file.sha256||''))fail('FILE_HASH_INVALID');
    if(digest(fs.readFileSync(path.join(release,file.path)))!==file.sha256)fail('APPLICATION_BYTES_MISMATCH');
  }
  // Preserve the existing builder's canonical hash formula and ordering.
  // Preserve upstream JS Array.sort codepoint order, not locale collation.
  const ordered=[...m.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const canonical=ordered.map(x=>x.sha256+'  '+x.path+'\\n').join('');
  if(digest(Buffer.from(canonical,'utf8'))!==m.artifactDigest)fail('AGGREGATE_DIGEST_MISMATCH');

  for(const cfg of ['wrangler.ai.staging.release.toml','wrangler.ai.release.toml']){
    const configFile=path.join(root,cfg);
    if(!fs.existsSync(configFile))fail('WRANGLER_CONFIG_MISSING');
    const text=fs.readFileSync(configFile,'utf8');
    if(configValue(text,'main')!==CANONICAL_MAIN||
       configValue(text,'directory')!==CANONICAL_ASSETS||
       !/^no_bundle\\s*=\\s*true\\s*$/m.test(text)||
       configValue(text,'compatibility_date')!==m.compatibilityDate){
      fail('STAGING_PRODUCTION_CONFIG_MISMATCH');
    }
  }
  return Object.freeze({verified:true,applicationDigest:m.artifactDigest,
    sourceSha,workerEntry:'worker.js',fileCount:actual.length,
    stagingAndProductionReferenceIdenticalBytes:true,productionDeployed:false});
}
if(process.argv.includes('--verify')){
  try{
    const proof=verifyStagedApplicationIdentity({
      expectedDigest:process.env.EXPECTED_AI_ARTIFACT_DIGEST,
      sourceSha:process.env.GITHUB_SHA,
    });
    process.stdout.write(JSON.stringify(proof)+'\\n');
  }catch(error){
    console.error(String(error?.message||error));
    process.exitCode=1;
  }
}
