'use strict';

const SELECTORS=Object.freeze({
  'chatgpt.com':['#prompt-textarea','textarea[data-testid="prompt-textarea"]','[contenteditable="true"][data-placeholder]','div[contenteditable="true"]'],
  'claude.ai':['.ProseMirror[contenteditable="true"]','div[contenteditable="true"][data-placeholder]','div[contenteditable="true"]','textarea'],
  'gemini.google.com':['rich-textarea .ql-editor','[contenteditable="true"][role="textbox"]','div[contenteditable="true"]','textarea'],
  'chat.qwen.ai':['textarea','[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function setNativeValue(node,value){
  const proto=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(setter)setter.call(node,value);else node.value=value;
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  node.dispatchEvent(new Event('change',{bubbles:true}));
}
function fillNode(node,value){
  node.focus();
  if(node instanceof HTMLTextAreaElement||node instanceof HTMLInputElement){
    setNativeValue(node,value);
    return String(node.value||'').includes(value.slice(0,24));
  }
  if(node.isContentEditable){
    node.textContent=value;
    node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    return String(node.textContent||'').includes(value.slice(0,24));
  }
  return false;
}
async function fillPrompt(prompt){
  const selectors=SELECTORS[location.hostname]||[];
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    for(const selector of selectors){
      const node=document.querySelector(selector);
      if(node&&fillNode(node,prompt))return true;
    }
    await sleep(250);
  }
  return false;
}

chrome.runtime.sendMessage({type:'ekodi.external-ai.consume',hostname:location.hostname},async response=>{
  if(!response?.ok)return;
  let status='failed',reason='input_not_found';
  try{
    if(await fillPrompt(String(response.prompt||''))){status='filled';reason=''}
  }catch(error){reason=String(error?.message||'fill_failed').slice(0,120)}
  chrome.runtime.sendMessage({
    type:'ekodi.external-ai.result',
    requestId:String(response.requestId||''),
    provider:String(response.provider||''),
    sourceTabId:Number(response.sourceTabId||0),
    status,reason
  });
});
