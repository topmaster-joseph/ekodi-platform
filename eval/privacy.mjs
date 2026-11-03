import {createHash} from 'node:crypto';
export function redactKoreanText(value) {
  if(typeof value!=='string')return '';
  return value.slice(0,4000)
    .replace(/(?:sk-(?:proj-)?|ghp_|github_pat_|Bearer\s+)[A-Za-z0-9_\-.]{8,}/gi,'[비밀값]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,'[이메일]')
    .replace(/(?<!\d)01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g,'[전화번호]')
    .replace(/(?<!\d)\d{6}[\s-]?[1-8]\d{6}(?!\d)/g,'[주민등록번호]')
    .replace(/(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/g,'[IP주소]');
}
export function quarantineFromLog(raw,secretSalt){
  if(!raw||typeof raw!=='object'||typeof secretSalt!=='string'||secretSalt.length<16)throw new Error('private salt and log required');
  if(typeof raw.prompt!=='string'||!raw.prompt.trim())throw new Error('no evaluable prompt');
  const id=createHash('sha256').update(secretSalt+'\u0000'+String(raw.id||'')+'\u0000'+raw.prompt).digest('hex').slice(0,20);
  const safe={id:`pending-${id}`,task:redactKoreanText(raw.prompt),source:'operations-log',needsHumanPrivacyReview:true,eligibleForGolden:false};
  if(/\[비밀값\]|\[이메일\]|\[전화번호\]|\[주민등록번호\]|\[IP주소\]/.test(safe.task))safe.containsRedaction=true;
  return safe;
}
