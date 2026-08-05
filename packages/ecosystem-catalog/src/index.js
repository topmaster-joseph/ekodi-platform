import { normalizeKey } from '@ekodi/shared';

export const EKODI_SERVICES = Object.freeze([
  Object.freeze({ id: 'platform', name: 'EKODI 플랫폼', domain: 'ekodi.kr', url: 'https://ekodi.kr', targetDomain: 'ekodi.kr', appPath: 'apps/platform', access: 'private', managedDns: false, operational: false }),
  Object.freeze({ id: 'mall', name: '에코디몰', domain: 'ekodimall.kr', url: 'https://ekodimall.kr', targetDomain: 'mall.ekodi.kr', appPath: 'apps/mall', managedDns: true }),
  Object.freeze({ id: 'biz', name: '에코디비즈', domain: 'ekodibiz.kr', url: 'https://ekodibiz.kr', targetDomain: 'biz.ekodi.kr', appPath: 'apps/biz', managedDns: true }),
  Object.freeze({ id: 'publishing', name: '에코디출판', domain: 'ekodibook.kr', url: 'https://ekodibook.kr', targetDomain: 'publishing.ekodi.kr', appPath: 'apps/publishing', managedDns: true }),
  Object.freeze({ id: 'church', name: '에코디교회', domain: 'ekodichurch.kr', url: 'https://ekodichurch.kr', targetDomain: 'church.ekodi.kr', appPath: 'apps/church', managedDns: true }),
  Object.freeze({ id: 'lab', name: '에코디연구소', domain: 'ekodilab.kr', url: 'https://ekodilab.kr', targetDomain: 'lab.ekodi.kr', appPath: 'apps/lab', managedDns: true }),
  Object.freeze({ id: 'mission', name: '에코디선교회', domain: 'youtube.com/@ekodicommunity', url: 'https://youtube.com/@ekodicommunity', targetDomain: 'mission.ekodi.kr', appPath: 'apps/mission', managedDns: false }),
  Object.freeze({ id: 'trade', name: '에코디트레이드', domain: 'trade.ekodi.kr', url: 'https://trade.ekodi.kr', targetDomain: 'trade.ekodi.kr', appPath: 'apps/trade', managedDns: false, operational: false }),
  Object.freeze({ id: 'marketing', name: '에코디마케팅', domain: 'marketing.ekodi.kr', url: 'https://marketing.ekodi.kr', targetDomain: 'marketing.ekodi.kr', appPath: 'apps/marketing', managedDns: false, operational: false }),
  Object.freeze({ id: 'consulting', name: '에코디컨설팅', domain: 'consulting.ekodi.kr', url: 'https://consulting.ekodi.kr', targetDomain: 'consulting.ekodi.kr', appPath: 'apps/consulting', managedDns: false, operational: false }),
  Object.freeze({ id: 'media', name: '에코디미디어', domain: 'media.ekodi.kr', url: 'https://media.ekodi.kr', targetDomain: 'media.ekodi.kr', appPath: 'apps/media', managedDns: false, operational: false }),
  Object.freeze({ id: 'education', name: '에코디교육', domain: 'education.ekodi.kr', url: 'https://education.ekodi.kr', targetDomain: 'education.ekodi.kr', appPath: 'apps/education', managedDns: false, operational: false }),
  Object.freeze({ id: 'solution', name: '에코디솔루션', domain: 'solution.ekodi.kr', url: 'https://solution.ekodi.kr', targetDomain: 'solution.ekodi.kr', appPath: 'apps/solution', managedDns: false, operational: false }),
  Object.freeze({ id: 'erp', name: '에코디ERP', domain: 'erp.ekodi.kr', url: 'https://erp.ekodi.kr', targetDomain: 'erp.ekodi.kr', appPath: 'apps/erp', access: 'private', managedDns: false, operational: false }),
  Object.freeze({ id: 'community', name: '에코디커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', targetDomain: 'community.ekodi.kr', appPath: 'apps/community', managedDns: false, operational: false })
]);

export const MANAGED_DNS_SERVICES = Object.freeze(EKODI_SERVICES.filter(service => service.managedDns));

export function findServiceByDomain(domain) {
  const normalized = normalizeKey(domain);
  return EKODI_SERVICES.find(service => service.domain === normalized) || null;
}
