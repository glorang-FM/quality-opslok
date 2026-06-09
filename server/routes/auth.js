const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db-adapter');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'quality-opslok-secret-change-in-production';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db.one(
      `SELECT u.*, o.slug as org_slug
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE u.email = $1`,
      [email]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role, orgId: user.org_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgSlug: user.org_slug,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, name, email, role FROM users WHERE org_id = $1 ORDER BY name',
      [req.user.orgId]
    );
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users
router.post('/users', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });

    const org = await db.one('SELECT allowed_domain FROM organizations WHERE id = $1', [req.user.orgId]);
    if (org && org.allowed_domain) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (emailDomain !== org.allowed_domain.toLowerCase()) {
        return res.status(400).json({
          error: `Team members must use a @${org.allowed_domain} email address.`,
        });
      }
    }

    const existing = await db.one(
      'SELECT id FROM users WHERE org_id = $1 AND email = $2',
      [req.user.orgId, email]
    );
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 10);
    const newUser = await db.one(
      `INSERT INTO users (org_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role`,
      [req.user.orgId, name, email, hash, role || 'inspector']
    );
    res.status(201).json(newUser);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/users/:id
router.put('/users/:id', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    if (role && !['inspector', 'manager'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const org = await db.one('SELECT allowed_domain FROM organizations WHERE id = $1', [req.user.orgId]);
    if (org && org.allowed_domain) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (emailDomain !== org.allowed_domain.toLowerCase()) {
        return res.status(400).json({ error: `Team members must use a @${org.allowed_domain} email address.` });
      }
    }

    const existing = await db.one(
      'SELECT id FROM users WHERE org_id = $1 AND email = $2 AND id != $3',
      [req.user.orgId, email, req.params.id]
    );
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const updated = await db.one(
      `UPDATE users SET name = $1, email = $2, role = $3
       WHERE id = $4 AND org_id = $5
       RETURNING id, name, email, role`,
      [name, email, role || 'inspector', req.params.id, req.user.orgId]
    );
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot remove yourself' });
    }
    const user = await db.one(
      'SELECT id FROM users WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    await db.run('DELETE FROM users WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register-org
router.post('/register-org', async (req, res) => {
  try {
    const { orgName, name, email, password } = req.body;
    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ error: 'orgName, name, email, and password are required' });
    }

    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existingOrg = await db.one('SELECT id FROM organizations WHERE slug = $1', [slug]);
    if (existingOrg) return res.status(409).json({ error: 'Organization slug already exists' });

    const existingEmail = await db.one('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail) return res.status(409).json({ error: 'Email already in use' });

    const adminDomain = email.split('@')[1]?.toLowerCase() || null;

    const org = await db.one(
      `INSERT INTO organizations (name, slug, allowed_domain) VALUES ($1, $2, $3) RETURNING *`,
      [orgName, slug, adminDomain]
    );

    try {
      const { startTrial } = require('./billing');
      await startTrial(org.id);
    } catch (e) {
      console.warn('[auth] startTrial failed (non-fatal):', e.message);
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.one(
      `INSERT INTO users (org_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'manager')
       RETURNING id, name, email, role, org_id`,
      [org.id, name, email, hash]
    );

    const token = jwt.sign(
      { id: user.id, role: user.role, orgId: user.org_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.org_id,
        orgSlug: slug,
      },
      org: { id: org.id, name: org.name, slug: org.slug },
    });
  } catch (err) {
    console.error('Register org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/me/password
router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/org
router.get('/org', requireAuth, async (req, res) => {
  try {
    const org = await db.one(
      'SELECT id, name, slug, allowed_domain FROM organizations WHERE id = $1',
      [req.user.orgId]
    );
    res.json(org);
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/org/domain
router.put('/org/domain', requireAuth, async (req, res) => {
  const ownerSecret = process.env.OWNER_SECRET;
  if (ownerSecret && req.headers['x-owner-secret'] !== ownerSecret) {
    return res.status(403).json({ error: 'Not authorized. Domain changes require app owner approval.' });
  }
  if (!ownerSecret && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    let { allowed_domain } = req.body;
    if (!allowed_domain || !allowed_domain.trim()) {
      allowed_domain = null;
    } else {
      allowed_domain = allowed_domain.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(allowed_domain)) {
        return res.status(400).json({ error: 'Invalid domain format.' });
      }
    }
    await db.run(
      'UPDATE organizations SET allowed_domain = $1 WHERE id = $2',
      [allowed_domain, req.user.orgId]
    );
    res.json({
      allowed_domain,
      message: allowed_domain
        ? `Team members must now use @${allowed_domain} email addresses.`
        : 'Domain restriction removed.',
    });
  } catch (err) {
    console.error('Update domain error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
