/**
 * ATOMX ENGAGE — ADMIN CONTROL CENTER CONTROLLER (SUPABASE PERSISTENT)
 * Screens 12, 13, 14, 15, 16, 17
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../config/db');
const supabase = require('../config/supabase');

exports.getUsers = async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Valid userId and status (ACTIVE/SUSPENDED) required' });
  }

  try {
    await db.updateUserStatus(userId, status);
    res.json({ message: `User status updated to ${status}`, userId, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAccessRequests = async (req, res) => {
  try {
    const requests = await db.getAccessRequests();
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveRequest = async (req, res) => {
  const { requestId, initialCredits, planTier } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  try {
    const credits = Number(initialCredits) || 100;
    const plan = planTier || 'Free Plan';
    const result = await db.approveAccessRequest(requestId, credits, plan);

    if (plan && !plan.toLowerCase().includes('free')) {
      try {
        await db.recordTransaction({
          user: result.handle || 'Customer',
          handle: result.handle,
          email: req.body.email || '',
          type: 'Plan Purchase',
          item: plan,
          credits: result.credits,
          amount: plan.includes('Growth') ? '$12.00' : plan.includes('Pro') ? '$29.00' : '$99.00',
          method: 'Stripe Card'
        });
      } catch (e) {}
    }

    res.json({
      success: true,
      message: `Access request approved! User created/activated with ${plan} and ${result.credits} credits allocated.`,
      userId: result.userId,
      creditsGranted: result.credits,
      handle: result.handle,
      plan: result.plan
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.rejectRequest = async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  try {
    await db.rejectAccessRequest(requestId);
    res.json({
      success: true,
      message: 'Access request successfully rejected.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


exports.adjustCredits = async (req, res) => {
  const { userId, email, handle, amount, action = 'Admin Adjustment', reason = 'Manual credit update' } = req.body;
  const targetId = userId || email || handle;
  if (!targetId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Valid userId, email or handle and numeric amount required' });
  }

  try {
    const newBalance = await db.addCredits(targetId, amount, action, 'Admin Control Panel', reason);
    res.json({
      message: 'Credit adjustment successful',
      userId: targetId,
      newBalance
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.setUserPassword = async (req, res) => {
  const { userId, email, handle, password } = req.body;
  const targetId = userId || email || handle;
  if (!targetId || !password || String(password).length < 4) {
    return res.status(400).json({ error: 'Valid user identifier and password (minimum 4 characters) required' });
  }

  try {
    const updated = await db.updateUserPassword(targetId, String(password).trim());
    res.json({
      message: 'Password successfully updated for user',
      user: { id: updated.id, email: updated.email, handle: updated.handle }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateUserPlan = async (req, res) => {
  const { userId, email, handle, plan } = req.body;
  const targetId = userId || email || handle;
  if (!targetId || !plan) {
    return res.status(400).json({ error: 'Valid user identifier and plan required' });
  }
  try {
    const updated = await db.updateUserPlan(targetId, plan);

    if (plan && !plan.toLowerCase().includes('free')) {
      try {
        await db.recordTransaction({
          user: updated.full_name || updated.name || 'Customer',
          handle: updated.handle,
          email: updated.email,
          type: 'Plan Upgrade',
          item: plan,
          credits: updated.credits,
          amount: plan.includes('Growth') ? '$12.00' : plan.includes('Pro') ? '$29.00' : '$99.00',
          method: 'Stripe Card'
        });
      } catch (e) {}
    }

    res.json({
      success: true,
      message: `Plan successfully updated to "${plan}" for user`,
      user: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { userId, email, handle } = req.body;
  const targetId = userId || email || handle;
  if (!targetId) {
    return res.status(400).json({ error: 'Valid user identifier required to delete' });
  }
  try {
    const result = await db.deleteUser(targetId);
    res.json({
      success: true,
      message: 'User account and associated data permanently deleted from database.',
      result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getPasswordRequests = async (req, res) => {
  try {
    const ledger = await db.getAllLedger();
    const requests = (ledger || []).filter(l => l.action === 'Forgot Password').map(l => {
      const handleMatch = (l.reason || '').match(/for\s+(@?[\w_]+)/i);
      const tgMatch = (l.reason || '').match(/TG:\s*(@?[\w_]+)/i);
      const emailMatch = (l.reason || '').match(/Email:\s*([^\s|]+)/i);
      const handle = l.user_handle || (l.users && l.users.handle) || (handleMatch ? handleMatch[1] : (l.user_name || 'User'));
      const formattedHandle = handle.startsWith('@') ? handle : `@${handle}`;
      return {
        ...l,
        user: formattedHandle,
        handle: formattedHandle,
        email: (l.users && l.users.email) || l.user_email || (emailMatch ? emailMatch[1] : ''),
        telegram: tgMatch ? tgMatch[1] : ''
      };
    });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resolvePasswordRequest = async (req, res) => {
  try {
    const { userId, handle } = req.body;
    await db.resolvePasswordReset(userId || handle);
    res.json({ success: true, message: 'Password reset request marked as resolved.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await db.getTransactions();
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const tx = await db.recordTransaction(req.body);
    res.json({ success: true, transaction: tx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const plansPath = path.join(__dirname, '../data/plans.json');
const tmpPlansPath = path.join('/tmp', 'plans.json');
let inMemoryPlans = null;
let inMemoryFoundingOffer = null;

exports.getPlans = async (req, res) => {
  try {
    if (inMemoryPlans) {
      return res.json({ plans: inMemoryPlans, foundingOffer: inMemoryFoundingOffer });
    }
    // Try Supabase first
    if (supabase) {
      try {
        const { data, error } = await supabase.from('plans').select('features').eq('id', 'system_admin_plans').maybeSingle();
        if (!error && data && data.features) {
          const loadedPlans = Array.isArray(data.features.plans) ? data.features.plans : (Array.isArray(data.features) ? data.features : null);
          const loadedOffer = data.features.foundingOffer || null;
          if (loadedPlans) {
            inMemoryPlans = loadedPlans;
            inMemoryFoundingOffer = loadedOffer;
            return res.json({ plans: loadedPlans, foundingOffer: loadedOffer });
          }
        }
      } catch (e) {}
    }
    if (fs.existsSync(tmpPlansPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(tmpPlansPath, 'utf8'));
        const data = Array.isArray(raw) ? raw : (raw.plans || []);
        inMemoryPlans = data;
        inMemoryFoundingOffer = raw.foundingOffer || null;
        return res.json({ plans: data, foundingOffer: inMemoryFoundingOffer });
      } catch (e) {}
    }
    if (fs.existsSync(plansPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(plansPath, 'utf8'));
        const data = Array.isArray(raw) ? raw : (raw.plans || []);
        inMemoryPlans = data;
        inMemoryFoundingOffer = raw.foundingOffer || null;
        return res.json({ plans: data, foundingOffer: inMemoryFoundingOffer });
      } catch (e) {}
    }
    // Fallback to db or default plans
    const defaultPlans = [
      { id: 'free', name: 'FREE', credits: 100, price: 0, popular: false, offerBadge: '', features: ['100 AI replies', 'Basic reply styles', 'Reply queue', 'Basic history'] },
      { id: 'growth', name: 'GROWTH', credits: 10000, price: 12, popular: true, offerBadge: 'MOST POPULAR', features: ['10,000 AI replies', 'All reply styles', 'Advanced queue', 'Full history', 'Priority generation'] },
      { id: 'pro', name: 'PRO', credits: 25000, price: 29, popular: false, offerBadge: 'BEST VALUE', features: ['25,000 AI replies', 'Premium AI models', 'Advanced agents', 'Priority generation', 'Advanced analytics'] }
    ];
    inMemoryPlans = defaultPlans;
    res.json({ plans: defaultPlans, foundingOffer: inMemoryFoundingOffer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.savePlans = async (req, res) => {
  try {
    const { plans, foundingOffer } = req.body;
    if (!Array.isArray(plans)) {
      return res.status(400).json({ error: 'Plans array is required' });
    }
    inMemoryPlans = plans;
    if (foundingOffer) inMemoryFoundingOffer = foundingOffer;

    const payload = { plans, foundingOffer: inMemoryFoundingOffer };

    // 1. Supabase persistence
    if (supabase) {
      try {
        await supabase.from('plans').upsert({
          id: 'system_admin_plans',
          name: 'System Admin Plans Config',
          features: payload
        });
      } catch (dbErr) {
        console.warn('Could not upsert plans in Supabase:', dbErr.message);
      }
    }

    // 2. File fallback
    try {
      fs.mkdirSync(path.dirname(plansPath), { recursive: true });
      fs.writeFileSync(plansPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (fsErr) {
      try {
        fs.writeFileSync(tmpPlansPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch (tmpErr) {}
    }
    res.json({ message: 'Plans and pricing offers updated successfully!', plans, foundingOffer: inMemoryFoundingOffer });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save plans: ' + err.message });
  }
};

exports.getGlobalLedger = async (req, res) => {
  try {
    const ledger = await db.getAllLedger();
    res.json({ ledger });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const requests = await db.getAccessRequests();
    const ledger = await db.getAllLedger();
    const transactions = await db.getTransactions();

    // Calculate real MRR from active paid user plan tiers
    const mrrTotal = users.filter(u => u.status === 'ACTIVE' && u.plan_tier && !u.plan_tier.toLowerCase().includes('free')).reduce((sum, u) => {
      const tier = (u.plan_tier || '').toLowerCase();
      if (tier.includes('enterprise')) return sum + 99;
      if (tier.includes('pro')) return sum + 29;
      if (tier.includes('growth')) return sum + 12;
      return sum + 12;
    }, 0);

    const totalRevenue = transactions.reduce((sum, t) => {
      const val = parseFloat(String(t.amount || '$0').replace(/[^0-9.]/g, '')) || 0;
      return sum + val;
    }, 0);

    res.json({
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'ACTIVE').length,
      suspendedUsers: users.filter(u => u.status === 'SUSPENDED').length,
      pendingRequests: requests.filter(r => r.status === 'PENDING').length,
      totalCreditsCirculating: users.reduce((acc, u) => acc + (u.credits || 0), 0),
      totalAIGenerations: ledger.filter(l => (l.action || '').toLowerCase().includes('reply')).length,
      mrr: `$${mrrTotal}`,
      revenue: `$${totalRevenue.toFixed(0)}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const curatedPath = path.join(__dirname, '../data/curatedLists.json');
let inMemoryCuratedLists = null;

exports.getCuratedLists = async (req, res) => {
  try {
    // 1. Return in-memory cache if available
    if (inMemoryCuratedLists && Object.keys(inMemoryCuratedLists).length > 0) {
      return res.json({ lists: inMemoryCuratedLists });
    }

    // 2. Fetch from Supabase cloud database
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('features')
          .eq('id', 'system_curated_lists')
          .maybeSingle();

        if (!error && data && data.features && typeof data.features === 'object' && Object.keys(data.features).length > 0) {
          inMemoryCuratedLists = data.features;
          return res.json({ lists: inMemoryCuratedLists });
        }
      } catch (dbErr) {
        console.warn('⚠️ [Admin] Supabase getCuratedLists read warning:', dbErr.message);
      }
    }

    // 3. Fallback to local JSON file
    if (fs.existsSync(curatedPath)) {
      const data = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));
      inMemoryCuratedLists = data;
      return res.json({ lists: data });
    }

    res.json({ lists: {} });
  } catch (err) {
    console.error('Failed to read curated lists:', err);
    res.status(500).json({ error: 'Failed to read curated lists' });
  }
};

exports.saveCuratedLists = async (req, res) => {
  try {
    const { lists } = req.body;
    if (!lists || typeof lists !== 'object') {
      return res.status(400).json({ error: 'Valid lists object required' });
    }

    // Always update in-memory immediately
    inMemoryCuratedLists = lists;

    // 1. Persist to Supabase cloud database (survives Vercel restarts & serverless limits)
    let persistedToCloud = false;
    if (supabase) {
      try {
        const { error: upsertErr } = await supabase
          .from('plans')
          .upsert({
            id: 'system_curated_lists',
            name: 'Curated Lists Storage',
            price_monthly: 0,
            credits_monthly: 0,
            is_popular: false,
            is_active: false,
            features: lists
          }, { onConflict: 'id' });

        if (upsertErr) {
          console.warn('⚠️ [Admin] Supabase saveCuratedLists warning:', upsertErr.message);
        } else {
          persistedToCloud = true;
          console.log('✓ [Admin] Curated lists persisted to Supabase cloud successfully');
        }
      } catch (dbErr) {
        console.warn('⚠️ [Admin] Supabase saveCuratedLists exception:', dbErr.message);
      }
    }

    // 2. Local file write (best-effort, wrapped in try/catch to avoid EROFS read-only filesystem crash on Vercel)
    try {
      fs.mkdirSync(path.dirname(curatedPath), { recursive: true });
      fs.writeFileSync(curatedPath, JSON.stringify(lists, null, 2), 'utf8');
    } catch (fsErr) {
      // Vercel serverless /var/task is read-only; try /tmp if possible
      try {
        const tmpPath = path.join('/tmp', 'curatedLists.json');
        fs.writeFileSync(tmpPath, JSON.stringify(lists, null, 2), 'utf8');
      } catch (tmpErr) {
        // Safe to ignore on serverless environments
      }
    }

    return res.json({
      message: 'Curated lists updated successfully!',
      persistedToCloud,
      lists
    });
  } catch (err) {
    console.error('Failed to save curated lists:', err);
    res.status(500).json({ error: 'Failed to save curated lists: ' + err.message });
  }
};

const aiSettingsPath = path.join(__dirname, '../data/aiSettings.json');
const tmpAiSettingsPath = path.join(os.tmpdir(), 'aiSettings.json');
let inMemoryAiSettings = null;

async function getAiSettingsData() {
  if (inMemoryAiSettings && (inMemoryAiSettings.activeProvider || inMemoryAiSettings.apiKeys)) {
    return inMemoryAiSettings;
  }

  // 1. Try Supabase cloud database (persistent across all serverless lambda instances)
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('features')
        .eq('id', 'system_ai_settings')
        .maybeSingle();

      if (!error && data && data.features && typeof data.features === 'object') {
        inMemoryAiSettings = data.features;
        try {
          fs.writeFileSync(tmpAiSettingsPath, JSON.stringify(inMemoryAiSettings, null, 2), 'utf8');
        } catch (e) {}
        return inMemoryAiSettings;
      }
    } catch (e) {
      console.warn('Could not read aiSettings from Supabase:', e.message);
    }
  }

  // 2. Try /tmp/aiSettings.json
  try {
    if (fs.existsSync(tmpAiSettingsPath)) {
      inMemoryAiSettings = JSON.parse(fs.readFileSync(tmpAiSettingsPath, 'utf8'));
      return inMemoryAiSettings;
    }
  } catch (e) {}

  // 3. Try local file
  try {
    if (fs.existsSync(aiSettingsPath)) {
      inMemoryAiSettings = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
      return inMemoryAiSettings;
    }
  } catch (e) {}

  return {};
}

async function saveAiSettingsData(settingsData) {
  inMemoryAiSettings = settingsData;

  // 1. Save to Supabase cloud (persistent across all serverless lambda instances!)
  if (supabase) {
    try {
      await supabase.from('plans').upsert({
        id: 'system_ai_settings',
        name: 'System AI Settings',
        price_monthly: 0,
        credits_monthly: 0,
        is_popular: false,
        is_active: false,
        features: settingsData
      });
    } catch (e) {
      console.warn('Could not persist aiSettings to Supabase:', e.message);
    }
  }

  // 2. Safe write to /tmp/aiSettings.json (always writable on Vercel)
  try {
    fs.writeFileSync(tmpAiSettingsPath, JSON.stringify(settingsData, null, 2), 'utf8');
  } catch (e) {}

  // 3. Safe write to local file (if not read-only)
  try {
    fs.mkdirSync(path.dirname(aiSettingsPath), { recursive: true });
    fs.writeFileSync(aiSettingsPath, JSON.stringify(settingsData, null, 2), 'utf8');
  } catch (e) {
    // Gracefully ignore EROFS on read-only serverless filesystems like Vercel
  }
}

exports.getActiveModel = async (req, res) => {
  try {
    const data = await getAiSettingsData();
    if (data.activeProvider && data.activeModel) {
      return res.json(data);
    }
    res.json({ activeProvider: 'groq', activeModel: 'llama-3.3-70b-versatile' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read AI settings' });
  }
};

exports.saveActiveModel = async (req, res) => {
  try {
    const provider = req.body.provider || req.body.activeProvider;
    const model = req.body.model || req.body.activeModel;
    if (!provider || !model) {
      return res.status(400).json({ error: 'provider and model are required' });
    }
    const current = await getAiSettingsData();
    const data = {
      ...current,
      activeProvider: provider,
      activeModel: model,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Admin Control Center'
    };
    await saveAiSettingsData(data);
    res.json({ message: `Active AI model set to ${provider.toUpperCase()}: ${model}`, settings: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save active AI model: ' + err.message });
  }
};

const toneStylesPath = path.join(__dirname, '../data/toneStyles.json');
const tmpToneStylesPath = path.join('/tmp', 'toneStyles.json');
let inMemoryToneStyles = null;
let lastToneFetchTime = 0;
const TONE_CACHE_TTL = 3000; // 3 seconds TTL so updates propagate across instances

exports.getToneStylesCached = () => inMemoryToneStyles;
exports.getToneStylesDirect = async () => {
  if (inMemoryToneStyles && inMemoryToneStyles.defaultTones && (Date.now() - lastToneFetchTime < TONE_CACHE_TTL)) {
    return inMemoryToneStyles;
  }
  if (supabase) {
    try {
      const { data, error } = await supabase.from('plans').select('features').eq('id', 'system_tone_styles').maybeSingle();
      if (!error && data && data.features && Array.isArray(data.features.defaultTones)) {
        inMemoryToneStyles = data.features;
        lastToneFetchTime = Date.now();
        return inMemoryToneStyles;
      }
    } catch (e) {}
  }
  return inMemoryToneStyles;
};

exports.getToneStyles = async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  try {
    const now = Date.now();
    if (inMemoryToneStyles && inMemoryToneStyles.defaultTones && (now - lastToneFetchTime < TONE_CACHE_TTL)) {
      return res.json(inMemoryToneStyles);
    }

    // 1. Fetch from Supabase cloud database
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('features')
          .eq('id', 'system_tone_styles')
          .maybeSingle();

        if (!error && data && data.features && Array.isArray(data.features.defaultTones)) {
          inMemoryToneStyles = data.features;
          lastToneFetchTime = now;
          return res.json(inMemoryToneStyles);
        }
      } catch (e) {
        console.warn('⚠️ [Admin] Supabase tone styles load warning:', e.message);
      }
    }

    if (fs.existsSync(tmpToneStylesPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(tmpToneStylesPath, 'utf8'));
        inMemoryToneStyles = data;
        return res.json(data);
      } catch (e) {}
    }
    if (fs.existsSync(toneStylesPath)) {
      const data = JSON.parse(fs.readFileSync(toneStylesPath, 'utf8'));
      inMemoryToneStyles = data;
      return res.json(data);
    }
    const defaultData = {
      maxCustomTemplatesPerUser: 2,
      defaultTones: [
        { id: 'bullish-short', name: 'Bullish (5-10 words)', description: 'Strictly 5-10 words positive bullish community comment, zero clichés or emojis', prompt: 'Write a bullish, positive comment replying to the post.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words. Do not exceed 10 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human community member. No AI clichés, no generic hype.\nAUTHOR RULE: Never use the post author\'s name or username. Do not tag anyone.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no $, no dashes, no preamble, no exclamation marks (!).' },
        { id: 'ct-human', name: 'CT Human Reply', description: 'Authentic Crypto Twitter peer reply, 5-10 words', prompt: 'Write a highly authentic, natural human reply to the post as a Crypto Twitter (CT) community member.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human friend/peer. Zero robotic AI clichés.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no $, no dashes, no preamble, no exclamation marks (!).' },
        { id: 'natural', name: 'Natural & Concise', description: 'Casual, human-sounding 5-10 words', prompt: 'Write a casual, highly human response.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words.\nSTYLE: Sound natural, direct and concise. Avoid robotic hashtags or buzzwords.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no $, no dashes, no exclamation marks (!).' },
        { id: 'professional', name: 'Professional', description: 'Authoritative, insightful 5-10 words', prompt: 'Sound authoritative and sharp.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no $, no dashes, no exclamation marks (!).' }
      ]
    };
    inMemoryToneStyles = defaultData;
    res.json(defaultData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tone styles: ' + err.message });
  }
};

exports.saveToneStyles = async (req, res) => {
  try {
    const { maxCustomTemplatesPerUser, defaultTones } = req.body;
    let current = inMemoryToneStyles;
    if (!current && fs.existsSync(toneStylesPath)) {
      try { current = JSON.parse(fs.readFileSync(toneStylesPath, 'utf8')); } catch (e) {}
    }
    if (!current) {
      current = { maxCustomTemplatesPerUser: 2, defaultTones: [] };
    }

    const updated = {
      maxCustomTemplatesPerUser: typeof maxCustomTemplatesPerUser === 'number'
        ? Math.max(1, maxCustomTemplatesPerUser)
        : current.maxCustomTemplatesPerUser || 2,
      defaultTones: Array.isArray(defaultTones) ? defaultTones : current.defaultTones,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Admin Control Center'
    };

    inMemoryToneStyles = updated;
    lastToneFetchTime = Date.now();

    // 1. Persist to Supabase cloud database
    if (supabase) {
      try {
        await supabase.from('plans').upsert({
          id: 'system_tone_styles',
          name: 'System Tone Styles Storage',
          price_monthly: 0,
          credits_monthly: 0,
          is_popular: false,
          is_active: false,
          features: updated
        }, { onConflict: 'id' });
        console.log('✓ [Admin] Tone & Style settings persisted to Supabase cloud');
      } catch (dbErr) {
        console.warn('⚠️ [Admin] Supabase tone styles upsert warning:', dbErr.message);
      }
    }

    // 2. Safe local file write (try /tmp first, then local if writable)
    try {
      fs.mkdirSync(path.dirname(toneStylesPath), { recursive: true });
      fs.writeFileSync(toneStylesPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (fsErr) {
      try {
        fs.writeFileSync(tmpToneStylesPath, JSON.stringify(updated, null, 2), 'utf8');
      } catch (tmpErr) {}
    }

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
exports.getApiLogs = async (req, res) => {
  try {
    const logs = await multiProviderService.getApiLogs();
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
exports.getApiKeys = async (req, res) => {
  try {
    const data = await getAiSettingsData();
    const savedKeys = data.apiKeys || {};

    const providers = ['groq', 'openrouter', 'openai', 'anthropic', 'gemini'];
    const envVarMap = {
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
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

    let openaiBaseUrl = data.openaiBaseUrl || process.env.OPENAI_BASE_URL || readEnvValue('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    let anthropicBaseUrl = data.anthropicBaseUrl || process.env.ANTHROPIC_BASE_URL || readEnvValue('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com';

    res.json({ keys: result, openaiBaseUrl, anthropicBaseUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve API keys: ' + err.message });
  }
};

// Save and activate API Key from Admin Control Center (Syncs to Supabase, aiSettings.json, process.env, and .env)
exports.saveApiKey = async (req, res) => {
  try {
    const { provider, apiKey, openaiBaseUrl, anthropicBaseUrl } = req.body;
    if (!provider || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'provider and apiKey are required' });
    }

    const prov = provider.toLowerCase().trim();
    const envVarMap = {
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };

    const envName = envVarMap[prov];
    if (!envName) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    const cleanKey = apiKey.trim();

    // 1. Fetch current settings from Supabase / cache
    let data = await getAiSettingsData();
    if (!data.apiKeys) data.apiKeys = {};

    if (cleanKey && cleanKey !== 'KEEP_EXISTING') {
      data.apiKeys[prov] = cleanKey;
      process.env[envName] = cleanKey;
      updateEnvFile(envName, cleanKey);
    }
    if (typeof openaiBaseUrl === 'string') {
      const cleanUrl = openaiBaseUrl.trim().replace(/\/+$/, '');
      data.openaiBaseUrl = cleanUrl;
      process.env.OPENAI_BASE_URL = cleanUrl;
      updateEnvFile('OPENAI_BASE_URL', cleanUrl);
    }
    if (typeof anthropicBaseUrl === 'string') {
      const cleanUrl = anthropicBaseUrl.trim().replace(/\/+$/, '');
      data.anthropicBaseUrl = cleanUrl;
      process.env.ANTHROPIC_BASE_URL = cleanUrl;
      updateEnvFile('ANTHROPIC_BASE_URL', cleanUrl);
    }
    data.lastUpdated = new Date().toISOString();

    // 2. Persist safely across all environments (Supabase Cloud + /tmp + local if writable)
    await saveAiSettingsData(data);

    const effectiveKey = (cleanKey && cleanKey !== 'KEEP_EXISTING') ? cleanKey : (data.apiKeys[prov] || '');
    const masked = effectiveKey.length > 8 ? effectiveKey.slice(0, 4) + '••••••••' + effectiveKey.slice(-4) : '••••••••';
    res.json({
      message: `✓ ${provider.toUpperCase()} API key saved successfully and activated immediately!`,
      provider: prov,
      maskedKey: masked,
      hasKey: effectiveKey.length > 5
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save API key: ' + err.message });
  }
};

// Unified All-in-One Provider Configuration (Saves Key, Base URL, Model, and Sets Active)
exports.saveProviderConfig = async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl, setActive } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'provider is required' });
    }

    const prov = provider.toLowerCase().trim();
    const envVarMap = {
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };
    const envName = envVarMap[prov];

    let data = await getAiSettingsData();
    if (!data.apiKeys) data.apiKeys = {};

    // 1. API Key
    const cleanKey = (apiKey || '').trim();
    if (cleanKey && cleanKey !== 'KEEP_EXISTING') {
      data.apiKeys[prov] = cleanKey;
      if (envName) {
        process.env[envName] = cleanKey;
        updateEnvFile(envName, cleanKey);
      }
    }

    // 2. Base URL
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
      if (prov === 'openai') {
        data.openaiBaseUrl = cleanUrl;
        process.env.OPENAI_BASE_URL = cleanUrl;
        updateEnvFile('OPENAI_BASE_URL', cleanUrl);
      } else if (prov === 'anthropic') {
        data.anthropicBaseUrl = cleanUrl;
        process.env.ANTHROPIC_BASE_URL = cleanUrl;
        updateEnvFile('ANTHROPIC_BASE_URL', cleanUrl);
      }
    }

    // 3. Model
    if (model && typeof model === 'string' && model.trim()) {
      if (!data.providerModels) data.providerModels = {};
      data.providerModels[prov] = model.trim();
    }

    // 4. Set as Active System Provider if requested
    if (setActive === true || setActive === 'true') {
      data.activeProvider = prov;
      if (model && typeof model === 'string' && model.trim()) {
        data.activeModel = model.trim();
      } else if (data.providerModels && data.providerModels[prov]) {
        data.activeModel = data.providerModels[prov];
      }
    }

    data.lastUpdated = new Date().toISOString();
    data.updatedBy = 'Admin Control Center';

    await saveAiSettingsData(data);

    const effectiveKey = (cleanKey && cleanKey !== 'KEEP_EXISTING') ? cleanKey : (data.apiKeys[prov] || '');
    const masked = effectiveKey.length > 8 ? effectiveKey.slice(0, 4) + '••••••••' + effectiveKey.slice(-4) : '••••••••';

    res.json({
      success: true,
      message: `✓ ${prov.toUpperCase()} configuration saved successfully!`,
      settings: data,
      maskedKey: masked,
      hasKey: effectiveKey.length > 5
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save provider config: ' + err.message });
  }
};

// Test Single Provider Key Connection
exports.testSingleKey = async (req, res) => {
  try {
    const { provider, apiKey, baseUrl } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    const result = await multiProviderService.testSingleProviderKey(provider, apiKey, baseUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to test key: ' + err.message });
  }
};

// Wipe All User Data Fresh (Clean Slate)
exports.wipeAllUsers = async (req, res) => {
  try {
    const result = await db.wipeAllUserData();
    res.json({
      success: true,
      message: '✓ All user data, access requests, credits ledgers, and engaged tweets have been completely wiped fresh!',
      result
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to wipe user data: ' + err.message });
  }
};

// Referral Management (Admin Dashboard)
exports.getReferrals = async (req, res) => {
  try {
    const referralService = require('../services/referralService');
    let referrals = referralService.getAllReferrals();

    // If no explicit referral records, dynamically construct from users and accessRequests with referral attribution
    if (!referrals || referrals.length === 0) {
      const users = await db.getAllUsers();
      const requests = await db.getAccessRequests();
      const derived = [];

      // Check registered users
      users.forEach(u => {
        const refBy = u.referred_by || (u.use_case && u.use_case.match(/REF:(@?[\w_]+)/i) ? u.use_case.match(/REF:(@?[\w_]+)/i)[1] : null);
        if (refBy && refBy !== 'Direct / —' && refBy !== 'Direct') {
          const cleanRef = refBy.startsWith('@') ? refBy : `@${refBy}`;
          derived.push({
            id: `ref_u_${u.id}`,
            referrer_handle: cleanRef,
            referee_handle: u.handle || `@${u.email.split('@')[0]}`,
            referee_name: u.full_name || u.name || 'User',
            referee_email: u.email,
            status: u.status === 'ACTIVE' ? 'APPROVED' : 'PENDING',
            referrer_reward: 150,
            referee_reward: 150,
            created_at: u.created_at || new Date().toISOString(),
            approved_at: u.status === 'ACTIVE' ? (u.created_at || new Date().toISOString()) : null,
            first_purchase_status: u.plan_tier && !u.plan_tier.toLowerCase().includes('free') ? 'PAID' : 'NONE',
            first_purchase_amount: u.plan_tier && u.plan_tier.toLowerCase().includes('pro') ? 29 : (u.plan_tier && u.plan_tier.toLowerCase().includes('growth') ? 12 : 0),
            purchase_reward_credits: u.plan_tier && !u.plan_tier.toLowerCase().includes('free') ? 1200 : 0
          });
        }
      });

      // Check pending requests
      requests.forEach(r => {
        const refBy = r.referred_by || (r.use_case && r.use_case.match(/REF:(@?[\w_]+)/i) ? r.use_case.match(/REF:(@?[\w_]+)/i)[1] : null);
        if (refBy && refBy !== 'Direct / —' && refBy !== 'Direct') {
          const cleanRef = refBy.startsWith('@') ? refBy : `@${refBy}`;
          if (!derived.some(d => d.referee_handle === r.handle || d.referee_email === r.email)) {
            derived.push({
              id: `ref_r_${r.id}`,
              referrer_handle: cleanRef,
              referee_handle: r.handle || `@${r.email.split('@')[0]}`,
              referee_name: r.full_name || r.name || 'Applicant',
              referee_email: r.email,
              status: 'PENDING',
              referrer_reward: 150,
              referee_reward: 150,
              created_at: r.created_at || new Date().toISOString(),
              approved_at: null,
              first_purchase_status: 'NONE',
              first_purchase_amount: 0,
              purchase_reward_credits: 0
            });
          }
        }
      });

      if (derived.length > 0) {
        referrals = derived;
      }
    }

    const totalReferrals = referrals.length;
    const approvedReferrals = referrals.filter(r => r.status === 'APPROVED').length;
    const pendingReferrals = referrals.filter(r => r.status === 'PENDING').length;
    const referralCredits = approvedReferrals * 150 * 2; // 150 referrer + 150 referee
    const purchaseRewards = referrals.reduce((sum, r) => sum + (r.purchase_reward_credits || 0), 0);

    res.json({
      success: true,
      stats: {
        totalReferrals,
        approvedReferrals,
        pendingReferrals,
        referralCredits,
        purchaseRewards
      },
      referrals
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch referrals: ' + err.message });
  }
};

// Special Promotional Offers (FOUNDING 100 / FIRST LAUNCH)
exports.getOffer = async (req, res) => {
  try {
    const offerService = require('../services/offerService');
    const users = await db.getAllUsers();
    const paidCount = users.filter(u => u.plan_tier && !u.plan_tier.toLowerCase().includes('free')).length;
    const offer = offerService.getCurrentOffer(paidCount);
    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch promotional offer: ' + err.message });
  }
};

exports.saveOffer = (req, res) => {
  try {
    const offerService = require('../services/offerService');
    const updated = offerService.updateOffer(req.body);
    res.json({
      success: true,
      message: '✓ Promotional offer updated successfully!',
      offer: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save promotional offer: ' + err.message });
  }
};

// System Version & Universal Update API (Dynamically synced with GitHub Releases)
let cachedRelease = null;
let lastReleaseFetch = 0;

exports.getSystemVersion = async (req, res) => {
  const DEFAULT_VERSION = '1.0.0';
  const now = Date.now();

  // Cache GitHub release check for 5 minutes
  if (cachedRelease && (now - lastReleaseFetch < 5 * 60 * 1000)) {
    return res.json(cachedRelease);
  }

  try {
    const ghRes = await fetch('https://api.github.com/repos/yournahian/AgenticX/releases/latest', {
      headers: {
        'User-Agent': 'AtomX-Update-Checker',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (ghRes.ok) {
      const release = await ghRes.json();
      const tagName = (release.tag_name || '').replace(/^v/, '').trim();
      if (tagName) {
        cachedRelease = {
          currentVersion: tagName,
          minSupportedVersion: DEFAULT_VERSION,
          releaseDate: (release.published_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
          releaseNotes: release.name || release.body || 'New release available on GitHub',
          downloadUrl: release.html_url || 'https://github.com/yournahian/AgenticX/releases',
          hasRealRelease: true
        };
        lastReleaseFetch = now;
        return res.json(cachedRelease);
      }
    }
  } catch (err) {
    // GitHub API fallback
  }

  // Fallback when no GitHub release has been published yet
  cachedRelease = {
    currentVersion: DEFAULT_VERSION,
    minSupportedVersion: DEFAULT_VERSION,
    releaseDate: '2026-10-08',
    releaseNotes: 'Base version',
    downloadUrl: 'https://github.com/yournahian/AgenticX/releases',
    hasRealRelease: false
  };
  lastReleaseFetch = now;
  return res.json(cachedRelease);
};
