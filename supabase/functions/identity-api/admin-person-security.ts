// Pure policy primitives shared by the identity admin API and Node contract tests.
export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STEP_UP_SECONDS=15*60;
export function maskLoginEmail(value:unknown):string{
  const email=String(value||"").trim();const at=email.indexOf("@");
  if(at<1)return "****";
  const local=email.slice(0,at);
  return local.slice(0,Math.min(2,local.length))+"****"+email.slice(at);
}
export function requireMutationReason(value:unknown):string|null{
  if(typeof value!=="string")return null;
  const reason=value.trim();
  return reason.length>=5&&reason.length<=500?reason:null;
}
export function mutationGate(input:{platform:boolean;recentGoogle:boolean;reason:string|null;activeCount:number;isPrimary:boolean}):{status:number;error:string}|null{
  if(!input.platform)return {status:403,error:"platform_admin_required"};
  if(!input.reason)return {status:400,error:"reason_required"};
  if(!input.recentGoogle)return {status:401,error:"google_step_up_required"};
  if(input.activeCount<=1)return {status:409,error:"last_identity_cannot_disconnect"};
  if(input.isPrimary)return {status:409,error:"primary_identity_cannot_disconnect"};
  return null;
}
export function recentStepUp(issuedAt:number,now:number=Date.now()):boolean{
  return Number.isFinite(issuedAt)&&issuedAt<=now&&now-issuedAt<STEP_UP_SECONDS*1000;
}
export function siteMayView(target:{userIds:string[];verifiedEmails:string[]},scope:{userIds:string[];emails:string[]}):boolean{
  const users=new Set(scope.userIds);const emails=new Set(scope.emails.map(x=>x.toLowerCase()));
  return target.userIds.some(id=>users.has(id))||target.verifiedEmails.some(email=>emails.has(email.toLowerCase()));
}
