import http from 'node:http';
import {createGeminiTtsProvider} from './providers/gemini.js';
import {createVoiceService} from './service.js';

const port=Number(process.env.PORT||8788);
const serviceKey=String(process.env.VOICE_SERVICE_KEY||'');
const provider=createGeminiTtsProvider({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_TTS_MODEL||'gemini-3.1-flash-tts-preview',voice:process.env.GEMINI_TTS_VOICE||'Kore'});
const service=createVoiceService({provider});
const sendJson=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
async function readJson(req,maxBytes=256*1024){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw Object.assign(new Error('request too large'),{status:413});chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}

http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health')return sendJson(res,service.ready()?200:503,{ok:service.ready(),service:'ekodi.devotion-voice',provider:'gemini',connected:service.ready()});
  if(serviceKey&&req.headers.authorization!==`Bearer ${serviceKey}`)return sendJson(res,401,{error:'unauthorized',code:'UNAUTHORIZED'});
  if(req.method!=='POST'||url.pathname!=='/v1/speech')return sendJson(res,404,{error:'not found',code:'NOT_FOUND'});
  try{
    const body=await readJson(req);
    const result=await service.synthesize({text:body.text,style:body.style,voice:body.voice});
    res.writeHead(200,{'content-type':'audio/wav','cache-control':'no-store','x-voice-model':result.provider_model,'x-voice-name':result.voice});
    res.end(result.audio);
  }catch(error){return sendJson(res,Number(error?.status||(/NOT_CONNECTED/.test(error?.code||'')?409:500)),{error:String(error?.message||'speech generation failed'),code:error?.code||'VOICE_GENERATION_FAILED'})}
}).listen(port,'0.0.0.0',()=>console.log(`Devotion Voice listening on :${port}`));
