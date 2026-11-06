// EKODI super-admin only KG Inicis V2 TEST channel smoke.
// This page cannot mint a production eligibility grant. Never log/retain PII.
const ROOT = '/api/control/age-verification/sandbox';
const $ = id => document.getElementById(id);
const status = $('sandboxStatus');
const button = $('sandboxStart');
const detail = $('sandboxDetail');
const login = $('adminLogin');
const storageKey = 'ekodi-inicis-sandbox-pending';
const ID = /^ekodi-inicis-sandbox-[0-9a-f]{32}$/;
const PROVIDER = 'kg-inicis-unified';
const TEST = 'TEST';

function message(value, kind = '') {
  status.textContent = value;
  status.className = 'status' + (kind ? ' ' + kind : '');
}
async function adminApi(path, body) {
  const result = await fetch(ROOT + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const output = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(String(output.error || 'sandbox_unavailable'));
    error.httpStatus = result.status;
    throw error;
  }
  return output;
}
async function sdk() {
  if (globalThis.PortOne?.requestIdentityVerification) return globalThis.PortOne;
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://cdn.portone.io/v2/browser-sdk.js';
    tag.async = true;
    tag.onload = () => globalThis.PortOne?.requestIdentityVerification
      ? resolve(globalThis.PortOne) : reject(new Error('sandbox_sdk_unavailable'));
    tag.onerror = () => reject(new Error('sandbox_sdk_unavailable'));
    document.head.appendChild(tag);
  });
}
function pending() {
  try {
    const raw = sessionStorage.getItem(storageKey);
    const item = JSON.parse(raw || '{}');
    if (ID.test(item.id || '') && item.createdAt > Date.now() - 10 * 60000)
      return item;
  } catch { /* Corrupt or blocked session storage means no pending test. */ }
  return null;
}
function clearPending() {
  try { sessionStorage.removeItem(storageKey); } catch {}
}
function savePending(id) {
  try { sessionStorage.setItem(storageKey, JSON.stringify({id,createdAt:Date.now()})); }
  catch { /* Popup can still proceed; mobile callback may need a fresh attempt. */ }
}
async function finish(id) {
  try {
    const proof = await adminApi('/finish', { identityVerificationId:id });
    clearPending();
    if (proof?.sandboxPassed === true && proof?.mode === TEST &&
        proof?.productionEligibility === false && proof?.ageGrantCreated === false) {
      message('테스트 인증기관 서버 확인에 성공했습니다. 실제 성인인증 권한은 발급되지 않았습니다.', 'done');
    } else {
      message('테스트 결과를 확인할 수 없습니다. 실제 본인인증 권한은 발급되지 않습니다.', 'error');
    }
  } catch (error) {
    if (error.message === 'sandbox_server_proof_unavailable') {
      message('인증창 연결을 확인했습니다. 서버 결과 조회용 포트원 비밀키가 아직 설정되지 않아 최종 검증은 진행하지 않았습니다.');
      detail.textContent = '테스트 창 호출은 확인했으며 실제 인증 권한은 발급되지 않습니다.';
    } else {
      message('테스트 인증기관 검증이 완료되지 않았습니다. 실제 인증 권한은 발급되지 않습니다.', 'error');
    }
  }
}
async function start() {
  button.disabled = true;
  message('KG이니시스 테스트 채널을 연결하고 있습니다.');
  try {
    const response = await adminApi('/start', {});
    if (response.mode !== TEST || response.provider !== PROVIDER ||
        response.productionEligibility !== false || !ID.test(response.identityVerificationId) ||
        !/^store-[a-z0-9-]{8,80}$/i.test(response.storeId) ||
        !/^channel-key-[a-z0-9-]{8,80}$/i.test(response.channelKey))
      throw new Error('sandbox_configuration_mismatch');
    const id = response.identityVerificationId;
    savePending(id);
    const provider = await sdk();
    // Always collect user data inside the certified provider's test UI.
    const result = await provider.requestIdentityVerification({
      storeId: response.storeId,
      channelKey: response.channelKey,
      identityVerificationId: id,
      redirectUrl: location.origin + '/verify/adult/test.html',
      bypass: { inicisUnified: { flgFixedUser: 'N' } }
    });
    if (result?.code !== undefined) {
      clearPending();
      message('테스트 인증이 취소되거나 실패했습니다. 필요한 경우 다시 시도해 주세요.', 'error');
      return;
    }
    // SDK's browser response is NEVER sufficient for a real identity proof.
    await finish(id);
  } catch (error) {
    clearPending();
    message(error.message === 'sandbox_attempt_limit'
      ? '오늘의 테스트 시도 한도(5회)에 도달했습니다.'
      : '테스트 채널 연결 또는 인증창 실행에 실패했습니다.', 'error');
  } finally {
    button.disabled = false;
  }
}
async function main() {
  const url = new URL(location.href);
  const callbackId = url.searchParams.get('identityVerificationId');
  const failed = url.searchParams.has('code');
  if (callbackId || failed) {
    for (const key of ['identityVerificationId','code','message','pgCode','pgMessage'])
      url.searchParams.delete(key);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  let cfg;
  try { cfg = await adminApi(''); }
  catch (error) {
    if (error.httpStatus === 401) {
      login.hidden = false;
      message('에코디 최고관리자 로그인이 필요합니다.', 'error');
    } else if (error.httpStatus === 403) {
      message('에코디 최고관리자만 테스트 인증을 실행할 수 있습니다.', 'error');
    } else {
      message('관리자 인증 연결을 확인할 수 없습니다.', 'error');
    }
    return;
  }
  if (!cfg?.enabled || cfg?.mode !== TEST || cfg?.productionEligibility !== false) {
    message('테스트 채널 연결이 아직 준비되지 않았습니다.');
    return;
  }
  detail.textContent = '포트원 KG이니시스 TEST 채널 연결 준비됨. 거래당 최대 10분, 하루 최대 5회. 운영 인증 및 회원 권한 부여 없음.';
  button.hidden = false;
  button.addEventListener('click', start);
  const item = pending();
  if (failed) {
    clearPending();
    message('인증기관 테스트가 취소되거나 실패했습니다. 실제 인증 권한은 발급되지 않습니다.', 'error');
    return;
  }
  if (callbackId) {
    if (!item || item.id !== callbackId || !ID.test(callbackId)) {
      message('이전에 시작한 테스트 거래와 일치하지 않습니다.', 'error');
      return;
    }
    message('인증기관의 테스트 결과를 서버에서 재확인하고 있습니다.');
    await finish(callbackId);
    return;
  }
  message('KG이니시스 테스트 채널이 연결됐습니다. 아래 버튼으로 인증창을 확인할 수 있습니다.', 'done');
}
main().catch(() => message('테스트 연결을 확인할 수 없습니다.', 'error'));
