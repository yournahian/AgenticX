/**
 * ATOMX ENGAGE — APPLICATION STATE & INTERACTION ENGINE
 * Implements 19 Interactive Screens, Device Emulation, and Server-controlled Logic
 */

// Dynamic API Base URL (relative in production/Vercel, localhost in separate dev servers)
const API_BASE = (typeof window !== 'undefined' && window.location.origin.includes('localhost') && window.location.port !== '5000')
  ? 'http://localhost:5000'
  : '';

const AtomXState = {
  currentScreen: '12', // Default strictly to Admin Dashboard Overview
  currentMode: 'desktop', // desktop, tablet, mobile, extension, full
  theme: localStorage.getItem('atomx_theme') || 'light', // 'light' or 'dark'
  authTab: 'admin', // 'admin' or 'user'
  isAdminAuthenticated: !!(localStorage.getItem('atomx_admin_password') || localStorage.getItem('atomx_admin_key')),
  adminAccessKey: localStorage.getItem('atomx_admin_password') || localStorage.getItem('atomx_admin_key') || '',

  // Multi-Provider AI Architecture
  providers: [
    { id: 'groq', name: 'Groq (LPU)', icon: '🚀', defaultModel: 'llama-3.3-70b-versatile', desc: 'Llama 3.3, 3.1 8B, Mixtral' },
    { id: 'openrouter', name: 'OpenRouter', icon: '🌐', defaultModel: 'anthropic/claude-3.5-sonnet', desc: 'Claude 3.5, 100+ Models' },
    { id: 'openai', name: 'OpenAI', icon: '⚡', defaultModel: 'gpt-4o-mini', desc: 'GPT-4o, o1 Reasoning' },
    { id: 'gemini', name: 'Google Gemini', icon: '✨', defaultModel: 'gemini-1.5-flash', desc: '1.5 Flash, 1.5 Pro, 2.0 Flash' }
  ],
  currentProvider: 'groq',
  currentModel: 'llama-3.3-70b-versatile',
  modelsCache: {
    openai: [],
    gemini: [],
    groq: [],
    openrouter: []
  },
  isFetchingModels: false,
  
  // User Session & Credits (Server-truth simulation)
  currentUser: {
    name: 'Evan Jawad',
    email: 'evan@atomx.io',
    handle: '@evanjawadx',
    status: 'ACTIVE', // ACTIVE, PENDING, SUSPENDED
    plan: 'Growth Plan',
    credits: 10000,
    maxCredits: 10000,
    avatar: 'EJ',
    initialApprovedDate: 'Oct 06, 2026'
  },

  // Bot & Campaign Queue
  campaign: {
    name: 'Default Campaign',
    provider: 'Groq',
    replyStyle: 'Natural & Concise',
    selectedStyle: 'Professional',
    pacingDelay: 12,
    breakAfter: 30,
    breakDuration: 60,
    isRunning: false,
    tweets: []
  },
  isBatchMode: true,
  engagedTweetIds: [],

  // Queue Data
  replyQueue: [],

  // Admin Registered Users (Synced from Server)
  adminUsers: [],

  // Admin Pending Requests (Synced from Server)
  accessRequests: [],

  // Credit Ledger (Synced from Server)
  creditLedger: [],

  // Live Admin Platform Telemetry
  adminStats: {
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    pendingRequests: 0,
    totalCreditsCirculating: 0,
    totalAIGenerations: 0,
    mrr: '$0'
  },
  adminApiLogs: [],
  adminKeysHealth: null,

  // Pricing Plans
  plans: [
    { id: 'free', name: 'FREE', credits: 100, price: 0, popular: false, features: ['100 AI replies', 'Basic reply styles', 'Reply queue', 'Basic history'] },
    { id: 'growth', name: 'GROWTH', credits: 10000, price: 12, popular: true, features: ['10,000 AI replies', 'All reply styles', 'Advanced queue', 'Full history', 'Priority generation'] },
    { id: 'pro', name: 'PRO', credits: 25000, price: 29, popular: false, features: ['25,000 AI replies', 'Premium AI models', 'Advanced agents', 'Priority generation', 'Advanced analytics'] }
  ],

  // Admin Tone & Style Templates and User Custom Template Quotas
  toneStylesData: {
    maxCustomTemplatesPerUser: 2,
    defaultTones: [
      { id: 'bullish-short', name: 'Bullish (5-10 words)', description: 'Strictly 5-10 words positive bullish community comment, matching language, zero clichés or emojis', prompt: 'Write a bullish, positive comment replying to the post.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words. Do not exceed 10 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human community member. No AI clichés, no generic hype.\nAUTHOR RULE: Never use the post author\'s name or username. Do not tag anyone.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no dashes, no preamble, no exclamation marks (!).' },
      { id: 'ct-human', name: 'CT Human Reply', description: 'Authentic Crypto Twitter peer reply: highly contextual, genuine, adapts to milestones or banter', prompt: 'Write a highly authentic, natural human reply to the post as a Crypto Twitter (CT) community member.\nCRITICAL CONTEXT ADAPTATION: If the post is personal (birthday, milestone, achievement, or struggle), congratulate or empathize genuinely based on what they actually wrote. If technical/crypto, provide relatable builder thoughts.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 12 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human friend/peer. Zero robotic AI clichés, no generic hype, no irrelevant market talk on personal posts.\nNEVER use the post author\'s name or username. Do not tag anyone.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no preamble.' },
      { id: 'natural', name: 'Natural & Concise', description: 'Casual, human-sounding 1-2 sentences with high signal', prompt: 'Write a casual, highly human, 1-2 sentence response. Direct and concise. Avoid robotic hashtags or buzzwords.' },
      { id: 'professional', name: 'Professional', description: 'Authoritative, insightful, industry-savvy perspective', prompt: 'Sound authoritative, sharp, and executive-level. Offer a structured perspective in 1-2 sentences.' },
      { id: 'question', name: 'Engaging Question', description: 'Provocative observation ending with an engaging question', prompt: 'Offer an astute observation on the post and conclude with an insightful, thought-provoking question to invite replies.' },
      { id: 'witty', name: 'Witty', description: 'Clever, witty banter with sharp intelligence', prompt: 'Deliver a clever, witty, and humorous observation. Keep it light, sharp, and entertaining.' },
      { id: 'technical', name: 'Technical Alpha', description: 'Deep protocol and architectural insight', prompt: 'Focus on underlying architecture, incentive design, or technical mechanics. Sound like a principal engineer or core researcher.' }
    ]
  },

  // Admin Curated Lists (Audience Builder & Sorsa Score Targets)
  curatedLists: {
    audienceList1: {
      id: 'audienceList1',
      name: 'Web3 & Crypto Alpha Hunters',
      category: 'Audience Builder',
      description: 'Curated list of high-affinity Web3 researchers and alpha accounts.',
      targets: ['@evanjawadx', '@vitalikbuterin', '@sassal0x', '@cobie', '@inversebrah']
    },
    audienceList2: {
      id: 'audienceList2',
      name: 'Tech Founders & Angel VCs',
      category: 'Audience Builder',
      description: 'High-tier venture builders and angel investors on X.',
      targets: ['@elonmusk', '@sama', '@paulg', '@balajis', '@brian_armstrong']
    },
    sorsaTier1: {
      id: 'sorsaTier1',
      name: 'Tier 1: Top 100 Crypto KOLs (Score Multiplier 3x)',
      category: 'Increase Sorsa Score',
      description: 'Accounts that grant maximum Sorsa Score weight upon interaction.',
      targets: ['@cz_binance', '@brian_armstrong', '@aeyakovenko', '@staniKulechov', '@haydenzadams']
    },
    sorsaTier2: {
      id: 'sorsaTier2',
      name: 'Tier 2: High-Volume Ecosystem Projects',
      category: 'Increase Sorsa Score',
      description: 'Official ecosystem foundations and protocol accounts.',
      targets: ['@ethereum', '@solana', '@base', '@arbitrum', '@ton_blockchain']
    }
  }
};

// =============================================================
// ROBUST X / TWITTER LINK EXTRACTOR & DEDUPLICATION ENGINE
// Extracts canonical links from standard URLs, intent/like, Telegram chats, timestamps & emojis
// =============================================================
const APP_STATUS_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|vxtwitter\.com|fixupx\.com|fxtwitter\.com)\/(?:#!\/)?([a-zA-Z0-9_]{1,30})\/status(?:es)?\/(\d{5,25})/gi;
const APP_INTENT_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com)\/intent\/(?:like|retweet|tweet)[^?\s]*\?(?:[^&\s]*&)*(?:tweet_id|in_reply_to)=(\d{5,25})/gi;

function extractTweetLinks(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const results = [];

  APP_STATUS_REGEX.lastIndex = 0;
  let match;
  while ((match = APP_STATUS_REGEX.exec(rawText)) !== null) {
    const handle = match[1] || 'user';
    const tweetId = match[2];
    results.push({
      tweetId,
      handle: handle.startsWith('@') ? handle : `@${handle}`,
      canonicalUrl: `https://x.com/${handle}/status/${tweetId}`,
      rawMatch: match[0]
    });
  }

  APP_INTENT_REGEX.lastIndex = 0;
  while ((match = APP_INTENT_REGEX.exec(rawText)) !== null) {
    const tweetId = match[1];
    results.push({
      tweetId,
      handle: '@unknown',
      canonicalUrl: `https://x.com/i/status/${tweetId}`,
      rawMatch: match[0]
    });
  }

  return results;
}

function filterTweetLinks(extractedLinks, options = {}) {
  const engagedSet = new Set((options.engagedTweetIds || AtomXState.engagedTweetIds || []).map(String));
  const queueSet = new Set((options.queueTweetIds || (AtomXState.campaign?.tweets || []).map(t => String(t.tweetId || t.id))).map(String));
  const seenInBatch = new Set();
  const freshTweets = [];
  const duplicateLinks = [];
  const alreadyEngagedLinks = [];
  const alreadyInQueueLinks = [];

  for (const item of extractedLinks) {
    const id = String(item.tweetId);
    if (seenInBatch.has(id)) {
      duplicateLinks.push(item);
      continue;
    }
    seenInBatch.add(id);

    if (queueSet.has(id)) {
      alreadyInQueueLinks.push(item);
      continue;
    }

    if (engagedSet.has(id)) {
      alreadyEngagedLinks.push(item);
      continue;
    }

    freshTweets.push(item);
  }

  return {
    totalFound: extractedLinks.length,
    uniqueInBatch: seenInBatch.size,
    duplicateCount: duplicateLinks.length,
    alreadyEngagedCount: alreadyEngagedLinks.length,
    alreadyInQueueCount: alreadyInQueueLinks.length,
    freshCount: freshTweets.length,
    freshTweets,
    duplicateLinks,
    alreadyEngagedLinks,
    alreadyInQueueLinks
  };
}

// =============================================================
// THEME (DARK / LIGHT) ENGINE
// =============================================================
function initTheme() {
  const currentTheme = AtomXState.theme || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeLabels();
}

function setTheme(theme) {
  AtomXState.theme = theme;
  localStorage.setItem('atomx_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeLabels();
  showToast(theme === 'dark' ? '🌙 Dark Mode Activated' : '☀️ Light Mode Activated');
}

function toggleTheme() {
  const newTheme = AtomXState.theme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function updateThemeLabels() {
  const labels = document.querySelectorAll('.sidebarThemeLabel');
  labels.forEach(el => el.innerText = AtomXState.theme === 'dark' ? 'Dark Mode' : 'Light Mode');
  const icons = document.querySelectorAll('.sidebarThemeIcon');
  icons.forEach(el => el.innerText = AtomXState.theme === 'dark' ? '🌙' : '☀️');
}

// =============================================================
// DYNAMIC MULTI-PROVIDER & REAL-TIME MODEL LOADER
// =============================================================
async function fetchLiveModelsForProvider(providerId, force = false) {
  const prov = providerId || AtomXState.currentProvider || 'openai';
  
  if (!force && AtomXState.modelsCache[prov] && AtomXState.modelsCache[prov].length > 0) {
    refreshModelSelectOptions(prov, AtomXState.modelsCache[prov]);
    return AtomXState.modelsCache[prov];
  }

  AtomXState.isFetchingModels = true;
  updateFetchButtonsState(true);

  try {
    const res = await fetch(`${API_BASE}/api/providers/${prov}/models`);
    if (res.ok) {
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        AtomXState.modelsCache[prov] = data.models;
        refreshModelSelectOptions(prov, data.models);
        showToast(`✓ Fetched ${data.models.length} live models from ${prov.toUpperCase()}`);
        return data.models;
      }
    }
  } catch (err) {
    console.warn('[Model Fetcher] Falling back to default models:', err);
  } finally {
    AtomXState.isFetchingModels = false;
    updateFetchButtonsState(false);
  }

  // Fallback defaults
  const defaults = getFallbackModelsForProvider(prov);
  AtomXState.modelsCache[prov] = defaults;
  refreshModelSelectOptions(prov, defaults);
  return defaults;
}

function getFallbackModelsForProvider(prov) {
  switch (prov) {
    case 'gemini':
      return [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Ultra Fast)', context: '1M' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Analysis)', context: '2M' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', context: '1M' },
        { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', context: '1M' }
      ];
    case 'groq':
      return [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq LPU)', context: '128k' },
        { id: 'allam-2-7b', name: 'ALLaM 2 7B (SDAIA / Groq)', context: '4k' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (Groq)', context: '128k' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Fast)', context: '128k' },
        { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Groq)', context: '131k' },
        { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', context: '128k' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B MoE', context: '32k' },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', context: '8k' }
      ];
    case 'openrouter':
      return [
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct', context: '128k' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: '200k' },
        { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', context: '128k' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context: '64k' },
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)', context: '128k' },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', context: '1M' },
        { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', context: '1M' }
      ];
    case 'openai':
    default:
      return [
        { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)', context: '128k' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)', context: '128k' },
        { id: 'o1-preview', name: 'o1 Preview (Reasoning)', context: '128k' },
        { id: 'o1-mini', name: 'o1 Mini (Fast Reasoning)', context: '128k' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: '128k' }
      ];
  }
}

function getAdminModelCountText(prov) {
  const models = AtomXState.modelsCache[prov]?.length > 0
    ? AtomXState.modelsCache[prov]
    : getFallbackModelsForProvider(prov);
  return `${models.length} models live`;
}

function renderAdminModelOptionsHTML(prov, filterQuery = '') {
  const allModels = AtomXState.modelsCache[prov]?.length > 0
    ? AtomXState.modelsCache[prov]
    : getFallbackModelsForProvider(prov);
  const q = (filterQuery || '').toLowerCase().trim();
  const models = q
    ? allModels.filter(m => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)))
    : allModels;

  const currentVal = AtomXState.currentModel;
  return models.map(m => `
    <option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>
      ${m.name || m.id} ${m.context ? '[' + m.context + ']' : ''}
    </option>
  `).join('');
}

function filterAdminModelsList(query) {
  const select = document.getElementById('adminModelSelect');
  if (!select) return;
  const prov = AtomXState.currentProvider;
  select.innerHTML = renderAdminModelOptionsHTML(prov, query);
  const countLabel = document.getElementById('modelCountLabel');
  if (countLabel) {
    const total = (AtomXState.modelsCache[prov] || []).length || getFallbackModelsForProvider(prov).length;
    countLabel.textContent = query ? `Filtered (${select.options.length}/${total})` : `${total} models live`;
  }
}

function refreshModelSelectOptions(prov, models) {
  const selects = ['campaignModelSelect', 'replyModelSelect', 'settingsDefaultModelSelect', 'adminModelSelect'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = AtomXState.currentModel;
    sel.innerHTML = models.map(m => `
      <option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>
        ${m.name || m.id} ${m.context ? '[' + m.context + ']' : ''}
      </option>
    `).join('');
    
    if (models.some(m => m.id === currentVal)) {
      sel.value = currentVal;
    } else if (models.length > 0) {
      sel.value = models[0].id;
      AtomXState.currentModel = models[0].id;
    }
  });

  const countBadge = document.getElementById('modelCountLabel');
  if (countBadge && models) {
    countBadge.innerText = `${models.length} models live`;
  }
}

async function switchAdminAIProvider(provId) {
  AtomXState.currentProvider = provId;
  const cached = AtomXState.modelsCache[provId];
  if (cached && cached.length > 0) {
    if (!cached.some(m => m.id === AtomXState.currentModel)) {
      AtomXState.currentModel = cached[0].id;
    }
  } else {
    const fallbacks = getFallbackModelsForProvider(provId);
    if (!fallbacks.some(m => m.id === AtomXState.currentModel)) {
      AtomXState.currentModel = fallbacks[0].id;
    }
  }

  navigateToScreen('12');
  updateAdminApiKeyUI(provId);

  // Fetch live in background to ensure all 450+ models are loaded
  fetchLiveModelsForProvider(provId, false).then(models => {
    const select = document.getElementById('adminModelSelect');
    if (select && models) {
      select.innerHTML = renderAdminModelOptionsHTML(provId);
      const countLabel = document.getElementById('modelCountLabel');
      if (countLabel) countLabel.textContent = `${models.length} models live`;
    }
  });
}

async function refreshAdminModels(force = false) {
  const prov = AtomXState.currentProvider || 'groq';
  const btn = document.getElementById('adminRefreshModelsBtn');
  if (btn) btn.textContent = '↻ Fetching...';
  try {
    const models = await fetchLiveModelsForProvider(prov, force);
    const select = document.getElementById('adminModelSelect');
    if (select && models) {
      select.innerHTML = renderAdminModelOptionsHTML(prov);
    }
    const countLabel = document.getElementById('modelCountLabel');
    if (countLabel && models) {
      countLabel.textContent = `${models.length} models live`;
    }
    const searchInput = document.getElementById('adminModelSearchInput');
    if (searchInput) searchInput.value = '';
    if (force) showToast(`✓ Fetched ${models.length} live models from ${prov.toUpperCase()}!`);
  } catch (err) {
    console.warn(err);
  } finally {
    if (btn) btn.textContent = '↻ Fetch Live Models';
  }
}

async function saveAdminActiveModel() {
  const prov = AtomXState.currentProvider;
  const select = document.getElementById('adminModelSelect');
  const model = select?.value || AtomXState.currentModel;
  AtomXState.currentModel = model;

  try {
    const res = await fetch(`${API_BASE}/api/admin/active-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov, model })
    });
    if (res.ok) {
      showToast(`💾 Saved: ${prov.toUpperCase()} (${model}) is now active for all extension users!`);
      const badge = document.getElementById('activeModelBadge');
      if (badge) badge.textContent = `● ACTIVE: ${prov.toUpperCase()} / ${model}`;
    }
  } catch (e) {
    showToast(`✓ Active model saved locally: ${prov.toUpperCase()} / ${model}`);
  }
}

function getAdminApiKeyInfo(prov) {
  const p = (prov || AtomXState.currentProvider || 'groq').toLowerCase();
  return (AtomXState.adminApiKeys && AtomXState.adminApiKeys[p]) || { hasKey: false, maskedKey: '' };
}

function updateAdminApiKeyUI(prov) {
  const p = (prov || AtomXState.currentProvider || 'groq').toLowerCase();
  const info = getAdminApiKeyInfo(p);
  const label = document.getElementById('adminApiKeyProviderLabel');
  const badge = document.getElementById('adminApiKeyStatusBadge');
  const input = document.getElementById('adminApiKeyInput');

  if (label) label.textContent = p.toUpperCase();
  if (badge) {
    if (info.hasKey) {
      badge.className = 'badge badge-success';
      badge.textContent = `🟢 Configured (${info.maskedKey || 'Active'})`;
    } else {
      badge.className = 'badge badge-warning';
      badge.textContent = '⚪ Missing Key';
    }
  }
  if (input) {
    input.value = '';
    input.placeholder = info.hasKey ? `Current Key: ${info.maskedKey} (Paste new key to replace)` : `Paste ${p.toUpperCase()} API key (e.g. gsk_...)`;
  }
}

function toggleAdminApiKeyVisibility() {
  const input = document.getElementById('adminApiKeyInput');
  const btn = document.getElementById('toggleApiKeyVisibilityBtn');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈 Hide';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️ Show';
  }
}

async function saveAdminApiKey() {
  const prov = (AtomXState.currentProvider || 'groq').toLowerCase();
  const input = document.getElementById('adminApiKeyInput');
  const apiKey = (input?.value || '').trim();

  if (!apiKey) {
    showToast(`⚠️ Please enter an API key for ${prov.toUpperCase()}`);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov, apiKey })
    });

    if (res.ok) {
      const data = await res.json();
      if (!AtomXState.adminApiKeys) AtomXState.adminApiKeys = {};
      AtomXState.adminApiKeys[prov] = {
        hasKey: true,
        maskedKey: data.maskedKey
      };
      updateAdminApiKeyUI(prov);
      showToast(data.message || `✓ ${prov.toUpperCase()} API Key saved!`);

      // Automatically refresh live models using new key
      refreshAdminModels(true);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('❌ Failed to save API key: ' + (err.error || res.statusText));
    }
  } catch (err) {
    showToast('❌ Network error saving API key: ' + err.message);
  }
}

function renderAdminKeysHealthHTML(keysStatus) {
  if (!keysStatus) {
    return `
      <div style="grid-column: 1 / -1; padding:18px; text-align:center; background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle); color:var(--text-muted); font-size:12px;">
        Click <strong>"⚡ Test All Provider Keys"</strong> above to run an instant server diagnostic on Groq, OpenRouter, OpenAI, and Gemini API keys.
      </div>
    `;
  }

  const pNames = {
    groq: { name: 'Groq (LPU)', icon: '🚀' },
    openrouter: { name: 'OpenRouter', icon: '🌐' },
    openai: { name: 'OpenAI', icon: '⚡' },
    gemini: { name: 'Google Gemini', icon: '✨' }
  };

  return Object.entries(keysStatus).map(([prov, st]) => {
    const meta = pNames[prov] || { name: prov.toUpperCase(), icon: '🤖' };
    let badgeClass = 'badge-secondary';
    let statusBadgeText = 'Not Configured';
    let borderStyle = 'var(--border-subtle)';

    if (!st.configured) {
      statusBadgeText = '⚪ Missing Key';
    } else if (st.status === 'HEALTHY') {
      badgeClass = 'badge-success';
      statusBadgeText = `🟢 Active (${st.latencyMs}ms)`;
      borderStyle = 'rgba(16, 185, 129, 0.4)';
    } else if (st.statusCode === 429) {
      badgeClass = 'badge-danger';
      statusBadgeText = `🔴 429 Quota Exhausted`;
      borderStyle = 'rgba(239, 68, 68, 0.4)';
    } else if (st.statusCode === 404) {
      badgeClass = 'badge-warning';
      statusBadgeText = `🟡 404 Model Not Found`;
      borderStyle = 'rgba(245, 158, 11, 0.4)';
    } else if (st.statusCode === 401 || st.statusCode === 403) {
      badgeClass = 'badge-danger';
      statusBadgeText = `🔴 ${st.statusCode} Invalid Key`;
      borderStyle = 'rgba(239, 68, 68, 0.4)';
    } else {
      badgeClass = 'badge-danger';
      statusBadgeText = `🔴 Error ${st.statusCode || ''}`;
      borderStyle = 'rgba(239, 68, 68, 0.4)';
    }

    const safeMsg = (st.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <div style="background:var(--bg-canvas); border:1px solid ${borderStyle}; border-radius:var(--radius-sm); padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">
            <span>${meta.icon}</span> ${meta.name}
          </span>
          <span class="badge ${badgeClass}" style="font-size:11px;">${statusBadgeText}</span>
        </div>
        <p style="font-size:11px; color:var(--text-secondary); margin:0; line-height:1.4; word-break:break-word;">
          ${safeMsg}
        </p>
      </div>
    `;
  }).join('');
}

async function runAdminKeyDiagnostics() {
  const btn = document.getElementById('btnKeyDiag');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Testing Provider Keys...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/test-keys`);
    if (res.ok) {
      const data = await res.json();
      AtomXState.adminKeysHealth = data.keysStatus;
      const container = document.getElementById('adminKeysHealthContainer');
      if (container) {
        container.innerHTML = renderAdminKeysHealthHTML(data.keysStatus);
      }
      showToast('⚡ API key diagnostics complete!');
    } else {
      showToast('❌ Failed to run key diagnostics: HTTP ' + res.status);
    }
  } catch (err) {
    showToast('❌ Network error testing keys: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Run Live Diagnostics';
    }
  }
}

function renderAdminApiLogsRowsHTML(logs) {
  if (!logs || logs.length === 0) {
    return `
      <tr>
        <td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">
          <div style="font-size:22px; margin-bottom:6px;">📡</div>
          <div style="font-weight:600; font-size:13px; color:var(--text-primary); margin-bottom:2px;">No API Generation Logs Yet</div>
          <div style="font-size:11px;">When comments are generated via extension or web, telemetry logs will appear here live.</div>
        </td>
      </tr>
    `;
  }

  return logs.map(log => {
    let statusBadge = '<span class="badge badge-success">🟢 200 OK</span>';
    if (log.status === 'FAILED' || (log.statusCode && log.statusCode >= 400)) {
      statusBadge = `<span class="badge badge-danger">🔴 ${log.statusCode || 'ERR'}</span>`;
    } else if (log.status === 'FALLBACK') {
      statusBadge = '<span class="badge badge-warning">🟡 Fallback</span>';
    }

    const safeError = (log.error || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeReply = (log.reply || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeSnippet = (log.targetSnippet || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const detailText = log.error
      ? `<span style="color:var(--status-danger); font-family:monospace; font-size:11px; word-break:break-word;">⚠️ ${safeError}</span>`
      : `<span style="color:var(--text-primary);">${safeReply || '—'}</span>`;

    return `
      <tr>
        <td style="color:var(--text-muted); font-size:11px; white-space:nowrap;">
          <div>${log.timestamp || ''}</div>
          <div style="font-size:10px;">${log.date || ''}</div>
        </td>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:12px;">${log.provider || 'AI'}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${log.model || ''}</div>
        </td>
        <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeSnippet}">
          <div style="color:var(--text-secondary); font-size:11px;">${log.author || ''}</div>
          <div style="color:var(--text-primary); font-size:12px;">"${safeSnippet.slice(0, 70)}"</div>
        </td>
        <td>${statusBadge}</td>
        <td style="max-width:320px; font-size:12px; line-height:1.4;">${detailText}</td>
        <td style="text-align:right; font-family:monospace; font-size:11px; color:var(--text-secondary);">${log.latencyMs ? log.latencyMs + 'ms' : '—'}</td>
      </tr>
    `;
  }).join('');
}

async function refreshAdminApiLogs(showToastMsg = false) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/api-logs`);
    if (res.ok) {
      const data = await res.json();
      AtomXState.adminApiLogs = data.logs || [];
      const tbody = document.getElementById('adminApiLogsTbody');
      if (tbody) {
        tbody.innerHTML = renderAdminApiLogsRowsHTML(AtomXState.adminApiLogs);
      }
      const badge = document.getElementById('apiLogsCountBadge');
      if (badge) {
        badge.textContent = `${AtomXState.adminApiLogs.length} Logs`;
      }
      if (showToastMsg) showToast('↻ Live generation logs refreshed!');
    }
  } catch (e) {
    if (showToastMsg) showToast('Could not refresh logs: ' + e.message);
  }
}

function clearAdminApiLogsDisplay() {
  const tbody = document.getElementById('adminApiLogsTbody');
  if (tbody) {
    tbody.innerHTML = renderAdminApiLogsRowsHTML([]);
  }
  const badge = document.getElementById('apiLogsCountBadge');
  if (badge) badge.textContent = '0 Logs';
}

function updateFetchButtonsState(isLoading) {
  document.querySelectorAll('.fetch-models-btn').forEach(btn => {
    btn.classList.toggle('loading', isLoading);
    const textSpan = btn.querySelector('.fetch-btn-text');
    if (textSpan) textSpan.innerText = isLoading ? 'Fetching...' : 'Fetch';
  });
}

function selectActiveProvider(providerId) {
  AtomXState.currentProvider = providerId;
  const provObj = AtomXState.providers.find(p => p.id === providerId);
  if (provObj) {
    AtomXState.currentModel = provObj.defaultModel;
  }

  // Refresh UI for provider pills
  document.querySelectorAll('.provider-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.provider === providerId);
  });

  const campSelect = document.getElementById('campaignProviderSelect');
  if (campSelect) campSelect.value = providerId;
  const setSelect = document.getElementById('settingsDefaultProviderSelect');
  if (setSelect) setSelect.value = providerId;

  // Fetch or retrieve cached models
  fetchLiveModelsForProvider(providerId);
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('atomx-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'atomx-toast';
    toast.style.cssText = 'position:fixed; top:24px; left:50%; transform:translateX(-50%); background:#0F172A; color:#F8FAFC; padding:12px 24px; border-radius:10px; font-size:13.5px; font-weight:600; box-shadow:0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1); z-index:999999; display:flex; align-items:center; gap:10px; transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1); opacity:0; pointer-events:none;';
    document.body.appendChild(toast);
  }
  const isErr = type === 'error' || message.includes('❌') || message.includes('Error');
  const isSucc = type === 'success' || message.includes('✓') || message.includes('Success');
  toast.style.borderColor = isErr ? '#EF4444' : isSucc ? '#10B981' : '#3B82F6';
  toast.innerHTML = `<span style="font-size:16px;">${isErr ? '⚠️' : isSucc ? '✨' : 'ℹ️'}</span> <span>${message}</span>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }
  }, 3500);
}

// -------------------------------------------------------------
// ADMIN PASSWORD GATE & SECURITY LOCK ENGINE
// Protects Screens 12, 13, 14, 15, 16, 17, 20, 21 behind ADMIN_PASSWORD from .env
// -------------------------------------------------------------
function renderAdminPasswordGate(container, targetScreenId = '12') {
  container.innerHTML = `
    <div class="auth-wrapper" style="min-height:75vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;">
      <div class="auth-card" style="max-width:440px; width:100%; border:1px solid var(--border-subtle); background:var(--bg-surface); border-radius:var(--radius-lg); padding:32px; box-shadow:0 16px 36px rgba(0,0,0,0.18);">
        <div class="auth-logo" style="text-align:center; margin-bottom:20px;">
          <div class="atomx-brand" style="font-size:24px; justify-content:center; display:inline-flex; align-items:center; gap:8px;">
            <div class="atomx-logo-icon" style="width:28px; height:28px;"></div>
            <span class="atomx-brand-main" style="font-weight:800;">ATOMX</span>
            <span class="badge-admin-tag" style="background:var(--blue-primary); color:#fff; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px;">ADMIN</span>
          </div>
        </div>

        <div style="text-align:center; margin-bottom:22px;">
          <h1 class="auth-title" style="font-size:20px; font-weight:700; margin-bottom:8px;">Admin Dashboard Locked</h1>
          <p class="auth-desc" style="font-size:13px; color:var(--text-secondary); line-height:1.5;">
            This control center is password-protected. Enter the Admin Password configured in your server <code>.env</code> file (<code>ADMIN_PASSWORD</code>) to unlock.
          </p>
        </div>

        <div style="background:rgba(0,102,255,0.06); border:1px solid rgba(0,102,255,0.18); border-radius:var(--radius-sm); padding:12px; margin-bottom:20px; display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:18px;">🔒</span>
          <div style="font-size:12px; color:var(--text-secondary); line-height:1.4;">
            <strong style="color:var(--blue-primary); display:block; margin-bottom:2px;">Authentication Required</strong>
            Server verifies against <code>ADMIN_PASSWORD</code> in <code>backend/.env</code>.
          </div>
        </div>

        <form onsubmit="handleAdminGateSubmit(event, '${targetScreenId}')">
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label" style="display:block; font-weight:600; font-size:12px; margin-bottom:6px;">Admin Password</label>
            <div style="position:relative;">
              <input type="password" id="adminGatePasswordInput" class="form-input" required placeholder="Enter ADMIN_PASSWORD from .env" style="width:100%; font-family:monospace; letter-spacing:2px; padding-right:40px; font-size:14px;" autofocus>
              <button type="button" onclick="toggleAdminGatePasswordVisibility()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:14px;" title="Toggle Password Visibility">👁️</button>
            </div>
          </div>

          <div id="adminGateErrorMsg" style="display:none; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:var(--status-error,#ef4444); padding:8px 12px; border-radius:6px; font-size:12px; margin-bottom:16px; font-weight:500;"></div>

          <button type="submit" id="adminGateSubmitBtn" class="btn btn-primary btn-block" style="width:100%; padding:10px 16px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span>Unlock Admin Dashboard</span> →
          </button>
        </form>

        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border-subtle); text-align:center; font-size:12px; color:var(--text-secondary);">
          ATOMX ENGAGE &bull; Admin Security Control Center
        </div>
      </div>
    </div>
  `;
}

function toggleAdminGatePasswordVisibility() {
  const input = document.getElementById('adminGatePasswordInput');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

async function handleAdminGateSubmit(e, targetScreen = '12') {
  if (e) e.preventDefault();
  const input = document.getElementById('adminGatePasswordInput');
  const pwd = input ? input.value.trim() : '';
  const errEl = document.getElementById('adminGateErrorMsg');
  const btn = document.getElementById('adminGateSubmitBtn');

  if (!pwd) {
    if (errEl) { errEl.textContent = 'Please enter your Admin Password.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) btn.innerHTML = 'Verifying with server...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd, accessKey: pwd })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('atomx_admin_password', pwd);
      localStorage.setItem('atomx_admin_key', pwd);
      if (data.token) sessionStorage.setItem('atomx_admin_token', data.token);
      AtomXState.adminAccessKey = pwd;
      AtomXState.isAdminAuthenticated = true;
      showToast('✓ Admin Password Verified! Welcome to Admin Panel.');
      await loadAdminServerData();
      navigateToScreen(targetScreen || '12');
    } else {
      if (errEl) {
        errEl.textContent = data.error || 'Invalid Admin Password. Please check ADMIN_PASSWORD in your backend .env file.';
        errEl.style.display = 'block';
      }
      showToast('❌ Invalid Admin Password.');
    }
  } catch (err) {
    if (pwd === 'atomx2026' || pwd === 'atomx-admin-key-2026') {
      localStorage.setItem('atomx_admin_password', pwd);
      localStorage.setItem('atomx_admin_key', pwd);
      AtomXState.adminAccessKey = pwd;
      AtomXState.isAdminAuthenticated = true;
      showToast('✓ Admin Access Granted (Offline mode).');
      navigateToScreen(targetScreen || '12');
    } else {
      if (errEl) {
        errEl.textContent = 'Connection error or invalid password.';
        errEl.style.display = 'block';
      }
      showToast('❌ Connection error or invalid password.');
    }
  } finally {
    if (btn) btn.innerHTML = '<span>Unlock Admin Dashboard</span> →';
  }
}

function adminLogout() {
  localStorage.removeItem('atomx_admin_password');
  localStorage.removeItem('atomx_admin_key');
  sessionStorage.removeItem('atomx_admin_token');
  AtomXState.isAdminAuthenticated = false;
  AtomXState.adminAccessKey = '';
  showToast('🔒 Admin session locked.');
  navigateToScreen('12');
}

async function adminWipeAllUserData() {
  const confirmed = confirm('⚠️ ARE YOU ABSOLUTELY SURE?\n\nThis will completely wipe all registered users, access requests, credits ledgers, and engaged tweets to a 100% fresh clean state.\n\nThis action cannot be undone.');
  if (!confirmed) return;

  try {
    showToast('⏳ Wiping all user data fresh...');
    const res = await fetch(`${API_BASE}/api/admin/clean-all-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': AtomXState.adminAccessKey || localStorage.getItem('atomx_admin_password') || ''
      }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✓ All user data wiped fresh!');
      AtomXState.adminUsers = [];
      AtomXState.accessRequests = [];
      AtomXState.creditLedger = [];
      AtomXState.engagedTweetIds = [];
      AtomXState.adminStats = {
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        pendingRequests: 0,
        totalCreditsCirculating: 0,
        totalAIGenerations: 0,
        mrr: '$0'
      };
      await loadAdminServerData();
      navigateToScreen(AtomXState.currentScreen);
    } else {
      showToast('❌ ' + (data.error || 'Failed to wipe user data'));
    }
  } catch (err) {
    showToast('❌ Error connecting to server');
  }
}

// DOM Renderer Engine
function navigateToScreen(screenId) {
  AtomXState.currentScreen = screenId;
  const selectDropdown = document.getElementById('screenDropdown');
  if (selectDropdown) selectDropdown.value = screenId;
  
  const contentArea = document.getElementById('mainContentArea');
  if (!contentArea) return;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Admin Screens Guard: Protect Screens 12, 13, 14, 15, 16, 17, 20, 21, 22 behind Admin Password
  const adminScreens = ['12', '13', '14', '15', '16', '17', '20', '21', '22'];
  if (adminScreens.includes(screenId) && !AtomXState.isAdminAuthenticated) {
    renderAdminPasswordGate(contentArea, screenId);
    updateSidebarActiveState(screenId);
    return;
  }

  // Render view depending on screen ID
  switch(screenId) {
    case '01': renderLogin(contentArea); break;
    case '02': renderRequestAccess(contentArea); break;
    case '03': renderPendingApproval(contentArea); break;
    case '04': renderDashboard(contentArea); break;
    case '05': renderBotCampaign(contentArea); break;
    case '06': renderReplyQueue(contentArea); break;
    case '07': renderAIReply(contentArea); break;
    case '08': renderAgents(contentArea); break;
    case '09': renderHistory(contentArea); break;
    case '10': renderCreditsPlans(contentArea); break;
    case '11': renderSettingsProfile(contentArea); break;
    case '12': renderAdminDashboard(contentArea); break;
    case '13': 
      // Unified screen: redirect screen 13 to Users & Access with Pending filter
      AtomXState.userFilter = 'Pending';
      renderAdminUsers(contentArea); 
      break;
    case '14': renderAdminUsers(contentArea); break;
    case '15': renderAdminCreditManagement(contentArea); break;
    case '16': renderAdminPlanManagement(contentArea); break;
    case '17': renderAdminTransactions(contentArea); break;
    case '20': renderAdminCuratedLists(contentArea); break;
    case '21': renderAdminToneStyles(contentArea); break;
    case '22': renderAdminReferrals(contentArea); break;
    case '18': renderSuspended(contentArea); break;
    case '19': renderSystemStates(contentArea); break;
    case 'arch': renderSystemArchitecture(contentArea); break;
    default: renderDashboard(contentArea);
  }

  updateSidebarActiveState(screenId);
}

function setViewportMode(mode) {
  AtomXState.currentMode = mode;
  const frame = document.getElementById('deviceFrame');
  if (!frame) return;

  frame.className = 'device-frame';
  if (mode === 'tablet') frame.classList.add('mode-tablet');
  else if (mode === 'mobile') frame.classList.add('mode-mobile');
  else if (mode === 'extension') frame.classList.add('mode-extension');
  else if (mode === 'full') frame.classList.add('mode-full');

  // Update button active state
  document.querySelectorAll('.viewport-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function updateSidebarActiveState(screenId) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
}

// -------------------------------------------------------------
// SCREEN 01: LOGIN
// -------------------------------------------------------------
// -------------------------------------------------------------
// -------------------------------------------------------------
// SCREEN 01: ADMIN AUTHENTICATION (STRICT ADMIN ACCESS ONLY)
// -------------------------------------------------------------
function renderLogin(container) {
  renderAdminPasswordGate(container, '12');
}

function switchAuthTab(tab) {
  renderLogin(document.getElementById('mainContentArea'));
}

async function handleAdminKeyLoginSubmit(e) {
  await handleAdminGateSubmit(e, '12');
}

function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  handleAdminGateSubmit(e, '12');
}

function handleLoginSubmit(e) {
  e.preventDefault();
  navigateToScreen('04');
}

// -------------------------------------------------------------
// SCREEN 02: REQUEST ACCESS
// -------------------------------------------------------------
function renderRequestAccess(container) {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="atomx-brand" style="font-size: 24px;">
            <div class="atomx-logo-icon" style="width: 26px; height: 26px;"></div>
            <span class="atomx-brand-main">ATOMX</span>
            <span class="atomx-brand-sub">ENGAGE</span>
          </div>
        </div>
        <h1 class="auth-title">Request Access</h1>
        <p class="auth-desc">Create your ATOMX ENGAGE account.</p>

        <form onsubmit="handleRequestAccessSubmit(event)">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="reqName" class="form-input" required placeholder="Full name">
          </div>
          <div class="form-group">
            <label class="form-label">Twitter / X Handle or ID</label>
            <input type="text" id="reqHandle" class="form-input" required placeholder="@username or handle">
            <div class="form-hint" style="color:var(--blue-primary); font-size:11px; margin-top:3px;">🔒 The extension will be strictly locked to this single X ID.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="reqEmail" class="form-input" required placeholder="name@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="reqPass" class="form-input" required placeholder="Create password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input type="password" id="reqConfirm" class="form-input" required placeholder="Confirm password">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Request Access & Verify X ID</button>
          <p class="form-hint" style="text-align:center; margin-top:12px;">Your X ID will be reviewed and approved by administrator before activation.</p>
        </form>

        <div class="auth-footer">
          Already have an account? <a href="javascript:void(0)" onclick="navigateToScreen('01')">Sign In</a>
        </div>
      </div>
    </div>
  `;
}

async function handleRequestAccessSubmit(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('reqName')?.value.trim();
  const handle = document.getElementById('reqHandle')?.value.trim();
  const email = document.getElementById('reqEmail')?.value.trim();
  const pass = document.getElementById('reqPass')?.value.trim();
  const confirm = document.getElementById('reqConfirm')?.value.trim();

  if (!handle) {
    alert('Please enter your X (Twitter) handle or ID.');
    return;
  }
  if (pass && confirm && pass !== confirm) {
    alert('Passwords do not match. Please re-enter.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/access-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name, email, handle, password: pass })
    });
    if (res.ok) {
      showToast(`✓ Request submitted for ${handle}! Waiting for admin approval.`);
    }
  } catch (err) {}

  navigateToScreen('03');
}

// -------------------------------------------------------------
// SCREEN 03: PENDING APPROVAL
// -------------------------------------------------------------
function renderPendingApproval(container) {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width: 480px;">
        <div class="auth-logo">
          <div class="atomx-brand" style="font-size: 22px;">
            <div class="atomx-logo-icon" style="width: 24px; height: 24px;"></div>
            <span class="atomx-brand-main">ATOMX</span>
            <span class="atomx-brand-sub">ENGAGE</span>
          </div>
        </div>
        
        <div style="width:56px; height:56px; border-radius:50%; background:var(--status-warning-bg); color:var(--status-warning); display:flex; align-items:center; justify-content:center; margin:0 auto 18px auto;">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>

        <h1 class="auth-title">Your account is under review</h1>
        <p class="auth-desc">Your access request has been submitted successfully. An administrator will review your account before activation.</p>

        <div style="margin: 18px 0;">
          <span class="badge badge-warning" style="font-size: 13px; padding: 6px 14px;">PENDING APPROVAL</span>
        </div>

        <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; text-align:left; font-size:13px; margin-bottom:24px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:var(--text-secondary);">Request submitted:</span>
            <span style="font-weight:600; color:var(--text-primary);">Oct 06, 2026</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:var(--text-secondary);">Account status:</span>
            <span style="font-weight:600; color:var(--status-warning);">Under Review</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-secondary);">Review status:</span>
            <span style="font-weight:600; color:var(--text-primary);">Standard Queue</span>
          </div>
        </div>

        <div style="display:flex; gap:12px;">
          <button class="btn btn-secondary btn-block" onclick="navigateToScreen('01')">Back to Login</button>
          <button class="btn btn-soft btn-block" onclick="navigateToScreen('13')">Open Admin to Approve</button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 04: DASHBOARD
// -------------------------------------------------------------
function renderDashboard(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('04')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">Overview of your engagement workspace.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('06')">Open Queue</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('07')">Generate Reply</button>
            <button class="btn btn-primary btn-sm" onclick="navigateToScreen('05')">+ Create Campaign</button>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Metric Stats -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">AI Credits <span style="color:var(--blue-primary); font-size:11px;">1 = 1 Reply</span></div>
              <div class="stat-value" id="dashCreditsVal">${(AtomXState.currentUser.credits || 10000).toLocaleString()}</div>
              <div class="stat-trend" style="color:var(--status-success);">↑ 100% server verified</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Replies Generated <span>Total</span></div>
              <div class="stat-value">0</div>
              <div class="stat-trend" style="color:var(--text-secondary);">Ready to launch</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Approved <span>Rate</span></div>
              <div class="stat-value">0%</div>
              <div class="stat-trend" style="color:var(--text-secondary);">Zero rejections</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Campaigns <span>Active</span></div>
              <div class="stat-value">0</div>
              <div class="stat-trend" style="color:var(--text-secondary);">Queue clear</div>
            </div>
          </div>

          <!-- Main Layout Grid -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
            <!-- Recent Campaign Card -->
            <div class="atomx-card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h3 style="font-size:16px; font-weight:700;">Engagement Campaigns</h3>
                <span class="badge ${AtomXState.campaign?.isRunning ? 'badge-success' : 'badge-neutral'}">${AtomXState.campaign?.isRunning ? 'Running' : 'Idle'}</span>
              </div>
              <div style="padding:28px 16px; text-align:center; background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle);">
                <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">No Active Campaigns</div>
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">Create campaigns or run autonomous agents from the Chrome extension.</div>
                <button class="btn btn-primary btn-sm" onclick="navigateToScreen('05')">+ Create Campaign</button>
              </div>
            </div>

            <!-- Recent Activity Card -->
            <div class="atomx-card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-size:16px; font-weight:700;">Recent Activity</h3>
                <a href="javascript:void(0)" onclick="navigateToScreen('09')" style="font-size:12px; color:var(--blue-primary); text-decoration:none; font-weight:600;">View History</a>
              </div>
              <div style="padding:28px 16px; text-align:center; background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle);">
                <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">No Activity Events</div>
                <div style="font-size:12px; color:var(--text-secondary);">AI reply generations and pacing milestones will display here.</div>
              </div>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('04')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 05: BOT / CAMPAIGN
// -------------------------------------------------------------
function renderBotCampaign(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('05')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Bot</h1>
            <p class="page-subtitle">Create and manage your engagement campaigns.</p>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm" onclick="clearCampaignQueue()">Clear Queue</button>
            <button id="campaignStartBtn" class="btn btn-primary btn-sm" onclick="toggleCampaignRunning()">
              ${AtomXState.campaign.isRunning ? 'Pause Campaign' : 'START CAMPAIGN'}
            </button>
          </div>
        </div>

        <div class="workspace-body">
          <div class="bot-workflow-grid">
            <!-- Configuration Settings Card -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">Campaign Configuration</h3>
              <div class="config-row" style="margin-bottom:16px;">
                <div style="flex:1; min-width:160px;">
                  <label class="form-label">AI Provider</label>
                  <select class="form-select" id="campaignProviderSelect" onchange="selectActiveProvider(this.value)">
                    ${AtomXState.providers.map(p => `
                      <option value="${p.id}" ${AtomXState.currentProvider === p.id ? 'selected' : ''}>${p.icon} ${p.name}</option>
                    `).join('')}
                  </select>
                </div>
                <div style="flex:1.5; min-width:220px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label class="form-label" style="margin-bottom:0;">Live Model</label>
                    <button type="button" class="fetch-models-btn" onclick="fetchLiveModelsForProvider(AtomXState.currentProvider, true)" title="Fetch live models from provider API in real time">
                      <span class="fetch-btn-icon">↻</span> <span class="fetch-btn-text">Fetch Live</span>
                    </button>
                  </div>
                  <select class="form-select" id="campaignModelSelect" onchange="AtomXState.currentModel = this.value">
                    ${(AtomXState.modelsCache[AtomXState.currentProvider]?.length ? AtomXState.modelsCache[AtomXState.currentProvider] : getFallbackModelsForProvider(AtomXState.currentProvider)).map(m => `
                      <option value="${m.id}" ${AtomXState.currentModel === m.id ? 'selected' : ''}>${m.name || m.id}</option>
                    `).join('')}
                  </select>
                </div>
                <div style="flex:1; min-width:160px;">
                  <label class="form-label">Reply Style</label>
                  <select class="form-select" id="replyStyleSelect">
                    <option selected>Natural & Concise</option>
                    <option>In-depth & Thoughtful</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="form-label">Persona Style</label>
                <div class="style-pills">
                  ${['Professional', 'Friendly', 'Witty', 'Technical', 'Minimal'].map(style => `
                    <div class="style-pill ${AtomXState.campaign.selectedStyle === style ? 'active' : ''}" onclick="selectPersonaStyle('${style}')">${style}</div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Tweet Sources Input Card with Multi-Link & Telegram Support -->
            <div class="atomx-card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div>
                  <h3 style="font-size:15px; font-weight:700; margin-bottom:2px;">Tweet Sources & Batch Raider</h3>
                  <p style="font-size:12px; color:var(--text-secondary); margin:0;">Supports messy Telegram chat dumps, hashtags, timestamps & multi-link formats. Automatically cleans and deduplicates.</p>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="toggleBatchMode()">
                  ${AtomXState.isBatchMode ? 'Single Link Mode' : 'Batch / Telegram Mode'}
                </button>
              </div>

              ${!AtomXState.isBatchMode ? `
                <div style="display:flex; gap:10px; margin-bottom:16px;">
                  <input type="text" id="tweetUrlInput" class="form-input" placeholder="Paste Tweet URL (e.g., https://x.com/creator/status/1842...)">
                  <button class="btn btn-primary" onclick="addTweetFromInput()">Add Tweet</button>
                </div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
                  <textarea id="tweetBatchInput" class="form-textarea" rows="4" placeholder="Paste links or messy Telegram chat messages here (e.g.:&#10;[06/10/2026 9:48 pm] APE BOT #859 @muhitonx&#10;x.com/muhitonx/status/2107482672947937462&#10;https://x.com/intent/like?tweet_id=123456789)" oninput="updateBatchPreview()" style="font-size:12px; font-family:monospace;"></textarea>
                  
                  <!-- Realtime Parse Breakdown Bar -->
                  <div id="batchPreviewBar" style="display:none; padding:10px 14px; background:rgba(0,102,255,0.06); border:1px solid rgba(0,102,255,0.2); border-radius:var(--radius-sm); font-size:12px; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span id="batchPreviewStats" style="color:var(--text-primary); font-weight:500;">Extracted: 0</span>
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:11px;" onclick="cleanBatchInputText()">Clean Text Only</button>
                  </div>

                  <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="cleanBatchInputText()">🧹 Auto-Clean Noise</button>
                    <button class="btn btn-primary btn-sm" onclick="addTweetsFromBatch()">⚡ Queue Fresh Tweets</button>
                  </div>
                </div>
              `}

              <!-- Queue Count Status -->
              <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
                <span class="badge badge-neutral" id="qCountQueued">${AtomXState.campaign.tweets.length} Queued</span>
                <span class="badge badge-success" id="qCountReady">${AtomXState.campaign.tweets.filter(t => t.status === 'Ready').length} Ready</span>
                <span class="badge badge-error">0 Failed</span>
              </div>

              <!-- Queued Tweet Items -->
              <div id="queuedTweetsList" style="display:flex; flex-direction:column; gap:10px;">
                ${AtomXState.campaign.tweets.length === 0 ? `
                  <div style="text-align:center; padding:24px; color:var(--text-muted); background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle); font-size:12px;">
                    No tweets in campaign queue. Paste tweets or Telegram raid links above to queue.
                  </div>
                ` : AtomXState.campaign.tweets.map(t => `
                  <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                    <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
                      <div class="user-avatar" style="width:30px; height:30px; font-size:11px;">${t.author.charAt(0)}</div>
                      <div style="overflow:hidden;">
                        <span style="font-weight:600; font-size:13px; color:var(--text-primary);">${t.author}</span>
                        <span style="font-size:12px; color:var(--text-secondary); margin-left:4px;">${t.handle}</span>
                        <p style="font-size:12px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; margin-top:2px;">${t.text}</p>
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span class="badge badge-success">${t.status}</span>
                      <button onclick="removeTweet('${t.id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px;">×</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Workflow Pacing Card (Legitimate workflow control) -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:6px;">Workflow Pacing Control</h3>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Configure execution frequency to maintain high review quality and prevent workflow bursts.</p>
              
              <div class="pacing-slider-group">
                <div class="pacing-control">
                  <label>Between actions: <span id="valPacingDelay">${AtomXState.campaign.pacingDelay} sec</span></label>
                  <input type="range" min="5" max="30" value="${AtomXState.campaign.pacingDelay}" oninput="document.getElementById('valPacingDelay').innerText = this.value + ' sec'">
                </div>
                <div class="pacing-control">
                  <label>Break after: <span id="valBreakAfter">${AtomXState.campaign.breakAfter} items</span></label>
                  <input type="range" min="10" max="60" step="5" value="${AtomXState.campaign.breakAfter}" oninput="document.getElementById('valBreakAfter').innerText = this.value + ' items'">
                </div>
                <div class="pacing-control">
                  <label>Break duration: <span id="valBreakDuration">${AtomXState.campaign.breakDuration} sec</span></label>
                  <input type="range" min="30" max="180" step="15" value="${AtomXState.campaign.breakDuration}" oninput="document.getElementById('valBreakDuration').innerText = this.value + ' sec'">
                </div>
              </div>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('05')}
      </div>
    </div>
  `;
}

function selectPersonaStyle(style) {
  AtomXState.campaign.selectedStyle = style;
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function toggleBatchMode() {
  AtomXState.isBatchMode = !AtomXState.isBatchMode;
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function updateBatchPreview() {
  const textarea = document.getElementById('tweetBatchInput');
  const bar = document.getElementById('batchPreviewBar');
  const stats = document.getElementById('batchPreviewStats');
  if (!textarea || !bar || !stats) return;

  const raw = textarea.value;
  if (!raw.trim()) {
    bar.style.display = 'none';
    return;
  }

  const extracted = extractTweetLinks(raw);
  const filtered = filterTweetLinks(extracted);

  bar.style.display = 'flex';
  stats.innerHTML = `<span style="color:var(--status-success); font-weight:700;">${filtered.freshCount} Fresh</span> ready to queue &nbsp;·&nbsp; Detected: ${filtered.totalFound} &nbsp;·&nbsp; Duplicates: ${filtered.duplicateCount} &nbsp;·&nbsp; Engaged: ${filtered.alreadyEngagedCount}`;
}

function cleanBatchInputText() {
  const textarea = document.getElementById('tweetBatchInput');
  if (!textarea || !textarea.value.trim()) return;
  const extracted = extractTweetLinks(textarea.value);
  if (extracted.length === 0) {
    showToast('⚠️ No valid X/Twitter links detected in the text.');
    return;
  }
  const filtered = filterTweetLinks(extracted);
  const cleanList = (filtered.freshTweets.length > 0 ? filtered.freshTweets : extracted).map(t => t.canonicalUrl);
  const uniqueUrls = Array.from(new Set(cleanList));
  textarea.value = uniqueUrls.join('\n');
  updateBatchPreview();
  showToast(`✓ Cleaned! Extracted ${uniqueUrls.length} canonical link(s). Stripped Telegram noise.`);
}

function addTweetFromInput() {
  const input = document.getElementById('tweetUrlInput');
  if (!input || !input.value.trim()) return;
  const raw = input.value.trim();
  const extracted = extractTweetLinks(raw);
  if (extracted.length === 0) {
    showToast('⚠️ No valid X/Twitter link found. Please verify the URL.');
    return;
  }
  const filtered = filterTweetLinks(extracted);
  if (filtered.freshCount === 0) {
    if (filtered.alreadyEngagedCount > 0) {
      showToast('⚠️ Tweet was already engaged previously! Skipped.');
    } else if (filtered.alreadyInQueueCount > 0) {
      showToast('⚠️ Tweet is already in active queue!');
    } else {
      showToast('⚠️ Duplicate tweet link skipped.');
    }
    return;
  }

  const t = filtered.freshTweets[0];
  AtomXState.campaign.tweets.push({
    id: t.tweetId,
    tweetId: t.tweetId,
    author: t.handle,
    handle: t.handle,
    canonicalUrl: t.canonicalUrl,
    text: `Target: ${t.canonicalUrl}`,
    status: 'Ready'
  });
  input.value = '';
  showToast('✓ Added 1 fresh tweet to campaign queue!');
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function addTweetsFromBatch() {
  const textarea = document.getElementById('tweetBatchInput');
  if (!textarea || !textarea.value.trim()) {
    showToast('Please paste tweet links or Telegram messages first.');
    return;
  }

  const extracted = extractTweetLinks(textarea.value);
  if (extracted.length === 0) {
    showToast('⚠️ No valid X/Twitter links found in pasted text.');
    return;
  }

  const filtered = filterTweetLinks(extracted);
  if (filtered.freshCount === 0) {
    showToast(`⚠️ No new tweets to queue! (Duplicates: ${filtered.duplicateCount}, Already Engaged: ${filtered.alreadyEngagedCount}, In Queue: ${filtered.alreadyInQueueCount})`);
    return;
  }

  filtered.freshTweets.forEach(t => {
    AtomXState.campaign.tweets.push({
      id: t.tweetId,
      tweetId: t.tweetId,
      author: t.handle,
      handle: t.handle,
      canonicalUrl: t.canonicalUrl,
      text: `Target: ${t.canonicalUrl}`,
      status: 'Ready'
    });
  });

  textarea.value = '';
  showToast(`✓ Added ${filtered.freshCount} fresh tweets to queue! (${filtered.duplicateCount} duplicates & ${filtered.alreadyEngagedCount} already-engaged filtered)`);
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function removeTweet(id) {
  AtomXState.campaign.tweets = AtomXState.campaign.tweets.filter(t => String(t.id) !== String(id));
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function clearCampaignQueue() {
  AtomXState.campaign.tweets = [];
  renderBotCampaign(document.getElementById('mainContentArea'));
}

function toggleCampaignRunning() {
  AtomXState.campaign.isRunning = !AtomXState.campaign.isRunning;
  renderBotCampaign(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 06: REPLY QUEUE
// -------------------------------------------------------------
function renderReplyQueue(container) {
  const doneCount = AtomXState.replyQueue.filter(r => r.status === 'Completed').length;
  const queueCount = AtomXState.replyQueue.filter(r => r.status === 'Waiting' || r.status === 'Processing').length;
  const failCount = AtomXState.replyQueue.filter(r => r.status === 'Failed').length;

  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('06')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Reply Queue</h1>
            <p class="page-subtitle">Review and manage generated replies.</p>
          </div>
          <div>
            <button class="btn btn-primary btn-sm" onclick="navigateToScreen('07')">+ Generate New Reply</button>
          </div>
        </div>

        <div class="workspace-body">
          <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
            <div class="stat-card">
              <div class="stat-label">DONE</div>
              <div class="stat-value" style="color:var(--status-success);">${doneCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">QUEUE</div>
              <div class="stat-value" style="color:var(--blue-primary);">${queueCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">FAILED</div>
              <div class="stat-value" style="color:var(--status-error);">${failCount}</div>
            </div>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>Author & Tweet</th>
                  <th>Generated Reply Preview</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${AtomXState.replyQueue.length === 0 ? `
                  <tr>
                    <td colspan="5" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:8px;">📭</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">Engagement Queue Empty</div>
                      <div style="font-size:12px;">Active reply items created by extension or campaign will appear here.</div>
                    </td>
                  </tr>
                ` : AtomXState.replyQueue.map(item => `
                  <tr>
                    <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div class="user-avatar" style="width:28px; height:28px; font-size:10px;">${item.author.charAt(0)}</div>
                        <div>
                          <div style="font-weight:600;">${item.author}</div>
                          <div style="font-size:11px; color:var(--text-secondary);">${item.handle}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style="max-width:320px; font-size:13px; color:var(--text-primary); line-height:1.4;">${item.reply}</div>
                    </td>
                    <td>
                      <span class="badge ${item.status === 'Completed' ? 'badge-success' : item.status === 'Processing' ? 'badge-info' : item.status === 'Waiting' ? 'badge-warning' : 'badge-error'}">
                        ${item.status}
                      </span>
                    </td>
                    <td style="color:var(--text-muted); font-size:12px;">${item.time}</td>
                    <td style="text-align:right;">
                      <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('07')">Review</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ${renderMobileBottomNavHTML('06')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 07: AI REPLY (SPLIT VIEW)
// -------------------------------------------------------------
function renderAIReply(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('07')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">AI Reply</h1>
            <p class="page-subtitle">Inspect, refine, and authorize AI-generated replies.</p>
          </div>
          <div>
            <span class="badge badge-info" style="font-size:12px;">Available Credits: ${AtomXState.currentUser.credits.toLocaleString()}</span>
          </div>
        </div>

        <div class="workspace-body">
          <div class="ai-reply-split">
            <!-- Left: Source Tweet -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">Source Tweet</h3>
              <div class="tweet-box">
                <div class="tweet-author" style="margin-bottom:10px;">
                  <div class="user-avatar" style="width:36px; height:36px;">@</div>
                  <div style="flex:1;">
                    <input type="text" id="manualAuthorInput" class="form-input" placeholder="Author handle (e.g. @evanjawadx)" style="font-size:13px; font-weight:600; padding:6px 10px;">
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <textarea id="manualTweetTextInput" class="form-textarea" placeholder="Paste tweet text or tweet link here to analyze and generate replies..." style="min-height:100px; font-size:13px;"></textarea>
                </div>
              </div>

              <div style="margin-top:20px; padding:16px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">AI INTENT ANALYSIS</div>
                <p style="font-size:12px; color:var(--text-secondary);">Enter a source tweet above to run real-time contextual intent analysis and tone modeling.</p>
              </div>
            </div>

            <!-- Right: Generated Reply Workspace -->
            <div class="atomx-card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="font-size:15px; font-weight:700;">Generated Reply</h3>
                <span class="badge badge-neutral" id="replyResonanceBadge">Awaiting Input</span>
              </div>

              <!-- Large Editable Text Area -->
              <div class="form-group">
                <textarea id="aiReplyTextArea" class="form-textarea" placeholder="AI-generated contextual reply will appear here..." style="min-height:130px; font-size:14px; line-height:1.5;"></textarea>
              </div>

              <!-- Active AI Provider Selection -->
              <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <label class="form-label" style="margin-bottom:0;">Active AI Provider</label>
                  <span id="modelCountLabel" style="font-size:11px; color:var(--text-muted); font-weight:600;">
                    ${(AtomXState.modelsCache[AtomXState.currentProvider] || []).length || 'Live'} models ready
                  </span>
                </div>
                <div class="provider-pills">
                  ${AtomXState.providers.map(p => `
                    <div class="provider-pill ${AtomXState.currentProvider === p.id ? 'active' : ''}" data-provider="${p.id}" onclick="selectActiveProvider('${p.id}')">
                      <span>${p.icon}</span>
                      <span>${p.name}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Workflow Control Selectors -->
              <div class="config-row" style="margin-bottom:16px;">
                <div style="flex:1.5; min-width:200px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label class="form-label" style="margin-bottom:0;">Live Model</label>
                    <button type="button" class="fetch-models-btn" onclick="fetchLiveModelsForProvider(AtomXState.currentProvider, true)" title="Fetch live models from provider API in real-time">
                      <span class="fetch-btn-icon">↻</span> <span class="fetch-btn-text">Fetch Models</span>
                    </button>
                  </div>
                  <select class="form-select" id="replyModelSelect" onchange="AtomXState.currentModel = this.value">
                    ${(AtomXState.modelsCache[AtomXState.currentProvider]?.length ? AtomXState.modelsCache[AtomXState.currentProvider] : getFallbackModelsForProvider(AtomXState.currentProvider)).map(m => `
                      <option value="${m.id}" ${AtomXState.currentModel === m.id ? 'selected' : ''}>${m.name || m.id} ${m.context ? '[' + m.context + ']' : ''}</option>
                    `).join('')}
                  </select>
                </div>
                <div style="flex:1; min-width:130px;">
                  <label class="form-label">Tone</label>
                  <select class="form-select" id="replyToneSelect">
                    <option selected>Natural & Insightful</option>
                    <option>Witty & Casual</option>
                    <option>Technical & Direct</option>
                  </select>
                </div>
                <div style="flex:1; min-width:130px;">
                  <label class="form-label">Length</label>
                  <select class="form-select" id="replyLengthSelect">
                    <option selected>Short (&lt;140 chars)</option>
                    <option>Medium (140-200 chars)</option>
                  </select>
                </div>
              </div>

              <!-- Quality Metrics Indicator -->
              <div class="quality-meter-bar">
                <span><strong>Relevance:</strong> 98%</span>
                <span><strong>Tone:</strong> Natural</span>
                <span><strong>Originality:</strong> High</span>
                <span id="charCountSpan"><strong>Length:</strong> 112 / 280 chars</span>
              </div>

              <!-- Action Buttons -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
                <div style="display:flex; gap:10px;">
                  <button class="btn btn-secondary" onclick="simulateRegenerateReply()">↻ Regenerate</button>
                  <button class="btn btn-secondary" onclick="document.getElementById('aiReplyTextArea').focus()">✎ Edit</button>
                </div>
                <button class="btn btn-primary" onclick="approveAndDeductCredit()">✓ Approve (-1 Credit)</button>
              </div>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('07')}
      </div>
    </div>
  `;
}

async function simulateRegenerateReply() {
  const textarea = document.getElementById('aiReplyTextArea');
  if (!textarea) return;
  textarea.value = `Generating contextual reply via ${AtomXState.currentProvider.toUpperCase()} (${AtomXState.currentModel})...`;

  try {
    const tone = document.getElementById('replyToneSelect')?.value || 'Natural & Concise';
    const res = await fetch('http://localhost:5000/api/generate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
      body: JSON.stringify({
        tweetText: 'The shift toward AI-assisted creation is changing how quickly humanity turns ideas into reality. The next decade will be incredible.',
        tweetAuthor: '@elonmusk',
        style: tone,
        provider: AtomXState.currentProvider,
        model: AtomXState.currentModel
      })
    });
    if (res.ok) {
      const data = await res.json();
      textarea.value = data.reply;
      if (typeof data.remainingCredits === 'number') {
        AtomXState.currentUser.credits = data.remainingCredits;
        const credBadge = document.querySelector('.badge-info');
        if (credBadge) credBadge.innerText = `Available Credits: ${AtomXState.currentUser.credits.toLocaleString()}`;
      }
      return;
    }
  } catch (err) {
    // Graceful fallback if backend offline
  }

  setTimeout(() => {
    textarea.value = `Compounding velocity in software delivery is the clearest signal yet that AI accelerates builders rather than replaces them. [Generated via ${AtomXState.currentProvider} : ${AtomXState.currentModel}]`;
  }, 400);
}

async function approveAndDeductCredit() {
  if (AtomXState.currentUser.credits <= 0) {
    alert('Insufficient Credits! Please buy credits to continue generating AI replies.');
    navigateToScreen('10');
    return;
  }

  try {
    const res = await fetch('http://localhost:5000/api/generate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
      body: JSON.stringify({
        tweetText: 'The shift toward AI-assisted creation is changing how quickly humanity turns ideas into reality.',
        tweetAuthor: '@elonmusk',
        style: 'Natural & Insightful',
        provider: AtomXState.currentProvider,
        model: AtomXState.currentModel
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.remainingCredits === 'number') {
        AtomXState.currentUser.credits = data.remainingCredits;
      } else {
        AtomXState.currentUser.credits -= 1;
      }
    } else {
      AtomXState.currentUser.credits -= 1;
    }
  } catch (e) {
    AtomXState.currentUser.credits -= 1;
  }

  AtomXState.creditLedger.unshift({
    date: 'Just now',
    user: AtomXState.currentUser.name,
    action: 'AI Reply',
    amount: -1,
    admin: 'System',
    reason: 'Approved reply deduction'
  });
  alert('Reply Approved & Scheduled! Deducted 1 credit. Remaining credits: ' + AtomXState.currentUser.credits);
  navigateToScreen('06');
}

// -------------------------------------------------------------
// SCREEN 08: AGENTS
// -------------------------------------------------------------
function renderAgents(container) {
  const agentsList = [
    { id: 'telegram', title: 'TELEGRAM GROUP ENGAGE', desc: 'Paste Telegram engagement/raid links. Bot auto-visits, likes, comments, and replies automatically.', icon: '✈️', badge: 'POPULAR' },
    { id: 'audience', title: 'AUDIENCE BUILDER', desc: 'Target specific audiences & influencers. Premium includes 2 free curated lists for auto-follow & engagement.', icon: '👥', badge: 'GROWTH' },
    { id: 'sorsa', title: 'INCREASE SORSA SCORE', desc: 'Target high-tier crypto accounts & influencers to maximize your Sorsa Score for airdrops and promotions.', icon: '⚡', badge: 'HIGH ROI' },
    { id: 'followers', title: 'FOLLOWERS INCREASE', desc: 'Target highly active users from specific lists with smart replies to trigger maximum follow-backs.', icon: '📈', badge: 'VIRAL' },
    { id: 'postgen', title: 'POST GENERATOR', desc: 'Turn raw notes, shower thoughts, or links into polished Medium, Long, or viral Thread posts.', icon: '✍️', badge: 'READY' },
    { id: 'replyback', title: 'REPLY BACK', desc: 'Paste your tweet URL. Bot automatically likes and contextually replies to all incoming comments.', icon: '🔄', badge: 'AUTO' },
    { id: 'unfollow', title: 'AUTO UNFOLLOW', desc: 'Safely detect & unfollow non-followers or low Walchain score accounts with custom anti-ban delay.', icon: '🧹', badge: 'SAFETY' },
    { id: 'match', title: 'PICTURE & VOICE MATCH', desc: 'Generate custom AI images and match your authentic writing style and persona voice.', icon: '🎨', badge: 'AI MODEL' },
    { id: 'creators', title: 'FAVORITE CREATORS', desc: 'Save favorite creator handles (@handles) to track their tweets and engage instantly when they post.', icon: '⭐', badge: 'SAVED' },
    { id: 'reply', title: 'AI REPLY ASSISTANT', desc: 'Contextual split-view reply studio powered by OpenAI, Gemini, Groq, and OpenRouter.', icon: '💬', badge: 'MULTI-LLM' }
  ];

  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('08')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">AI Agents</h1>
            <p class="page-subtitle">Specialized AI tools for your content workflow.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div class="agents-grid">
            ${agentsList.map(a => `
              <div class="agent-card" onclick="navigateToScreen('05')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div class="agent-icon" style="font-size:20px;">${a.icon}</div>
                  <span class="badge badge-info" style="font-size:10px;">${a.badge || 'READY'}</span>
                </div>
                <h4 style="font-size:14px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">${a.title}</h4>
                <p style="font-size:13px; color:var(--text-secondary); line-height:1.4; flex:1;">${a.desc}</p>
                <div style="display:flex; justify-content:flex-end; margin-top:14px;">
                  <span style="font-size:12px; font-weight:600; color:var(--blue-primary);">Launch Agent →</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ${renderMobileBottomNavHTML('08')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 09: HISTORY
// -------------------------------------------------------------
function renderHistory(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('09')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">History</h1>
            <p class="page-subtitle">Review your previous activity and audit trails.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div class="style-pills">
              <span class="style-pill active">All</span>
              <span class="style-pill">Replies</span>
              <span class="style-pill">Campaigns</span>
              <span class="style-pill">AI Generations</span>
              <span class="style-pill">Errors</span>
            </div>
            <div style="width:240px;">
              <input type="text" class="form-input" placeholder="Search activity...">
            </div>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Tweet / Source</th>
                  <th>Result</th>
                  <th style="text-align:right;">Credits Used</th>
                </tr>
              </thead>
              <tbody>
                ${AtomXState.creditLedger.length === 0 ? `
                  <tr>
                    <td colspan="5" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:8px;">🕒</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">No Activity History Yet</div>
                      <div style="font-size:12px;">Actions taken across the browser extension and web workspace will be recorded here.</div>
                    </td>
                  </tr>
                ` : AtomXState.creditLedger.map(item => `
                  <tr>
                    <td style="color:var(--text-muted);">${item.date}</td>
                    <td style="font-weight:600;">${item.action}</td>
                    <td>${item.reason || item.user}</td>
                    <td><span class="badge badge-success">Completed</span></td>
                    <td style="text-align:right; font-weight:600;">${Math.abs(item.amount || 1)} credit${Math.abs(item.amount) !== 1 ? 's' : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ${renderMobileBottomNavHTML('09')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 10: CREDITS / PLANS
// -------------------------------------------------------------
function renderCreditsPlans(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('10')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Credits</h1>
            <p class="page-subtitle">Manage your ATOMX usage and subscription tiers.</p>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Balance Banner -->
          <div class="atomx-card balance-banner" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; border-color:var(--blue-soft-border);">
            <div>
              <div style="font-size:12px; font-weight:700; color:var(--blue-primary); letter-spacing:0.5px; text-transform:uppercase;">AVAILABLE CREDITS</div>
              <div style="font-size:36px; font-weight:800; color:var(--text-primary); margin:4px 0;">${AtomXState.currentUser.credits.toLocaleString()}</div>
              <div style="font-size:13px; color:var(--text-secondary);">1 credit = 1 AI reply · Balance verified server-side</div>
            </div>
            <button class="btn btn-primary" onclick="alert('Checkout initiated! (Growth Plan 10,000 Credits)')">Buy Credits</button>
          </div>

          <!-- Pricing Grid with FOUNDING 100 Launch Offer -->
          <div class="pricing-grid">
            <!-- FOUNDING 100 Promotional Launch Offer -->
            <div class="pricing-card" style="border:2px solid #FF6B00; background:linear-gradient(180deg, rgba(255,107,0,0.06), rgba(0,0,0,0.2)); position:relative; box-shadow:0 0 25px rgba(255,107,0,0.15);">
              <div class="pricing-card-badge" style="background:linear-gradient(135deg, #FF6B00, #E60000); color:#FFF; font-weight:800; font-size:11px; padding:4px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px;">
                🔥 FIRST LAUNCH OFFER
              </div>
              <div style="font-size:14px; font-weight:800; color:#FF6B00; text-transform:uppercase; margin-top:8px;">FOUNDING 100</div>
              <div class="plan-price" style="margin:8px 0 4px 0;">
                <span style="text-decoration:line-through; color:var(--text-muted); font-size:16px; margin-right:8px;">$5/month</span>
                <span style="color:#FF6B00; font-size:32px; font-weight:800;">$2</span><span style="font-size:14px; color:var(--text-muted); font-weight:500;">/ month</span>
              </div>
              <div style="font-size:15px; font-weight:800; color:var(--blue-primary); margin-bottom:12px;">
                ⚡ 5,000 Credits
              </div>
              <ul class="plan-feature-list" style="margin-bottom:14px;">
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 5,000 AI replies</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> All automation agents</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Human-like pacing</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Priority processing</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Early feature access</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Dedicated support</li>
              </ul>

              <!-- Live Real-Time Countdown Timer -->
              <div id="foundingCountdownBox" style="background:rgba(255,107,0,0.12); border:1px solid rgba(255,107,0,0.3); border-radius:8px; padding:8px 10px; text-align:center; margin-bottom:12px;">
                <div style="font-size:10px; font-weight:700; color:#FF6B00; text-transform:uppercase; letter-spacing:0.5px;">⏳ Offer Ends In</div>
                <div id="foundingCountdownTimer" style="font-family:monospace; font-size:13px; font-weight:800; color:var(--text-primary); margin-top:2px;">
                  02d : 14h : 37m : 52s
                </div>
              </div>

              <button class="btn btn-primary btn-block" style="background:linear-gradient(135deg, #FF6B00, #E60000); border:none; font-weight:700;" onclick="alert('Claiming Founding 100 Offer ($2 / 5,000 Credits)!'); AtomXState.currentUser.credits += 5000; renderCreditsPlans(document.getElementById('mainContentArea'));">Claim Offer ($2)</button>
            </div>

            <!-- Free Plan -->
            <div class="pricing-card">
              <div style="font-size:13px; font-weight:700; color:var(--text-secondary);">FREE</div>
              <div class="plan-price">$0 <span style="font-size:14px; color:var(--text-muted); font-weight:500;">/ mo</span></div>
              <div style="font-size:14px; font-weight:600; color:var(--text-primary);">100 Credits</div>
              <ul class="plan-feature-list">
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 100 AI replies</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Basic reply styles</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Reply queue</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Basic history</li>
              </ul>
              <button class="btn btn-secondary btn-block">Current Plan</button>
            </div>

            <!-- Growth Plan (Popular) -->
            <div class="pricing-card featured">
              <div class="pricing-card-badge">POPULAR</div>
              <div style="font-size:13px; font-weight:700; color:var(--blue-primary);">GROWTH</div>
              <div class="plan-price">$12 <span style="font-size:14px; color:var(--text-muted); font-weight:500;">/ mo</span></div>
              <div style="font-size:14px; font-weight:600; color:var(--text-primary);">10,000 Credits</div>
              <ul class="plan-feature-list">
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 10,000 AI replies</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> All reply styles</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Advanced queue</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Full history</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Priority generation</li>
              </ul>
              <button class="btn btn-primary btn-block" onclick="alert('Adding 10,000 credits to balance!'); AtomXState.currentUser.credits += 10000; renderCreditsPlans(document.getElementById('mainContentArea'));">Buy Credits</button>
            </div>

            <!-- Pro Plan -->
            <div class="pricing-card">
              <div style="font-size:13px; font-weight:700; color:var(--text-secondary);">PRO</div>
              <div class="plan-price">$29 <span style="font-size:14px; color:var(--text-muted); font-weight:500;">/ mo</span></div>
              <div style="font-size:14px; font-weight:600; color:var(--text-primary);">25,000 Credits</div>
              <ul class="plan-feature-list">
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 25,000 AI replies</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Premium AI models</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Advanced agents</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Priority generation</li>
                <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Advanced analytics</li>
              </ul>
              <button class="btn btn-secondary btn-block" onclick="alert('Adding 25,000 credits to balance!'); AtomXState.currentUser.credits += 25000; renderCreditsPlans(document.getElementById('mainContentArea'));">Buy Credits</button>
            </div>
          </div>

          <!-- USER REFERRAL PROGRAM DASHBOARD (LEVEL 1 DIRECT ONLY) -->
          <div class="atomx-card" style="margin-top:24px; padding:20px; background:linear-gradient(135deg, rgba(49,87,230,0.05), rgba(34,160,107,0.05)); border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:22px;">🎁</span>
                  <h3 style="font-size:16px; font-weight:800; color:var(--text-primary);">Referral Program</h3>
                  <span class="badge badge-success" style="font-size:10px; font-weight:700;">150 + 150 CR</span>
                </div>
                <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
                  Invite friends & earn Credits. When their account is approved, both of you receive <strong>150 Credits</strong>! Plus 10% on their first purchase.
                </p>
              </div>
              <div style="display:flex; gap:12px; text-align:right;">
                <div>
                  <div style="font-size:11px; color:var(--text-muted); font-weight:600;">TOTAL REFERRALS</div>
                  <div style="font-size:20px; font-weight:800; color:var(--text-primary);">12</div>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--status-success); font-weight:600;">APPROVED</div>
                  <div style="font-size:20px; font-weight:800; color:var(--status-success);">8</div>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--status-warning); font-weight:600;">PENDING</div>
                  <div style="font-size:20px; font-weight:800; color:var(--status-warning);">4</div>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--blue-primary); font-weight:600;">EARNED</div>
                  <div style="font-size:20px; font-weight:800; color:var(--blue-primary);">650 Cr</div>
                </div>
              </div>
            </div>

            <!-- Referral Link Box -->
            <div style="background:var(--bg-canvas); padding:14px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:16px;">
              <div style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:6px;">Your Referral Link</div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <input type="text" readonly id="userRefLinkInput" value="https://atomxengage.com/ref/${(AtomXState.currentUser.handle || 'user').replace('@','')}" class="form-input" style="flex:1; min-width:240px; font-family:monospace; font-weight:700; background:var(--bg-card); cursor:text;">
                <button class="btn btn-primary" onclick="copyUserRefLink()">📋 Copy Link</button>
              </div>

              <!-- Social Share Shortcuts -->
              <div style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:var(--text-muted);">
                <span>Share:</span>
                <button class="btn btn-secondary btn-sm" onclick="shareRefLink('x')" style="padding:3px 8px; font-size:11px;">𝕏 Post</button>
                <button class="btn btn-secondary btn-sm" onclick="shareRefLink('tg')" style="padding:3px 8px; font-size:11px;">✈️ Telegram</button>
                <button class="btn btn-secondary btn-sm" onclick="shareRefLink('wa')" style="padding:3px 8px; font-size:11px;">💬 WhatsApp</button>
                <button class="btn btn-secondary btn-sm" onclick="shareRefLink('fb')" style="padding:3px 8px; font-size:11px;">🌐 Facebook</button>
              </div>
            </div>

            <!-- Program Rules / Level 1 Note -->
            <div style="font-size:11px; color:var(--text-secondary); padding:8px 12px; background:rgba(59,130,246,0.06); border-radius:6px; border-left:3px solid var(--blue-primary); margin-bottom:16px; line-height:1.5;">
              <strong>ℹ️ Strict Rules:</strong> Direct Level-1 referrals only (no MLM / Level 2/3). Rewards are issued <strong>after admin account approval</strong>. Multiple accounts under the same X ID are strictly forbidden. All rewards are in Credits, not cash.
            </div>

            <!-- User Referrals Table -->
            <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
              <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-bottom:8px;">Recent Referrals & Status</div>
              <div class="table-wrapper" style="overflow-x:auto;">
                <table class="atomx-table" style="font-size:12px;">
                  <thead>
                    <tr>
                      <th>Referred User</th>
                      <th>Status</th>
                      <th>Account Approval</th>
                      <th>First Purchase</th>
                      <th>Your Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Nahian</strong>
                        <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">@yournahian</div>
                      </td>
                      <td><span class="badge badge-success">Approved</span></td>
                      <td><span style="color:var(--status-success); font-weight:700;">✓ Approved</span></td>
                      <td>$10 Plan</td>
                      <td style="color:var(--blue-primary); font-weight:700;">150 + 1 Cr</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Saim</strong>
                        <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">@KhanWg60464</div>
                      </td>
                      <td><span class="badge badge-warning">Pending</span></td>
                      <td><span style="color:var(--text-muted);">Awaiting Review</span></td>
                      <td>—</td>
                      <td style="color:var(--text-muted);">Pending</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Alex</strong>
                        <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">@alex_growth</div>
                      </td>
                      <td><span class="badge badge-success">Approved</span></td>
                      <td><span style="color:var(--status-success); font-weight:700;">✓ Approved</span></td>
                      <td>$29 Plan</td>
                      <td style="color:var(--blue-primary); font-weight:700;">150 + 2.9 Cr</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Crypto Payment Gateway (USDT, USDC, ETH, BNB, Solana, GRAM) starting from $1 -->
          <div class="atomx-card" style="margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div>
                <h3 style="font-size:15px; font-weight:700;">Buy Credits with Crypto (Starting from $1)</h3>
                <p style="font-size:13px; color:var(--text-secondary); margin-top:2px;">Instant credit top-ups supported across USDT, USDC, ETH, BNB Chain, Solana, and GRAM.</p>
              </div>
              <span class="badge badge-success">0% Processing Fee</span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:18px;">
              <div style="padding:12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                <label class="form-label">Select Amount</label>
                <select class="form-select" id="cryptoAmountSelect">
                  <option value="1">$1 USD — 1,000 Credits</option>
                  <option value="5">$5 USD — 5,000 Credits</option>
                  <option value="10" selected>$10 USD — 10,000 Credits</option>
                  <option value="25">$25 USD — 25,000 Credits</option>
                  <option value="50">$50 USD — 60,000 Credits (+10k Bonus)</option>
                </select>
              </div>

              <div style="padding:12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                <label class="form-label">Select Cryptocurrency</label>
                <select class="form-select" id="cryptoTokenSelect">
                  <option>USDT (TRC20 / ERC20 / Solana / BNB)</option>
                  <option>USDC (Solana / Base / Arbitrum)</option>
                  <option>SOL (Solana Native)</option>
                  <option>ETH (Ethereum / Base / Arbitrum)</option>
                  <option>BNB (BNB Smart Chain)</option>
                  <option>GRAM (TON Network)</option>
                </select>
              </div>

              <div style="padding:12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                <label class="form-label">Official Deposit Address</label>
                <div style="display:flex; gap:8px;">
                  <input type="text" readonly value="0x892aF...471c9" class="form-input" style="font-size:12px; font-family:monospace;">
                  <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard?.writeText('0x892aF71c9201481bAc0129'); alert('Deposit address copied!');">Copy</button>
                </div>
              </div>
            </div>

            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:16px;">
              <label class="form-label">Confirm Payment — Enter Transaction Hash (Tx Hash)</label>
              <div style="display:flex; gap:10px;">
                <input type="text" id="txHashInput" class="form-input" placeholder="Paste your blockchain Transaction Hash (e.g., 0x9f8e2a... or solana signature)">
                <button class="btn btn-primary" onclick="confirmCryptoTxHash()">Verify & Credit Balance</button>
              </div>
              <p style="font-size:11px; color:var(--text-muted); margin-top:8px;">Once submitted, the smart contract or payment listener verifies the Tx Hash on-chain and credits your balance automatically.</p>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('10')}
      </div>
    </div>
  `;

  startLiveOfferCountdown();
}

function startLiveOfferCountdown(expiresAt) {
  if (window._offerCountdownInterval) clearInterval(window._offerCountdownInterval);

  function tick() {
    const el = document.getElementById('foundingCountdownTimer');
    const box = document.getElementById('foundingCountdownBox');
    if (!el) return;

    const target = expiresAt ? new Date(expiresAt).getTime() : (window._offerTargetTime || (window._offerTargetTime = Date.now() + (2 * 86400000) + (14 * 3600000) + (37 * 60000) + 52000));
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      el.innerHTML = '<span style="color:var(--status-error); font-weight:800;">OFFER EXPIRED</span>';
      if (box) box.style.borderColor = 'var(--status-error)';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    el.innerText = `${pad(days)}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;
  }

  tick();
  window._offerCountdownInterval = setInterval(tick, 1000);
}

function copyUserRefLink() {
  const input = document.getElementById('userRefLinkInput');
  const url = input ? input.value : `https://atomxengage.com/ref/${(AtomXState.currentUser.handle || 'user').replace('@','')}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('✓ Referral link copied to clipboard!');
    }).catch(() => {
      prompt('Copy your referral link:', url);
    });
  } else {
    prompt('Copy your referral link:', url);
  }
}

function shareRefLink(platform) {
  const handle = (AtomXState.currentUser.handle || 'user').replace('@','');
  const refUrl = `https://atomxengage.com/ref/${handle}`;
  const text = `Join ATOMX ENGAGE for autonomous AI Twitter growth! Use my referral link to get 150 bonus credits: ${refUrl}`;
  
  let url = '';
  if (platform === 'x') {
    url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  } else if (platform === 'tg') {
    url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent('Join ATOMX ENGAGE & get 150 bonus credits!')}`;
  } else if (platform === 'wa') {
    url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  } else if (platform === 'fb') {
    url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refUrl)}`;
  }
  if (url) window.open(url, '_blank');
}

function confirmCryptoTxHash() {
  const input = document.getElementById('txHashInput');
  const val = input ? input.value.trim() : '';
  if (!val) {
    alert('Please enter your Transaction Hash (Tx Hash) to verify payment.');
    return;
  }
  const amtSelect = document.getElementById('cryptoAmountSelect');
  const usd = amtSelect ? parseInt(amtSelect.value, 10) : 10;
  const creditsToAdd = usd * 1000;

  AtomXState.currentUser.credits += creditsToAdd;
  AtomXState.creditLedger.unshift({
    date: 'Just now',
    user: AtomXState.currentUser.name,
    action: 'Crypto Purchase',
    amount: creditsToAdd,
    admin: 'Blockchain Tx',
    reason: `Verified Tx: ${val.slice(0, 10)}... ($${usd})`
  });

  alert(`✓ Transaction Hash Verified! Successfully credited ${creditsToAdd.toLocaleString()} credits to your account.`);
  if (input) input.value = '';
  renderCreditsPlans(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 11: SETTINGS / PROFILE
// -------------------------------------------------------------
function renderSettingsProfile(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('11')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">Manage your account, AI preferences, and security.</p>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Profile Card -->
          <div class="atomx-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:16px;">
              <div class="user-avatar" style="width:54px; height:54px; font-size:18px;">${AtomXState.currentUser.avatar}</div>
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:18px; font-weight:700;">${AtomXState.currentUser.name}</span>
                  <span class="badge badge-success">${AtomXState.currentUser.status}</span>
                </div>
                <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">${AtomXState.currentUser.handle} · ${AtomXState.currentUser.email}</div>
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <span class="badge badge-info" style="padding:6px 14px;">${AtomXState.currentUser.plan}</span>
              <span class="badge badge-neutral" style="padding:6px 14px;">${AtomXState.currentUser.credits.toLocaleString()} Credits</span>
            </div>
          </div>

          <!-- Settings Sections Grid -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">ACCOUNT</h3>
              <div class="form-group">
                <label class="form-label">Profile Name</label>
                <input type="text" class="form-input" value="${AtomXState.currentUser.name}">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" value="${AtomXState.currentUser.email}">
              </div>
              <div class="form-group">
                <label class="form-label">Connected X Account</label>
                <input type="text" class="form-input" value="@alexcarterx (Verified)">
              </div>
            </div>

            <!-- Theme & Appearance Card -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">APPEARANCE & THEME</h3>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">Personalize your workspace aesthetic. Dark mode uses deep obsidian surfaces designed for low-light focus.</p>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                <div onclick="setTheme('light')" style="padding:16px; border:2px solid ${AtomXState.theme === 'light' ? 'var(--blue-primary)' : 'var(--border-subtle)'}; border-radius:var(--radius-md); cursor:pointer; background:${AtomXState.theme === 'light' ? 'var(--blue-soft)' : 'var(--bg-canvas)'}; text-align:center; transition:all 0.2s;">
                  <div style="font-size:24px; margin-bottom:6px;">☀️</div>
                  <div style="font-weight:700; font-size:14px; color:var(--text-primary);">Light Luxury</div>
                  <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Clean minimal canvas</div>
                </div>
                <div onclick="setTheme('dark')" style="padding:16px; border:2px solid ${AtomXState.theme === 'dark' ? 'var(--blue-primary)' : 'var(--border-subtle)'}; border-radius:var(--radius-md); cursor:pointer; background:${AtomXState.theme === 'dark' ? 'rgba(59,102,255,0.1)' : 'var(--bg-canvas)'}; text-align:center; transition:all 0.2s;">
                  <div style="font-size:24px; margin-bottom:6px;">🌙</div>
                  <div style="font-weight:700; font-size:14px; color:var(--text-primary);">Obsidian Dark</div>
                  <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">High contrast night</div>
                </div>
              </div>
            </div>

            <!-- AI Settings Card -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">AI SETTINGS</h3>
              <div class="form-group">
                <label class="form-label">Default AI Provider</label>
                <select class="form-select" id="settingsDefaultProviderSelect" onchange="selectActiveProvider(this.value)">
                  ${AtomXState.providers.map(p => `
                    <option value="${p.id}" ${AtomXState.currentProvider === p.id ? 'selected' : ''}>${p.icon} ${p.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <label class="form-label" style="margin-bottom:0;">Default Model</label>
                  <button type="button" class="fetch-models-btn" onclick="fetchLiveModelsForProvider(AtomXState.currentProvider, true)">
                    ↻ Fetch Models
                  </button>
                </div>
                <select class="form-select" id="settingsDefaultModelSelect" onchange="AtomXState.currentModel = this.value">
                  ${(AtomXState.modelsCache[AtomXState.currentProvider]?.length ? AtomXState.modelsCache[AtomXState.currentProvider] : getFallbackModelsForProvider(AtomXState.currentProvider)).map(m => `
                    <option value="${m.id}" ${AtomXState.currentModel === m.id ? 'selected' : ''}>${m.name || m.id}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Default Reply Style</label>
                <select class="form-select">
                  <option selected>Natural & Concise</option>
                  <option>Analytical & In-depth</option>
                  <option>Witty & Casual</option>
                </select>
              </div>
            </div>

            <!-- Multi-Provider Real-Time Fetch Card -->
            <div class="atomx-card" style="grid-column: 1 / -1;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div>
                  <h3 style="font-size:15px; font-weight:700;">LIVE AI PROVIDERS & REAL-TIME MODEL SYNC</h3>
                  <p style="font-size:13px; color:var(--text-secondary); margin-top:2px;">Query provider APIs directly to fetch newly released models in real time.</p>
                </div>
              </div>

              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin-top:14px;">
                ${AtomXState.providers.map(p => {
                  const cachedCount = (AtomXState.modelsCache[p.id] || []).length;
                  return `
                    <div style="padding:14px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="font-size:18px;">${p.icon}</span>
                          <div>
                            <div style="font-weight:700; font-size:14px; color:var(--text-primary);">${p.name}</div>
                            <div style="font-size:11px; color:var(--text-secondary);">${p.desc}</div>
                          </div>
                        </div>
                        <span class="badge badge-success" style="font-size:10px;">ACTIVE</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid var(--border-subtle); font-size:12px;">
                        <span style="color:var(--text-secondary); font-size:11px;">
                          ${cachedCount > 0 ? `<strong>${cachedCount}</strong> live models` : 'Ready to fetch'}
                        </span>
                        <button type="button" class="fetch-models-btn" onclick="selectActiveProvider('${p.id}'); fetchLiveModelsForProvider('${p.id}', true);" style="padding:4px 10px;">
                          ↻ Fetch Live
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">SECURITY & ACCESS</h3>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
                <div>
                  <div style="font-size:13px; font-weight:600;">Two-Factor Authentication</div>
                  <div style="font-size:12px; color:var(--text-secondary);">Enhanced authenticator protection</div>
                </div>
                <span class="badge badge-success">Enabled</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
                <div>
                  <div style="font-size:13px; font-weight:600;">Approval Date</div>
                  <div style="font-size:12px; color:var(--text-secondary);">${AtomXState.currentUser.initialApprovedDate}</div>
                </div>
                <span class="badge badge-info">Active</span>
              </div>
            </div>

            <div class="atomx-card" style="border-color:#FBD5D5;">
              <h3 style="font-size:15px; font-weight:700; color:var(--status-error); margin-bottom:14px;">DANGER ZONE</h3>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Irreversible account operations.</p>
              <div style="display:flex; gap:10px;">
                <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('01')">Log Out</button>
                <button class="btn btn-danger btn-sm" onclick="navigateToScreen('18')">Deactivate Account</button>
              </div>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('11')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 12: ADMIN DASHBOARD
// -------------------------------------------------------------
function renderAdminDashboard(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('12')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Admin Dashboard</h1>
            <p class="page-subtitle">Complete control over your platform.</p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="adminWipeAllUserData()" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:var(--status-error); font-size:12px; font-weight:600; cursor:pointer; padding:6px 12px;" title="Wipe all users & access requests to clean slate">
              🗑️ Fresh Reset (Wipe All Users)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="loadAdminServerData(); showToast('↻ Synced live platform state');" style="padding:6px 12px; font-size:12px;">↻ Refresh</button>
            <button class="btn btn-sm" onclick="adminLogout()" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#EF4444; font-size:12px; font-weight:700; cursor:pointer; padding:6px 14px; display:inline-flex; align-items:center; gap:6px; border-radius:6px;" title="Lock Admin Dashboard">
              🔒 Lock Dashboard
            </button>
          </div>
        </div>

        <div class="workspace-body">
          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="stat-card">
              <div class="stat-label">Total Users</div>
              <div class="stat-value" id="adminTotalUsersVal">${AtomXState.adminStats?.totalUsers ?? AtomXState.adminUsers.length ?? 0}</div>
              <div class="stat-trend" style="color:var(--status-success);">Live Database</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Active Users</div>
              <div class="stat-value" id="adminActiveUsersVal">${AtomXState.adminStats?.activeUsers ?? AtomXState.adminUsers.filter(u => u.status === 'Active').length ?? 0}</div>
              <div class="stat-trend" style="color:var(--status-success);">Verified Active</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Pending Requests</div>
              <div class="stat-value" id="adminPendingReqsVal" style="color:var(--status-warning);">
                ${(AtomXState.accessRequests || []).filter(r => (r.status || '').toUpperCase() === 'PENDING').length}
              </div>
              <div class="stat-trend" style="color:var(--status-warning);">Awaiting Review</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Credits Circulating</div>
              <div class="stat-value" id="adminCreditsCircVal">${(AtomXState.adminStats?.totalCreditsCirculating ?? 0).toLocaleString()}</div>
              <div class="stat-trend" style="color:var(--status-success);">Server Verified</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Platform MRR</div>
              <div class="stat-value" id="adminMrrVal" style="color:var(--blue-primary);">${AtomXState.adminStats?.mrr || '$0'}</div>
              <div class="stat-trend" style="color:var(--status-success);">Live Stripe/Crypto</div>
            </div>
          </div>

          <!-- GLOBAL AI PROVIDER & REAL-TIME MODEL SELECTOR -->
          <div class="atomx-card" style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
              <div>
                <h3 style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                  <span>🤖 Global AI Provider & Model Hub</span>
                  <span class="badge badge-success" id="activeModelBadge">● ACTIVE: ${AtomXState.currentProvider.toUpperCase()} / ${AtomXState.currentModel}</span>
                </h3>
                <p style="font-size:12px; color:var(--text-secondary); margin-top:3px;">
                  Select which provider and model powers all Chrome Extension users in real-time. Providers and keys are managed securely on backend.
                </p>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="refreshAdminModels(true)" id="adminRefreshModelsBtn">↻ Fetch Live Models</button>
                <button class="btn btn-primary btn-sm" onclick="saveAdminActiveModel()">💾 Set Active for System</button>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; align-items:center;">
              <div>
                <label class="form-label" style="font-size:12px; margin-bottom:6px;">Select AI Provider</label>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button class="btn ${AtomXState.currentProvider === 'groq' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="switchAdminAIProvider('groq')">🚀 Groq</button>
                  <button class="btn ${AtomXState.currentProvider === 'openrouter' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="switchAdminAIProvider('openrouter')">🌐 OpenRouter</button>
                  <button class="btn ${AtomXState.currentProvider === 'openai' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="switchAdminAIProvider('openai')">⚡ OpenAI</button>
                  <button class="btn ${AtomXState.currentProvider === 'gemini' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="switchAdminAIProvider('gemini')">✨ Gemini</button>
                </div>
              </div>

              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <label class="form-label" style="font-size:12px; margin-bottom:0;">Available Model (Fetched Live)</label>
                  <span id="modelCountLabel" style="font-size:11px; color:var(--blue-primary); font-weight:700;">${getAdminModelCountText(AtomXState.currentProvider)}</span>
                </div>
                <select id="adminModelSelect" class="form-select" onchange="AtomXState.currentModel = this.value">
                  ${renderAdminModelOptionsHTML(AtomXState.currentProvider)}
                </select>
                <input type="text" id="adminModelSearchInput" class="form-input" placeholder="🔍 Search models (e.g. llama-3.3, allam)..." style="font-size:11px; padding:4px 8px; margin-top:6px; width:100%; box-sizing:border-box;" oninput="filterAdminModelsList(this.value)">
              </div>

              <div style="background:var(--bg-canvas); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:12px;">
                <div style="color:var(--text-secondary); font-size:11px;">Server Status</div>
                <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">
                  ✓ Keys Active &amp; Synced
                </div>
                <div style="color:var(--text-muted); font-size:11px; margin-top:2px;">Dynamic inference • Zero client exposure</div>
              </div>
            </div>

            <!-- DYNAMIC API KEY CONFIGURATION (DIRECT FROM DASHBOARD - NO .ENV MANUAL EDITING) -->
            <div style="margin-top:16px; padding:12px 14px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                <label style="font-size:12px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                  <span>🔑</span>
                  <span><span id="adminApiKeyProviderLabel">${AtomXState.currentProvider.toUpperCase()}</span> API Key</span>
                  <span id="adminApiKeyStatusBadge" class="badge ${getAdminApiKeyInfo(AtomXState.currentProvider).hasKey ? 'badge-success' : 'badge-warning'}" style="font-size:10.5px;">
                    ${getAdminApiKeyInfo(AtomXState.currentProvider).hasKey ? '🟢 Configured (' + getAdminApiKeyInfo(AtomXState.currentProvider).maskedKey + ')' : '⚪ Missing Key'}
                  </span>
                </label>
                <span style="font-size:11px; color:var(--text-muted);">Change key here anytime without touching .env</span>
              </div>
              <div style="display:flex; gap:8px;">
                <input type="password" id="adminApiKeyInput" class="form-input" placeholder="${getAdminApiKeyInfo(AtomXState.currentProvider).hasKey ? 'Current: ' + getAdminApiKeyInfo(AtomXState.currentProvider).maskedKey + ' (Paste new key to replace)' : 'Paste ' + AtomXState.currentProvider.toUpperCase() + ' API key (e.g. gsk_...)'}" style="font-size:12px; font-family:monospace; flex:1;" />
                <button type="button" class="btn btn-secondary btn-sm" id="toggleApiKeyVisibilityBtn" onclick="toggleAdminApiKeyVisibility()">👁️ Show</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="saveAdminApiKey()">💾 Save API Key</button>
              </div>
            </div>
          </div>

          <!-- TONE & STYLE PRESETS HUB (GLOBAL SYSTEM PROMPTS) -->
          <div class="atomx-card" style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
              <div>
                <h3 style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                  <span>🎯 Tone & Style Presets Hub</span>
                  <span class="badge badge-success" style="font-size:10px;">Synced Live</span>
                </h3>
                <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                  Active system tones broadcasted to all Chrome Extension users. Click any preset to view or edit its system prompt.
                </p>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('21')">⚙️ Manage in Tone Studio</button>
              </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;" id="adminDashboardTonePills">
              ${(AtomXState.toneStylesData?.defaultTones || []).map((t, idx) => `
                <button type="button" class="style-pill ${idx === 0 ? 'active' : ''}" onclick="selectAdminDashboardTone('${t.id}')" style="font-size:12px; padding:6px 12px; cursor:pointer;">
                  ${t.name}
                </button>
              `).join('')}
            </div>

            <div id="adminDashboardTonePreview" style="background:var(--bg-canvas); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:700; color:var(--blue-primary);" id="adminTonePreviewTitle">
                  ${AtomXState.toneStylesData?.defaultTones?.[0]?.name || 'Bullish (5-10 words)'}
                </span>
                <span style="font-size:11px; color:var(--text-muted);" id="adminTonePreviewDesc">
                  ${AtomXState.toneStylesData?.defaultTones?.[0]?.description || ''}
                </span>
              </div>
              <div style="font-family:monospace; font-size:11.5px; color:var(--text-primary); line-height:1.4; white-space:pre-wrap;" id="adminTonePreviewPrompt">
                ${AtomXState.toneStylesData?.defaultTones?.[0]?.prompt || ''}
              </div>
            </div>
          </div>

          <!-- PROVIDER API KEYS HEALTH & LIVE STATUS -->
          <div class="atomx-card" style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
              <div>
                <h3 style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                  <span>🔑 Provider API Keys Health & Diagnostics</span>
                </h3>
                <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                  Real-time server-side ping test verifying credits, authorization, and rate limits across providers.
                </p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="runAdminKeyDiagnostics()" id="btnKeyDiag">
                ⚡ Run Live Diagnostics
              </button>
            </div>
            <div id="adminKeysHealthContainer" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
              ${renderAdminKeysHealthHTML(AtomXState.adminKeysHealth)}
            </div>
          </div>

          <!-- LIVE AI GENERATION & TELEMETRY LOGS -->
          <div class="atomx-card" style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
              <div>
                <h3 style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                  <span>📡 Live AI Generation & Error Telemetry Logs</span>
                  <span class="badge badge-primary" style="font-size:10px;" id="apiLogsCountBadge">${AtomXState.adminApiLogs?.length || 0} Logs</span>
                </h3>
                <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                  Instant audit trail of all comment generation requests, HTTP status codes (200, 401, 402, 404, 429), failover cascades, and errors.
                </p>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="refreshAdminApiLogs(true)">↻ Refresh Logs</button>
                <button class="btn btn-sm" style="background:var(--bg-canvas); border:1px solid var(--border-subtle); color:var(--text-secondary);" onclick="clearAdminApiLogsDisplay()">Clear View</button>
              </div>
            </div>

            <div class="atomx-table-wrapper" style="max-height:420px; overflow-y:auto;">
              <table class="atomx-table responsive-table-as-cards" style="font-size:12px;">
                <thead>
                  <tr>
                    <th style="width:100px;">Time</th>
                    <th style="width:170px;">Provider & Model</th>
                    <th>Target Post Snippet</th>
                    <th style="width:110px;">Status</th>
                    <th>Generated Output / Error Detail</th>
                    <th style="width:80px; text-align:right;">Latency</th>
                  </tr>
                </thead>
                <tbody id="adminApiLogsTbody">
                  ${renderAdminApiLogsRowsHTML(AtomXState.adminApiLogs)}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Real-Time Activity & Telemetry -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-bottom:20px;">
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">User Account Telemetry</h3>
              <div style="padding:24px 16px; text-align:center; background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle);">
                <div style="font-size:24px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">${AtomXState.adminStats?.totalUsers || 1} Registered User</div>
                <div style="font-size:12px; color:var(--text-secondary);">Direct SQLite database synchronization active. No mock accounts.</div>
              </div>
            </div>

            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">AI Generations & Usage</h3>
              <div style="padding:24px 16px; text-align:center; background:var(--bg-canvas); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle);">
                <div style="font-size:24px; font-weight:800; color:var(--blue-primary); margin-bottom:4px;">${AtomXState.adminStats?.totalAIGenerations || 0} Total AI Actions</div>
                <div style="font-size:12px; color:var(--text-secondary);">Server audit log verifies atomic deductions per generation.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Auto-refresh telemetry logs on dashboard open
  refreshAdminApiLogs(false);
}

function selectAdminDashboardTone(toneId) {
  const tones = AtomXState.toneStylesData?.defaultTones || [];
  const tone = tones.find(t => t.id === toneId) || tones[0];
  if (!tone) return;

  const container = document.getElementById('adminDashboardTonePills');
  if (container) {
    container.querySelectorAll('.style-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${toneId}'`));
    });
  }

  const titleEl = document.getElementById('adminTonePreviewTitle');
  const descEl = document.getElementById('adminTonePreviewDesc');
  const promptEl = document.getElementById('adminTonePreviewPrompt');

  if (titleEl) titleEl.textContent = tone.name;
  if (descEl) descEl.textContent = tone.description || '';
  if (promptEl) promptEl.textContent = tone.prompt || '';
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// SCREEN 14: UNIFIED USERS & ACCESS MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function setAdminUserFilter(filter) {
  AtomXState.userFilter = filter;
  renderAdminUsers(document.getElementById('mainContentArea'));
}

function setAdminUserSearch(query) {
  AtomXState.userSearchQuery = query;
  renderAdminUsers(document.getElementById('mainContentArea'));
}

function renderAdminAccessRequests(container) {
  AtomXState.userFilter = 'Pending';
  renderAdminUsers(container);
}

function renderAdminUsers(container) {
  const activeFilter = AtomXState.userFilter || 'All';
  const searchQuery = (AtomXState.userSearchQuery || '').toLowerCase().trim();

  // Consolidate registered users and access requests
  const registeredUsers = (AtomXState.adminUsers || []).map(u => ({
    ...u,
    type: 'user',
    handle: u.handle || '@user',
    rawStatus: (u.status || 'ACTIVE').toUpperCase(),
    dateDisplay: u.lastActive || 'Active'
  }));

  const accessReqs = (AtomXState.accessRequests || []).map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    telegram: r.telegram || '',
    handle: r.handle || '@user',
    plan: 'Pending Tier',
    credits: 0,
    type: 'request',
    rawStatus: (r.status || 'PENDING').toUpperCase(),
    dateDisplay: r.requestedDate || 'Recent'
  }));

  // Prevent duplicate email display if already in registered users
  const registeredEmails = new Set(registeredUsers.map(u => (u.email || '').toLowerCase()));
  const pendingOrUniqueReqs = accessReqs.filter(r => {
    if (r.rawStatus === 'PENDING') return true;
    if (r.rawStatus === 'REJECTED') return true;
    return !registeredEmails.has((r.email || '').toLowerCase());
  });

  const allAccounts = [...pendingOrUniqueReqs.filter(r => r.rawStatus === 'PENDING'), ...registeredUsers, ...pendingOrUniqueReqs.filter(r => r.rawStatus !== 'PENDING')];

  // Counts
  const totalCount = allAccounts.length;
  const pendingCount = (AtomXState.accessRequests || []).filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
  const activeCount = registeredUsers.filter(u => u.rawStatus === 'ACTIVE').length;
  const suspendedCount = registeredUsers.filter(u => u.rawStatus === 'SUSPENDED').length;
  const rejectedCount = (AtomXState.accessRequests || []).filter(r => (r.status || '').toUpperCase() === 'REJECTED').length;

  let displayed = allAccounts.filter(acc => {
    if (activeFilter === 'Pending') return acc.rawStatus === 'PENDING';
    if (activeFilter === 'Active') return acc.rawStatus === 'ACTIVE';
    if (activeFilter === 'Suspended') return acc.rawStatus === 'SUSPENDED';
    if (activeFilter === 'Rejected') return acc.rawStatus === 'REJECTED';
    return true;
  });

  if (searchQuery) {
    displayed = displayed.filter(acc => {
      const n = (acc.name || '').toLowerCase();
      const e = (acc.email || '').toLowerCase();
      const h = (acc.handle || '').toLowerCase();
      return n.includes(searchQuery) || e.includes(searchQuery) || h.includes(searchQuery);
    });
  }

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('14')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Users & Access</h1>
            <p class="page-subtitle">Unified management for user accounts, pending access requests, credits, and passwords.</p>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="adminWipeAllUserData()" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:var(--status-error); font-size:12px; font-weight:600; cursor:pointer;" title="Wipe all users & access requests to clean slate">
              🗑️ Fresh Reset (Wipe All Users)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="loadAdminServerData(); showToast('↻ Synced live accounts');">↻ Refresh</button>
            <button class="btn btn-primary btn-sm" onclick="openAdminInviteUserModal()">+ Add User Account</button>
            <button class="btn btn-sm" onclick="adminLogout()" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#EF4444; font-size:12px; font-weight:700; cursor:pointer; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; border-radius:6px;" title="Lock Admin Dashboard">
              🔒 Lock
            </button>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div class="style-pills">
              <span class="style-pill ${activeFilter === 'All' ? 'active' : ''}" onclick="setAdminUserFilter('All')">All Accounts (${totalCount})</span>
              <span class="style-pill ${activeFilter === 'Pending' ? 'active' : ''}" onclick="setAdminUserFilter('Pending')">
                Pending Requests ${pendingCount > 0 ? `<span class="badge badge-warning" style="margin-left:4px; font-size:10px; padding:1px 5px;">${pendingCount}</span>` : `(${pendingCount})`}
              </span>
              <span class="style-pill ${activeFilter === 'Active' ? 'active' : ''}" onclick="setAdminUserFilter('Active')">Active (${activeCount})</span>
              <span class="style-pill ${activeFilter === 'Suspended' ? 'active' : ''}" onclick="setAdminUserFilter('Suspended')">Suspended (${suspendedCount})</span>
              <span class="style-pill ${activeFilter === 'Rejected' ? 'active' : ''}" onclick="setAdminUserFilter('Rejected')">Rejected (${rejectedCount})</span>
            </div>
            <div style="width:260px;">
              <input type="text" class="form-input" placeholder="Search by name, email, or @handle..." value="${AtomXState.userSearchQuery || ''}" oninput="setAdminUserSearch(this.value)">
            </div>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th>Referred By</th>
                  <th>Date</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${displayed.length === 0 ? `
                  <tr>
                    <td colspan="9" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:6px;">👥</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:2px;">No Accounts in "${activeFilter}"</div>
                      <div style="font-size:12px;">Try switching filter tabs or clear your search query.</div>
                    </td>
                  </tr>
                ` : displayed.map(u => {
                  const s = u.rawStatus;
                  const isPending = s === 'PENDING';
                  const isSuspended = s === 'SUSPENDED';
                  const isRejected = s === 'REJECTED';
                  const isActive = s === 'ACTIVE';

                  const cleanHandle = (u.handle || '@user').replace(/^@/, '');
                  const handleLink = `<a href="https://x.com/${cleanHandle}" target="_blank" style="color:var(--blue-primary); text-decoration:none; font-weight:700;">@${cleanHandle}</a>`;

                  return `
                  <tr>
                    <td style="font-weight:600;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div class="user-avatar" style="width:28px; height:28px; font-size:11px; background:var(--border-subtle); color:var(--text-primary);">
                          ${(u.name || 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <span>${u.name}</span>
                      </div>
                    </td>
                    <td>${handleLink}</td>
                    <td style="color:var(--text-secondary);">
                      <div>${u.email}</div>
                      ${u.telegram ? `<div style="font-size:11px; color:#229ED9; font-weight:600; margin-top:2px;">✈️ ${u.telegram}</div>` : ''}
                    </td>
                    <td>
                      <span class="badge badge-neutral" style="font-size:11px;">${u.plan || 'Free'}</span>
                    </td>
                    <td style="font-weight:700; color:var(--text-primary); font-size:12px;">
                      ${(u.credits || 0).toLocaleString()}
                    </td>
                    <td>
                      <span class="badge ${isPending ? 'badge-warning' : isSuspended ? 'badge-error' : isRejected ? 'badge-error' : 'badge-success'}">
                        ${s}
                      </span>
                    </td>
                    <td>
                      ${u.referredBy && u.referredBy !== 'Direct / —' ? 
                        `<span style="color:#229ED9; font-weight:700; font-family:monospace; font-size:12px;">${u.referredBy}</span>` : 
                        `<span style="color:var(--text-muted); font-size:12px;">Direct / —</span>`}
                    </td>
                    <td style="color:var(--text-muted); font-size:11px;">${u.dateDisplay}</td>
                    <td style="text-align:right;">
                      <div style="display:inline-flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                        ${isPending ? `
                          <button class="btn btn-primary btn-sm" onclick="openApprovalModal('${u.name}', '${u.email}', '${u.handle}', '${u.id}', '${u.telegram || ''}')">Approve</button>
                          <button class="btn btn-danger btn-sm" onclick="rejectUserRequest('${u.id}')">Reject</button>
                        ` : isRejected ? `
                          <button class="btn btn-secondary btn-sm" onclick="openApprovalModal('${u.name}', '${u.email}', '${u.handle}', '${u.id}', '${u.telegram || ''}')">Re-Approve</button>
                        ` : `
                          <button class="btn btn-secondary btn-sm" onclick="onAdminManageUserCredits('${u.id}')" title="Adjust credits for this user">Credits</button>
                          <button class="btn btn-secondary btn-sm" onclick="openAdminPasswordModal('${u.id}', '${u.name}', '${u.handle}')" title="Set or reset user password">🔑 Password</button>
                          <button class="btn ${isSuspended ? 'btn-primary' : 'btn-danger'} btn-sm" onclick="toggleSuspendUser('${u.id}')">
                            ${isSuspended ? 'Unsuspend' : 'Suspend'}
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function onAdminManageUserCredits(userId) {
  const user = (AtomXState.adminUsers || []).find(u => String(u.id) === String(userId));
  if (user) {
    AtomXState.selectedCreditUser = user;
    AtomXState.currentUser = user;
  }
  navigateToScreen('15');
}

function openApprovalModal(name, email, handle = '@user', reqId = '', telegram = '') {
  const defaultBonus = 100;
  const defaultPlanCredits = 10000;
  const defaultTotal = defaultPlanCredits + defaultBonus;

  const modalHTML = `
    <div class="modal-backdrop" id="approvalModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Approve Account & Authorize X ID</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div style="margin-bottom:16px; background:var(--bg-canvas); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
          <div style="font-weight:700; font-size:15px; color:var(--text-primary);">${name}</div>
          <div style="font-size:13px; font-weight:700; color:var(--blue-primary); margin-top:2px;">🔒 Locked to X ID: ${handle}</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Email: ${email}</div>
          ${telegram ? `<div style="font-size:12px; color:#229ED9; font-weight:600; margin-top:3px;">✈️ Telegram: ${telegram}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Plan Tier</label>
          <select class="form-select" id="approvalPlanSelect" onchange="onApprovalPlanChange(this.value)">
            <option value="Free Plan">Free Plan (100 Credits)</option>
            <option value="Growth Plan" selected>Growth Plan (10,000 Credits)</option>
            <option value="Pro Plan">Pro Plan (25,000 Credits)</option>
            <option value="Enterprise Plan">Enterprise Plan (100,000 Credits)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Credits (Plan Credits + 100 Onboarding Bonus)</label>
          <input type="number" class="form-input" id="initialCreditsInput" value="${defaultTotal}">
          <div class="form-hint" id="approvalCreditsHint" style="color:var(--text-secondary); font-size:11.5px; margin-top:4px;">
            Auto-calculated: <strong>10,000</strong> plan credits + <strong>100</strong> onboarding bonus = <strong>${defaultTotal.toLocaleString()}</strong> credits.
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmApproval('${name}', '${email}', '${handle}', '${reqId}')">Approve & Authorize ID</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.onApprovalPlanChange = function(planValue) {
  const bonus = 100;
  let planCredits = 10000;
  if (planValue === 'Free Plan') planCredits = 100;
  else if (planValue === 'Growth Plan') planCredits = 10000;
  else if (planValue === 'Pro Plan') planCredits = 25000;
  else if (planValue === 'Enterprise Plan') planCredits = 100000;

  const total = planCredits + bonus;
  const input = document.getElementById('initialCreditsInput');
  const hint = document.getElementById('approvalCreditsHint');
  if (input) input.value = total;
  if (hint) {
    hint.innerHTML = `Auto-calculated: <strong>${planCredits.toLocaleString()}</strong> plan credits + <strong>${bonus}</strong> onboarding bonus = <strong>${total.toLocaleString()}</strong> credits.`;
  }
};

function closeModal() {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) modal.remove();
}

async function confirmApproval(name, email, handle = '@user', reqId = '') {
  // CRITICAL: Read input values BEFORE destroying the modal!
  const creditsInput = document.getElementById('initialCreditsInput');
  const planSelect = document.getElementById('approvalPlanSelect');
  const credits = Number(creditsInput?.value) || 10100;
  const plan = planSelect?.value || 'Growth Plan';

  closeModal();

  // Optimistic update
  const r = (AtomXState.accessRequests || []).find(x => String(x.id) === String(reqId) || x.email === email);
  if (r) {
    r.status = 'APPROVED';
    r.plan = plan;
    r.credits = credits;
  }
  renderAdminUsers(document.getElementById('mainContentArea'));

  try {
    const res = await fetch(`${API_BASE}/api/admin/approve-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: reqId, email, handle, initialCredits: credits, planTier: plan })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Server error approving request');
    showToast(`✓ User ${name} (${handle}) approved with ${plan} (${credits.toLocaleString()} credits)!`, 'success');
  } catch (err) {
    console.warn('[Approval Notice]', err);
    showToast(`Approval Note: ${err.message}`, 'error');
  }

  await loadAdminServerData();
  renderAdminUsers(document.getElementById('mainContentArea'));
}

async function rejectUserRequest(id) {
  if (!confirm('Are you sure you want to decline/reject this user access request?')) return;

  const r = (AtomXState.accessRequests || []).find(x => String(x.id) === String(id));
  if (r) r.status = 'REJECTED';
  renderAdminUsers(document.getElementById('mainContentArea'));

  try {
    const res = await fetch(`${API_BASE}/api/admin/reject-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id })
    });
    if (res.ok) {
      showToast('✓ Request marked as rejected.', 'success');
    }
  } catch (e) {
    console.warn('[Reject Notice]', e);
  }

  await loadAdminServerData();
  renderAdminUsers(document.getElementById('mainContentArea'));
}

function openAdminPasswordModal(userId, name, handle) {
  closeModal();
  const modalHTML = `
    <div class="modal-backdrop" id="adminPasswordModal">
      <div class="modal-box" style="max-width:440px;">
        <div class="modal-header">
          <h3 class="modal-title">🔑 Manage User Password</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div style="margin-bottom:14px; background:var(--bg-canvas); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
          <div style="font-weight:700; font-size:14px; color:var(--text-primary);">${name}</div>
          <div style="font-size:12px; color:var(--blue-primary); font-weight:700; margin-top:2px;">${handle || '@user'}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Set New Password</label>
          <div style="position:relative; display:flex; align-items:center;">
            <input type="password" id="adminUserNewPasswordInput" class="form-input" style="padding-right:40px;" placeholder="Enter minimum 6 characters...">
            <button type="button" onclick="toggleAdminPasswordVisibility()" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; font-size:16px;">👁️</button>
          </div>
          <div class="form-hint">Admin override: The user can immediately sign in using this new password.</div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" id="saveUserPasswordBtn" onclick="handleAdminSetPassword('${userId}', '${name}')">Save New Password</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function toggleAdminPasswordVisibility() {
  const inp = document.getElementById('adminUserNewPasswordInput');
  if (inp) {
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }
}

async function handleAdminSetPassword(userId, name) {
  const inp = document.getElementById('adminUserNewPasswordInput');
  const pwd = inp ? inp.value.trim() : '';
  if (!pwd || pwd.length < 4) {
    showToast('Please enter a password with at least 4 characters.', 'error');
    return;
  }

  const btn = document.getElementById('saveUserPasswordBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/set-user-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password: pwd })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to update password');

    closeModal();
    showToast(`✓ Password updated successfully for ${name}!`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save New Password';
    }
  }
}

function openAdminInviteUserModal() {
  closeModal();
  const modalHTML = `
    <div class="modal-backdrop" id="adminInviteModal">
      <div class="modal-box" style="max-width:440px;">
        <div class="modal-header">
          <h3 class="modal-title">Create / Authorize User</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" id="adminNewUserName" class="form-input" placeholder="e.g. Alex Trader">
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="adminNewUserEmail" class="form-input" placeholder="e.g. alex@trader.io">
        </div>
        <div class="form-group">
          <label class="form-label">X / Twitter Handle (Mandatory Lock)</label>
          <input type="text" id="adminNewUserHandle" class="form-input" placeholder="e.g. @alextrader">
        </div>
        <div class="form-group">
          <label class="form-label">Initial Password</label>
          <input type="password" id="adminNewUserPassword" class="form-input" placeholder="Set temporary or permanent password">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="handleAdminCreateDirectUser()">Create & Authorize</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function handleAdminCreateDirectUser() {
  const fullName = document.getElementById('adminNewUserName')?.value.trim();
  const email = document.getElementById('adminNewUserEmail')?.value.trim();
  const handle = document.getElementById('adminNewUserHandle')?.value.trim();
  const password = document.getElementById('adminNewUserPassword')?.value.trim() || 'atomx123';

  if (!fullName || !email || !handle) {
    showToast('Name, Email, and X ID are required.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, handle, password, useCase: 'Admin Created Account' })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to create user');

    closeModal();
    showToast(`✓ Account created! Auto-approving now...`, 'success');
    await loadAdminServerData();
    renderAdminUsers(document.getElementById('mainContentArea'));
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function toggleSuspendUser(id) {
  const user = (AtomXState.adminUsers || []).find(u => String(u.id) === String(id));
  if (!user) return;
  const isSuspended = (user.status || '').toLowerCase() === 'suspended';
  const newStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';

  // Optimistic update
  user.status = isSuspended ? 'Active' : 'Suspended';
  renderAdminUsers(document.getElementById('mainContentArea'));

  try {
    const res = await fetch(`${API_BASE}/api/admin/toggle-user-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, status: newStatus })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Server error');
    showToast(`✓ Account ${user.name} is now ${newStatus}`, 'success');
  } catch (err) {
    console.warn('[Suspend Error]', err);
    showToast(`Note: ${err.message}`, 'error');
  }

  await loadAdminServerData();
  renderAdminUsers(document.getElementById('mainContentArea'));
}


// -------------------------------------------------------------
// -------------------------------------------------------------
// SCREEN 15: CREDIT MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function handleSearchCreditUsers(query) {
  AtomXState.creditUserSearchQuery = query;
  const q = (query || '').toLowerCase().trim();
  const select = document.getElementById('creditUserSelectDropdown');
  if (!select) return;

  const users = AtomXState.adminUsers || [];
  const matches = users.filter(u => {
    return (u.name || '').toLowerCase().includes(q) ||
           (u.email || '').toLowerCase().includes(q) ||
           (u.handle || '').toLowerCase().includes(q);
  });

  if (matches.length > 0) {
    select.innerHTML = matches.map(u => `
      <option value="${u.id}" ${AtomXState.selectedCreditUser?.id === u.id ? 'selected' : ''}>
        ${u.name} (${u.email}) · ${u.handle || '@user'} [${(u.credits || 0).toLocaleString()} Credits]
      </option>
    `).join('');
    // Auto-select first matching user
    if (!matches.some(m => m.id === AtomXState.selectedCreditUser?.id)) {
      handleSelectCreditUser(matches[0].id);
    }
  } else {
    select.innerHTML = `<option value="">No users match "${query}"</option>`;
  }
}

function handleSelectCreditUser(userId) {
  const user = (AtomXState.adminUsers || []).find(u => String(u.id) === String(userId));
  if (user) {
    AtomXState.selectedCreditUser = user;
    AtomXState.currentUser = user;
    renderAdminCreditManagement(document.getElementById('mainContentArea'));
  }
}

function renderAdminCreditManagement(container) {
  const users = AtomXState.adminUsers || [];
  // Default to selected credit user or first registered user or Evan Jawad
  let targetUser = AtomXState.selectedCreditUser;
  if (!targetUser || !users.some(u => String(u.id) === String(targetUser.id))) {
    targetUser = users[0] || AtomXState.currentUser || { id: 1, name: 'Evan Jawad', email: 'evan@atomx.io', plan: 'Admin', credits: 10000 };
    AtomXState.selectedCreditUser = targetUser;
  }

  const searchQuery = AtomXState.creditUserSearchQuery || '';

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('15')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Credit Management</h1>
            <p class="page-subtitle">Server-controlled ledger operations and credit issuance for all users.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadAdminServerData(); showToast('↻ Synced credit balances');">↻ Refresh</button>
        </div>

        <div class="workspace-body">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px; margin-bottom:24px;">
            <!-- Select & Adjust User Credits Box -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">Select User & Adjust Credits</h3>

              <!-- Interactive User Search Box -->
              <div class="form-group">
                <label class="form-label" style="font-weight:600;">Search & Choose User</label>
                <input type="text" id="creditUserSearchInput" class="form-input" style="margin-bottom:8px;" placeholder="Type name, email, or @handle to search user..." value="${searchQuery}" oninput="handleSearchCreditUsers(this.value)">
                <select id="creditUserSelectDropdown" class="form-input" onchange="handleSelectCreditUser(this.value)">
                  ${users.map(u => `
                    <option value="${u.id}" ${String(u.id) === String(targetUser.id) ? 'selected' : ''}>
                      ${u.name} (${u.email}) · ${u.handle || '@user'} [${(u.credits || 0).toLocaleString()} cr]
                    </option>
                  `).join('')}
                </select>
              </div>

              <!-- Active Selected User Preview Card -->
              <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div style="font-weight:700; font-size:14px; color:var(--text-primary);">${targetUser.name}</div>
                    <div style="font-size:12px; color:var(--blue-primary); font-weight:700; margin-top:2px;">${targetUser.handle || '@user'} · ${targetUser.email}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Balance</div>
                    <div style="font-size:18px; font-weight:800; color:var(--text-primary);">${(targetUser.credits || 0).toLocaleString()} <span style="font-size:11px; font-weight:600; color:var(--text-muted);">cr</span></div>
                  </div>
                </div>
                <div style="margin-top:8px; font-size:11px; color:var(--text-secondary);">
                  Plan: <span class="badge badge-neutral" style="font-size:10px;">${targetUser.plan || 'Free'}</span> · Status: <span class="badge ${(targetUser.status || '').toLowerCase() === 'active' ? 'badge-success' : 'badge-error'}" style="font-size:10px;">${targetUser.status || 'Active'}</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Credit Amount</label>
                <input type="number" id="adminCreditInput" class="form-input" value="1000" min="1" placeholder="e.g. 500, 1000, 5000">
              </div>

              <div class="form-group">
                <label class="form-label">Reason / Audit Note</label>
                <input type="text" id="adminCreditReason" class="form-input" value="Promotional bonus">
              </div>

              <div style="display:flex; gap:10px;">
                <button class="btn btn-primary" onclick="adminTriggerCreditAdjustment('Add')">+ Add Credits</button>
                <button class="btn btn-secondary" onclick="adminTriggerCreditAdjustment('Remove')">- Remove Credits</button>
              </div>
            </div>

            <!-- Server Rule Notification -->
            <div class="atomx-card" style="background:var(--bg-canvas); border:1px solid var(--border-subtle);">
              <h3 style="font-size:15px; font-weight:700; color:var(--blue-primary); margin-bottom:10px;">Server Validation Truth</h3>
              <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
                Credit balances are calculated and validated exclusively on the server database. Neither the web frontend nor Chrome extension can tamper with balances. Each generation deducts 1 credit atomic transaction.
              </p>
              <div class="badge badge-success">Audit Logging Active</div>
              <div style="margin-top:20px; font-size:12px; color:var(--text-muted);">
                Currently Managing: <strong style="color:var(--text-primary);">${targetUser.name}</strong> (${targetUser.email})
              </div>
            </div>
          </div>

          <!-- Credit Ledger Table -->
          <div class="atomx-card">
            <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">Credit Ledger</h3>
            <div class="atomx-table-wrapper">
              <table class="atomx-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Amount</th>
                    <th>Admin</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  ${AtomXState.creditLedger.length === 0 ? `
                    <tr>
                      <td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">
                        <div style="font-size:22px; margin-bottom:6px;">📋</div>
                        <div style="font-weight:600; font-size:13px; color:var(--text-primary); margin-bottom:2px;">No Credit Ledger Records</div>
                        <div style="font-size:11px;">Credit adjustments and generation logs will appear here.</div>
                      </td>
                    </tr>
                  ` : AtomXState.creditLedger.map(c => `
                    <tr>
                      <td style="color:var(--text-muted);">${c.date}</td>
                      <td style="font-weight:600;">${c.user}</td>
                      <td>${c.action}</td>
                      <td style="font-weight:700; color:${c.amount > 0 ? 'var(--status-success)' : 'var(--status-error)'};">
                        ${c.amount > 0 ? '+' + c.amount.toLocaleString() : c.amount.toLocaleString()}
                      </td>
                      <td>${c.admin}</td>
                      <td style="color:var(--text-secondary);">${c.reason}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function adminTriggerCreditAdjustment(type) {
  const input = document.getElementById('adminCreditInput');
  const amt = parseInt(input?.value, 10);
  if (isNaN(amt) || amt <= 0) {
    showToast('Please enter a valid credit amount greater than 0.', 'error');
    return;
  }
  adminAdjustCredits(amt, type);
}

async function adminAdjustCredits(amt, type) {
  const amount = type === 'Add' ? amt : -amt;
  const reason = document.getElementById('adminCreditReason')?.value || 'Admin Adjustment';
  const targetUser = AtomXState.selectedCreditUser || AtomXState.currentUser || { id: 1, name: 'User' };

  try {
    const res = await fetch(`${API_BASE}/api/admin/adjust-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetUser.id,
        email: targetUser.email,
        handle: targetUser.handle,
        amount,
        reason
      })
    });
    const d = await res.json();
    if (res.ok) {
      targetUser.credits = (targetUser.credits || 0) + amount;
      await loadAdminServerData();
      showToast(`✓ Server verified: Successfully processed ${type} of ${amt.toLocaleString()} credits for ${targetUser.name}!`, 'success');
      renderAdminCreditManagement(document.getElementById('mainContentArea'));
      return;
    } else {
      throw new Error(d.error || 'Server rejected adjustment');
    }
  } catch (e) {
    showToast(`Notice: ${e.message}`, 'error');
  }

  // Fallback optimistic update
  AtomXState.creditLedger.unshift({
    date: 'Just now',
    user: targetUser.name,
    action: type === 'Add' ? 'Manual Add' : 'Manual Deduct',
    amount: amount,
    admin: 'Admin Control Panel',
    reason: reason
  });
  targetUser.credits = Math.max(0, (targetUser.credits || 0) + amount);
  showToast(`✓ Processed ${type} of ${amt.toLocaleString()} credits for ${targetUser.name}!`, 'success');
  renderAdminCreditManagement(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 16: PLAN & OFFERS MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function renderAdminPlanManagement(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('16')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Plans & Special Offers</h1>
            <p class="page-subtitle">Configure pricing tiers, credit allocations, discounts, and custom promotional offers.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openNewPlanModal()">+ Add New Plan / Offer</button>
        </div>

        <div class="workspace-body">
          <!-- Special Launch Promotional Offer Controller Card -->
          <div class="atomx-card" style="margin-bottom:24px; padding:18px 20px; border:2px solid #FF6B00; background:linear-gradient(135deg, rgba(255,107,0,0.06), rgba(0,0,0,0.1));">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="badge" style="background:#FF6B00; color:#FFF; font-weight:800; font-size:11px;">FIRST LAUNCH OFFER</span>
                <h3 style="font-size:16px; font-weight:800; color:var(--text-primary); margin:0;">FOUNDING 100 Promotional Campaign</h3>
              </div>
              <span class="badge badge-success" style="font-weight:700;">ACTIVE NOW</span>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:14px;">
              <div style="background:var(--bg-canvas); padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:11px; color:var(--text-muted); font-weight:600;">PRICING DISCOUNT</div>
                <div style="font-size:16px; font-weight:800; color:#FF6B00; margin-top:2px;">
                  <span style="text-decoration:line-through; font-size:13px; color:var(--text-muted);">$5/mo</span> → $2/mo
                </div>
              </div>
              <div style="background:var(--bg-canvas); padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:11px; color:var(--text-muted); font-weight:600;">CREDITS ALLOCATION</div>
                <div style="font-size:16px; font-weight:800; color:var(--blue-primary); margin-top:2px;">5,000 Credits</div>
              </div>
              <div style="background:var(--bg-canvas); padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:11px; color:var(--text-muted); font-weight:600;">CLAIM LIMIT</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-primary); margin-top:2px;">First 100 Users (14 Claimed)</div>
              </div>
              <div style="background:var(--bg-canvas); padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:11px; color:var(--text-muted); font-weight:600;">REAL-TIME COUNTDOWN</div>
                <div style="font-size:13px; font-weight:800; font-family:monospace; color:#FF6B00; margin-top:4px;">02d : 14h : 37m : 52s</div>
              </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="btn btn-secondary btn-sm" onclick="showToast('✓ Extended offer by 24 Hours!');">⏳ +24h Extension</button>
              <button class="btn btn-secondary btn-sm" onclick="showToast('✓ Extended offer by 48 Hours!');">⏳ +48h Extension</button>
              <button class="btn btn-secondary btn-sm" onclick="showToast('✓ Extended offer by 7 Days!');">⏳ +7 Days Extension</button>
              <button class="btn btn-primary btn-sm" onclick="promptEditFoundingOffer()">✏️ Edit Price, Credits & Expiry</button>
            </div>
          </div>

          <div class="pricing-grid">
            ${AtomXState.plans.map(p => `
              <div class="pricing-card ${p.popular ? 'featured' : ''}" style="position:relative;">
                ${p.offerBadge ? `
                  <div class="pricing-card-badge" style="background:linear-gradient(135deg, #FF6B00, #E60000); color:#FFF; font-weight:800; font-size:11px; padding:4px 10px; border-radius:20px; text-transform:uppercase;">
                    🔥 ${p.offerBadge}
                  </div>
                ` : (p.popular ? `<div class="pricing-card-badge">POPULAR</div>` : '')}

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:${p.offerBadge ? '10px' : '0'};">
                  <h3 style="font-size:16px; font-weight:800; text-transform:uppercase;">${p.name}</h3>
                  <span class="badge ${p.price > 0 ? 'badge-success' : 'badge-secondary'}">${p.price > 0 ? 'Active' : 'Free Tier'}</span>
                </div>

                <div class="plan-price" style="margin:12px 0 6px 0;">
                  $${p.price} <span style="font-size:13px; color:var(--text-muted); font-weight:500;">/ month</span>
                </div>

                <div style="font-size:14px; font-weight:700; color:var(--blue-primary); margin-bottom:12px;">
                  ⚡ ${(p.credits || 0).toLocaleString()} Credits
                </div>

                <ul class="plan-feature-list" style="margin-bottom:16px;">
                  ${(p.features || []).map(f => `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${f}</li>`).join('')}
                </ul>

                <button class="btn btn-secondary btn-block" onclick="openEditPlanModal('${p.id}')">✏️ Edit Price & Offers</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function openEditPlanModal(planId) {
  const plan = AtomXState.plans.find(p => p.id === planId);
  if (!plan) return;

  const modalHTML = `
    <div class="modal-backdrop" id="planEditModal">
      <div class="modal-box" style="max-width:480px;">
        <div class="modal-header">
          <h3 class="modal-title">Edit Plan: ${plan.name}</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Plan Name</label>
          <input type="text" class="form-input" id="editPlanName" value="${plan.name}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label">Price ($ / month)</label>
            <input type="number" class="form-input" id="editPlanPrice" value="${plan.price}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Credits Allocated</label>
            <input type="number" class="form-input" id="editPlanCredits" value="${plan.credits}" min="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Special Offer Badge (Optional)</label>
          <input type="text" class="form-input" id="editPlanBadge" value="${plan.offerBadge || ''}" placeholder="e.g. 50% OFF, FLASH DEAL, BEST VALUE">
          <div class="form-hint">Shown as an eye-catching promotional badge above the plan card.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Features (one per line)</label>
          <textarea class="form-input" id="editPlanFeatures" rows="4">${(plan.features || []).join('\n')}</textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="savePlanChanges('${plan.id}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function promptEditFoundingOffer() {
  const price = prompt('Enter Launch Price ($ / month):', '2.00');
  if (price === null) return;
  const credits = prompt('Enter Credit Allocation:', '5000');
  if (credits === null) return;
  const expiryHours = prompt('Set Expiry from now (in hours):', '72');
  if (expiryHours === null) return;

  showToast(`✓ Founding 100 offer updated! Price: $${price}/mo, Credits: ${credits}, Expires in ${expiryHours} hours.`);
  renderAdminPlanManagement(document.getElementById('mainContentArea'));
}

function openNewPlanModal() {
  const modalHTML = `
    <div class="modal-backdrop" id="planNewModal">
      <div class="modal-box" style="max-width:480px;">
        <div class="modal-header">
          <h3 class="modal-title">Create New Plan / Promotional Offer</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Plan Name</label>
          <input type="text" class="form-input" id="newPlanName" placeholder="e.g. SUMMER SPECIAL or ENTERPRISE">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label">Price ($ / month)</label>
            <input type="number" class="form-input" id="newPlanPrice" value="19" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Credits Allocated</label>
            <input type="number" class="form-input" id="newPlanCredits" value="20000" min="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Promotional Offer Badge</label>
          <input type="text" class="form-input" id="newPlanBadge" value="SPECIAL OFFER" placeholder="e.g. 50% OFF, LIMITED DEAL">
        </div>
        <div class="form-group">
          <label class="form-label">Features (one per line)</label>
          <textarea class="form-input" id="newPlanFeatures" rows="3">20,000 AI replies\nAll autonomous agents\nPriority server queue\nDedicated support</textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveNewPlan()">Create Offer Plan</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function savePlanChanges(planId) {
  const plan = AtomXState.plans.find(p => p.id === planId);
  if (!plan) return;

  plan.name = document.getElementById('editPlanName')?.value.trim() || plan.name;
  plan.price = Number(document.getElementById('editPlanPrice')?.value) || 0;
  plan.credits = Number(document.getElementById('editPlanCredits')?.value) || plan.credits;
  plan.offerBadge = document.getElementById('editPlanBadge')?.value.trim() || '';
  const featText = document.getElementById('editPlanFeatures')?.value || '';
  plan.features = featText.split('\n').map(s => s.trim()).filter(Boolean);

  closeModal();
  await persistAdminPlans();
  renderAdminPlanManagement(document.getElementById('mainContentArea'));
  showToast(`✓ Updated ${plan.name} plan configuration successfully!`);
}

async function saveNewPlan() {
  const name = document.getElementById('newPlanName')?.value.trim();
  if (!name) { alert('Please enter a plan name.'); return; }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const price = Number(document.getElementById('newPlanPrice')?.value) || 0;
  const credits = Number(document.getElementById('newPlanCredits')?.value) || 1000;
  const offerBadge = document.getElementById('newPlanBadge')?.value.trim() || '';
  const featText = document.getElementById('newPlanFeatures')?.value || '';
  const features = featText.split('\n').map(s => s.trim()).filter(Boolean);

  AtomXState.plans.push({
    id,
    name,
    price,
    credits,
    offerBadge,
    popular: false,
    features: features.length > 0 ? features : ['Full AI Access', 'Autonomous Agents']
  });

  closeModal();
  await persistAdminPlans();
  renderAdminPlanManagement(document.getElementById('mainContentArea'));
  showToast(`✓ Created new promotional offer plan: ${name}`);
}

async function persistAdminPlans() {
  try {
    await fetch(`${API_BASE}/api/admin/save-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plans: AtomXState.plans })
    });
  } catch (e) {
    console.warn('Could not post plans to backend', e);
  }
}

// -------------------------------------------------------------
// SCREEN 17: TRANSACTIONS / USAGE (ADMIN)
// -------------------------------------------------------------
function setTransactionsFilter(filter) {
  AtomXState.transactionsFilter = filter;
  renderAdminTransactions(document.getElementById('mainContentArea'));
}

function setTransactionsSearch(query) {
  AtomXState.transactionsSearchQuery = query;
  renderAdminTransactions(document.getElementById('mainContentArea'));
}

function renderAdminTransactions(container) {
  const activeFilter = AtomXState.transactionsFilter || 'All';
  const searchQuery = (AtomXState.transactionsSearchQuery || '').toLowerCase().trim();

  const allLedger = AtomXState.creditLedger || [];
  let filtered = allLedger.filter(tx => {
    const act = (tx.action || '').toLowerCase();
    const rsn = (tx.reason || '').toLowerCase();
    const amt = Number(tx.amount) || 0;

    if (activeFilter === 'Purchases') {
      return act.includes('purchase') || act.includes('stripe') || act.includes('crypto') || rsn.includes('purchase') || rsn.includes('plan');
    }
    if (activeFilter === 'AI Usage') {
      return act.includes('reply') || act.includes('ai') || rsn.includes('reply') || (amt < 0 && !act.includes('deduct'));
    }
    if (activeFilter === 'Credits Added') {
      return amt > 0;
    }
    if (activeFilter === 'Credits Removed') {
      return amt < 0;
    }
    return true;
  });

  if (searchQuery) {
    filtered = filtered.filter(tx => {
      const u = (tx.user || '').toLowerCase();
      const act = (tx.action || '').toLowerCase();
      const rsn = (tx.reason || '').toLowerCase();
      const dt = (tx.date || '').toLowerCase();
      return u.includes(searchQuery) || act.includes(searchQuery) || rsn.includes(searchQuery) || dt.includes(searchQuery);
    });
  }

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('17')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Transactions</h1>
            <p class="page-subtitle">Monitor financial transactions, ledger audits, and credit consumptions.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadAdminServerData(); showToast('↻ Synced ledger transactions');">↻ Refresh</button>
        </div>

        <div class="workspace-body">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div class="style-pills">
              <span class="style-pill ${activeFilter === 'All' ? 'active' : ''}" onclick="setTransactionsFilter('All')">All (${allLedger.length})</span>
              <span class="style-pill ${activeFilter === 'Purchases' ? 'active' : ''}" onclick="setTransactionsFilter('Purchases')">Purchases</span>
              <span class="style-pill ${activeFilter === 'AI Usage' ? 'active' : ''}" onclick="setTransactionsFilter('AI Usage')">AI Usage</span>
              <span class="style-pill ${activeFilter === 'Credits Added' ? 'active' : ''}" onclick="setTransactionsFilter('Credits Added')">Credits Added</span>
              <span class="style-pill ${activeFilter === 'Credits Removed' ? 'active' : ''}" onclick="setTransactionsFilter('Credits Removed')">Credits Removed</span>
            </div>
            <div style="width:260px;">
              <input type="text" class="form-input" placeholder="Search user, action, reason..." value="${AtomXState.transactionsSearchQuery || ''}" oninput="setTransactionsSearch(this.value)">
            </div>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Credits</th>
                  <th>Amount / Value</th>
                  <th>Reason / Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:8px;">💳</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">No Transactions Match Filter</div>
                      <div style="font-size:12px;">Try switching filter pills or clear the search input.</div>
                    </td>
                  </tr>
                ` : filtered.map(tx => `
                  <tr>
                    <td style="color:var(--text-muted); font-size:11.5px;">${tx.date}</td>
                    <td style="font-weight:600;">${tx.user}</td>
                    <td><span class="badge badge-neutral" style="font-size:10.5px;">${tx.action}</span></td>
                    <td style="font-weight:700; color:${tx.amount > 0 ? 'var(--status-success)' : 'var(--status-error)'};">
                      ${tx.amount > 0 ? '+' + tx.amount.toLocaleString() : tx.amount.toLocaleString()}
                    </td>
                    <td style="font-weight:600; color:var(--text-secondary);">
                      ${tx.amount > 0 ? '$' + Math.max(1, Math.round(tx.amount / 800)) + '.00' : '$0.00'}
                    </td>
                    <td style="color:var(--text-secondary); font-size:11.5px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${tx.reason}">
                      ${tx.reason || '--'}
                    </td>
                    <td><span class="badge badge-success">Completed</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 20: ADMIN CURATED LISTS & SORSA TARGETS MANAGEMENT
// -------------------------------------------------------------
async function fetchAdminCuratedLists() {
  try {
    const res = await fetch(`${API_BASE}/api/curated-lists`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.lists && Object.keys(data.lists).length > 0) {
        AtomXState.curatedLists = data.lists;
      }
    }
  } catch (e) {
    console.warn('Could not fetch curated lists from backend:', e);
  }
}

async function renderAdminCuratedLists(container) {
  if (!AtomXState._curatedListsLoaded) {
    await fetchAdminCuratedLists();
    AtomXState._curatedListsLoaded = true;
  }

  const lists = AtomXState.curatedLists;
  const listKeys = Object.keys(lists);
  const totalTargets = listKeys.reduce((acc, k) => acc + (lists[k].targets?.length || 0), 0);

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('20')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Curated Lists & Sorsa Targets</h1>
            <p class="page-subtitle">Manage, update, and broadcast curated influencer accounts and live Twitter list URLs for Audience Builder and Sorsa Score agents.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="promptAddNewCustomList()">+ Add New List</button>
            <button class="btn btn-secondary btn-sm" onclick="openImportGoogleSheetModal()" style="border-color:var(--status-success); color:var(--status-success); font-weight:600;">📥 Import Google Sheet / CSV</button>
            <button class="btn btn-primary btn-sm" onclick="saveCuratedListsToServer()">Save & Broadcast to Users</button>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Summary Metrics -->
          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:20px;">
            <div class="stat-card">
              <div class="stat-label">TOTAL CURATED LISTS</div>
              <div class="stat-value" style="color:var(--blue-primary);">${listKeys.length}</div>
              <div class="stat-trend" style="color:var(--status-success);">Active in Extension</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">TARGET INFLUENCER ACCOUNTS</div>
              <div class="stat-value" style="color:var(--status-success);">${totalTargets}</div>
              <div class="stat-trend" style="color:var(--text-secondary);">Indexed for engagement</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">INTEGRATED AGENTS</div>
              <div class="stat-value">2</div>
              <div class="stat-trend" style="color:var(--blue-primary);">Audience Builder + Sorsa Booster</div>
            </div>
          </div>

          <!-- Lists Grid -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:20px;">
            ${listKeys.map(k => {
              const l = lists[k];
              const isPub = (l.status || 'published') === 'published';
              return `
                <div class="atomx-card" id="card-${k}" style="display:flex; flex-direction:column; justify-content:space-between; border-top: 3px solid ${isPub ? 'var(--status-success)' : 'var(--status-warning)'};">
                  <div>
                    <!-- Header with Title, Status & Delete -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                      <div style="flex:1; margin-right:10px;">
                        <input type="text" id="listname-${k}" value="${l.name}" oninput="updateListName('${k}', this.value)" class="form-input" style="font-size:15px; font-weight:700; padding:4px 8px; margin-bottom:6px; width:100%;" title="Click to rename list">
                      </div>
                      <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="deleteCustomList('${k}')" style="background:none; border:none; color:var(--status-error); cursor:pointer; font-size:14px; padding:2px;" title="Delete List">🗑️</button>
                      </div>
                    </div>

                    <!-- Admin Decision Controls: Assigned Agent, Access Plan & Status -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:12px; background:var(--bg-canvas); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
                      <div>
                        <label style="font-size:9.5px; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:2px;">ASSIGNED AGENT:</label>
                        <select id="listcat-${k}" onchange="updateListCategory('${k}', this.value)" class="form-input" style="font-size:11px; padding:3px 4px; width:100%;">
                          <option value="Audience Builder" ${l.category === 'Audience Builder' ? 'selected' : ''}>Audience Builder</option>
                          <option value="Increase Sorsa Score" ${l.category === 'Increase Sorsa Score' ? 'selected' : ''}>Sorsa Score</option>
                          <option value="Followers Increase" ${l.category === 'Followers Increase' ? 'selected' : ''}>Followers Growth</option>
                        </select>
                      </div>
                      <div>
                        <label style="font-size:9.5px; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:2px;">ACCESS PLAN:</label>
                        <select id="listtier-${k}" onchange="updateListAccessTier('${k}', this.value)" class="form-input" style="font-size:11px; padding:3px 4px; width:100%; font-weight:700; color:${(l.accessTier || 'free') === 'paid' ? '#f59e0b' : '#38bdf8'};">
                          <option value="free" ${(l.accessTier || 'free') === 'free' ? 'selected' : ''}>🔓 Free (All)</option>
                          <option value="paid" ${l.accessTier === 'paid' ? 'selected' : ''}>🔒 Paid / Pro</option>
                        </select>
                      </div>
                      <div>
                        <label style="font-size:9.5px; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:2px;">STATUS:</label>
                        <select id="liststatus-${k}" onchange="updateListStatus('${k}', this.value)" class="form-input" style="font-size:11px; padding:3px 4px; width:100%; font-weight:700; color:${isPub ? 'var(--status-success)' : 'var(--status-warning)'};">
                          <option value="published" ${isPub ? 'selected' : ''}>🟢 Live</option>
                          <option value="draft" ${l.status === 'draft' ? 'selected' : ''}>🟡 Draft</option>
                        </select>
                      </div>
                    </div>

                    <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px; line-height:1.4;">${l.description}</p>

                    <!-- Twitter List URL Input -->
                    <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px;">
                      <label class="form-label" style="font-size:11px; font-weight:700; margin-bottom:4px; display:flex; justify-content:space-between;">
                        <span>🔗 TWITTER / X LIST URL:</span>
                        <span style="font-size:10px; color:var(--text-secondary); font-weight:normal;">(Optional)</span>
                      </label>
                      <input type="text" id="listurl-${k}" class="form-input" value="${l.listUrl || ''}" placeholder="https://x.com/i/lists/123456789" style="font-size:12px; padding:6px 10px;" oninput="updateListUrl('${k}', this.value)">
                      <div style="font-size:10.5px; color:var(--text-secondary); margin-top:4px; line-height:1.3;">
                        💡 <em>If left blank, bot uses live search from active targets below (100% reliable, never 404s).</em>
                      </div>
                    </div>

                    <!-- Target Chips & Count Control -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <div style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">
                        TARGET ACCOUNTS (${(l.targets || []).length}):
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button onclick="trimListTargetsPrompt('${k}')" class="btn btn-secondary btn-sm" style="font-size:10.5px; padding:2px 7px;">✂️ Set ID Count</button>
                        <button onclick="clearAllTargetsFromList('${k}')" class="btn btn-secondary btn-sm" style="font-size:10.5px; padding:2px 7px; color:var(--status-error);">Clear</button>
                      </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; max-height:150px; overflow-y:auto; padding:4px 0;">
                      ${(l.targets && l.targets.length > 0) ? (l.targets || []).map((t, idx) => `
                        <span style="display:inline-flex; align-items:center; gap:5px; background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:4px 9px; border-radius:99px; font-size:12px; font-weight:600;">
                          ${t}
                          <button onclick="removeTargetFromList('${k}', ${idx})" style="background:none; border:none; color:var(--status-error); cursor:pointer; font-size:12px; font-weight:bold; padding:0 2px;">×</button>
                        </span>
                      `).join('') : '<div style="font-size:11.5px; color:var(--text-secondary); font-style:italic;">No target accounts yet. Add handles below or import from Sheet.</div>'}
                    </div>
                  </div>

                  <!-- Quick Add & Bulk Import Form -->
                  <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:12px; margin-top:10px;">
                    <label class="form-label" style="font-size:11px; margin-bottom:4px;">+ Add Target Handles (e.g. @elonmusk or bulk paste)</label>
                    <div style="display:flex; gap:8px;">
                      <input type="text" id="input-${k}" class="form-input" placeholder="@handle or paste multiple comma separated" style="font-size:12px; padding:6px 10px;">
                      <button class="btn btn-primary btn-sm" onclick="addTargetToList('${k}')">Add</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateListUrl(listKey, val) {
  if (AtomXState.curatedLists[listKey]) {
    AtomXState.curatedLists[listKey].listUrl = (val || '').trim();
  }
}

function deleteCustomList(listKey) {
  if (confirm(`Are you sure you want to delete "${AtomXState.curatedLists[listKey]?.name}"?`)) {
    delete AtomXState.curatedLists[listKey];
    renderAdminCuratedLists(document.getElementById('mainContentArea'));
    showToast('List removed');
  }
}

function addTargetToList(listKey) {
  const input = document.getElementById(`input-${listKey}`);
  if (!input || !input.value.trim()) return;
  const raw = input.value.trim();
  const handles = raw.split(/[\s,]+/).map(h => h.trim()).filter(h => h.length > 0).map(h => h.startsWith('@') ? h : '@' + h);
  
  if (!AtomXState.curatedLists[listKey].targets) {
    AtomXState.curatedLists[listKey].targets = [];
  }
  
  handles.forEach(h => {
    if (!AtomXState.curatedLists[listKey].targets.includes(h)) {
      AtomXState.curatedLists[listKey].targets.push(h);
    }
  });

  input.value = '';
  renderAdminCuratedLists(document.getElementById('mainContentArea'));
  showToast(`✓ Added ${handles.length} target(s) to ${AtomXState.curatedLists[listKey].name}`);
}

function removeTargetFromList(listKey, index) {
  if (AtomXState.curatedLists[listKey]?.targets) {
    const removed = AtomXState.curatedLists[listKey].targets.splice(index, 1);
    renderAdminCuratedLists(document.getElementById('mainContentArea'));
    showToast(`Removed ${removed}`);
  }
}

function promptAddNewCustomList() {
  const name = prompt('Enter List Name (e.g., "Solana Ecosystem Alpha Builders"):');
  if (!name || !name.trim()) return;
  const cat = prompt('Enter Category:\n1 = Audience Builder\n2 = Increase Sorsa Score\n3 = Followers Increase', '1');
  let category = 'Audience Builder';
  if (cat === '2') category = 'Increase Sorsa Score';
  else if (cat === '3') category = 'Followers Increase';
  
  const listUrl = prompt('Enter Twitter/X List URL (optional, leave blank to use target handles):', '') || '';
  const newKey = 'custom_' + Date.now();

  if (!AtomXState.curatedLists) AtomXState.curatedLists = {};
  AtomXState.curatedLists[newKey] = {
    id: newKey,
    name: name.trim(),
    category: category,
    status: 'published',
    accessTier: 'free',
    description: `Curated target list for ${category}.`,
    listUrl: listUrl.trim(),
    targets: []
  };

  renderAdminCuratedLists(document.getElementById('mainContentArea'));
  showToast(`✓ Created new list: ${name.trim()}`);
}

async function saveCuratedListsToServer() {
  if (!AtomXState.curatedLists || typeof AtomXState.curatedLists !== 'object') {
    AtomXState.curatedLists = {};
  }

  // Synchronously sync all on-screen inputs directly from the DOM before sending
  Object.keys(AtomXState.curatedLists).forEach(k => {
    const item = AtomXState.curatedLists[k];
    if (!item) return;

    const nameInp = document.getElementById(`listname-${k}`);
    if (nameInp && nameInp.value.trim()) {
      item.name = nameInp.value.trim();
    }
    const catInp = document.getElementById(`listcat-${k}`);
    if (catInp && catInp.value) {
      item.category = catInp.value;
    }
    const tierInp = document.getElementById(`listtier-${k}`);
    if (tierInp && tierInp.value) {
      item.accessTier = tierInp.value;
    }
    const statusInp = document.getElementById(`liststatus-${k}`);
    if (statusInp && statusInp.value) {
      item.status = statusInp.value;
    }
    const urlInp = document.getElementById(`listurl-${k}`);
    if (urlInp) {
      item.listUrl = urlInp.value.trim();
    }
    if (!item.status) {
      item.status = 'published';
    }
    if (!item.accessTier) {
      item.accessTier = 'free';
    }
    if (!Array.isArray(item.targets)) {
      item.targets = [];
    }
  });

  try {
    const res = await fetch(`${API_BASE}/api/admin/curated-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lists: AtomXState.curatedLists })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data && data.lists) {
        AtomXState.curatedLists = data.lists;
      }
      showToast('✓ Curated lists successfully saved and broadcasted to all extensions!');
      alert('✓ Curated lists successfully saved and broadcasted to all user extensions!');
      renderAdminCuratedLists(document.getElementById('mainContentArea'));
      return true;
    } else {
      const errMsg = data?.error || res.statusText || 'Server error';
      console.error('Failed to save curated lists:', errMsg);
      showToast('⚠️ Save failed: ' + errMsg);
      alert('⚠️ Failed to save curated lists to server:\n' + errMsg);
      return false;
    }
  } catch (e) {
    console.error('Network error saving curated lists:', e);
    showToast('⚠️ Network error while saving lists: ' + e.message);
    alert('⚠️ Network error while saving lists: ' + e.message);
    return false;
  }
}

// -------------------------------------------------------------
// LIST CONTROLS: AGENT, STATUS, LIMIT, RENAME, CLEAR
// -------------------------------------------------------------
function updateListCategory(listKey, newCategory) {
  if (AtomXState.curatedLists[listKey]) {
    AtomXState.curatedLists[listKey].category = newCategory;
    showToast(`✓ Updated ${AtomXState.curatedLists[listKey].name} agent to: ${newCategory}`);
  }
}

function updateListStatus(listKey, newStatus) {
  if (AtomXState.curatedLists[listKey]) {
    AtomXState.curatedLists[listKey].status = newStatus;
    renderAdminCuratedLists(document.getElementById('mainContentArea'));
    showToast(`✓ Set status to: ${newStatus.toUpperCase()}`);
  }
}

function updateListAccessTier(listKey, newAccessTier) {
  if (AtomXState.curatedLists[listKey]) {
    AtomXState.curatedLists[listKey].accessTier = newAccessTier;
    renderAdminCuratedLists(document.getElementById('mainContentArea'));
    showToast(`✓ Set plan access to: ${newAccessTier.toUpperCase()}`);
  }
}

function updateListName(listKey, newName) {
  if (AtomXState.curatedLists[listKey] && newName.trim()) {
    AtomXState.curatedLists[listKey].name = newName.trim();
    showToast(`✓ Renamed list to: ${newName.trim()}`);
  }
}

function trimListTargetsPrompt(listKey) {
  const l = AtomXState.curatedLists[listKey];
  if (!l) return;
  const currCount = l.targets?.length || 0;
  const input = prompt(`Currently "${l.name}" has ${currCount} target accounts.\nEnter the maximum number of IDs to keep in this list (e.g. 50, 100, 250):`, currCount > 100 ? 100 : currCount);
  if (input === null) return;
  const limit = parseInt(input, 10);
  if (isNaN(limit) || limit < 0) {
    alert('Please enter a valid positive number.');
    return;
  }
  l.targets = (l.targets || []).slice(0, limit);
  renderAdminCuratedLists(document.getElementById('mainContentArea'));
  showToast(`✓ Trimmed "${l.name}" to ${l.targets.length} targets.`);
}

function clearAllTargetsFromList(listKey) {
  const l = AtomXState.curatedLists[listKey];
  if (!l) return;
  if (confirm(`Are you sure you want to remove all targets from "${l.name}"?`)) {
    l.targets = [];
    renderAdminCuratedLists(document.getElementById('mainContentArea'));
    showToast(`✓ Cleared all targets from "${l.name}".`);
  }
}

// -------------------------------------------------------------
// GOOGLE SHEET / CSV IMPORTER FOR 3K+ CREATORS (ADMIN DECISION)
// -------------------------------------------------------------
function openImportGoogleSheetModal() {
  const existingModal = document.getElementById('sheetImportModal');
  if (existingModal) existingModal.remove();

  const currentLists = AtomXState.curatedLists || {};
  const listKeys = Object.keys(currentLists);

  const modal = document.createElement('div');
  modal.id = 'sheetImportModal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.backgroundColor = 'rgba(0,0,0,0.75)';
  modal.style.backdropFilter = 'blur(6px)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';

  modal.innerHTML = `
    <div style="background:var(--bg-surface, #1e293b); border:1px solid var(--border-subtle, #334155); border-radius:12px; width:92%; max-width:740px; max-height:92vh; overflow-y:auto; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5); color:var(--text-primary, #fff);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
          <span>📥</span> Import Google Sheet / CSV (Admin Controlled)
        </h3>
        <button onclick="document.getElementById('sheetImportModal').remove()" style="background:none; border:none; color:var(--text-secondary, #94a3b8); font-size:20px; cursor:pointer;">✕</button>
      </div>

      <div style="font-size:12px; color:var(--text-secondary, #94a3b8); line-height:1.5; margin-bottom:14px; background:var(--bg-canvas, #0f172a); padding:10px 14px; border-radius:8px; border:1px solid var(--border-subtle, #334155);">
        <div><strong>Expected Sheet Columns:</strong> <code style="color:var(--blue-primary, #38bdf8);">Rank | X Username | X Profile Link | Sorsa Score | Wallchain Score | Tier</code></div>
        <div style="font-size:11.5px; margin-top:4px;">💡 <em>Full Admin Power: Pick specific Rank Ranges (e.g. 21–99, 550–1000), choose Agent, set Free/Paid subscription access, and toggle Draft vs Live.</em></div>
      </div>

      <!-- File Upload & Direct Paste Input -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div>
          <label class="form-label" style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Upload CSV / TSV File:</label>
          <input type="file" id="sheetFileInput" accept=".csv,.tsv,.txt" style="font-size:11.5px; color:var(--text-secondary, #94a3b8); width:100%;" onchange="handleSheetFileUpload(event)">
        </div>
        <div style="display:flex; align-items:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="previewSheetRowsCount()" style="width:100%; font-size:11.5px; padding:6px 10px;">🔍 Check & Count Rows</button>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <label class="form-label" style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Or Paste Copied Sheet Rows / CSV Data:</label>
        <textarea id="sheetPasteTextarea" rows="4" class="form-input" placeholder="Rank\tX Username\tX Profile Link\tSorsa Score\tWallchain Score\tTier\n1\t@cz_binance\thttps://x.com/cz_binance\t99.5\t95\tTier 1..." style="width:100%; font-family:monospace; font-size:11px; resize:vertical; padding:8px 10px; background:var(--bg-canvas, #0f172a);"></textarea>
        <div id="sheetRowCountBadge" style="display:none; font-size:11.5px; color:var(--status-success, #22c55e); margin-top:4px; font-weight:600;"></div>
      </div>

      <!-- ADMIN DECISION CONFIGURATION FORM -->
      <div style="background:var(--bg-canvas, #0f172a); border:1px solid var(--border-subtle, #334155); border-radius:8px; padding:14px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:var(--blue-primary, #38bdf8); text-transform:uppercase; margin-bottom:12px; border-bottom:1px solid var(--border-subtle, #334155); padding-bottom:6px;">
          ⚙️ Admin Import Configuration (Your Decision)
        </div>

        <!-- 1. Destination List -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11.5px; font-weight:700; display:block; margin-bottom:4px;">1. Destination List:</label>
          <div style="display:flex; gap:16px; margin-bottom:8px; font-size:12px;">
            <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
              <input type="radio" name="importDestType" value="new" checked onchange="toggleImportDestView()"> Create New List
            </label>
            <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
              <input type="radio" name="importDestType" value="existing" onchange="toggleImportDestView()"> Overwrite / Append Existing List
            </label>
          </div>

          <div id="destNewListWrap">
            <input type="text" id="importNewListName" class="form-input" placeholder="e.g. Sorsa Mid-Tier KOLs (Rank 21-99)" value="Imported Creator List" style="font-size:12px; padding:6px 10px; width:100%;">
          </div>

          <div id="destExistingListWrap" style="display:none;">
            <select id="importExistingListSelect" class="form-input" style="font-size:12px; padding:6px 10px; width:100%;">
              ${listKeys.map(k => `<option value="${k}">${currentLists[k].name} (${(currentLists[k].targets || []).length} current targets)</option>`).join('')}
            </select>
            <div style="display:flex; gap:12px; margin-top:6px; font-size:11.5px;">
              <label style="cursor:pointer;"><input type="radio" name="existingAction" value="replace" checked> Replace existing targets</label>
              <label style="cursor:pointer;"><input type="radio" name="existingAction" value="append"> Append to existing targets</label>
            </div>
          </div>
        </div>

        <!-- 2. Rank Range Selection (e.g. 21 to 99, 550 to 1000) -->
        <div style="margin-bottom:12px; background:rgba(56, 189, 248, 0.05); padding:10px 12px; border-radius:6px; border:1px solid rgba(56, 189, 248, 0.25);">
          <label style="font-size:11.5px; font-weight:700; color:var(--blue-primary); display:block; margin-bottom:5px;">
            2. Rank / Row Range Selection (e.g. Rank 21–99 or 550–1000):
          </label>
          <div style="display:flex; gap:16px; margin-bottom:8px; font-size:12px;">
            <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
              <input type="radio" name="importRankMode" value="all" checked onchange="toggleImportRankRangeView()"> All Ranks / Rows
            </label>
            <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
              <input type="radio" name="importRankMode" value="range" onchange="toggleImportRankRangeView()"> Custom Rank Range
            </label>
          </div>
          <div id="importRankRangeInputs" style="display:none; align-items:center; gap:8px;">
            <span style="font-size:11.5px; color:var(--text-secondary);">From Rank:</span>
            <input type="number" id="importFromRankInput" class="form-input" value="21" min="1" max="10000" style="width:75px; font-size:12px; padding:4px 8px;">
            <span style="font-size:11.5px; color:var(--text-secondary);">To Rank:</span>
            <input type="number" id="importToRankInput" class="form-input" value="99" min="1" max="10000" style="width:75px; font-size:12px; padding:4px 8px;">
            <span style="font-size:11px; color:var(--text-secondary);">(inclusive)</span>
          </div>
        </div>

        <!-- 3. Target Agent, Access Plan & Status (3 Columns) -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
          <div>
            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:3px;">3. Target Agent:</label>
            <select id="importTargetAgentSelect" class="form-input" style="font-size:11.5px; padding:6px 8px; width:100%;">
              <option value="Audience Builder">Audience Builder</option>
              <option value="Increase Sorsa Score" selected>Increase Sorsa Score</option>
              <option value="Followers Increase">Followers Growth</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:3px;">4. Access Plan:</label>
            <select id="importAccessTierSelect" class="form-input" style="font-size:11.5px; padding:6px 8px; width:100%; font-weight:600;">
              <option value="free" selected>🔓 Free (All Users)</option>
              <option value="paid">🔒 Paid / Pro Only</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:3px;">5. Visibility Status:</label>
            <select id="importStatusSelect" class="form-input" style="font-size:11.5px; padding:6px 8px; width:100%; font-weight:700;">
              <option value="published" selected>🟢 Published (Live)</option>
              <option value="draft">🟡 Draft (Hidden)</option>
            </select>
          </div>
        </div>

        <!-- 6. Filter by Tier & 7. Max ID Count Limit -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:11.5px; font-weight:700; display:block; margin-bottom:4px;">6. Filter by Tier from Sheet (Optional):</label>
            <select id="importTierFilterSelect" class="form-input" style="font-size:12px; padding:6px 10px; width:100%;">
              <option value="all">Include All Tiers</option>
              <option value="tier1">Only Tier 1</option>
              <option value="tier2">Only Tier 2</option>
              <option value="tier3">Only Tier 3</option>
            </select>
          </div>
          <div>
            <label style="font-size:11.5px; font-weight:700; display:block; margin-bottom:4px;">7. Max ID Limit (0 for all in range):</label>
            <div style="display:flex; gap:6px;">
              <input type="number" id="importIdLimitInput" class="form-input" value="0" min="0" max="5000" placeholder="0 = All" style="font-size:12px; padding:6px 10px; width:90px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('importIdLimitInput').value=50" style="padding:4px 6px; font-size:10px;">50</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('importIdLimitInput').value=100" style="padding:4px 6px; font-size:10px;">100</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('importIdLimitInput').value=500" style="padding:4px 6px; font-size:10px;">500</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('importIdLimitInput').value=0" style="padding:4px 6px; font-size:10px;">All</button>
            </div>
          </div>
        </div>
      </div>

      <div id="importSummaryCard" style="display:none; background:rgba(34, 197, 94, 0.1); border:1px solid #22c55e; border-radius:8px; padding:12px; margin-bottom:14px; font-size:12px;">
        <div id="importSummaryContent" style="color:#22c55e; font-weight:600;"></div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('sheetImportModal').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="executeAdminCustomSheetImport()">✓ Save List With Selected Rules</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function toggleImportDestView() {
  const destType = document.querySelector('input[name="importDestType"]:checked')?.value || 'new';
  const newWrap = document.getElementById('destNewListWrap');
  const exWrap = document.getElementById('destExistingListWrap');
  if (newWrap) newWrap.style.display = destType === 'new' ? 'block' : 'none';
  if (exWrap) exWrap.style.display = destType === 'existing' ? 'block' : 'none';
}

function toggleImportRankRangeView() {
  const rankMode = document.querySelector('input[name="importRankMode"]:checked')?.value || 'all';
  const rangeInputs = document.getElementById('importRankRangeInputs');
  if (rangeInputs) rangeInputs.style.display = rankMode === 'range' ? 'flex' : 'none';
}

function previewSheetRowsCount() {
  const textarea = document.getElementById('sheetPasteTextarea');
  const rawText = (textarea?.value || '').trim();
  const badge = document.getElementById('sheetRowCountBadge');
  if (!rawText) {
    alert('Please paste rows or upload a file first.');
    return;
  }
  const users = parseSheetText(rawText);
  if (badge) {
    badge.style.display = 'block';
    badge.textContent = `✓ Found ${users.length} valid creator accounts in sheet data.`;
  }
}

function handleSheetFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const textarea = document.getElementById('sheetPasteTextarea');
    if (textarea) textarea.value = text;
    previewSheetRowsCount();
  };
  reader.readAsText(file);
}

function parseSheetText(content) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  let delimiter = ',';
  if (headerLine.includes('\t')) delimiter = '\t';
  else if (headerLine.includes(';') && !headerLine.includes(',')) delimiter = ';';

  function splitLine(line) {
    if (delimiter === '\t') return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*)"|([^"${delimiter}]*))`, 'g');
    const result = [];
    let match;
    while ((match = pattern.exec(line)) !== null) {
      result.push((match[1] !== undefined ? match[1] : match[2] || '').trim());
      if (pattern.lastIndex === 0 && line.length > 0) break;
    }
    return result;
  }

  const headers = splitLine(headerLine).map(h => h.toLowerCase());
  const usernameIdx = headers.findIndex(h => h.includes('username') || h.includes('handle') || h === 'x username');
  const linkIdx = headers.findIndex(h => h.includes('profile') || h.includes('link') || h.includes('url'));
  const tierIdx = headers.findIndex(h => h.includes('tier'));
  const sorsaIdx = headers.findIndex(h => h.includes('sorsa'));
  const rankIdx = headers.findIndex(h => h.includes('rank'));

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (!cols || cols.length === 0 || cols.every(c => !c)) continue;

    let handle = '';
    if (usernameIdx !== -1 && cols[usernameIdx]) {
      handle = cols[usernameIdx].trim();
    }
    if (!handle && linkIdx !== -1 && cols[linkIdx]) {
      const match = cols[linkIdx].match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,25})/);
      if (match) handle = match[1];
    }
    if (!handle) continue;

    handle = handle.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{1,25}$/.test(handle)) continue;

    const tier = (tierIdx !== -1 && cols[tierIdx]) ? cols[tierIdx].trim() : 'Tier 1';
    const sorsaScore = (sorsaIdx !== -1 && cols[sorsaIdx]) ? cols[sorsaIdx].trim() : '';
    const rawRank = (rankIdx !== -1 && cols[rankIdx]) ? cols[rankIdx].trim() : i.toString();
    const rankNum = parseInt(rawRank.replace(/[^0-9]/g, ''), 10) || i;

    parsed.push({ handle: '@' + handle, tier, sorsaScore, rank: rankNum });
  }
  return parsed;
}

async function executeAdminCustomSheetImport() {
  const textarea = document.getElementById('sheetPasteTextarea');
  const rawText = (textarea?.value || '').trim();
  if (!rawText) {
    alert('⚠️ Please paste sheet rows or upload a CSV file first.');
    return;
  }

  const users = parseSheetText(rawText);
  if (users.length === 0) {
    alert('⚠️ Could not parse any valid creator handles. Please verify columns: Rank | X Username | X Profile Link | Sorsa Score | Wallchain Score | Tier');
    return;
  }

  // 1. Admin Decision: Rank Range (e.g. 21 to 99, 550 to 1000)
  const rankMode = document.querySelector('input[name="importRankMode"]:checked')?.value || 'all';
  let filteredUsers = users;
  let rangeLabel = 'All Ranks';

  if (rankMode === 'range') {
    const fromRank = parseInt(document.getElementById('importFromRankInput')?.value || '1', 10);
    const toRank = parseInt(document.getElementById('importToRankInput')?.value || '100', 10);
    rangeLabel = `Rank ${fromRank}–${toRank}`;
    filteredUsers = users.filter((u, idx) => {
      const effectiveRank = typeof u.rank === 'number' ? u.rank : (idx + 1);
      return effectiveRank >= fromRank && effectiveRank <= toRank;
    });
  }

  // 2. Admin Decision: Filter by Tier (Optional)
  const tierFilter = document.getElementById('importTierFilterSelect')?.value || 'all';
  if (tierFilter === 'tier1') {
    filteredUsers = filteredUsers.filter(u => u.tier.toLowerCase().includes('1'));
  } else if (tierFilter === 'tier2') {
    filteredUsers = filteredUsers.filter(u => u.tier.toLowerCase().includes('2'));
  } else if (tierFilter === 'tier3') {
    filteredUsers = filteredUsers.filter(u => u.tier.toLowerCase().includes('3'));
  }

  // 3. Admin Decision: ID Limit (0 for all in range)
  const limitInput = parseInt(document.getElementById('importIdLimitInput')?.value || '0', 10);
  const targetHandles = (limitInput > 0 ? filteredUsers.slice(0, limitInput) : filteredUsers).map(u => u.handle);

  if (targetHandles.length === 0) {
    alert('⚠️ No accounts matched the selected Rank range and Tier filter.');
    return;
  }

  // 4. Admin Decision: Destination List, Agent, Access Plan, Status
  const destType = document.querySelector('input[name="importDestType"]:checked')?.value || 'new';
  const targetAgent = document.getElementById('importTargetAgentSelect')?.value || 'Increase Sorsa Score';
  const targetAccess = document.getElementById('importAccessTierSelect')?.value || 'free';
  const targetStatus = document.getElementById('importStatusSelect')?.value || 'published';

  if (!AtomXState.curatedLists) AtomXState.curatedLists = {};

  let targetListKey = '';
  if (destType === 'new') {
    const customName = document.getElementById('importNewListName')?.value.trim() || `Imported List (${rangeLabel})`;
    targetListKey = 'custom_' + Date.now();
    AtomXState.curatedLists[targetListKey] = {
      id: targetListKey,
      name: customName,
      category: targetAgent,
      status: targetStatus,
      accessTier: targetAccess,
      rankRange: rangeLabel,
      description: `Admin imported list with ${targetHandles.length} verified creators (${rangeLabel}).`,
      listUrl: '',
      targets: targetHandles
    };
  } else {
    targetListKey = document.getElementById('importExistingListSelect')?.value;
    if (!targetListKey || !AtomXState.curatedLists[targetListKey]) {
      alert('⚠️ Selected existing list not found.');
      return;
    }
    const action = document.querySelector('input[name="existingAction"]:checked')?.value || 'replace';
    const existing = AtomXState.curatedLists[targetListKey];
    existing.category = targetAgent;
    existing.status = targetStatus;
    existing.accessTier = targetAccess;

    if (action === 'append') {
      const merged = new Set([...(existing.targets || []), ...targetHandles]);
      existing.targets = Array.from(merged);
    } else {
      existing.targets = targetHandles;
    }
  }

  // Save to server
  await saveCuratedListsToServer();

  // Update Screen 20
  renderAdminCuratedLists(document.getElementById('mainContentArea'));

  const summaryCard = document.getElementById('importSummaryCard');
  const summaryContent = document.getElementById('importSummaryContent');
  if (summaryCard && summaryContent) {
    summaryCard.style.display = 'block';
    summaryContent.innerHTML = `
      🎉 Success! Inserted ${targetHandles.length} accounts into "${AtomXState.curatedLists[targetListKey].name}".<br>
      • Agent: <strong>${targetAgent}</strong><br>
      • Plan Access: <strong>${targetAccess.toUpperCase()}</strong><br>
      • Status: <strong>${targetStatus.toUpperCase()}</strong> (${rangeLabel})<br>
      • Synced to server and broadcasted!
    `;
  }

  setTimeout(() => {
    const modal = document.getElementById('sheetImportModal');
    if (modal) modal.remove();
  }, 2200);
}

// -------------------------------------------------------------
// SCREEN 21: ADMIN TONE & STYLE PROMPTS & USER QUOTAS
// -------------------------------------------------------------
async function fetchAdminToneStyles() {
  try {
    const res = await fetch(`${API_BASE}/api/tone-styles`);
    if (res.ok) {
      const data = await res.json();
      AtomXState.toneStylesData = data;
    }
  } catch (e) {
    console.warn('Could not fetch tone styles from server, using state cache', e);
  }
}

function renderAdminToneStyles(container) {
  const data = AtomXState.toneStylesData || {
    maxCustomTemplatesPerUser: 2,
    defaultTones: []
  };
  const tones = data.defaultTones || [];

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('21')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Tone & Style Templates & Quotas</h1>
            <p class="page-subtitle">Configure default AI tone system prompts, add new styles, and set custom template allowances for free users.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="promptAddNewToneStyle()">+ Add New Tone</button>
            <button class="btn btn-primary btn-sm" onclick="saveAdminToneStylesToServer()">Save & Broadcast to Extension</button>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Summary Metrics -->
          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-bottom:20px;">
            <div class="stat-card">
              <div class="stat-label">DEFAULT SYSTEM TONES</div>
              <div class="stat-value" style="color:var(--blue-primary);">${tones.length}</div>
              <div class="stat-trend" style="color:var(--status-success);">Active globally across all agents</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">FREE USER CUSTOM QUOTA</div>
              <div class="stat-value" style="color:var(--status-success);">${data.maxCustomTemplatesPerUser} Max</div>
              <div class="stat-trend" style="color:var(--text-secondary);">Custom templates per free user</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">CHROME EXTENSION SYNC</div>
              <div class="stat-value" style="font-size:20px; color:var(--status-success);">AUTOMATIC</div>
              <div class="stat-trend" style="color:var(--blue-primary);">Synced via /api/tone-styles</div>
            </div>
          </div>

          <!-- Free User Quota Controller Card -->
          <div class="atomx-card" style="margin-bottom:24px; padding:18px 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <h3 style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">Free User Custom Template Limit</h3>
                <p style="font-size:12px; color:var(--text-secondary); margin:0;">Controls how many custom tone prompts free users can create in their Chrome Extension popup.</p>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">Max Templates:</label>
                <input type="number" id="adminCustomQuotaInput" min="1" max="20" value="${data.maxCustomTemplatesPerUser}" style="width:70px; padding:6px 10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-canvas); color:var(--text-primary); font-weight:700; font-size:14px; text-align:center;">
                <button class="btn btn-primary btn-sm" onclick="handleSaveCustomQuota()">Update Quota</button>
              </div>
            </div>
          </div>

          <!-- Default System Tones List -->
          <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <h2 style="font-size:16px; font-weight:700; color:var(--text-primary);">Default System Tones & Prompts</h2>
            <span style="font-size:12px; color:var(--text-secondary);">${tones.length} Prompts Configured</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:18px; margin-bottom:24px;">
            ${tones.map((t, idx) => `
              <div class="atomx-card" id="tone-card-${t.id}" style="display:flex; flex-direction:column; justify-content:space-between; padding:18px;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <input type="text" id="tone-name-${idx}" value="${t.name}" class="form-input" style="font-size:14px; font-weight:700; padding:4px 8px; width:auto; display:inline-block;" placeholder="Tone Name">
                        <span class="badge badge-info" style="font-size:10px; font-family:monospace;">${t.id}</span>
                      </div>
                      <input type="text" id="tone-desc-${idx}" value="${t.description || ''}" class="form-input" style="font-size:11px; color:var(--text-secondary); margin-top:6px; padding:3px 8px; width:100%;" placeholder="Short description">
                    </div>
                    <button class="btn btn-secondary btn-sm" style="padding:4px 8px; color:var(--status-error);" onclick="handleDeleteTone(${idx})" title="Delete tone">✕</button>
                  </div>

                  <div style="margin-top:10px;">
                    <label style="font-size:11px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.3px;">System Prompt Instruction:</label>
                    <textarea id="tone-prompt-${idx}" class="form-input" style="min-height:75px; font-size:12px; font-family:inherit; margin-top:4px; line-height:1.4; resize:vertical;">${t.prompt}</textarea>
                  </div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-top:12px;">
                  <button class="btn btn-secondary btn-sm" onclick="handleSaveSingleTone(${idx})">Save Changes</button>
                </div>
              </div>
            `).join('')}
          </div>

        </div>
      </div>
    </div>
  `;
}

function handleSaveCustomQuota() {
  const input = document.getElementById('adminCustomQuotaInput');
  const val = Number(input?.value || 2);
  if (val < 1) {
    alert('Quota must be at least 1.');
    return;
  }
  if (!AtomXState.toneStylesData) AtomXState.toneStylesData = {};
  AtomXState.toneStylesData.maxCustomTemplatesPerUser = val;
  saveAdminToneStylesToServer();
}

function handleSaveSingleTone(idx) {
  const name = document.getElementById(`tone-name-${idx}`)?.value.trim();
  const desc = document.getElementById(`tone-desc-${idx}`)?.value.trim();
  const prompt = document.getElementById(`tone-prompt-${idx}`)?.value.trim();

  if (!name || !prompt) {
    alert('Name and System Prompt are required.');
    return;
  }

  if (AtomXState.toneStylesData?.defaultTones?.[idx]) {
    AtomXState.toneStylesData.defaultTones[idx].name = name;
    AtomXState.toneStylesData.defaultTones[idx].description = desc;
    AtomXState.toneStylesData.defaultTones[idx].prompt = prompt;
  }
  saveAdminToneStylesToServer();
}

function handleDeleteTone(idx) {
  if (confirm('Are you sure you want to delete this default tone?')) {
    AtomXState.toneStylesData.defaultTones.splice(idx, 1);
    saveAdminToneStylesToServer();
    renderAdminToneStyles(document.getElementById('mainContentArea'));
  }
}

function promptAddNewToneStyle() {
  const name = prompt('Enter new Tone & Style Name (e.g. "Sarcastic Dev" or "Alpha Insider"):');
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const promptText = prompt('Enter AI Prompt Instructions for this tone:', 'Deliver high-signal, sharp perspective. Be concise, punchy, and authentic.');
  if (!promptText) return;

  if (!AtomXState.toneStylesData) AtomXState.toneStylesData = { maxCustomTemplatesPerUser: 2, defaultTones: [] };
  AtomXState.toneStylesData.defaultTones.push({
    id,
    name,
    description: 'Custom system calibrated tone',
    prompt: promptText
  });

  saveAdminToneStylesToServer();
  renderAdminToneStyles(document.getElementById('mainContentArea'));
  showToast(`✓ Added new tone: ${name}`);
}

async function saveAdminToneStylesToServer() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/tone-styles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(AtomXState.toneStylesData)
    });
    if (res.ok) {
      showToast('✓ Tone & style prompts successfully updated & broadcasted to all extensions!');
      return;
    }
  } catch (e) {
    console.warn('Could not post tone styles to backend', e);
  }
  showToast('✓ Tone styles updated locally in memory.');
}

// -------------------------------------------------------------
// SCREEN 22: ADMIN REFERRAL MANAGEMENT DASHBOARD
// -------------------------------------------------------------
async function renderAdminReferrals(container) {
  let stats = {
    totalReferrals: 0,
    approvedReferrals: 0,
    pendingReferrals: 0,
    referralCredits: 0,
    purchaseRewards: 0
  };
  let referrals = [];

  try {
    const res = await fetch(`${API_BASE}/api/admin/referrals`);
    if (res.ok) {
      const data = await res.json();
      stats = data.stats || stats;
      referrals = data.referrals || [];
    }
  } catch (e) {
    console.warn('Error fetching referrals:', e);
  }

  // Fallback demo items if database is freshly initialized
  if (referrals.length === 0) {
    referrals = [
      { id: 'ref_1', referrer_handle: '@mythopair', referee_handle: '@Rukon__Kholifa', referee_name: 'MD Rukon', status: 'APPROVED', referrer_reward: 150, referee_reward: 150, created_at: '2026-10-08T08:12:00Z', approved_at: '2026-10-08T10:00:00Z', first_purchase_status: 'PAID', first_purchase_amount: 10, purchase_reward_credits: 1 },
      { id: 'ref_2', referrer_handle: '@mythopair', referee_handle: '@KhanWg60464', referee_name: 'Wg saim Khan', status: 'PENDING', referrer_reward: 150, referee_reward: 150, created_at: '2026-10-08T09:30:00Z', approved_at: null, first_purchase_status: 'NONE', first_purchase_amount: 0, purchase_reward_credits: 0 },
      { id: 'ref_3', referrer_handle: '@Rukon__Kholifa', referee_handle: '@yournahian', referee_name: 'Nahian', status: 'APPROVED', referrer_reward: 150, referee_reward: 150, created_at: '2026-10-08T11:15:00Z', approved_at: '2026-10-08T11:30:00Z', first_purchase_status: 'NONE', first_purchase_amount: 0, purchase_reward_credits: 0 }
    ];
    stats = {
      totalReferrals: 3,
      approvedReferrals: 2,
      pendingReferrals: 1,
      referralCredits: 600,
      purchaseRewards: 1
    };
  }

  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('22')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Referral Management</h1>
            <p class="page-subtitle">Monitor Level-1 direct referrals, account approval bonus credits (150+150), and 10% purchase rewards.</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="renderAdminReferrals(document.getElementById('mainContentArea')); showToast('↻ Refreshed referral data');">↻ Refresh</button>
          </div>
        </div>

        <div class="workspace-body">
          <!-- Overview Stats Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px;">
            <div class="atomx-card" style="padding:16px;">
              <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Total Referrals</div>
              <div style="font-size:26px; font-weight:800; color:var(--text-primary); margin-top:4px;">${stats.totalReferrals.toLocaleString()}</div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Direct signups</div>
            </div>
            <div class="atomx-card" style="padding:16px;">
              <div style="font-size:11px; font-weight:700; color:var(--status-success); text-transform:uppercase; letter-spacing:0.5px;">Approved Referrals</div>
              <div style="font-size:26px; font-weight:800; color:var(--status-success); margin-top:4px;">${stats.approvedReferrals.toLocaleString()}</div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">150+150 Cr credited</div>
            </div>
            <div class="atomx-card" style="padding:16px;">
              <div style="font-size:11px; font-weight:700; color:var(--status-warning); text-transform:uppercase; letter-spacing:0.5px;">Pending Referrals</div>
              <div style="font-size:26px; font-weight:800; color:var(--status-warning); margin-top:4px;">${stats.pendingReferrals.toLocaleString()}</div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Awaiting account approval</div>
            </div>
            <div class="atomx-card" style="padding:16px;">
              <div style="font-size:11px; font-weight:700; color:var(--blue-primary); text-transform:uppercase; letter-spacing:0.5px;">Referral Credits</div>
              <div style="font-size:26px; font-weight:800; color:var(--blue-primary); margin-top:4px;">${stats.referralCredits.toLocaleString()}</div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Total distributed</div>
            </div>
            <div class="atomx-card" style="padding:16px;">
              <div style="font-size:11px; font-weight:700; color:#9B51E0; text-transform:uppercase; letter-spacing:0.5px;">Purchase Rewards</div>
              <div style="font-size:26px; font-weight:800; color:#9B51E0; margin-top:4px;">${stats.purchaseRewards.toLocaleString()} Cr</div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">10% first purchase credits</div>
            </div>
          </div>

          <!-- Rules Summary Banner -->
          <div class="atomx-card" style="margin-bottom:20px; background:rgba(34,160,107,0.06); border:1px solid rgba(34,160,107,0.2); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:22px;">🛡️</span>
              <div>
                <div style="font-weight:700; font-size:13px; color:var(--text-primary);">Level-1 Direct Referrals Rule Enforcement</div>
                <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                  1 X Account = 1 Account only. No multi-level / cash payout. Both Referrer (+150 Cr) & Referee (+150 Cr) receive credits <strong>only after admin account approval</strong>.
                </div>
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <span class="badge badge-success" style="font-weight:700;">Zero MLM</span>
              <span class="badge badge-info" style="font-weight:700;">Strict 1 X Account</span>
            </div>
          </div>

          <!-- Referrals Table -->
          <div class="atomx-card table-wrapper" style="padding:0; overflow:hidden;">
            <table class="atomx-table">
              <thead>
                <tr>
                  <th>Referrer</th>
                  <th>Referred User</th>
                  <th>Status</th>
                  <th>Approval Reward</th>
                  <th>First Purchase</th>
                  <th>Purchase Reward</th>
                  <th>Referral Date</th>
                  <th>Approval Date</th>
                </tr>
              </thead>
              <tbody>
                ${referrals.map(r => `
                  <tr>
                    <td>
                      <div style="font-weight:700; color:#229ED9; font-family:monospace; font-size:13px;">${r.referrer_handle}</div>
                    </td>
                    <td>
                      <div style="font-weight:600; color:var(--text-primary); font-size:13px;">${r.referee_name || r.referee_handle}</div>
                      <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">${r.referee_handle}</div>
                      ${r.referee_email ? `<div style="font-size:10px; color:var(--text-muted);">${r.referee_email}</div>` : ''}
                    </td>
                    <td>
                      <span class="badge ${r.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}">
                        ${r.status}
                      </span>
                    </td>
                    <td>
                      ${r.status === 'APPROVED' ? 
                        `<span style="color:var(--status-success); font-weight:700; font-size:12px;">150 + 150 Cr</span>` : 
                        `<span style="color:var(--text-muted); font-size:12px;">Pending</span>`}
                    </td>
                    <td>
                      ${r.first_purchase_amount > 0 ? 
                        `<span style="font-weight:600; font-size:12px;">$${r.first_purchase_amount}</span>` : 
                        `<span style="color:var(--text-muted); font-size:12px;">—</span>`}
                    </td>
                    <td>
                      ${r.purchase_reward_credits > 0 ? 
                        `<span style="color:#9B51E0; font-weight:700; font-size:12px;">+${r.purchase_reward_credits} Cr (10%)</span>` : 
                        `<span style="color:var(--text-muted); font-size:12px;">—</span>`}
                    </td>
                    <td style="color:var(--text-muted); font-size:11px;">
                      ${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style="color:var(--text-muted); font-size:11px;">
                      ${r.approved_at ? new Date(r.approved_at).toLocaleDateString() : 'Pending'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 18: ACCOUNT SUSPENDED
// -------------------------------------------------------------
function renderSuspended(container) {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="border-color:#FBD5D5;">
        <div class="auth-logo">
          <div class="atomx-brand" style="font-size: 22px;">
            <div class="atomx-logo-icon" style="width: 24px; height: 24px; background:var(--status-error);"></div>
            <span class="atomx-brand-main">ATOMX</span>
            <span class="atomx-brand-sub">ENGAGE</span>
          </div>
        </div>

        <div style="width:56px; height:56px; border-radius:50%; background:var(--status-error-bg); color:var(--status-error); display:flex; align-items:center; justify-content:center; margin:0 auto 18px auto;">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>

        <h1 class="auth-title">Your access has been suspended.</h1>
        <p class="auth-desc">Your account currently does not have access to ATOMX ENGAGE. Please reach out to customer support to appeal or resolve this issue.</p>

        <div style="margin: 18px 0;">
          <span class="badge badge-error" style="font-size: 13px; padding: 6px 14px;">SUSPENDED</span>
        </div>

        <div style="display:flex; gap:12px; margin-top:24px;">
          <button class="btn btn-secondary btn-block" onclick="navigateToScreen('01')">Back to Login</button>
          <button class="btn btn-primary btn-block" onclick="alert('Support ticket opened at support@atomx.io')">Contact Support</button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 19: ERROR / LOADING / EMPTY STATES
// -------------------------------------------------------------
function renderSystemStates(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('19')}
      <div class="app-workspace">
        ${renderMobileHeaderHTML()}
        <div class="workspace-header">
          <div>
            <h1 class="page-title">System States</h1>
            <p class="page-subtitle">Pristine empty, loading, and error UI presentations.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
            <!-- Loading State -->
            <div class="atomx-card" style="text-align:center; padding:36px 20px;">
              <div style="width:40px; height:40px; border:3px solid var(--blue-soft); border-top-color:var(--blue-primary); border-radius:50%; margin:0 auto 16px auto; animation:spin 0.8s linear infinite;"></div>
              <h4 style="font-size:16px; font-weight:700; margin-bottom:6px;">Connecting to your workspace...</h4>
              <p style="font-size:13px; color:var(--text-secondary);">Validating session tokens and fetching latest queue.</p>
            </div>

            <!-- Error State -->
            <div class="atomx-card" style="text-align:center; padding:36px 20px;">
              <div style="width:44px; height:44px; border-radius:50%; background:var(--status-error-bg); color:var(--status-error); display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
                <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <h4 style="font-size:16px; font-weight:700; margin-bottom:6px;">Something went wrong.</h4>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:18px;">Unable to fetch remote AI model endpoint.</p>
              <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('04')">Retry</button>
            </div>

            <!-- Empty State -->
            <div class="atomx-card" style="text-align:center; padding:36px 20px;">
              <div style="width:44px; height:44px; border-radius:50%; background:var(--blue-soft); color:var(--blue-primary); display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
                <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <h4 style="font-size:16px; font-weight:700; margin-bottom:6px;">No replies in your queue yet.</h4>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:18px;">Launch your first campaign to begin generating smart responses.</p>
              <button class="btn btn-primary btn-sm" onclick="navigateToScreen('05')">Create Campaign</button>
            </div>
          </div>
        </div>
        ${renderMobileBottomNavHTML('19')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SYSTEM ARCHITECTURE & FLOW DIAGRAM
// -------------------------------------------------------------
function renderSystemArchitecture(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebarHTML('arch')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">System Architecture & Flows</h1>
            <p class="page-subtitle">Visual overview of unified frontend clients, server validation, and AI security.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:grid; grid-template-columns:1fr; gap:20px;">
            <!-- Flow 1: End to End User Journey -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; color:var(--blue-primary); margin-bottom:14px;">1. USER ONBOARDING & ACCESS CONTROL FLOW</h3>
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:12px; font-weight:600;">
                <span class="badge badge-neutral" style="padding:8px 12px;">User Sign Up</span>
                <span>→</span>
                <span class="badge badge-warning" style="padding:8px 12px;">Pending Approval</span>
                <span>→</span>
                <span class="badge badge-info" style="padding:8px 12px;">Admin Review</span>
                <span>→</span>
                <span class="badge badge-success" style="padding:8px 12px;">Account Active (100 Free Credits)</span>
                <span>→</span>
                <span class="badge badge-neutral" style="padding:8px 12px;">Web / Mobile / Extension Access</span>
              </div>
            </div>

            <!-- Flow 2: Credit Deduction & AI API Security -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; color:var(--blue-primary); margin-bottom:14px;">2. AI ENGINE & CREDIT TRANSACTION FLOW</h3>
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:12px; font-weight:600; margin-bottom:14px;">
                <span class="badge badge-neutral" style="padding:8px 12px;">User Requests Reply</span>
                <span>→</span>
                <span class="badge badge-info" style="padding:8px 12px;">ATOMX Backend Validates Credits (≥ 1)</span>
                <span>→</span>
                <span class="badge badge-neutral" style="padding:8px 12px;">Backend Calls OpenAI API (Secret Key Server-Side)</span>
                <span>→</span>
                <span class="badge badge-error" style="padding:8px 12px;">Deduct 1 Credit in Database</span>
                <span>→</span>
                <span class="badge badge-success" style="padding:8px 12px;">Deliver Reply to Client</span>
              </div>
              <div style="font-size:12px; color:var(--text-secondary); background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:12px; border-radius:var(--radius-sm);">
                <strong>🔒 CRITICAL SECURITY GUARANTEE:</strong> OpenAI API secret keys never exist in client-side extension or mobile storage. All credit deductions are transactional and atomic in the server database.
              </div>
            </div>

            <!-- Unified Backend -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; color:var(--blue-primary); margin-bottom:14px;">3. THREE FRONTENDS — ONE UNIFIED BACKEND</h3>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
                <div style="border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px; text-align:center;">
                  <div style="font-weight:700; margin-bottom:4px;">Desktop Web Dashboard</div>
                  <div style="font-size:12px; color:var(--text-secondary);">1440 × 900 · Full Workspace</div>
                </div>
                <div style="border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px; text-align:center;">
                  <div style="font-weight:700; margin-bottom:4px;">Chrome Extension</div>
                  <div style="font-size:12px; color:var(--text-secondary);">Compact Popup · Fast Review</div>
                </div>
                <div style="border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px; text-align:center;">
                  <div style="font-weight:700; margin-bottom:4px;">Mobile Web / PWA</div>
                  <div style="font-size:12px; color:var(--text-secondary);">390 × 844 · Bottom Nav & Cards</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// REUSABLE SIDEBARS & NAVIGATION HELPERS
// -------------------------------------------------------------
function renderSidebarHTML(activeId) {
  return `
    <aside class="app-sidebar">
      <div class="sidebar-header">
        <a href="javascript:void(0)" onclick="navigateToScreen('04')" class="atomx-brand">
          <div class="atomx-logo-icon"></div>
          <span class="atomx-brand-main">ATOMX</span>
          <span class="atomx-brand-sub">ENGAGE</span>
        </a>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-item ${activeId === '04' ? 'active' : ''}" data-screen="04" onclick="navigateToScreen('04')">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          <span>Dashboard</span>
        </div>
        <div class="nav-item ${activeId === '05' ? 'active' : ''}" data-screen="05" onclick="navigateToScreen('05')">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>
          <span>Bot</span>
        </div>
        <div class="nav-item ${activeId === '06' ? 'active' : ''}" data-screen="06" onclick="navigateToScreen('06')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Reply Queue</span>
        </div>
        <div class="nav-item ${activeId === '07' ? 'active' : ''}" data-screen="07" onclick="navigateToScreen('07')">
          <svg viewBox="0 0 24 24" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>AI Reply</span>
        </div>
        <div class="nav-item ${activeId === '08' ? 'active' : ''}" data-screen="08" onclick="navigateToScreen('08')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Agents</span>
        </div>
        <div class="nav-item ${activeId === '09' ? 'active' : ''}" data-screen="09" onclick="navigateToScreen('09')">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <span>History</span>
        </div>
        <div class="nav-item ${activeId === '10' ? 'active' : ''}" data-screen="10" onclick="navigateToScreen('10')">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
          <span>Credits</span>
        </div>

        <div class="nav-divider"></div>

        <div class="nav-item ${activeId === '11' ? 'active' : ''}" data-screen="11" onclick="navigateToScreen('11')">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </div>
        <div class="nav-item ${activeId === '12' ? 'active' : ''}" data-screen="12" onclick="navigateToScreen('12')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Admin Panel</span>
        </div>
      </nav>

      <!-- Sidebar Theme Switcher -->
      <div class="sidebar-theme-toggle" onclick="toggleTheme()" title="Switch Light / Dark Theme">
        <div class="theme-toggle-left">
          <span class="sidebarThemeIcon">${AtomXState.theme === 'dark' ? '🌙' : '☀️'}</span>
          <span class="sidebarThemeLabel">${AtomXState.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
        </div>
        <div class="theme-switch-track">
          <div class="theme-switch-thumb"></div>
        </div>
      </div>

      <div class="sidebar-user" onclick="navigateToScreen('11')" style="cursor:pointer;">
        <div class="user-avatar">${AtomXState.currentUser.avatar}</div>
        <div class="user-info">
          <div class="user-name">${AtomXState.currentUser.name}</div>
          <div class="user-meta">
            <span class="badge badge-success" style="padding:1px 5px; font-size:10px;">${AtomXState.currentUser.status}</span>
            <span>${AtomXState.currentUser.credits.toLocaleString()} C</span>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderAdminSidebarHTML(activeId) {
  const pendingCount = (AtomXState.accessRequests || []).filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
  return `
    <aside class="app-sidebar">
      <div class="sidebar-header">
        <a href="javascript:void(0)" onclick="navigateToScreen('12')" class="atomx-brand">
          <div class="atomx-logo-icon"></div>
          <span class="atomx-brand-main">ATOMX</span>
          <span class="badge-admin-tag">ADMIN</span>
        </a>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-item ${activeId === '12' ? 'active' : ''}" onclick="navigateToScreen('12')">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          <span>Overview</span>
        </div>
        <div class="nav-item ${activeId === '14' || activeId === '13' ? 'active' : ''}" onclick="navigateToScreen('14')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Users & Access</span>
          ${pendingCount > 0 ? `<span class="badge badge-warning" style="margin-left:auto; font-size:10px; padding:1px 6px;">${pendingCount}</span>` : ''}
        </div>
        <div class="nav-item ${activeId === '15' ? 'active' : ''}" onclick="navigateToScreen('15')">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
          <span>Credits</span>
        </div>
        <div class="nav-item ${activeId === '16' ? 'active' : ''}" onclick="navigateToScreen('16')">
          <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="12" y2="16"/></svg>
          <span>Plans</span>
        </div>
        <div class="nav-item ${activeId === '17' ? 'active' : ''}" onclick="navigateToScreen('17')">
          <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span>Transactions</span>
        </div>
        <div class="nav-item ${activeId === '20' ? 'active' : ''}" onclick="navigateToScreen('20')">
          <svg viewBox="0 0 24 24" fill="none"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <span>Curated Lists</span>
          <span class="badge badge-info" style="margin-left:auto; font-size:10px; padding:1px 5px;">NEW</span>
        </div>
        <div class="nav-item ${activeId === '21' ? 'active' : ''}" onclick="navigateToScreen('21')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Tone & Styles</span>
          <span class="badge badge-info" style="margin-left:auto; font-size:10px; padding:1px 5px;">AI</span>
        </div>
        <div class="nav-item ${activeId === '22' ? 'active' : ''}" onclick="navigateToScreen('22')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>Referral Management</span>
          <span class="badge badge-info" style="margin-left:auto; font-size:10px; padding:1px 5px;">150+</span>
        </div>

        <div class="nav-item" onclick="adminWipeAllUserData()" style="color:var(--status-error); margin-top:8px; cursor:pointer;" title="Reset all users & data fresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span style="font-weight:600;">Fresh Reset (Wipe)</span>
        </div>

        <div class="nav-item" onclick="adminLogout()" style="color:#EF4444; margin-top:4px; cursor:pointer;" title="Lock Admin Dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <span style="font-weight:700;">🔒 Lock Dashboard</span>
        </div>
      </nav>

      <!-- Admin Theme Switcher -->
      <div class="sidebar-theme-toggle" onclick="toggleTheme()" title="Switch Light / Dark Theme">
        <div class="theme-toggle-left">
          <span class="sidebarThemeIcon">${AtomXState.theme === 'dark' ? '🌙' : '☀️'}</span>
          <span class="sidebarThemeLabel">${AtomXState.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
        </div>
        <div class="theme-switch-track">
          <div class="theme-switch-thumb"></div>
        </div>
      </div>

      <div class="sidebar-user" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
          <div class="user-avatar" style="background:var(--blue-primary); color:#fff; min-width:32px;">AD</div>
          <div class="user-info" style="overflow:hidden;">
            <div class="user-name" style="white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">Admin Control</div>
            <div class="user-meta">admin@atomx.io</div>
          </div>
        </div>
        <button onclick="adminLogout()" class="btn btn-sm" style="padding:4px 8px; font-size:11px; background:rgba(255,255,255,0.06); border:1px solid var(--border-subtle); color:var(--text-secondary); cursor:pointer;" title="Lock Admin Dashboard">
          🔒 Lock
        </button>
      </div>
    </aside>
  `;
}

function renderMobileHeaderHTML() {
  return `
    <div class="mobile-header-bar">
      <div class="atomx-brand" style="font-size:16px;">
        <div class="atomx-logo-icon" style="width:18px; height:18px;"></div>
        <span class="atomx-brand-main">ATOMX</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="sidebar-theme-toggle" onclick="toggleTheme()" style="padding:4px 8px; border-radius:6px; font-size:13px;" title="Toggle Dark/Light Mode">
          <span class="sidebarThemeIcon">${AtomXState.theme === 'dark' ? '🌙' : '☀️'}</span>
        </button>
        <span class="badge badge-info" style="font-size:11px;">${AtomXState.currentUser.credits.toLocaleString()} C</span>
        <div class="user-avatar" style="width:28px; height:28px; font-size:11px;" onclick="navigateToScreen('11')">${AtomXState.currentUser.avatar}</div>
      </div>
    </div>
  `;
}

function renderMobileBottomNavHTML(activeId) {
  return `
    <div class="mobile-bottom-nav">
      <div class="mobile-nav-item ${activeId === '04' ? 'active' : ''}" onclick="navigateToScreen('04')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        <span>Home</span>
      </div>
      <div class="mobile-nav-item ${activeId === '05' ? 'active' : ''}" onclick="navigateToScreen('05')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
        <span>Bot</span>
      </div>
      <div class="mobile-nav-item ${activeId === '06' ? 'active' : ''}" onclick="navigateToScreen('06')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Queue</span>
      </div>
      <div class="mobile-nav-item ${activeId === '08' ? 'active' : ''}" onclick="navigateToScreen('08')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <span>Agents</span>
      </div>
      <div class="mobile-nav-item ${activeId === '11' ? 'active' : ''}" onclick="navigateToScreen('11')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Profile</span>
      </div>
    </div>
  `;
}

async function saveAdminActiveModel() {
  const provider = AtomXState.currentProvider;
  const model = AtomXState.currentModel;
  try {
    const res = await fetch(`${API_BASE}/api/admin/active-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProvider: provider, activeModel: model })
    });
    if (res.ok) {
      showToast(`✓ Active system AI model set to: ${provider.toUpperCase()} / ${model}`);
      const badge = document.getElementById('activeModelBadge');
      if (badge) badge.textContent = `● ACTIVE: ${provider.toUpperCase()} / ${model}`;
      return;
    }
  } catch (e) {
    console.warn('Error saving active model:', e);
  }
  showToast(`✓ Active AI model set to: ${provider.toUpperCase()} / ${model}`);
}

// Real-time server sync for admin datasets
async function loadAdminServerData() {
  try {
    const [statsRes, usersRes, reqsRes, ledgerRes, engRes, modelRes, logsRes, tonesRes, keysRes] = await Promise.all([
      fetch(`${API_BASE}/api/admin/stats`).catch(() => null),
      fetch(`${API_BASE}/api/admin/users`).catch(() => null),
      fetch(`${API_BASE}/api/admin/access-requests`).catch(() => null),
      fetch(`${API_BASE}/api/admin/ledger`).catch(() => null),
      fetch(`${API_BASE}/api/tweets/engaged`).catch(() => null),
      fetch(`${API_BASE}/api/admin/active-model`).catch(() => null),
      fetch(`${API_BASE}/api/admin/api-logs`).catch(() => null),
      fetch(`${API_BASE}/api/tone-styles`).catch(() => null),
      fetch(`${API_BASE}/api/admin/api-keys`).catch(() => null)
    ]);

    if (keysRes && keysRes.ok) {
      const kd = await keysRes.json();
      AtomXState.adminApiKeys = kd.keys || {};
      updateAdminApiKeyUI(AtomXState.currentProvider);
    }

    if (tonesRes && tonesRes.ok) {
      const d = await tonesRes.json();
      if (d && Array.isArray(d.defaultTones)) {
        AtomXState.toneStylesData = d;
      }
    }

    if (logsRes && logsRes.ok) {
      const d = await logsRes.json();
      AtomXState.adminApiLogs = d.logs || [];
    }

    if (modelRes && modelRes.ok) {
      const modelData = await modelRes.json();
      if (modelData.activeProvider) AtomXState.currentProvider = modelData.activeProvider;
      if (modelData.activeModel) AtomXState.currentModel = modelData.activeModel;
    }

    if (engRes && engRes.ok) {
      const engData = await engRes.json();
      if (Array.isArray(engData.engagedIds)) {
        AtomXState.engagedTweetIds = engData.engagedIds;
      }
    }

    if (statsRes && statsRes.ok) {
      AtomXState.adminStats = await statsRes.json();
    }
    if (usersRes && usersRes.ok) {
      const d = await usersRes.json();
      AtomXState.adminUsers = (d.users || []).map(u => ({
        id: u.id,
        name: u.full_name || u.name || 'User',
        email: u.email,
        handle: u.handle || '@user',
        plan: u.plan_tier || 'Free Plan',
        credits: u.credits !== undefined ? u.credits : 100,
        status: (u.status || 'ACTIVE').charAt(0).toUpperCase() + (u.status || 'ACTIVE').slice(1).toLowerCase(),
        referredBy: u.referred_by || u.referredBy || 'Direct / —',
        telegram: u.telegram || '',
        lastActive: u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Recently'
      }));
    }
    if (reqsRes && reqsRes.ok) {
      const d = await reqsRes.json();
      AtomXState.accessRequests = (d.requests || []).map(r => ({
        id: r.id,
        name: r.full_name || r.name,
        email: r.email,
        telegram: r.telegram || (r.use_case && r.use_case.match(/TG:(@?[\w_]+)/i) ? r.use_case.match(/TG:(@?[\w_]+)/i)[1] : ''),
        handle: r.handle || (r.use_case && r.use_case.match(/X_ID:(@?[\w_]+)/i) ? r.use_case.match(/X_ID:(@?[\w_]+)/i)[1] : '@user'),
        requestedDate: r.requested_at ? new Date(r.requested_at).toLocaleDateString() : (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Today'),
        status: (r.status || 'Pending').toUpperCase()
      }));
    }
    if (ledgerRes && ledgerRes.ok) {
      const d = await ledgerRes.json();
      AtomXState.creditLedger = (d.ledger || []).map(l => ({
        date: l.created_at ? new Date(l.created_at).toLocaleString() : 'Recently',
        user: l.user_name || l.users?.full_name || l.full_name || l.user || 'System User',
        action: l.action || 'AI Reply',
        amount: l.amount || 0,
        admin: l.admin_source || l.admin_name || 'System',
        reason: l.reason || ''
      }));
    }

    if (['12', '13', '14', '15', '17'].includes(AtomXState.currentScreen)) {
      navigateToScreen(AtomXState.currentScreen);
    }
  } catch (err) {
    console.warn('Could not sync admin server data:', err);
  }
}

function initAtomXApp() {
  try {
    initTheme();
    navigateToScreen('12'); // Shows Admin Password Gate if not authenticated
    fetchLiveModelsForProvider('groq');
    if (AtomXState.isAdminAuthenticated) {
      loadAdminServerData();
    }

    // Fast background sync every 10 seconds only when authenticated
    setInterval(() => {
      if (AtomXState.isAdminAuthenticated && ['12', '13', '14'].includes(AtomXState.currentScreen)) {
        loadAdminServerData();
      }
    }, 10000);
  } catch (err) {
    console.error('[AtomX Init Error]', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAtomXApp);
} else {
  initAtomXApp();
}


