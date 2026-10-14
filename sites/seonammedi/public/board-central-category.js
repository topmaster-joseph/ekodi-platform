// Central category tabs on standalone SeonamMedi boards; no credential handling.
(() => {
  const panel=document.getElementById('central-category-panel');
  const template=document.getElementById('central-category-link-contract');
  const buttons=document.getElementById('central-category-buttons');
  const title=document.getElementById('central-category-title');
  if(!panel||!template||!buttons||!title)return;
  const entries=Array.from(template.content.querySelectorAll('a'));
  const groups={
    '공지':['공지사항','회의록','회계'],
    '소통채널':['페이스북','인스타그램','유튜브']
  };
  document.querySelectorAll('.site-header nav [data-category-menu]').forEach(trigger=>{
    trigger.addEventListener('click',event=>{
      const key=trigger.dataset.categoryMenu;
      const labels=groups[key]||[];
      if(!labels.length)return;
      event.preventDefault();
      const alreadyOpen=!panel.hidden&&title.textContent===key;
      panel.hidden=alreadyOpen;
      document.querySelectorAll('.site-header nav [data-category-menu]').forEach(a=>a.setAttribute('aria-expanded',String(a===trigger&&!alreadyOpen)));
      if(alreadyOpen)return;
      title.textContent=key;
      buttons.replaceChildren();
      for(const label of labels){
        const source=entries.find(a=>a.textContent.trim()===label);
        if(!source)continue;
        const a=document.createElement('a');
        a.href=source.href;
        a.textContent=label;
        buttons.appendChild(a);
      }
      panel.scrollIntoView({block:'nearest'});
    });
  });
})();