const JOB_STATES = new Set(['scheduled','queued','publishing','published','retrying','failed','cancelled','credentials_required']);

function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function subjectLabel(row) {
  const type = String(row.subject_type || '');
  if (type === 'person') return '개인 브랜드';
  return String(row.subject_key || '').slice(0, 100) || type || '공통';
}

function publicJob(row) {
  const status = String(row.status || '');
  return {
    id:Number(row.id),
    subjectType:String(row.subject_type || ''),
    subjectLabel:subjectLabel(row),
    contentId:Number(row.content_id || 0),
    channelId:Number(row.channel_id || 0),
    title:String(row.title || '').slice(0, 240),
    contentType:String(row.content_type || ''),
    captionExcerpt:String(row.caption || '').slice(0, 240),
    provider:String(row.provider || ''),
    channelType:String(row.channel_type || ''),
    channelName:String(row.display_name || ''),
    scheduleKind:String(row.schedule_kind || ''),
    scheduledAt:row.scheduled_at || null,
    recurrenceRule:String(row.recurrence_rule || ''),
    status:JOB_STATES.has(status) ? status : 'unknown',
    requestedBy:String(row.requested_by || ''),
    attemptCount:Number(row.attempt_count || 0),
    maxAttempts:Number(row.max_attempts || 0),
    nextAttemptAt:row.next_attempt_at || null,
    externalPostUrl:safeUrl(row.external_post_url),
    lastError:String(row.last_error || '').slice(0, 320),
    publishedAt:row.published_at || null,
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null,
  };
}

function publicChannel(row) {
  return {
    id:Number(row.id),
    subjectType:String(row.subject_type || ''),
    subjectLabel:subjectLabel(row),
    provider:String(row.provider || ''),
    channelType:String(row.channel_type || ''),
    displayName:String(row.display_name || ''),
    status:String(row.status || ''),
    lastCheckAt:row.last_check_at || null,
    lastError:String(row.last_error || '').slice(0, 320),
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null,
  };
}

export async function readMarketingPublicationOverview(env) {
  try {
    const [jobsResult, channelsResult] = await Promise.all([
      env.DB.prepare(`SELECT j.id,j.subject_type,j.subject_key,j.content_id,j.channel_id,j.schedule_kind,j.scheduled_at,j.recurrence_rule,
        j.status,j.requested_by,j.attempt_count,j.max_attempts,j.next_attempt_at,j.external_post_url,j.last_error,j.published_at,j.created_at,j.updated_at,
        c.title,c.content_type,c.caption,ch.provider,ch.channel_type,ch.display_name
        FROM marketing_publication_jobs j
        JOIN marketing_content_items c ON c.id=j.content_id
        JOIN marketing_publish_channels ch ON ch.id=j.channel_id
        ORDER BY j.created_at DESC LIMIT 300`).all(),
      env.DB.prepare(`SELECT id,subject_type,subject_key,provider,channel_type,display_name,status,last_check_at,last_error,created_at,updated_at
        FROM marketing_publish_channels ORDER BY updated_at DESC LIMIT 300`).all(),
    ]);
    const jobs = (jobsResult.results || []).map(publicJob);
    const channels = (channelsResult.results || []).map(publicChannel);
    return {
      connected:true,
      jobs,
      channels,
      summary:{
        jobs:jobs.length,
        scheduled:jobs.filter(row => ['scheduled','queued','publishing'].includes(row.status)).length,
        published:jobs.filter(row => row.status === 'published').length,
        failed:jobs.filter(row => row.status === 'failed').length,
        retrying:jobs.filter(row => row.status === 'retrying').length,
        credentialsRequired:jobs.filter(row => row.status === 'credentials_required').length,
        channels:channels.length,
        activeChannels:channels.filter(row => row.status === 'active').length,
      },
    };
  } catch (error) {
    return {
      connected:false,
      jobs:[],
      channels:[],
      summary:{jobs:0,scheduled:0,published:0,failed:0,retrying:0,credentialsRequired:0,channels:0,activeChannels:0},
      error:String(error?.message || 'publication ledger unavailable').slice(0, 240),
    };
  }
}
