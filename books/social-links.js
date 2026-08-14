(() => {
  const API = 'https://api.ekodi.kr/api/social/registry';
  const HUB = 'https://social.ekodi.kr';
  const icons = { youtube:'▶', instagram:'◎', facebook:'f', kakao:'◇', blog:'N', threads:'@', live:'●', tiktok:'♪', linkedin:'in', other:'↗' };
  let targets = [...document.querySelectorAll('[data-ekodi-social-links]')];
  if (!targets.length) {
    const footer = document.querySelector('.site-footer .footer-grid');
    if (footer) {
      const target = document.createElement('div');
      target.dataset.ekodiSocialLinks = '';
      target.dataset.org = 'books';
      target.dataset.variant = 'plain';
      target.className = 'ekodi-social-footer';
      const fallback = document.createElement('a');
      fallback.href = `${HUB}/?org=books`;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'EKODI Social ↗';
      target.append(fallback);
      footer.append(target);
      targets = [target];
    }
  }
  if (!targets.length) return;
  function link(channel, variant) {
    const a = document.createElement('a'); a.href=channel.url; a.target='_blank'; a.rel='noopener noreferrer'; a.dataset.provider=channel.provider||'other';
    a.className=variant==='plain'?'ekodi-social-plain':'ekodi-social-chip';
    a.textContent=`${icons[channel.provider]||'↗'} ${channel.label||channel.provider||'Channel'}`;
    return a;
  }
  function hubLink(orgId,variant){const a=document.createElement('a');a.href=`${HUB}/?org=${encodeURIComponent(orgId)}`;a.target='_blank';a.rel='noopener noreferrer';a.className=variant==='plain'?'ekodi-social-plain':'ekodi-social-chip';a.textContent='E 전체 소셜채널';return a;}
  async function render(){let registry;try{const r=await fetch(API,{headers:{accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`registry_${r.status}`);registry=await r.json();}catch(error){console.warn('[EKODI Social Links] fallback kept',error?.message||error);return;}for(const target of targets){const orgId=target.dataset.org||'books';const variant=target.dataset.variant||'plain';const org=(registry.organizations||[]).find(item=>item.id===orgId&&item.isActive!==false);const channels=(org?.channels||[]).filter(item=>item.isActive!==false);target.replaceChildren(...channels.map(item=>link(item,variant)),hubLink(orgId,variant));target.dataset.registryRevision=String(registry.revision||registry.version||'live');target.dataset.socialReady='true';}}
  render();
})();
