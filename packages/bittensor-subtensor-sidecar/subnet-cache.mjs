// Coalesce live discovery, wait within the HTTP deadline, and preserve a useful
// stale result on upstream failure without ever relabelling it as fresh.
export function createSubnetCache({ fetchSubnets, unavailable, ttlMs, waitMs = 8000, now = Date.now }) {
  let cached = null;
  let refresh = null;
  let failed = false;
  const fresh = limit => cached && now() - cached.cachedAt < ttlMs && cached.limit >= limit;
  return async limit => {
    if (!fresh(limit)) {
      if (!refresh) {
        const refreshLimit = Math.max(limit, cached?.limit ?? 0, 128);
        failed = false;
        refresh = Promise.resolve().then(() => fetchSubnets(refreshLimit)).then(payload => {
          if (payload?.freshness !== 'live' || !Array.isArray(payload.subnets) || !payload.subnets.length) {
            failed = true;
            return;
          }
          cached = { payload, limit: refreshLimit, cachedAt: now() };
        }).catch(() => { failed = true; }).finally(() => { refresh = null; });
      }
      let timer;
      try {
        await Promise.race([refresh, new Promise(resolve => { timer = setTimeout(resolve, waitMs); })]);
      } finally { clearTimeout(timer); }
    }
    if (!cached) return { ...unavailable(), subnets: [], warnings: [failed
      ? 'Live subnet discovery failed. Retry shortly or check the chain service.'
      : 'Live subnet discovery is still warming. Retry shortly.'] };
    const isFresh = fresh(limit);
    return {
      ...cached.payload,
      subnets: cached.payload.subnets.slice(0, limit).map(subnet => isFresh ? subnet : { ...subnet, freshness: 'stale' }),
      freshness: isFresh ? cached.payload.freshness : 'stale',
      warnings: [...(cached.payload.warnings ?? []), ...(isFresh ? [] : [
        failed ? 'Live refresh failed; returning stale subnet data.' : 'Live refresh is still running; returning stale subnet data.',
      ])],
    };
  };
}
