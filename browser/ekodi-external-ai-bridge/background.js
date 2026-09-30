'use strict';

const TTL_MS=120000;
const PROVIDERS=Object.freeze({
  chatgpt:{url:'https://chatgpt.com/',host:'chatgpt.com'},
  claude:{url:'https://claude.ai/',host:'claude.ai'},
  gemini:{url:'https://gemini.google.com/app',host:'gemini.google.com'},
  qwen:{url:'https://chat.qwen.ai/',host:'chat.qwen.ai'},
});
const keyFor=tabId=>`ekodi-handoff:${tabId}`;

async function putHandoff(tabId,record){
  await chrome.storage.session.set({[keyFor(tabId)]:record});
}
async function takeHandoff(tabId){
  const key=keyFor(tabId);
  const stored=(await chrome.storage.session.get(key))[key];
  if(!stored)return null;
  await chrome.storage.session.remove(key);
  if(Date.now()-Number(stored.createdAt||0)>TTL_MS)return null;
  return stored;
}
function safePrompt(value){return String(value||'').trim().slice(0,1800)}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==='ekodi.external-ai.handoff'){
    (async()=>{
      const sourceTabId=sender.tab?.id;
      const prompt=safePrompt(message.prompt);
      const providers=[...new Set(Array.isArray(message.providers)?message.providers:[])].filter(id=>PROVIDERS[id]);
      if(!sourceTabId||!prompt||!providers.length){sendResponse({ok:false,error:'invalid_handoff'});return}
      const tabs=[];
      for(let index=0;index<providers.length;index+=1){
        const provider=providers[index];
        const pending=await chrome.tabs.create({url:'about:blank',active:index===0});
        const record={requestId:String(message.requestId||''),provider,prompt,sourceTabId,createdAt:Date.now()};
        await putHandoff(pending.id,record);
        await chrome.tabs.update(pending.id,{url:PROVIDERS[provider].url});
        tabs.push({provider,tabId:pending.id});
      }
      sendResponse({ok:true,tabs});
    })().catch(error=>sendResponse({ok:false,error:String(error?.message||error)}));
    return true;
  }

  if(message?.type==='ekodi.external-ai.consume'){
    (async()=>{
      const tabId=sender.tab?.id;
      const hostname=String(message.hostname||'').toLowerCase();
      const record=tabId?await takeHandoff(tabId):null;
      if(!record){sendResponse({ok:false,error:'no_pending_handoff'});return}
      const provider=PROVIDERS[record.provider];
      if(!provider||provider.host!==hostname){
        sendResponse({ok:false,error:'provider_host_mismatch'});return;
      }
      sendResponse({ok:true,...record});
    })().catch(error=>sendResponse({ok:false,error:String(error?.message||error)}));
    return true;
  }

  if(message?.type==='ekodi.external-ai.result'){
    const sourceTabId=Number(message.sourceTabId||0);
    if(!sourceTabId)return false;
    chrome.tabs.sendMessage(sourceTabId,{
      type:'ekodi.external-ai.result',
      requestId:String(message.requestId||''),
      provider:String(message.provider||''),
      status:message.status==='filled'?'filled':'failed',
      reason:String(message.reason||'').slice(0,120)
    }).catch(()=>{});
  }
  return false;
});
