import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const REPORT_PATH = process.env.SYSTEM_HEALTH_REPORT_PATH || 'system-health-code-report.json';
const RUNTIME_EXTENSIONS = /\.(?:c?js|mjs)$/i;
const EXCLUDED_PREFIXES = ['dist/', 'node_modules/', '.wrangler/'];
const KEY_DOCS = ['README.md', 'AGENTS.md', 'SECURITY.md', 'platform-boundaries.json', 'docs/PLATFORM-ISOLATION.md'];
const WEIGHTS = Object.freeze({ tests:25, duplication:15, complexity:15, security:15, architecture:15, deployment:10, documentation:5 });

function command(commandName, args, timeout = 360_000) {
  const result = spawnSync(commandName, args, {
    encoding:'utf8',
    maxBuffer:16 * 1024 * 1024,
    stdio:['ignore', 'pipe', 'pipe'],
    timeout,
    shell:process.platform === 'win32' && commandName === 'npm'
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    ok:result.status === 0,
    status:result.status,
    timedOut:Boolean(result.error?.code === 'ETIMEDOUT'),
    output,
    summary:output ? output.split('\n').slice(-12).join('\n').slice(-1800) : ''
  };
}

function git(args) {
  const result = command('git', args, 60_000);
  if (!result.ok) throw new Error(result.summary || `git ${args.join(' ')} failed`);
  return result.output;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round1(value) { return Math.round(value * 10) / 10; }
function normalizeLine(line) {
  return String(line || '')
    .replace(/\/\/.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function severityRank(value) { return ({ critical:0, high:1, medium:2, low:3, info:4 })[value] ?? 9; }
function statusForScore(score) {
  if (score >= 90) return 'healthy';
  if (score >= 80) return 'watch';
  if (score >= 70) return 'maintenance';
  return 'restricted';
}

function collapseDuplicateGroups(groups, maxGap = 20) {
  const collapsed = [];
  for (const group of groups) {
    const files = [...group.files].sort();
    const key = files.join('\0');
    const hit = collapsed.find(item => item.key === key && group.occurrences.every(occ => item.occurrences.some(existing => existing.path === occ.path && Math.abs(existing.line - occ.line) <= maxGap)));
    if (!hit) { collapsed.push({ key, files, occurrences:group.occurrences.map(item => ({ ...item })), windows:1 }); continue; }
    hit.windows += 1;
    for (const occ of group.occurrences) {
      const existing = hit.occurrences.find(item => item.path === occ.path && Math.abs(item.line - occ.line) <= maxGap);
      if (existing) existing.line = Math.min(existing.line, occ.line); else hit.occurrences.push({ ...occ });
    }
  }
  return collapsed.map(({ files, occurrences, windows }) => ({ files, occurrences, windows }));
}

function duplicateBlocks(files, windowSize = 10) {
  const index = new Map();
  for (const file of files) {
    const lines = file.content.split(/\r?\n/).map((text, rawIndex) => ({ text:normalizeLine(text), line:rawIndex + 1 })).filter(item => item.text.length >= 12);
    for (let i = 0; i <= lines.length - windowSize; i += 2) {
      const block = lines.slice(i, i + windowSize), normalized = block.map(item => item.text).join('\n');
      if (normalized.length < 320) continue;
      const hash = createHash('sha1').update(normalized).digest('hex'), occurrences = index.get(hash) || [];
      if (occurrences.length < 6) occurrences.push({ path:file.path, line:block[0].line });
      index.set(hash, occurrences);
    }
  }
  const raw = [...index.entries()].map(([hash, occurrences]) => ({ hash, occurrences, files:[...new Set(occurrences.map(item => item.path))] })).filter(item => item.files.length >= 2).sort((a,b) => b.files.length-a.files.length || b.occurrences.length-a.occurrences.length);
  const groups = collapseDuplicateGroups(raw, windowSize * 2).slice(0, 30);
  return { groups, rawCount:raw.length };
}

async function loadRuntimeFiles(tracked) {
  const paths = tracked.filter(path => RUNTIME_EXTENSIONS.test(path)
    && !path.startsWith('test/')
    && !EXCLUDED_PREFIXES.some(prefix => path.startsWith(prefix))
    && existsSync(path));
  const files = [];
  for (const path of paths) {
    try {
      const content = await readFile(path, 'utf8');
      files.push({ path, content, lines:content.split(/\r?\n/).length });
    } catch {}
  }
  return files;
}

function makeDebt(id, severity, category, title, detail, recommendation, evidence = []) {
  return { id, severity, category, title, detail, recommendation, evidence };
}

async function main() {
  const startedAt = new Date().toISOString();
  const tracked = command('git', ['ls-files']).output.split(/\r?\n/).filter(Boolean);
  const runtimeFiles = await loadRuntimeFiles(tracked);
  const testFiles = tracked.filter(path => path.startsWith('test/') && /\.test\.(?:c?js|mjs)$/i.test(path));
  const workflowFiles = tracked.filter(path => path.startsWith('.github/workflows/') && /\.ya?ml$/i.test(path));
  const totalRuntimeLines = runtimeFiles.reduce((sum, file) => sum + file.lines, 0);
  const largeFiles = runtimeFiles.filter(file => file.lines >= 1400).sort((a, b) => b.lines - a.lines);
  const veryLargeFiles = runtimeFiles.filter(file => file.lines >= 2600).sort((a, b) => b.lines - a.lines);
  const todoMatches = [];
  for (const file of runtimeFiles) {
    file.content.split(/\r?\n/).forEach((line, index) => {
      if (/\b(?:TODO|FIXME|HACK|TEMP(?:ORARY)?)\b/i.test(line)) todoMatches.push({ path:file.path, line:index + 1 });
    });
  }
  const duplicateScan = duplicateBlocks(runtimeFiles);
  const duplicates = duplicateScan.groups;

  const checks = {
    tests:command('npm', ['test']),
    security:command('npm', ['run', 'validate:security']),
    architecture:command('npm', ['run', 'validate:boundaries']),
    deployment:command('npm', ['run', 'validate:deployments'])
  };

  const docPresent = KEY_DOCS.filter(path => existsSync(path));
  const dimensions = {
    tests:{ weight:WEIGHTS.tests, score:checks.tests.ok ? WEIGHTS.tests : 5, status:checks.tests.ok ? 'ok' : 'error', detail:checks.tests.ok ? `${testFiles.length}개 테스트 파일 · 전체 테스트 통과` : '전체 테스트 실패 또는 시간 초과' },
    duplication:{ weight:WEIGHTS.duplication, score:round1(clamp(WEIGHTS.duplication - Math.min(WEIGHTS.duplication, duplicates.length * 0.45), 0, WEIGHTS.duplication)), status:duplicates.length <= 4 ? 'ok' : duplicates.length <= 12 ? 'warn' : 'error', detail:`교차 파일 중복 군집 ${duplicates.length}개 · 겹침 창 ${duplicateScan.rawCount}개 정규화` },
    complexity:{ weight:WEIGHTS.complexity, score:round1(clamp(WEIGHTS.complexity - largeFiles.length * 0.45 - veryLargeFiles.length * 0.9 - Math.max(0, todoMatches.length - 20) * 0.05, 0, WEIGHTS.complexity)), status:veryLargeFiles.length ? 'warn' : largeFiles.length > 8 ? 'warn' : 'ok', detail:`대형 파일 ${largeFiles.length}개 · 매우 큰 파일 ${veryLargeFiles.length}개 · TODO/FIXME ${todoMatches.length}건` },
    security:{ weight:WEIGHTS.security, score:checks.security.ok ? WEIGHTS.security : 0, status:checks.security.ok ? 'ok' : 'error', detail:checks.security.ok ? '보안 기준 검증 통과' : '보안 기준 검증 실패' },
    architecture:{ weight:WEIGHTS.architecture, score:checks.architecture.ok ? WEIGHTS.architecture : 0, status:checks.architecture.ok ? 'ok' : 'error', detail:checks.architecture.ok ? '플랫폼 경계 검증 통과' : '플랫폼 경계 검증 실패' },
    deployment:{ weight:WEIGHTS.deployment, score:checks.deployment.ok ? WEIGHTS.deployment : 0, status:checks.deployment.ok ? 'ok' : 'error', detail:checks.deployment.ok ? `${workflowFiles.length}개 Workflow · 배포 가드 검증 통과` : '배포 가드 검증 실패' },
    documentation:{ weight:WEIGHTS.documentation, score:round1((docPresent.length / KEY_DOCS.length) * WEIGHTS.documentation), status:docPresent.length === KEY_DOCS.length ? 'ok' : 'warn', detail:`핵심 문서 ${docPresent.length}/${KEY_DOCS.length} 확인` }
  };
  const overallScore = round1(Object.values(dimensions).reduce((sum, item) => sum + item.score, 0));

  const technicalDebt = [];
  if (!checks.tests.ok) technicalDebt.push(makeDebt('tests-failing', 'critical', 'tests', '전체 테스트 점검 필요', '정기 코드 건강검사에서 전체 테스트가 통과하지 않았습니다.', '신규 기능 반영보다 실패 테스트의 원인을 먼저 분리하고 회귀 범위를 확인하세요.'));
  if (!checks.security.ok) technicalDebt.push(makeDebt('security-validation', 'critical', 'security', '보안 기준 검증 실패', 'validate:security가 통과하지 않았습니다.', '인증·권한·헤더·Secret 경계를 우선 확인하고 자동 우회는 금지하세요.'));
  if (!checks.architecture.ok) technicalDebt.push(makeDebt('architecture-boundary', 'high', 'architecture', '플랫폼 경계 검증 실패', '플랫폼 격리 또는 공유 Core 경계 계약이 깨졌을 가능성이 있습니다.', '직접 의존을 공통 API 계약으로 환원한 뒤 회귀 테스트를 수행하세요.'));
  if (!checks.deployment.ok) technicalDebt.push(makeDebt('deployment-guardrail', 'high', 'deployment', '배포 가드 검증 실패', '배포 Workflow 또는 격리 규칙이 현재 계약과 맞지 않습니다.', '운영 배포 전 path filter, production gate, rollback 경로를 확인하세요.'));
  veryLargeFiles.slice(0, 8).forEach((file, index) => technicalDebt.push(makeDebt(`very-large-${index}`, 'medium', 'complexity', `매우 큰 런타임 파일: ${file.path}`, `${file.lines.toLocaleString()}줄로 기능 경계가 한 파일에 과도하게 모였을 수 있습니다.`, '동작을 바꾸지 않는 범위에서 역할별 모듈 경계를 먼저 추출하세요.', [`${file.path}:${file.lines}`])));
  duplicates.slice(0, 8).forEach((group, index) => technicalDebt.push(makeDebt(`duplicate-${index}`, 'medium', 'duplication', '교차 파일 중복 로직 후보', `${group.files.length}개 파일에서 동일한 코드 블록 후보가 반복됩니다.`, '공통 Core로 승격 가능한지 영향 범위를 분석한 뒤, 테스트가 있는 경우에만 통합하세요.', group.occurrences.map(item => `${item.path}:${item.line}`))));
  if (todoMatches.length > 20) technicalDebt.push(makeDebt('todo-volume', 'low', 'complexity', '임시 작업 표식 누적', `TODO/FIXME/HACK/TEMP 표식이 ${todoMatches.length}건입니다.`, '오래된 항목부터 제거 조건과 책임 영역을 정리하세요.', todoMatches.slice(0, 8).map(item => `${item.path}:${item.line}`)));
  technicalDebt.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const head = command('git', ['rev-parse', 'HEAD']).output || null;
  const branch = process.env.GITHUB_REF_NAME || command('git', ['branch', '--show-current']).output || null;
  const report = {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    startedAt,
    repository:'topmaster-joseph/ekodi-platform',
    branch,
    head,
    overallScore,
    status:statusForScore(overallScore),
    thresholds:{ healthy:90, watch:80, maintenance:70, restrictedBelow:70 },
    dimensions,
    metrics:{ runtimeFiles:runtimeFiles.length, runtimeLines:totalRuntimeLines, testFiles:testFiles.length, workflows:workflowFiles.length, largeFiles:largeFiles.length, veryLargeFiles:veryLargeFiles.length, todoMarkers:todoMatches.length, duplicateGroups:duplicates.length, duplicateWindows:duplicateScan.rawCount },
    technicalDebt:technicalDebt.slice(0, 24),
    checks:Object.fromEntries(Object.entries(checks).map(([name, value]) => [name, { ok:value.ok, status:value.status, timedOut:value.timedOut, summary:value.summary }])),
    cadence:{ change:'PR/main 변경 시 CI·계약 테스트', daily:'운영 상태·Source Integrity 경량 점검', weekly:'코드 건강·중복·복잡도·기술부채 심층 점검', monthly:'아키텍처·배포·보안 기준 재검토' },
    maintenancePolicy:['관찰', '원인 분석', '수정안 생성', '테스트·영향 검증', '관리자 승인', '가역적 적용', '운영 재검증'],
    privacy:{ publicSummaryOnly:true, secretsIncluded:false, rawLogsIncluded:false }
  };

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report:REPORT_PATH, score:overallScore, status:report.status, debt:report.technicalDebt.length, metrics:report.metrics }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# EKODI System Health · Code Audit',
      '',
      `- Score: **${overallScore}/100**`,
      `- Status: **${report.status}**`,
      `- Runtime files: ${runtimeFiles.length}`,
      `- Tests: ${checks.tests.ok ? 'PASS' : 'FAIL'}`,
      `- Security: ${checks.security.ok ? 'PASS' : 'FAIL'}`,
      `- Architecture: ${checks.architecture.ok ? 'PASS' : 'FAIL'}`,
      `- Deployment: ${checks.deployment.ok ? 'PASS' : 'FAIL'}`,
      `- Technical debt candidates: ${report.technicalDebt.length}`,
      '',
      '> 이 보고서는 자동 수정 권한을 갖지 않습니다. 분석 → 수정안 → 검증 → 관리자 승인 순서를 지킵니다.'
    ];
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { encoding:'utf8', flag:'a' });
  }
}

main().catch(async error => {
  const fallback = {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    repository:'topmaster-joseph/ekodi-platform',
    overallScore:null,
    status:'error',
    error:String(error?.message || error),
    technicalDebt:[makeDebt('audit-failed', 'high', 'audit', '코드 건강검사 실행 실패', '정기 점검 자체를 완료하지 못했습니다.', '검사 Workflow와 실행환경을 확인하세요.')],
    privacy:{ publicSummaryOnly:true, secretsIncluded:false, rawLogsIncluded:false }
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8').catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
