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
    const provider = req.body.provider || req.body.activeProvider;
    const model = req.body.model || req.body.activeModel;
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

const toneStylesPath = path.join(__dirname, '../data/toneStyles.json');

exports.getToneStyles = (req, res) => {
  try {
    if (fs.existsSync(toneStylesPath)) {
      const data = JSON.parse(fs.readFileSync(toneStylesPath, 'utf8'));
      return res.json(data);
    }
    const defaultData = {
      maxCustomTemplatesPerUser: 2,
      defaultTones: [
        { id: 'natural', name: 'Natural & Concise', description: 'Casual, human-sounding 1-2 sentences with high signal', prompt: 'Write a casual, highly human, 1-2 sentence response. Direct and concise. Avoid robotic hashtags or buzzwords.' },
        { id: 'professional', name: 'Professional', description: 'Authoritative, insightful, industry-savvy perspective', prompt: 'Sound authoritative, sharp, and executive-level. Offer a structured perspective in 1-2 sentences.' },
        { id: 'question', name: 'Engaging Question', description: 'Provocative observation ending with an engaging question', prompt: 'Offer an astute observation on the post and conclude with an insightful, thought-provoking question to invite replies.' },
        { id: 'witty', name: 'Witty', description: 'Clever, witty banter with sharp intelligence', prompt: 'Deliver a clever, witty, and humorous observation. Keep it light, sharp, and entertaining.' }
      ]
    };
    res.json(defaultData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tone styles: ' + err.message });
  }
};

exports.saveToneStyles = (req, res) => {
  try {
    const { maxCustomTemplatesPerUser, defaultTones } = req.body;
    const current = fs.existsSync(toneStylesPath)
      ? JSON.parse(fs.readFileSync(toneStylesPath, 'utf8'))
      : { maxCustomTemplatesPerUser: 2, defaultTones: [] };

    const updated = {
      maxCustomTemplatesPerUser: typeof maxCustomTemplatesPerUser === 'number'
        ? Math.max(1, maxCustomTemplatesPerUser)
        : current.maxCustomTemplatesPerUser || 2,
      defaultTones: Array.isArray(defaultTones) ? defaultTones : current.defaultTones,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Admin Control Center'
    };

    fs.mkdirSync(path.dirname(toneStylesPath), { recursive: true });
    fs.writeFileSync(toneStylesPath, JSON.stringify(updated, null, 2), 'utf8');

    res.json({
      message: 'Tone and Style settings updated successfully!',
      settings: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save tone styles: ' + err.message });
  }
};

const multiProviderService = require('../services/multiProviderService');

// Live AI API Telemetry Logs for Admin Dashboard
exports.getApiLogs = (req, res) => {
  try {
    const logs = multiProviderService.getApiLogs();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve API telemetry logs: ' + err.message });
  }
};

// Test All Configured Provider API Keys
exports.testProviderKeys = async (req, res) => {
  try {
    const keysStatus = await multiProviderService.testAllProviderKeys();
    res.json({ keysStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to test API keys: ' + err.message });
  }
};

function updateEnvFile(keyName, keyValue) {
  try {
    const envPath = path.join(__dirname, '../.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    const regex = new RegExp(`^${keyName}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${keyName}=${keyValue}`);
    } else {
      content = (content.trim() ? content.trim() + '\n' : '') + `${keyName}=${keyValue}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    console.warn('Could not update .env file:', err.message);
  }
}

function readEnvValue(keyName) {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const regex = new RegExp(`^${keyName}=([^\\r\\n]+)`, 'm');
      const match = content.match(regex);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}
  return '';
}

// Get API Keys configuration status and masked keys for Admin Control Center
exports.getApiKeys = (req, res) => {
  try {
    let savedKeys = {};
    if (fs.existsSync(aiSettingsPath)) {
      const data = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
      savedKeys = data.apiKeys || {};
    }

    const providers = ['groq', 'openrouter', 'openai', 'gemini'];
    const envVarMap = {
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };

    const result = {};
    for (const p of providers) {
      const rawKey = (savedKeys[p] || process.env[envVarMap[p]] || readEnvValue(envVarMap[p]) || '').trim();
      const hasKey = rawKey.length > 5;
      let masked = '';
      if (hasKey) {
        masked = rawKey.length > 8 ? rawKey.slice(0, 4) + '••••••••' + rawKey.slice(-4) : '••••••••';
      }
      result[p] = {
        hasKey,
        maskedKey: masked
      };
    }

    res.json({ keys: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve API keys: ' + err.message });
  }
};

// Save and activate API Key from Admin Control Center (Syncs to aiSettings.json, process.env, and .env)
exports.saveApiKey = (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'provider and apiKey are required' });
    }

    const prov = provider.toLowerCase().trim();
    const envVarMap = {
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };

    const envName = envVarMap[prov];
    if (!envName) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    const cleanKey = apiKey.trim();

    // 1. Update in aiSettings.json
    let data = {};
    if (fs.existsSync(aiSettingsPath)) {
      data = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
    }
    if (!data.apiKeys) data.apiKeys = {};
    data.apiKeys[prov] = cleanKey;
    data.lastUpdated = new Date().toISOString();
    fs.mkdirSync(path.dirname(aiSettingsPath), { recursive: true });
    fs.writeFileSync(aiSettingsPath, JSON.stringify(data, null, 2), 'utf8');

    // 2. Update in runtime process.env
    process.env[envName] = cleanKey;

    // 3. Sync to backend/.env
    updateEnvFile(envName, cleanKey);

    const masked = cleanKey.length > 8 ? cleanKey.slice(0, 4) + '••••••••' + cleanKey.slice(-4) : '••••••••';
    res.json({
      message: `✓ ${provider.toUpperCase()} API key saved successfully and activated immediately!`,
      provider: prov,
      maskedKey: masked,
      hasKey: cleanKey.length > 5
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save API key: ' + err.message });
  }
};
