// EKODI Secure Documents scanner boundary. This is a URL policy only;
// a real malware/PII scanner, contractual guarantees and residency review
// must be separately deployed and independently approved.
export const SCANNER_PATH="/api/internal/security/scan";
export function approvedScannerEndpoint(raw){
 if(typeof raw!=="string"||!raw||raw!==raw.trim())return false;
 try{
   const url=new URL(raw);
   return url.protocol==="https:"&&url.hostname==="ekodi.kr"&&
     url.origin==="https://ekodi.kr"&&url.pathname===SCANNER_PATH&&
     !url.username&&!url.password&&!url.search&&!url.hash;
 }catch{return false;}
}
export function verifiedScannerVerdict(status,json,redirected=false){
 return status>=200&&status<300&&redirected===false&&
   json?.verdict==="clean"&&json?.engine_verified===true&&json?.pii_safe===true;
}
