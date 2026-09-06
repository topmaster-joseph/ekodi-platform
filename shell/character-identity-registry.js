(()=>{
'use strict';
if(window.EKODICharacterIdentityRegistry)return;

const CONTRACT='ekodi.ekodian-identity.v1';
const profiles={
  canonical:{
    id:'canonical',
    kind:'canonical',
    label:'EKODIAN',
    activation:'default',
    subjectBinding:'none',
    visual:{portraitUrl:null,portraitMode:'character-face',assetStatus:'canonical-vector'},
    serviceRoles:['welcome','guide','helper','connector','companion','celebrator']
  },
  founder:{
    id:'founder',
    kind:'representative-human-inspired',
    label:'Founder Guide EKODIAN',
    activation:'explicit_only',
    subjectBinding:'founder',
    subjectAuthorization:'recorded',
    visual:{portraitUrl:null,portraitMode:'character-face',assetStatus:'awaiting-approved-reference-asset'},
    allowedContexts:['public','workspace','story','education','community'],
    forbiddenContexts:['payment','personal_data','security','high_risk_decision']
  },
  'founder-pastor':{
    id:'founder-pastor',
    kind:'representative-human-inspired',
    label:'Pastor Guide EKODIAN',
    activation:'explicit_only',
    subjectBinding:'founder',
    subjectAuthorization:'recorded',
    visual:{portraitUrl:null,portraitMode:'character-face',assetStatus:'awaiting-approved-reference-asset'},
    allowedContexts:['church','worship','education','care','community'],
    forbiddenContexts:['payment','personal_data','security','high_risk_decision']
  },
  personal:{
    id:'personal',
    kind:'user-personalized-template',
    label:'My EKODIAN',
    activation:'authenticated_explicit',
    subjectBinding:'current_person',
    subjectAuthorization:'required',
    visual:{portraitUrl:null,portraitMode:'character-face',assetStatus:'runtime-reference-only'},
    forbiddenContexts:['payment','personal_data','security','high_risk_decision']
  }
};

const registry={
  schemaVersion:1,
  contract:CONTRACT,
  generation:8,
  defaultProfile:'canonical',
  profiles,
  governance:{
    explicitIdentitySelection:true,
    inferFromEmail:false,
    inferFromLoginProvider:false,
    inferFromName:false,
    rawBiometricData:'forbidden',
    faceEmbeddings:'forbidden',
    sourceImagePersistence:'outside-runtime',
    subjectAuthorization:'required-for-human-inspired-profile',
    criticalWorkflowPolicy:'canonical_or_hidden',
    characterNeverCreatesAuthority:true
  },
  assetPolicy:{
    allowedProtocols:['https:'],
    allowedHosts:['ekodi.kr','*.ekodi.kr'],
    runtimeStoresReferenceOnly:true,
    noEmbeddedBase64Portraits:true
  },
  resolve(id='canonical'){
    const key=String(id||'canonical').trim().toLowerCase();
    return profiles[key]||profiles.canonical;
  }
};

const deepFreeze=value=>{
  if(!value||(typeof value!=='object'&&typeof value!=='function')||Object.isFrozen(value))return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

window.EKODICharacterIdentityRegistry=deepFreeze(registry);
window.dispatchEvent(new CustomEvent('ekodi:character-identity-registry-ready',{detail:{schemaVersion:registry.schemaVersion,contract:CONTRACT,generation:registry.generation,defaultProfile:registry.defaultProfile}}));
})();
