import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, hostname, platform, release } from 'node:os';
import { dirname, join } from 'node:path';

const VERSION = '1.0.0';
const API_DEFAULT = 'https://api.ekodi.kr';
const HOME = process.env.EKODI_TAPO_HOME || join(homedir(), '.ekodi-tapo-bridge');
const CONFIG_PATH = process.env.EKODI_TAPO_CONFIG || join(HOME, 'config.json');
const sessions = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

async function readConfig() {
  try { return JSON.parse(await readFile(CONFIG_PATH, 'utf8')); }
  catch { return { apiBase: API_DEFAULT, port: 8789, cameras: [] }; }
}
async function saveConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
function authHeaders(config, json = false) {
  return {
    authorization: `Bearer ${config.deviceToken || ''}`,
    'x-ekodi-device-id': config.deviceId || '',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}
async function api(config, pathname, options = {}) {
  const response = await fetch(`${config.apiBase || API_DEFAULT}${pathname}`, {
    ...options, headers: { ...authHeaders(config, Boolean(options.body)), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `EKODI API ${response.status}`);
  return data;
}
function cameraProjection(camera) {
  return {
    externalId: clean(camera.id, 100).toLowerCase(),
    label: clean(camera.label || camera.id, 80),
    type: 'camera',
    model: clean(camera.model, 80),
    locationLabel: clean(camera.locationLabel, 120),
    protocols: ['rtsp'],
    capabilities: ['camera.live','camera.status'],
  };
}
async function enroll(config, enrollmentCode) {
  const response = await fetch(`${config.apiBase || API_DEFAULT}/api/device-agent/enroll`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({
      enrollmentCode, platform:'edge-bridge', hostname:hostname(),
      osVersion:`${platform()} ${release()}`, agentVersion:VERSION,
      capabilities:{ providerBridge:true, cameraStreaming:true },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `등록 실패 (${response.status})`);
  config.deviceId=data.deviceId; config.deviceToken=data.deviceToken;
  config.apiBase=data.apiBase || config.apiBase || API_DEFAULT;
  await saveConfig(config);
  return config;
}
async function heartbeat(config) {
  return api(config, '/api/device-agent/heartbeat', {
    method:'POST',
    body:JSON.stringify({
      hostname:hostname(), osVersion:`${platform()} ${release()}`, agentVersion:VERSION,
      capabilities:{ providerBridge:true, cameraStreaming:true },
      settings:{ providerBridge:{ publicBase:clean(config.publicBase,300), devices:(config.cameras||[]).map(cameraProjection) } },
    }),
  });
}
function secureEqual(a,b) {
  const x=Buffer.from(String(a||'')), y=Buffer.from(String(b||''));
  return x.length===y.length && x.length>0 && timingSafeEqual(x,y);
}
function findCamera(config, externalId) {
  return (config.cameras||[]).find(c=>clean(c.id,100).toLowerCase()===externalId) || null;
}
async function completeCommand(config, command, success, result) {
  return api(config, `/api/device-agent/commands/${encodeURIComponent(command.id)}/result`, {
    method:'POST', body:JSON.stringify({success,result}),
  });
}
async function acceptCommand(config, command) {
  if (command.type !== 'camera.live.start') {
    await completeCommand(config, command, false, {message:'Tapo Bridge가 허용하지 않는 명령입니다.'});
    return;
  }
  const p=command.payload||{};
  const camera=findCamera(config,clean(p.externalId,100).toLowerCase());
  const expires=new Date(p.expiresAt||0).getTime();
  if (!camera || !/^str_[a-f0-9-]{36}$/.test(p.sessionId||'') || !/^[a-f0-9]{48}$/.test(p.sessionSecret||'') || expires<=Date.now()) {
    await completeCommand(config,command,false,{message:'카메라 스트림 세션이 유효하지 않습니다.'});
    return;
  }
  sessions.set(p.sessionId,{ externalId:clean(p.externalId,100).toLowerCase(), secret:p.sessionSecret, expiresAt:p.expiresAt });
  await completeCommand(config,command,true,{message:'카메라 실시간 보기 세션을 열었습니다.',sessionId:p.sessionId,expiresAt:p.expiresAt});
}
async function pollLoop(config) {
  for (;;) {
    try {
      const data=await api(config,'/api/device-agent/commands/next');
      if(data.command) await acceptCommand(config,data.command);
    } catch(error) {
      console.error('[Tapo Bridge] command:',error.message);
      await sleep(4000);
    }
    await sleep(800);
  }
}
async function heartbeatLoop(config) {
  for (;;) {
    try { await heartbeat(config); }
    catch(error){ console.error('[Tapo Bridge] heartbeat:',error.message); }
    await sleep(30000);
  }
}
function ffmpegArgs(config,camera) {
  if (camera.synthetic === true) {
    return ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=640x360:rate=3','-an','-vf','fps=3','-q:v','5','-f','mpjpeg','pipe:1'];
  }
  return ['-hide_banner','-loglevel','error','-rtsp_transport','tcp','-i',camera.rtspUrl,'-an','-vf','fps=3,scale=1280:-2','-q:v','5','-f','mpjpeg','pipe:1'];
}
function streamCamera(config,camera,response) {
  if (!camera.synthetic && !camera.rtspUrl) {
    response.writeHead(503,{'content-type':'text/plain'});
    response.end('RTSP camera is not configured.');
    return;
  }
  const ffmpeg=spawn(config.ffmpegPath||'ffmpeg',ffmpegArgs(config,camera),{windowsHide:true,stdio:['ignore','pipe','pipe']});
  response.writeHead(200,{
    'content-type':'multipart/x-mixed-replace; boundary=ffmpeg',
    'cache-control':'no-store, no-cache, must-revalidate',
    'pragma':'no-cache','x-content-type-options':'nosniff',
  });
  ffmpeg.stdout.pipe(response);
  ffmpeg.stderr.on('data',chunk=>console.error('[Tapo Bridge] ffmpeg:',String(chunk).trim()));
  const stop=()=>{ if(!ffmpeg.killed) ffmpeg.kill(); };
  response.on('close',stop); response.on('error',stop); ffmpeg.on('error',stop);
}
function createBridgeServer(config) {
  return createServer((request,response)=>{
    const url=new URL(request.url||'/','http://127.0.0.1');
    if(request.method==='GET' && url.pathname==='/health'){
      response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      response.end(JSON.stringify({ok:true,version:VERSION,cameras:(config.cameras||[]).length}));
      return;
    }
    const match=url.pathname.match(/^\/stream\/(str_[a-f0-9-]{36})$/);
    if(request.method!=='GET'||!match){response.writeHead(404);response.end();return;}
    const session=sessions.get(match[1]);
    const expires=new Date(session?.expiresAt||0).getTime();
    if(!session||expires<=Date.now()||!secureEqual(session.secret,url.searchParams.get('token'))){
      sessions.delete(match[1]);
      response.writeHead(401,{'cache-control':'no-store'});
      response.end('stream session expired or invalid');
      return;
    }
    const camera=findCamera(config,session.externalId);
    if(!camera){response.writeHead(404);response.end();return;}
    streamCamera(config,camera,response);
  });
}
function parseArgs(argv) {
  const values={command:argv[2]||'start'};
  for(let i=3;i<argv.length;i+=1){
    const key=argv[i];if(!key.startsWith('--'))continue;
    values[key.slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;
  }
  return values;
}
function ffmpegAvailable(config) {
  return spawnSync(config.ffmpegPath||'ffmpeg',['-version'],{windowsHide:true,encoding:'utf8'}).status===0;
}
async function startBridge(config) {
  if(!config.deviceId||!config.deviceToken) throw new Error('브리지가 EKODI에 등록되지 않았습니다. 먼저 init을 실행하세요.');
  if(!config.publicBase) throw new Error('publicBase가 없습니다. HTTPS Tunnel 주소를 설정하세요.');
  if(!ffmpegAvailable(config)) throw new Error('ffmpeg를 찾을 수 없습니다.');
  const port=Math.max(1024,Math.min(65535,Number(config.port)||8789));
  const server=createBridgeServer(config);
  server.listen(port,'127.0.0.1',()=>console.log(`[Tapo Bridge] http://127.0.0.1:${port} · cameras=${(config.cameras||[]).length}`));
  await heartbeat(config);
  heartbeatLoop(config);
  pollLoop(config);
}
function validateCameraInput(id,rtspUrl) {
  const externalId=clean(id,100).toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(externalId)) throw new Error('camera id는 영문/숫자/._- 만 사용할 수 있습니다.');
  let url;
  try{url=new URL(rtspUrl);}catch{throw new Error('RTSP URL이 유효하지 않습니다.');}
  if(url.protocol!=='rtsp:') throw new Error('카메라 주소는 rtsp:// 이어야 합니다.');
  return {externalId,rtspUrl:url.toString()};
}
async function initBridge(args) {
  const config=await readConfig();
  config.apiBase=clean(args['api-base']||config.apiBase||API_DEFAULT,300);
  config.publicBase=clean(args['public-base']||config.publicBase,300);
  config.port=Number(args.port||config.port||8789);
  if(!args['enrollment-code']) throw new Error('--enrollment-code가 필요합니다.');
  await enroll(config,clean(args['enrollment-code'],100));
  console.log(`[Tapo Bridge] EKODI 등록 완료: ${config.deviceId}`);
}
async function addCamera(args) {
  const config=await readConfig();
  const raw=args['rtsp-url']||process.env.EKODI_TAPO_RTSP_URL||'';
  const {externalId,rtspUrl}=validateCameraInput(args.id,raw);
  const next={id:externalId,label:clean(args.label||externalId,80),model:clean(args.model,80),locationLabel:clean(args.location,120),rtspUrl};
  config.cameras=(config.cameras||[]).filter(c=>clean(c.id,100).toLowerCase()!==externalId);
  config.cameras.push(next);
  await saveConfig(config);
  console.log(`[Tapo Bridge] camera saved: ${externalId}`);
}
async function updateBridge(args) {
  const config=await readConfig();
  if(args['public-base']) config.publicBase=clean(args['public-base'],300);
  if(args.port) config.port=Number(args.port);
  if(args['ffmpeg-path']) config.ffmpegPath=clean(args['ffmpeg-path'],300);
  await saveConfig(config);
  console.log('[Tapo Bridge] bridge settings updated');
}
async function doctor(config) {
  console.log(JSON.stringify({
    version:VERSION,
    registered:Boolean(config.deviceId&&config.deviceToken),
    apiBase:config.apiBase||API_DEFAULT,
    publicBaseReady:Boolean(config.publicBase),
    cameras:(config.cameras||[]).map(c=>({id:c.id,label:c.label,model:c.model||''})),
    ffmpeg:ffmpegAvailable(config),
    configPath:CONFIG_PATH,
  },null,2));
}
async function selfTest(config) {
  if(!ffmpegAvailable(config)) throw new Error('SELF_TEST_FFMPEG_MISSING');
  const camera={id:'synthetic',label:'Synthetic Camera',synthetic:true};
  const testConfig={...config,cameras:[camera],port:0};
  const server=createBridgeServer(testConfig);
  const sessionId=`str_${crypto.randomUUID()}`;
  const secret=randomBytes(24).toString('hex');
  sessions.set(sessionId,{externalId:'synthetic',secret,expiresAt:new Date(Date.now()+60000).toISOString()});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  try {
    const response=await fetch(`http://127.0.0.1:${port}/stream/${sessionId}?token=${secret}`);
    if(!response.ok || !String(response.headers.get('content-type')).includes('multipart/x-mixed-replace')) throw new Error('SELF_TEST_HTTP_FAILED');
    const reader=response.body.getReader();
    let bytes=0,jpeg=false;
    while(bytes<4096){
      const {value,done}=await reader.read();
      if(done)break;
      if(value){
        bytes+=value.length;
        for(let i=0;i<value.length-1;i++) if(value[i]===0xff&&value[i+1]===0xd8) jpeg=true;
      }
      if(jpeg&&bytes>1024)break;
    }
    await reader.cancel();
    if(!jpeg||bytes<1024) throw new Error('SELF_TEST_MEDIA_FAILED');
    console.log(JSON.stringify({ok:true,ffmpeg:true,http:true,mjpeg:true,bytes},null,2));
  } finally {
    sessions.delete(sessionId);
    await new Promise(resolve=>server.close(resolve));
  }
}
const args=parseArgs(process.argv);
const config=await readConfig();
try {
  if(args.command==='init') await initBridge(args);
  else if(args.command==='camera-add') await addCamera(args);
  else if(args.command==='config') await updateBridge(args);
  else if(args.command==='doctor') await doctor(config);
  else if(args.command==='self-test') await selfTest(config);
  else if(args.command==='start') await startBridge(config);
  else throw new Error(`알 수 없는 명령: ${args.command}`);
} catch(error){
  console.error(`[Tapo Bridge] ${error.message}`);
  process.exitCode=1;
}
