// Force IPv4 DNS resolution — prevents ENETUNREACH on hosts that advertise IPv6
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5174',
  credentials: true,
}));

// ── Billing webhook MUST be registered before express.json() ─────────────────
app.use('/api/billing', require('./routes/billing'));

app.use(express.json());

const { requireSubscription } = require('./middleware/requireSubscription');

async function start() {
  const { initSchema } = require('./database');
  await initSchema();

  app.use('/api/auth',               require('./routes/auth'));
  app.use('/api/dashboard',          requireSubscription, require('./routes/dashboard'));
  app.use('/api/templates',          requireSubscription, require('./routes/templates'));
  app.use('/api/inspections',        requireSubscription, require('./routes/inspections'));
  app.use('/api/ncrs',               requireSubscription, require('./routes/ncrs'));
  app.use('/api/push',               require('./routes/push'));
  app.use('/api/superadmin',         require('./routes/superadmin'));

  // ── Quality management routes ─────────────────────────────────────────────
  app.use('/api/parts',              requireSubscription, require('./routes/parts'));
  app.use('/api/suppliers',          requireSubscription, require('./routes/suppliers'));
  app.use('/api/gauges',             requireSubscription, require('./routes/gauges'));
  app.use('/api/control-plans',      requireSubscription, require('./routes/control-plans'));
  app.use('/api/documents',          requireSubscription, require('./routes/documents'));
  app.use('/api/inspection-orders',  requireSubscription, require('./routes/inspection-orders'));
  app.use('/api/capas',              requireSubscription, require('./routes/capas'));
  app.use('/api/analytics',          requireSubscription, require('./routes/analytics'));
  app.use('/api/quality-tools',      requireSubscription, require('./routes/quality-tools'));

  if (process.env.NODE_ENV === 'production') {
    const clientBuild = path.join(__dirname, '../client/dist');
    app.use(express.static(clientBuild));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Quality OpsLok server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
