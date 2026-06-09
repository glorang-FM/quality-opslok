const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, orgName, orgSlug } = req.body;
  if (!name || !email || !password || !orgName || !orgSlug)
    return res.status(400).json({ error: 'All fields required' });

  try {
    // Create org
    const { data: org, error: orgErr } = await supabase
      .from('organizations').insert({ name: orgName, slug: orgSlug }).select().single();
    if (orgErr) return res.status(400).json({ error: orgErr.message });

    // Create default teams
    await supabase.from('teams').insert([
      { org_id: org.id, name: 'Quality', module: 'quality' },
      { org_id: org.id, name: 'Maintenance', module: 'maintenance' },
      { org_id: org.id, name: 'Engineering', module: 'engineering' },
    ]);

    // Create admin user
    const password_hash = await bcrypt.hash(password, 12);
    const { data: user, error: userErr } = await supabase
      .from('users').insert({ org_id: org.id, name, email, password_hash, role: 'admin' })
      .select('id,org_id,name,email,role').single();
    if (userErr) return res.status(400).json({ error: userErr.message });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user, org });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { data: user, error } = await supabase
      .from('users').select('id,org_id,name,email,role,password_hash,active')
      .eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.active) return res.status(401).json({ error: 'Account disabled' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Get user's teams
    const { data: userTeams } = await supabase
      .from('user_teams').select('team_id, teams(id,name,module)')
      .eq('user_id', user.id);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: { ...safeUser, teams: userTeams?.map(ut => ut.teams) || [] } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { data: userTeams } = await supabase
    .from('user_teams').select('team_id, teams(id,name,module)')
    .eq('user_id', req.user.id);
  res.json({ ...req.user, teams: userTeams?.map(ut => ut.teams) || [] });
});

module.exports = router;
