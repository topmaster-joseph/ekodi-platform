function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function warning(error) {
  return String(error?.message || error || 'analytics unavailable').slice(0, 180);
}

async function optionalProduct(name, loader) {
  try {
    return { name, available:true, warning:'', ...(await loader()) };
  } catch (error) {
    return { name, available:false, warning:warning(error) };
  }
}

async function d1Names(account, cf) {
  try {
    const payload = await cf(account, `/accounts/${encodeURIComponent(account.accountId)}/d1/database?per_page=100`);
    return new Map((payload?.result || []).map(row => [String(row?.uuid || row?.id || ''), String(row?.name || '')]));
  } catch {
    return new Map();
  }
}
export async function collectD1Usage(account, window, gql, cf) {
  return optionalProduct('d1', async () => {
    const start = dateOnly(window.start);
    const end = dateOnly(window.end);
    const query = `query D1Usage($accountTag:string!,$start:Date,$end:Date) {
      viewer { accounts(filter:{accountTag:$accountTag}) {
        d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$start,date_leq:$end}) {
          dimensions { databaseId }
          sum { readQueries writeQueries rowsRead rowsWritten }
        }
      } }
    }`;
    const [payload, names] = await Promise.all([
      gql(account, query, { accountTag:account.accountId, start, end }),
      d1Names(account, cf),
    ]);
    const rows = payload?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];
    const databases = rows.map(row => {
      const databaseId = String(row?.dimensions?.databaseId || 'unknown');
      const readQueries = asNumber(row?.sum?.readQueries);
      const rowsRead = asNumber(row?.sum?.rowsRead);
      return {
        databaseId,
        database:names.get(databaseId) || databaseId,
        readQueries,
        writeQueries:asNumber(row?.sum?.writeQueries),
        rowsRead,
        rowsWritten:asNumber(row?.sum?.rowsWritten),
        rowsReadPerReadQuery:readQueries > 0 ? Math.round((rowsRead / readQueries) * 100) / 100 : 0,
      };
    }).sort((a,b) => b.rowsRead - a.rowsRead);
    return {
      granularity:'calendar-date',
      window:{ start, end },
      rowsRead:databases.reduce((sum,row)=>sum+row.rowsRead,0),
      rowsWritten:databases.reduce((sum,row)=>sum+row.rowsWritten,0),
      readQueries:databases.reduce((sum,row)=>sum+row.readQueries,0),
      writeQueries:databases.reduce((sum,row)=>sum+row.writeQueries,0),
      databases,
    };
  });
}

export async function collectKVUsage(account, window, gql) {
  return optionalProduct('kv', async () => {
    const start = dateOnly(window.start);
    const end = dateOnly(window.end);
    const query = `query KVUsage($accountTag:string!,$start:Date,$end:Date) {
      viewer { accounts(filter:{accountTag:$accountTag}) {
        kvOperationsAdaptiveGroups(limit:10000,filter:{date_geq:$start,date_leq:$end}) {
          dimensions { actionType }
          sum { requests }
        }
      } }
    }`;
    const payload = await gql(account, query, { accountTag:account.accountId, start, end });
    const rows = payload?.data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups || [];
    const actions = rows.map(row => ({
      action:String(row?.dimensions?.actionType || 'unknown'),
      requests:asNumber(row?.sum?.requests),
    })).sort((a,b)=>b.requests-a.requests);
    return { granularity:'calendar-date', window:{ start,end }, requests:actions.reduce((sum,row)=>sum+row.requests,0), actions };
  });
}
export async function collectR2Usage(account, window, gql) {
  return optionalProduct('r2', async () => {
    const query = `query R2Usage($accountTag:string!,$start:Time,$end:Time) {
      viewer { accounts(filter:{accountTag:$accountTag}) {
        r2OperationsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_leq:$end}) {
          dimensions { bucketName actionType actionStatus }
          sum { requests }
        }
      } }
    }`;
    const payload = await gql(account, query, { accountTag:account.accountId, start:window.start, end:window.end });
    const rows = payload?.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];
    const operations = rows.map(row => ({
      bucket:String(row?.dimensions?.bucketName || 'unknown'),
      action:String(row?.dimensions?.actionType || 'unknown'),
      status:String(row?.dimensions?.actionStatus || 'unknown'),
      requests:asNumber(row?.sum?.requests),
    })).sort((a,b)=>b.requests-a.requests);
    const errorRequests = operations
      .filter(row => !['success','unknown'].includes(row.status))
      .reduce((sum,row)=>sum+row.requests,0);
    return {
      granularity:'time',
      window:{ start:window.start,end:window.end },
      requests:operations.reduce((sum,row)=>sum+row.requests,0),
      errorRequests,
      operations,
    };
  });
}
export async function collectDurableObjectUsage(account, window, gql) {
  return optionalProduct('durableObjects', async () => {
    const start = dateOnly(window.start);
    const end = dateOnly(window.end);
    const query = `query DOUsage($accountTag:string!,$start:Date,$end:Date) {
      viewer { accounts(filter:{accountTag:$accountTag}) {
        durableObjectsInvocationsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}) {
          sum { requests responseBodySize }
        }
      } }
    }`;
    const payload = await gql(account, query, { accountTag:account.accountId, start, end });
    const rows = payload?.data?.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups || [];
    return {
      granularity:'calendar-date',
      window:{ start,end },
      requests:rows.reduce((sum,row)=>sum+asNumber(row?.sum?.requests),0),
      responseBodySize:rows.reduce((sum,row)=>sum+asNumber(row?.sum?.responseBodySize),0),
    };
  });
}

export async function collectProductUsage(account, window, gql, cf) {
  const [d1, kv, r2, durableObjects] = await Promise.all([
    collectD1Usage(account, window, gql, cf),
    collectKVUsage(account, window, gql),
    collectR2Usage(account, window, gql),
    collectDurableObjectUsage(account, window, gql),
  ]);
  return { d1, kv, r2, durableObjects };
}
