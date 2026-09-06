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
    visual:{portraitUrl:'https://shell.ekodi.kr/assets/ekodian/founder-face.webp',portraitMode:'character-face',assetStatus:'approved-production',assetVersion:'20260906-founder-v1'},
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
    visual:{portraitUrl:'https://shell.ekodi.kr/assets/ekodian/founder-face.webp',portraitMode:'character-face',assetStatus:'approved-production',assetVersion:'20260906-founder-v1'},
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
    visual:{portraitUrl:null,portraitMode:'character-face',assetStatus:'local-device-reference'},
    forbiddenContexts:['payment','personal_data','security','high_risk_decision']
  }
};

const registry={
  schemaVersion:2,
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
    sourceImagePersistence:'local-device-by-default',
    subjectAuthorization:'required-for-human-inspired-profile',
    criticalWorkflowPolicy:'canonical_or_hidden',
    characterNeverCreatesAuthority:true
  },
  assetPolicy:{
    allowedProtocols:['https:'],
    allowedHosts:['ekodi.kr','*.ekodi.kr'],
    runtimeStoresReferenceOnly:true,
    noEmbeddedBase64Portraits:true,
    localPersonalPortraitProtocol:'blob:',
    localPersonalPortraitRequiresExplicitAuthorization:true,
    founderAssetPath:'/assets/ekodian/founder-face.webp'
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
