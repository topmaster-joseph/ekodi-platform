// MFA assurance contract for the named EKODI owner. NEVER call with an unvalidated identity.
// Caller MUST first validate the SAME bearer JWT via Supabase /auth/v1/user and compare user.id.
// This is a claims-consistency check on a verified token, NOT a JWT signature verifier.
const EXPECTED_ISSUER='https://renzehysxirjilvdxacv.supabase.co/auth/v1';
export function verifiedOwnerAal2(request,verifiedSubjectId,now=Date.now()){
 const bearer=String(request?.headers?.get('authorization')||'');
 const matched=/^Bearer ([A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+)$/i.exec(bearer);
 if(!matched||!verifiedSubjectId)return false;
 try{
  const payload=matched[1].split('.')[1];
  if(payload.length>4096)return false;
  const normalized=payload.replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')),c=>c.charCodeAt(0))));
  const ts=Math.floor(Number(now)/1000);
  return claims.iss===EXPECTED_ISSUER
   &&claims.sub===String(verifiedSubjectId)
   &&claims.aal==='aal2'
   &&typeof claims.session_id==='string'&&claims.session_id.length>=8
   &&Number.isFinite(claims.iat)&&Number(claims.iat)<=ts+30
   &&Number.isFinite(claims.exp)&&Number(claims.exp)>ts;
 }catch{return false}
}
