(()=>{
'use strict';
const identity=Object.freeze({
  contract:'ekodi.ekodian-identity.v1',
  id:'founder-pastor',
  subjectAuthorized:true
});
window.__EKODI_CHARACTER_IDENTITY__=identity;
const apply=()=>window.EKODIUserCharacter?.setIdentity?.(identity);
window.addEventListener('ekodi:user-character-ready',apply,{once:true});
window.addEventListener('ekodi:character-identity-registry-ready',()=>setTimeout(apply,0),{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
