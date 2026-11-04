// Authoritative, read-only response to EKODI administrator directory requests.
// Static registry membership is not evidence of production availability.
import workspaceRegistry from './config/site-lifecycle-registry.json' with { type: 'json' };
import serviceRegistry from './config/ecosystem-services.json' with { type: 'json' };

export const SITE_DIRECTORY_CORE_POLICY = Object.freeze({
  id: 'CONTROL-SITE-DIRECTORY-READONLY-001',
  mutates: false,
  source: ['config/site-lifecycle-registry.json', 'config/ecosystem-services.json'],
});

export function isSiteDirectoryListIntent(input) {
  const value = String(input ?? '').toLowerCase().replace(/[!?？！.,。]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 100) return false;
  if (!/(?:사이트|서비스)/.test(value)) return false;
  if (!/(?:목록|리스트|현황|보여|알려|나열)/.test(value)) return false;
  if (!/(?:에코디|ekodi|플랫폼|전체|모든)/.test(value)) return false;
  if (/(?:삭제|수정|변경|배포|등록해|추가해|생성해|만들어)/.test(value)) return false;
  return true;
}

const serviceState = Object.freeze({
  live: '운영 등록', beta: '베타 등록', preparing: '준비 중', planned: '계획',
});
function nameOf(row) {
  return String(row?.name || row?.id || '').replace(/[\r\n]/g, ' ').trim().slice(0, 100);
}
function publicPath(row) {
  try {
    const url = new URL(String(row?.canonicalUrl || row?.url || ''));
    return url.origin === 'https://ekodi.kr' ? url.pathname.replace(/\/$/, '') || '/' : '(등록 경로 확인 필요)';
  } catch {
    return '(등록 경로 확인 필요)';
  }
}
export function buildAdminSiteDirectoryReply({workspaces=workspaceRegistry.existingWorkspaceSites,services=serviceRegistry.services}={}) {
  const ws = Array.isArray(workspaces) ? workspaces : [];
  const svc = Array.isArray(services) ? services : [];
  const lines = [
    'EKODI 사이트·서비스 등록 목록 (읽기 전용)',
    '출처: Workspace 사이트 등록부 / 서비스 등록부',
    '※ 등록 정보이며 각 사이트의 실제 접속 상태·운영 배포 성공 여부를 검증한 결과가 아닙니다.',
    '',
    'Workspace 사이트 ' + ws.length + '개',
    ...ws.map(row => '- ' + nameOf(row) + ' · ' + publicPath(row)),
    '',
    '등록 서비스 ' + svc.length + '개 (Workspace와 중복될 수 있음)',
    ...svc.map(row => '- ' + nameOf(row) + ' · ' + publicPath(row) + ' · ' + (serviceState[row.status] || '상태 미확인')),
    '',
    '운영 상태는 관리자 「운영상태」의 별도 실측 정보로 확인해 주세요. 이 조회는 작업 실행·배포를 수행하지 않았습니다.',
  ];
  return lines.join('\n');
}
