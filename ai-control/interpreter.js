import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $=id=>document.getElementById(id);
const LANGS=Object.freeze({
  ko:{label:'한국어',speech:'ko-KR',name:'Korean'},
  ja:{label:'日本語',speech:'ja-JP',name:'Japanese'},
  en:{label:'English',speech:'en-US',name:'English'},
  zh:{label:'中文',speech:'zh-CN',name:'Simplified Chinese'},
});
const state={config:null,client:null,session:null,recognition:null,wantsListening:false,listening:false,busy:false,lastSource:'',lastTarget:'',translatorCache:new Map()};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;

function setNotice(message='',error=false){const node=$('notice');node.textContent=message;node.classList.toggle('error',Boolean(error));}
function selected(){return{from:$('sourceLanguage').value,to:$('targetLanguage').value};}
function fillLanguages(){
  for(const id of ['sourceLanguage','targetLanguage']){
    const select=$(id);select.replaceChildren();
    for(const [code,item] of Object.entries(LANGS)){const option=document.createElement('option');option.value=code;option.textContent=item.label;select.append(option);}
  }
  $('sourceLanguage').value='ko';$('targetLanguage').value='ja';
}
function setSession(session){
  state.session=session||null;
  $('sessionState').textContent=state.session?(state.session.user?.email||'로그인됨'):'바로 사용';
  $('loginLink').hidden=true;
}
async function bootAuth(){
  try{
    const response=await fetch('/ai/api/commons/config',{cache:'no-store'});const config=await response.json();
    if(!response.ok)throw new Error(config.error||'config_failed');state.config=config;
    const loginUrl=new URL(config.authUrl||'/auth/?site=ai',location.origin);loginUrl.searchParams.set('return_to',location.href.split('#')[0]);$('loginLink').href=loginUrl.toString();
    if(config.supabaseUrl&&config.supabasePublishableKey){
      state.client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data}=await state.client.auth.getSession();setSession(data.session);
      state.client.auth.onAuthStateChange((_event,session)=>setSession(session));
    }else setSession(null);
  }catch{setSession(null);}
}
async function browserTranslator(from,to){
  const api=globalThis.Translator;if(!api?.create)return null;
  const key=`${from}:${to}`;if(state.translatorCache.has(key))return state.translatorCache.get(key);
  try{
    if(api.availability){const availability=await api.availability({sourceLanguage:from,targetLanguage:to});if(availability==='unavailable')return null;}
    const instance=await api.create({sourceLanguage:from,targetLanguage:to});state.translatorCache.set(key,instance);return instance;
  }catch{return null;}
}
async function translateWithBrowser(text,from,to){
  const translator=await browserTranslator(from,to);if(!translator)return null;
  try{const result=await translator.translate(text);return String(result||'').trim()||null;}catch{return null;}
}
async function translateWithServer(text,from,to){
  if(!state.session?.access_token){const error=new Error('login_required');error.code='login_required';throw error;}
  const system=`You are EKODI 모두의 통역. Translate the user's utterance from ${LANGS[from].name} to ${LANGS[to].name}. Return only the natural spoken translation. Preserve names, numbers, intent and tone. Do not explain, annotate, quote, romanize, or add facts.`;
  const response=await fetch('/api/ai-modules/v1/providers/generate',{method:'POST',headers:{authorization:`Bearer ${state.session.access_token}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({capability:'translation',system,input:text,maxOutputTokens:800}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);
  return String(data.text||'').trim();
}
async function translate(text,from,to){
  if(!text.trim())return'';if(from===to)return text.trim();
  const local=await translateWithBrowser(text,from,to);if(local){$('engineState').textContent='기기 번역';return local;}
  $('engineState').textContent='EKODI AI';
  return translateWithServer(text,from,to);
}
function speak(text,language){
  if(!text||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=LANGS[language].speech;
  const prefix=utterance.lang.slice(0,2).toLowerCase();const voice=speechSynthesis.getVoices().find(item=>String(item.lang||'').toLowerCase().startsWith(prefix));if(voice)utterance.voice=voice;
  speechSynthesis.speak(utterance);
}
async function processText(text){
  if(state.busy||!text.trim())return;state.busy=true;const {from,to}=selected();state.lastSource=text.trim();$('sourceText').textContent=state.lastSource;$('sourceText').classList.remove('muted');$('targetText').textContent='통역 중…';setNotice('');
  try{
    const translated=await translate(state.lastSource,from,to);if(!translated)throw new Error('empty_translation');
    state.lastTarget=translated;$('targetText').textContent=translated;speak(translated,to);
  }catch(error){
    $('targetText').textContent='통역을 완료하지 못했습니다.';
    if(error.code==='login_required'||error.message==='login_required'){
      setNotice('이 기기에서 바로 번역을 지원하지 않아 EKODI 로그인이 필요합니다.',true);$('loginLink').hidden=false;
    }else setNotice(`통역 오류: ${error.message}`,true);
  }finally{state.busy=false;}
}
function updateMicUi(){
  $('micButton').classList.toggle('listening',state.listening);$('micLabel').textContent=state.listening?'마이크 중지':'마이크 시작';$('listeningState').textContent=state.listening?'듣는 중':'대기';
}
function configureRecognition(){
  if(!Recognition)return null;
  const recognition=new Recognition();recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;recognition.lang=LANGS[selected().from].speech;
  recognition.onstart=()=>{state.listening=true;updateMicUi();setNotice('말씀하세요. 문장이 끝나면 바로 통역합니다.');};
  recognition.onresult=event=>{let interim='',final='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)final+=text;else interim+=text;}$('interimText').textContent=interim;if(final.trim())void processText(final.trim());};
  recognition.onerror=event=>{if(event.error!=='no-speech')setNotice(`마이크 오류: ${event.error}`,true);};
  recognition.onend=()=>{state.listening=false;updateMicUi();if(state.wantsListening){setTimeout(()=>{try{recognition.lang=LANGS[selected().from].speech;recognition.start();}catch{}},180);}};
  return recognition;
}
function stopListening(){state.wantsListening=false;if(state.recognition){try{state.recognition.stop();}catch{}}state.listening=false;updateMicUi();}
function startListening(){
  if(!Recognition){setNotice('이 브라우저에서는 음성 인식을 지원하지 않습니다. 아래 직접 입력 통역을 사용해 주세요.',true);$('textInput').focus();return;}
  if(!state.recognition)state.recognition=configureRecognition();state.wantsListening=true;try{state.recognition.lang=LANGS[selected().from].speech;state.recognition.start();}catch{}
}
function toggleListening(){if(state.wantsListening||state.listening)stopListening();else startListening();}
function swap(restart=true){
  const source=$('sourceLanguage'),target=$('targetLanguage');const before=source.value;source.value=target.value;target.value=before;
  $('interimText').textContent='';if(restart&&state.wantsListening){stopListening();setTimeout(startListening,220);}setNotice(`${LANGS[source.value].label}로 듣고 ${LANGS[target.value].label}로 통역합니다.`);
}
function preset(value){const [from,to]=String(value||'').split(':');if(!LANGS[from]||!LANGS[to])return;$('sourceLanguage').value=from;$('targetLanguage').value=to;if(state.wantsListening){stopListening();setTimeout(startListening,220);}setNotice(`${LANGS[from].label} → ${LANGS[to].label}`);}
function clearAll(){$('sourceText').textContent='마이크를 누르고 말해 주세요.';$('sourceText').classList.add('muted');$('targetText').textContent='통역 결과가 여기에 표시됩니다.';$('interimText').textContent='';state.lastSource='';state.lastTarget='';setNotice('');}
fillLanguages();
$('micButton').addEventListener('click',toggleListening);
$('turnButton').addEventListener('click',()=>swap(true));
$('swapLanguages').addEventListener('click',()=>swap(true));
$('sourceLanguage').addEventListener('change',()=>{if(state.wantsListening){stopListening();setTimeout(startListening,220);}});
$('targetLanguage').addEventListener('change',()=>setNotice(`${LANGS[selected().from].label} → ${LANGS[selected().to].label}`));
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>preset(button.dataset.preset)));
$('speakAgain').addEventListener('click',()=>speak(state.lastTarget,selected().to));
$('clearButton').addEventListener('click',clearAll);
$('textForm').addEventListener('submit',event=>{event.preventDefault();const text=$('textInput').value.trim();if(text)void processText(text);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.listening)stopListening();});
bootAuth().then(()=>{setNotice(Recognition?'언어를 선택하고 마이크를 누르세요.':'음성 인식 미지원 브라우저입니다. 직접 입력 통역은 사용할 수 있습니다.');});
