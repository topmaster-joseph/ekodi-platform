const RAW_BASE='https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/agents/windows-pos/';
const DOWNLOAD_PREFIX='/cmpmyi/admin/agent/download/';
const FILES=Object.freeze({
  'setup-pos-agent.cmd':{type:'application/octet-stream',source:'setup-pos-agent.cmd'},
  'remove-pos-agent.cmd':{type:'application/octet-stream',source:'remove-pos-agent.cmd'},
  'start-pos-agent.cmd':{type:'application/octet-stream',source:'start-pos-agent.cmd'},
  'stop-pos-agent.cmd':{type:'application/octet-stream',source:'stop-pos-agent.cmd'},
  'install-pos-agent.ps1':{type:'text/plain; charset=utf-8',source:'install-pos-agent.ps1'},
  'uninstall-pos-agent.ps1':{type:'text/plain; charset=utf-8',source:'uninstall-pos-agent.ps1'},
  'diagnose-pos-targets.ps1':{type:'text/plain; charset=utf-8',source:'diagnose-pos-targets.ps1'},
  'EKODI-POS-Agent.ps1':{type:'text/plain; charset=utf-8',source:'EKODI-POS-Agent.ps1'},
  'pos-agent.config.example.json':{type:'application/json; charset=utf-8',source:'pos-agent.config.example.json'},
  'README.md':{type:'text/markdown; charset=utf-8',source:'README.md'},
});

function fileFromPath(pathname){
  const path=String(pathname||'');
  if(!path.startsWith(DOWNLOAD_PREFIX))return'';
  let name='';
  try{name=decodeURIComponent(path.slice(DOWNLOAD_PREFIX.length))}catch{return''}
  if(!name||name.includes('/')||name.includes('\\')||name==='.'||name==='..')return'';
  return Object.prototype.hasOwnProperty.call(FILES,name)?name:'';
}

export function isStorePosAgentDownloadPath(pathname){return Boolean(fileFromPath(pathname));}

export async function storePosAgentDownload(request,fetchImpl=fetch){
  const url=new URL(request.url);
  const name=fileFromPath(url.pathname);
  if(!name)return new Response('Not found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store','x-content-type-options':'nosniff'}});
  const spec=FILES[name];
  let upstream;
  try{
    upstream=await fetchImpl(RAW_BASE+encodeURIComponent(spec.source),{method:request.method==='HEAD'?'HEAD':'GET',redirect:'follow'});
  }catch{
    return new Response('POS Agent download source unavailable',{status:502,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  if(!upstream?.ok)return new Response('POS Agent download source unavailable',{status:502,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  const headers=new Headers({
    'content-type':spec.type,
    'content-disposition':`attachment; filename="${name}"`,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-ekodi-route':'cmpmyi-pos-agent-download',
  });
  const length=upstream.headers?.get?.('content-length');
  if(length)headers.set('content-length',length);
  return new Response(request.method==='HEAD'?null:upstream.body,{status:200,headers});
}

export const CMPMYI_POS_AGENT_DOWNLOADS=Object.freeze(Object.keys(FILES));
