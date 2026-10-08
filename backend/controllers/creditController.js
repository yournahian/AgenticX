/**
 * ATOMX ENGAGE — SERVER-CONTROLLED CREDITS CONTROLLER
 * Single source of truth. Never trust client calculation.
 */
const db = require('../config/db');

exports.getBalance = async (req, res) => {
  try {
    const userQuery = req.query.handle || req.query.email || req.query.userId || req.headers['x-user-handle'] || req.headers['x-user-id'];
    let user = null;

    if (userQuery) {
      const clean = String(userQuery).trim();
      if (clean.includes('@') && clean.includes('.')) {
        user = await db.getUserByEmail(clean.toLowerCase());
      }
      if (!user && db.getUserByHandle) {
        user = await db.getUserByHandle(clean);
      }
      if (!user) {
        user = await db.getUserById(clean);
      }
    }

    if (!user) {
      // Default fallback to first active user if no specific query
      user = await db.getUserById(1);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.id,
      handle: user.handle,
      email: user.email,
      credits: user.credits || 0,
      maxCredits: user.credits || 10000,
      plan: user.plan_tier || 'Free Plan',
      rule: '1 Credit = 1 AI Reply'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deductCredit = async (req, res) => {
  try {
    const { userId, handle, email, amount = 1, action = 'AI Reply', reason = 'Autonomous action' } = req.body;
    let target = null;

    if (userId) target = await db.getUserById(userId);
    if (!target && handle) target = await db.getUserByHandle(handle);
    if (!target && email) target = await db.getUserByEmail(email);

    if (!target) {
      return res.status(404).json({ error: 'User account not found for credit deduction' });
    }

    const numAmount = Math.max(1, parseInt(amount, 10) || 1);
    const newBalance = await db.deductCredit(target.id, numAmount, action, reason);

    res.json({
      success: true,
      userId: target.id,
      handle: target.handle,
      deducted: numAmount,
      balance: newBalance
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const userQuery = req.query.handle || req.query.email || req.query.userId || req.headers['x-user-handle'] || req.headers['x-user-id'];
    let user = null;

    if (userQuery) {
      const clean = String(userQuery).trim();
      if (clean.includes('@') && clean.includes('.')) user = await db.getUserByEmail(clean.toLowerCase());
      if (!user && db.getUserByHandle) user = await db.getUserByHandle(clean);
      if (!user) user = await db.getUserById(clean);
    }

    const targetId = user?.id || req.headers['x-user-id'] || 1;
    const ledger = await db.getLedger(targetId);

    res.json({
      userId: targetId,
      ledger
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
