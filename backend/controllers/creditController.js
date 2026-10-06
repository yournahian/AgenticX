/**
 * ATOMX ENGAGE — SERVER-CONTROLLED CREDITS CONTROLLER
 * Single source of truth. Never trust client calculation.
 */
const db = require('../config/db');

exports.getBalance = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const user = db.getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    userId: user.id,
    credits: user.credits,
    maxCredits: user.max_credits,
    plan: user.plan_tier,
    rule: '1 Credit = 1 AI Reply'
  });
};

exports.getLedger = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const ledger = db.getLedger(userId);

  res.json({
    userId,
    ledger
  });
};
