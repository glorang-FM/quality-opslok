import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import useOnlineStatus from '../hooks/useOnlineStatus';
import OfflineBanner from './OfflineBanner';
import { processQueue, clearCompleted } from '../db/syncQueue';

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.newPassword !== form.confirmPassword) { setError('New passwords do not match'); return; }
    if (form.newPassword.length < 6) { setError('New password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await api.put('/api/auth/me/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess('Password updated successfully!');
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 360, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Change password</h3>
        <form onSubmit={handleSubmit}>
          {['currentPassword', 'newPassword', 'confirmPassword'].map((field, i) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#5a5a57', display: 'block', marginBottom: 4 }}>
                {field === 'currentPassword' ? 'Current password' : field === 'newPassword' ? 'New password' : 'Confirm new password'}
              </label>
              <input
                type="password"
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                required
                autoFocus={i === 0}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          ))}
          {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          {success && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{success}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-sm" style={{ background: '#185FA5', color: '#fff' }}>
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const navItems = [
  { to: '/dashboard',   label: 'Dashboard',   icon: '▦' },
  { to: '/inspections', label: 'Inspections',  icon: '◫' },
  { to: '/templates',   label: 'Templates',    icon: '⊞' },
  { to: '/ncrs',        label: 'NCRs',         icon: '◎' },
  { to: '/team',        label: 'Team',         icon: '◉' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();

  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem('ql_pwa_dismissed') === '1'
  );
  const wasOfflineRef = useRef(!navigator.onLine);

  const isMobile = () => window.innerWidth < 768;
  const [collapsed, setCollapsed] = useState(isMobile);
  const [mobile, setMobile] = useState(isMobile);

  useEffect(() => {
    const onResize = () => {
      const m = isMobile();
      setMobile(m);
      if (m) setCollapsed(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (mobile) setCollapsed(true);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      setSyncing(true);
      processQueue()
        .then(result => { setLastSync(result); clearCompleted(); })
        .catch(console.error)
        .finally(() => setSyncing(false));
    }
    wasOfflineRef.current = !isOnline;
  }, [isOnline]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const sidebarWidth = collapsed ? (mobile ? 0 : 56) : 210;

  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>

      {mobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40, backdropFilter: 'blur(2px)' }}
        />
      )}

      <aside style={{
        width: sidebarWidth, minWidth: sidebarWidth,
        background: '#fff', borderRight: '0.5px solid rgba(0,0,0,0.10)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        position: mobile ? 'fixed' : 'relative',
        top: 0, left: 0, bottom: 0, zIndex: 50,
        boxShadow: mobile && !collapsed ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
      }}>
        {/* Header */}
        <div style={{
          padding: collapsed ? '16px 0' : '20px 16px 16px',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8, minHeight: 60,
        }}>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#185FA5', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                <strong>Quality</strong> OpsLok
              </div>
              <div style={{ fontSize: 11, color: '#8a8a86', marginTop: 2 }}>Built for quality teams.</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8a86', fontSize: 18, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, lineHeight: 1, flexShrink: 0 }}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? '☰' : '✕'}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 6px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 10,
              padding: collapsed ? '10px 0' : '8px 10px',
              borderRadius: 8, marginBottom: 2,
              fontSize: 13, fontWeight: isActive ? 500 : 400,
              color: isActive ? '#185FA5' : '#5a5a57',
              background: isActive ? '#E6F1FB' : 'transparent',
              borderLeft: isActive ? '2px solid #185FA5' : '2px solid transparent',
              textDecoration: 'none', transition: 'all 0.1s',
              overflow: 'hidden', whiteSpace: 'nowrap',
            })}>
              <span style={{ fontSize: 17, flexShrink: 0 }} title={collapsed ? item.label : ''}>{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          ))}

          {/* Super-admin link */}
          {user?.email?.toLowerCase() === 'glorang@overtureairquality.com' && (
            <>
              {!collapsed && (
                <div style={{ fontSize: 10, fontWeight: 600, color: '#b0afad', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 10px 4px', whiteSpace: 'nowrap' }}>
                  Admin
                </div>
              )}
              <NavLink to="/admin" style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10, padding: collapsed ? '10px 0' : '8px 10px',
                borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: isActive ? 500 : 400,
                color: isActive ? '#b45309' : '#92400e',
                background: isActive ? '#fef3c7' : 'transparent',
                borderLeft: isActive ? '2px solid #d97706' : '2px solid transparent',
                textDecoration: 'none', transition: 'all 0.1s', overflow: 'hidden', whiteSpace: 'nowrap',
              })}>
                <span style={{ fontSize: 17, flexShrink: 0 }} title={collapsed ? 'Admin' : ''}>👑</span>
                {!collapsed && 'Admin portal'}
              </NavLink>
            </>
          )}
        </nav>

        {/* PWA install */}
        {installPrompt && !installDismissed && (
          <div style={{ margin: '0 6px 6px', background: '#E6F1FB', borderRadius: 8, padding: collapsed ? '8px 4px' : '10px 10px', display: 'flex', flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', gap: 6 }}>
            {collapsed ? (
              <button onClick={handleInstall} title="Install Quality OpsLok" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>⊕</button>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#185FA5' }}>Install app</div>
                  <div style={{ fontSize: 10, color: '#5a8a9a' }}>Works offline</div>
                </div>
                <button onClick={handleInstall} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Install</button>
                <button onClick={() => { setInstallDismissed(true); localStorage.setItem('ql_pwa_dismissed', '1'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
              </>
            )}
          </div>
        )}

        {/* User / logout */}
        <div style={{ padding: collapsed ? '10px 6px' : '12px 12px 16px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          {collapsed ? (
            <button onClick={handleLogout} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8a86', fontSize: 17, width: '100%', display: 'flex', justifyContent: 'center', padding: '6px 0' }}>⏻</button>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#5a5a57', marginBottom: 6, overflow: 'hidden' }}>
                <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{user?.name}</strong>
                <span style={{ fontSize: 11, background: '#EAF3DE', color: '#27500A', padding: '1px 6px', borderRadius: 10 }}>{user?.role}</span>
              </div>
              <button onClick={() => setShowChangePw(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#8a8a86', padding: '2px 0', marginBottom: 6, textAlign: 'left', width: '100%' }}>
                Change password
              </button>
              <button onClick={handleLogout} className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }}>Sign out</button>
            </>
          )}
        </div>
      </aside>

      {mobile && collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 60, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, width: 40, height: 40, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
          title="Open menu"
        >
          ☰
        </button>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <main style={{ flex: 1, overflow: 'auto', minWidth: 0, padding: mobile ? '1rem' : '1.75rem 2rem', paddingTop: mobile ? '60px' : '1.75rem' }}>
          <Outlet />
        </main>
      </div>

      <OfflineBanner syncing={syncing} lastSync={lastSync} />
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
