import { ensureDevotionalSchema } from './devotional-automation.js';

const CALLBACK_PATH = '/api/control/devotional/executor/callback';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff'
    }
  });
}

export function isDevotionalExecutorCallback(request) {
  const url = new URL(request.url);
  return request.method === 'POST' && url.pathname === CALLBACK_PATH;
}

export async function handleDevotionalExecutorCallback(request, env) {
  if (!env.DB) return response({ error:'database unavailable' }, 503);
  const expected = String(env.DEVOTIONAL_CALLBACK_TOKEN || '');
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied || supplied !== expected) return response({ error:'unauthorized' }, 401);

  let body = null;
  try { body = await request.json(); } catch {}
  const entryId = String(body?.entryId || '');
  const stage = String(body?.stage || '');
  const ok = body?.ok !== false;
  if (!/^devotional-\d{4}-\d{2}-\d{2}$/.test(entryId)) return response({ error:'invalid entryId' }, 400);
  if (!['render','schedule','publish'].includes(stage)) return response({ error:'invalid stage' }, 400);

  await ensureDevotionalSchema(env.DB);
  const now = new Date().toISOString();
  const error = String(body?.error || '').slice(0,500);

  if (stage === 'render') {
    await env.DB.prepare(`UPDATE devotional_entries
      SET status=?, video_path=?, error=?, updated_at=? WHERE id=?`)
      .bind(ok ? 'rendered' : 'render_failed', ok ? String(body?.videoPath || '') : '', error, now, entryId).run();
  } else if (stage === 'schedule') {
    await env.DB.prepare(`UPDATE devotional_entries SET
      status=?, church_youtube_id=?, mission_youtube_id=?, church_publish_at=?, mission_publish_at=?, error=?, updated_at=?
      WHERE id=?`)
      .bind(
        ok ? 'scheduled' : 'schedule_failed',
        String(body?.churchYoutubeId || ''),
        String(body?.missionYoutubeId || ''),
        String(body?.churchPublishAt || ''),
        String(body?.missionPublishAt || ''),
        error,
        now,
        entryId
      ).run();
  } else {
    await env.DB.prepare(`UPDATE devotional_entries SET status=?, error=?, updated_at=? WHERE id=?`)
      .bind(ok ? 'published' : 'schedule_failed', error, now, entryId).run();
  }

  const jobKind = stage === 'render' ? 'render' : 'schedule';
  await env.DB.prepare(`UPDATE devotional_jobs SET status=?, updated_at=?
    WHERE id=(SELECT id FROM devotional_jobs WHERE entry_id=? AND kind=? AND status IN ('queued','running') ORDER BY id DESC LIMIT 1)`)
    .bind(ok ? 'completed' : 'failed', now, entryId, jobKind).run();

  return response({ ok:true, entryId, stage, status:ok ? 'completed' : 'failed' });
}