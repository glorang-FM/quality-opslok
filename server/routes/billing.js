const express = require('express');
const { db } = require('../db-adapter');

const router = express.Router();

// Stripe webhook — must be registered before express.json() in index.js.
// Register raw body parser for the webhook endpoint only.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // TODO: wire up Stripe webhook verification when billing is activated
  res.json({ received: true });
});

// GET /api/billing/status — returns subscription state for the requesting org
router.get('/status', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.json({ billing_enforced: false });

  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'quality-opslok-secret-change-in-production';
    const user = jwt.verify(auth.slice(7), JWT_SECRET);

    const org = await db.one(
      'SELECT sub_status, trial_ends_at, plan, paid_through FROM organizations WHERE id = $1',
      [user.orgId]
    );

    const billingEnforced = process.env.BILLING_ENFORCED === 'true';
    const trialActive = org?.trial_ends_at && new Date(org.trial_ends_at) > new Date();
    const trialDaysLeft = trialActive
      ? Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      billing_enforced: billingEnforced,
      sub_status: org?.sub_status || 'none',
      plan: org?.plan || 'trial',
      trial_active: trialActive,
      trial_days_left: trialDaysLeft,
      paid_through: org?.paid_through || null,
    });
  } catch {
    res.json({ billing_enforced: false });
  }
});

async function startTrial(orgId) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  await db.run(
    `UPDATE organizations SET sub_status = 'trialing', trial_ends_at = $1 WHERE id = $2`,
    [trialEnd.toISOString(), orgId]
  );
}

module.exports = router;
module.exports.startTrial = startTrial;
