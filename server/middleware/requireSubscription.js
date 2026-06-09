const { db } = require('../db-adapter');

async function requireSubscription(req, res, next) {
  if (process.env.BILLING_ENFORCED !== 'true') return next();

  try {
    const org = await db.one(
      'SELECT sub_status, trial_ends_at, plan, paid_through FROM organizations WHERE id = $1',
      [req.user.orgId]
    );

    if (!org) return res.status(401).json({ error: 'Organization not found' });

    if (org.paid_through && new Date(org.paid_through) > new Date()) return next();
    if (org.sub_status === 'active') return next();
    if (org.sub_status === 'trialing' && org.trial_ends_at) {
      if (new Date(org.trial_ends_at) > new Date()) return next();
    }
    if (org.sub_status === 'past_due') {
      res.setHeader('X-Subscription-Warning', 'past_due');
      return next();
    }

    return res.status(402).json({
      error: 'subscription_required',
      sub_status: org.sub_status || 'none',
      plan: org.plan,
      trial_ends_at: org.trial_ends_at,
      message: 'Your subscription is inactive.',
    });
  } catch (err) {
    console.error('requireSubscription error:', err);
    return next();
  }
}

module.exports = { requireSubscription };
