// An optional, progressively enhanced editor for the CGMA public board.
// The HTML stays public and readable when JavaScript or authentication is absent.
// Server-side board-local permissions remain the sole source of write authority.
export const CGMA_BOARD_CLIENT_JS=String.raw`(()=>{
  'use strict';
  const root=document.querySelector('[data-cgma-board]');
  if(!root)return;
  const base=root.getAttribute('data-cgma-board') || '/cgma/board';
  const token=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||'';}catch{return '';}};
  const tools=document.getElementById('cgma-board-tools');
  const editor=document.getElementById('cgma-board-editor');
  const form=document.getElementById('cgma-board-form');
  const list=document.getElementById('cgma-board-posts');
  const status=document.getElementById('cgma-board-feedback');
  const title=document.getElementById('cgma-board-title');
  const body=document.getElementById('cgma-board-body');
  const cancel=document.getElementById('cgma-board-cancel');
  const open=document.getElementById('cgma-board-new');
  const submit=document.getElementById('cgma-board-submit');
  if(!tools||!editor||!form||!list||!status||!title||!body||!open||!cancel||!submit)return;
  let editingId=null;
  let canWrite=false;
  const setStatus=(message)=>{status.textContent=message||'';};
  const element=(name,text='',className='')=>{
    const node=document.createElement(name);
    if(text)node.textContent=String(text);
    if(className)node.className=className;
    return node;
  };
  async function api(path,method='GET',data){
    const currentToken=token();
    if(!currentToken)throw new Error('로그인이 필요합니다.');
    const headers=new Headers({authorization:'Bearer '+currentToken,accept:'application/json'});
    if(data!==undefined)headers.set('content-type','application/json');
    const response=await fetch(base+path,{
      method,headers,cache:'no-store',credentials:'omit',redirect:'manual',
      ...(data===undefined?{}:{body:JSON.stringify(data)})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||('요청 실패 (HTTP '+response.status+')'));
    if(result.boardId&&result.boardId!=='site:cgma:main')throw new Error('게시판 식별값이 일치하지 않습니다.');
    return result;
  }
  const reset=()=>{
    editingId=null;form.reset();editor.hidden=true;
    submit.textContent='글 등록';cancel.hidden=true;
  };
  function render(items){
    list.replaceChildren();
    if(!items.length){
      list.append(element('p','등록된 글이 없습니다.','empty'));
      return;
    }
    for(const post of items){
      const article=element('article');
      const h2=element('h2');
      const link=element('a',post.title||'제목 없음');
      link.href=base+'/post/'+encodeURIComponent(String(post.id));
      h2.append(link);
      article.append(h2);
      article.append(element('p',String(post.body||'').slice(0,220)));
      article.append(element('time',post.createdAt||''));
      if(post.canEdit===true){
        const actions=element('div','','cgma-board-actions');
        const edit=element('button','수정');
        edit.type='button';
        edit.addEventListener('click',()=>{
          editingId=Number(post.id);
          title.value=post.title||'';
          body.value=post.body||'';
          editor.hidden=false;cancel.hidden=false;
          submit.textContent='수정 저장';
          title.focus();
        });
        const remove=element('button','삭제');
        remove.type='button';
        remove.addEventListener('click',async()=>{
          if(!window.confirm('이 글을 삭제하시겠습니까?'))return;
          remove.disabled=true;
          try{await api('/api/posts/'+encodeURIComponent(String(post.id)),'DELETE');reset();await load();setStatus('삭제했습니다.');}
          catch(error){setStatus('삭제 실패: '+error.message);}
          finally{remove.disabled=false;}
        });
        actions.append(edit,remove);
        article.append(actions);
      }
      list.append(article);
    }
  }
  async function load(){
    const result=await api('/api/posts');
    if(!Array.isArray(result.items))throw new Error('게시글 목록이 올바르지 않습니다.');
    render(result.items);
  }
  open.addEventListener('click',()=>{
    reset();editor.hidden=false;title.focus();
  });
  cancel.addEventListener('click',reset);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!canWrite)return;
    const data={title:title.value.trim(),body:body.value.trim()};
    if(!data.title||!data.body){setStatus('제목과 내용을 입력하세요.');return;}
    submit.disabled=true;
    try{
      if(editingId)await api('/api/posts/'+encodeURIComponent(String(editingId)),'PATCH',data);
      else await api('/api/posts','POST',data);
      reset();await load();setStatus('저장했습니다.');
    }catch(error){setStatus('저장 실패: '+error.message);}
    finally{submit.disabled=false;}
  });
  async function init(){
    if(!token())return;
    try{
      const me=await api('/api/me');
      if(me.authenticated!==true)return;
      canWrite=true;tools.hidden=false;
      await load();
    }catch(error){
      // A rejected/expired session must never reveal editing controls.
      canWrite=false;tools.hidden=true;editor.hidden=true;
      if(token())setStatus('게시판 인증을 확인할 수 없습니다. 관리자 화면에서 로그인 상태를 확인하세요.');
    }
  }
  init();
})();`;
