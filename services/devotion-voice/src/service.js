import { pcm16ToWav } from './wav.js';

export function createVoiceService({provider}){
  if(!provider)throw new Error('voice provider adapter is required');
  return{
    ready(){return Boolean(provider.ready?.())},
    async synthesize({text,style='',voice}){
      if(!provider.ready?.()){const error=new Error('voice provider is not connected');error.code='TTS_PROVIDER_NOT_CONNECTED';throw error}
      const result=await provider.synthesize({text,style,voiceName:voice});
      const wav=pcm16ToWav(result.pcm,{sampleRate:result.sampleRate||24000,channels:result.channels||1});
      return{audio:wav,mime_type:'audio/wav',sample_rate:result.sampleRate||24000,channels:result.channels||1,provider_model:result.model||'',voice:result.voice||voice||''};
    }
  }
}
