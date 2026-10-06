/**
 * ATOMX ENGAGE — ADMIN CONTROL CENTER CONTROLLER
 * Screens 12, 13, 14, 15, 16, 17
 */
const db = require('../config/db');

exports.getUsers = (req, res) => {
  const users = db.getAllUsers();
  res.json({ users });
};

exports.toggleUserStatus = (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Valid userId and status (ACTIVE/SUSPENDED) required' });
  }

  db.updateUserStatus(Number(userId), status);
  res.json({ message: `User status updated to ${status}`, userId, status });
};

exports.getAccessRequests = (req, res) => {
  const requests = db.getAccessRequests();
  res.json({ requests });
};

exports.approveRequest = (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  try {
    const result = db.approveAccessRequest(Number(requestId));
    res.json({
      message: 'Access request approved! User created and 100 free credits automatically allocated.',
      userId: result.userId,
      creditsGranted: result.credits
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.adjustCredits = (req, res) => {
  const { userId, amount, action = 'Admin Adjustment', reason = 'Manual credit update' } = req.body;
  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Valid userId and numeric amount required' });
  }

  try {
    const newBalance = db.addCredits(Number(userId), amount, action, 'Admin Control Panel', reason);
    res.json({
      message: 'Credit adjustment successful',
      userId,
      newBalance
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getPlans = (req, res) => {
  const plans = db.getPlans().map(p => ({
    ...p,
    features: JSON.parse(p.features_json)
  }));
  res.json({ plans });
};

exports.getGlobalLedger = (req, res) => {
  const ledger = db.getAllLedger();
  res.json({ ledger });
};

exports.getStats = (req, res) => {
  const users = db.getAllUsers();
  const requests = db.getAccessRequests();
  const ledger = db.getAllLedger();

  res.json({
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'ACTIVE').length,
    suspendedUsers: users.filter(u => u.status === 'SUSPENDED').length,
    pendingRequests: requests.filter(r => r.status === 'PENDING').length,
    totalCreditsCirculating: users.reduce((acc, u) => acc + (u.credits || 0), 0),
    totalAIGenerations: ledger.filter(l => l.action === 'AI Reply').length,
    mrr: '$0'
  });
};

const fs = require('fs');
const path = require('path');
const curatedPath = path.join(__dirname, '../data/curatedLists.json');

exports.getCuratedLists = (req, res) => {
  try {
    if (fs.existsSync(curatedPath)) {
      const data = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));
      return res.json({ lists: data });
    }
    res.json({ lists: {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read curated lists' });
  }
};

exports.saveCuratedLists = (req, res) => {
  try {
    const { lists } = req.body;
    if (!lists || typeof lists !== 'object') {
      return res.status(400).json({ error: 'Valid lists object required' });
    }
    fs.mkdirSync(path.dirname(curatedPath), { recursive: true });
    fs.writeFileSync(curatedPath, JSON.stringify(lists, null, 2), 'utf8');
    res.json({ message: 'Curated lists updated successfully!', lists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save curated lists' });
  }
};

const aiSettingsPath = path.join(__dirname, '../data/aiSettings.json');

exports.getActiveModel = (req, res) => {
  try {
    if (fs.existsSync(aiSettingsPath)) {
      const data = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
      return res.json(data);
    }
    res.json({ activeProvider: 'groq', activeModel: 'llama-3.3-70b-versatile' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read AI settings' });
  }
};

exports.saveActiveModel = (req, res) => {
  try {
    const { provider, model } = req.body;
    if (!provider || !model) {
      return res.status(400).json({ error: 'provider and model are required' });
    }
    const data = {
      activeProvider: provider,
      activeModel: model,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Admin Control Center'
    };
    fs.mkdirSync(path.dirname(aiSettingsPath), { recursive: true });
    fs.writeFileSync(aiSettingsPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ message: `Active AI model set to ${provider.toUpperCase()}: ${model}`, settings: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save active AI model: ' + err.message });
  }
};
