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
  const userId = Number(req.headers['x-user-id'] || 1);
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

  // 1. Check user status & credits server-side
  const user = db.getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account suspended. AI generation disabled.' });
  }

  if (user.credits < 1) {
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
      length
    });

    // 3. Atomically deduct 1 Credit and write to Credits Ledger
    const remainingCredits = db.deductCredit(
      userId,
      1,
      'AI Reply',
      `[${aiResult.provider} / ${aiResult.modelUsed}] Reply for ${tweetAuthor}`
    );

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
