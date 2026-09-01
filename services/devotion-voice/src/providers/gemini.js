const DEFAULT_ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';

export function createGeminiTtsProvider({apiKey,model='gemini-3.1-flash-tts-preview',voice='Kore',endpoint=DEFAULT_ENDPOINT,fetchImpl=fetch}){
  const key=String(apiKey||'');
  return{
    ready(){return Boolean(key)},
    async synthesize({text,style='',voiceName=voice}){
      if(!key){const error=new Error('Gemini TTS API key is not configured');error.code='TTS_PROVIDER_NOT_CONNECTED';throw error}
      const transcript=String(text||'').trim();
      if(!transcript)throw new Error('text is required');
      const prompt=style?`Synthesize speech. Director notes: ${style}\nSpoken transcript:\n${transcript}`:`Synthesize speech. Spoken transcript:\n${transcript}`;
      let lastError;
      for(let attempt=1;attempt<=3;attempt++){
        try{
          const response=await fetchImpl(endpoint,{method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify({model,input:prompt,response_format:{type:'audio'},generation_config:{speech_config:[{voice:voiceName}]}})});
          const body=await response.json().catch(()=>({}));
          if(!response.ok){const error=new Error(body?.error?.message||`Gemini TTS HTTP ${response.status}`);error.status=response.status;throw error}
          const data=body?.output_audio?.data;
          if(!data)throw new Error('Gemini TTS returned no output_audio.data');
          return{pcm:Buffer.from(data,'base64'),sampleRate:24000,channels:1,model,voice:voiceName};
        }catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*250))}
      }
      throw lastError;
    }
  }
}
