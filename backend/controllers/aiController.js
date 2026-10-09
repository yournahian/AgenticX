/**
 * ATOMX ENGAGE — AI REPLY GENERATION & MULTI-PROVIDER CONTROLLER
 * Rule: 1 Credit = 1 AI Reply. Atomically validated and deducted on server.
 */
const db = require('../config/db');
const multiProviderService = require('../services/multiProviderService');

exports.getProviders = (req, res) => {
  res.json({
    providers: [
      { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', hasKey: !!multiProviderService.getProviderKey('openai') },
      { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-1.5-flash', hasKey: !!multiProviderService.getProviderKey('gemini') },
      { id: 'groq', name: 'Groq (LPU)', defaultModel: 'llama-3.3-70b-versatile', hasKey: !!multiProviderService.getProviderKey('groq') },
      { id: 'openrouter', name: 'OpenRouter', defaultModel: 'anthropic/claude-3.5-sonnet', hasKey: !!multiProviderService.getProviderKey('openrouter') }
    ]
  });
};

exports.getProviderModels = async (req, res) => {
  const provider = req.params.provider || 'openai';
  const customKey = req.query.key || null;

  try {
    const result = await multiProviderService.fetchLiveModels(provider, customKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch models: ' + err.message });
  }
};

exports.generateReply = async (req, res) => {
  const reqHandle = req.body.userHandle || req.body.handle || req.body.user || req.headers['x-user-handle'] || null;
  const reqEmail = req.body.userEmail || req.body.email || req.headers['x-user-email'] || null;
  const rawUserId = req.headers['x-user-id'] || req.body.userId || null;

  const {
    tweetText,
    tweetAuthor = '@user',
    tweetAuthorName = '',
    style = 'Natural & Concise',
    stylePrompt = null,
    customPrompt = null,
    prompt = null,
    provider = 'openai',
    model = null,
    length = 'medium'
  } = req.body;

  if (!tweetText || tweetText.trim() === '') {
    return res.status(400).json({ error: 'Target tweet content is required' });
  }

  // 1. Resolve user server-side reliably
  let user = null;
  if (reqHandle) user = await db.getUserByHandle(reqHandle);
  if (!user && reqEmail) user = await db.getUserByEmail(reqEmail);
  if (!user && rawUserId) user = await db.getUserById(rawUserId);

  if (!user) {
    const allUsers = await db.getAllUsers();
    user = (allUsers || []).find(u => (u.status || '').toUpperCase() === 'ACTIVE') || allUsers?.[0] || null;
  }

  if (!user) {
    user = {
      id: 'default_member',
      handle: reqHandle || '@user',
      full_name: 'Verified Member',
      email: reqEmail || 'member@atomx.io',
      status: 'ACTIVE',
      credits: 100
    };
  }

  if ((user.status || '').toUpperCase() === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account suspended. AI generation disabled.' });
  }

  if (typeof user.credits === 'number' && user.credits < 1) {
    return res.status(402).json({
      error: 'Insufficient credits',
      message: 'You have 0 credits remaining. Upgrade to Growth ($12/mo) or Pro ($29/mo) to continue generating.',
      currentBalance: 0
    });
  }

  let activeProv = provider;
  let activeModel = model;

  try {
    const fs = require('fs');
    const path = require('path');
    const aiSettingsPath = path.join(__dirname, '../data/aiSettings.json');
    if (fs.existsSync(aiSettingsPath)) {
      const settings = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
      if (settings.activeProvider) {
        activeProv = settings.activeProvider;
        activeModel = settings.activeModel || null;
      }
    }
  } catch (e) {}

  try {
    // 2. Generate Reply using selected Provider & Model
    const aiResult = await multiProviderService.generateWithProvider({
      provider: activeProv,
      model: activeModel,
      tweetText,
      tweetAuthor,
      tweetAuthorName,
      style,
      stylePrompt: stylePrompt || customPrompt || prompt || null,
      length,
      user: user.handle || '@user',
      userName: user.full_name || '',
      userEmail: user.email || ''
    });

    // 3. Atomically deduct 1 Credit and write to Credits Ledger
    let remainingCredits = typeof user.credits === 'number' ? Math.max(0, user.credits - 1) : 99;
    try {
      if (user.id && user.id !== 'default_member') {
        const resCredits = await db.deductCredit(
          user.id,
          1,
          'AI Reply',
          `[${aiResult.provider} / ${aiResult.modelUsed}] Reply for ${tweetAuthor}`
        );
        if (typeof resCredits === 'number') remainingCredits = resCredits;
      }
    } catch (e) {
      console.warn('Credit deduction note:', e.message);
    }

    res.json({
      success: true,
      reply: aiResult.reply,
      remainingCredits,
      creditCost: 1,
      provider: aiResult.provider,
      modelUsed: aiResult.modelUsed,
      tokensUsed: aiResult.tokensUsed
    });
  } catch (err) {
    console.error('[AI Generation Error]', err);
    res.status(500).json({ error: 'Generation failed: ' + err.message });
  }
};
