export const EKODI_UI_SURFACE_POLICY=Object.freeze({
  version:2,
  name:'EKODI UI Surface System',
  constructionStandard:Object.freeze({
    source:'config/design-engine.json',
    inheritance:'mandatory',
    dimensions:Object.freeze(['ease','locality','readability','originality','intuitiveness']),
    modes:Object.freeze(['communication-first','personalization']),
    completionGate:'material-missing-principle-blocks-completion',
  }),
  principles:Object.freeze({
    oneCoreManySurfaces:true,
    sharedAccessibility:true,
    sharedResponsiveSemantics:true,
    sharedStateLanguage:true,
    surfaceSpecificIdentity:true,
    platformAndGeneralUserUiSeparated:true,
    adminAuthoritySeparated:true,
    tenantBrandPrimaryOutsidePlatform:true,
    serviceThemeCannotOverrideShellOwnership:true,
    universalConstructionStandard:true,
    communicationFirst:true,
    personalizationWithinAuthority:true,
  }),
  surfaces:Object.freeze({
    'platform-public':Object.freeze({
      audience:'public',authority:'platform',identity:'ekodi-primary',
      navigation:'platform-discovery',shell:'user',
    }),
    'user-public':Object.freeze({
      audience:'public',authority:'context',identity:'service-or-workspace-primary',
      navigation:'service-or-workspace-purpose-first',shell:'user',
    }),
    'member-workspace':Object.freeze({
      audience:'authenticated-user',authority:'person-and-active-workspace',
      identity:'current-context-primary',navigation:'task-and-account',shell:'user',
    }),
    'tenant-admin':Object.freeze({
      audience:'administrator',authority:'tenant',identity:'tenant-primary',
      navigation:'fixed-primary-plus-context',shell:'admin',scrollOwner:'workspace',
    }),
    'platform-admin':Object.freeze({
      audience:'administrator',authority:'platform',identity:'ekodi-control-plane',
      navigation:'fixed-primary-plus-context',shell:'admin',scrollOwner:'workspace',
    }),
    'service-admin':Object.freeze({
      audience:'administrator',authority:'service',identity:'service-context-primary',
      navigation:'fixed-primary-plus-context',shell:'admin',scrollOwner:'workspace',
    }),
  }),
  layers:Object.freeze({
    uiCore:'tokens, controls, forms, tables, cards, states, accessibility and responsive semantics',
    identityTheme:'surface and service/workspace identity tokens',
    adaptive:'role + device + task + accessibility within fixed guardrails',
    aiInteraction:'assistive only; never expands authority or replaces deterministic navigation',
    guardrails:'static validation + runtime markers + deployment verification',
  }),
});

const clean=value=>String(value||'').trim().toLowerCase();
export function resolveEkodiUiSurface({serviceId='ekodi',shellSurface='public',authorityScope='',contextKind=''}={}){
  const service=clean(serviceId)||'ekodi';
  const surface=clean(shellSurface)||'public';
  const authority=clean(authorityScope);
  const context=clean(contextKind);
  if(surface==='admin'){
    if(authority==='tenant')return 'tenant-admin';
    if(authority==='service')return 'service-admin';
    return 'platform-admin';
  }
  if(surface==='workspace'){
    if(service==='my'||context==='member'||context==='personal')return 'member-workspace';
    return 'user-public';
  }
  if(surface==='public'&&service==='ekodi')return 'platform-public';
  if(surface==='public')return 'user-public';
  return service==='ekodi'?'platform-public':'user-public';
}

export function uiSurfaceProfile(id){
  return EKODI_UI_SURFACE_POLICY.surfaces[clean(id)]||null;
}
export const isPlatformPublicUi=id=>clean(id)==='platform-public';
export const isGeneralUserUi=id=>['user-public','member-workspace'].includes(clean(id));
export const isAdminUi=id=>['tenant-admin','platform-admin','service-admin'].includes(clean(id));
