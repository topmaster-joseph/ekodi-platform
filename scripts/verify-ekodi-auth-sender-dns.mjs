// EMAIL-ID-001: Public-DNS-only prereq report for EKODI Mail Auth sender.
// Does NOT read or configure SMTP secrets, issue OTP, or activate email sign-up.
import {resolveTxt,resolveCname} from 'node:dns/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const stripDot=value=>String(value||'').trim().toLowerCase().replace(/\.$/,'');
const hostPattern=/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)+$/;

export function evaluateAuthSenderDns({senderDomain,spfHost,dkimHost,spfTxt=[],dmarcTxt=[],dkimTxt=[],dkimCname=[]}){
  const domain=stripDot(senderDomain),spf=stripDot(spfHost),dkim=stripDot(dkimHost);
  const validDomain=hostPattern.test(domain);
  const validSpf=hostPattern.test(spf);
  const validDkim=hostPattern.test(dkim);
  const spfRecords=spfTxt.filter(x=>/^v=spf1(?:\s|$)/i.test(String(x).trim()));
  const dmarcRecords=dmarcTxt.filter(x=>/^v=DMARC1\s*;/i.test(String(x).trim()));
  const dkimPublished=validDkim&&(
    dkimTxt.some(x=>/\bv=DKIM1\b/i.test(String(x))) ||
    dkimCname.some(x=>hostPattern.test(stripDot(x)))
  );
  const checks={
    senderDomain:validDomain,
    spfHost:validSpf,
    spfRecord:spfRecords.length===1,
    dmarcRecord:dmarcRecords.length===1&&dmarcRecords.some(x=>/;\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.test(x)),
    dkimHost:validDkim,
    dkimPublished
  };
  return {
    senderDomain:domain,
    spfHost:spf,
    dmarcHost:validDomain?'_dmarc.'+domain:null,
    dkimHost:validDkim?dkim:null,
    checks,
    dnsPrerequisitesPassed:Object.values(checks).every(Boolean),
    smtpCredentialsVerified:false,
    hostedSupabaseTemplatesVerified:false,
    actualExternalOtpDeliveryVerified:false,
    releaseEligible:false,
    note:'DNS records alone never prove Supabase Auth SMTP sender authorization or customer confirmation-email delivery.'
  };
}

const normalizeTxt=records=>records.map(parts=>parts.join(''));
const safeDns=async(fn,host)=>{
  if(!host||!hostPattern.test(host))return [];
  try{return await fn(host);}catch(error){
    if(['ENOTFOUND','ENODATA','ESERVFAIL','ETIMEOUT','EREFUSED','EAI_AGAIN'].includes(String(error?.code)))return [];
    throw error;
  }
};

export async function inspectAuthSenderDns({senderDomain='ekodi.kr',spfHost,dkimHost}={}){
  const domain=stripDot(senderDomain);
  const spf=stripDot(spfHost||domain);
  const dkim=stripDot(dkimHost);
  const [spfTxt,dmarcTxt,dkimTxt,dkimCname]=await Promise.all([
    safeDns(resolveTxt,spf).then(normalizeTxt),
    safeDns(resolveTxt,'_dmarc.'+domain).then(normalizeTxt),
    safeDns(resolveTxt,dkim).then(normalizeTxt),
    safeDns(resolveCname,dkim)
  ]);
  return evaluateAuthSenderDns({
    senderDomain:domain,spfHost:spf,dkimHost:dkim,
    spfTxt,dmarcTxt,dkimTxt,dkimCname
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const senderDomain=process.env.EKODI_AUTH_SENDER_DOMAIN||'ekodi.kr';
  const spfHost=process.env.EKODI_AUTH_SPF_HOST||senderDomain;
  const dkimHost=process.env.EKODI_AUTH_DKIM_HOST||'';
  inspectAuthSenderDns({senderDomain,spfHost,dkimHost}).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    // An unverified DKIM hostname must never pass DNS preflight.
    process.exitCode=result.dnsPrerequisitesPassed?0:1;
  }).catch(error=>{
    process.stderr.write('EKODI sender DNS read failed: '+String(error?.code||'dns_unavailable')+'\n');
    process.exitCode=2;
  });
}
