// Public-facing Mission path is short; the stable tenant/database key stays ekodimission.
// Internal route resolution is a same-origin Worker dispatch, never an HTTP redirect.
const PUBLIC='/mission';
const INTERNAL='/ekodimission';
export function isMissionCanonicalPath(pathname=''){
  const p=String(pathname||'').replace(/\/+$/,'')||'/';
  return p===PUBLIC||p.startsWith(PUBLIC+'/');
}
export function missionRuntimePath(pathname=''){
  const p=String(pathname||'').replace(/\/+$/,'')||'/';
  return isMissionCanonicalPath(p)?INTERNAL+p.slice(PUBLIC.length):p;
}
export function missionPublicReferences(source=''){
  return String(source??'')
    .replace(/https:\/\/ekodi\.kr\/ekodimission(?=\/|[?#"'<> \t\r\n]|$)/g,'https://ekodi.kr/mission')
    .replace(/\/ekodimission(?=\/|[?#"'<> \t\r\n]|$)/g,'/mission');
}
export const MISSION_PUBLIC_ROOT=PUBLIC;
