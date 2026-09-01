import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiTtsProvider} from '../src/providers/gemini.js';
import {createVoiceService} from '../src/service.js';

const pcm=Buffer.from([0,0,1,0,255,255,2,0]);

test('voice service fails closed without a connected provider',async()=>{
  const service=createVoiceService({provider:{ready:()=>false}});
  await assert.rejects(service.synthesize({text:'테스트'}),error=>error?.code==='TTS_PROVIDER_NOT_CONNECTED');
});

test('Gemini adapter uses current interactions audio contract',async()=>{
  let request;
  const provider=createGeminiTtsProvider({apiKey:'test-key',fetchImpl:async(url,init)=>{request={url,init,body:JSON.parse(init.body)};return new Response(JSON.stringify({output_audio:{data:pcm.toString('base64')}}),{status:200,headers:{'content-type':'application/json'}})}});
  const result=await provider.synthesize({text:'오늘도 말씀을 따라 걷습니다.',style:'차분하고 따뜻한 한국어 묵상 낭독',voiceName:'Kore'});
  assert.match(request.url,/generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.equal(request.init.headers['x-goog-api-key'],'test-key');
  assert.equal(request.body.model,'gemini-3.1-flash-tts-preview');
  assert.deepEqual(request.body.response_format,{type:'audio'});
  assert.equal(request.body.generation_config.speech_config[0].voice,'Kore');
  assert.match(request.body.input,/Spoken transcript/);
  assert.deepEqual(result.pcm,pcm);
});

test('voice service wraps provider PCM as a valid WAV file',async()=>{
  const provider={ready:()=>true,synthesize:async()=>({pcm,sampleRate:24000,channels:1,model:'mock',voice:'MockVoice'})};
  const service=createVoiceService({provider});
  const result=await service.synthesize({text:'test'});
  assert.equal(result.mime_type,'audio/wav');
  assert.equal(result.audio.subarray(0,4).toString(),'RIFF');
  assert.equal(result.audio.subarray(8,12).toString(),'WAVE');
  assert.equal(result.audio.readUInt32LE(24),24000);
  assert.equal(result.audio.length,44+pcm.length);
});

test('voice core contains no church, mission, renderer or publishing dependency',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('../src/service.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/에코디교회|에코디선교회|FFmpeg|YouTube|Google Drive|auth-worker/);
});
