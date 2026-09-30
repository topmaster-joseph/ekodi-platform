'use strict';

document.documentElement.dataset.ekodiExternalAiBridge='1';
window.dispatchEvent(new CustomEvent('ekodi-external-ai-bridge-ready'));

window.addEventListener('ekodi-external-ai-handoff',event=>{
  let payload=null;
  try{payload=JSON.parse(String(event.detail||''))}catch{}
  if(!payload)return;
  chrome.runtime.sendMessage({
    type:'ekodi.external-ai.handoff',
    requestId:String(payload.requestId||''),
    providers:Array.isArray(payload.providers)?payload.providers:[],
    prompt:String(payload.prompt||'')
  },response=>{
    window.dispatchEvent(new CustomEvent('ekodi-external-ai-bridge-accepted',{
      detail:JSON.stringify({requestId:String(payload.requestId||''),ok:Boolean(response?.ok),error:String(response?.error||'')})
    }));
  });
});

chrome.runtime.onMessage.addListener(message=>{
  if(message?.type!=='ekodi.external-ai.result')return;
  window.dispatchEvent(new CustomEvent('ekodi-external-ai-result',{detail:JSON.stringify(message)}));
});
