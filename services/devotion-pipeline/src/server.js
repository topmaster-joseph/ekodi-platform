import http from 'node:http';
import {createDevotionPipeline} from './service.js';
import {createHttpVoice} from './adapters/http-voice.js';
import {createHttpAssets} from './adapters/http-assets.js';
import {createHttpRenderer} from './adapters/http-renderer.js';

const port=Number(process.env.PORT||8790);
const serviceKey=String(process.env.PIPELINE_SERVICE_KEY||'');
const service=createDevotionPipeline({
  voice:createHttpVoice({endpoint:process.env.VOICE_ENDPOINT,token:process.env.VOICE_TOKEN}),
  assets:createHttpAssets({endpoint:process.env.ASSET_ENDPOINT,token:process.env.ASSET_TOKEN}),
  renderer:createHttpRenderer({endpoint:process.env.RENDER_ENDPOINT,token:process.env.RENDER_TOKEN})
});
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
async function readJson(req,maxBytes=512*1024){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw Object.assign(new Error('request too large'),{status:413});chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health'){
    const ready=service.ready();
    return send(res,Object.values(ready).every(Boolean)?200:503,{ok:Object.values(ready).every(Boolean),service:'ekodi.devotion-pipeline',dependencies:ready});
  }
  if(serviceKey&&req.headers.authorization!==`Bearer ${serviceKey}`)return send(res,401,{error:'unauthorized',code:'UNAUTHORIZED'});
  if(req.method!=='POST'||url.pathname!=='/v1/process')return send(res,404,{error:'not found',code:'NOT_FOUND'});
  try{return send(res,200,await service.processItem(await readJson(req)))}
  catch(error){
    const code=String(error?.code||'PIPELINE_ERROR');
    const status=code.includes('DISCONNECTED')?409:/required/i.test(String(error?.message))?400:Number(error?.status||500);
    return send(res,status,{error:String(error?.message||'pipeline failed'),code});
  }
}).listen(port,'0.0.0.0',()=>console.log(`Devotion Pipeline listening on :${port}`));
