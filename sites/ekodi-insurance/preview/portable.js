// Unlinked preview-only UI. Never include in production build before privacy review.
import {
  encryptPortableRecords
} from '../portable-records.mjs';
import {
  inspectPortableSource, planPortableImport, commitPortableImport,
  rollbackPortableImport
} from '../portable-records-session.mjs';

const $ = id => document.getElementById(id);
let pendingPlan = null;
let backupDownloadOffered = false;
let importCommitted = false;
const MAX_ARCHIVE_SIZE = 3 * 1024 * 1024;

function status(id, message, isError = false) {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle('error', isError);
}
function saveEncryptedFile(data, name) {
  const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sanitizedError(error) {
  // Do not display or log record contents, files, or secrets.
  const s = String(error?.message || '');
  if (/password|incorrect|damaged/i.test(s)) return '암호가 맞지 않거나 파일이 손상됐습니다.';
  if (/changed since/i.test(s)) return '미리보기 이후 현재 기록이 변경됐습니다. 다시 미리보기를 실행하세요.';
  if (/separate explicit consent/i.test(s)) return '암호화 파일에 선택적인 AI 대화 또는 보험점검 메모가 포함되어 있습니다. 해당 항목의 별도 가져오기 동의를 선택하세요.';
  if (/limit|size/i.test(s)) return '파일 또는 기록의 허용 크기를 초과했습니다.';
  if (/backup|consent/i.test(s)) return '백업 확인과 명시적 동의가 필요합니다.';
  return '처리할 수 없는 기록 또는 파일입니다. 현재 기록은 변경되지 않았습니다.';
}
function updateImportButton() {
  $('confirm-import').disabled = !pendingPlan || importCommitted ||
    !backupDownloadOffered || !$('backup-ack').checked || !$('import-consent').checked;
}
function clearImport() {
  pendingPlan = null;
  backupDownloadOffered = false;
  importCommitted = false;
  $('import-preview').classList.add('hidden');
  $('backup-ack').checked = false;
  $('import-consent').checked = false;
  $('undo-import').disabled = true;
  updateImportButton();
}

$('export-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const password = $('export-password').value;
    if (password !== $('export-password-again').value) {
      throw new Error('password mismatch');
    }
    const state = inspectPortableSource(localStorage).state;
    const file = await encryptPortableRecords(state, password, {
      includeDiagnosis: $('include-diagnosis').checked,
      includeChat: $('include-chat').checked
    });
    saveEncryptedFile(file, 'ekodi-insurance-selfcare.encrypted.json');
    status('export-status', '암호화 파일 저장을 요청했습니다. 실제 다운로드 여부와 암호 보관을 확인하세요. 기존 기록은 유지됩니다.');
  } catch (error) {
    status('export-status', sanitizedError(error), true);
  } finally {
    $('export-password').value = '';
    $('export-password-again').value = '';
    submit.disabled = false;
  }
});

$('import-form').addEventListener('submit', async event => {
  event.preventDefault();
  clearImport();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const file = $('import-file').files?.[0];
    if (!file || file.size > MAX_ARCHIVE_SIZE) throw new Error('archive size limit');
    const encryptedFile = await file.text();
    const plan = await planPortableImport({
      storage: localStorage,
      encryptedFile,
      importPassphrase: $('import-password').value,
      backupPassphrase: $('backup-password').value,
      includeDiagnosis: $('import-diagnosis').checked,
      includeChat: $('import-chat').checked
    });
    pendingPlan = plan;
    const counts = plan.summary;
    $('import-count').textContent =
      '추가 예정: 보험 ' + counts.addedPolicies + '건, 청구메모 ' +
      counts.addedClaims + '건. 선택한 점검 메모 ' + (counts.diagnosisInArchive ? '포함' : '없음') +
      ', 선택한 AI 대화 ' + counts.messagesInArchive + '건. 기존 기록은 유지하며 중복은 제외합니다. 서버 상담기록과 철회 권한은 변경하지 않습니다.';
    $('import-preview').classList.remove('hidden');
    status('import-status', '미리보기만 완료했습니다. 아직 가져오거나 저장한 기록은 없습니다.');
    updateImportButton();
  } catch (error) {
    status('import-status', sanitizedError(error), true);
  } finally {
    $('import-password').value = '';
    $('backup-password').value = '';
    submit.disabled = false;
  }
});

$('save-backup').addEventListener('click', () => {
  if (!pendingPlan) return;
  try {
    saveEncryptedFile(pendingPlan.encryptedBackup, 'ekodi-insurance-before-import.encrypted.json');
    backupDownloadOffered = true;
    status('import-status', '기존 자가관리 기록의 암호화 백업 다운로드를 요청했습니다. 저장과 암호 보관을 직접 확인하세요.');
  } catch (error) {
    status('import-status', sanitizedError(error), true);
  }
  updateImportButton();
});
$('backup-ack').addEventListener('change', updateImportButton);
$('import-consent').addEventListener('change', updateImportButton);
$('import-file').addEventListener('change', () => {
  if (!importCommitted) clearImport();
});

$('confirm-import').addEventListener('click', () => {
  if (!pendingPlan || importCommitted) return;
  try {
    const result = commitPortableImport({
      storage: localStorage, plan: pendingPlan,
      acknowledgedBackup: backupDownloadOffered && $('backup-ack').checked,
      explicitUserConsent: $('import-consent').checked
    });
    importCommitted = true;
    $('undo-import').disabled = false;
    status('import-status', '현재 브라우저에 저장되었습니다. 기존 주소의 기록은 보존됩니다. 되돌리려면 이 화면을 닫기 전에 실행하세요. ' +
      (result.requiresPageReload ? '새로고침 후 적용됩니다.' : ''));
  } catch (error) {
    status('import-status', sanitizedError(error), true);
  }
  updateImportButton();
});

$('undo-import').addEventListener('click', () => {
  if (!pendingPlan || !importCommitted) return;
  if (!confirm('가져오기를 취소하고 이 페이지를 열기 전의 기록으로 되돌릴까요? 변경 사항이 있으면 자동 되돌리기가 중단됩니다.')) return;
  try {
    rollbackPortableImport({ storage: localStorage, plan: pendingPlan, explicitUserConsent: true });
    status('import-status', '기존 기록으로 되돌렸습니다. 기존 주소의 기록과 상담 철회 권한은 계속 보존됩니다.');
    clearImport();
  } catch (error) {
    status('import-status', sanitizedError(error), true);
  }
});
