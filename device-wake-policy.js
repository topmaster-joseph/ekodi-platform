import authWorker from './auth-worker.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

function verifiedDesktop(row) {
  if (!row || row.revoked_at || String(row.device_type || 'pc') !== 'pc') return false;
  const settings = parseJson(row.settings_json, {});
  const diagnostics = parseJson(row.diagnostics_json, {});
  const system = diagnostics.system || settings?.health?.system || {};
  return system.autoExecutionEligible === true
    && system.isPortable === false
    && system.deviceClass !== 'portable';
}

async function devicePolicyRow(env, deviceId) {
  return env.DB.prepare(`SELECT d.id,d.settings_json,d.diagnostics_json,d.revoked_at,
      COALESCE(m.device_type,'pc') AS device_type
    FROM device_registry d
    LEFT JOIN device_management_profiles m ON m.device_id=d.id
    WHERE d.id=? LIMIT 1`).bind(deviceId).first();
}

export async function enforceDesktopWakeRequest(request, env) {
  if (!env?.DB?.prepare) return null;
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/control\/wake\/devices\/([^/]+)(?:\/wake)?$/);
  if (!match || !['PUT','POST'].includes(request.method)) return null;

  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;

  const deviceId = decodeURIComponent(match[1]);
  const row = await devicePolicyRow(env, deviceId);
  if (!row) return json({ error:'등록된 기기를 찾을 수 없습니다.' }, 404);
  if (!verifiedDesktop(row)) {
    return json({
      error:'Agent가 검증한 데스크톱 PC만 원격 전원 및 자동 작업에 사용할 수 있습니다.',
      code:'VERIFIED_DESKTOP_REQUIRED',
    }, 409);
  }
  return null;
}

export async function disableIneligibleWakeProfiles(env) {
  if (!env?.DB?.prepare) return { checked:0, disabled:0 };
  let rows;
  try {
    rows = await env.DB.prepare(`SELECT p.device_id,d.settings_json,d.diagnostics_json,d.revoked_at,
        COALESCE(m.device_type,'pc') AS device_type
      FROM device_wake_profiles p
      JOIN device_registry d ON d.id=p.device_id
      LEFT JOIN device_management_profiles m ON m.device_id=d.id
      WHERE p.enabled=1`).all();
  } catch {
    return { checked:0, disabled:0 };
  }
  let disabled = 0;
  for (const row of rows.results || []) {
    if (verifiedDesktop(row)) continue;
    const result = await env.DB.prepare(`UPDATE device_wake_profiles
      SET enabled=0,auto_wake_for_jobs=0,updated_at=? WHERE device_id=? AND enabled=1`)
      .bind(new Date().toISOString(), row.device_id).run();
    disabled += Number(result.meta?.changes || 0);
  }
  return { checked:(rows.results || []).length, disabled };
}
