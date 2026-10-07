/**
 * ATOMX ENGAGE — SERVER-CONTROLLED CREDITS CONTROLLER
 * Single source of truth. Never trust client calculation.
 */
const db = require('../config/db');

exports.getBalance = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;
    const user = await db.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.id,
      credits: user.credits || 0,
      maxCredits: user.credits || 10000,
      plan: user.plan_tier || 'Growth Plan',
      rule: '1 Credit = 1 AI Reply'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;
    const ledger = await db.getLedger(userId);

    res.json({
      userId,
      ledger
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
