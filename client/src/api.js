import axios from 'axios';
import db from './db/offlineDb';
import { enqueue } from './db/syncQueue';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' });

// ─── Auth token ──────────────────────────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('ql_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Offline mutation interceptor ────────────────────────────────────────────
api.interceptors.request.use(async config => {
  if (navigator.onLine) return config;

  const method = (config.method || 'get').toUpperCase();
  if (method === 'GET') return config;

  const tempId = `local-${Date.now()}`;
  const payload = config.data
    ? (typeof config.data === 'string' ? JSON.parse(config.data) : config.data)
    : {};

  await enqueue(method, config.url, payload, tempId);

  const synthetic = buildSyntheticResponse(method, config.url, payload, tempId);
  const err = new Error('__OFFLINE_QUEUED__');
  err.isOfflineQueued = true;
  err.syntheticData = synthetic;
  throw err;
});

// ─── Response interceptor ────────────────────────────────────────────────────
api.interceptors.response.use(
  async res => {
    if ((res.config.method || '').toUpperCase() === 'GET' && res.data) {
      try {
        await db.api_cache.put({ url: res.config.url, data: res.data, timestamp: Date.now() });
      } catch { /* non-critical */ }
    }
    return res;
  },
  async err => {
    if (err.isOfflineQueued) {
      return { data: err.syntheticData, status: 200, _offlineQueued: true };
    }

    if (err.response?.status === 401) {
      localStorage.removeItem('ql_token');
      localStorage.removeItem('ql_user');
      window.location.href = '/login';
    }
    if (err.response?.status === 402) {
      window.location.href = '/subscribe';
    }

    if (!err.response && err.config) {
      const method = (err.config.method || 'get').toUpperCase();
      if (method === 'GET') {
        try {
          const cached = await db.api_cache.get(err.config.url);
          if (cached) return { data: cached.data, status: 200, _fromCache: true };
        } catch { /* IDB not available */ }
      }
    }

    return Promise.reject(err);
  }
);

function buildSyntheticResponse(method, url, payload, tempId) {
  const now = new Date().toISOString();

  if (method === 'POST' && url.includes('/inspections')) {
    return {
      id: tempId, title: payload.title || '(offline inspection)',
      status: 'open', created_at: now, _isLocal: true,
    };
  }

  if (method === 'POST' && url.includes('/ncrs')) {
    return {
      id: tempId, title: payload.title || '(offline NCR)',
      severity: payload.severity || 'minor', status: 'open',
      created_at: now, _isLocal: true,
    };
  }

  if (method === 'POST' && url.includes('/templates')) {
    return {
      id: tempId, name: payload.name || '(offline template)',
      items: payload.items || [], created_at: now, _isLocal: true,
    };
  }

  return { id: tempId, ok: true, _isLocal: true };
}

export default api;
