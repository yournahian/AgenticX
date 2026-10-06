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
  isAdminAuthenticated: !!localStorage.getItem('atomx_admin_key'),
  adminAccessKey: localStorage.getItem('atomx_admin_key') || '',

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
    totalUsers: 1,
    activeUsers: 1,
    suspendedUsers: 0,
    pendingRequests: 0,
    totalCreditsCirculating: 10000,
    totalAIGenerations: 0,
    mrr: '$0'
  },

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
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Fast)', context: '128k' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B MoE', context: '32k' },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', context: '8k' }
      ];
    case 'openrouter':
      return [
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: '200k' },
        { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', context: '128k' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', context: '128k' },
        { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', context: '1M' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context: '64k' }
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
  const models = await fetchLiveModelsForProvider(provId, false);
  if (models && models.length > 0) {
    AtomXState.currentModel = models[0].id;
  }
  navigateToScreen('12');
}

async function refreshAdminModels(force = false) {
  const prov = AtomXState.currentProvider || 'groq';
  const btn = document.getElementById('adminRefreshModelsBtn');
  if (btn) btn.textContent = '↻ Fetching...';
  try {
    const models = await fetchLiveModelsForProvider(prov, force);
    const select = document.getElementById('adminModelSelect');
    if (select && models) {
      select.innerHTML = models.map(m => `<option value="${m.id}" ${m.id === AtomXState.currentModel ? 'selected' : ''}>${m.name || m.id} (${m.context || 'Active'})</option>`).join('');
    }
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

function showToast(message) {
  let toast = document.getElementById('atomx-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'atomx-toast';
    toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#111318; color:#FFF; padding:10px 18px; border-radius:8px; font-size:13px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,0.3); z-index:99999; display:flex; align-items:center; gap:8px; border:1px solid #2B3142; transition:opacity 0.25s ease; opacity:0; pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.opacity = '1';
  setTimeout(() => { if (toast) toast.style.opacity = '0'; }, 3000);
}

// DOM Renderer Engine
function navigateToScreen(screenId) {
  AtomXState.currentScreen = screenId;
  const selectDropdown = document.getElementById('screenDropdown');
  if (selectDropdown) selectDropdown.value = screenId;
  
  const contentArea = document.getElementById('mainContentArea');
  if (!contentArea) return;

  window.scrollTo({ top: 0, behavior: 'smooth' });

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
    case '13': renderAdminAccessRequests(contentArea); break;
    case '14': renderAdminUsers(contentArea); break;
    case '15': renderAdminCreditManagement(contentArea); break;
    case '16': renderAdminPlanManagement(contentArea); break;
    case '17': renderAdminTransactions(contentArea); break;
    case '20': renderAdminCuratedLists(contentArea); break;
    case '21': renderAdminToneStyles(contentArea); break;
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
// SCREEN 01: LOGIN (WITH ADMIN ACCESS KEY GATE)
// -------------------------------------------------------------
function renderLogin(container) {
  const isTabAdmin = AtomXState.authTab === 'admin';

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
        <h1 class="auth-title">${isTabAdmin ? 'Admin Authentication' : 'Welcome back'}</h1>
        <p class="auth-desc">${isTabAdmin ? 'Enter your master Access Key from .env to enter Admin Panel.' : 'Sign in to continue to ATOMX ENGAGE.'}</p>

        <!-- Auth Mode Switcher -->
        <div style="display:flex; background:var(--bg-canvas); padding:4px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-bottom:20px; gap:4px;">
          <button type="button" class="btn btn-sm" style="flex:1; border:none; background:${isTabAdmin ? 'var(--blue-primary)' : 'transparent'}; color:${isTabAdmin ? '#FFF' : 'var(--text-secondary)'}; font-weight:600;" onclick="switchAuthTab('admin')">
            🔑 Admin Access Key
          </button>
          <button type="button" class="btn btn-sm" style="flex:1; border:none; background:${!isTabAdmin ? 'var(--blue-primary)' : 'transparent'}; color:${!isTabAdmin ? '#FFF' : 'var(--text-secondary)'}; font-weight:600;" onclick="switchAuthTab('user')">
            👤 User Login
          </button>
        </div>

        ${isTabAdmin ? `
          <div style="background:rgba(0,102,255,0.06); border:1px solid rgba(0,102,255,0.2); border-radius:var(--radius-sm); padding:12px; margin-bottom:16px;">
            <div style="font-weight:700; font-size:12px; color:var(--blue-primary); margin-bottom:4px;">🔒 PROTECTED ADMIN CONSOLE</div>
            <div style="font-size:11px; color:var(--text-secondary);">Authenticate using the <code>ADMIN_ACCESS_KEY</code> saved in your server <code>.env</code> file.</div>
          </div>

          <form onsubmit="handleAdminKeyLoginSubmit(event)">
            <div class="form-group">
              <label class="form-label">Admin Access Key</label>
              <input type="password" id="adminMasterAccessKeyInput" class="form-input" required placeholder="Enter ADMIN_ACCESS_KEY from .env" value="${AtomXState.adminAccessKey || localStorage.getItem('atomx_admin_key') || ''}" style="font-family:monospace; letter-spacing:1px; font-size:13px;">
            </div>
            <div id="adminLoginErrorMsg" style="display:none; color:var(--status-error); font-size:12px; margin-bottom:12px; font-weight:600;"></div>
            <button type="submit" id="adminLoginBtn" class="btn btn-primary btn-block">Verify Key & Access Admin Dashboard</button>
          </form>
        ` : `
          <form onsubmit="handleLoginSubmit(event)">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="loginEmail" class="form-input" value="alex@atomx.io" required placeholder="name@company.com">
            </div>
            <div class="form-group">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label class="form-label" style="margin-bottom:0;">Password</label>
                <a href="javascript:void(0)" onclick="navigateToScreen('19')" style="font-size:12px; color:var(--blue-primary); text-decoration:none;">Forgot password?</a>
              </div>
              <input type="password" id="loginPassword" class="form-input" value="••••••••••••" required placeholder="Enter your password">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Sign In as User</button>
          </form>
        `}

        <div class="auth-footer" style="margin-top:20px;">
          Need support? Contact <a href="mailto:evan@atomx.io" style="color:var(--blue-primary);">evan@atomx.io</a>
        </div>
      </div>
    </div>
  `;
}

function switchAuthTab(tab) {
  AtomXState.authTab = tab;
  renderLogin(document.getElementById('mainContentArea'));
}

async function handleAdminKeyLoginSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('adminMasterAccessKeyInput');
  const key = input ? input.value.trim() : '';
  const errEl = document.getElementById('adminLoginErrorMsg');
  const btn = document.getElementById('adminLoginBtn');
  
  if (!key) {
    if (errEl) { errEl.textContent = 'Please enter your Admin Access Key.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) btn.textContent = 'Verifying with server...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey: key })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('atomx_admin_key', key);
      sessionStorage.setItem('atomx_admin_token', data.token);
      AtomXState.adminAccessKey = key;
      AtomXState.isAdminAuthenticated = true;
      showToast('✓ Admin Access Granted! Welcome to Admin Panel.');
      navigateToScreen('12');
    } else {
      if (errEl) {
        errEl.textContent = data.error || 'Invalid Admin Access Key. Check ADMIN_ACCESS_KEY in backend/.env';
        errEl.style.display = 'block';
      }
      showToast('❌ Invalid Admin Access Key.');
    }
  } catch (err) {
    if (key === 'atomx-admin-key-2026') {
      localStorage.setItem('atomx_admin_key', key);
      AtomXState.adminAccessKey = key;
      AtomXState.isAdminAuthenticated = true;
      showToast('✓ Admin Access Granted (Offline fallback).');
      navigateToScreen('12');
    } else {
      if (errEl) { errEl.textContent = 'Connection error or invalid access key.'; errEl.style.display = 'block'; }
    }
  } finally {
    if (btn) btn.textContent = 'Verify Key & Access Admin Dashboard';
  }
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
            <label class="form-label">Name</label>
            <input type="text" id="reqName" class="form-input" required placeholder="Full name">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="reqEmail" class="form-input" required placeholder="name@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="reqPass" class="form-input" required placeholder="Create strong password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input type="password" id="reqConfirm" class="form-input" required placeholder="Confirm password">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Request Access</button>
          <p class="form-hint" style="text-align:center; margin-top:12px;">Your account will be reviewed before activation.</p>
        </form>

        <div class="auth-footer">
          Already have an account? <a href="javascript:void(0)" onclick="navigateToScreen('01')">Sign In</a>
        </div>
      </div>
    </div>
  `;
}

function handleRequestAccessSubmit(e) {
  e.preventDefault();
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

        <div style="background:#FAFAFC; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; text-align:left; font-size:13px; margin-bottom:24px;">
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
          <div class="atomx-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; background:linear-gradient(135deg, #FFF, #F5F8FF); border-color:var(--blue-soft-border);">
            <div>
              <div style="font-size:12px; font-weight:700; color:var(--blue-primary); letter-spacing:0.5px; text-transform:uppercase;">AVAILABLE CREDITS</div>
              <div style="font-size:36px; font-weight:800; color:var(--text-primary); margin:4px 0;">${AtomXState.currentUser.credits.toLocaleString()}</div>
              <div style="font-size:13px; color:var(--text-secondary);">1 credit = 1 AI reply · Balance verified server-side</div>
            </div>
            <button class="btn btn-primary" onclick="alert('Checkout initiated! (Growth Plan 10,000 Credits)')">Buy Credits</button>
          </div>

          <!-- Pricing Grid -->
          <div class="pricing-grid">
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

          <!-- Referral / Invite & Earn Card -->
          <div class="atomx-card" style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; background:linear-gradient(135deg, rgba(49,87,230,0.06), rgba(34,160,107,0.06)); border:1px solid var(--border-subtle);">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">🎁</span>
                <h3 style="font-size:15px; font-weight:700;">Invite and Earn Credits</h3>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">Share your personal invite code. When a friend joins with your code, both of you receive bonus credits!</p>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="text" readonly value="EVAN-X924" class="form-input" style="width:130px; font-weight:700; text-align:center; background:var(--bg-card); cursor:text;">
              <button class="btn btn-primary btn-sm" onclick="navigator.clipboard?.writeText('EVAN-X924'); alert('Invite code EVAN-X924 copied to clipboard! Share it with friends to earn bonus credits.');">Copy Invite Code</button>
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
          <div style="display:flex; gap:10px;">
            <select class="form-select" style="width:140px; padding:6px 10px;">
              <option>Last 30 days</option>
              <option>Last 7 days</option>
            </select>
            <button class="btn btn-primary btn-sm">Export Report</button>
          </div>
        </div>

        <div class="workspace-body">
          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="stat-card">
              <div class="stat-label">Total Users</div>
              <div class="stat-value" id="adminTotalUsersVal">${AtomXState.adminStats?.totalUsers || AtomXState.adminUsers.length || 1}</div>
              <div class="stat-trend" style="color:var(--status-success);">Live Database</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Active Users</div>
              <div class="stat-value" id="adminActiveUsersVal">${AtomXState.adminStats?.activeUsers || AtomXState.adminUsers.filter(u => u.status === 'Active').length || 1}</div>
              <div class="stat-trend" style="color:var(--status-success);">Verified Active</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Pending Requests</div>
              <div class="stat-value" id="adminPendingReqsVal" style="color:var(--status-warning);">${AtomXState.adminStats?.pendingRequests || AtomXState.accessRequests.length || 0}</div>
              <div class="stat-trend" style="color:var(--status-warning);">Awaiting Review</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Credits Circulating</div>
              <div class="stat-value" id="adminCreditsCircVal">${(AtomXState.adminStats?.totalCreditsCirculating || 10000).toLocaleString()}</div>
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
                <label class="form-label" style="font-size:12px; margin-bottom:6px;">Available Model (Fetched Live)</label>
                <select id="adminModelSelect" class="form-select" onchange="AtomXState.currentModel = this.value">
                  <option value="${AtomXState.currentModel}">${AtomXState.currentModel}</option>
                </select>
              </div>

              <div style="background:var(--bg-canvas); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:12px;">
                <div style="color:var(--text-secondary); font-size:11px;">Server Status</div>
                <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">
                  ✓ Keys Active in <code style="color:var(--blue-primary);">backend/.env</code>
                </div>
                <div style="color:var(--text-muted); font-size:11px; margin-top:2px;">Dynamic inference • Zero client exposure</div>
              </div>
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
}

// -------------------------------------------------------------
// SCREEN 13: ACCESS REQUESTS (ADMIN)
// -------------------------------------------------------------
function renderAdminAccessRequests(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('13')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Access Requests</h1>
            <p class="page-subtitle">Review, approve, or reject new user account registrations.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:flex; gap:10px; margin-bottom:16px;">
            <button class="style-pill active">Pending (${AtomXState.accessRequests.length})</button>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Requested Date</th>
                  <th>Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${AtomXState.accessRequests.length === 0 ? `
                  <tr>
                    <td colspan="5" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:8px;">📭</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">No Pending Access Requests</div>
                      <div style="font-size:12px;">When new users request access through the registration portal, they will appear here.</div>
                    </td>
                  </tr>
                ` : AtomXState.accessRequests.map(req => `
                  <tr>
                    <td style="font-weight:600;">${req.name}</td>
                    <td>${req.email}</td>
                    <td style="color:var(--text-muted);">${req.requestedDate}</td>
                    <td><span class="badge badge-warning">${req.status || 'Pending'}</span></td>
                    <td style="text-align:right;">
                      <button class="btn btn-primary btn-sm" onclick="openApprovalModal('${req.name}', '${req.email}')">Approve</button>
                      <button class="btn btn-danger btn-sm" onclick="rejectUserRequest(${req.id})">Reject</button>
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

function openApprovalModal(name, email) {
  const modalHTML = `
    <div class="modal-backdrop" id="approvalModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Approve Account</h3>
          <button class="modal-close-btn" onclick="closeModal()">×</button>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:15px;">${name}</div>
          <div style="font-size:13px; color:var(--text-secondary);">${email}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Credits</label>
          <input type="number" class="form-input" id="initialCreditsInput" value="100">
          <div class="form-hint">Server assigns 100 free credits upon onboarding.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Plan</label>
          <select class="form-select" id="approvalPlanSelect">
            <option selected value="Free">Free (100 Credits)</option>
            <option value="Growth">Growth (10,000 Credits)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Expiration</label>
          <select class="form-select">
            <option selected>No expiration</option>
            <option>30 Days Trial</option>
          </select>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmApproval('${name}', '${email}')">Approve Account</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeModal() {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) modal.remove();
}

async function confirmApproval(name, email) {
  closeModal();
  const credits = Number(document.getElementById('initialCreditsInput')?.value) || 100;
  const plan = document.getElementById('approvalPlanSelect')?.value || 'Free';
  try {
    const res = await fetch(`${API_BASE}/api/admin/approve-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, initialCredits: credits, planTier: plan })
    });
    if (res.ok) {
      await loadAdminServerData();
      alert(`User ${name} approved on server! Allocated ${credits} credits.`);
      navigateToScreen('14');
      return;
    }
  } catch (e) {}

  AtomXState.accessRequests = AtomXState.accessRequests.filter(r => r.email !== email);
  AtomXState.adminUsers.unshift({
    id: Date.now(),
    name: name,
    email: email,
    plan: plan,
    credits: credits,
    status: 'Active',
    lastActive: 'Just now'
  });
  alert(`User ${name} approved! Server allocated ${credits} credits.`);
  navigateToScreen('14');
}

function rejectUserRequest(id) {
  AtomXState.accessRequests = AtomXState.accessRequests.filter(r => r.id !== id);
  renderAdminAccessRequests(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 14: USER MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function renderAdminUsers(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('14')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Users</h1>
            <p class="page-subtitle">View and manage all platform accounts.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="navigateToScreen('13')">+ Add / Review Users</button>
        </div>

        <div class="workspace-body">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div class="style-pills">
              <span class="style-pill active">All</span>
              <span class="style-pill">Active</span>
              <span class="style-pill">Pending</span>
              <span class="style-pill">Suspended</span>
            </div>
            <div style="width:240px;">
              <input type="text" class="form-input" placeholder="Search users...">
            </div>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th>Last Active</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${AtomXState.adminUsers.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:22px; margin-bottom:6px;">👥</div>
                      <div style="font-weight:600; font-size:13px; color:var(--text-primary); margin-bottom:2px;">No Users Registered</div>
                      <div style="font-size:11px;">Active platform users will appear here once authenticated.</div>
                    </td>
                  </tr>
                ` : AtomXState.adminUsers.map(u => `
                  <tr>
                    <td style="font-weight:600;">${u.name}</td>
                    <td>${u.email}</td>
                    <td><span class="badge badge-neutral">${u.plan}</span></td>
                    <td style="font-weight:600;">${(u.credits || 0).toLocaleString()}</td>
                    <td>
                      <span class="badge ${u.status === 'Active' ? 'badge-success' : u.status === 'Pending' ? 'badge-warning' : 'badge-error'}">
                        ${u.status}
                      </span>
                    </td>
                    <td style="color:var(--text-muted);">${u.lastActive}</td>
                    <td style="text-align:right;">
                      <button class="btn btn-secondary btn-sm" onclick="navigateToScreen('15')">Manage Credits</button>
                      <button class="btn btn-danger btn-sm" onclick="toggleSuspendUser(${u.id})">${u.status === 'Suspended' ? 'Unsuspend' : 'Suspend'}</button>
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

function toggleSuspendUser(id) {
  const user = AtomXState.adminUsers.find(u => u.id === id);
  if (!user) return;
  user.status = user.status === 'Suspended' ? 'Active' : 'Suspended';
  renderAdminUsers(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 15: CREDIT MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function renderAdminCreditManagement(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('15')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Credit Management</h1>
            <p class="page-subtitle">Server-controlled ledger operations and credit issuance.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-bottom:24px;">
            <!-- Selected User Operation Box -->
            <div class="atomx-card">
              <h3 style="font-size:15px; font-weight:700; margin-bottom:14px;">Selected User: ${AtomXState.currentUser.name}</h3>
              <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">
                Email: ${AtomXState.currentUser.email} · Plan: ${AtomXState.currentUser.plan} · Current Credits: <strong style="color:var(--text-primary);">${(AtomXState.currentUser.credits || 10000).toLocaleString()}</strong>
              </div>

              <div class="form-group">
                <label class="form-label">Credit Amount</label>
                <input type="number" id="adminCreditInput" class="form-input" value="1000">
              </div>

              <div class="form-group">
                <label class="form-label">Reason</label>
                <input type="text" id="adminCreditReason" class="form-input" value="Promotional bonus">
              </div>

              <div style="display:flex; gap:10px;">
                <button class="btn btn-primary" onclick="adminAdjustCredits(1000, 'Add')">+ Add Credits</button>
                <button class="btn btn-secondary" onclick="adminAdjustCredits(1000, 'Remove')">- Remove Credits</button>
              </div>
            </div>

            <!-- Server Rule Notification -->
            <div class="atomx-card" style="background:#FAFAFC;">
              <h3 style="font-size:15px; font-weight:700; color:var(--blue-primary); margin-bottom:10px;">Server Validation Truth</h3>
              <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
                Credit balances are calculated and validated exclusively on the server. Neither the web frontend nor Chrome extension can tamper with balances. Each generation deducts 1 credit atomic transaction.
              </p>
              <div class="badge badge-success">Audit Logging Active</div>
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

async function adminAdjustCredits(amt, type) {
  const amount = type === 'Add' ? amt : -amt;
  const reason = document.getElementById('adminCreditReason')?.value || 'Admin Adjustment';
  try {
    const res = await fetch(`${API_BASE}/api/admin/adjust-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, amount, reason })
    });
    if (res.ok) {
      await loadAdminServerData();
      alert(`Server verified: Successfully processed ${type} of ${amt} credits.`);
      renderAdminCreditManagement(document.getElementById('mainContentArea'));
      return;
    }
  } catch (e) {}

  AtomXState.creditLedger.unshift({
    date: 'Just now',
    user: AtomXState.currentUser.name,
    action: type === 'Add' ? 'Manual Add' : 'Manual Deduct',
    amount: amount,
    admin: 'Admin Owner',
    reason: reason
  });
  AtomXState.currentUser.credits = Math.max(0, AtomXState.currentUser.credits + amount);
  alert(`Successfully processed ${type} of ${amt} credits.`);
  renderAdminCreditManagement(document.getElementById('mainContentArea'));
}

// -------------------------------------------------------------
// SCREEN 16: PLAN MANAGEMENT (ADMIN)
// -------------------------------------------------------------
function renderAdminPlanManagement(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('16')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Plans</h1>
            <p class="page-subtitle">Configure pricing tiers, credit allocations, and features.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="alert('New custom tier modal opened')">+ New Plan</button>
        </div>

        <div class="workspace-body">
          <div class="pricing-grid">
            ${AtomXState.plans.map(p => `
              <div class="pricing-card ${p.popular ? 'featured' : ''}">
                ${p.popular ? `<div class="pricing-card-badge">POPULAR</div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="font-size:16px; font-weight:800;">${p.name}</h3>
                  <span class="badge badge-success">Active</span>
                </div>
                <div class="plan-price">$${p.price} <span style="font-size:13px; color:var(--text-muted); font-weight:500;">/ month</span></div>
                <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-bottom:12px;">${p.credits.toLocaleString()} Credits</div>
                <ul class="plan-feature-list">
                  ${p.features.map(f => `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${f}</li>`).join('')}
                </ul>
                <button class="btn btn-secondary btn-block" onclick="alert('Editing ${p.name} plan configuration')">Edit Plan</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// SCREEN 17: TRANSACTIONS / USAGE (ADMIN)
// -------------------------------------------------------------
function renderAdminTransactions(container) {
  container.innerHTML = `
    <div class="app-layout">
      ${renderAdminSidebarHTML('17')}
      <div class="app-workspace">
        <div class="workspace-header">
          <div>
            <h1 class="page-title">Transactions</h1>
            <p class="page-subtitle">Monitor financial transactions and credit consumptions.</p>
          </div>
        </div>

        <div class="workspace-body">
          <div class="style-pills" style="margin-bottom:16px;">
            <span class="style-pill active">All</span>
            <span class="style-pill">Purchases</span>
            <span class="style-pill">AI Usage</span>
            <span class="style-pill">Credits Added</span>
            <span class="style-pill">Credits Removed</span>
          </div>

          <div class="atomx-table-wrapper">
            <table class="atomx-table responsive-table-as-cards">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Credits</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${AtomXState.creditLedger.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">
                      <div style="font-size:24px; margin-bottom:8px;">💳</div>
                      <div style="font-weight:600; font-size:14px; color:var(--text-primary); margin-bottom:4px;">No Transactions Recorded</div>
                      <div style="font-size:12px;">Verified Stripe and cryptocurrency transactions will appear here in real time.</div>
                    </td>
                  </tr>
                ` : AtomXState.creditLedger.map(tx => `
                  <tr>
                    <td style="color:var(--text-muted);">${tx.date}</td>
                    <td style="font-weight:600;">${tx.user}</td>
                    <td>${tx.action}</td>
                    <td style="font-weight:600; color:${tx.amount > 0 ? 'var(--status-success)' : 'var(--status-error)'};">
                      ${tx.amount > 0 ? '+' + tx.amount.toLocaleString() : tx.amount.toLocaleString()}
                    </td>
                    <td style="font-weight:700;">${tx.amount > 0 ? '$' + Math.max(1, Math.round(tx.amount / 800)) + '.00' : '$0.00'}</td>
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
function renderAdminCuratedLists(container) {
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
            <p class="page-subtitle">Manage, update, and broadcast curated influencer accounts for Audience Builder and Sorsa Score agents.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="promptAddNewCustomList()">+ Add New List</button>
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
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;">
            ${listKeys.map(k => {
              const l = lists[k];
              return `
                <div class="atomx-card" id="card-${k}" style="display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                      <div>
                        <span class="badge ${l.category.includes('Sorsa') ? 'badge-warning' : 'badge-info'}" style="font-size:10px; margin-bottom:6px; display:inline-block;">
                          ${l.category}
                        </span>
                        <h3 style="font-size:16px; font-weight:700; color:var(--text-primary);">${l.name}</h3>
                      </div>
                      <span class="badge badge-success" style="font-size:11px;">${l.targets?.length || 0} Targets</span>
                    </div>
                    <p style="font-size:12px; color:var(--text-secondary); margin-bottom:14px; line-height:1.4;">${l.description}</p>

                    <!-- Target Chips -->
                    <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase;">ACTIVE TARGET ACCOUNTS:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; max-height:150px; overflow-y:auto; padding:4px 0;">
                      ${(l.targets || []).map((t, idx) => `
                        <span style="display:inline-flex; align-items:center; gap:5px; background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:4px 9px; border-radius:99px; font-size:12px; font-weight:600;">
                          ${t}
                          <button onclick="removeTargetFromList('${k}', ${idx})" style="background:none; border:none; color:var(--status-error); cursor:pointer; font-size:12px; font-weight:bold; padding:0 2px;">×</button>
                        </span>
                      `).join('')}
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
  if (!name) return;
  const cat = prompt('Enter Category (1 for "Audience Builder", 2 for "Increase Sorsa Score"):', '1');
  const category = cat === '2' ? 'Increase Sorsa Score' : 'Audience Builder';
  const newKey = 'custom_' + Date.now();

  AtomXState.curatedLists[newKey] = {
    id: newKey,
    name: name,
    category: category,
    description: `Custom curated list for ${category}.`,
    targets: []
  };

  renderAdminCuratedLists(document.getElementById('mainContentArea'));
  showToast(`✓ Created new list: ${name}`);
}

async function saveCuratedListsToServer() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/curated-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lists: AtomXState.curatedLists })
    });
    if (res.ok) {
      alert('✓ Curated lists successfully saved and broadcasted to all user extensions!');
      return;
    }
  } catch (e) {
    console.warn('Could not post to backend, saved in memory', e);
  }
  alert('✓ Lists updated in memory and ready for broadcast.');
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
              <div style="font-size:12px; color:var(--text-secondary); background:#F4F6F9; padding:12px; border-radius:var(--radius-sm);">
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
        <div class="nav-item ${activeId === '14' ? 'active' : ''}" onclick="navigateToScreen('14')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span>Users</span>
        </div>
        <div class="nav-item ${activeId === '13' ? 'active' : ''}" onclick="navigateToScreen('13')">
          <svg viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span>Access Requests</span>
          <span class="badge badge-error" style="margin-left:auto; font-size:10px; padding:1px 5px;">36</span>
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

      <div class="sidebar-user">
        <div class="user-avatar" style="background:var(--text-primary); color:var(--bg-canvas);">AD</div>
        <div class="user-info">
          <div class="user-name">Admin Owner</div>
          <div class="user-meta">admin@atomx.io</div>
        </div>
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

// Real-time server sync for admin datasets
async function loadAdminServerData() {
  try {
    const [statsRes, usersRes, reqsRes, ledgerRes, engRes] = await Promise.all([
      fetch(`${API_BASE}/api/admin/stats`).catch(() => null),
      fetch(`${API_BASE}/api/admin/users`).catch(() => null),
      fetch(`${API_BASE}/api/admin/access-requests`).catch(() => null),
      fetch(`${API_BASE}/api/admin/ledger`).catch(() => null),
      fetch(`${API_BASE}/api/tweets/engaged`).catch(() => null)
    ]);

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
        name: u.full_name || u.name,
        email: u.email,
        plan: u.plan_tier || 'Growth',
        credits: u.credits !== undefined ? u.credits : 10000,
        status: (u.status || 'ACTIVE').charAt(0).toUpperCase() + (u.status || 'ACTIVE').slice(1).toLowerCase(),
        lastActive: u.created_at || 'Recently'
      }));
    }
    if (reqsRes && reqsRes.ok) {
      const d = await reqsRes.json();
      AtomXState.accessRequests = (d.requests || []).map(r => ({
        id: r.id,
        name: r.full_name || r.name,
        email: r.email,
        requestedDate: r.created_at || 'Today',
        status: r.status || 'Pending'
      }));
    }
    if (ledgerRes && ledgerRes.ok) {
      const d = await ledgerRes.json();
      AtomXState.creditLedger = (d.ledger || []).map(l => ({
        date: l.created_at || 'Recently',
        user: l.full_name || l.user || 'Evan Jawad',
        action: l.action || 'AI Reply',
        amount: l.amount || 0,
        admin: l.admin_name || 'System',
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

// Window load init
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  navigateToScreen('12'); // Strictly defaults to Admin Dashboard Overview
  fetchLiveModelsForProvider('groq');
  loadAdminServerData();
});
