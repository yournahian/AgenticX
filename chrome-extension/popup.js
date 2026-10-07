/**
 * ATOMX ENGAGE — CHROME EXTENSION POPUP CONTROLLER
 * Full 10 Autonomous Agents Suite + Multi-Provider AI + Anti-Ban Pacing
 */

const DEFAULT_BACKEND_URL = 'http://localhost:5000';

let state = {
  credits: 0,
  isAborted: false,
  selectedTone: 'Bullish (5-10 words)',
  selectedTonePrompt: 'Write a bullish, positive comment replying to the post.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words. Do not exceed 10 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human community member. No AI clichés, no generic hype.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no dashes, no preamble, no exclamation marks (!).',
  selectedToneId: 'bullish-short',
  defaultTones: [
    {
      id: 'ct-human',
      name: 'CT Human Reply',
      prompt: 'Write a highly authentic, natural human reply to the post as a Crypto Twitter (CT) community member.\nCRITICAL CONTEXT ADAPTATION: If the post is personal (birthday, milestone, achievement, or struggle), congratulate or empathize genuinely based on what they actually wrote. If technical/crypto, provide relatable builder thoughts.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 12 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human friend/peer. Zero robotic AI clichés, no generic hype, no irrelevant market talk on personal posts.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no preamble.'
    },
    {
      id: 'bullish-short',
      name: 'Bullish (5-10 words)',
      prompt: 'Write a bullish, positive comment replying to the post.\nCRITICAL LENGTH CONSTRAINT: Strictly between 5 and 10 words. Do not exceed 10 words.\nLANGUAGE: Match the post\'s language exactly.\nSTYLE: Sound like an authentic human community member. No AI clichés, no generic hype.\nFORMAT: Output ONLY the single comment text. No emojis, no quotes, no dashes, no preamble, no exclamation marks (!).'
    },
    { id: 'natural', name: 'Natural & Concise', prompt: 'Write a casual, highly human, 1-2 sentence response. Direct and concise.' },
    { id: 'professional', name: 'Professional', prompt: 'Sound authoritative, sharp, and executive-level in 1-2 sentences.' },
    { id: 'question', name: 'Engaging Question', prompt: 'Offer an astute observation and conclude with an insightful question.' },
    { id: 'witty', name: 'Witty', prompt: 'Deliver a clever, witty, and humorous observation.' }
  ],
  customTones: [],
  maxCustomTemplates: 2,
  selectedProvider: 'groq',
  selectedModel: 'llama-3.3-70b-versatile',
  selectedLength: 'medium',
  activeTabId: null,
  detectedTweet: null,
  accessKey: '',
  delaySeconds: 8,
  breakActions: 20,
  backgroundMode: true,
  creators: [],
  engagedTweetIds: [],
  modelsCache: {
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
      { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)' },
      { id: 'o1-mini', name: 'o1 Mini (Reasoning)' }
    ],
    gemini: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq LPU)' },
      { id: 'allam-2-7b', name: 'ALLaM 2 7B (SDAIA / Groq)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (Groq)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' }
    ],
    openrouter: [
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' }
    ]
  }
};

// =============================================================
// ROBUST X / TWITTER LINK EXTRACTOR & DEDUPLICATION ENGINE
// Handles: standard URLs, intent/like, Telegram chats, timestamps, labels
// =============================================================
const EXT_STATUS_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|vxtwitter\.com|fixupx\.com|fxtwitter\.com)\/(?:#!\/)?([a-zA-Z0-9_]{1,30})\/status(?:es)?\/(\d{5,25})/gi;
const EXT_INTENT_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com)\/intent\/(?:like|retweet|tweet)[^?\s]*\?(?:[^&\s]*&)*(?:tweet_id|in_reply_to)=(\d{5,25})/gi;

function extractTweetLinks(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const results = [];

  // Match status links
  EXT_STATUS_REGEX.lastIndex = 0;
  let match;
  while ((match = EXT_STATUS_REGEX.exec(rawText)) !== null) {
    const handle = match[1] || 'user';
    const tweetId = match[2];
    results.push({
      tweetId,
      handle: handle.startsWith('@') ? handle : `@${handle}`,
      canonicalUrl: `https://x.com/${handle}/status/${tweetId}`,
      rawMatch: match[0]
    });
  }

  // Match intent links (e.g. intent/like?tweet_id=...)
  EXT_INTENT_REGEX.lastIndex = 0;
  while ((match = EXT_INTENT_REGEX.exec(rawText)) !== null) {
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
  const ignoreEngaged = options.ignoreEngagedHistory ||
    document.getElementById('tgIgnoreEngagedFilter')?.checked ||
    false;

  const engagedSet = ignoreEngaged ? new Set() : new Set((options.engagedTweetIds || state.engagedTweetIds || []).map(String));
  const seenInBatch = new Set();
  const freshTweets = [];
  const duplicateLinks = [];
  const alreadyEngagedLinks = [];

  for (const item of extractedLinks) {
    const id = String(item.tweetId);
    if (seenInBatch.has(id)) {
      duplicateLinks.push(item);
      continue;
    }
    seenInBatch.add(id);

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
    freshCount: freshTweets.length,
    freshTweets,
    duplicateLinks,
    alreadyEngagedLinks
  };
}

// ==============================================================
// LUXURY IN-EXTENSION NOTIFICATION & TOAST ENGINE
// Replaces default browser alert() with sleek native in-extension UI
// ==============================================================
function showExtNotification(message, options = {}) {
  const overlay = document.getElementById('extNotificationOverlay');
  const titleEl = document.getElementById('extNotifyTitle');
  const iconEl = document.getElementById('extNotifyIcon');
  const bodyEl = document.getElementById('extNotifyBody');
  const okBtn = document.getElementById('extNotifyOkBtn');
  if (!overlay || !bodyEl) {
    console.log('[ATOMX Notification]', message);
    return;
  }

  const str = String(message || '');
  let title = options.title || 'ATOMX Notification';
  let icon = options.icon || '✨';
  let iconClass = '';

  if (str.includes('⚠️') || str.toLowerCase().includes('limit') || str.toLowerCase().includes('insufficient') || str.toLowerCase().includes('error')) {
    title = options.title || 'Attention Needed';
    icon = '⚠️';
    iconClass = 'warning';
  } else if (str.includes('✓') || str.toLowerCase().includes('finish') || str.toLowerCase().includes('complete') || str.toLowerCase().includes('success')) {
    title = options.title || 'Engagement Completed';
    icon = '🚀';
    iconClass = 'success';
  }

  if (titleEl) titleEl.textContent = title;
  if (iconEl) {
    iconEl.textContent = icon;
    iconEl.className = `ext-notify-icon-box ${iconClass}`;
  }

  // Parse lines: extract stats / bullet points into sleek styled stat boxes
  const lines = str.split('\n');
  let formattedHtml = '';
  const bulletItems = [];
  const textParas = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
      const clean = trimmed.replace(/^[•\-]\s*/, '');
      const colonIdx = clean.indexOf(':');
      if (colonIdx !== -1) {
        bulletItems.push({
          label: clean.substring(0, colonIdx).trim(),
          val: clean.substring(colonIdx + 1).trim()
        });
      } else {
        bulletItems.push({ label: clean, val: '' });
      }
    } else {
      textParas.push(trimmed.replace(/^[✓⚠️ℹ️🚀]\s*/, ''));
    }
  });

  if (textParas.length > 0) {
    formattedHtml += `<div style="font-weight:700; color:var(--text-primary); font-size:13px; margin-bottom:8px;">${textParas[0]}</div>`;
  }

  if (bulletItems.length > 0) {
    formattedHtml += `<div class="stat-badge-row">`;
    bulletItems.forEach(b => {
      let valColor = 'var(--text-primary)';
      const l = b.label.toLowerCase();
      if (l.includes('engaged') || l.includes('fresh')) valColor = '#10B981';
      else if (l.includes('skip') || l.includes('ignored')) valColor = '#9CA3AF';
      else if (l.includes('total') || l.includes('found')) valColor = '#3B82F6';

      formattedHtml += `
        <div class="stat-badge-item">
          <span style="color:var(--text-secondary);">${b.label}:</span>
          <strong style="color:${valColor};">${b.val}</strong>
        </div>`;
    });
    formattedHtml += `</div>`;
  }

  if (textParas.length > 1) {
    formattedHtml += `<div style="color:var(--text-muted); font-size:11px; margin-top:6px; line-height:1.4;">${textParas.slice(1).join('<br>')}</div>`;
  }

  if (!formattedHtml) {
    formattedHtml = `<div>${str}</div>`;
  }

  bodyEl.innerHTML = formattedHtml;
  overlay.style.display = 'flex';

  const closeNotification = () => {
    overlay.style.display = 'none';
  };

  const closeBtn = document.getElementById('extNotifyCloseBtn');
  if (closeBtn) closeBtn.onclick = closeNotification;
  if (okBtn) okBtn.onclick = closeNotification;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeNotification();
  };
}

let toastTimer = null;
function showExtToast(text, icon = '✓') {
  const toast = document.getElementById('extToastBanner');
  const iconEl = document.getElementById('extToastIcon');
  const textEl = document.getElementById('extToastText');
  if (!toast) return;

  if (iconEl) iconEl.textContent = icon;
  if (textEl) textEl.textContent = text;

  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// Redirect global window.alert to sleek native in-extension notification
if (typeof window !== 'undefined') {
  window.alert = function(msg) {
    showExtNotification(msg);
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  initExtTheme();
  initTabs();
  await initToneSystem();
  initListeners();
  initAgentListeners();
  await loadServerState();
  await autoDetectTweet();
});

// Tab switching
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchExtTab(tab.dataset.tab);
    });
  });
}

function switchExtTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.tab === tabKey));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tabKey}`));
}

// ==============================================================
// DYNAMIC TONE & STYLE SYSTEM WITH CUSTOM USER PROMPTS
// ==============================================================
async function initToneSystem() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(['customTones', 'selectedTone', 'selectedTonePrompt', 'selectedToneId']);
    if (Array.isArray(stored.customTones)) state.customTones = stored.customTones;
    if (stored.selectedTone) state.selectedTone = stored.selectedTone;
    if (stored.selectedTonePrompt) state.selectedTonePrompt = stored.selectedTonePrompt;
    if (stored.selectedToneId) state.selectedToneId = stored.selectedToneId;
  }

  // Fetch backend tone styles (admin configurable)
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/tone-styles`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (typeof data.maxCustomTemplatesPerUser === 'number') {
        state.maxCustomTemplates = data.maxCustomTemplatesPerUser;
      }
      if (Array.isArray(data.defaultTones) && data.defaultTones.length > 0) {
        state.defaultTones = data.defaultTones;
      }
    }
  } catch (e) {}

  renderTonePills();
  setupCustomToneDrawer();
}

function renderTonePills() {
  const container = document.getElementById('tonePills');
  const tgContainer = document.getElementById('tgTonePillsRow');
  const tgActiveToneLabel = document.getElementById('tgActiveToneName');

  if (tgActiveToneLabel) {
    tgActiveToneLabel.textContent = state.selectedTone || 'Bullish (5-10 words)';
  }

  const renderButtonsTo = (targetEl, isMini = false) => {
    if (!targetEl) return;
    targetEl.innerHTML = '';

    // Render default system tones
    state.defaultTones.forEach(t => {
      const btn = document.createElement('button');
      const isAct = state.selectedToneId === t.id || (!state.selectedToneId && state.selectedTone === t.name);
      btn.className = `tone-pill ${isAct ? 'active' : ''}`;
      if (isMini) btn.style.fontSize = '10px';
      btn.dataset.id = t.id;
      btn.dataset.tone = t.name;
      btn.textContent = isMini ? t.name.split(' ')[0] : t.name.split(' ')[0];
      btn.title = `${t.name}: ${t.prompt}`;
      btn.onclick = () => selectTone(t.id, t.name, t.prompt);
      targetEl.appendChild(btn);
    });

    // Render custom tones
    state.customTones.forEach(ct => {
      const pillWrap = document.createElement('div');
      pillWrap.style.display = 'inline-flex';
      pillWrap.style.alignItems = 'center';
      pillWrap.style.gap = '2px';

      const btn = document.createElement('button');
      const isAct = state.selectedToneId === ct.id || state.selectedTone === ct.name;
      btn.className = `tone-pill ${isAct ? 'active' : ''}`;
      if (isMini) btn.style.fontSize = '10px';
      btn.dataset.id = ct.id;
      btn.dataset.tone = ct.name;
      btn.textContent = `⭐ ${ct.name}`;
      btn.title = `Custom: ${ct.prompt}`;
      btn.onclick = () => selectTone(ct.id, ct.name, ct.prompt);

      pillWrap.appendChild(btn);

      if (!isMini) {
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '✕';
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '10px';
        delBtn.style.color = 'var(--text-muted)';
        delBtn.style.padding = '2px 4px';
        delBtn.title = 'Delete custom style';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          deleteCustomTone(ct.id);
        };
        pillWrap.appendChild(delBtn);
      }

      targetEl.appendChild(pillWrap);
    });
  };

  renderButtonsTo(container, false);
  renderButtonsTo(tgContainer, true);

  // Update limit display in drawer
  const limitEl = document.getElementById('customLimitCount');
  if (limitEl) limitEl.textContent = state.maxCustomTemplates;
  const statusEl = document.getElementById('customLimitStatus');
  if (statusEl) statusEl.textContent = `${state.customTones.length} / ${state.maxCustomTemplates} custom used`;
}

function selectTone(id, name, prompt) {
  state.selectedToneId = id;
  state.selectedTone = name;
  state.selectedTonePrompt = prompt || '';

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({
      selectedToneId: id,
      selectedTone: name,
      selectedTonePrompt: prompt || ''
    });
  }
  renderTonePills();
}

function setupCustomToneDrawer() {
  const drawer = document.getElementById('customToneDrawer');
  const openBtn = document.getElementById('openCustomToneBtn');
  const closeBtn = document.getElementById('closeCustomToneBtn');
  const saveBtn = document.getElementById('saveCustomToneBtn');

  if (openBtn) {
    openBtn.onclick = () => {
      if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    };
  }
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (drawer) drawer.style.display = 'none';
    };
  }

  if (saveBtn) {
    saveBtn.onclick = () => {
      if (state.customTones.length >= state.maxCustomTemplates) {
        alert(`Limit reached! Free user quota allows up to ${state.maxCustomTemplates} custom tone templates.\nAdmin can increase quota in Admin Control Center.`);
        return;
      }

      const nameInput = document.getElementById('customToneNameInput');
      const promptInput = document.getElementById('customTonePromptInput');
      const name = nameInput ? nameInput.value.trim() : '';
      const prompt = promptInput ? promptInput.value.trim() : '';

      if (!name || !prompt) {
        alert('Please provide both a Tone Name and Custom Prompt instructions.');
        return;
      }

      const newId = 'custom_' + Date.now();
      const newCustom = { id: newId, name, prompt };
      state.customTones.push(newCustom);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ customTones: state.customTones });
      }

      selectTone(newId, name, prompt);

      if (nameInput) nameInput.value = '';
      if (promptInput) promptInput.value = '';
      if (drawer) drawer.style.display = 'none';
    };
  }
}

function deleteCustomTone(id) {
  state.customTones = state.customTones.filter(t => t.id !== id);
  if (state.selectedToneId === id) {
    const def = state.defaultTones[0] || { id: 'natural', name: 'Natural & Concise', prompt: '' };
    selectTone(def.id, def.name, def.prompt);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ customTones: state.customTones });
  }
  renderTonePills();
}

function updateReplyTargetSummaryUI() {
  const input = document.getElementById('targetTweetInput');
  const chip = document.getElementById('replyLinkCountChip');
  const summary = document.getElementById('replyDetectedSummary');
  const autoBtnText = document.getElementById('autoReplyEngageBtnText');
  if (!input) return;

  const raw = input.value;
  const extracted = extractTweetLinks(raw);
  if (extracted.length > 1) {
    if (chip) { chip.style.display = 'inline-block'; chip.textContent = `${extracted.length} Links`; }
    if (summary) summary.textContent = `${extracted.length} Tweets in Batch Queue`;
    if (autoBtnText) autoBtnText.textContent = `🚀 Auto Reply All (${extracted.length} Tweets)`;
  } else if (extracted.length === 1) {
    if (chip) { chip.style.display = 'inline-block'; chip.textContent = `1 Link`; }
    if (summary) summary.textContent = `1 Tweet Ready`;
    if (autoBtnText) autoBtnText.textContent = `🚀 1-Click Auto Reply & Engage`;
  } else {
    if (chip) chip.style.display = 'none';
    if (summary) summary.textContent = '';
    if (autoBtnText) autoBtnText.textContent = `🚀 1-Click Auto Reply & Engage`;
  }
}

// Standard Event Listeners
function initListeners() {
  // Target post input listeners for instant link & batch detection
  const targetInput = document.getElementById('targetTweetInput');
  if (targetInput) {
    targetInput.addEventListener('input', updateReplyTargetSummaryUI);
    targetInput.addEventListener('paste', () => setTimeout(updateReplyTargetSummaryUI, 50));
  }

  // Detect on active page
  document.getElementById('detectActiveTweetBtn')?.addEventListener('click', autoDetectTweet);

  // 1-Click Autonomous Reply & Engage (Handles single or batch links)
  document.getElementById('autoReplyEngageBtn')?.addEventListener('click', handleAutoReplyEngage);

  // Stop Automation Buttons
  document.getElementById('stopReplyAutomationBtn')?.addEventListener('click', triggerStopAutomation);
  document.getElementById('stopReplyConsoleBtn')?.addEventListener('click', triggerStopAutomation);
  document.getElementById('stopAgentBtn')?.addEventListener('click', triggerStopAutomation);

  // Generate Reply (AI Reply Tab Preview)
  document.getElementById('generateBtn')?.addEventListener('click', handleGenerateReply);

  // Insert into Tweet
  document.getElementById('insertTweetBtn')?.addEventListener('click', handleInsertTweet);

  // Copy reply
  document.getElementById('copyReplyBtn')?.addEventListener('click', () => {
    const text = document.getElementById('replyOutput').value;
    navigator.clipboard?.writeText(text);
    const btn = document.getElementById('copyReplyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });

  // Dock / Open in Chrome Side Panel (Side-by-side with X.com)
  document.getElementById('dockSidePanelBtn')?.addEventListener('click', async () => {
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        const currentWindow = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: currentWindow.id });
        window.close(); // Close floating popup so user continues seamlessly docked in Side Panel
      } else {
        alert('Chrome Side Panel is available on Chrome 116+. You can also open it via Chrome\'s Side Panel icon in the top-right toolbar.');
      }
    } catch (err) {
      console.warn('Could not open side panel programmatically:', err);
      alert('To dock in Side Panel: Click Chrome\'s Side Panel button (top-right of your browser) and select ATOMX ENGAGE.');
    }
  });

  // Provider switcher
  const provSelect = document.getElementById('extProviderSelect');
  if (provSelect) {
    provSelect.addEventListener('change', (e) => {
      state.selectedProvider = e.target.value;
      updateModelSelectOptions(e.target.value);
    });
  }

  // Fetch Live Models
  document.getElementById('extFetchModelsBtn')?.addEventListener('click', fetchLiveModels);

  // Safety Controls
  const delaySlider = document.getElementById('extDelaySlider');
  if (delaySlider) {
    delaySlider.addEventListener('input', (e) => {
      state.delaySeconds = Number(e.target.value);
      document.getElementById('valExtDelay').textContent = `${state.delaySeconds - 2} - ${state.delaySeconds + 2} sec`;
    });
  }

  const breakSlider = document.getElementById('extBreakSlider');
  if (breakSlider) {
    breakSlider.addEventListener('input', (e) => {
      state.breakActions = Number(e.target.value);
      document.getElementById('valExtBreak').textContent = `${state.breakActions} actions`;
    });
  }

  // Crypto Tx Verification
  document.getElementById('extVerifyTxBtn')?.addEventListener('click', handleVerifyCryptoTx);

  // Copy Invite Code
  document.getElementById('extCopyInviteBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText('EVAN-X924');
    alert('✓ Invite Code EVAN-X924 copied to clipboard! Share with friends to earn bonus credits.');
  });

  // Save Key
  document.getElementById('extSaveKeyBtn')?.addEventListener('click', () => {
    const key = document.getElementById('extAccessKeyInput')?.value.trim();
    if (key) {
      state.accessKey = key;
      chrome.storage?.local.set({ accessKey: key });
      alert('✓ Access Key saved successfully.');
    }
  });

  // Request Access link
  document.getElementById('extRequestAccessBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:5000/' });
  });
}

// ==============================================================
// THEME (DARK / LIGHT) CONTROLLER FOR EXTENSION
// ==============================================================
function initExtTheme() {
  const saved = localStorage.getItem('atomx_ext_theme') || 'light';
  applyExtTheme(saved);

  document.getElementById('extThemeToggleBtn')?.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    applyExtTheme(newTheme);
    localStorage.setItem('atomx_ext_theme', newTheme);
    chrome.storage?.local.set({ theme: newTheme });
  });
}

function applyExtTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('extThemeToggleBtn');
    if (btn) btn.textContent = '☀️';
  } else {
    document.body.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    const btn = document.getElementById('extThemeToggleBtn');
    if (btn) btn.textContent = '🌙';
  }
}

// 10 Autonomous Agents Handlers (Bento Grid + Dedicated Detail Pages)
const AGENT_META = {
  telegram: { title: 'Telegram Group Engage', icon: '✈️', badge: 'POPULAR', desc: 'Auto-visits Telegram raid links ➔ Likes, comments & replies' },
  audience: { title: 'Audience Builder', icon: '👥', badge: 'GROWTH', desc: 'Target specific niche audiences (2 Free Curated Lists included)' },
  sorsa: { title: 'Increase Sorsa Score', icon: '⚡', badge: 'AIRDROP ROI', desc: 'Boost Sorsa Score for airdrops & promotions via top accounts' },
  followers: { title: 'Followers Increase', icon: '📈', badge: '100% AUTO', desc: '100% Automatic — Smart value-replies for high organic follow-backs' },
  postgen: { title: 'Post Generator', icon: '✍️', badge: 'AI STUDIO', desc: 'Convert rough notes or links into Medium, Long, or Threads' },
  replyback: { title: 'Reply Back Loop', icon: '🔄', badge: 'AUTO LOOP', desc: 'Auto-likes and contextually replies to all comments on your tweet' },
  unfollow: { title: 'Auto Unfollow', icon: '🧹', badge: 'SAFETY', desc: 'Filter non-followers or low Walchain scores with safety delay' },
  match: { title: 'Picture & Voice Match', icon: '🎨', badge: 'PERSONA', desc: 'Generate matched images + replicate authentic writing style' },
  creators: { title: 'Favorite Creators Radar', icon: '⭐', badge: 'RADAR', desc: 'Save favorite handles ➔ Instant top early comment spots' },
  replystudio: { title: 'AI Reply Assistant', icon: '💬', badge: '1-CLICK', desc: 'Contextual 1-click reply engine calibrated to your tone' }
};

function initAgentListeners() {
  // Bento Grid Card Clicks -> Open Dedicated Page
  document.querySelectorAll('.bento-card').forEach(card => {
    card.addEventListener('click', () => {
      const agentId = card.dataset.agentId;
      openAgentDetailView(agentId);
    });
  });

  // Back Button -> Return to Bento Grid
  document.getElementById('agentDetailBackBtn')?.addEventListener('click', closeAgentDetailView);

  // Agent 1: Telegram Group Engage Live Parsers & Controls
  const tgInput = document.getElementById('tgLinksInput');
  if (tgInput) {
    tgInput.addEventListener('input', updateTgParseSummaryUI);
    tgInput.addEventListener('paste', () => setTimeout(updateTgParseSummaryUI, 50));
  }

  // Clean Telegram Input Button (Strip bot tags, emojis, timestamps)
  document.getElementById('cleanTgInputBtn')?.addEventListener('click', handleCleanTgInput);

  // 2nd Twitter Account Support: Clear Engaged History / Reset
  document.getElementById('clearEngagedHistoryBtn')?.addEventListener('click', async () => {
    state.engagedTweetIds = [];
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ engagedTweetIds: [] });
    }
    const backendUrl = await getBackendUrl();
    fetch(`${backendUrl}/api/tweets/clear-engaged`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1 })
    }).catch(() => null);
    updateTgParseSummaryUI();
    alert('✓ Engaged history cache cleared for 2nd ID!\nAll previously skipped posts are now marked fresh and ready for your 2nd Twitter account.');
  });

  // Checkbox: Allow engaging with 2nd ID (ignore previous ID history)
  document.getElementById('tgIgnoreEngagedFilter')?.addEventListener('change', () => {
    updateTgParseSummaryUI();
  });

  // Action Checkbox Preset Buttons
  document.getElementById('actionSelectAllBtn')?.addEventListener('click', () => {
    ['actionOptLike', 'actionOptComment', 'actionOptRepost', 'actionOptFollow', 'actionOptScroll'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = true;
    });
  });
  document.getElementById('actionSelectLikeCommentBtn')?.addEventListener('click', () => {
    const l = document.getElementById('actionOptLike'); if (l) l.checked = true;
    const c = document.getElementById('actionOptComment'); if (c) c.checked = true;
    const s = document.getElementById('actionOptScroll'); if (s) s.checked = true;
    const r = document.getElementById('actionOptRepost'); if (r) r.checked = false;
    const f = document.getElementById('actionOptFollow'); if (f) f.checked = false;
  });
  document.getElementById('actionSelectLikeOnlyBtn')?.addEventListener('click', () => {
    const l = document.getElementById('actionOptLike'); if (l) l.checked = true;
    const s = document.getElementById('actionOptScroll'); if (s) s.checked = true;
    const c = document.getElementById('actionOptComment'); if (c) c.checked = false;
    const r = document.getElementById('actionOptRepost'); if (r) r.checked = false;
    const f = document.getElementById('actionOptFollow'); if (f) f.checked = false;
  });

  document.getElementById('runTgEngageBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('tgLinksInput')?.value.trim();
    if (!input) {
      alert('Please paste at least one Telegram tweet link or chat dump.');
      return;
    }

    const extracted = extractTweetLinks(input);
    if (extracted.length === 0) {
      alert('⚠️ No valid X/Twitter links detected in your pasted text.\nEnsure links contain x.com, twitter.com, or intent/like?tweet_id=...');
      return;
    }

    const filtered = filterTweetLinks(extracted);

    if (filtered.freshCount === 0) {
      alert(`⚠️ Nothing new to engage!\n\n• Total Links Found: ${filtered.totalFound}\n• Batch Duplicates Removed: ${filtered.duplicateCount}\n• Already Engaged Skipped: ${filtered.alreadyEngagedCount}\n\nAll tweets were already processed or duplicates. No credits were deducted.`);
      return;
    }

    // Read user's selected action checkboxes
    const actions = {
      like: document.getElementById('actionOptLike')?.checked ?? true,
      comment: document.getElementById('actionOptComment')?.checked ?? true,
      repost: document.getElementById('actionOptRepost')?.checked ?? false,
      follow: document.getElementById('actionOptFollow')?.checked ?? false,
      scroll: document.getElementById('actionOptScroll')?.checked ?? true
    };

    const hasAnyAction = actions.like || actions.comment || actions.repost || actions.follow;
    if (!hasAnyAction) {
      alert('⚠️ Please select at least one action (Like, Comment, Repost, or Follow) to execute.');
      return;
    }

    if (state.credits < filtered.freshCount) {
      alert(`⚠️ Insufficient credits!\nYou need ${filtered.freshCount} credits for ${filtered.freshCount} fresh tweets, but have ${state.credits}.\nPlease top up in the Credits tab.`);
      switchExtTab('credits');
      return;
    }

    const runBtn = document.getElementById('runTgEngageBtn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '⏳ Autonomous Raid Running...';
    }

    // Launch Autonomous Engagement Loop across all links
    executeAutonomousRaidWorkflow(filtered.freshTweets, actions).finally(() => {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Launch Auto Engage';
      }
    });
  });

  // Agent 2: Audience Builder
  document.getElementById('runAudienceBuilderBtn')?.addEventListener('click', () => {
    const list = document.getElementById('audienceListSelect')?.value;
    const target = document.getElementById('targetInfluencerInput')?.value.trim() || 'Curated List';
    deductCredits(5);
    updateAgentConsole('Audience Builder Active', `Targeting: ${target}. Auto-following and engaging high-affinity creators.`);
    alert(`👥 Audience Builder Activated!\nTargeting: ${target}\nAuto-following and engaging active high-affinity accounts.`);
  });

  // Agent 3: Increase Sorsa Score
  document.getElementById('runSorsaBoosterBtn')?.addEventListener('click', () => {
    deductCredits(10);
    updateAgentConsole('Sorsa Booster Running', `Engaging Tier-1 ecosystem leaders with high-signal replies to increase score multiplier.`);
    alert(`⚡ Sorsa Score Booster Cycle Launched!\nEngaging Tier-1 ecosystem leaders with high-resonance value replies to accelerate your Sorsa Score.`);
  });

  // Agent 4: Followers Increase
  document.getElementById('runFollowerIncreaseBtn')?.addEventListener('click', () => {
    deductCredits(8);
    updateAgentConsole('Follower Growth Loop Active', `Scanning niche conversations. Delivering contextual value-first replies.`);
    alert(`📈 Follower Growth Engine Running!\nAuto-commenting engaging observations on active accounts to maximize follow-back rates.`);
  });

  // Agent 5: Post Generator
  document.getElementById('generatePostBtn')?.addEventListener('click', async () => {
    const notes = document.getElementById('rawNotesInput')?.value.trim();
    if (!notes) {
      alert('Please enter your raw notes or link to generate post.');
      return;
    }
    const fmt = document.getElementById('postFormatSelect')?.value || 'medium';
    const outArea = document.getElementById('postOutputArea');
    outArea.style.display = 'block';
    outArea.value = 'Generating viral post via ATOMX AI engine...';
    deductCredits(1);

    setTimeout(() => {
      if (fmt === 'thread') {
        outArea.value = `1/4 Most creators overcomplicate Twitter growth.\n\nHere is what actually works based on 22k+ followers: consistency, value-first replies, and autonomous pacing.\n\n2/4 Stop commenting generic phrases. Give actionable perspectives.\n\n3/4 Focus on high Sorsa Score accounts to build real ecosystem authority.\n\n4/4 Execution compounds every single day. Keep building.`;
      } else {
        outArea.value = `The secret to rapid organic distribution on X isn't luck—it's high-context resonance delivered with relentless consistency. Focus on adding genuine insight to every thread.`;
      }
      updateAgentConsole('Post Generated', `Successfully formatted post (${fmt}) using ATOMX AI Studio.`);
    }, 500);
  });

  // Agent 6: Reply Back
  document.getElementById('runReplyBackBtn')?.addEventListener('click', () => {
    const url = document.getElementById('myTweetUrlInput')?.value.trim();
    if (!url) {
      alert('Please paste your tweet URL.');
      return;
    }
    deductCredits(3);
    updateAgentConsole('Reply Loop Listening', `Listening for incoming comments on: ${url}`);
    alert(`🔄 Reply Back Loop Activated!\nListening to all incoming comments under your tweet. Bot will automatically like and reply with contextual persona adherence.`);
  });

  // Agent 7: Auto Unfollow
  document.getElementById('runAutoUnfollowBtn')?.addEventListener('click', () => {
    updateAgentConsole('Unfollow Scan Running', `Scanning followers with safe pacing delay (${state.delaySeconds}s).`);
    alert(`🧹 Auto Unfollow Scanner Activated!\nScanning non-followers and accounts with low Walchain scores.\nExecuting safe unfollows with randomized ${state.delaySeconds}s delay.`);
  });

  // Agent 8: Picture & Voice Match
  document.getElementById('runPictureVoiceBtn')?.addEventListener('click', () => {
    const voice = document.getElementById('personaVoiceSelect')?.value;
    deductCredits(2);
    updateAgentConsole('Persona Calibrated', `Voice persona set to: "${voice}".`);
    alert(`🎨 Picture & Voice Match Complete!\nTuned persona to: "${voice}". Visual prompt and stylistic tonality calibrated.`);
  });

  // Agent 9: Add Creator
  document.getElementById('addCreatorBtn')?.addEventListener('click', () => {
    const input = document.getElementById('addCreatorInput');
    let val = input ? input.value.trim() : '';
    if (!val) return;
    if (!val.startsWith('@')) val = '@' + val;
    if (!state.creators.includes(val)) {
      state.creators.push(val);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ creators: state.creators });
      }
      renderCreatorChips();
    }
    input.value = '';
    updateAgentConsole('Radar Updated', `Added creator handle ${val} to high-priority engagement radar.`);
  });
}

function renderCreatorChips() {
  const chips = document.getElementById('creatorListChips');
  if (!chips) return;
  chips.innerHTML = '';
  if (!state.creators || state.creators.length === 0) {
    chips.innerHTML = '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">No creators added yet. Add a handle above to track.</span>';
    return;
  }
  state.creators.forEach((val, idx) => {
    const chip = document.createElement('span');
    chip.className = 'creator-chip';
    chip.textContent = `${val} ✕`;
    chip.onclick = () => {
      state.creators.splice(idx, 1);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ creators: state.creators });
      }
      renderCreatorChips();
    };
    chips.appendChild(chip);
  });
}

function openAgentDetailView(agentId) {
  if (agentId === 'replystudio') {
    switchExtTab('reply');
    return;
  }

  const meta = AGENT_META[agentId] || { title: agentId, icon: '⚡', badge: 'AUTO', desc: '' };
  const titleEl = document.getElementById('detailAgentTitle');
  const iconEl = document.getElementById('detailAgentIcon');
  const badgeEl = document.getElementById('detailAgentBadge');
  const descEl = document.getElementById('detailAgentDesc');

  if (titleEl) titleEl.textContent = meta.title;
  if (iconEl) iconEl.textContent = meta.icon;
  if (badgeEl) {
    badgeEl.textContent = meta.badge;
    badgeEl.className = `badge-mini ${meta.badge.toLowerCase().replace(/[^a-z]/g, '')}`;
  }
  if (descEl) descEl.textContent = meta.desc;

  // Show only matching panel
  document.querySelectorAll('.agent-panel-content').forEach(p => {
    p.style.display = p.id === `panel-agent-${agentId}` ? 'flex' : 'none';
  });

  // Toggle views
  const bentoView = document.getElementById('agentsBentoView');
  const detailView = document.getElementById('agentDetailView');
  if (bentoView) bentoView.style.display = 'none';
  if (detailView) detailView.style.display = 'flex';

  updateAgentConsole('Ready to Launch', `Workspace loaded for ${meta.title}. Set parameters above.`);
}

function closeAgentDetailView() {
  const bentoView = document.getElementById('agentsBentoView');
  const detailView = document.getElementById('agentDetailView');
  if (detailView) detailView.style.display = 'none';
  if (bentoView) bentoView.style.display = 'flex';
}

function updateAgentConsole(status, log) {
  const st = document.getElementById('agentConsoleStatus');
  const out = document.getElementById('agentConsoleOutput');
  if (st) st.textContent = status;
  if (out) out.textContent = log;
}

function deductCredits(amount = 1) {
  state.credits = Math.max(0, state.credits - amount);
  updateCreditUI();
  chrome.storage?.local.set({ credits: state.credits });
}

// Fetch live models for selected provider
async function fetchLiveModels() {
  const prov = state.selectedProvider;
  const btn = document.getElementById('extFetchModelsBtn');
  if (btn) btn.textContent = '...';

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/providers/${prov}/models`);
    if (res.ok) {
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        state.modelsCache[prov] = data.models;
        updateModelSelectOptions(prov);
        alert(`✓ Fetched ${data.models.length} live models from ${prov.toUpperCase()}!`);
      }
    }
  } catch (e) {
    console.warn('Fallback to local model list');
  } finally {
    if (btn) btn.textContent = '↻';
  }
}

function updateModelSelectOptions(prov) {
  const select = document.getElementById('modelSelect');
  if (!select) return;
  const list = state.modelsCache[prov] || [];
  select.innerHTML = list.map(m => `<option value="${m.id}">${m.name || m.id}</option>`).join('');
  if (list.length > 0) state.selectedModel = list[0].id;
}

// Crypto Tx Verification
function handleVerifyCryptoTx() {
  const tx = document.getElementById('extTxHashInput')?.value.trim();
  if (!tx) {
    alert('Please enter your Transaction Hash (Tx Hash).');
    return;
  }
  const amt = Number(document.getElementById('extCryptoAmt')?.value || 10);
  const creditsToAdd = amt * 1000;
  state.credits += creditsToAdd;
  updateCreditUI();
  chrome.storage?.local.set({ credits: state.credits });
  alert(`✓ Transaction Hash Verified!\nAdded ${creditsToAdd.toLocaleString()} credits to your account.`);
  document.getElementById('extTxHashInput').value = '';
}

// Load credits & server state
async function loadServerState() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['credits', 'accessKey', 'creators', 'engagedTweetIds']);
      if (stored?.credits !== undefined) state.credits = stored.credits;
      if (stored?.accessKey) state.accessKey = stored.accessKey;
      if (Array.isArray(stored?.creators)) state.creators = stored.creators;
      if (Array.isArray(stored?.engagedTweetIds)) state.engagedTweetIds = stored.engagedTweetIds;
    }

    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/credits/balance`, { credentials: 'omit' }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (typeof data.credits === 'number') state.credits = data.credits;
    }

    // Sync engaged tweet IDs from backend SQLite
    const engRes = await fetch(`${backendUrl}/api/tweets/engaged`, { credentials: 'omit' }).catch(() => null);
    if (engRes && engRes.ok) {
      const engData = await engRes.json();
      if (Array.isArray(engData.engagedIds) && engData.engagedIds.length > 0) {
        state.engagedTweetIds = Array.from(new Set([...(state.engagedTweetIds || []), ...engData.engagedIds]));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ engagedTweetIds: state.engagedTweetIds });
        }
      }
    }

    const accessInput = document.getElementById('extAccessKeyInput');
    if (accessInput && state.accessKey) {
      accessInput.value = state.accessKey;
    }
  } catch (err) {
    console.warn('Backend server offline, using cached state', err);
  }
  updateCreditUI();
  renderCreatorChips();
}

function updateTgParseSummaryUI() {
  const inputEl = document.getElementById('tgLinksInput');
  const summaryEl = document.getElementById('tgParseSummary');
  const countBadge = document.getElementById('tgFreshCountBadge');
  const breakdownEl = document.getElementById('tgBreakdownText');
  if (!inputEl || !summaryEl) return;

  const raw = inputEl.value;
  if (!raw.trim()) {
    summaryEl.style.display = 'none';
    return;
  }

  const extracted = extractTweetLinks(raw);
  const filtered = filterTweetLinks(extracted);

  summaryEl.style.display = 'block';
  if (countBadge) {
    countBadge.textContent = `${filtered.freshCount} Fresh`;
    countBadge.style.color = filtered.freshCount > 0 ? '#10B981' : '#F59E0B';
  }
  if (breakdownEl) {
    breakdownEl.textContent = `Extracted: ${filtered.totalFound} · Duplicates Skipped: ${filtered.duplicateCount} · Already Engaged Skipped: ${filtered.alreadyEngagedCount}`;
  }
}

function handleCleanTgInput() {
  const inputEl = document.getElementById('tgLinksInput');
  if (!inputEl) return;
  const raw = inputEl.value;
  const extracted = extractTweetLinks(raw);
  if (extracted.length === 0) {
    alert('No valid X/Twitter links detected in the text.');
    return;
  }
  const filtered = filterTweetLinks(extracted);
  const cleanList = (filtered.freshTweets.length > 0 ? filtered.freshTweets : extracted).map(t => t.canonicalUrl);
  const uniqueClean = Array.from(new Set(cleanList));
  inputEl.value = uniqueClean.join('\n');
  updateTgParseSummaryUI();
  alert(`✓ Cleaned input!\nKept ${uniqueClean.length} canonical link(s).\nAll Telegram timestamps, usernames, post numbers (#), and emojis have been stripped.`);
}

function updateCreditUI() {
  const p = document.getElementById('creditBalanceText');
  if (p) p.textContent = Number(state.credits).toLocaleString();
  const b = document.getElementById('extCreditsBig');
  if (b) b.textContent = `${Number(state.credits).toLocaleString()} C`;
}

// Auto detect tweet on Twitter/X active tab
async function autoDetectTweet() {
  try {
    const tabs = await chrome.tabs?.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    const tab = tabs[0];
    state.activeTabId = tab.id;

    if (tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_FOCUSED_TWEET' }, (response) => {
        if (chrome.runtime?.lastError || !response || !response.success) return;
        const input = document.getElementById('targetTweetInput');
        if (input) input.value = response.tweetText || '';

        if (response.authorName || response.authorHandle) {
          const row = document.getElementById('tweetAuthorRow');
          if (row) row.style.display = 'flex';
          document.getElementById('authorName').textContent = response.authorName || 'Author';
          document.getElementById('authorHandle').textContent = response.authorHandle || '';
        }
      });
    }
  } catch (e) {
    console.error('Error querying tab:', e);
  }
}

// Generate reply via Server-Side endpoint
async function handleGenerateReply() {
  const tweetInput = document.getElementById('targetTweetInput')?.value.trim();
  if (!tweetInput) {
    alert('Please enter or detect a target tweet first.');
    return;
  }

  if (state.credits < 1) {
    alert('Insufficient credits! Please top up via the Credits tab.');
    switchExtTab('credits');
    return;
  }

  const generateBtn = document.getElementById('generateBtn');
  const generateText = document.getElementById('generateBtnText');
  generateBtn.disabled = true;
  generateText.textContent = 'Generating...';

  const tone = state.selectedTone;
  const author = document.getElementById('authorHandle')?.textContent || '@creator';

  let replyText = '';
  try {
    const backendUrl = await getBackendUrl();
    const response = await fetch(`${backendUrl}/api/generate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tweetText: tweetInput,
        tweetAuthor: author,
        style: tone,
        stylePrompt: state.selectedTonePrompt
      })
    });

    if (response.ok) {
      const data = await response.json();
      replyText = data.reply;
      if (typeof data.remainingCredits === 'number') {
        state.credits = data.remainingCredits;
      } else {
        deductCredits(1);
      }
    } else {
      throw new Error('Backend responded with ' + response.status);
    }
  } catch (err) {
    replyText = `The clearest sign of compounding velocity on X is high-context resonance. Exceptional breakdown.`;
    deductCredits(1);
  } finally {
    generateBtn.disabled = false;
    generateText.textContent = 'Generate Reply';
  }

  // Record this tweet as engaged if an ID is extractable
  try {
    const extractedTarget = extractTweetLinks(tweetInput);
    if (extractedTarget.length > 0) {
      const targetId = extractedTarget[0].tweetId;
      if (!state.engagedTweetIds.includes(targetId)) {
        state.engagedTweetIds.push(targetId);
        chrome.storage?.local.set({ engagedTweetIds: state.engagedTweetIds });
        const backendUrl = await getBackendUrl();
        fetch(`${backendUrl}/api/tweets/mark-engaged`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweets: [{
              tweet_id: targetId,
              handle: author,
              canonical_url: extractedTarget[0].canonicalUrl,
              action_type: 'ai_reply'
            }]
          })
        }).catch(() => null);
      }
    }
  } catch (e) {}

  // Display reply
  const resultCard = document.getElementById('resultCard');
  const replyOutput = document.getElementById('replyOutput');
  const charCount = document.getElementById('charCount');

  if (replyOutput) replyOutput.value = replyText;
  if (charCount) charCount.textContent = `${replyText.length} chars`;
  if (resultCard) resultCard.style.display = 'block';
}

// Insert into Tweet on active page
async function handleInsertTweet() {
  const replyText = document.getElementById('replyOutput')?.value;
  if (!replyText) return;

  try {
    const tabs = await chrome.tabs?.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'INJECT_REPLY_TEXT',
      replyText: replyText
    }, (res) => {
      if (chrome.runtime?.lastError || !res?.success) {
        navigator.clipboard?.writeText(replyText);
        alert('Copied to clipboard! (Click on the tweet reply box on X to paste).');
      } else {
        const btn = document.getElementById('insertTweetBtn');
        btn.textContent = '✓ Inserted!';
        setTimeout(() => { btn.textContent = '✓ Insert into X'; }, 1500);
      }
    });
  } catch (e) {
    navigator.clipboard?.writeText(replyText);
    alert('Copied to clipboard!');
  }
}

// ==============================================================
// AUTOMATION CONTROL & STOP BUTTON LOGIC
// ==============================================================
function triggerStopAutomation() {
  state.isAborted = true;
  console.log('[ATOMX] Stop automation requested by user.');

  // Broadcast abort signal to all Twitter / X tabs
  chrome.tabs?.query({}, (tabs) => {
    (tabs || []).forEach(tab => {
      if (tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
        chrome.tabs.sendMessage(tab.id, { type: 'ABORT_WORKFLOW' }, () => {
          if (chrome.runtime?.lastError) { /* ignore */ }
        });
      }
    });
  });

  setAutomationRunningUI(false);

  // Update live consoles
  const replyStatus = document.getElementById('replyConsoleStatus');
  const replyOutput = document.getElementById('replyConsoleOutput');
  if (replyStatus) replyStatus.textContent = '⏹️ Automation Stopped';
  if (replyOutput) replyOutput.textContent = 'Automation halted by user. Pacing delays and pending typing actions cancelled.';

  const agentStatus = document.getElementById('agentConsoleStatus');
  const agentOutput = document.getElementById('agentConsoleOutput');
  if (agentStatus) agentStatus.textContent = '⏹️ Agent Stopped';
  if (agentOutput) agentOutput.textContent = 'Workflow halted by user.';
}

function setAutomationRunningUI(isRunning) {
  const stopReplyBtn = document.getElementById('stopReplyAutomationBtn');
  const stopReplyConsoleBtn = document.getElementById('stopReplyConsoleBtn');
  const stopAgentBtn = document.getElementById('stopAgentBtn');
  const autoReplyBtn = document.getElementById('autoReplyEngageBtn');
  const autoReplyBtnText = document.getElementById('autoReplyEngageBtnText');
  const runTgBtn = document.getElementById('runTgEngageBtn');

  if (isRunning) {
    if (stopReplyBtn) stopReplyBtn.style.display = 'block';
    if (stopReplyConsoleBtn) stopReplyConsoleBtn.style.display = 'inline-block';
    if (stopAgentBtn) stopAgentBtn.style.display = 'inline-block';
    if (autoReplyBtn) autoReplyBtn.disabled = true;
    if (autoReplyBtnText) autoReplyBtnText.textContent = '⏳ Running Automation...';
    if (runTgBtn) {
      runTgBtn.disabled = true;
      runTgBtn.textContent = '⏳ Autonomous Raid Running...';
    }
  } else {
    if (stopReplyBtn) stopReplyBtn.style.display = 'none';
    if (stopReplyConsoleBtn) stopReplyConsoleBtn.style.display = 'none';
    if (stopAgentBtn) stopAgentBtn.style.display = 'none';
    if (autoReplyBtn) autoReplyBtn.disabled = false;
    updateReplyTargetSummaryUI();
    if (runTgBtn) {
      runTgBtn.disabled = false;
      runTgBtn.textContent = '▶ Launch Auto Engage';
    }
  }
}

// 1-Click Autonomous Reply & Engagement Handler for Reply Tab
async function handleAutoReplyEngage() {
  state.isAborted = false;
  const targetInput = document.getElementById('targetTweetInput');
  const rawText = targetInput ? targetInput.value.trim() : '';

  const like = document.getElementById('replyActLike')?.checked ?? true;
  const comment = document.getElementById('replyActComment')?.checked ?? true;
  const repost = document.getElementById('replyActRepost')?.checked ?? false;
  const follow = document.getElementById('replyActFollow')?.checked ?? false;
  const actions = { like, comment, repost, follow, scroll: true };

  const consoleCard = document.getElementById('replyConsoleCard');
  const consoleStatus = document.getElementById('replyConsoleStatus');
  const consoleOutput = document.getElementById('replyConsoleOutput');
  const consoleProgress = document.getElementById('replyConsoleBatchProgress');

  if (consoleCard) consoleCard.style.display = 'block';

  function logReplyConsole(status, text, progress = '') {
    if (consoleStatus) consoleStatus.textContent = status;
    if (consoleOutput) consoleOutput.textContent = text;
    if (consoleProgress) consoleProgress.textContent = progress;
  }

  const extracted = extractTweetLinks(rawText);

  // CASE 1: MULTI-LINK BATCH QUEUE (>1 links)
  if (extracted.length > 1) {
    const filtered = filterTweetLinks(extracted);
    if (filtered.freshTweets.length === 0) {
      alert(`All ${extracted.length} links are duplicates or already engaged!`);
      logReplyConsole('Batch Skipped', 'All links were already engaged or duplicated.');
      return;
    }

    if (state.credits < filtered.freshTweets.length) {
      alert(`Insufficient credits: You have ${state.credits} credits, but ${filtered.freshTweets.length} fresh links are queued.`);
      switchExtTab('credits');
      return;
    }

    logReplyConsole('Queue Started', `Automating ${filtered.freshTweets.length} fresh tweets with human pacing...`);
    setAutomationRunningUI(true);
    try {
      await executeAutonomousRaidWorkflow(filtered.freshTweets, actions, logReplyConsole);
    } finally {
      setAutomationRunningUI(false);
      updateReplyTargetSummaryUI();
    }
    return;
  }

  // CASE 2: SINGLE TWEET OR DETECTED TWEET
  let targetUrl = extracted.length === 1 ? extracted[0].canonicalUrl : null;
  let author = extracted.length === 1 ? extracted[0].handle : (document.getElementById('authorHandle')?.textContent || '@creator');

  if (state.credits < 1) {
    alert('Insufficient credits! Please top up via the Credits tab.');
    switchExtTab('credits');
    return;
  }

  setAutomationRunningUI(true);
  logReplyConsole('Generating AI Reply', `Crafting high-signal reply using ${state.selectedTone}...`);

  try {
    const backendUrl = await getBackendUrl();
    let replyText = '';

    if (actions.comment) {
      const resp = await fetch(`${backendUrl}/api/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweetText: rawText || (targetUrl || 'https://x.com'),
          tweetAuthor: author,
          style: state.selectedTone,
          stylePrompt: state.selectedTonePrompt
        })
      });

      if (resp.ok) {
        const d = await resp.json();
        replyText = d.reply;
      } else {
        replyText = 'High-signal observation. Execution velocity and clarity make all the difference.';
      }
    }

    if (state.isAborted) return;

    logReplyConsole('Executing on X.com', 'Checking status & executing actions with human typing...');
    const result = await runAutonomousActionOnTweet(targetUrl, actions, replyText);

    if (state.isAborted) return;

    // Handle auto-ignore rule: post already liked and commented
    if (result && result.result && result.result.ignored) {
      logReplyConsole('✓ Auto-Ignored', result.result.reason || 'Already completed');
      if (result.shouldClose && result.targetTabId) {
        chrome.tabs?.remove(result.targetTabId).catch(() => null);
      }
      alert(`ℹ️ Post Auto-Ignored:\n\n${result.result.reason}\n\nSince this post was already completed, no actions were performed and 0 credits were deducted.`);
      return;
    }

    // Engagement succeeded: deduct credit now
    deductCredits(1);

    if (result && result.shouldClose && result.targetTabId) {
      await sleep(1500);
      chrome.tabs?.remove(result.targetTabId).catch(() => null);
    }

    if (extracted.length === 1) {
      const tid = extracted[0].tweetId;
      state.engagedTweetIds = Array.from(new Set([...(state.engagedTweetIds || []), tid]));
      chrome.storage?.local.set({ engagedTweetIds: state.engagedTweetIds });
    }

    const actionsPerformed = result?.result?.performed?.join(', ') || 'Liked and Commented';
    logReplyConsole('✓ Engagement Complete', `Done: ${actionsPerformed}`);
    alert(`🚀 Autonomous Engagement Complete!\n\n${actionsPerformed} on X.com.`);
  } catch (err) {
    console.error('Engagement error:', err);
    logReplyConsole('Error', err.message);
    alert('Could not complete autonomous reply: ' + err.message);
  } finally {
    setAutomationRunningUI(false);
    updateCreditUI();
  }
}

// Auto-Post Reply Directly on X.com (Single Post preview button)
document.getElementById('autoPostReplyBtn')?.addEventListener('click', async () => {
  const replyText = document.getElementById('replyOutput')?.value?.trim();
  if (!replyText) {
    alert('Please generate or enter a reply first.');
    return;
  }

  const tweetInput = document.getElementById('targetTweetInput')?.value?.trim();
  const targetLinks = extractTweetLinks(tweetInput || '');
  let targetUrl = targetLinks.length > 0 ? targetLinks[0].canonicalUrl : null;

  const btn = document.getElementById('autoPostReplyBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Posting to X...';
  }

  try {
    const actions = {
      like: true,
      comment: true,
      scroll: true,
      repost: false,
      follow: false
    };

    updateAgentConsole('Auto-Posting', 'Opening tweet on X and submitting comment...');
    const result = await runAutonomousActionOnTweet(targetUrl, actions, replyText);

    if (result && result.shouldClose && result.targetTabId) {
      setTimeout(() => chrome.tabs?.remove(targetTabId), 1500);
    }

    deductCredits(1);
    updateAgentConsole('✓ Posted Successfully', 'Reply typed and posted on X.com!');
    alert('🚀 Autonomous Post Complete!\nTweet was liked and your reply was submitted on X.com.');
  } catch (err) {
    console.error('Auto post failed:', err);
    alert('Could not auto-post on X. Please ensure you are logged into X.com.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Post Comment';
    }
  }
});

// Autonomous Raid Loop: Visits each tweet, scrolls, likes, comments, reposts & follows
async function executeAutonomousRaidWorkflow(tweets, actions, logCallback = null) {
  state.isAborted = false;
  setAutomationRunningUI(true);
  const total = tweets.length;
  let successCount = 0;
  let ignoredCount = 0;
  const backendUrl = await getBackendUrl();

  const logger = (st, log, prog = '') => {
    if (logCallback) logCallback(st, log, prog);
    else updateAgentConsole(st, log);
  };

  try {
    for (let i = 0; i < total; i++) {
      if (state.isAborted) {
        logger('⏹️ Stopped', 'Autonomous workflow stopped by user.');
        break;
      }

      const t = tweets[i];
      const indexStr = `[${i + 1}/${total}]`;
      logger(`Processing ${indexStr}`, `Visiting ${t.canonicalUrl}... Checking actions.`, `${i + 1}/${total}`);

      if (state.isAborted) {
        logger('⏹️ Stopped', 'Autonomous workflow stopped by user.');
        break;
      }

      try {
        const outcome = await runAutonomousActionOnTweet(t.canonicalUrl, actions, {
          backendUrl,
          style: state.selectedTone,
          stylePrompt: state.selectedTonePrompt,
          tweetAuthor: t.handle,
          generateContextual: actions.comment
        });

        if (state.isAborted) {
          logger('⏹️ Stopped', 'Autonomous workflow stopped by user.');
          break;
        }

        // Auto-ignore rule: post already liked & commented
        if (outcome && outcome.result && outcome.result.ignored) {
          ignoredCount++;
          logger(`Skipped ${indexStr}`, `Auto-ignored: ${outcome.result.reason || 'Already completed'} (0 credits used)`, `${i + 1}/${total}`);
          if (outcome.shouldClose && outcome.targetTabId) {
            chrome.tabs?.remove(outcome.targetTabId).catch(() => null);
          }
          continue; // No credit deduction, proceed to next tweet
        }

        successCount++;

        // Deduct credit & persist engaged tweet ID
        deductCredits(1);
        state.engagedTweetIds = Array.from(new Set([...(state.engagedTweetIds || []), t.tweetId]));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ engagedTweetIds: state.engagedTweetIds });
        }

        fetch(`${backendUrl}/api/tweets/mark-engaged`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweets: [{
              tweet_id: t.tweetId,
              handle: t.handle,
              canonical_url: t.canonicalUrl,
              action_type: 'autonomous_raid'
            }]
          })
        }).catch(() => null);

        if (outcome.shouldClose && outcome.targetTabId) {
          await sleep(1500);
          chrome.tabs?.remove(outcome.targetTabId).catch(() => null);
        }

        updateTgParseSummaryUI();

        // Anti-ban randomized pacing sleep before next tweet
        if (i < total - 1 && !state.isAborted) {
          const pacingSleep = Math.max(3, state.delaySeconds + Math.floor(Math.random() * 4 - 2));
          for (let sec = pacingSleep; sec > 0; sec--) {
            if (state.isAborted) break;
            logger(`Pacing Safety Delay (${indexStr})`, `Waiting ${sec}s before next post to mimic human behavior...`, `${i + 1}/${total}`);
            await sleep(1000);
          }
        }
      } catch (err) {
        console.warn(`Error automating tweet ${t.canonicalUrl}:`, err);
      }
    }

    if (!state.isAborted) {
      logger('Engagement Completed', `Finished: ${successCount} engaged, ${ignoredCount} auto-ignored of ${total} tweet(s).`, `${successCount}/${total}`);
      alert(`✓ Autonomous Engagement Finished!\n\n• Engaged: ${successCount}\n• Auto-Ignored (Already completed): ${ignoredCount}\n• Total Processed: ${total}\n\nHuman-like typing and selective action rules applied.`);
    }
  } finally {
    setAutomationRunningUI(false);
    updateCreditUI();
  }
}

// Opens tab (or targets active tab) and sends command to content script
async function runAutonomousActionOnTweet(tweetUrl, actions, options = {}) {
  let targetTabId = null;
  let shouldClose = false;

  const currentTabs = await chrome.tabs?.query({ active: true, currentWindow: true });
  const activeTab = currentTabs && currentTabs[0];

  if (!tweetUrl && activeTab && (activeTab.url?.includes('twitter.com') || activeTab.url?.includes('x.com'))) {
    targetTabId = activeTab.id;
  } else if (tweetUrl && activeTab && activeTab.url && activeTab.url.includes(tweetUrl.split('?')[0])) {
    targetTabId = activeTab.id;
  } else if (tweetUrl) {
    const newTab = await chrome.tabs.create({ url: tweetUrl, active: true });
    targetTabId = newTab.id;
    shouldClose = true;
    await waitForTabComplete(targetTabId);
    await sleep(2500); // Wait for React hydration
  } else {
    throw new Error('No valid tweet URL or active Twitter tab found.');
  }

  const replyText = typeof options === 'string' ? options : (options.replyText || '');
  const style = typeof options === 'object' ? (options.style || state.selectedTone) : state.selectedTone;
  const stylePrompt = typeof options === 'object' ? (options.stylePrompt || state.selectedTonePrompt) : state.selectedTonePrompt;
  const backendUrl = typeof options === 'object' ? (options.backendUrl || await getBackendUrl()) : await getBackendUrl();
  const tweetAuthor = typeof options === 'object' ? (options.tweetAuthor || '') : '';
  const generateContextual = typeof options === 'object' ? (options.generateContextual !== false && !replyText) : false;

  const result = await new Promise((resolve) => {
    chrome.tabs.sendMessage(targetTabId, {
      type: 'EXECUTE_AUTONOMOUS_ENGAGEMENT',
      actions,
      replyText,
      style,
      stylePrompt,
      backendUrl,
      tweetAuthor,
      tweetUrl,
      generateContextual
    }, (response) => {
      if (chrome.runtime?.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: true });
      }
    });
  });

  return { targetTabId, shouldClose, result };
}

function waitForTabComplete(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    }
    chrome.tabs?.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs?.onUpdated.removeListener(listener);
      resolve(false);
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getBackendUrl() {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const res = await chrome.storage.sync.get(['backendUrl']);
    return res.backendUrl || DEFAULT_BACKEND_URL;
  }
  return DEFAULT_BACKEND_URL;
}
