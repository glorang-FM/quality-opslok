import React, { useState, useEffect } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { getPendingCount } from '../db/syncQueue';

export default function OfflineBanner({ syncing, lastSync }) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [showSyncToast, setShowSyncToast] = useState(false);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
    if (!isOnline) {
      const t = setInterval(() => getPendingCount().then(setPendingCount), 5000);
      return () => clearInterval(t);
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline && lastSync?.synced > 0) {
      setShowSyncToast(true);
      const t = setTimeout(() => setShowSyncToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isOnline, lastSync]);

  if (isOnline && !syncing && !showSyncToast) return null;

  if (syncing) {
    return (
      <div style={styles.banner('#185FA5')}>
        <span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
        <span>Syncing offline changes…</span>
      </div>
    );
  }

  if (showSyncToast && lastSync) {
    const msg = lastSync.failed > 0
      ? `Synced ${lastSync.synced} change${lastSync.synced !== 1 ? 's' : ''} · ${lastSync.failed} failed`
      : `${lastSync.synced} offline change${lastSync.synced !== 1 ? 's' : ''} synced ✓`;
    return (
      <div style={styles.banner(lastSync.failed > 0 ? '#d97706' : '#15803d')}>
        <span>{msg}</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div style={styles.banner('#5a5a57')}>
        <span>Offline</span>
        {pendingCount > 0 && (
          <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.85 }}>
            · {pendingCount} change{pendingCount !== 1 ? 's' : ''} queued
          </span>
        )}
      </div>
    );
  }

  return null;
}

const styles = {
  banner: (bg) => ({
    position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    background: bg, color: '#fff', padding: '9px 20px', borderRadius: 8,
    fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center',
    gap: 8, zIndex: 9999, boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    whiteSpace: 'nowrap', maxWidth: '90vw',
  }),
};
