(()=>{
  'use strict';
  const KEY='ekodi.docs.panels.v1';
  const DEFAULTS={libraryCollapsed:true,aiCollapsed:true};

  function readPrefs(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw){localStorage.setItem(KEY,JSON.stringify(DEFAULTS));return {...DEFAULTS}}
      const parsed=JSON.parse(raw)||{};
      return {
        libraryCollapsed:typeof parsed.libraryCollapsed==='boolean'?parsed.libraryCollapsed:true,
        aiCollapsed:typeof parsed.aiCollapsed==='boolean'?parsed.aiCollapsed:true,
      };
    }catch{return {...DEFAULTS}}
  }

  function writePrefs(prefs){
    try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch{}
  }

  function syncControls(){
    const body=document.body;if(!body)return;
    const libraryCollapsed=body.classList.contains('library-collapsed');
    const aiCollapsed=body.classList.contains('ai-collapsed');
    const left=document.getElementById('toggleLibrary');
    const right=document.getElementById('toggleAi');
    const backdrop=document.getElementById('panelBackdrop');
    if(left){left.setAttribute('aria-pressed',String(libraryCollapsed));left.setAttribute('aria-expanded',String(!libraryCollapsed));left.title=libraryCollapsed?'문서함 열기':'문서함 닫기'}
    if(right){right.setAttribute('aria-pressed',String(aiCollapsed));right.setAttribute('aria-expanded',String(!aiCollapsed));right.title=aiCollapsed?'AI 패널 열기':'AI 패널 닫기'}
    if(backdrop)backdrop.hidden=libraryCollapsed&&aiCollapsed;
  }

  function closeAll(){
    const body=document.body;if(!body)return;
    body.classList.add('library-collapsed','ai-collapsed');
    writePrefs(DEFAULTS);
    syncControls();
  }

  const initial=readPrefs();
  if(document.body){
    document.body.classList.toggle('library-collapsed',initial.libraryCollapsed);
    document.body.classList.toggle('ai-collapsed',initial.aiCollapsed);
  }

  function boot(){
    const body=document.body;if(!body)return;
    const prefs=readPrefs();
    body.classList.add('docs-focus');
    body.classList.toggle('library-collapsed',prefs.libraryCollapsed);
    body.classList.toggle('ai-collapsed',prefs.aiCollapsed);
    syncControls();

    document.getElementById('panelBackdrop')?.addEventListener('click',closeAll);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAll()});

    if(typeof MutationObserver==='function'){
      const observer=new MutationObserver(records=>{
        if(records.some(record=>record.attributeName==='class'))syncControls();
      });
      observer.observe(body,{attributes:true,attributeFilter:['class']});
    }

    window.addEventListener('ekodi:user-header-ready',syncControls);
    window.addEventListener('resize',syncControls,{passive:true});
    window.dispatchEvent(new CustomEvent('ekodi:docs-focus-ready',{detail:{...prefs,paperMaxPx:1180}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
