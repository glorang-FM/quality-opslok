import Dexie from 'dexie';

const db = new Dexie('QualityOpsLokOffline');

db.version(1).stores({
  api_cache:  'url, timestamp',
  sync_queue: '++id, status, createdAt',
});

export default db;
