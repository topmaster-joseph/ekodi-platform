// EKODI opt-in, site-owned active-time client.
// This reports presence hints, NOT verified human attention. The database
// calculates all time, canonical identity, idempotency and reward limits.
const SITE_PATTERN=/^[a-z0-9_-]{2,64}$/;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createEkodiActivityTracker({
  supabase,siteId,enabled=false,documentRef=globalThis.document,
  clock=()=>Date.now(),schedule=(fn,ms)=>setInterval(fn,ms),
  cancel=id=>clearInterval(id),onAward=()=>{}
}={}){
  let started=false,busy=false,sessionId=null,timer=null,authSubscription=null;
  let lastInteraction=0,retryAfter=0,failures=0;
  const valid=enabled===true&&Boolean(supabase?.rpc&&supabase?.auth?.getSession)
    &&SITE_PATTERN.test(siteId||'')&&Boolean(documentRef?.addEventListener);
  function noteInteraction(){lastInteraction=clock();}
  function isVisible(){return documentRef.visibilityState==='visible'
    &&(typeof documentRef.hasFocus!=='function'||documentRef.hasFocus());}
  async function tick(){
    if(!valid||!started||busy||clock()<retryAfter)return;
    busy=true;
    try{
      const {data:auth,error:authError}=await supabase.auth.getSession();
      if(authError||!auth?.session?.access_token){stop();return;}
      const foreground=isVisible();
      const recent=lastInteraction>0&&clock()-lastInteraction<=90000;
      if(!sessionId&&!foreground)return;
      const {data,error}=await supabase.rpc('ekodi_points_active_heartbeat',{
        p_site:siteId,p_session:sessionId,
        p_foreground:foreground,p_recent_interaction:foreground&&recent
      });
      if(!started)return;
      if(error)throw error;
      if(data?.session_id&&UUID_PATTERN.test(data.session_id))sessionId=data.session_id;
      failures=0;retryAfter=0;
      if(data?.awarded===true)onAward(data);
    }catch{
      failures=Math.min(6,failures+1);
      retryAfter=clock()+Math.min(120000,5000*(2**(failures-1)));
    }finally{busy=false;}
  }
  const events=['pointerdown','keydown','touchstart','wheel'];
  const onVisibility=()=>{void tick();};
  function start(){
    if(!valid||started)return false;
    started=true;
    for(const name of events)documentRef.addEventListener(name,noteInteraction,{passive:true});
    documentRef.addEventListener('visibilitychange',onVisibility);
    timer=schedule(()=>{void tick();},15000);
    if(typeof supabase.auth.onAuthStateChange==='function'){
      const {data}=supabase.auth.onAuthStateChange(event=>{
        if(event==='SIGNED_OUT')stop();
      });
      authSubscription=data?.subscription||null;
    }
    // First heartbeat is requested on the scheduled cadence, not page load.
    return true;
  }
  function stop(){
    if(!started)return;
    started=false;sessionId=null;lastInteraction=0;retryAfter=0;
    if(timer!==null)cancel(timer);
    timer=null;
    for(const name of events)documentRef.removeEventListener(name,noteInteraction);
    documentRef.removeEventListener('visibilitychange',onVisibility);
    authSubscription?.unsubscribe?.();authSubscription=null;
  }
  return Object.freeze({start,stop,tick,get running(){return started;}});
}
