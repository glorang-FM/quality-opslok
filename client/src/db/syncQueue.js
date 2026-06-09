import db from './offlineDb';

export async function enqueue(method, url, payload = null, tempId = null) {
  await db.sync_queue.add({
    method, url, payload, tempId,
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0,
    error: null,
  });
}

export async function getPendingItems() {
  return db.sync_queue.where('status').equals('pending').sortBy('createdAt');
}

export async function getPendingCount() {
  return db.sync_queue.where('status').equals('pending').count();
}

export async function processQueue(onProgress) {
  const items = await getPendingItems();
  if (items.length === 0) return { synced: 0, failed: 0 };

  const axios = (await import('axios')).default;
  const token = localStorage.getItem('ql_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let synced = 0, failed = 0;

  for (const item of items) {
    await db.sync_queue.update(item.id, { status: 'syncing' });
    try {
      const response = await axios({ method: item.method, url: item.url, data: item.payload, headers });
      await db.sync_queue.update(item.id, { status: 'done' });
      synced++;

      if (item.tempId && response.data?.id) {
        const allCached = await db.api_cache.toArray();
        for (const entry of allCached) {
          try {
            const text = JSON.stringify(entry.data);
            if (text.includes(item.tempId)) {
              const updated = JSON.parse(text.replace(new RegExp(item.tempId, 'g'), String(response.data.id)));
              await db.api_cache.put({ ...entry, data: updated, timestamp: Date.now() });
            }
          } catch {}
        }
      }

      if (onProgress) onProgress({ synced, failed, total: items.length });
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      await db.sync_queue.update(item.id, {
        status: attempts >= 3 ? 'error' : 'pending',
        attempts,
        error: err.message,
      });
      failed++;
      if (onProgress) onProgress({ synced, failed, total: items.length });
    }
  }

  return { synced, failed };
}

export async function clearCompleted() {
  await db.sync_queue.where('status').anyOf(['done', 'error']).delete();
}
