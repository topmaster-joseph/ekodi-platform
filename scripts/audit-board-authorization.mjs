/**
 * Non-destructive public authorization probe. No credential or user data is read.
 * Anonymous body-less POST/PATCH/PUT/DELETE requests must never succeed.
 * This does NOT replace real logged-in writer/admin E2E, dynamic tenant inventory,
 * or browser login/session tests. Never label this a complete board audit.
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const manifestPath = new URL('../config/board-authorization-matrix.json', import.meta.url);
export const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateRegistryCoverage(matrix, boardPolicy, browserPolicy) {
  const represented=new Set([
    ...(matrix.boards||[]).map(x=>x.id),
    ...(matrix.contractOnly||[]).map(x=>x.id)
  ]);
  const registered=new Set([
    ...(boardPolicy.verifiedIndependentSurfaces||[]).map(x=>x.id),
    ...(browserPolicy.surfaces||[]).filter(x=>x.kind==='board').map(x=>x.id)
  ]);
  return [...registered].filter(id=>!represented.has(id)).map(id=>'unregistered-live-board:'+id);
}

export async function validateSourceRegistryCoverage(matrix=manifest) {
  const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
  const [board,browser]=await Promise.all([
    read('config/replaceable-board-engine-policy.json'),
    read('config/board-surface-verification.json')
  ]);
  return validateRegistryCoverage(matrix,board,browser);
}

export function validateMatrix(matrix = manifest) {
  const errors = [];
  if (matrix.policyId !== 'EKODI-BOARD-AUTH-EVERY-SURFACE-001') errors.push('policy-id');
  if (matrix.realUserCrudProof !== 'required_not_substituted_by_mocks') errors.push('real-user-proof');
  if (matrix.dynamicTenantCoverage !== 'requires_authenticated_read_only_inventory_and_per_tenant_probes') errors.push('tenant-inventory');
  const ids = new Set();
  for (const board of matrix.boards || []) {
    if (!board.id || ids.has(board.id)) errors.push('duplicate/missing-id:' + board.id);
    ids.add(board.id);
    const parsed = new URL(board.url);
    if (parsed.protocol !== 'https:' || !['ekodi.kr','seonammedi.kr'].includes(parsed.hostname)) errors.push('untrusted-origin:' + board.id);
    if (!board.read?.startsWith('/') || !(board.deny?.length)) errors.push('missing-probes:' + board.id);
    for (const probe of board.deny || []) {
      if (!['POST','PATCH','PUT','DELETE','GET'].includes(probe.method) || !probe.path?.startsWith('/')) errors.push('unsafe-probe:' + board.id);
      if (probe.method !== 'GET' && !(/(?:\/0(?:\/|$)|\/api\/(?:posts|admin\/(?:posts|finance|notices))$)/.test(probe.path))) errors.push('mutable-existing-target-risk:' + board.id + probe.path);
    }
  }
  for (const expected of ['cgma.board','cheonggye.board','ekodimission.board','ekodichurch.board','seonammedi.citizen_voice','seonammedi.finance','seonammedi.notice']) {
    if (!ids.has(expected)) errors.push('missing-required-board:' + expected);
  }
  for (const board of matrix.contractOnly || []) {
    if (ids.has(board.id)) errors.push('double-classified-board:' + board.id);
    if (!board.reason) errors.push('missing-coverage-reason:' + board.id);
  }
  return errors;
}

async function fetchBounded(url, options, fetcher, pause) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetcher(url, {...options, redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(12000)});
    } catch (error) {
      if (attempt === 2) throw error;
      await pause((attempt+1)*500);
      continue;
    }
    // A traffic-limit response is not a reason to increase requests.
    if ([429, 1027].includes(response.status)) return response;
    if (response.status >= 500 && attempt < 2 && options.method === 'GET') {await pause((attempt+1)*500);continue;}
    return response;
  }
}

export async function probeAnonymousMatrix({matrix=manifest,fetcher=fetch,pause=sleep}={}) {
  const errors=validateMatrix(matrix);
  if (errors.length) return {ok:false, errors, checked:[], fullyVerified:false};
  const checked=[];
  for (const board of matrix.boards) {
    const root = board.url.replace(/\/+$/,'');
    const readUrl = root + board.read;
    try {
      const r=await fetchBounded(readUrl,{method:'GET',headers:{accept:'application/json'}},fetcher,pause);
      const ok=r.status===200;
      checked.push({board:board.id,method:'GET',path:board.read,status:r.status,ok});
      if(!ok) errors.push(board.id+':health:'+r.status);
    } catch(e){errors.push(board.id+':health:'+e.message);}
    for (const entry of board.deny) {
      const url=root+entry.path;
      // The request contains no bearer, cookies, token, or content; no existing
      // row ID is used, and a valid authorable body is never supplied.
      const options={method:entry.method,headers:{'content-type':'application/json','accept':'application/json'},...(entry.method==='GET'?{}:{body:'{}'})};
      try {
        const r=await fetchBounded(url,options,fetcher,pause);
        const ok=r.status===401||r.status===403;
        checked.push({board:board.id,method:entry.method,path:entry.path,status:r.status,ok});
        if(!ok) errors.push(board.id+':anonymous-write-not-denied:'+entry.method+':'+entry.path+':'+r.status);
      } catch(e){errors.push(board.id+':'+entry.method+':'+entry.path+':'+e.message);}
    }
  }
  return {ok:errors.length===0,errors,checked,contractOnly:matrix.contractOnly,
    anonymousGuardsVerified:errors.length===0,
    authenticatedWriterVerified:false,authenticatedManagerVerified:false,
    dynamicTenantInventoryVerified:false,fullyVerified:false};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const live=process.argv.includes('--live');
  if(!live){
    const errors=[...validateMatrix(),...(await validateSourceRegistryCoverage())];
    console.log(JSON.stringify({mode:'contract',ok:errors.length===0,declaredBoards:manifest.boards.length,unverifiedClasses:manifest.contractOnly,errors,fullyVerified:false},null,2));
    if(errors.length)process.exitCode=1;
  } else {
    const registryErrors=await validateSourceRegistryCoverage();
    if(registryErrors.length)throw new Error(registryErrors.join('; '));
    probeAnonymousMatrix().then(result=>{
      console.log(JSON.stringify({mode:'anonymous-live',...result},null,2));
      if(!result.ok)process.exitCode=1;
    },err=>{console.error('BOARD-AUTH AUDIT FAILED:',err.message);process.exitCode=1;});
  }
}
