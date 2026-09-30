const KIND_ALIASES=Object.freeze({
  person:'person',personal:'person',individual:'person',user:'person',
  institution:'institution',institute:'institution',school:'institution',church:'institution',foundation:'institution',
  organization:'organization',organisation:'organization',org:'organization',group:'organization',community:'organization',association:'organization',
  project:'project',initiative:'project',campaign:'project',team:'project',
});

const KIND_BASES=Object.freeze({
  person:Object.freeze({family:'editorial-human',typography:'humanist',surface:'soft-paper',hero:'portrait-story',density:'airy'}),
  institution:Object.freeze({family:'architectural-civic',typography:'formal-sans',surface:'quiet-solid',hero:'mission-structure',density:'balanced'}),
  organization:Object.freeze({family:'communal-network',typography:'friendly-sans',surface:'layered-panel',hero:'people-network',density:'balanced'}),
  project:Object.freeze({family:'directional-studio',typography:'modern-grotesk',surface:'crisp-canvas',hero:'goal-progress',density:'compact'}),
});

const GEOMETRIES=['soft','rounded','square','cut','pill'];
const RHYTHMS=['calm','flow','pulse','still'];
const PATTERNS=['plain','halo','grid','orbit','ribbon','grain'];

const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
export function normalizeWorkspaceKind(value='organization'){
  return KIND_ALIASES[clean(value).toLowerCase()]||'organization';
}

export function stableWorkspaceHash(value=''){
  const text=clean(value,512)||'ekodi-workspace';
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return hash>>>0;
}

function hue(hash,offset=0){return (hash+offset)%360}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

export function resolveWorkspaceVisualDNA(input={}){
  const kind=normalizeWorkspaceKind(input.kind||input.workspaceKind);
  const identity=clean(input.workspaceId||input.workspace_id||input.subjectKey||input.slug||'ekodi-workspace',512).toLowerCase();
  const hash=stableWorkspaceHash(`${kind}:${identity}`);
  const base=KIND_BASES[kind];
  const accentHue=hue(hash,17);
  const secondaryHue=hue(accentHue,78+(hash%37));
  const lightness=42+(hash%13);
  const chroma=58+(hash%17);
  const radius=[8,12,16,22,30][hash%5];
  const heroVariant=hash%7;
  const spacingScale=Number((0.94+(hash%13)/100).toFixed(2));
  return Object.freeze({
    version:1,
    kind,
    identityHash:hash.toString(36),
    family:base.family,
    typography:base.typography,
    surface:base.surface,
    hero:base.hero,
    heroVariant,
    density:base.density,
    geometry:GEOMETRIES[hash%GEOMETRIES.length],
    rhythm:RHYTHMS[(hash>>>3)%RHYTHMS.length],
    pattern:PATTERNS[(hash>>>6)%PATTERNS.length],
    palette:Object.freeze({
      accent:`hsl(${accentHue} ${clamp(chroma,48,74)}% ${clamp(lightness,40,54)}%)`,
      secondary:`hsl(${secondaryHue} ${clamp(chroma-10,38,64)}% ${clamp(lightness+8,48,64)}%)`,
      canvas:`hsl(${hue(accentHue,hash%19)} 24% ${96-(hash%3)}%)`,
      ink:`hsl(${hue(accentHue,180)} 22% ${14+(hash%5)}%)`,
    }),
    radius,
    spacingScale,
  });
}

export function workspaceVisualCssVariables(dna={}){
  const palette=dna.palette||{};
  return Object.freeze({
    '--ekodi-workspace-accent':clean(palette.accent,80),
    '--ekodi-workspace-secondary':clean(palette.secondary,80),
    '--ekodi-workspace-canvas':clean(palette.canvas,80),
    '--ekodi-workspace-ink':clean(palette.ink,80),
    '--ekodi-workspace-radius':`${Number(dna.radius||12)}px`,
    '--ekodi-workspace-spacing-scale':String(Number(dna.spacingScale||1)),
  });
}

export const WORKSPACE_VISUAL_DNA_POLICY=Object.freeze({
  structuralInvariant:true,
  routeInvariant:'ekodi.kr/{slug}',
  visualIdentitySource:'immutable-workspace-id-or-subject-key',
  manualOverrideCompatible:true,
  kindFamilies:Object.freeze(Object.keys(KIND_BASES)),
});
