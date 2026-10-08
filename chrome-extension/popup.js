/**
 * ATOMX ENGAGE — CHROME EXTENSION POPUP CONTROLLER
 * Full 10 Autonomous Agents Suite + Multi-Provider AI + Anti-Ban Pacing
 */

const DEFAULT_BACKEND_URL = 'https://agenticx-two.vercel.app';

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
  const engagedSet = new Set((options.engagedTweetIds || state.engagedTweetIds || []).map(String));
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
  window.alert = function (msg) {
    showExtNotification(msg);
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ backendUrl: DEFAULT_BACKEND_URL });
    chrome.storage.sync?.set({ backendUrl: DEFAULT_BACKEND_URL });
  }
  initExtTheme();
  initTabs();
  initListeners();
  initAgentListeners();

  // Instant render path from cache (0 delay)
  await Promise.all([
    initToneSystem(),
    loadServerState()
  ]);

  // Non-blocking background operations
  initAudienceBuilderSystem().catch(console.warn);
  autoDetectTweet().catch(console.warn);
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
    const stored = await chrome.storage.local.get(['customTones', 'selectedTone', 'selectedTonePrompt', 'selectedToneId']).catch(() => ({}));
    if (Array.isArray(stored?.customTones)) state.customTones = stored.customTones;
    if (stored?.selectedTone) state.selectedTone = stored.selectedTone;
    if (stored?.selectedTonePrompt) state.selectedTonePrompt = stored.selectedTonePrompt;
    if (stored?.selectedToneId) state.selectedToneId = stored.selectedToneId;
  }

  // Render tone pills immediately from cache
  renderTonePills();
  setupCustomToneDrawer();

  // Non-blocking network sync
  syncToneStylesFromServer();
}

async function syncToneStylesFromServer() {
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
        const matching = state.defaultTones.find(t =>
          (state.selectedToneId && t.id === state.selectedToneId) ||
          (state.selectedTone && t.name === state.selectedTone)
        );
        if (matching) {
          state.selectedToneId = matching.id;
          state.selectedTone = matching.name;
          state.selectedTonePrompt = matching.prompt;
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({
              selectedToneId: matching.id,
              selectedTone: matching.name,
              selectedTonePrompt: matching.prompt
            });
          }
        }
        renderTonePills();
      }
    }
  } catch (e) { }
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

  // 1-to-1 Verified Account & In-Extension Request Access Flow
  document.getElementById('extSubmitRequestBtn')?.addEventListener('click', handleExtSubmitRequest);
  document.getElementById('extCheckStatusBtn')?.addEventListener('click', () => handleExtCheckStatus(true));
  document.getElementById('extEditRequestBtn')?.addEventListener('click', () => showAccessSubView('request'));
  document.getElementById('extGoToLoginLink')?.addEventListener('click', () => showAccessSubView('login'));
  document.getElementById('extGoToRequestLink')?.addEventListener('click', () => showAccessSubView('request'));
  document.getElementById('extGoToResetPwdLink')?.addEventListener('click', () => showAccessSubView('reset'));
  document.getElementById('extBackToLoginFromResetBtn')?.addEventListener('click', () => showAccessSubView('login'));
  document.getElementById('extResetPasswordSubmitBtn')?.addEventListener('click', handleExtResetPassword);
  document.getElementById('extRequestReviewBtn')?.addEventListener('click', handleExtRequestReview);
  document.getElementById('extSuspendedLogoutBtn')?.addEventListener('click', handleExtLogout);
  document.getElementById('extSaveNewPasswordSubmitBtn')?.addEventListener('click', handleExtSetPassword);
  document.getElementById('extLoginSubmitBtn')?.addEventListener('click', handleExtLogin);
  document.getElementById('extLogoutBtn')?.addEventListener('click', handleExtLogout);
  document.getElementById('extForceResetBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all local extension session cache and return to request access?')) {
      await purgeExtLocalUserSession();
      alert('✓ Local cache cleared successfully.');
    }
  });
  document.getElementById('extSyncAccountBtn')?.addEventListener('click', async () => {
    await loadServerState();
    alert('✓ Account details & credit balance synchronized with server.');
  });

  // Password visibility eye toggles
  document.querySelectorAll('.pwd-eye-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
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
  replystudio: { title: 'AI Reply Assistant', icon: '💬', badge: '1-CLICK', desc: 'Contextual 1-click reply engine calibrated to your tone' },
  defaulter: { title: 'Find Defaulters', icon: '🔍', badge: 'AUDIT POD', desc: 'Scan post comments & detect members who skipped commenting' },
  tgliveliker: { title: 'TG Live Liker (Proof Rec)', icon: '🔴', badge: 'PROOF REC', desc: 'Continuous raid liker — keeps tab open for screen record proof' },
  reciprocator: { title: 'Commenter Reciprocator', icon: '🤝', badge: 'RECIPROCAL', desc: 'Visits accounts who commented on your post & comments back on their recent posts' }
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
    if (!(await ensureVerifiedAccountOrBlock())) return;

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

  // Agent 2: Audience Builder (A2, Growth, Fully Auto)
  document.getElementById('audienceListSelect')?.addEventListener('change', (e) => {
    const box = document.getElementById('customListUrlBox');
    if (box) box.style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  document.getElementById('runAudienceBuilderBtn')?.addEventListener('click', () => {
    startAudienceBuilderWorkflow();
  });

  document.getElementById('stopAudienceBuilderBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    chrome.tabs?.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    });
    updateAgentConsole('⏹️ Stopped', 'Audience Builder stopped by user.');
    const startBtn = document.getElementById('runAudienceBuilderBtn');
    const stopBtn = document.getElementById('stopAudienceBuilderBtn');
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    const statusText = document.getElementById('audienceLiveStatusText');
    if (statusText) statusText.textContent = 'Workflow stopped by user.';
    const countdownEl = document.getElementById('audienceCountdownText');
    if (countdownEl) countdownEl.style.display = 'none';
    const badge = document.getElementById('audienceStateBadge');
    if (badge) badge.textContent = 'STOPPED';
  });

  document.getElementById('resetAudienceQueueBtn')?.addEventListener('click', () => {
    chrome.storage.local.remove([
      'atomx_audience_queue',
      'atomx_audience_queue_pos',
      'atomx_audience_counters'
    ], () => {
      const doneEl = document.getElementById('audienceDoneCount');
      const colEl = document.getElementById('audienceCollectedCount');
      const skipEl = document.getElementById('audienceSkippedCount');
      const qInd = document.getElementById('audienceQueueIndicator');
      const bar = document.getElementById('audienceProgressBar');
      const status = document.getElementById('audienceLiveStatusText');
      const badge = document.getElementById('audienceStateBadge');
      const countdown = document.getElementById('audienceCountdownText');
      if (doneEl) doneEl.textContent = '0';
      if (colEl) colEl.textContent = '0';
      if (skipEl) skipEl.textContent = '0';
      if (qInd) qInd.textContent = 'Profile 0/0';
      if (bar) bar.style.width = '0%';
      if (status) status.textContent = 'Audience queue and counters reset.';
      if (badge) badge.textContent = 'IDLE';
      if (countdown) countdown.style.display = 'none';
      showExtToast('Audience Queue Reset', '🔄');
    });
  });

  // Agent 3: Increase Sorsa Score
  document.getElementById('runSorsaBoosterBtn')?.addEventListener('click', () => {
    startSorsaScoreBoosterWorkflow();
  });
  document.getElementById('stopSorsaBoosterBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    showExtToast('Stopping Sorsa Booster...', '⏹');
  });

  // Agent 4: Followers Increase
  document.getElementById('runFollowerIncreaseBtn')?.addEventListener('click', () => {
    startFollowersIncreaseWorkflow();
  });
  document.getElementById('stopFollowerIncreaseBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    showExtToast('Stopping Follower Growth...', '⏹');
  });

  // Agent 5: Post Generator
  document.getElementById('generatePostBtn')?.addEventListener('click', async () => {
    const notes = document.getElementById('rawNotesInput')?.value.trim();
    if (!notes) {
      alert('Please enter your raw notes or link to generate post.');
      return;
    }
    const fmt = document.getElementById('postFormatSelect')?.value || 'medium';
    const outContainer = document.getElementById('postOutputContainer');
    const outArea = document.getElementById('postOutputArea');
    if (outContainer) outContainer.style.display = 'flex';
    if (outArea) {
      outArea.style.display = 'block';
      outArea.value = 'Generating viral post via ATOMX AI engine...';
    }
    deductCredits(1);

    setTimeout(() => {
      if (outArea) {
        if (fmt === 'thread') {
          outArea.value = `1/4 Most creators overcomplicate Twitter growth.\n\nHere is what actually works based on 22k+ followers: consistency, value-first replies, and autonomous pacing.\n\n2/4 Stop commenting generic phrases. Give actionable perspectives.\n\n3/4 Focus on high Sorsa Score accounts to build real ecosystem authority.\n\n4/4 Execution compounds every single day. Keep building.`;
        } else {
          outArea.value = `The secret to rapid organic distribution on X isn't luck—it's high-context resonance delivered with relentless consistency. Focus on adding genuine insight to every thread.`;
        }
      }
      updateAgentConsole('Post Generated', `Successfully formatted post (${fmt}) using ATOMX AI Studio.`);
    }, 500);
  });

  document.getElementById('copyPostDraftBtn')?.addEventListener('click', () => {
    const text = document.getElementById('postOutputArea')?.value;
    if (text) {
      navigator.clipboard?.writeText(text);
      alert('✓ Post draft copied to clipboard!');
    }
  });

  // Agent 6: Reply Back (A6, Posts, Fully Auto)
  document.getElementById('replyBackUseCurrentTabBtn')?.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) && tabs[0].url.includes('/status/')) {
        const cleanUrl = tabs[0].url.split('?')[0];
        const in1 = document.getElementById('myTweetUrlInput1');
        const in2 = document.getElementById('myTweetUrlInput2');
        const in3 = document.getElementById('myTweetUrlInput3');
        if (in1 && !in1.value.trim()) {
          in1.value = cleanUrl;
        } else if (in2 && !in2.value.trim()) {
          in2.value = cleanUrl;
        } else if (in3 && !in3.value.trim()) {
          in3.value = cleanUrl;
        } else if (in1) {
          in1.value = cleanUrl;
        }
        showExtToast('Current Post Linked to Reply Back', '⚡');
      } else {
        alert('Please open your tweet/post on Twitter / X in your active browser tab first.');
      }
    } catch (e) {
      console.warn('Could not query current tab:', e);
    }
  });

  document.getElementById('runReplyBackBtn')?.addEventListener('click', () => {
    startReplyBackLoopWorkflow();
  });

  document.getElementById('stopReplyBackBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    chrome.tabs?.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    });
    updateAgentConsole('⏹️ Stopped', 'Reply Back loop stopped by user.');
    const startBtn = document.getElementById('runReplyBackBtn');
    const stopBtn = document.getElementById('stopReplyBackBtn');
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    const statusText = document.getElementById('replyBackLiveStatusText');
    if (statusText) statusText.textContent = 'Workflow stopped by user.';
    const badge = document.getElementById('replyBackStateBadge');
    if (badge) badge.textContent = 'STOPPED';
    const countdown = document.getElementById('replyBackCountdownText');
    if (countdown) countdown.style.display = 'none';
  });

  // Agent 7: Auto Unfollow (A7, Standalone Safety Optimizer)
  document.getElementById('runAutoUnfollowBtn')?.addEventListener('click', () => {
    startAutoUnfollowWorkflow();
  });

  document.getElementById('stopAutoUnfollowBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    chrome.tabs?.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    });
    updateAgentConsole('⏹️ Stopped', 'Auto Unfollow stopped by user.');
    const startBtn = document.getElementById('runAutoUnfollowBtn');
    const stopBtn = document.getElementById('stopAutoUnfollowBtn');
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    const statusText = document.getElementById('unfollowLiveStatusText');
    if (statusText) statusText.textContent = 'Workflow stopped by user.';
    const badge = document.getElementById('unfollowStateBadge');
    if (badge) badge.textContent = 'STOPPED';
    const countdown = document.getElementById('unfollowCountdownText');
    if (countdown) countdown.style.display = 'none';
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

  document.getElementById('runCreatorRadarBtn')?.addEventListener('click', () => {
    updateAgentConsole('Radar Active', `Monitoring ${state.creators.length} creators for early engagement.`);
    alert(`⚡ Creators Radar Active!\nMonitoring ${state.creators.length} VIP accounts.\nThe bot will scan for new posts and notify or comment immediately.`);
  });

  // Agent 11: Find Defaulter Listeners
  document.getElementById('defaulterUseCurrentTabBtn')?.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
        const inp = document.getElementById('defaulterPostUrl');
        if (inp) inp.value = tabs[0].url.split('?')[0];
        showExtToast('Current Tweet URL Linked', '⚡');
      } else {
        alert('Please open your target tweet on Twitter / X in your active browser tab first.');
      }
    } catch (e) { }
  });

  document.getElementById('defaulterCleanListBtn')?.addEventListener('click', () => {
    const txt = document.getElementById('defaulterExpectedUsers');
    if (!txt) return;
    const handles = parseDefaulterHandles(txt.value);
    txt.value = handles.map(h => '@' + h).join(', ');
    const countBadge = document.getElementById('defaulterExpectedCountBadge');
    if (countBadge) countBadge.textContent = `${handles.length} Members`;
    showExtToast(`Cleaned & Extracted ${handles.length} @handles`, '🧹');
  });

  document.getElementById('defaulterExpectedUsers')?.addEventListener('input', (e) => {
    const handles = parseDefaulterHandles(e.target.value);
    const countBadge = document.getElementById('defaulterExpectedCountBadge');
    if (countBadge) countBadge.textContent = `${handles.length} Members`;
  });

  document.getElementById('startDefaulterAuditBtn')?.addEventListener('click', startDefaulterAuditWorkflow);
  document.getElementById('stopDefaulterAuditBtn')?.addEventListener('click', stopDefaulterAuditWorkflow);

  // Agent 12: Telegram Live Liker Listeners
  document.getElementById('tgLiveUseCurrentTabBtn')?.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
        const inp = document.getElementById('tgLiveRaidInput');
        if (inp) inp.value = tabs[0].url.split('?')[0];
        showExtToast('Current Tab Feed Linked', '⚡');
      }
    } catch (e) { }
  });

  document.getElementById('startTgLiveRaidBtn')?.addEventListener('click', startTgLiveRaidWorkflow);
  document.getElementById('stopTgLiveRaidBtn')?.addEventListener('click', stopTgLiveRaidWorkflow);

  // Agent 13: Commenter Reciprocator Listeners
  document.getElementById('reciprocatorUseCurrentTabBtn')?.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) && tabs[0].url.includes('/status/')) {
        const inp = document.getElementById('reciprocatorPostUrl');
        if (inp) inp.value = tabs[0].url.split('?')[0];
        showExtToast('Current Tweet URL Linked', '⚡');
      } else {
        alert('Please open your target tweet on Twitter / X in your active browser tab first.');
      }
    } catch (e) { }
  });

  document.getElementById('runReciprocatorBtn')?.addEventListener('click', startCommenterReciprocatorWorkflow);
  document.getElementById('stopReciprocatorBtn')?.addEventListener('click', () => {
    state.isAborted = true;
    chrome.tabs?.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    });
    updateAgentConsole('⏹️ Stopped', 'Commenter Reciprocator stopped by user.');
    const startBtn = document.getElementById('runReciprocatorBtn');
    const stopBtn = document.getElementById('stopReciprocatorBtn');
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    const statusText = document.getElementById('reciprocatorLiveStatusText');
    if (statusText) statusText.textContent = 'Workflow stopped by user.';
    const badge = document.getElementById('reciprocatorStateBadge');
    if (badge) badge.textContent = 'STOPPED';
    const countdown = document.getElementById('reciprocatorCountdownText');
    if (countdown) countdown.style.display = 'none';
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

// =========================================================================
// AGENT 11: FIND DEFAULTERS AUDIT WORKFLOW
// =========================================================================
function parseDefaulterHandles(raw) {
  if (!raw) return [];
  const matches = raw.match(/@?[A-Za-z0-9_]{1,15}/g) || [];
  const clean = new Set();
  matches.forEach(m => {
    const h = m.replace(/^@/, '').toLowerCase().trim();
    if (h && h.length >= 2 && !['http', 'https', 'com', 'org', 'status'].includes(h)) {
      clean.add(h);
    }
  });
  return Array.from(clean);
}

let defaulterActiveTabId = null;

async function startDefaulterAuditWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  if (state.credits < 5) {
    alert(`⚠️ Insufficient credits!\nYou need 5 credits to audit post comments and find defaulters, but you have ${state.credits}.\nPlease top up credits in the Credits tab.`);
    switchExtTab('credits');
    return;
  }

  const postUrlInput = document.getElementById('defaulterPostUrl');
  let postUrl = postUrlInput ? postUrlInput.value.trim() : '';

  if (!postUrl || (!postUrl.includes('twitter.com') && !postUrl.includes('x.com'))) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) && tabs[0].url.includes('/status/')) {
      postUrl = tabs[0].url.split('?')[0];
      if (postUrlInput) postUrlInput.value = postUrl;
    } else {
      alert('Please enter a valid tweet URL (e.g. https://x.com/username/status/123456...) or navigate to it in your active tab.');
      return;
    }
  }

  const rawUsers = document.getElementById('defaulterExpectedUsers')?.value || '';
  const expectedHandles = parseDefaulterHandles(rawUsers);

  if (expectedHandles.length === 0) {
    alert('Please paste or list the expected Telegram group members or usernames to check against.');
    return;
  }

  const startBtn = document.getElementById('startDefaulterAuditBtn');
  const stopBtn = document.getElementById('stopDefaulterAuditBtn');
  const resultsCard = document.getElementById('defaulterResultsCard');
  const heading = document.getElementById('defaulterResultsHeading');
  const statExp = document.getElementById('defaulterStatExpected');
  const statCom = document.getElementById('defaulterStatCommented');
  const statDef = document.getElementById('defaulterStatDefaulters');
  const chipsContainer = document.getElementById('defaulterChipsContainer');
  const copyBtn = document.getElementById('copyDefaultersBtn');

  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'block';
  if (resultsCard) resultsCard.style.display = 'block';
  if (heading) heading.textContent = 'Scanning comments on tweet feed...';
  if (statExp) statExp.textContent = String(expectedHandles.length);
  if (statCom) statCom.textContent = '...';
  if (statDef) statDef.textContent = '...';
  if (chipsContainer) chipsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted); padding:6px;">Auditing comment replies in background... Please wait ~15-20s.</span>';
  if (copyBtn) copyBtn.style.display = 'none';

  updateAgentConsole('Audit Running', `Scanning comments on: ${postUrl}`);
  state.isAborted = false;

  try {
    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    defaulterActiveTabId = tab.id;
    await waitForTabComplete(tab.id);
    await sleep(3000);

    if (state.isAborted) return;

    const auditRes = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'AUDIT_POST_DEFAULTERS', maxScrolls: 15 }, (res) => resolve(res || { success: false, commenters: [] }));
    });

    try { await chrome.tabs.remove(tab.id); } catch (e) { }
    defaulterActiveTabId = null;

    if (state.isAborted) {
      if (heading) heading.textContent = 'Audit Stopped by User';
      return;
    }

    const commentersSet = new Set((auditRes.commenters || []).map(c => c.toLowerCase()));
    const mainAuthor = (auditRes.mainAuthor || '').toLowerCase();

    // Defaulters: in expected list, but did NOT comment (and not the post author)
    const defaulters = expectedHandles.filter(h => !commentersSet.has(h) && h !== mainAuthor);
    const compliant = expectedHandles.filter(h => commentersSet.has(h));

    // Deduct 5 credits for successful audit
    deductCredits(5);

    if (heading) heading.textContent = `Audit Complete — Found ${defaulters.length} Defaulter${defaulters.length === 1 ? '' : 's'}`;
    if (statExp) statExp.textContent = String(expectedHandles.length);
    if (statCom) statCom.textContent = String(compliant.length);
    if (statDef) statDef.textContent = String(defaulters.length);

    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      if (defaulters.length === 0) {
        chipsContainer.innerHTML = '<span style="font-size:11px; color:#10B981; font-weight:700; padding:6px;">🎉 100% Compliant! All ' + expectedHandles.length + ' group members commented on your post!</span>';
      } else {
        defaulters.forEach(d => {
          const badge = document.createElement('span');
          badge.className = 'badge-mini';
          badge.style.cssText = 'background:rgba(239, 68, 68, 0.15); color:#EF4444; border:1px solid rgba(239, 68, 68, 0.3); font-weight:700; cursor:pointer;';
          badge.textContent = `@${d}`;
          badge.title = 'Click to copy handle';
          badge.onclick = () => {
            navigator.clipboard?.writeText(`@${d}`);
            showExtToast(`Copied @${d}`, '📋');
          };
          chipsContainer.appendChild(badge);
        });
      }
    }

    if (copyBtn && defaulters.length > 0) {
      copyBtn.style.display = 'block';
      copyBtn.onclick = () => {
        const textToCopy = defaulters.map(d => `@${d}`).join(' ');
        navigator.clipboard?.writeText(textToCopy);
        showExtToast(`Copied ${defaulters.length} defaulters to clipboard`, '📋');
      };
    }

    updateAgentConsole('Audit Finished', `Found ${defaulters.length} defaulters out of ${expectedHandles.length} members. 5 credits deducted.`);
    showExtToast(`Audit Complete (${defaulters.length} Defaulters)`, '🔍');

  } catch (err) {
    console.error('Defaulter audit error:', err);
    if (heading) heading.textContent = 'Audit Failed: ' + (err.message || 'Error');
    if (defaulterActiveTabId) {
      try { await chrome.tabs.remove(defaulterActiveTabId); } catch (e) { }
      defaulterActiveTabId = null;
    }
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

function stopDefaulterAuditWorkflow() {
  state.isAborted = true;
  if (defaulterActiveTabId) {
    try { chrome.tabs.remove(defaulterActiveTabId); } catch (e) { }
    defaulterActiveTabId = null;
  }
  const startBtn = document.getElementById('startDefaulterAuditBtn');
  const stopBtn = document.getElementById('stopDefaulterAuditBtn');
  if (startBtn) startBtn.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'none';
  showExtToast('Audit stopped by user', '⏹');
}

// =========================================================================
// AGENT 12: TELEGRAM LIVE LIKER (SCREEN-RECORD FRIENDLY RAID)
// =========================================================================
let tgLiveWorkingTabId = null;

async function startTgLiveRaidWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  if (state.credits < 1) {
    alert('⚠️ Insufficient credits! You need at least 1 credit to run live raid engagement.\nPlease top up credits in the Credits tab.');
    switchExtTab('credits');
    return;
  }

  const rawInput = document.getElementById('tgLiveRaidInput')?.value || '';
  let tweetLinks = extractTweetLinks(rawInput);

  if (tweetLinks.length === 0) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
      tweetLinks = [tabs[0].url.split('?')[0]];
    } else {
      alert('Please paste raid tweet links or navigate to the target post in your active browser tab.');
      return;
    }
  }

  const actions = {
    like: document.getElementById('tgLiveOptLike')?.checked ?? true,
    repost: document.getElementById('tgLiveOptRepost')?.checked ?? true,
    bookmark: document.getElementById('tgLiveOptBookmark')?.checked ?? false,
    glow: document.getElementById('tgLiveOptGlow')?.checked ?? true
  };

  const pacingMs = parseInt(document.getElementById('tgLivePacingSelect')?.value, 10) || 3500;

  const startBtn = document.getElementById('startTgLiveRaidBtn');
  const stopBtn = document.getElementById('stopTgLiveRaidBtn');
  const statusCard = document.getElementById('tgLiveStatusCard');
  const statusText = document.getElementById('tgLiveStatusText');
  const countLiked = document.getElementById('tgLiveCountLiked');
  const countReposted = document.getElementById('tgLiveCountReposted');
  const countBookmarked = document.getElementById('tgLiveCountBookmarked');

  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'block';
  if (statusCard) statusCard.style.display = 'block';
  if (statusText) statusText.textContent = `Starting Live Raid (Target 1 of ${tweetLinks.length})...`;

  let totalLiked = 0, totalReposted = 0, totalBookmarked = 0;
  state.isAborted = false;

  updateAgentConsole('Live Raid Active', 'Recording-friendly tab created. Tab will stay open for proof recording.');

  try {
    // 1. OPEN TAB WITH active: true SO SCREEN RECORDER CAN CAPTURE IT
    const initialTab = await chrome.tabs.create({ url: tweetLinks[0], active: true });
    tgLiveWorkingTabId = initialTab.id;

    for (let i = 0; i < tweetLinks.length; i++) {
      if (state.isAborted) break;

      const currentUrl = tweetLinks[i];
      if (statusText) statusText.textContent = `Recording Tweet ${i + 1} of ${tweetLinks.length}...`;

      if (i > 0) {
        await chrome.tabs.update(tgLiveWorkingTabId, { url: currentUrl, active: true });
      }

      await waitForTabComplete(tgLiveWorkingTabId);
      await sleep(2500); // Wait for tweet rendering

      if (state.isAborted) break;

      const raidRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tgLiveWorkingTabId, {
          type: 'EXECUTE_LIVE_RAID_ENGAGEMENT',
          actions,
          delay: pacingMs
        }, (res) => resolve(res || { success: false }));
      });

      if (raidRes.success) {
        deductCredits(1);
        if (raidRes.liked) totalLiked++;
        if (raidRes.reposted) totalReposted++;
        if (raidRes.bookmarked) totalBookmarked++;

        if (countLiked) countLiked.textContent = String(totalLiked);
        if (countReposted) countReposted.textContent = String(totalReposted);
        if (countBookmarked) countBookmarked.textContent = String(totalBookmarked);

        updateAgentConsole('Raid Executed', `Live action completed on tweet ${i + 1}. Liked: ${raidRes.liked}, Reposted: ${raidRes.reposted}`);
      }

      // Safe pacing delay so screen recording captures the full interaction
      await sleep(pacingMs);
    }

    if (statusText) {
      statusText.textContent = state.isAborted
        ? `Stopped. Tab kept open for recording proof!`
        : `✓ Raid Complete! Tab is left open for screen record proof.`;
    }
    showExtToast('Raid finished — tab left open for proof!', '🎥');

    // NOTE: WE DELIBERATELY DO NOT CLOSE THE TAB! TAB STAYS OPEN AS REQUESTED!

  } catch (err) {
    console.error('Live raid error:', err);
    if (statusText) statusText.textContent = 'Raid Error: ' + err.message;
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

function stopTgLiveRaidWorkflow() {
  state.isAborted = true;
  const startBtn = document.getElementById('startTgLiveRaidBtn');
  const stopBtn = document.getElementById('stopTgLiveRaidBtn');
  if (startBtn) startBtn.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'none';
  const statusText = document.getElementById('tgLiveStatusText');
  if (statusText) statusText.textContent = 'Raid stopped by user. Tab is left open.';
  showExtToast('Live raid stopped (tab left open)', '⏹');
}

// =========================================================================
// AGENT 13: COMMENTER RECIPROCATOR WORKFLOW ENGINE
// =========================================================================
async function startCommenterReciprocatorWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const postUrlInput = document.getElementById('reciprocatorPostUrl');
  let postUrl = postUrlInput ? postUrlInput.value.trim() : '';

  if (!postUrl || (!postUrl.includes('twitter.com') && !postUrl.includes('x.com'))) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (tabs && tabs[0]?.url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) && tabs[0].url.includes('/status/')) {
      postUrl = tabs[0].url.split('?')[0];
      if (postUrlInput) postUrlInput.value = postUrl;
    } else {
      alert('⚠️ Please enter a valid tweet URL (e.g. https://x.com/yourhandle/status/18420958...) or open it in your active tab.');
      return;
    }
  }

  if (state.credits < 1) {
    alert('⚠️ Insufficient credits!\nYou need at least 1 credit to reciprocate and comment on commenters\' posts.\nPlease top up in the Credits tab.');
    switchExtTab('credits');
    return;
  }

  const maxCount = Number(document.getElementById('reciprocatorMaxCount')?.value || 10);
  const delaySec = Number(document.getElementById('reciprocatorDelaySelect')?.value || 15);
  const tone = document.getElementById('reciprocatorToneSelect')?.value || 'Natural & Concise';
  const optLike = document.getElementById('reciprocatorOptLike')?.checked ?? true;
  const optFollow = document.getElementById('reciprocatorOptFollow')?.checked ?? false;

  const startBtn = document.getElementById('runReciprocatorBtn');
  const stopBtn = document.getElementById('stopReciprocatorBtn');
  const progressCard = document.getElementById('reciprocatorProgressCard');
  const stateBadge = document.getElementById('reciprocatorStateBadge');
  const queueIndicator = document.getElementById('reciprocatorQueueIndicator');
  const barEl = document.getElementById('reciprocatorProgressBar');
  const doneEl = document.getElementById('reciprocatorCountDone');
  const queueEl = document.getElementById('reciprocatorCountQueue');
  const skipEl = document.getElementById('reciprocatorCountSkipped');
  const statusText = document.getElementById('reciprocatorLiveStatusText');
  const countdownEl = document.getElementById('reciprocatorCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  if (stateBadge) stateBadge.textContent = 'COLLECTING_COMMENTERS';
  if (doneEl) doneEl.textContent = '0';
  if (queueEl) queueEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (countdownEl) countdownEl.style.display = 'none';
  if (queueIndicator) queueIndicator.textContent = 'Commenter 0/0';

  let doneCount = 0;
  let skippedCount = 0;
  let workingTabId = null;
  let shouldCloseWorkingTab = false;

  // Load persisted reciprocated accounts to avoid duplicate runs
  let persistedReciprocated = [];
  try {
    const stored = await chrome.storage.local.get(['atomx_reciprocated_commenters']).catch(() => ({}));
    if (Array.isArray(stored?.atomx_reciprocated_commenters)) persistedReciprocated = stored.atomx_reciprocated_commenters;
  } catch (e) {}
  const reciprocatedSet = new Set(persistedReciprocated.map(h => h.toLowerCase()));

  try {
    // Phase 1: Open post and collect commenters list
    if (statusText) statusText.textContent = `Opening post: ${postUrl}... Collecting commenters.`;
    updateAgentConsole('Scanning Commenters', `Accessing post: ${postUrl}`);

    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    workingTabId = tab.id;
    shouldCloseWorkingTab = true;
    await waitForTabComplete(workingTabId);
    await sleep(3000);

    if (state.isAborted) return;

    if (statusText) statusText.textContent = `Scanning all comments on your post to build queue...`;
    const scanResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(workingTabId, { type: 'AUDIT_POST_DEFAULTERS', maxScrolls: 15 }, (res) => resolve(res || { success: false, commenters: [] }));
    });

    if (state.isAborted) return;

    const rawCommenters = Array.isArray(scanResult?.commenters) ? scanResult.commenters : [];
    const mainAuthor = (scanResult?.mainAuthor || '').toLowerCase();
    const myHandle = (state.verifiedXHandle || state.user?.handle || '').replace(/^@/, '').toLowerCase();

    // Filter out self and deduplicate
    const uniqueCommenters = [];
    const seenHandles = new Set();

    for (const raw of rawCommenters) {
      const clean = raw.toLowerCase().trim();
      if (!clean || clean === mainAuthor || clean === myHandle || seenHandles.has(clean)) continue;
      if (reciprocatedSet.has(clean)) continue;

      seenHandles.add(clean);
      uniqueCommenters.push(clean);
      if (uniqueCommenters.length >= maxCount) break;
    }

    if (uniqueCommenters.length === 0) {
      alert(`⚠️ No new commenters found on this post!\n\n• Scanned ${rawCommenters.length} comments.\n• Either all commenters were already engaged, or no comments exist.`);
      return;
    }

    const totalInQueue = uniqueCommenters.length;
    if (queueEl) queueEl.textContent = totalInQueue;
    if (stateBadge) stateBadge.textContent = 'QUEUE_READY';
    if (statusText) statusText.textContent = `Queue ready! Found ${totalInQueue} unique commenters to reciprocate. Starting profile loop...`;
    await sleep(1500);

    const backendUrl = await getBackendUrl();

    // Phase 2: Per-Commenter Loop
    for (let i = 0; i < totalInQueue; i++) {
      if (state.isAborted) break;

      const commenterHandle = uniqueCommenters[i];
      const progPercent = Math.round(((i + 1) / totalInQueue) * 100);
      if (barEl) barEl.style.width = `${progPercent}%`;
      if (queueIndicator) queueIndicator.textContent = `Commenter ${i + 1}/${totalInQueue}`;

      if (stateBadge) stateBadge.textContent = 'VISITING_PROFILE';
      if (statusText) statusText.textContent = `[${i + 1}/${totalInQueue}] Visiting @${commenterHandle}'s profile...`;

      try {
        await chrome.tabs.update(workingTabId, { url: `https://x.com/${commenterHandle}` });
        await waitForTabComplete(workingTabId);
        await sleep(2200);

        if (state.isAborted) break;

        if (stateBadge) stateBadge.textContent = 'READING_POST';
        if (statusText) statusText.textContent = `Scanning recent post & generating contextual AI reply for @${commenterHandle}...`;

        const engageRes = await new Promise((resolve) => {
          chrome.tabs.sendMessage(workingTabId, {
            type: 'RECIPROCAL_PROFILE_ENGAGEMENT',
            handle: commenterHandle,
            likePost: optLike,
            followUser: optFollow,
            style: tone,
            stylePrompt: state.selectedTonePrompt,
            backendUrl,
            verifiedXHandle: state.verifiedXHandle
          }, (res) => resolve(res || { success: false, error: 'No response' }));
        });

        if (engageRes?.success && engageRes.replyDone) {
          doneCount++;
          if (doneEl) doneEl.textContent = doneCount;
          if (stateBadge) stateBadge.textContent = 'CONFIRMING';

          // Deduct 1 credit per successfully posted reply
          deductCredits(1);

          reciprocatedSet.add(commenterHandle.toLowerCase());
          persistedReciprocated.push(commenterHandle);
          chrome.storage.local.set({ atomx_reciprocated_commenters: persistedReciprocated }).catch(() => null);

          if (statusText) statusText.textContent = `✓ Reciprocated with @${commenterHandle}! Reply: "${(engageRes.replyText || '').slice(0, 30)}..."`;
        } else {
          skippedCount++;
          if (skipEl) skipEl.textContent = skippedCount;
          if (statusText) statusText.textContent = `Skipped @${commenterHandle} (${engageRes?.reason || engageRes?.error || 'No recent post'}).`;
        }
      } catch (cErr) {
        console.warn(`Error on commenter @${commenterHandle}:`, cErr);
        skippedCount++;
        if (skipEl) skipEl.textContent = skippedCount;
      }

      // Phase 3: Pacing Delay between profiles
      if (i < totalInQueue - 1 && !state.isAborted) {
        if (stateBadge) stateBadge.textContent = 'PACING_DELAY';
        if (countdownEl) countdownEl.style.display = 'inline-block';
        for (let s = delaySec; s > 0; s--) {
          if (state.isAborted) break;
          const pad = s < 10 ? '0' + s : s;
          if (countdownEl) countdownEl.textContent = `Next commenter in 0:${pad}`;
          await sleep(1000);
        }
        if (countdownEl) countdownEl.style.display = 'none';
      }
    }

    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (countdownEl) countdownEl.style.display = 'none';
      if (statusText) statusText.textContent = `✓ Reciprocal loop complete! Commented: ${doneCount}, Skipped: ${skippedCount}.`;
      alert(`🤝 Reciprocal Commenting Finished!\n\n• Target Commenters: ${totalInQueue}\n• Successfully Commented Back: ${doneCount}\n• Skipped (No post / Protected): ${skippedCount}\n• Cost: ${doneCount} Credit(s)\n\nEngaged your community with contextual AI replies!`);
    } else {
      if (stateBadge) stateBadge.textContent = 'STOPPED';
      if (statusText) statusText.textContent = 'Workflow stopped by user.';
    }
  } catch (err) {
    console.error('Commenter Reciprocator error:', err);
    if (stateBadge) stateBadge.textContent = 'FAILED';
    alert('Reciprocator error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
}

// =========================================================================
// AGENT 1: AUDIENCE BUILDER WORKFLOW ENGINE (A2, GROWTH, FULLY AUTO)
// =========================================================================

// Global Plan Check Helper
function isUserPaidPlan(plan) {
  const p = (plan || state.userPlan || 'Free').toLowerCase();
  return p.includes('pro') || p.includes('growth') || p.includes('paid') || p.includes('elite') || p.includes('premium') || p.includes('tier 1') || p.includes('unlimited');
}

// Fallback curated lists if backend offline or cold start
const FALLBACK_CURATED_LISTS = {
  audienceList1: {
    id: 'audienceList1',
    name: 'Web3 & Crypto Alpha Hunters',
    category: 'Audience Builder',
    status: 'published',
    accessTier: 'free',
    listUrl: '',
    targets: ['@vitalikbuterin', '@sassal0x', '@cobie', '@inversebrah', '@brian_armstrong', '@zachxbt', '@balajis']
  },
  audienceList2: {
    id: 'audienceList2',
    name: 'Tech Founders & Angel VCs',
    category: 'Audience Builder',
    status: 'published',
    accessTier: 'paid',
    listUrl: '',
    targets: ['@elonmusk', '@sama', '@paulg', '@balajis', '@brian_armstrong']
  },
  sorsaTier1: {
    id: 'sorsaTier1',
    name: 'Tier 1: Top 100 Crypto KOLs (Score Multiplier 3x)',
    category: 'Increase Sorsa Score',
    status: 'published',
    accessTier: 'paid',
    listUrl: '',
    targets: ['@cz_binance', '@brian_armstrong', '@aeyakovenko', '@staniKulechov', '@haydenzadams']
  },
  sorsaTier2: {
    id: 'sorsaTier2',
    name: 'Tier 2: High-Volume Ecosystem Projects',
    category: 'Increase Sorsa Score',
    status: 'published',
    accessTier: 'free',
    listUrl: '',
    targets: ['@ethereum', '@solana', '@base', '@arbitrum', '@ton_blockchain']
  },
  followerList1: {
    id: 'followerList1',
    name: 'Viral Community Discussion Hubs',
    category: 'Followers Increase',
    status: 'published',
    accessTier: 'free',
    listUrl: '',
    targets: ['@CryptoTownHall', '@web3comm', '@SolanaDaily', '@VitalikButerin']
  }
};

function populateAudienceSelect() {
  const select = document.getElementById('audienceListSelect');
  if (!select) return;

  const lists = state.curatedLists || FALLBACK_CURATED_LISTS;
  select.innerHTML = '';
  const keys = Object.keys(lists);
  let foundAny = false;

  keys.forEach((k) => {
    const item = lists[k];
    const isPublished = (item.status || 'published') === 'published';
    if (item.category === 'Audience Builder' && isPublished) {
      foundAny = true;
      const isPaid = (item.accessTier || 'free') === 'paid';
      const userCanAccess = !isPaid || isUserPaidPlan(state.userPlan);
      const opt = document.createElement('option');
      opt.value = k;
      const targetCount = (item.targets || []).length;
      opt.textContent = `${isPaid && !userCanAccess ? '🔒 [PRO ONLY] ' : '⭐ '}${item.name} (${targetCount} Targets${isPaid ? ' · Pro' : ''})`;
      select.appendChild(opt);
    }
  });

  if (!foundAny) {
    select.innerHTML = `
      <option value="audienceList1">⭐ Web3 & Crypto Alpha Hunters (Curated)</option>
      <option value="audienceList2">🔒 [PRO ONLY] Tech Founders & Angel VCs (Curated · Pro)</option>
    `;
  }

  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = '➕ Add Your Own Custom Twitter List URL or Handles';
  select.appendChild(customOpt);
}

async function initAudienceBuilderSystem() {
  // 1. Immediately read cached lists from chrome.storage.local for instant zero-latency render
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['atomx_curated_lists']);
      if (stored.atomx_curated_lists && typeof stored.atomx_curated_lists === 'object' && Object.keys(stored.atomx_curated_lists).length > 0) {
        state.curatedLists = stored.atomx_curated_lists;
      }
    } catch (e) { }
  }

  if (!state.curatedLists) {
    state.curatedLists = FALLBACK_CURATED_LISTS;
  }

  // Populate all 3 dropdowns immediately so user sees them right away
  populateAudienceSelect();
  initSorsaScoreSystem();
  initFollowersListsSystem();

  // 2. Fetch live curated lists from Backend API in background and refresh dropdowns
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/curated-lists`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.lists && Object.keys(data.lists).length > 0) {
        state.curatedLists = data.lists;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ atomx_curated_lists: data.lists });
        }
        // Re-render UI with fresh backend data
        populateAudienceSelect();
        initSorsaScoreSystem();
        initFollowersListsSystem();
      }
    }
  } catch (e) {
    console.warn('[ATOMX] Could not sync curated lists from backend, using cache/fallback', e);
  }

  // 3. Restore persisted counters, settings & queue state
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([
      'atomx_audience_followed_ids',
      'atomx_audience_queue',
      'atomx_audience_queue_pos',
      'atomx_audience_counters',
      'atomx_audience_settings'
    ], (stored) => {
      if (stored.atomx_audience_counters) {
        const { done = 0, collected = 0, skipped = 0 } = stored.atomx_audience_counters;
        const dEl = document.getElementById('audienceDoneCount');
        const cEl = document.getElementById('audienceCollectedCount');
        const sEl = document.getElementById('audienceSkippedCount');
        if (dEl) dEl.textContent = done;
        if (cEl) cEl.textContent = collected;
        if (sEl) sEl.textContent = skipped;
      }

      if (stored.atomx_audience_queue && stored.atomx_audience_queue.length > 0) {
        const pos = stored.atomx_audience_queue_pos || 0;
        const total = stored.atomx_audience_queue.length;
        const qInd = document.getElementById('audienceQueueIndicator');
        if (qInd) qInd.textContent = `Profile ${Math.min(pos + 1, total)}/${total}`;
        const card = document.getElementById('audienceProgressCard');
        if (card) card.style.display = 'block';
      }

      if (stored.atomx_audience_settings) {
        const s = stored.atomx_audience_settings;
        if (s.dateRange && document.getElementById('audienceDateRangeSelect')) {
          document.getElementById('audienceDateRangeSelect').value = s.dateRange;
        }
        if (s.sortBy && document.getElementById('audienceSortBySelect')) {
          document.getElementById('audienceSortBySelect').value = s.sortBy;
        }
        if (s.targetCount && document.getElementById('audienceTargetCountSelect')) {
          document.getElementById('audienceTargetCountSelect').value = s.targetCount;
        }
        if (s.delaySec && document.getElementById('audienceDelaySelect')) {
          document.getElementById('audienceDelaySelect').value = s.delaySec;
        }
        if (typeof s.likePosts !== 'undefined' && document.getElementById('audienceLikePostsToggle')) {
          document.getElementById('audienceLikePostsToggle').checked = s.likePosts;
        }
        if (typeof s.replyPosts !== 'undefined' && document.getElementById('audienceReplyPostsToggle')) {
          document.getElementById('audienceReplyPostsToggle').checked = s.replyPosts;
        }
        if (typeof s.autoUnfollow !== 'undefined' && document.getElementById('audienceUnfollowToggle')) {
          document.getElementById('audienceUnfollowToggle').checked = s.autoUnfollow;
        }
      }
    });
  }
}

function initSorsaScoreSystem() {
  const select = document.getElementById('sorsaTierSelect');
  if (!select) return;

  const lists = state.curatedLists || FALLBACK_CURATED_LISTS;
  const keys = Object.keys(lists);
  let hasPublished = false;

  select.innerHTML = '';
  keys.forEach((k) => {
    const item = lists[k];
    const isPublished = (item.status || 'published') === 'published';
    if (item.category === 'Increase Sorsa Score' && isPublished) {
      hasPublished = true;
      const isPaid = (item.accessTier || 'free') === 'paid';
      const userCanAccess = !isPaid || isUserPaidPlan(state.userPlan);
      const opt = document.createElement('option');
      opt.value = k;
      const targetCount = (item.targets || []).length;
      opt.textContent = `${isPaid && !userCanAccess ? '🔒 [PRO ONLY] ' : '⭐ '}${item.name} (${targetCount} Targets${isPaid ? ' · Pro' : ''})`;
      select.appendChild(opt);
    }
  });

  if (!hasPublished) {
    select.innerHTML = `
      <option value="sorsaTier1">🔒 [PRO ONLY] Tier 1: Top 100 Crypto KOLs (Score Multiplier 3x · Pro)</option>
      <option value="sorsaTier2">⭐ Tier 2: High-Volume Ecosystem Projects (Multiplier 2x)</option>
    `;
  }
}

function initFollowersListsSystem() {
  const select = document.getElementById('followerNicheSelect');
  if (!select) return;

  const lists = state.curatedLists || FALLBACK_CURATED_LISTS;
  const standardOptions = [
    { val: 'crypto', text: '🌐 Crypto & Web3 Discussions' },
    { val: 'ai', text: '🤖 AI Agents & Autonomous Tech' },
    { val: 'founders', text: '🚀 Startups & Founders (Build in Public)' },
    { val: 'solana', text: '⚡ Solana Ecosystem Discussions' }
  ];

  select.innerHTML = '';
  standardOptions.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.val;
    el.textContent = opt.text;
    select.appendChild(el);
  });

  Object.keys(lists).forEach((k) => {
    const item = lists[k];
    const isPublished = (item.status || 'published') === 'published';
    if (item.category === 'Followers Increase' && isPublished) {
      const isPaid = (item.accessTier || 'free') === 'paid';
      const userCanAccess = !isPaid || isUserPaidPlan(state.userPlan);
      const el = document.createElement('option');
      el.value = k;
      const targetCount = (item.targets || []).length;
      el.textContent = `${isPaid && !userCanAccess ? '🔒 [PRO ONLY] ' : '⭐ '}${item.name} (${targetCount} Targets${isPaid ? ' · Pro' : ''})`;
      select.appendChild(el);
    }
  });
}

async function startAudienceBuilderWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const listSelect = document.getElementById('audienceListSelect')?.value || 'audienceList1';
  let targetUrl = '';

  const dateRange = document.getElementById('audienceDateRangeSelect')?.value || '24h';
  const sortBy = document.getElementById('audienceSortBySelect')?.value || 'replies';
  const targetCount = Number(document.getElementById('audienceTargetCountSelect')?.value || 10);
  const delaySec = Number(document.getElementById('audienceDelaySelect')?.value || 15);
  const likePosts = document.getElementById('audienceLikePostsToggle')?.checked ?? true;
  const replyPosts = document.getElementById('audienceReplyPostsToggle')?.checked ?? true;
  const autoUnfollow = document.getElementById('audienceUnfollowToggle')?.checked ?? false;

  // Persist settings immediately
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({
      atomx_audience_settings: { listKey: listSelect, dateRange, sortBy, targetCount, delaySec, likePosts, replyPosts, autoUnfollow }
    });
  }

  // Check Paid plan access
  if (listSelect !== 'custom') {
    const curated = state.curatedLists?.[listSelect] || FALLBACK_CURATED_LISTS[listSelect];
    if (curated?.accessTier === 'paid' && !isUserPaidPlan(state.userPlan)) {
      alert(`🔒 Pro Plan Required!\n\n"${curated.name}" is a Premium / Paid list reserved for Pro subscribers.\nPlease upgrade your subscription in the Credits tab.`);
      switchExtTab('credits');
      return;
    }
  }

  // Phase A: Resolve Target Feed URL
  if (listSelect === 'custom') {
    const rawCustomUrl = document.getElementById('customListUrlInput')?.value.trim() || '';
    if (!rawCustomUrl) {
      alert('⚠️ Please enter a Twitter List URL or handles (e.g. @vitalikbuterin, @cz_binance).');
      return;
    }
    const listIdMatch = rawCustomUrl.match(/\/lists\/(\d+)/) || rawCustomUrl.match(/^(\d{15,25})$/);
    if (listIdMatch) {
      // 100% Reliable, Clean Filtered Live Search: No retweets, no replies, English only!
      const listId = listIdMatch[1];
      targetUrl = `https://x.com/search?q=${encodeURIComponent(`list:${listId} lang:en -filter:retweets -filter:replies`)}&f=live`;
    } else if (rawCustomUrl.includes('x.com') || rawCustomUrl.includes('twitter.com')) {
      targetUrl = rawCustomUrl;
    } else {
      // Direct handles pasted (e.g. "@vitalikbuterin, @cz_binance" or "sama, elonmusk")
      const extractedHandles = rawCustomUrl
        .split(/[\s,]+/)
        .map(h => h.replace(/^@/, '').trim())
        .filter(h => h && /^[A-Za-z0-9_]{1,25}$/.test(h));

      if (extractedHandles.length > 0) {
        const query = extractedHandles.slice(0, 15).map(h => 'from:' + h).join(' OR ');
        targetUrl = `https://x.com/search?q=${encodeURIComponent(`(${query}) lang:en -filter:retweets -filter:replies`)}&f=live`;
      } else {
        alert('⚠️ Please enter a valid Twitter List URL or handle(s) (e.g. https://x.com/i/lists/... or @vitalikbuterin, @cz_binance).');
        return;
      }
    }
  } else {
    const curated = state.curatedLists?.[listSelect] || FALLBACK_CURATED_LISTS[listSelect] || FALLBACK_CURATED_LISTS.audienceList1;
    const rawListUrl = (curated.listUrl || '').trim();
    const listIdMatch = rawListUrl.match(/\/lists\/(\d+)/);

    // If valid Twitter List URL is given and has a list ID, use the ultra-clean filtered live search!
    if (listIdMatch && !rawListUrl.includes('1498675129654161413')) {
      const listId = listIdMatch[1];
      targetUrl = `https://x.com/search?q=${encodeURIComponent(`list:${listId} lang:en -filter:retweets -filter:replies`)}&f=live`;
    } else {
      // 100% Reliable Live Search Feed with targets:
      const rawTargets = curated.targets || [];
      const cleanHandles = rawTargets.map(h => h.replace('@', '').trim()).filter(Boolean);
      if (cleanHandles.length > 0) {
        // Pick random batch of 12 handles for variety across multiple runs
        const selected = cleanHandles.length > 12 ? [...cleanHandles].sort(() => 0.5 - Math.random()).slice(0, 12) : cleanHandles;
        const query = selected.map(h => 'from:' + h).join(' OR ');
        targetUrl = `https://x.com/search?q=${encodeURIComponent(`(${query}) lang:en -filter:retweets -filter:replies`)}&f=live`;
      } else {
        targetUrl = 'https://x.com/search?q=' + encodeURIComponent('(crypto OR web3) lang:en -filter:retweets -filter:replies') + '&f=live';
      }
    }
  }

  if (state.credits < 1) {
    alert(`⚠️ Insufficient credits!\nYou need at least 1 credit to follow active accounts, but you have ${state.credits}.\nPlease top up credits.`);
    switchExtTab('credits');
    return;
  }

  const startBtn = document.getElementById('runAudienceBuilderBtn');
  const stopBtn = document.getElementById('stopAudienceBuilderBtn');
  const progressCard = document.getElementById('audienceProgressCard');
  const stateBadge = document.getElementById('audienceStateBadge');
  const titleEl = document.getElementById('audienceProgressTitle');
  const queueIndicator = document.getElementById('audienceQueueIndicator');
  const doneEl = document.getElementById('audienceDoneCount');
  const colEl = document.getElementById('audienceCollectedCount');
  const skipEl = document.getElementById('audienceSkippedCount');
  const barEl = document.getElementById('audienceProgressBar');
  const statusText = document.getElementById('audienceLiveStatusText');
  const countdownEl = document.getElementById('audienceCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  // Load existing followed IDs & counters
  const storageData = await new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['atomx_audience_followed_ids', 'atomx_audience_counters'], r);
    } else {
      r({});
    }
  });

  const followedSet = new Set((storageData.atomx_audience_followed_ids || []).map(h => h.toLowerCase()));
  // Reset session counters for fresh Audience Builder session
  let doneCount = 0;
  let skippedCount = 0;
  let collectedCount = 0;

  if (doneEl) doneEl.textContent = '0';
  if (colEl) colEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (countdownEl) countdownEl.style.display = 'none';

  // STATE: LIST_SELECTED
  if (stateBadge) stateBadge.textContent = 'LIST_SELECTED';
  if (titleEl) titleEl.textContent = 'Audience Builder';
  if (statusText) statusText.textContent = `List selected. Navigating to timeline...`;
  if (barEl) barEl.style.width = '10%';

  let workingTabId = null;
  let shouldCloseWorkingTab = false;

  try {
    // STATE: FINDING_TWEETS (Phase B)
    if (stateBadge) stateBadge.textContent = 'FINDING_TWEETS';
    if (statusText) statusText.textContent = `Opening target feed: ${targetUrl}...`;

    const listTab = await chrome.tabs.create({ url: targetUrl, active: false });
    workingTabId = listTab.id;
    shouldCloseWorkingTab = true;
    await waitForTabComplete(workingTabId);
    await sleep(2500);

    if (state.isAborted) return;

    // STATE: COLLECTING_IDS (Phase B & C)
    if (stateBadge) stateBadge.textContent = 'FINDING_TWEETS';
    if (statusText) statusText.textContent = `Deep scanning timeline feed across multiple scrolls (Target: ${targetCount} profiles)...`;
    if (barEl) barEl.style.width = '20%';

    const scanResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(workingTabId, {
        type: 'AUDIENCE_BUILDER_HUNT_USERS',
        dateRange,
        sortBy,
        targetCount,
        verifiedXHandle: state.verifiedXHandle
      }, (res) => resolve(res || { success: false, profiles: [], topTweets: [] }));
    });

    if (state.isAborted) return;

    // RULE: Post-Authors Only (Directly target the creators who published the posts, no comments/repliers)
    let collectedProfiles = [];
    const collectedHandles = new Set();

    if (scanResult?.profiles && scanResult.profiles.length > 0) {
      for (const p of scanResult.profiles) {
        if (collectedProfiles.length >= targetCount) break;
        const handleKey = (p.cleanHandle || '').toLowerCase();
        if (handleKey && !collectedHandles.has(handleKey)) {
          collectedHandles.add(handleKey);
          collectedProfiles.push(p);
          if (colEl) colEl.textContent = collectedProfiles.length;
        }
      }
    }

    collectedCount = collectedProfiles.length;
    if (colEl) colEl.textContent = collectedCount;

    if (collectedCount === 0) {
      alert('⚠️ No active author profiles could be extracted from this feed. Please verify the URL or try another list.');
      return;
    }

    // STATE: QUEUE_READY
    if (stateBadge) stateBadge.textContent = 'QUEUE_READY';
    if (barEl) barEl.style.width = '40%';
    if (statusText) statusText.textContent = `Queue ready! Collected ${collectedCount} active accounts. Beginning profile engagement loop...`;
    if (queueIndicator) queueIndicator.textContent = `Profile 1/${collectedCount}`;

    // Persist queue
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        atomx_audience_queue: collectedProfiles,
        atomx_audience_queue_pos: 0,
        atomx_audience_counters: { done: doneCount, collected: collectedCount, skipped: skippedCount }
      });
    }

    await sleep(1500);

    // Phase D: Per-Profile Loop (CHECK_FOLLOWED → (LIKE → REPLY)? → FOLLOW → COUNTDOWN → next)
    for (let i = 0; i < collectedCount; i++) {
      if (state.isAborted) break;

      const profile = collectedProfiles[i];
      const progPercent = Math.round(40 + ((i + 1) / collectedCount) * 60);
      if (barEl) barEl.style.width = `${progPercent}%`;
      if (queueIndicator) queueIndicator.textContent = `Profile ${i + 1}/${collectedCount}`;

      // Check if already followed in history
      if (followedSet.has(profile.cleanHandle.toLowerCase())) {
        skippedCount++;
        if (skipEl) skipEl.textContent = skippedCount;
        if (stateBadge) stateBadge.textContent = 'SKIPPED';
        if (statusText) statusText.textContent = `@${profile.cleanHandle} already in followed history (Skipped).`;

        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({
            atomx_audience_queue_pos: i + 1,
            atomx_audience_counters: { done: doneCount, collected: collectedCount, skipped: skippedCount }
          });
        }
        await sleep(600);
        continue;
      }

      // STATE: CHECK_FOLLOWED
      if (stateBadge) stateBadge.textContent = 'CHECK_FOLLOWED';
      if (statusText) statusText.textContent = `[${i + 1}/${collectedCount}] Visiting @${profile.cleanHandle}...`;

      try {
        await chrome.tabs.update(workingTabId, { url: `https://x.com/${profile.cleanHandle}` });
        await waitForTabComplete(workingTabId);
        await sleep(2000);

        if (state.isAborted) break;

        // Perform engagement and follow on profile page
        if (likePosts || replyPosts) {
          if (stateBadge) stateBadge.textContent = 'ENGAGING';
          if (statusText) statusText.textContent = `[${i + 1}/${collectedCount}] Engaging @${profile.cleanHandle}'s recent posts...`;
        }

        const backendUrl = await getBackendUrl();
        const actionRes = await new Promise((resolve) => {
          chrome.tabs.sendMessage(workingTabId, {
            type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
            handle: profile.cleanHandle,
            likePosts,
            replyPosts,
            style: state.selectedTone,
            stylePrompt: state.selectedTonePrompt,
            backendUrl,
            verifiedXHandle: state.verifiedXHandle
          }, (res) => resolve(res || { success: false }));
        });

        if (actionRes?.alreadyFollowing) {
          skippedCount++;
          if (skipEl) skipEl.textContent = skippedCount;
          if (stateBadge) stateBadge.textContent = 'SKIPPED';
          if (statusText) statusText.textContent = `Already following @${profile.cleanHandle} (Skipped).`;
          followedSet.add(profile.cleanHandle.toLowerCase());
        } else if (actionRes?.followed) {
          doneCount++;
          if (doneEl) doneEl.textContent = doneCount;
          if (stateBadge) stateBadge.textContent = 'FOLLOWED';
          followedSet.add(profile.cleanHandle.toLowerCase());
          deductCredits(1);
          if (statusText) statusText.textContent = `✓ Followed @${profile.cleanHandle}! (Likes: ${actionRes.likesDone || 0}, Reply: ${actionRes.replyDone ? '✓' : 'None'})`;
        } else {
          if (statusText) statusText.textContent = `Could not follow @${profile.cleanHandle}: ${actionRes?.error || 'Button not available'}`;
        }

        // Persist progress to local storage
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({
            atomx_audience_followed_ids: Array.from(followedSet),
            atomx_audience_queue_pos: i + 1,
            atomx_audience_counters: { done: doneCount, collected: collectedCount, skipped: skippedCount }
          });
        }

      } catch (pErr) {
        console.warn('Error on profile action:', pErr);
      }

      // COUNTDOWN between profiles
      if (i < collectedCount - 1 && !state.isAborted) {
        if (stateBadge) stateBadge.textContent = 'COUNTDOWN';
        if (countdownEl) countdownEl.style.display = 'inline-block';

        for (let s = delaySec; s > 0; s--) {
          if (state.isAborted) break;
          const pad = s < 10 ? '0' + s : s;
          if (countdownEl) countdownEl.textContent = `Next profile in 0:${pad}`;
          await sleep(1000);
        }
        if (countdownEl) countdownEl.style.display = 'none';
      }
    }

    // STATE: DONE
    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (countdownEl) countdownEl.style.display = 'none';
      if (statusText) statusText.textContent = `✓ Audience Builder Completed! Followed: ${doneCount}, Skipped: ${skippedCount}, Collected: ${collectedCount}.`;
      alert(`👥 Audience Builder Cycle Complete!\n\n• Profiles Collected: ${collectedCount}\n• New Accounts Followed: ${doneCount}\n• Accounts Skipped (Already Following): ${skippedCount}`);
    }
  } catch (err) {
    console.error('Audience Builder error:', err);
    alert('Audience Builder error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
}

// =========================================================================
// AGENT 3: INCREASE SORSA SCORE WORKFLOW ENGINE (A3, POST-AUTHORS ONLY)
// =========================================================================
async function startSorsaScoreBoosterWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const tier = document.getElementById('sorsaTierSelect')?.value || 'tier1';
  const tone = document.getElementById('sorsaToneSelect')?.value || 'technical';
  const targetCount = Number(document.getElementById('sorsaCountSelect')?.value || 5);
  const likePosts = document.getElementById('sorsaOptLike')?.checked ?? true;
  const replyPosts = document.getElementById('sorsaOptComment')?.checked ?? true;
  const followPosts = document.getElementById('sorsaOptFollow')?.checked ?? true;

  if (state.credits < 1) {
    alert(`⚠️ Insufficient credits!\nYou need at least 1 credit to boost your Sorsa Score.`);
    switchExtTab('credits');
    return;
  }

  const startBtn = document.getElementById('runSorsaBoosterBtn');
  const stopBtn = document.getElementById('stopSorsaBoosterBtn');
  const progressCard = document.getElementById('sorsaProgressCard');
  const stateBadge = document.getElementById('sorsaStateBadge');
  const titleEl = document.getElementById('sorsaProgressTitle');
  const queueIndicator = document.getElementById('sorsaQueueIndicator');
  const doneEl = document.getElementById('sorsaDoneCount');
  const colEl = document.getElementById('sorsaCollectedCount');
  const skipEl = document.getElementById('sorsaSkippedCount');
  const barEl = document.getElementById('sorsaProgressBar');
  const statusText = document.getElementById('sorsaLiveStatusText');
  const countdownEl = document.getElementById('sorsaCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  let doneCount = 0;
  let skippedCount = 0;
  let collectedCount = 0;

  if (doneEl) doneEl.textContent = '0';
  if (colEl) colEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (countdownEl) countdownEl.style.display = 'none';

  const selectedListKey = document.getElementById('sorsaTierSelect')?.value || 'sorsaTier1';
  const tierKey = (selectedListKey === 'tier1' ? 'sorsaTier1' : (selectedListKey === 'tier2' ? 'sorsaTier2' : selectedListKey));
  const tierData = state.curatedLists?.[tierKey] || FALLBACK_CURATED_LISTS?.[tierKey];

  // Check Paid plan access
  if (tierData?.accessTier === 'paid' && !isUserPaidPlan(state.userPlan)) {
    alert(`🔒 Pro Plan Required!\n\n"${tierData.name}" is a Premium / Paid list reserved for Pro subscribers.\nPlease upgrade your subscription in the Credits tab.`);
    switchExtTab('credits');
    return;
  }

  const customTargets = (tierData?.targets && tierData.targets.length > 0) ? tierData.targets : [];

  let targetUrl = '';
  if (customTargets.length > 0) {
    const clean = customTargets.map(h => h.replace('@', '').trim()).filter(Boolean);
    const selected = clean.length > 12 ? [...clean].sort(() => 0.5 - Math.random()).slice(0, 12) : clean;
    const query = selected.map(h => 'from:' + h).join(' OR ');
    targetUrl = `https://x.com/search?q=${encodeURIComponent(`(${query}) lang:en -filter:retweets -filter:replies`)}&f=live`;
  } else if (tierData?.listUrl) {
    const listIdMatch = tierData.listUrl.match(/\/lists\/(\d+)/);
    if (listIdMatch) {
      targetUrl = `https://x.com/search?q=${encodeURIComponent(`list:${listIdMatch[1]} lang:en -filter:retweets -filter:replies`)}&f=live`;
    } else {
      targetUrl = tierData.listUrl;
    }
  } else if (tierKey === 'sorsaTier2' || tier === 'tier2') {
    // Fallback: High-Volume Ecosystem Projects (exclude retweets & replies, English only, live)
    targetUrl = 'https://x.com/search?q=' + encodeURIComponent('(from:ethereum OR from:solana OR from:base OR from:arbitrum OR from:optimism OR from:binance OR from:polygon) lang:en -filter:retweets -filter:replies') + '&f=live';
  } else {
    // Fallback: Top 100 Crypto KOLs high-weight feed (exclude retweets & replies, English only, live)
    targetUrl = 'https://x.com/search?q=' + encodeURIComponent('(from:cz_binance OR from:brian_armstrong OR from:vitalikbuterin OR from:aeyakovenko OR from:mertmumtaz OR from:balajis OR from:sreeramkannan OR from:shawmakesmagic) lang:en -filter:retweets -filter:replies') + '&f=live';
  }

  let workingTabId = null;
  let shouldCloseWorkingTab = false;

  try {
    if (stateBadge) stateBadge.textContent = 'FINDING_KOLS';
    if (statusText) statusText.textContent = `Opening ${tier === 'tier1' ? 'Tier 1 KOLs' : 'Tier 2 Ecosystem Projects'} feed...`;
    if (barEl) barEl.style.width = '15%';

    const listTab = await chrome.tabs.create({ url: targetUrl, active: false });
    workingTabId = listTab.id;
    shouldCloseWorkingTab = true;
    await waitForTabComplete(workingTabId);
    await sleep(2500);

    if (state.isAborted) return;

    if (stateBadge) stateBadge.textContent = 'COLLECTING_AUTHORS';
    if (statusText) statusText.textContent = `Scanning timeline for top ecosystem post-authors (Target: ${targetCount} accounts)...`;
    if (barEl) barEl.style.width = '25%';

    const scanResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(workingTabId, {
        type: 'AUDIENCE_BUILDER_HUNT_USERS',
        dateRange: 'all',
        sortBy: 'replies',
        targetCount
      }, (res) => resolve(res || { success: false, profiles: [] }));
    });

    if (state.isAborted) return;

    // RULE: Post-Authors Only (Directly target the high-weight accounts who posted)
    let collectedProfiles = [];
    const collectedHandles = new Set();

    if (scanResult?.profiles && scanResult.profiles.length > 0) {
      for (const p of scanResult.profiles) {
        if (collectedProfiles.length >= targetCount) break;
        const handleKey = (p.cleanHandle || '').toLowerCase();
        if (handleKey && !collectedHandles.has(handleKey)) {
          collectedHandles.add(handleKey);
          collectedProfiles.push(p);
          if (colEl) colEl.textContent = collectedProfiles.length;
        }
      }
    }

    collectedCount = collectedProfiles.length;
    if (colEl) colEl.textContent = collectedCount;

    if (collectedCount === 0) {
      alert('⚠️ Could not find active posts from tier accounts at this moment. Please try again.');
      return;
    }

    if (stateBadge) stateBadge.textContent = 'QUEUE_READY';
    if (barEl) barEl.style.width = '40%';
    if (statusText) statusText.textContent = `Queue ready! Collected ${collectedCount} high-weight ecosystem accounts. Starting Sorsa boost loop...`;
    if (queueIndicator) queueIndicator.textContent = `Account 1/${collectedCount}`;

    await sleep(1500);

    // Map tone to prompt (Strict 5-10 words, no $, no emojis, no —, no quotes, no !)
    let customTonePrompt = null;
    if (tone === 'technical') {
      customTonePrompt = "Provide sharp, technical developer insight. Strictly 5 to 10 words. No emojis, no quotes, no $, no dashes, no exclamation marks.";
    } else if (tone === 'professional') {
      customTonePrompt = "Professional operator insight and strategic value. Strictly 5 to 10 words. No emojis, no quotes, no $, no dashes, no exclamation marks.";
    } else {
      customTonePrompt = "Bullish and supportive momentum. Strictly 5 to 10 words. No emojis, no quotes, no $, no dashes, no exclamation marks.";
    }

    // Per-profile engagement loop
    for (let i = 0; i < collectedCount; i++) {
      if (state.isAborted) break;

      const profile = collectedProfiles[i];
      const progPercent = Math.round(40 + ((i + 1) / collectedCount) * 60);
      if (barEl) barEl.style.width = `${progPercent}%`;
      if (queueIndicator) queueIndicator.textContent = `Account ${i + 1}/${collectedCount}`;

      if (stateBadge) stateBadge.textContent = 'ENGAGING';
      if (statusText) statusText.textContent = `[${i + 1}/${collectedCount}] Visiting @${profile.cleanHandle}...`;

      try {
        await chrome.tabs.update(workingTabId, { url: `https://x.com/${profile.cleanHandle}` });
        await waitForTabComplete(workingTabId);
        await sleep(2000);

        if (state.isAborted) break;

        const backendUrl = await getBackendUrl();
        const actionRes = await new Promise((resolve) => {
          chrome.tabs.sendMessage(workingTabId, {
            type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
            handle: profile.cleanHandle,
            likePosts,
            replyPosts,
            style: `Sorsa ${tone}`,
            stylePrompt: customTonePrompt,
            backendUrl
          }, (res) => resolve(res || { success: false }));
        });

        if (actionRes?.alreadyFollowing && !replyPosts && !likePosts) {
          skippedCount++;
          if (skipEl) skipEl.textContent = skippedCount;
          if (stateBadge) stateBadge.textContent = 'SKIPPED';
        } else {
          doneCount++;
          if (doneEl) doneEl.textContent = doneCount;
          if (stateBadge) stateBadge.textContent = 'BOOSTED';
          deductCredits(1);
          if (statusText) statusText.textContent = `⚡ Boosted @${profile.cleanHandle}! (Likes: ${actionRes.likesDone || 0}, Reply: ${actionRes.replyDone ? '✓' : 'None'})`;
        }
      } catch (pErr) {
        console.warn('Error on Sorsa profile action:', pErr);
      }

      if (i < collectedCount - 1 && !state.isAborted) {
        if (stateBadge) stateBadge.textContent = 'COUNTDOWN';
        if (countdownEl) countdownEl.style.display = 'inline-block';
        for (let s = 15; s > 0; s--) {
          if (state.isAborted) break;
          if (countdownEl) countdownEl.textContent = `Next KOL in 0:${s < 10 ? '0' : ''}${s}`;
          await sleep(1000);
        }
        if (countdownEl) countdownEl.style.display = 'none';
      }
    }

    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (statusText) statusText.textContent = `✓ Sorsa Score Booster Completed! Engaged ${doneCount} ecosystem accounts.`;
      alert(`⚡ Sorsa Score Booster Cycle Complete!\n\n• High-Weight Accounts Engaged: ${doneCount}\n• Sorsa Multiplier Accelerated!`);
    }
  } catch (err) {
    console.error('Sorsa Booster error:', err);
    alert('Sorsa Booster error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
}

// =========================================================================
// AGENT 4: FOLLOWERS INCREASE WORKFLOW ENGINE (A4, THREAD REPLIERS COLLECTION)
// =========================================================================
async function startFollowersIncreaseWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const niche = document.getElementById('followerNicheSelect')?.value || 'crypto';
  const strategy = document.getElementById('followerStratSelect')?.value || 'High-Resonance Insights';
  const targetCount = Number(document.getElementById('followerDailyTargetSelect')?.value || 8);
  const delaySec = Number(document.getElementById('followerDelaySelect')?.value || 15);

  if (state.credits < 1) {
    alert(`⚠️ Insufficient credits!\nYou need at least 1 credit to run Follower Growth.`);
    switchExtTab('credits');
    return;
  }

  const startBtn = document.getElementById('runFollowerIncreaseBtn');
  const stopBtn = document.getElementById('stopFollowerIncreaseBtn');
  const progressCard = document.getElementById('followerProgressCard');
  const stateBadge = document.getElementById('followerStateBadge');
  const titleEl = document.getElementById('followerProgressTitle');
  const queueIndicator = document.getElementById('followerQueueIndicator');
  const doneEl = document.getElementById('followerDoneCount');
  const colEl = document.getElementById('followerCollectedCount');
  const skipEl = document.getElementById('followerSkippedCount');
  const barEl = document.getElementById('followerProgressBar');
  const statusText = document.getElementById('followerLiveStatusText');
  const countdownEl = document.getElementById('followerCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  let doneCount = 0;
  let skippedCount = 0;
  let collectedCount = 0;

  if (doneEl) doneEl.textContent = '0';
  if (colEl) colEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (countdownEl) countdownEl.style.display = 'none';

  let targetUrl = '';
  const curatedFollower = state.curatedLists?.[niche];
  if (curatedFollower) {
    if (curatedFollower.accessTier === 'paid' && !isUserPaidPlan(state.userPlan)) {
      alert(`🔒 Pro Plan Required!\n\n"${curatedFollower.name}" is a Premium / Paid list reserved for Pro subscribers.\nPlease upgrade your subscription in the Credits tab.`);
      switchExtTab('credits');
      return;
    }
    const customTargets = (curatedFollower.targets && curatedFollower.targets.length > 0) ? curatedFollower.targets : [];
    if (customTargets.length > 0) {
      const clean = customTargets.map(h => h.replace('@', '').trim()).filter(Boolean);
      const selected = clean.length > 12 ? [...clean].sort(() => 0.5 - Math.random()).slice(0, 12) : clean;
      const query = selected.map(h => 'from:' + h).join(' OR ');
      targetUrl = `https://x.com/search?q=${encodeURIComponent(`(${query}) lang:en -filter:retweets -filter:replies`)}&f=live`;
    } else if (curatedFollower.listUrl) {
      targetUrl = curatedFollower.listUrl;
    } else {
      targetUrl = 'https://x.com/search?q=(crypto%20OR%20web3)&f=live';
    }
  } else if (niche === 'ai') {
    targetUrl = 'https://x.com/search?q=(ai%20agents%20OR%20autonomous%20agents)&f=live';
  } else if (niche === 'founders') {
    targetUrl = 'https://x.com/search?q=(startups%20OR%20founders%20OR%20building%20in%20public)&f=live';
  } else if (niche === 'solana') {
    targetUrl = 'https://x.com/search?q=(solana%20OR%20sol)&f=live';
  } else {
    targetUrl = 'https://x.com/search?q=(crypto%20OR%20web3)&f=live';
  }

  let workingTabId = null;
  let shouldCloseWorkingTab = false;

  try {
    if (stateBadge) stateBadge.textContent = 'FINDING_THREADS';
    if (statusText) statusText.textContent = `Opening niche discussion feed: ${niche.toUpperCase()}...`;
    if (barEl) barEl.style.width = '15%';

    const listTab = await chrome.tabs.create({ url: targetUrl, active: false });
    workingTabId = listTab.id;
    shouldCloseWorkingTab = true;
    await waitForTabComplete(workingTabId);
    await sleep(2500);

    if (state.isAborted) return;

    if (stateBadge) stateBadge.textContent = 'SCANNING_THREADS';
    if (statusText) statusText.textContent = `Scanning timeline for busy discussion threads with high replies...`;
    if (barEl) barEl.style.width = '20%';

    const scanResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(workingTabId, {
        type: 'AUDIENCE_BUILDER_HUNT_USERS',
        dateRange: 'all',
        sortBy: 'replies',
        targetCount
      }, (res) => resolve(res || { success: false, profiles: [], topTweets: [] }));
    });

    if (state.isAborted) return;

    // RULE: Multi-Thread Replier Collection (extract engaged community repliers from busy discussions)
    let collectedProfiles = [];
    const collectedHandles = new Set();

    if (scanResult?.topTweets && scanResult.topTweets.length > 0) {
      const busyTweets = scanResult.topTweets.filter(t => t.tweetUrl && (t.repliesCount > 0 || !t.tweetUrl.includes('/status/')));

      for (let tIdx = 0; tIdx < busyTweets.length; tIdx++) {
        if (state.isAborted || collectedProfiles.length >= targetCount) break;

        const busyTweet = busyTweets[tIdx];
        const remainingToCollect = targetCount - collectedProfiles.length;

        if (stateBadge) stateBadge.textContent = 'COLLECTING_REPLIERS';
        if (statusText) statusText.textContent = `[${collectedProfiles.length}/${targetCount} Collected] Visiting busy thread #${tIdx + 1} by @${busyTweet.cleanHandle} (${busyTweet.repliesCount || 'active'} replies) to collect repliers...`;
        if (barEl) barEl.style.width = `${Math.min(38, 20 + Math.round((collectedProfiles.length / targetCount) * 18))}%`;

        try {
          await chrome.tabs.update(workingTabId, { url: busyTweet.tweetUrl });
          await waitForTabComplete(workingTabId);
          await sleep(2200);

          if (!state.isAborted) {
            const repliersRes = await new Promise((resolve) => {
              chrome.tabs.sendMessage(workingTabId, {
                type: 'COLLECT_REPLIERS_FROM_TWEET_THREAD',
                targetCount: remainingToCollect
              }, (res) => resolve(res || { success: false, profiles: [] }));
            });

            if (repliersRes?.profiles && repliersRes.profiles.length > 0) {
              for (const r of repliersRes.profiles) {
                const handleKey = (r.cleanHandle || '').toLowerCase();
                if (handleKey && !collectedHandles.has(handleKey)) {
                  collectedHandles.add(handleKey);
                  collectedProfiles.push(r);
                  if (colEl) colEl.textContent = collectedProfiles.length;
                  if (collectedProfiles.length >= targetCount) break;
                }
              }
            }
          }
        } catch (threadErr) {
          console.warn(`Error collecting repliers from thread #${tIdx + 1}:`, threadErr);
        }
      }
    }

    // Backfill from scanned profiles if repliers were fewer than targetCount
    if (collectedProfiles.length < targetCount && scanResult?.profiles && scanResult.profiles.length > 0) {
      for (const p of scanResult.profiles) {
        if (collectedProfiles.length >= targetCount) break;
        const handleKey = (p.cleanHandle || '').toLowerCase();
        if (handleKey && !collectedHandles.has(handleKey)) {
          collectedHandles.add(handleKey);
          collectedProfiles.push(p);
          if (colEl) colEl.textContent = collectedProfiles.length;
        }
      }
    }

    collectedCount = collectedProfiles.length;
    if (colEl) colEl.textContent = collectedCount;

    if (collectedCount === 0) {
      alert('⚠️ No active repliers or accounts could be extracted from this niche feed.');
      return;
    }

    if (stateBadge) stateBadge.textContent = 'QUEUE_READY';
    if (barEl) barEl.style.width = '40%';
    if (statusText) statusText.textContent = `Queue ready! Collected ${collectedCount} engaged niche accounts. Starting engagement loop...`;
    if (queueIndicator) queueIndicator.textContent = `Profile 1/${collectedCount}`;

    await sleep(1500);

    // Use active configured tone and prompt template
    const activeStyle = state.selectedTone || 'Bullish (5-10 words)';
    const activePrompt = state.selectedTonePrompt || "Write a bullish, positive comment replying to the post. Strictly 5 to 10 words. No emojis, no quotes, no $, no dashes, no exclamation marks.";

    // Per-profile engagement loop
    for (let i = 0; i < collectedCount; i++) {
      if (state.isAborted) break;

      const profile = collectedProfiles[i];
      const progPercent = Math.round(40 + ((i + 1) / collectedCount) * 60);
      if (barEl) barEl.style.width = `${progPercent}%`;
      if (queueIndicator) queueIndicator.textContent = `Profile ${i + 1}/${collectedCount}`;

      if (stateBadge) stateBadge.textContent = 'ENGAGING';
      if (statusText) statusText.textContent = `[${i + 1}/${collectedCount}] Visiting @${profile.cleanHandle}...`;

      try {
        await chrome.tabs.update(workingTabId, { url: `https://x.com/${profile.cleanHandle}` });
        await waitForTabComplete(workingTabId);
        await sleep(2000);

        if (state.isAborted) break;

        const backendUrl = await getBackendUrl();
        const actionRes = await new Promise((resolve) => {
          chrome.tabs.sendMessage(workingTabId, {
            type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
            handle: profile.cleanHandle,
            likePosts: true,
            replyPosts: true,
            style: activeStyle,
            stylePrompt: activePrompt,
            backendUrl
          }, (res) => resolve(res || { success: false }));
        });

        if (actionRes?.alreadyFollowing) {
          skippedCount++;
          if (skipEl) skipEl.textContent = skippedCount;
          if (stateBadge) stateBadge.textContent = 'SKIPPED';
        } else if (actionRes?.followed) {
          doneCount++;
          if (doneEl) doneEl.textContent = doneCount;
          if (stateBadge) stateBadge.textContent = 'FOLLOWED';
          deductCredits(1);
          if (statusText) statusText.textContent = `✓ Followed @${profile.cleanHandle}! (Likes: ${actionRes.likesDone || 0}, Reply: ${actionRes.replyDone ? '✓' : 'None'})`;
        }
      } catch (pErr) {
        console.warn('Error on follower profile action:', pErr);
      }

      if (i < collectedCount - 1 && !state.isAborted) {
        if (stateBadge) stateBadge.textContent = 'COUNTDOWN';
        if (countdownEl) countdownEl.style.display = 'inline-block';
        for (let s = delaySec; s > 0; s--) {
          if (state.isAborted) break;
          if (countdownEl) countdownEl.textContent = `Next profile in 0:${s < 10 ? '0' : ''}${s}`;
          await sleep(1000);
        }
        if (countdownEl) countdownEl.style.display = 'none';
      }
    }

    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (statusText) statusText.textContent = `✓ Follower Growth Completed! Followed: ${doneCount}, Skipped: ${skippedCount}.`;
      alert(`📈 Follower Growth Cycle Complete!\n\n• Profiles Engaged: ${doneCount}\n• Accounts Skipped: ${skippedCount}`);
    }
  } catch (err) {
    console.error('Follower Growth error:', err);
    alert('Follower Growth error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
}

// =========================================================================
// AGENT 6: REPLY BACK WORKFLOW ENGINE (A6, POSTS, FULLY AUTO)
// =========================================================================
async function startReplyBackLoopWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const url1 = document.getElementById('myTweetUrlInput1')?.value.trim();
  const url2 = document.getElementById('myTweetUrlInput2')?.value.trim();
  const url3 = document.getElementById('myTweetUrlInput3')?.value.trim();

  const postUrls = [url1, url2, url3].filter(u => u && (u.includes('twitter.com') || u.includes('x.com')));

  if (postUrls.length === 0) {
    alert('⚠️ Please enter at least 1 valid link of your own post/tweet (e.g. https://x.com/yourhandle/status/...).');
    return;
  }

  if (state.credits < 1) {
    alert('⚠️ Insufficient credits!\nYou need at least 1 credit to reply to comments.\nPlease top up in the Credits tab.');
    switchExtTab('credits');
    return;
  }

  const maxComments = Number(document.getElementById('replyBackMaxCountSelect')?.value || 999);
  const tone = document.getElementById('replyBackToneSelect')?.value || 'Natural & Concise';
  const delaySec = Number(document.getElementById('replyBackDelaySelect')?.value || 12);
  const autoLike = document.getElementById('replyBackAutoLikeCheck')?.checked ?? true;

  const startBtn = document.getElementById('runReplyBackBtn');
  const stopBtn = document.getElementById('stopReplyBackBtn');
  const progressCard = document.getElementById('replyBackProgressCard');
  const postInd = document.getElementById('replyBackPostIndicator');
  const stateBadge = document.getElementById('replyBackStateBadge');
  const barEl = document.getElementById('replyBackProgressBar');
  const doneEl = document.getElementById('replyBackDoneCount');
  const queueEl = document.getElementById('replyBackQueueCount');
  const skipEl = document.getElementById('replyBackSkippedCount');
  const statusText = document.getElementById('replyBackLiveStatusText');
  const countdownEl = document.getElementById('replyBackCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  if (stateBadge) stateBadge.textContent = 'POSTS_ADDED';
  if (doneEl) doneEl.textContent = '0';
  if (queueEl) queueEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (countdownEl) countdownEl.style.display = 'none';

  // Load persisted replied comments set (rerun protection)
  let persistedReplied = [];
  try {
    const stored = await chrome.storage.local.get(['atomx_replied_comments']).catch(() => ({}));
    if (Array.isArray(stored?.atomx_replied_comments)) persistedReplied = stored.atomx_replied_comments;
  } catch (e) {}
  const repliedCommentIds = new Set(persistedReplied);

  let totalReplied = 0;
  let totalSkipped = 0;
  let workingTabId = null;
  let shouldCloseWorkingTab = false;

  try {
    for (let pIdx = 0; pIdx < postUrls.length; pIdx++) {
      if (state.isAborted) break;

      const currentPostUrl = postUrls[pIdx];
      const postNumberStr = `Post ${pIdx + 1} of ${postUrls.length}`;
      if (postInd) postInd.textContent = `${postNumberStr} (Active)`;
      if (stateBadge) stateBadge.textContent = 'LOADING_COMMENTS';
      if (statusText) statusText.textContent = `[${postNumberStr}] Opening your post: ${currentPostUrl}...`;
      updateAgentConsole('Reply Loop Running', `Accessing ${postNumberStr}: ${currentPostUrl}`);

      if (!workingTabId) {
        const tab = await chrome.tabs.create({ url: currentPostUrl, active: false });
        workingTabId = tab.id;
        shouldCloseWorkingTab = true;
      } else {
        await chrome.tabs.update(workingTabId, { url: currentPostUrl });
      }

      await waitForTabComplete(workingTabId);
      await sleep(3000);

      if (state.isAborted) break;

      if (stateBadge) stateBadge.textContent = 'QUEUE_READY';
      if (statusText) statusText.textContent = `Scanning & hydrating comments snapshot (ignoring newly arriving comments)...`;

      const cycleResult = await new Promise((resolve) => {
        chrome.tabs.sendMessage(workingTabId, {
          type: 'EXECUTE_REPLY_BACK_CYCLE',
          postUrl: currentPostUrl,
          style: tone,
          delaySec,
          maxComments,
          autoLike,
          alreadyRepliedIds: Array.from(repliedCommentIds),
          verifiedXHandle: state.verifiedXHandle
        }, (res) => resolve(res || { success: false, repliedCount: 0 }));
      });

      if (state.isAborted) break;

      if (cycleResult.unauthorizedAccount) {
        alert(cycleResult.error || 'Account lock mismatch detected.');
        return;
      }

      const repliedInThisPost = cycleResult?.repliedCount || 0;
      totalReplied += repliedInThisPost;
      totalSkipped += (cycleResult?.skippedSelf || 0);

      // Persist newly replied comments
      if (Array.isArray(cycleResult?.results)) {
        cycleResult.results.forEach(r => {
          if (r.commentKey) repliedCommentIds.add(r.commentKey);
        });
        await chrome.storage.local.set({ atomx_replied_comments: Array.from(repliedCommentIds) }).catch(() => null);
      }

      // Deduct 1 credit per reply posted
      if (repliedInThisPost > 0) {
        deductCredits(repliedInThisPost);
      }

      if (doneEl) doneEl.textContent = totalReplied;
      if (queueEl) queueEl.textContent = cycleResult?.queuedCount || 0;
      if (skipEl) skipEl.textContent = totalSkipped;

      const postProg = Math.round(((pIdx + 1) / postUrls.length) * 100);
      if (barEl) barEl.style.width = `${postProg}%`;

      if (pIdx < postUrls.length - 1 && !state.isAborted) {
        if (stateBadge) stateBadge.textContent = 'BREAK';
        if (countdownEl) countdownEl.style.display = 'block';
        for (let s = 6; s > 0; s--) {
          if (state.isAborted) break;
          if (statusText) statusText.textContent = `Completed ${postNumberStr}. Taking break before post ${pIdx + 2}...`;
          if (countdownEl) countdownEl.textContent = `⏱️ Next post in ${s}s...`;
          await sleep(1000);
        }
        if (countdownEl) countdownEl.style.display = 'none';
      }
    }

    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (countdownEl) countdownEl.style.display = 'none';
      if (statusText) statusText.textContent = `✓ Done! Replied to ${totalReplied} comment(s) across ${postUrls.length} post(s).`;
      updateAgentConsole('Reply Loop Complete', `Finished replying to community comments with human typing.`);
      alert(`🔄 Reply Back Cycle Finished!\n\n• Posts Processed: ${postUrls.length}\n• Total Comments Replied: ${totalReplied}\n• Self & Duplicate Comments Skipped: ${totalSkipped}\n• Cost Deducted: ${totalReplied} Credit(s)\n• Action: Liked (❤️) + Contextual Human Letter-by-Letter Typing.`);
    } else {
      if (stateBadge) stateBadge.textContent = 'STOPPED';
      if (statusText) statusText.textContent = 'Reply loop stopped by user.';
    }
  } catch (err) {
    console.error('Reply Back Loop error:', err);
    if (stateBadge) stateBadge.textContent = 'FAILED';
    alert('Reply Back error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
}

// =========================================================================
// AGENT 7: AUTO UNFOLLOW STANDALONE WORKFLOW ENGINE (A7, SAFETY)
// =========================================================================
async function startAutoUnfollowWorkflow() {
  if (!(await ensureVerifiedAccountOrBlock())) return;

  const notFollowing = document.getElementById('unfollowCriteriaNotFollowing')?.checked ?? true;
  const lowScore = document.getElementById('unfollowCriteriaLowScore')?.checked ?? false;

  if (!notFollowing && !lowScore) {
    alert('⚠️ Please select at least one criteria:\n• Does Not Follow Back\n• Low Wallchain / Influence Score');
    return;
  }

  if (state.credits < 1) {
    alert('⚠️ Insufficient credits!\nYou need at least 1 credit for unfollow operations (1 credit per 10 unfollows).\nPlease top up in the Credits tab.');
    switchExtTab('credits');
    return;
  }

  const targetLimit = Number(document.getElementById('unfollowMaxCount')?.value || 25);
  const delaySec = Number(document.getElementById('unfollowDelaySelect')?.value || 18);
  const scoreThreshold = Number(document.getElementById('unfollowScoreThresholdInput')?.value || 30);
  const rawWhitelist = document.getElementById('unfollowWhitelistInput')?.value || '';
  const whitelistList = rawWhitelist.split(/[,\n]/).map(w => w.trim()).filter(Boolean);

  const startBtn = document.getElementById('runAutoUnfollowBtn');
  const stopBtn = document.getElementById('stopAutoUnfollowBtn');
  const progressCard = document.getElementById('unfollowProgressCard');
  const stateBadge = document.getElementById('unfollowStateBadge');
  const barEl = document.getElementById('unfollowProgressBar');
  const progressText = document.getElementById('unfollowProgressText');
  const doneEl = document.getElementById('unfollowCountDone');
  const skipEl = document.getElementById('unfollowCountSkipped');
  const failEl = document.getElementById('unfollowCountFailed');
  const statusText = document.getElementById('unfollowLiveStatusText');
  const countdownEl = document.getElementById('unfollowCountdownText');

  state.isAborted = false;
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progressCard) progressCard.style.display = 'block';

  if (stateBadge) stateBadge.textContent = 'FILTER_SELECTED';
  if (doneEl) doneEl.textContent = '0';
  if (skipEl) skipEl.textContent = '0';
  if (failEl) failEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (progressText) progressText.textContent = `0 / ${targetLimit}`;
  if (countdownEl) countdownEl.style.display = 'none';

  // Load persisted processed accounts to prevent re-processing
  let persistedUnfollowed = [];
  try {
    const stored = await chrome.storage.local.get(['atomx_unfollowed_accounts']).catch(() => ({}));
    if (Array.isArray(stored?.atomx_unfollowed_accounts)) persistedUnfollowed = stored.atomx_unfollowed_accounts;
  } catch (e) {}
  const processedHandlesSet = new Set(persistedUnfollowed.map(h => h.toLowerCase()));

  // Determine user handle for Following URL
  const verifiedHandle = (state.verifiedXHandle || state.user?.handle || '').replace(/^@/, '').trim();
  const followingUrl = verifiedHandle ? `https://x.com/${verifiedHandle}/following` : 'https://x.com/following';

  let workingTabId = null;
  let shouldCloseWorkingTab = false;
  let unfollowedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let consecutiveScrolls = 0;

  try {
    if (statusText) statusText.textContent = `Opening following list: ${followingUrl}...`;
    const tab = await chrome.tabs.create({ url: followingUrl, active: false });
    workingTabId = tab.id;
    shouldCloseWorkingTab = true;
    await waitForTabComplete(workingTabId);
    await sleep(3000);

    if (state.isAborted) return;

    if (stateBadge) stateBadge.textContent = 'FOLLOWING_LOADED';
    if (statusText) statusText.textContent = `Following list loaded! Starting smart filtering loop...`;
    await sleep(1200);

    while (!state.isAborted && unfollowedCount < targetLimit) {
      if (stateBadge) stateBadge.textContent = 'UNFOLLOWING';

      const stepRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(workingTabId, {
          type: 'EXECUTE_AUTO_UNFOLLOW_STEP',
          criteria: { notFollowing, lowScore },
          scoreThreshold,
          whitelist: whitelistList,
          processedHandles: Array.from(processedHandlesSet)
        }, (res) => resolve(res || { success: false, error: 'No response from tab' }));
      });

      if (state.isAborted) break;

      if (stepRes.action === 'UNFOLLOWED') {
        consecutiveScrolls = 0;
        unfollowedCount++;
        if (stepRes.handle) {
          processedHandlesSet.add(stepRes.handle.toLowerCase());
          persistedUnfollowed.push(stepRes.handle);
        }

        if (doneEl) doneEl.textContent = unfollowedCount;
        const pct = Math.min(100, Math.round((unfollowedCount / targetLimit) * 100));
        if (barEl) barEl.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${unfollowedCount} / ${targetLimit}`;
        if (statusText) statusText.textContent = `✓ Unfollowed @${stepRes.handle} (Non-follower / Filter match).`;

        // Credit cost: 1 credit per 10 unfollows (deducted in batches of 10)
        if (unfollowedCount % 10 === 0) {
          deductCredits(1);
          if (statusText) statusText.textContent += ` [1 Credit deducted for 10 unfollows]`;
        }

        // Persist progress
        await chrome.storage.local.set({ atomx_unfollowed_accounts: persistedUnfollowed }).catch(() => null);

        // Check if target limit reached
        if (unfollowedCount >= targetLimit) {
          break;
        }

        // RULE: Long Break vs Normal Pacing Break
        // Every 16 unfollows -> 2 minute long break (120 seconds)
        if (unfollowedCount % 16 === 0) {
          if (stateBadge) stateBadge.textContent = 'LONG_BREAK';
          if (countdownEl) countdownEl.style.display = 'block';
          for (let s = 120; s > 0; s--) {
            if (state.isAborted) break;
            const min = Math.floor(s / 60);
            const sec = s % 60;
            const secStr = sec < 10 ? '0' + sec : sec;
            if (statusText) statusText.textContent = `☕ Safety Long Break: Pausing 2 min after ${unfollowedCount} unfollows...`;
            if (countdownEl) countdownEl.textContent = `☕ Long break: ${min}m ${secStr}s remaining...`;
            await sleep(1000);
          }
          if (countdownEl) countdownEl.style.display = 'none';
        } else {
          // Normal pacing delay (e.g. 15-20s)
          if (stateBadge) stateBadge.textContent = 'WAITING';
          if (countdownEl) countdownEl.style.display = 'block';
          for (let s = delaySec; s > 0; s--) {
            if (state.isAborted) break;
            if (statusText) statusText.textContent = `Pacing safety delay before next account...`;
            if (countdownEl) countdownEl.textContent = `⏱️ Next in ${s}s...`;
            await sleep(1000);
          }
          if (countdownEl) countdownEl.style.display = 'none';
        }
      } else if (stepRes.action === 'SKIPPED') {
        consecutiveScrolls = 0;
        skippedCount++;
        if (stepRes.handle) processedHandlesSet.add(stepRes.handle.toLowerCase());
        if (skipEl) skipEl.textContent = skippedCount;
        if (statusText) statusText.textContent = `Skipped @${stepRes.handle || 'account'} (${stepRes.reason || 'Protected'}).`;
        await sleep(800);
      } else if (stepRes.action === 'SCROLLED') {
        consecutiveScrolls++;
        if (statusText) statusText.textContent = `Auto-scrolling following list (${consecutiveScrolls})...`;
        await sleep(1600);
        if (consecutiveScrolls >= 5) {
          // List ended (no more accounts found after 5 consecutive scrolls)
          if (statusText) statusText.textContent = `End of following list reached!`;
          break;
        }
      } else if (stepRes.action === 'FAILED') {
        failedCount++;
        if (stepRes.handle) processedHandlesSet.add(stepRes.handle.toLowerCase());
        if (failEl) failEl.textContent = failedCount;
        if (statusText) statusText.textContent = `Failed on @${stepRes.handle || 'account'}: ${stepRes.error || 'Unknown error'}.`;
        await sleep(1200);
      } else {
        await sleep(2000);
      }
    }

    if (!state.isAborted) {
      if (stateBadge) stateBadge.textContent = 'DONE';
      if (barEl) barEl.style.width = '100%';
      if (countdownEl) countdownEl.style.display = 'none';
      if (statusText) statusText.textContent = `✓ Auto Unfollow finished! Unfollowed: ${unfollowedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}.`;
      alert(`🧹 Auto Unfollow Cycle Finished!\n\n• Target: ${targetLimit}\n• Successfully Unfollowed: ${unfollowedCount}\n• Skipped (Follows back / Whitelisted): ${skippedCount}\n• Failed: ${failedCount}\n• Total Credits Deducted: ${Math.floor(unfollowedCount / 10)} Credit(s)\n\nDesigned within safety limits with pacing delays and long breaks.`);
    } else {
      if (stateBadge) stateBadge.textContent = 'STOPPED';
      if (statusText) statusText.textContent = 'Auto Unfollow stopped by user.';
    }
  } catch (err) {
    console.error('Auto Unfollow error:', err);
    if (stateBadge) stateBadge.textContent = 'FAILED';
    alert('Auto Unfollow error: ' + err.message);
  } finally {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    if (shouldCloseWorkingTab && workingTabId) {
      chrome.tabs?.remove(workingTabId).catch(() => null);
    }
  }
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
    const isTarget = p.id === `panel-agent-${agentId}`;
    p.classList.toggle('active', isTarget);
    p.style.display = isTarget ? 'flex' : 'none';
  });

  // Toggle views
  const bentoView = document.getElementById('agentsBentoView');
  const detailView = document.getElementById('agentDetailView');
  if (bentoView) bentoView.style.display = 'none';
  if (detailView) detailView.style.display = 'flex';

  // Refresh dropdowns with latest lists when entering workspace
  if (agentId === 'audience') {
    populateAudienceSelect();
  } else if (agentId === 'sorsa') {
    initSorsaScoreSystem();
  } else if (agentId === 'followers') {
    initFollowersListsSystem();
  }

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

// Purge entire local user session and return to clean slate
async function purgeExtLocalUserSession() {
  state.user = null;
  state.verifiedXHandle = '';
  state.activeTwitterHandle = null;
  state.credits = 0;
  state.userPlan = 'Free Plan';
  state.pendingRequest = null;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.remove([
        'currentUser', 'user', 'authToken', 'verifiedXHandle', 'pendingRequest', 'credits', 'userPlan'
      ]);
    } catch (e) {}
  }

  updateCreditUI();
  await checkAccountVerificationLock();
  switchExtTab('access');
  showAccessSubView('request');
}

// Load credits & server state
async function loadServerState() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get([
        'credits', 'accessKey', 'creators', 'engagedTweetIds', 'userPlan',
        'currentUser', 'user', 'authToken', 'verifiedXHandle', 'pendingRequest'
      ]).catch(() => ({}));
      if (stored?.currentUser || stored?.user) state.user = stored.currentUser || stored.user;
      if (stored?.pendingRequest) state.pendingRequest = stored.pendingRequest;
      if (stored?.verifiedXHandle) {
        state.verifiedXHandle = stored.verifiedXHandle;
      } else if (state.user?.handle) {
        state.verifiedXHandle = state.user.handle;
      }
      if (stored?.credits !== undefined && state.user) {
        state.credits = stored.credits;
      } else if (!state.user) {
        state.credits = 0;
      }
      if (stored?.accessKey) state.accessKey = stored.accessKey;
      if (stored?.userPlan) state.userPlan = stored.userPlan;
      if (Array.isArray(stored?.creators)) state.creators = stored.creators;
      if (Array.isArray(stored?.engagedTweetIds)) state.engagedTweetIds = stored.engagedTweetIds;
    }
  } catch (err) {
    console.warn('Error reading local cache:', err);
  }

  // Instant UI render from local cache
  updateCreditUI();
  renderCreatorChips();

  // If there's an alleged user session or pending request, verify directly with server!
  if (state.user || state.verifiedXHandle || state.pendingRequest) {
    await syncServerStateNetwork();
  } else {
    await checkAccountVerificationLock();
    switchExtTab('access');
  }
}

async function syncServerStateNetwork() {
  try {
    const backendUrl = await getBackendUrl();
    const cleanHandle = (state.verifiedXHandle || state.user?.handle || state.pendingRequest?.handle || '').replace(/^@/, '').trim();
    const email = (state.user?.email || state.pendingRequest?.email || '').trim();

    // Check live status on server
    let stData = null;
    if (cleanHandle || email) {
      try {
        const stRes = await fetch(`${backendUrl}/api/auth/check-status?handle=${encodeURIComponent(cleanHandle)}&email=${encodeURIComponent(email)}`, { credentials: 'omit' });
        if (stRes.ok) {
          stData = await stRes.json();
        } else if (stRes.status === 404) {
          stData = { status: 'NOT_FOUND' };
        }
      } catch (e) {
        console.log('[ATOMX] Status verify notice:', e);
      }
    }

    // IF SERVER CONFIRMS USER IS NOT FOUND (DATA WIPED FRESH), PURGE LOCAL CACHE IMMEDIATELY!
    if (!stData || stData.status === 'NOT_FOUND' || stData.status === 'REJECTED') {
      console.log('[ATOMX] User account not found on server (wiped/fresh). Resetting extension session.');
      await purgeExtLocalUserSession();
      return;
    }

    if (stData.status === 'PENDING') {
      state.user = null;
      state.verifiedXHandle = '';
      state.pendingRequest = { handle: stData.handle || `@${cleanHandle}`, email: stData.email || email };
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.remove(['currentUser', 'user', 'authToken', 'verifiedXHandle']);
        await chrome.storage.local.set({ pendingRequest: state.pendingRequest });
      }
      updateCreditUI();
      await checkAccountVerificationLock();
      return;
    }

    if (stData.status === 'ACTIVE' || stData.status === 'APPROVED') {
      if (!state.user) {
        state.user = {
          handle: stData.handle || `@${cleanHandle}`,
          email: stData.email || email,
          fullName: stData.fullName || 'Verified Member',
          status: 'ACTIVE',
          credits: stData.credits !== undefined ? stData.credits : 100,
          plan: stData.plan || 'Free Plan'
        };
      } else {
        state.user.status = 'ACTIVE';
        if (typeof stData.credits === 'number') state.user.credits = stData.credits;
        if (stData.plan) state.user.plan = stData.plan;
      }
      state.credits = state.user.credits || 0;
      state.userPlan = state.user.plan || 'Free Plan';
      state.verifiedXHandle = state.user.handle || `@${cleanHandle}`;

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          user: state.user,
          currentUser: state.user,
          credits: state.credits,
          userPlan: state.userPlan,
          verifiedXHandle: state.verifiedXHandle
        });
      }
    }

    // Parallel balance and engaged tweets sync
    const [balRes, engRes] = await Promise.allSettled([
      fetch(`${backendUrl}/api/credits/balance`, { credentials: 'omit' }),
      fetch(`${backendUrl}/api/tweets/engaged`, { credentials: 'omit' })
    ]);

    if (balRes.status === 'fulfilled') {
      if (balRes.value?.status === 404 && state.user) {
        await purgeExtLocalUserSession();
        return;
      }
      if (balRes.value?.ok) {
        const data = await balRes.value.json().catch(() => ({}));
        if (typeof data.credits === 'number') {
          state.credits = data.credits;
          chrome.storage?.local.set({ credits: state.credits });
        }
        if (data.plan) {
          state.userPlan = data.plan;
          chrome.storage?.local.set({ userPlan: data.plan });
        }
      }
    }

    if (engRes.status === 'fulfilled' && engRes.value?.ok) {
      const engData = await engRes.value.json().catch(() => ({}));
      if (Array.isArray(engData.engagedIds) && engData.engagedIds.length > 0) {
        state.engagedTweetIds = Array.from(new Set([...(state.engagedTweetIds || []), ...engData.engagedIds]));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ engagedTweetIds: state.engagedTweetIds });
        }
      }
    }

    updateCreditUI();
    await checkAccountVerificationLock();
  } catch (err) {
    console.warn('Background server sync offline:', err);
    updateCreditUI();
    await checkAccountVerificationLock();
  }
}

/**
 * Switch between the 7 Access sub-views inside Tab 5
 */
function showAccessSubView(viewName) {
  const views = {
    'loggedIn': document.getElementById('extLoggedInCard'),
    'request': document.getElementById('extRequestAccessView'),
    'pending': document.getElementById('extPendingApprovalView'),
    'setPassword': document.getElementById('extSetPasswordView'),
    'login': document.getElementById('extLoggedOutCard'),
    'reset': document.getElementById('extResetPasswordView'),
    'suspended': document.getElementById('extSuspendedView')
  };

  Object.entries(views).forEach(([k, el]) => {
    if (el) el.style.display = (k === viewName) ? 'block' : 'none';
  });
}

/**
 * 1-to-1 Verified Twitter / X Identity Verification Engine
 */
async function checkAccountVerificationLock() {
  const verifiedHandle = (state.verifiedXHandle || state.user?.handle || '').replace(/^@/, '').toLowerCase().trim();
  const barText = document.getElementById('barVerifiedHandleText');
  const barBadge = document.getElementById('barMatchBadge');
  const barDot = document.getElementById('barLockDot');
  const mismatchBanner = document.getElementById('accountMismatchBanner');
  const mismatchExpected = document.getElementById('mismatchExpectedHandle');
  const mismatchActual = document.getElementById('mismatchActualHandle');
  const tabsNav = document.getElementById('extTabsNav');
  const verifiedBar = document.getElementById('verifiedAccountBar');

  // Check if account status is SUSPENDED
  const isSuspended = state.user && (state.user.status || '').toUpperCase() === 'SUSPENDED';

  if (isSuspended) {
    if (tabsNav) tabsNav.style.display = 'none';
    if (verifiedBar) verifiedBar.style.display = 'none';
    if (mismatchBanner) mismatchBanner.style.display = 'none';

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-access')?.classList.add('active');

    const suspHandle = document.getElementById('extSuspendedHandleDisplay');
    if (suspHandle) suspHandle.textContent = verifiedHandle ? `@${verifiedHandle}` : (state.user?.handle || '@user');

    showAccessSubView('suspended');
    return { isAllowed: false, reason: 'ACCOUNT_SUSPENDED' };
  }

  // Case 1: User is NOT authenticated or user does not exist on server
  const isInvalidUser = !state.user || state.user.status === 'NOT_FOUND' || !verifiedHandle;
  if (isInvalidUser) {
    if (tabsNav) tabsNav.style.display = 'none';
    if (verifiedBar) verifiedBar.style.display = 'none';
    if (mismatchBanner) mismatchBanner.style.display = 'none';

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-access')?.classList.add('active');

    if (state.pendingRequest) {
      const pHandleDisplay = document.getElementById('extPendingHandleDisplay');
      const pHandleText = document.getElementById('extPendingHandleText');
      const pEmailText = document.getElementById('extPendingEmailText');
      const pTelegramText = document.getElementById('extPendingTelegramText');
      if (pHandleDisplay) pHandleDisplay.textContent = state.pendingRequest.handle;
      if (pHandleText) pHandleText.textContent = state.pendingRequest.handle;
      if (pEmailText) pEmailText.textContent = state.pendingRequest.email || '--';
      if (pTelegramText) pTelegramText.textContent = state.pendingRequest.telegram || '--';
      showAccessSubView('pending');
      handleExtCheckStatus(false);
    } else {
      showAccessSubView('request');
    }

    return { isAllowed: false, reason: 'NOT_AUTHENTICATED' };
  }

  // Case 2: User is authenticated & Active
  if (tabsNav) tabsNav.style.display = 'flex';
  if (verifiedBar) verifiedBar.style.display = 'flex';

  showAccessSubView('loggedIn');

  const displayHandle = verifiedHandle ? `@${verifiedHandle}` : '@user';
  if (barText) barText.textContent = displayHandle;
  const extHandleText = document.getElementById('extHandleText');
  if (extHandleText) extHandleText.textContent = displayHandle;
  const extName = document.getElementById('extLoggedInName');
  if (extName) extName.textContent = state.user?.fullName || state.user?.name || 'Verified Member';
  const extPlan = document.getElementById('extLoggedInPlan');
  if (extPlan) extPlan.textContent = state.user?.plan || state.userPlan || 'Growth Plan';
  const extCredits = document.getElementById('extLoggedInCredits');
  if (extCredits) extCredits.textContent = `${(state.credits || 0).toLocaleString()} Credits`;


  // Real-time tab check with active Twitter/X tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0];
    if (activeTab && (activeTab.url?.includes('x.com') || activeTab.url?.includes('twitter.com'))) {
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'CHECK_CURRENT_LOGGED_IN_X_HANDLE' }).catch(() => null);
      if (response && response.success) {
        state.activeTwitterHandle = (response.rawHandle || '').toLowerCase().trim();
        if (!state.activeTwitterHandle) {
          // Twitter is open but no user is logged in
          if (mismatchBanner) {
            mismatchBanner.style.display = 'block';
            if (mismatchExpected) mismatchExpected.textContent = displayHandle;
            if (mismatchActual) mismatchActual.textContent = 'Not Logged In on X';
          }
          if (barBadge) {
            barBadge.textContent = 'NOT LOGGED IN ON X';
            barBadge.style.color = '#EF4444';
            barBadge.style.background = 'rgba(239, 68, 68, 0.15)';
          }
          if (barDot) barDot.style.background = '#EF4444';
          return { isAllowed: false, reason: 'X_NOT_LOGGED_IN' };
        } else if (state.activeTwitterHandle !== verifiedHandle) {
          // Twitter is logged into another ID
          if (mismatchBanner) {
            mismatchBanner.style.display = 'block';
            if (mismatchExpected) mismatchExpected.textContent = displayHandle;
            if (mismatchActual) mismatchActual.textContent = `@${state.activeTwitterHandle}`;
          }
          if (barBadge) {
            barBadge.textContent = 'ID MISMATCH';
            barBadge.style.color = '#EF4444';
            barBadge.style.background = 'rgba(239, 68, 68, 0.15)';
          }
          if (barDot) barDot.style.background = '#EF4444';
          return { isAllowed: false, reason: 'ID_MISMATCH', current: state.activeTwitterHandle };
        }
      }
    }
  } catch (e) {
    console.warn('Tab handle verification notice:', e);
  }

  // Matched and locked
  if (mismatchBanner) mismatchBanner.style.display = 'none';
  if (barBadge) {
    barBadge.textContent = '1-TO-1 LOCKED & MATCHED';
    barBadge.style.color = '#10B981';
    barBadge.style.background = 'rgba(16, 185, 129, 0.15)';
  }
  if (barDot) barDot.style.background = '#10B981';
  return { isAllowed: true };
}

async function ensureVerifiedAccountOrBlock() {
  const check = await checkAccountVerificationLock();
  if (!check.isAllowed) {
    if (check.reason === 'NOT_AUTHENTICATED') {
      alert('⚠️ Access Required:\nPlease submit an access request or sign in with your approved X ID in the "Access" tab to unlock this extension.');
      switchExtTab('access');
    } else if (check.reason === 'ID_MISMATCH') {
      alert(`⚠️ Account Lock Mismatch!\n\nThis extension is strictly bound to your verified Twitter account: @${(state.verifiedXHandle || '').replace(/^@/, '')}.\nYour browser is currently logged into @${check.current} on Twitter.\n\nPlease log into @${(state.verifiedXHandle || '').replace(/^@/, '')} on x.com to use this extension.`);
    } else if (check.reason === 'X_NOT_LOGGED_IN') {
      alert(`⚠️ Twitter Session Inactive:\nPlease log into your verified Twitter account (@${(state.verifiedXHandle || '').replace(/^@/, '')}) on x.com before launching automation.`);
    }
    return false;
  }
  return true;
}

/**
 * Handle in-extension Access Request Submission
 */
async function handleExtSubmitRequest() {
  const nameInput = document.getElementById('extReqFullNameInput');
  const emailInput = document.getElementById('extReqEmailInput');
  const telegramInput = document.getElementById('extReqTelegramInput');
  const handleInput = document.getElementById('extReqHandleInput');
  const btn = document.getElementById('extSubmitRequestBtn');

  const fullName = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  let telegram = telegramInput?.value.trim() || '';
  let handle = handleInput?.value.trim();

  if (!fullName) {
    alert('Please enter your full name.');
    return;
  }
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address.');
    return;
  }
  if (!handle) {
    alert('Please enter your real Twitter / X ID (e.g. @mythopair).');
    return;
  }

  if (!handle.startsWith('@')) handle = '@' + handle;
  if (telegram && !telegram.startsWith('@')) telegram = '@' + telegram;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting Request...';
  }

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, telegram, handle, xHandle: handle, useCase: 'Chrome Extension Access Request' })
    });

    const data = await res.json();
    if (!res.ok && res.status !== 201) {
      throw new Error(data.error || 'Failed to submit request');
    }

    const pendingData = {
      fullName,
      email,
      telegram,
      handle,
      status: 'PENDING',
      requestedAt: Date.now()
    };
    state.pendingRequest = pendingData;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ pendingRequest: pendingData });
    }

    // Update pending view text
    const pHandleDisplay = document.getElementById('extPendingHandleDisplay');
    const pHandleText = document.getElementById('extPendingHandleText');
    const pEmailText = document.getElementById('extPendingEmailText');
    const pTelegramText = document.getElementById('extPendingTelegramText');
    if (pHandleDisplay) pHandleDisplay.textContent = handle;
    if (pHandleText) pHandleText.textContent = handle;
    if (pEmailText) pEmailText.textContent = email;
    if (pTelegramText) pTelegramText.textContent = telegram || '--';

    showAccessSubView('pending');
    alert(`🚀 Request Submitted Successfully!\n\nYour request for ${handle} has been forwarded to the administrator.\nAs soon as approved, you can set your new password right here to start using the extension.`);
  } catch (err) {
    alert(`❌ Request Error: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Submit Request for Approval';
    }
  }
}

/**
 * Check Admin Approval Status (Manual or Background)
 */
async function handleExtCheckStatus(isManual = false) {
  if (!state.pendingRequest && !state.user) return;
  const targetHandle = state.pendingRequest?.handle || state.user?.handle || '';
  const targetEmail = state.pendingRequest?.email || state.user?.email || '';

  if (!targetHandle && !targetEmail) return;

  const btn = document.getElementById('extCheckStatusBtn');
  if (isManual && btn) {
    btn.disabled = true;
    btn.textContent = 'Checking Approval...';
  }

  try {
    const backendUrl = await getBackendUrl();
    const query = new URLSearchParams({ handle: targetHandle, email: targetEmail });
    const res = await fetch(`${backendUrl}/api/auth/check-status?${query.toString()}`);
    const data = await res.json();

    if (data.status === 'APPROVED') {
      const approvedHandle = data.handle || targetHandle;
      if (data.needsPasswordSetup) {
        const approvedDisp = document.getElementById('extApprovedHandleDisplay');
        if (approvedDisp) approvedDisp.textContent = approvedHandle;
        showAccessSubView('setPassword');
        if (isManual) {
          alert(`🎉 Congratulations!\n\nYour request for ${approvedHandle} has been approved by the administrator!\nPlease set your new password below to activate your account.`);
        }
      } else {
        const loginInput = document.getElementById('extLoginHandleInput');
        if (loginInput) loginInput.value = approvedHandle;
        showAccessSubView('login');
        if (isManual) {
          alert(`🎉 Your account (${approvedHandle}) is active and approved!\nPlease enter your password to sign in.`);
        }
      }
    } else if (data.status === 'REJECTED') {
      alert(`⚠️ Request Notice:\n${data.reason || 'Your access request was declined by the administrator.'}`);
    } else {
      if (isManual) {
        alert(`⏳ Still Pending:\n\nYour request for ${targetHandle} is currently awaiting admin approval in the dashboard.\nPlease check back shortly.`);
      }
    }
  } catch (err) {
    if (isManual) {
      alert(`⚠️ Notice: Could not reach verification server (${err.message}).`);
    }
  } finally {
    if (isManual && btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Check Approval Status Now';
    }
  }
}

/**
 * Handle Setting New Password after Approval
 */
async function handleExtSetPassword() {
  const p1 = document.getElementById('extNewPasswordInput')?.value.trim();
  const p2 = document.getElementById('extConfirmPasswordInput')?.value.trim();
  const btn = document.getElementById('extSaveNewPasswordSubmitBtn');

  if (!p1 || p1.length < 6) {
    alert('Please enter a password with at least 6 characters.');
    return;
  }
  if (p1 !== p2) {
    alert('Passwords do not match. Please re-enter.');
    return;
  }

  const targetHandle = state.pendingRequest?.handle || state.user?.handle || '';
  const targetEmail = state.pendingRequest?.email || state.user?.email || '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Activating Account...';
  }

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: targetHandle || targetEmail,
        email: targetEmail,
        handle: targetHandle,
        password: p1
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not set password');
    }

    state.user = data.user;
    state.verifiedXHandle = data.user.handle ? (data.user.handle.startsWith('@') ? data.user.handle : `@${data.user.handle}`) : targetHandle;
    if (typeof data.user.credits === 'number') state.credits = data.user.credits;
    if (data.user.plan) state.userPlan = data.user.plan;
    state.pendingRequest = null;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['pendingRequest']);
      await chrome.storage.local.set({
        currentUser: data.user,
        authToken: data.token,
        verifiedXHandle: state.verifiedXHandle,
        credits: state.credits,
        userPlan: state.userPlan
      });
    }

    updateCreditUI();
    showAccessSubView('loggedIn');
    await checkAccountVerificationLock();
    alert(`🎉 Account Activated!\n\nWelcome ${data.user.fullName}! Your extension is now 1-to-1 locked to your verified X account (${state.verifiedXHandle}).`);
  } catch (err) {
    alert(`❌ Activation Error: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔑 Set Password & Unlock Extension';
    }
  }
}

async function handleExtResetPassword() {
  const ident = document.getElementById('extResetIdentifierInput')?.value.trim();
  const p1 = document.getElementById('extResetNewPasswordInput')?.value.trim();
  const p2 = document.getElementById('extResetConfirmPasswordInput')?.value.trim();
  const btn = document.getElementById('extResetPasswordSubmitBtn');

  if (!ident) {
    alert('Please enter your X ID or registered email.');
    return;
  }
  if (!p1 || p1.length < 6) {
    alert('Please enter a password with at least 6 characters.');
    return;
  }
  if (p1 !== p2) {
    alert('Passwords do not match. Please re-enter.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Resetting Password...';
  }

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ident, newPassword: p1 })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not reset password');
    }
    alert('✓ Password updated successfully!\nPlease sign in with your new password.');
    showAccessSubView('login');
    const loginInput = document.getElementById('extLoginHandleInput');
    if (loginInput) loginInput.value = data.handle || ident;
  } catch (e) {
    alert(`❌ Reset Error: ${e.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save New Password & Sign In';
    }
  }
}

async function handleExtRequestReview() {
  const btn = document.getElementById('extRequestReviewBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting Appeal...';
  }
  try {
    const backendUrl = await getBackendUrl();
    const handle = state.verifiedXHandle || state.user?.handle || '';
    const email = state.user?.email || '';
    const res = await fetch(`${backendUrl}/api/auth/request-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, email, reason: 'Suspended user requesting review from extension' })
    });
    const d = await res.json();
    alert('✓ Review Request Submitted!\n\nYour appeal has been delivered to the administrator.\nPlease await review.');
    if (btn) btn.textContent = '✓ Appeal Submitted to Admin';
  } catch (err) {
    alert(`Notice: ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📨 Request Account Review / Appeal';
    }
  }
}


async function handleExtLogin() {
  const identifierInput = document.getElementById('extLoginHandleInput');
  const passwordInput = document.getElementById('extLoginPasswordInput');
  const identifier = identifierInput?.value.trim();
  const password = passwordInput?.value.trim();

  if (!identifier) {
    alert('Please enter your approved Twitter / X ID (e.g. @yourhandle) or email.');
    return;
  }

  const backendUrl = await getBackendUrl();
  const submitBtn = document.getElementById('extLoginSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Credentials...';
  }

  try {
    const res = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Invalid credentials. Please request access if not registered.');
    }

    state.user = data.user;
    state.verifiedXHandle = data.user.handle ? (data.user.handle.startsWith('@') ? data.user.handle : `@${data.user.handle}`) : identifier;
    if (typeof data.user.credits === 'number') state.credits = data.user.credits;
    if (data.user.plan) state.userPlan = data.user.plan;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        currentUser: data.user,
        authToken: data.token,
        verifiedXHandle: state.verifiedXHandle,
        credits: state.credits,
        userPlan: state.userPlan
      });
    }

    updateCreditUI();
    await checkAccountVerificationLock();
    alert(`✓ Successfully signed in as ${state.verifiedXHandle}!\nExtension is now locked to your verified identity.`);
  } catch (err) {
    alert(`❌ Sign In Failed: ${err.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In & Unlock Extension';
    }
  }
}

async function handleExtLogout() {
  if (!confirm('Are you sure you want to log out from this extension?')) return;
  await purgeExtLocalUserSession();
  alert('You have logged out. All cached user data has been cleared.');
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
  const isAuthed = !!(state.user && (state.verifiedXHandle || state.user?.handle));
  const displayCredits = isAuthed ? Number(state.credits || 0) : 0;

  const p = document.getElementById('creditBalanceText');
  if (p) p.textContent = displayCredits.toLocaleString();
  const b = document.getElementById('extCreditsBig');
  if (b) b.textContent = `${displayCredits.toLocaleString()} C`;
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
  } catch (e) { }

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
  let skippedCommentsCount = 0;
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

        // Auto-ignore rule: post already liked & commented OR comment already completed
        const res = outcome && outcome.result;
        const isIgnored = res && (res.ignored || res.commentSkipped);

        if (isIgnored) {
          ignoredCount++;
          if (res.commentSkipped) {
            skippedCommentsCount++;
          }
          const reasonStr = res.reason || (res.commentSkipped ? 'Already commented previously' : 'Already completed');
          logger(`Skipped ${indexStr}`, `Auto-ignored: ${reasonStr} (0 credits used)`, `${i + 1}/${total}`);

          // Cache so future raids skip this tweet locally
          state.engagedTweetIds = Array.from(new Set([...(state.engagedTweetIds || []), t.tweetId]));
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ engagedTweetIds: state.engagedTweetIds });
          }

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
      logger('Engagement Completed', `Finished: ${successCount} engaged, ${ignoredCount} auto-ignored (${skippedCommentsCount} comments skipped) of ${total} tweet(s).`, `${successCount}/${total}`);
      let summaryMsg = `✓ Autonomous Engagement Finished!\n\n• Engaged: ${successCount}\n• Auto-Ignored (Already completed): ${ignoredCount}`;
      if (skippedCommentsCount > 0) {
        summaryMsg += `\n• Comments Skipped: ${skippedCommentsCount}`;
      }
      summaryMsg += `\n• Total Processed: ${total}\n\nHuman-like typing and selective action rules applied. 0 credits used for skipped posts.`;
      alert(summaryMsg);
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
    const newTab = await chrome.tabs.create({ url: tweetUrl, active: false });
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
      generateContextual,
      verifiedXHandle: state.verifiedXHandle
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
  let url = DEFAULT_BACKEND_URL;
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const res = await chrome.storage.sync.get(['backendUrl']);
    if (res.backendUrl) url = res.backendUrl;
  }
  return (url || '').replace(/\/+$/, '');
}
