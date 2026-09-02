import http from 'node:http';
import { createAssetClient, createYoutubeApi, createDevotionPublisher } from './service.js';

const port=Number(process.env.PORT||8792);
const serviceKey=String(process.env.PUBLISHER_SERVICE_KEY||'');
let targetMap={};
try{targetMap=JSON.parse(process.env.YOUTUBE_TARGETS_JSON||'{}')}catch{targetMap={}}
const tokenFor=ref=>{
  const key=String(ref||'').trim();
  if(targetMap[key])return targetMap[key];
  const envKey=`YOUTUBE_REFRESH_TOKEN_${key.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;
  return process.env[envKey]||'';
};
const assets=createAssetClient({endpoint:process.env.ASSET_ENDPOINT,token:process.env.ASSET_TOKEN});
const youtube=createYoutubeApi({clientId:process.env.YOUTUBE_CLIENT_ID,clientSecret:process.env.YOUTUBE_CLIENT_SECRET,refreshTokenResolver:tokenFor});
const service=createDevotionPublisher({assets,youtube});
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
async function readJson(req,maxBytes=512*1024){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw Object.assign(new Error('request too large'),{status:413});chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}

http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health'){
    const youtubeConfigured=Boolean(process.env.YOUTUBE_CLIENT_ID&&process.env.YOUTUBE_CLIENT_SECRET);
    return send(res,service.ready()&&youtubeConfigured?200:503,{ok:service.ready()&&youtubeConfigured,service:'ekodi.devotion-publisher',assets:service.ready(),youtube_oauth:youtubeConfigured});
  }
  if(serviceKey&&req.headers.authorization!==`Bearer ${serviceKey}`)return send(res,401,{error:'unauthorized',code:'UNAUTHORIZED'});
  if(req.method!=='POST'||url.pathname!=='/v1/schedule')return send(res,404,{error:'not found',code:'NOT_FOUND'});
  try{
    const body=await readJson(req);
    return send(res,200,await service.schedule(body));
  }catch(error){
    const code=String(error?.code||'PUBLISHER_ERROR');
    const status=code.includes('DISCONNECTED')?409:code==='PUBLISH_AT_NOT_FUTURE'?409:/required|missing/i.test(String(error?.message))?400:Number(error?.status||500);
    return send(res,status,{error:String(error?.message||'publisher failed'),code});
  }
}).listen(port,'0.0.0.0',()=>console.log(`Devotion Publisher listening on :${port}`));
