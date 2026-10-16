import {createVoiceController,consumeComposeIntent,SESSION_KEY} from './citizen-controller.mjs';
import {exchangeGoogleReturn,refreshGoogleSession} from './google-handoff.mjs';
const $=id=>document.getElementById(id);
const editor=$('editor'),message=$('message'),status=$('status'),posts=$('posts'),write=$('write');
const storage={getItem:key=>{try{return localStorage.getItem(key)||sessionStorage.getItem(key)}catch{return null}}};
const stores={local:localStorage,session:sessionStorage};
const controller=await createVoiceController({href:location.href,storage,exchange:()=>exchangeGoogleReturn({href:location.href,storage:stores,replace:path=>history.replaceState(null,'',path)}),refresh:()=>refreshGoogleSession({storage:stores})});
let adminAllowed=false;
const report=text=>{status.textContent=text};
function render(items){
  posts.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.textContent='등록된 의견이 없습니다.';posts.append(p);return;}
  for(const item of items){
    const article=document.createElement('article'),meta=document.createElement('small'),body=document.createElement('p');
    meta.textContent=[item.displayName||'익명',item.createdAt?new Date(item.createdAt).toLocaleString('ko-KR'):''].filter(Boolean).join(' · ');
    body.textContent=String(item.message||'');
    article.append(meta,body);
    if(adminAllowed&&Number.isSafeInteger(Number(item.id))){
      const edit=document.createElement('button'),remove=document.createElement('button');
      edit.type=remove.type='button';edit.textContent='수정';remove.textContent='삭제';
      edit.className=remove.className='secondary';
      edit.addEventListener('click',async()=>{
        const proposed=prompt('수정할 의견을 입력해 주세요.',String(item.message||''));
        if(proposed===null||!proposed.trim())return;
        try{await controller.admin.update(item,proposed);report('수정했습니다.');await load();}
        catch{report('수정 권한 또는 저장 상태를 확인하지 못했습니다.');}
      });
      remove.addEventListener('click',async()=>{
        if(!confirm('해당 의견을 삭제하시겠습니까?'))return;
        try{await controller.admin.remove(Number(item.id));report('삭제했습니다.');await load();}
        catch{report('삭제 권한 또는 저장 상태를 확인하지 못했습니다.');}
      });
      article.append(edit,document.createTextNode(' '),remove);
    }
    posts.append(article);
  }
}
async function load(){
  try{
    let items=await controller.list();adminAllowed=false;
    try{const result=await controller.admin.list();if(Array.isArray(result.items)){items=result.items;adminAllowed=true;}}
    catch{ /* public visitors retain read-only access */ }
    render(items);
  }catch{report('목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.')}
}
function openComposer(){editor.hidden=false;message.focus();}
async function beginCompose(){
  report('');
  try{if(await controller.verified()){openComposer();return;}location.assign((await controller.initialize()).loginUrl)}
  catch{report('로그인 확인에 실패했습니다. 다시 시도해 주세요.')}
}
write.addEventListener('click',beginCompose);
$('reload').addEventListener('click',load);
$('cancel').addEventListener('click',()=>{editor.hidden=true;editor.reset()});
editor.addEventListener('submit',async event=>{
  event.preventDefault();const value=message.value.trim();if(!value)return;
  const button=editor.querySelector('[type=submit]');button.disabled=true;report('의견을 저장하는 중입니다.');
  try{
    const accepted=await controller.write(value);
    if(!accepted.ok){location.assign(accepted.loginUrl);return;}
    const result=await controller.publication(accepted);
    if(result.published){editor.reset();editor.hidden=true;report('의견이 등록되었습니다.');await load();}
    else report('등록 요청이 접수되었습니다. 저장 상태를 확인 중입니다. 잠시 후 목록을 다시 확인해 주세요.');
  }catch(error){report(error.message==='publication_failed'?'등록 처리에 실패했습니다. 다시 시도해 주세요.':'저장을 완료하지 못했습니다. 입력한 내용은 유지됩니다.');}
  finally{button.disabled=false}
});
try{
  const state=await controller.initialize();
  if(state.openComposer){openComposer();history.replaceState(null,'',consumeComposeIntent(location.href).clean);}
  else if(state.requiresLogin){report('글쓰기를 위해 로그인이 필요합니다.');}
}catch{report('로그인 상태를 확인하지 못했습니다.');}
await load();
