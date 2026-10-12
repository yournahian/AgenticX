/**
 * ATOMX ENGAGE — BACKGROUND SERVICE WORKER (Manifest V3)
 * ==========================================================
 * Handles:
 *  1. AI reply generation proxy (bypasses page-level CORS/HTTPS blocks)
 *  2. Context menu
 *  3. WORKFLOW RELAY ENGINE: Runs all agent workflows (Telegram Raid, Audience Builder,
 *     Sorsa Booster, Followers Increase, Reply Back Loop, Commenter Reciprocator)
 *     — workflows CONTINUE even when the extension popup is closed.
 *     State is persisted in chrome.storage.local and resumed via chrome.alarms.
 */

const DEFAULT_BACKEND_URL = 'https://agenticx-two.vercel.app';

// ─────────────────────────────────────────────────────────────────────────────
// MODE B: CHROME DEVTOOLS PROTOCOL (CDP) DEBUGGER API INTEGRATION
// Handles system-level authentic mouse dispatching via Input.dispatchMouseEvent
// ─────────────────────────────────────────────────────────────────────────────

const attachedDebuggerTabs = new Set();

if (typeof chrome !== 'undefined' && chrome.debugger && chrome.debugger.onDetach) {
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source?.tabId) {
      attachedDebuggerTabs.delete(source.tabId);
      console.log(`[ATOMX CDP] Debugger detached from tab ${source.tabId} (${reason}).`);
    }
  });
}

async function attachDebuggerSafely(tabId) {
  if (typeof chrome === 'undefined' || !chrome.debugger) {
    console.warn('[ATOMX CDP] chrome.debugger API is not available on this browser/environment.');
    return false;
  }
  if (attachedDebuggerTabs.has(tabId)) {
    return true;
  }
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedDebuggerTabs.add(tabId);
    console.log(`[ATOMX CDP] Debugger successfully attached to tab ${tabId}`);
    return true;
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('already attached') || msg.includes('Another debugger')) {
      attachedDebuggerTabs.add(tabId);
      return true;
    }
    console.warn(`[ATOMX CDP] Failed to attach debugger to tab ${tabId}:`, msg);
    return false;
  }
}

async function detachDebuggerSafely(tabId) {
  if (typeof chrome === 'undefined' || !chrome.debugger || !tabId) return;
  try {
    if (attachedDebuggerTabs.has(tabId)) {
      attachedDebuggerTabs.delete(tabId);
      await chrome.debugger.detach({ tabId });
      console.log(`[ATOMX CDP] Debugger detached from tab ${tabId}`);
    }
  } catch (e) {}
}

function sendCdpCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(result);
    });
  });
}

const sleepAsync = ms => new Promise(r => setTimeout(r, ms));

async function dispatchCdpMouseClick(tabId, x, y) {
  const attached = await attachDebuggerSafely(tabId);
  if (!attached) {
    return { ok: false, fallback: true, error: 'Cannot attach debugger to tab' };
  }

  const targetX = Math.round(x);
  const targetY = Math.round(y);

  try {
    // 1. Dispatch mouseMoved (hover over target coordinates)
    await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: targetX,
      y: targetY
    });
    await sleepAsync(45 + Math.random() * 45);

    // 2. Dispatch mousePressed (left click down)
    await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      x: targetX,
      y: targetY
    });
    await sleepAsync(65 + Math.random() * 65);

    // 3. Dispatch mouseReleased (left click release)
    await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      x: targetX,
      y: targetY
    });

    return { ok: true, x: targetX, y: targetY };
  } catch (err) {
    console.warn('[ATOMX CDP] dispatchMouseEvent error:', err);
    return { ok: false, fallback: true, error: err?.message };
  }
}

function safeRemoveTab(tabId) {
  // Safety rule: never close active browser tabs or windows automatically
  return;
}

// Reuses a SINGLE browser tab/window for all links/actions instead of opening/closing repeatedly
async function getOrCreateReusedTab(existingTabId, targetUrl) {
  // 1. If an existing working tab is known, verify it is still open and update it in-place
  if (existingTabId && typeof existingTabId === 'number' && existingTabId > 0) {
    try {
      const existingTab = await chrome.tabs.get(existingTabId);
      if (existingTab && existingTab.id) {
        const curNorm = (existingTab.url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
        const tgtNorm = (targetUrl || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
        if (curNorm !== tgtNorm) {
          await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
        }
        return existingTab.id;
      }
    } catch (e) {
      // Tab was closed by user
    }
  }

  // 2. Check for active tab in current window
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      await chrome.tabs.update(activeTab.id, { url: targetUrl, active: true });
      return activeTab.id;
    }
  } catch (e) {}

  // 3. Check for active tab in last focused window
  try {
    const [lastTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (lastTab && lastTab.id) {
      await chrome.tabs.update(lastTab.id, { url: targetUrl, active: true });
      return lastTab.id;
    }
  } catch (e) {}

  // 4. Check for ANY open Twitter / X tab in any window so we reuse it instead of opening new tabs
  try {
    const openTwitterTabs = await chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] });
    if (openTwitterTabs && openTwitterTabs.length > 0 && openTwitterTabs[0]?.id) {
      const tabToUse = openTwitterTabs[0];
      await chrome.tabs.update(tabToUse.id, { url: targetUrl, active: true });
      return tabToUse.id;
    }
  } catch (e) {}

  // 5. Check for ANY open tab anywhere in browser to reuse in-place
  try {
    const allTabs = await chrome.tabs.query({});
    if (allTabs && allTabs.length > 0 && allTabs[0]?.id) {
      const tabToUse = allTabs[0];
      await chrome.tabs.update(tabToUse.id, { url: targetUrl, active: true });
      return tabToUse.id;
    }
  } catch (e) {}

  // 6. Absolute fallback: only if browser has 0 tabs open
  const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
  return newTab.id;
}

// ─────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ATOMX BG] Extension installed.');
  chrome.storage.local.get(['credits'], (res) => {
    if (res.credits === undefined) chrome.storage.local.set({ credits: 10000 });
  });
  chrome.contextMenus.create({
    id: 'atomx-generate-reply',
    title: 'ATOMX: Generate AI Reply for selection',
    contexts: ['selection']
  });
});

// ─────────────────────────────────────────────
// POPUP LIFECYCLE (Guaranteed detection when popup closes to show Floating HUD)
// ─────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'atomx_popup_lifecycle') {
    chrome.storage.local.set({ atomx_popup_open: true }).catch(() => null);
    // When popup opens, instantly hide Floating HUD on tabs so they don't overlap
    try {
      chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
        if (tabs && tabs.length > 0) {
          for (const t of tabs) {
            if (t.id) chrome.tabs.sendMessage(t.id, { type: 'POPUP_OPENED' }).catch(() => null);
          }
        }
      });
    } catch (e) {}

    port.onDisconnect.addListener(() => {
      chrome.storage.local.set({ atomx_popup_open: false }).catch(() => null);
      // When popup closes, instantly show Floating HUD on tabs if a workflow is running
      try {
        chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
          if (tabs && tabs.length > 0) {
            for (const t of tabs) {
              if (t.id) chrome.tabs.sendMessage(t.id, { type: 'POPUP_CLOSED' }).catch(() => null);
            }
          }
        });
      } catch (e) {}
    });
  }
});

// Keep service worker alive while a workflow is running
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'atomx_tg_raid_step')        { processTgRaidStep();        return; }
  if (alarm.name === 'atomx_agent_workflow_step') { processAgentWorkflowStep(); return; }
  if (alarm.name === 'atomx_keepalive')           { pingKeepAlive();            return; }
});

function pingKeepAlive() {
  chrome.storage.local.get(['atomx_tg_raid', 'atomx_agent_workflow'], (res) => {
    const active = res?.atomx_tg_raid?.active || res?.atomx_agent_workflow?.active;
    if (active) chrome.alarms.create('atomx_keepalive', { delayInMinutes: 0.4 });
  });
}

// ─────────────────────────────────────────────
// CONTEXT MENU
// ─────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'atomx-generate-reply' && info.selectionText) {
    try {
      const stored = await chrome.storage.local.get(['currentUser', 'user', 'verifiedXHandle']).catch(() => ({}));
      const uHandle = stored?.verifiedXHandle || stored?.currentUser?.handle || stored?.user?.handle || '@user';
      const response = await fetch(`${DEFAULT_BACKEND_URL}/api/generate-reply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-handle': uHandle
        },
        body: JSON.stringify({ 
          tweetText: info.selectionText, 
          style: 'Natural & Concise',
          userHandle: uHandle
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'INSERT_REPLY_TEXT', text: data.reply });
      }
    } catch (err) {
      console.warn('[ATOMX BG] Context menu fetch failed:', err);
    }
  }
});

// ─────────────────────────────────────────────
// MESSAGE ROUTER
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ status: 'PONG', version: '1.0.0' });
    return true;
  }

  // ── Mode B: Chrome DevTools Protocol Mouse Dispatcher ──────────────
  if (request.type === 'CDP_DISPATCH_MOUSE_CLICK') {
    const tabId = request.tabId || sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, fallback: true, error: 'No tab ID available for CDP click' });
      return true;
    }
    dispatchCdpMouseClick(tabId, request.x, request.y).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ ok: false, fallback: true, error: err?.message });
    });
    return true;
  }

  if (request.type === 'CDP_DETACH_DEBUGGER') {
    const tabId = request.tabId || sender?.tab?.id;
    if (tabId) detachDebuggerSafely(tabId);
    sendResponse({ ok: true });
    return true;
  }

  // ── Network Relay Proxy (bypasses mobile popup sandbox & fetch hangs) ──
  if (request.type === 'API_FETCH_RELAY' || request.type === 'AUTH_LOGIN_RELAY') {
    const { endpoint, method = 'POST', body, headers = {}, timeout = 15000 } = request;
    const targetBase = (request.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    const url = (endpoint && endpoint.startsWith('http')) ? endpoint : `${targetBase}${endpoint ? (endpoint.startsWith('/') ? '' : '/') + endpoint : ''}`;
    (async () => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
          signal: controller.signal
        });
        clearTimeout(tid);
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Network request failed' });
      }
    })();
    return true;
  }

  if (request.type === 'GET_CREDITS') {
    chrome.storage.local.get(['credits'], (result) => sendResponse({ credits: result.credits || 0 }));
    return true;
  }

  // ── Suspension Enforcement ─────────────────────────────────────────
  if (['GENERATE_AI_REPLY', 'GENERATE_INLINE_REPLY', 'BG_START_TG_RAID', 'BG_START_AGENT_WORKFLOW'].includes(request.type)) {
    chrome.storage.local.get(['user', 'currentUser'], (res) => {
      const u = res?.user || res?.currentUser;
      if (u && (u.status || '').toUpperCase() === 'SUSPENDED') {
        sendResponse({ error: 'Account suspended by administrator.', status: 'SUSPENDED' });
        return;
      }
    });
  }

  // ── AI Reply Generation (bypasses page CORS) ────────────────────
  if (request.type === 'GENERATE_AI_REPLY' || request.type === 'GENERATE_INLINE_REPLY') {
    handleAiReplyGeneration(request, sendResponse);
    return true;
  }

  // ── Telegram Group Engage Relay ─────────────────────────────────
  if (request.type === 'BG_START_TG_RAID') {
    handleStartTgRaid(request, sendResponse);
    return true;
  }

  if (request.type === 'BG_ABORT_TG_RAID') {
    abortTgRaid();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'TOGGLE_WORKFLOW_PAUSE') {
    chrome.storage.local.get(['atomx_tg_raid', 'atomx_agent_workflow', 'atomx_workflow_paused'], (res) => {
      const isPaused = (request.isPaused !== undefined) ? request.isPaused : !res?.atomx_workflow_paused;
      chrome.storage.local.set({ atomx_workflow_paused: isPaused });
      if (res?.atomx_tg_raid) {
        chrome.storage.local.set({ atomx_tg_raid: { ...res.atomx_tg_raid, isPaused } });
      }
      if (res?.atomx_agent_workflow) {
        chrome.storage.local.set({ atomx_agent_workflow: { ...res.atomx_agent_workflow, isPaused } });
      }
      // Broadcast pause state to all tabs
      chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
        if (tabs) {
          for (const t of tabs) {
            if (t.id) chrome.tabs.sendMessage(t.id, { type: 'TOGGLE_WORKFLOW_PAUSE', isPaused }).catch(() => null);
          }
        }
      });
      sendResponse({ ok: true, isPaused });
    });
    return true;
  }

  if (request.type === 'SKIP_WORKFLOW_ITEM') {
    chrome.storage.local.get(['atomx_agent_workflow', 'atomx_active_hud', 'atomx_tg_raid'], async (res) => {
      const wf = res?.atomx_agent_workflow;
      const activeHud = res?.atomx_active_hud;
      if (wf && wf.active) {
        const newSkipped = (wf.ignoredCount || 0) + 1;
        const total = wf.total || 10;
        const done = wf.successCount || 0;
        const nextIdx = Math.min(total, done + newSkipped);
        wf.ignoredCount = newSkipped;
        wf.currentIndex = nextIdx;
        wf.statusText = '⏭️ Skipping current item...';

        const updatedHud = {
          ...(activeHud || {}),
          skipped: newSkipped,
          indicator: `${nextIdx}/${total}`,
          statusText: '⏭️ Skipping current item...'
        };

        await chrome.storage.local.set({
          atomx_skip_current: true,
          atomx_agent_workflow: wf,
          atomx_active_hud: updatedHud
        });

        broadcastHudToTabs(updatedHud);
      } else {
        await chrome.storage.local.set({ atomx_skip_current: true });
      }

      if (tgRaidWorkingTabId) {
        chrome.tabs.sendMessage(tgRaidWorkingTabId, { type: 'SKIP_WORKFLOW_ITEM' }).catch(() => null);
      }
      if (agentWorkflowWorkingTabId) {
        chrome.tabs.sendMessage(agentWorkflowWorkingTabId, { type: 'SKIP_WORKFLOW_ITEM' }).catch(() => null);
      }
    });

    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'BG_GET_TG_RAID_STATUS') {
    chrome.storage.local.get(['atomx_tg_raid'], (res) => sendResponse({ raid: res?.atomx_tg_raid || null }));
    return true;
  }

  // ── Generic Agent Workflow Relay (Audience, Sorsa, Followers, ReplyBack, Reciprocator) ──
  if (request.type === 'BG_START_AGENT_WORKFLOW') {
    handleStartAgentWorkflow(request, sendResponse);
    return true;
  }

  if (request.type === 'BG_ABORT_AGENT_WORKFLOW') {
    abortAgentWorkflow();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'BG_GET_AGENT_WORKFLOW_STATUS') {
    chrome.storage.local.get(['atomx_agent_workflow'], (res) => sendResponse({ workflow: res?.atomx_agent_workflow || null }));
    return true;
  }

  // ── Universal ABORT from mini-hud or content.js ──────────────────
  if (request.type === 'ABORT_WORKFLOW') {
    abortTgRaid();
    abortAgentWorkflow();
    sendResponse({ ok: true });
    return true;
  }
});

// ─────────────────────────────────────────────
// AI REPLY GENERATION
// ─────────────────────────────────────────────

async function handleAiReplyGeneration(request, sendResponse) {
  try {
    const [storedSync, storedLocal] = await Promise.all([
      chrome.storage.sync.get(['backendUrl']).catch(() => ({})),
      chrome.storage.local.get(['backendUrl', 'selectedTone', 'selectedTonePrompt']).catch(() => ({}))
    ]);
    const rawBackendUrl = storedSync?.backendUrl || storedLocal?.backendUrl || DEFAULT_BACKEND_URL;
    const backendUrl = (rawBackendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

    const tweetText    = request.tweetText || request.tweet?.text || '';
    const tweetAuthor  = request.tweetAuthor || request.tweet?.authorHandle || '@user';
    const tweetAuthorName = request.tweetAuthorName || request.tweet?.authorName || '';
    const style        = request.style || storedLocal?.selectedTone || 'Bullish (5-10 words)';
    const stylePrompt  = request.stylePrompt || storedLocal?.selectedTonePrompt || null;

    const userStored = await chrome.storage.local.get(['currentUser', 'user', 'verifiedXHandle']).catch(() => ({}));
    const userHandle = userStored?.verifiedXHandle || userStored?.currentUser?.handle || userStored?.user?.handle || '@user';
    const userEmail  = userStored?.currentUser?.email || userStored?.user?.email || '';
    const userId     = userStored?.currentUser?.id || userStored?.user?.id || null;

    const res = await fetch(`${backendUrl}/api/generate-reply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-handle': userHandle,
        'x-user-id': userId ? String(userId) : '1'
      },
      body: JSON.stringify({ 
        tweetText, 
        tweetAuthor, 
        tweetAuthorName, 
        style, 
        stylePrompt,
        userHandle,
        userEmail,
        userId
      })
    });

    if (res.ok) {
      const data = await res.json();
      sendResponse({ success: true, reply: data.reply });
    } else {
      const errData = await res.json().catch(() => ({}));
      sendResponse({ success: false, error: errData.error || `HTTP ${res.status}` });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM GROUP ENGAGE — BACKGROUND RELAY ENGINE
//
// Architecture:
//  1. popup.js sends BG_START_TG_RAID with full tweet list + actions + options
//  2. background.js saves state to chrome.storage.local and fires first step
//  3. Each step: open tab → wait for load → send EXECUTE_AUTONOMOUS_ENGAGEMENT
//     → receive result → update counters → close tab → schedule next step via alarm
//  4. Works even when popup is closed — state survives service worker idle restarts
//  5. popup.js listens to chrome.storage.onChanged to update its own UI
// ─────────────────────────────────────────────────────────────────────────────

let tgRaidWorkingTabId = null;

async function handleStartTgRaid(request, sendResponse) {
  const { tweets, actions, options = {} } = request;
  if (!tweets || tweets.length === 0) { sendResponse({ ok: false, error: 'No tweets.' }); return; }

  const total = tweets.length;
  const raidState = {
    active: true,
    tweets,
    actions,
    options,
    currentIndex: 0,
    successCount: 0,
    ignoredCount: 0,
    skippedCommentsCount: 0,
    total,
    startedAt: Date.now()
  };

  await chrome.storage.local.remove('atomx_hud_dismissed').catch(() => null);
  await chrome.storage.local.set({ atomx_tg_raid: raidState, atomx_skip_current: false });
  await syncTgHud(raidState, `Starting Telegram Raid engagement (${total} tweets)...`, 'ENGAGING', 5);

  // Keepalive heartbeat so service worker stays alive
  chrome.alarms.create('atomx_keepalive', { delayInMinutes: 0.4 });

  // Fire first step immediately (small delay to ensure storage is written)
  setTimeout(() => processTgRaidStep(), 300);

  sendResponse({ ok: true });
}

async function processTgRaidStep() {
  const stored = await chrome.storage.local.get(['atomx_tg_raid', 'atomx_workflow_paused', 'atomx_skip_current']).catch(() => ({}));
  const raid = stored?.atomx_tg_raid;

  if (!raid || !raid.active) {
    console.log('[ATOMX BG] TG Raid: no active raid found, stopping.');
    return;
  }

  // Handle pause: wait if paused
  if (stored?.atomx_workflow_paused || raid.isPaused) {
    console.log('[ATOMX BG] TG Raid is paused. Waiting for user to resume...');
    await syncTgHud(raid, '⏸️ Workflow Paused by User', 'PAUSED', raid.progressPercent || 0, '', 'Paused', '⏸️ Paused');
    while (true) {
      await delay(500);
      const recheck = await chrome.storage.local.get(['atomx_tg_raid', 'atomx_workflow_paused']).catch(() => ({}));
      if (!recheck?.atomx_tg_raid?.active) return;
      if (!recheck?.atomx_workflow_paused && !recheck?.atomx_tg_raid?.isPaused) break;
    }
  }

  const { tweets, actions, options, currentIndex, total, successCount, ignoredCount } = raid;

  // Finished?
  if (currentIndex >= total) {
    await finishTgRaid(raid);
    return;
  }

  const tweet = tweets[currentIndex];
  const nextTweet = tweets[currentIndex + 1];
  const indexStr = `[${currentIndex + 1}/${total}]`;

  const cleanHandle = (tweet?.handle && tweet.handle !== 'i' && tweet.handle !== '@i')
    ? tweet.handle.replace(/^@+/, '')
    : '';
  const displayCurrent = cleanHandle ? `@${cleanHandle}` : `Tweet ${currentIndex + 1}/${total}`;

  const nextCleanHandle = (nextTweet?.handle && nextTweet.handle !== 'i' && nextTweet.handle !== '@i')
    ? nextTweet.handle.replace(/^@+/, '')
    : '';
  const nextInfo = nextTweet
    ? (nextCleanHandle ? `@${nextCleanHandle}` : `Tweet ${currentIndex + 2}/${total}`)
    : 'Completion';

  console.log(`[ATOMX BG] TG Raid step ${indexStr}: ${tweet.canonicalUrl}`);

  await syncTgHud(
    raid,
    `${indexStr} Visiting ${displayCurrent}...`,
    'ENGAGING',
    Math.round((currentIndex / total) * 100),
    '',
    `Visiting ${displayCurrent}`,
    '⚡ Active'
  );

  try {
    // Discard any unsaved drafts from prior tweet to eliminate browser "Leave site?" prompts
    if (tgRaidWorkingTabId) {
      await sendMessageToTab(tgRaidWorkingTabId, { type: 'CLEANUP_DRAFTS_BEFORE_NAV' }, 1500).catch(() => null);
    }

    // Navigate in single reused tab/window across all tweets
    const tabId = await getOrCreateReusedTab(tgRaidWorkingTabId, tweet.canonicalUrl);
    tgRaidWorkingTabId = tabId;

    // Wait for tab to load
    await waitForTabLoad(tabId, 10000);
    await delay(2000); // React hydration

    // Re-check abort or skip after tab load
    const recheckStored = await chrome.storage.local.get(['atomx_tg_raid', 'atomx_skip_current']).catch(() => ({}));
    if (!recheckStored?.atomx_tg_raid?.active) {
      tgRaidWorkingTabId = null;
      return;
    }

    if (recheckStored?.atomx_skip_current) {
      console.log(`[ATOMX BG] TG Raid ${indexStr}: Skipped by user!`);
      const updatedRaid = { ...raid, currentIndex: currentIndex + 1, ignoredCount: ignoredCount + 1 };
      await chrome.storage.local.set({ atomx_tg_raid: updatedRaid, atomx_skip_current: false });
      setTimeout(() => processTgRaidStep(), 150);
      return;
    }

    // Get options from storage (tone, backend, etc.)
    const localData = await chrome.storage.local.get(['backendUrl', 'selectedTone', 'selectedTonePrompt', 'verifiedXHandle']).catch(() => ({}));
    const backendUrl = (options.backendUrl || localData.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

    await syncTgHud(
      raid,
      `${indexStr} Executing actions on @${tweet.handle || 'user'}...`,
      'ENGAGING',
      Math.round((currentIndex / total) * 100),
      '',
      `Like & Comment @${tweet.handle || 'user'}`,
      '⚡ Active'
    );

    // Send engagement command to content script
    const result = await sendMessageToTab(tabId, {
      type: 'EXECUTE_AUTONOMOUS_ENGAGEMENT',
      actions,
      replyText: '',
      style: options.style || localData.selectedTone || 'Bullish (5-10 words)',
      stylePrompt: options.stylePrompt || localData.selectedTonePrompt || null,
      backendUrl,
      tweetAuthor: tweet.handle || '',
      tweetUrl: tweet.canonicalUrl,
      generateContextual: actions.comment,
      verifiedXHandle: options.verifiedXHandle || localData.verifiedXHandle || ''
    }, 45000);

    // Re-check abort after engagement
    const recheckStored2 = await chrome.storage.local.get(['atomx_tg_raid']).catch(() => ({}));
    if (!recheckStored2?.atomx_tg_raid?.active) {
      tgRaidWorkingTabId = null;
      return;
    }

    // Process result
    const isIgnored = result && (result.ignored || result.commentSkipped);
    let newSuccessCount = successCount;
    let newIgnoredCount = ignoredCount;
    let newSkippedComments = raid.skippedCommentsCount || 0;

    if (isIgnored) {
      newIgnoredCount++;
      if (result.commentSkipped) newSkippedComments++;
      console.log(`[ATOMX BG] TG Raid ${indexStr}: Auto-ignored — ${result.reason || 'already done'}`);

      // Save to engagedTweetIds so future Telegram raids skip this already-engaged tweet immediately!
      const engData = await chrome.storage.local.get(['engagedTweetIds']).catch(() => ({}));
      const engIds = Array.from(new Set([...(engData.engagedTweetIds || []), tweet.tweetId].filter(Boolean)));
      await chrome.storage.local.set({ engagedTweetIds: engIds }).catch(() => null);
    } else {
      newSuccessCount++;
      const credData = await chrome.storage.local.get(['credits']).catch(() => ({}));
      const newCredits = Math.max(0, (credData.credits || 0) - 1);
      await chrome.storage.local.set({ credits: newCredits }).catch(() => null);

      const engData = await chrome.storage.local.get(['engagedTweetIds']).catch(() => ({}));
      const engIds = Array.from(new Set([...(engData.engagedTweetIds || []), tweet.tweetId].filter(Boolean)));
      await chrome.storage.local.set({ engagedTweetIds: engIds }).catch(() => null);

      fetch(`${backendUrl}/api/tweets/mark-engaged`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweets: [{ tweet_id: tweet.tweetId, handle: tweet.handle, canonical_url: tweet.canonicalUrl, action_type: 'autonomous_raid' }] })
      }).catch(() => null);
    }

    // Keep tgRaidWorkingTabId open so subsequent tweets reuse the exact same tab/window!

    // Update raid state
    const updatedRaid = {
      ...raid,
      currentIndex: currentIndex + 1,
      successCount: newSuccessCount,
      ignoredCount: newIgnoredCount,
      skippedCommentsCount: newSkippedComments
    };
    await chrome.storage.local.set({ atomx_tg_raid: updatedRaid });

    // HUD update with result
    const statusLabel = isIgnored
      ? `${indexStr} Skipped ${displayCurrent} (already done)`
      : `${indexStr} ✓ Engaged ${displayCurrent}`;

    await syncTgHud(
      updatedRaid,
      statusLabel,
      'ENGAGING',
      Math.round(((currentIndex + 1) / total) * 100),
      '',
      nextInfo,
      'Ready'
    );

    // Schedule anti-ban pacing delay before next tweet
    if (updatedRaid.currentIndex < total) {
      const delaySec = Math.max(3, (options.delaySeconds || 7) + Math.floor(Math.random() * 4 - 2));
      await schedulePacingCountdown(delaySec, updatedRaid, currentIndex + 1, total, nextInfo);
    } else {
      // Last tweet — finish immediately
      await finishTgRaid(updatedRaid);
    }

  } catch (err) {
    console.warn(`[ATOMX BG] TG Raid error on ${tweet.canonicalUrl}:`, err);
    if (tgRaidWorkingTabId) {
      tgRaidWorkingTabId = null;
    }
    const updatedRaid = { ...raid, currentIndex: currentIndex + 1, ignoredCount: ignoredCount + 1 };
    await chrome.storage.local.set({ atomx_tg_raid: updatedRaid });
    setTimeout(() => processTgRaidStep(), 1500);
  }
}

async function schedulePacingCountdown(delaySec, raid, completedIndex, total, nextActionText = '') {
  for (let sec = delaySec; sec > 0; sec--) {
    let recheckStored = await chrome.storage.local.get(['atomx_tg_raid', 'atomx_workflow_paused', 'atomx_skip_current']).catch(() => ({}));
    if (!recheckStored?.atomx_tg_raid?.active) return; // Aborted

    if (recheckStored?.atomx_skip_current) {
      // Skip clicked during pacing delay!
      await chrome.storage.local.set({ atomx_skip_current: false });
      setTimeout(() => processTgRaidStep(), 100);
      return;
    }

    // If workflow is paused, freeze and hold here until resumed
    while (recheckStored?.atomx_workflow_paused || recheckStored?.atomx_tg_raid?.isPaused) {
      await syncTgHud(
        recheckStored.atomx_tg_raid,
        '⏸️ Workflow Paused by User',
        'PAUSED',
        Math.round((completedIndex / total) * 100),
        '',
        nextActionText,
        '⏸️ Paused'
      );
      await delay(400);
      recheckStored = await chrome.storage.local.get(['atomx_tg_raid', 'atomx_workflow_paused', 'atomx_skip_current']).catch(() => ({}));
      if (!recheckStored?.atomx_tg_raid?.active) return;
      if (recheckStored?.atomx_skip_current) {
        await chrome.storage.local.set({ atomx_skip_current: false });
        setTimeout(() => processTgRaidStep(), 100);
        return;
      }
      if (!recheckStored?.atomx_workflow_paused && !recheckStored?.atomx_tg_raid?.isPaused) break;
    }

    const timeStr = `0:${String(sec).padStart(2, '0')}`;
    await syncTgHud(
      recheckStored.atomx_tg_raid,
      `Anti-ban delay: ${sec}s before ${nextActionText || ('tweet ' + (completedIndex + 1) + '/' + total)}...`,
      'PACING',
      Math.round((completedIndex / total) * 100),
      `Next tweet in ${timeStr}`,
      nextActionText || `Tweet ${completedIndex + 1}/${total}`,
      `⏱️ ${timeStr}`
    );
    await delay(1000);
  }

  // PACING FINISHED: DIRECTLY CALL processTgRaidStep() so it continues without getting stuck!
  setTimeout(() => processTgRaidStep(), 200);
}

async function finishTgRaid(raid) {
  const { successCount, ignoredCount, total } = raid;
  console.log(`[ATOMX BG] TG Raid COMPLETE: ${successCount}/${total} engaged, ${ignoredCount} skipped.`);

  const finalRaid = {
    ...raid,
    active: false,
    stateBadge: 'DONE',
    progressPercent: 100,
    countdownText: '',
    nextAction: 'Complete',
    timerBadge: '✓ Done',
    statusText: `✓ Raid complete! ${successCount} engaged, ${ignoredCount} skipped.`,
    finishedAt: Date.now()
  };
  await chrome.storage.local.set({ atomx_tg_raid: finalRaid });

  await chrome.storage.local.set({
    atomx_active_hud: {
      title: 'Telegram Group Engage',
      stateBadge: 'DONE',
      indicator: `${total}/${total}`,
      done: successCount,
      collected: total,
      skipped: ignoredCount,
      progressPercent: 100,
      statusText: `✓ Raid complete! ${successCount} engaged, ${ignoredCount} skipped.`,
      countdownText: '',
      nextAction: 'Completed',
      timerBadge: '✓ Done',
      isStopped: true,
      active: false
    }
  });

  chrome.alarms.clear('atomx_keepalive').catch(() => null);
  tgRaidWorkingTabId = null;
}

async function abortTgRaid() {
  console.log('[ATOMX BG] TG Raid: Aborting...');
  const stored = await chrome.storage.local.get(['atomx_tg_raid']).catch(() => ({}));
  const raid = stored?.atomx_tg_raid;

  if (raid) {
    await chrome.storage.local.set({
      atomx_tg_raid: { ...raid, active: false, stateBadge: 'STOPPED', statusText: 'Workflow stopped by user.', countdownText: '', nextAction: 'Stopped', timerBadge: '⏹️ Stopped' },
      atomx_active_hud: {
        title: 'Telegram Group Engage',
        stateBadge: 'STOPPED',
        done: raid.successCount || 0,
        collected: raid.total || 0,
        skipped: raid.ignoredCount || 0,
        progressPercent: Math.round(((raid.currentIndex || 0) / (raid.total || 1)) * 100),
        statusText: 'Workflow stopped by user.',
        countdownText: '',
        nextAction: 'Stopped',
        timerBadge: '⏹️ Stopped',
        isStopped: true,
        active: false
      }
    });
  }

  if (tgRaidWorkingTabId) {
    chrome.tabs.sendMessage(tgRaidWorkingTabId, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    await delay(300);
    safeRemoveTab(tgRaidWorkingTabId);
    tgRaidWorkingTabId = null;
  }

  chrome.alarms.clear('atomx_tg_raid_step').catch(() => null);
  chrome.alarms.clear('atomx_keepalive').catch(() => null);
}

// Broadcast floating HUD state to all open Twitter/X tabs in real-time
function broadcastHudToTabs(hudPayload) {
  try {
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        for (const t of tabs) {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, {
              type: 'UPDATE_FLOATING_HUD',
              data: hudPayload,
              hud: hudPayload
            }).catch(() => null);
          }
        }
      }
    });
  } catch (e) {}
}

// Sync floating HUD state and Telegram raid state to chrome.storage.local
async function syncTgHud(raid, statusText, stateBadge = 'ENGAGING', progressPercent = 0, countdownText = '', nextAction = '', timerBadge = '') {
  const { successCount = 0, ignoredCount = 0, total = 0, currentIndex = 0 } = raid;
  const updatedRaid = {
    ...raid,
    statusText,
    stateBadge,
    progressPercent,
    countdownText,
    nextAction,
    timerBadge
  };
  const activeHud = {
    title: 'Telegram Group Engage',
    stateBadge,
    indicator: `Tweet ${currentIndex}/${total}`,
    done: successCount,
    collected: total,
    skipped: ignoredCount,
    progressPercent,
    statusText,
    countdownText,
    nextAction: nextAction || (stateBadge === 'DONE' ? 'Completed' : (stateBadge === 'STOPPED' ? 'Stopped' : (total > 0 && currentIndex < total ? `Tweet ${currentIndex + 1}/${total}` : 'Active'))),
    timerBadge: timerBadge || (countdownText ? countdownText.replace('Next tweet in ', '⏱️ ') : '⚡ Active'),
    isStopped: stateBadge === 'STOPPED' || stateBadge === 'DONE',
    active: stateBadge !== 'STOPPED' && stateBadge !== 'DONE'
  };
  await chrome.storage.local.set({
    atomx_tg_raid: updatedRaid,
    atomx_active_hud: activeHud
  }).catch(() => null);
  broadcastHudToTabs(activeHud);
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED AGENT WORKFLOW ENGINE (SURVIVES EXTENSION POPUP CLOSES)
// Supports: Audience Builder, Sorsa Booster, Followers Growth, Reply Back, Reciprocator
// ─────────────────────────────────────────────────────────────────────────────

let agentWorkflowWorkingTabId = null;
let isAgentStepRunning = false;
let currentWorkflowSessionId = 0;

function isValidTwitterHandle(handle) {
  if (!handle || typeof handle !== 'string') return false;
  const clean = handle.replace(/^@+/, '').trim().toLowerCase();
  const INVALID = [
    'unknown', 'undefined', 'null', 'user', 'none', 'not logged in',
    'home', 'explore', 'notifications', 'messages', 'i', 'compose',
    'settings', 'search', 'hashtag', 'lists', 'communities',
    'verified-orgs-signup', 'login', 'signup', 'jobs', 'premium'
  ];
  return clean.length >= 2 && !INVALID.includes(clean) && /^[\w_]{1,30}$/.test(clean);
}

/**
 * Instant Account Lock Enforcement:
 * Checks active Twitter account on working tab against AtomX verified account.
 * If mismatch or logged out, shows modal on page, updates HUD, and halts instantly.
 */
async function verifyTabAccountLock(tabId, expectedHandle, workflow) {
  if (!tabId || !expectedHandle) return { ok: true };
  const expected = expectedHandle.replace(/^@/, '').toLowerCase().trim();

  try {
    const res = await sendMessageToTab(tabId, { type: 'CHECK_CURRENT_LOGGED_IN_X_HANDLE' }, 8000);
    const current = (res?.rawHandle || '').toLowerCase().trim();

    if (isValidTwitterHandle(current) && current !== expected) {
      console.warn(`[ATOMX BG] ACCOUNT LOCK MISMATCH DETECTED! Active: @${current}, Expected: @${expected}`);
      await chrome.storage.local.set({
        atomx_account_lock_warning: {
          expected,
          current,
          timestamp: Date.now()
        }
      }).catch(() => null);

      if (workflow) {
        workflow.active = false;
        workflow.isStopped = true;
        workflow.status = 'STOPPED';
        await syncAgentHud(workflow, `🛑 Account Mismatch: Active @${current} ≠ Verified @${expected}. Locked.`, 'STOPPED', 0);
        await chrome.storage.local.set({
          atomx_agent_workflow: workflow,
          atomx_active_hud: {
            visible: true,
            title: workflow.title || 'AtomX Agent',
            statusText: `🛑 Account Mismatch: Active @${current} ≠ Verified @${expected}. Locked.`,
            stateBadge: 'STOPPED',
            isStopped: true
          }
        });
      }
      return { ok: false, current, expected, reason: 'ID_MISMATCH' };
    }

    if (!isValidTwitterHandle(current) && res?.isDefinitelyLoggedOut) {
      await sendMessageToTab(tabId, {
        type: 'SHOW_ACCOUNT_MISMATCH_MODAL',
        expected,
        current: 'Not Logged In'
      }, 5000).catch(() => null);

      if (workflow) {
        workflow.active = false;
        workflow.isStopped = true;
        workflow.status = 'STOPPED';
        await syncAgentHud(workflow, `🛑 Please log into verified Twitter account @${expected}. Locked.`, 'STOPPED', 0);
        await chrome.storage.local.set({ atomx_agent_workflow: workflow });
      }
      return { ok: false, expected, reason: 'X_NOT_LOGGED_IN' };
    }

    // Tab is either confirmed on verified handle or session is active (mobile drawer closed)
    chrome.storage.local.remove('atomx_account_lock_warning').catch(() => null);
  } catch (err) {
    console.warn('[ATOMX BG] verifyTabAccountLock check notice:', err);
  }
  return { ok: true };
}

async function handleStartAgentWorkflow(request, sendResponse) {
  const { agentId, title, items = [], options = {}, tabId } = request;
  if ((!items || items.length === 0) && !(agentId === 'reciprocator' && options.postUrl) && !(options.feedUrl) && !(agentId === 'followers') && !(agentId === 'audience')) {
    sendResponse({ ok: false, error: 'No targets/items provided.' });
    return;
  }

  // Generate unique session ID to cancel any prior asynchronous timers or loops immediately
  currentWorkflowSessionId = Date.now();
  isAgentStepRunning = false;

  // Lock onto passed working tabId if provided
  if (tabId && typeof tabId === 'number' && tabId > 0) {
    agentWorkflowWorkingTabId = tabId;
  }

  let workflowItems = items;
  if (agentId === 'sorsa' && items && items.length > 0) {
    const targetCount = Number(options.targetCount) || 10;
    if (options.mode === 'sequential') {
      const idxRes = await chrome.storage.local.get(['atomx_sorsa_last_index']).catch(() => ({}));
      let lastIdx = Number(idxRes?.atomx_sorsa_last_index) || 0;
      if (lastIdx >= items.length) lastIdx = 0;
      workflowItems = items.slice(lastIdx, lastIdx + targetCount);
      const nextIdx = (lastIdx + workflowItems.length) % items.length;
      await chrome.storage.local.set({ atomx_sorsa_last_index: nextIdx });
    } else {
      // Mode 2: Rolling Deduplication Window
      const cooloffHours = Number(options.cooloffHours) || 24;
      const cooloffMs = cooloffHours * 3600 * 1000;
      const now = Date.now();
      const histRes = await chrome.storage.local.get(['atomx_sorsa_engaged_history']).catch(() => ({}));
      const history = (histRes?.atomx_sorsa_engaged_history && typeof histRes.atomx_sorsa_engaged_history === 'object') ? histRes.atomx_sorsa_engaged_history : {};
      workflowItems = items.filter(it => {
        const h = (it.cleanHandle || it.handle || '').replace(/^@/, '').toLowerCase();
        const last = history[h];
        return !last || (now - last >= cooloffMs);
      }).slice(0, targetCount);
    }
  }

  const total = workflowItems.length;
  const workflowState = {
    active: true,
    agentId,
    title: title || 'AtomX Agent',
    items: workflowItems,
    options,
    currentIndex: 0,
    successCount: 0,
    ignoredCount: 0,
    total,
    startedAt: Date.now(),
    stateBadge: 'RUNNING',
    progressPercent: 5,
    statusText: agentId === 'reciprocator' && total === 0
      ? `Scanning post comments for ${title || 'Reciprocator'}...`
      : (agentId === 'audience'
        ? `Opening Twitter List to discover top engaged posts...`
        : `Starting fresh ${title || 'Agent'} automation (${total || options.targetCount || 10} targets)...`)
  };

  await chrome.storage.local.remove('atomx_hud_dismissed').catch(() => null);
  await chrome.storage.local.set({
    atomx_agent_workflow: workflowState,
    atomx_workflow_paused: false,
    atomx_skip_current: false
  });
  await syncAgentHud(workflowState, workflowState.statusText, 'RUNNING', 5);

  chrome.alarms.clear('atomx_agent_workflow_step').catch(() => null);
  chrome.alarms.clear('atomx_agent_pacing').catch(() => null);
  chrome.alarms.create('atomx_keepalive', { delayInMinutes: 0.4 });
  setTimeout(() => processAgentWorkflowStep(), 300);

  sendResponse({ ok: true });
}

async function syncAgentHud(workflow, statusText, stateBadge = 'RUNNING', progressPercent = 0, countdownText = '', nextAction = '', timerBadge = '') {
  const { title, successCount = 0, ignoredCount = 0, total = 0, currentIndex = 0 } = workflow;
  const updated = {
    ...workflow,
    statusText,
    stateBadge,
    progressPercent,
    countdownText,
    nextAction,
    timerBadge
  };
  const activeHud = {
    title,
    stateBadge,
    indicator: `${currentIndex}/${total}`,
    done: successCount,
    collected: total,
    skipped: ignoredCount,
    progressPercent,
    statusText,
    countdownText,
    nextAction: nextAction || (stateBadge === 'DONE' ? 'Completed' : (stateBadge === 'STOPPED' ? 'Stopped' : (total > 0 && currentIndex < total ? `Target ${currentIndex + 1}/${total}` : 'Active'))),
    timerBadge: timerBadge || (countdownText ? countdownText.replace(/.*?(\d+:\d+|\d+s)/, '⏱️ $1') : '⚡ Active'),
    isStopped: stateBadge === 'STOPPED' || stateBadge === 'DONE',
    active: stateBadge !== 'STOPPED' && stateBadge !== 'DONE'
  };
  await chrome.storage.local.set({
    atomx_agent_workflow: updated,
    atomx_active_hud: activeHud
  }).catch(() => null);
  broadcastHudToTabs(activeHud);
}

async function processAgentWorkflowStep() {
  if (isAgentStepRunning) {
    console.log('[ATOMX BG] Agent workflow step already running. Preventing concurrent execution.');
    return;
  }
  isAgentStepRunning = true;
  const thisSession = currentWorkflowSessionId;

  try {
    const stored = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
    const workflow = stored?.atomx_agent_workflow;

    if (!workflow || !workflow.active || currentWorkflowSessionId !== thisSession) {
      console.log('[ATOMX BG] Agent workflow inactive or superseded, stopping.');
      return;
    }

  const { agentId, items = [], options = {}, currentIndex = 0, total = 0, successCount = 0, ignoredCount = 0 } = workflow;

  // =========================================================================
  // AGENT 13: COMMENTER RECIPROCATOR IN-THREAD SEQUENTIAL WORKFLOW ENGINE
  // 1. Opens post in reusable tab & checks account lock
  // 2. Smoothly scrolls into comments, finds first unliked comment
  // 3. Likes comment with virtual cursor, clicks avatar/handle to visit profile in SAME tab
  // 4. Follows (if enabled), scrolls to posts, likes posts (per Posts per Profile), scrolls back up to non-pinned post, comments/reposts
  // 5. Returns via browser back (chrome.tabs.goBack) to post, smoothly scrolls to next comment, repeats!
  // =========================================================================
  if (agentId === 'reciprocator') {
    if (!options.postUrl) {
      await finishAgentWorkflow(workflow);
      return;
    }

    const postUrl = options.postUrl;
    const targetCount = Number(options.maxCount || options.targetCount) || 10;
    const isAllFound = targetCount >= 999;
    const verifiedXHandle = options.verifiedXHandle || (await chrome.storage.local.get(['verifiedXHandle'])).verifiedXHandle;

    await syncAgentHud(workflow, `Opening post to reciprocate with commenters...`, 'SCANNING', 10);
    try {
      const tabId = await getOrCreateReusedTab(agentWorkflowWorkingTabId, postUrl);
      agentWorkflowWorkingTabId = tabId;
      await waitForTabLoad(tabId, 15000);
      await delay(2500);

      // Instant Account Lock Check
      const lockCheck = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
      if (!lockCheck.ok) return;

      const targetLimit = isAllFound ? Infinity : targetCount;

      while (((workflow.successCount || 0) + (workflow.ignoredCount || 0)) < targetLimit) {
        const stopChk = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_skip_current']).catch(() => ({}));
        if (stopChk?.atomx_agent_workflow?.isStopped || !stopChk?.atomx_agent_workflow?.active) return;

        if (stopChk?.atomx_skip_current) {
          await chrome.storage.local.set({ atomx_skip_current: false });
          workflow.ignoredCount = (workflow.ignoredCount || 0) + 1;
          workflow.currentIndex = (workflow.successCount || 0) + (workflow.ignoredCount || 0);
          await syncAgentHud(
            workflow,
            `[${workflow.currentIndex}/${isAllFound ? 'All' : targetCount}] ⏭️ Skipped comment. Finding next...`,
            'SCANNING',
            isAllFound ? 50 : Math.round((workflow.currentIndex / targetCount) * 100)
          );
          continue;
        }

        const curIdx = (workflow.successCount || 0) + (workflow.ignoredCount || 0) + 1;
        await syncAgentHud(
          workflow,
          `[${curIdx}/${isAllFound ? 'All' : targetCount}] Finding next unliked comment on your post...`,
          'SCANNING',
          isAllFound ? 50 : Math.round(((curIdx - 1) / targetCount) * 100)
        );

        const commentRes = await sendMessageToTab(tabId, {
          type: 'FIND_AND_LIKE_NEXT_UNPROCESSED_COMMENT',
          verifiedXHandle,
          mainAuthor: verifiedXHandle
        }, 45000);

        const stopChk2 = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (stopChk2?.atomx_agent_workflow?.isStopped || !stopChk2?.atomx_agent_workflow?.active) return;

        if (!commentRes || !commentRes.found) {
          console.log('[ATOMX BG] All comments on post processed or exhausted.');
          break; // Done with all found commenters!
        }

        const cleanHandle = commentRes.cleanHandle;
        const profileUrl = `https://x.com/${cleanHandle}`;

        await syncAgentHud(
          workflow,
          `[${curIdx}/${isAllFound ? 'All' : targetCount}] Liked comment by @${cleanHandle}! Visiting profile in same tab...`,
          'ENGAGING',
          isAllFound ? 60 : Math.round(((curIdx - 1) / targetCount) * 100)
        );

        // Visit commenter profile in the SAME tab!
        if (commentRes?.profileClicked) {
          // Profile link was clicked directly via virtual cursor in-app!
          // Wait for Twitter client-side router to mount profile without redundant full reload
          console.log(`[ATOMX BG] Profile link was clicked via virtual cursor. Waiting for in-app navigation to @${cleanHandle}...`);
          let inAppDone = false;
          for (let w = 0; w < 12; w++) {
            await delay(350);
            try {
              const curTab = await chrome.tabs.get(tabId);
              const path = new URL(curTab.url).pathname.toLowerCase().replace(/^\//, '').split('/')[0];
              if (path === cleanHandle.toLowerCase()) {
                inAppDone = true;
                break;
              }
            } catch (e) {}
          }
          if (!inAppDone) {
            console.warn(`[ATOMX BG] In-app navigation fallback to URL load.`);
            await getOrCreateReusedTab(tabId, profileUrl);
            await waitForTabLoad(tabId, 12000);
          } else {
            await delay(1800); // Allow profile page components to mount smoothly
          }
        } else {
          await getOrCreateReusedTab(tabId, profileUrl);
          await waitForTabLoad(tabId, 15000);
          await delay(2500);
        }

        const lockCheck2 = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
        if (!lockCheck2.ok) return;

        // Engage on commenter profile with user-selected actions:
        // follow, like, comment, repost, and postsCount!
        const engageRes = await sendMessageToTab(tabId, {
          type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
          handle: cleanHandle,
          likePosts: options.likePosts !== false && options.likeRecent !== false,
          replyPosts: options.replyPosts !== false && options.commentRecent !== false,
          repostPosts: options.repostPosts === true,
          followPosts: options.followPosts === true || options.followUser === true,
          postsCount: options.postsCount || options.postsPerProfile || 'random',
          style: options.style || 'Bullish (5-10 words)',
          stylePrompt: options.stylePrompt || null,
          backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
          verifiedXHandle
        }, 65000);

        const stopChk3 = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (stopChk3?.atomx_agent_workflow?.isStopped || !stopChk3?.atomx_agent_workflow?.active) return;

        const isIgnored = engageRes?.ignored || engageRes?.skipped || engageRes?.alreadyDone;
        const isSuccess = Boolean(engageRes?.success && !isIgnored);

        if (isSuccess) {
          workflow.successCount = (workflow.successCount || 0) + 1;
          chrome.storage.local.get(['credits'], (c) => {
            const curCredits = c?.credits || 0;
            if (curCredits > 0) chrome.storage.local.set({ credits: curCredits - 1 });
          });
        } else {
          const curWf = (await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({})))?.atomx_agent_workflow;
          workflow.ignoredCount = Math.max((workflow.ignoredCount || 0) + 1, curWf?.ignoredCount || 0);
        }

        // Clear skip flag
        await chrome.storage.local.set({ atomx_skip_current: false });

        // Record history so this commenter is tracked
        chrome.storage.local.get(['atomx_reciprocated_commenters', 'atomx_audience_engaged_history'], (r) => {
          const recip = Array.isArray(r?.atomx_reciprocated_commenters) ? r.atomx_reciprocated_commenters : [];
          if (!recip.includes(cleanHandle)) recip.push(cleanHandle);
          const hist = (r?.atomx_audience_engaged_history && typeof r.atomx_audience_engaged_history === 'object') ? r.atomx_audience_engaged_history : {};
          hist[cleanHandle.toLowerCase()] = Date.now();
          chrome.storage.local.set({ atomx_reciprocated_commenters: recip, atomx_audience_engaged_history: hist }).catch(() => null);
        });

        const currentTotalDone = (workflow.successCount || 0) + (workflow.ignoredCount || 0);
        workflow.currentIndex = currentTotalDone;
        workflow.total = isAllFound ? currentTotalDone + 1 : targetCount;
        await chrome.storage.local.set({ atomx_agent_workflow: workflow });

        await syncAgentHud(
          workflow,
          isIgnored
            ? `[${workflow.successCount}/${isAllFound ? currentTotalDone : targetCount}] ⏭️ Skipped @${cleanHandle}! Returning back to post in same tab...`
            : `[${workflow.successCount}/${isAllFound ? currentTotalDone : targetCount}] ✓ Reciprocated @${cleanHandle}! Returning back to post in same tab...`,
          'ENGAGING',
          isAllFound ? 70 : Math.round((currentTotalDone / targetCount) * 100)
        );

        // Return back to post in the EXACT SAME tab!
        await chrome.tabs.goBack(tabId).catch(() => null);
        await delay(1500);
        try {
          const curTab = await chrome.tabs.get(tabId);
          if (!curTab?.url || !curTab.url.includes('/status/')) {
            await getOrCreateReusedTab(tabId, postUrl);
            await waitForTabLoad(tabId, 12000);
          }
        } catch (e) {}
        await delay(2500);

        if (!isIgnored) {
          const safetyRes = await chrome.storage.local.get(['atomx_safety_settings']).catch(() => ({}));
          const profileWait = Number(safetyRes?.atomx_safety_settings?.profileWait) || 15;
          const delaySec = Math.max(5, profileWait + Math.floor(Math.random() * 5 - 2));
          await scheduleAgentPacingCountdown(delaySec, workflow, workflow.successCount, isAllFound ? currentTotalDone : targetCount, `Next commenter from your post`);
        }
      }

      workflow.active = false;
      await syncAgentHud(workflow, `✓ Reciprocation complete! Engaged ${workflow.successCount || 0} commenters.`, 'DONE', 100);
      await finishAgentWorkflow(workflow);
      return;
    } catch (err) {
      console.warn('[ATOMX BG] Error in reciprocator workflow:', err);
      agentWorkflowWorkingTabId = null;
      await finishAgentWorkflow(workflow);
      return;
    }
  }

  // Dynamic live scan phase (Followers Increase, Sorsa Booster custom list, Audience Builder custom list)
  // =========================================================================
  // AGENT 4: FOLLOWERS INCREASE (Autonomous direct timeline engagement on List's recent posts)
  // Opens list timeline / search query feed and directly engages on cards from top down.
  // =========================================================================
  // AGENT 4: FOLLOWERS INCREASE
  // MODE A: "Newest Tweet First" -> Direct top-down engagement on list timeline (no scan)
  // MODE B: "Most Active" -> Scans list within timeframe, ranks by replies/engagement, queues top posts
  // =========================================================================
  if (agentId === 'followers' && (!items || items.length === 0)) {
    const listId = options.listId;
    const isNewestFirst = (options.sortPriority === 'recent');
    const targetCount = Number(options.targetCount) || 8;
    const verifiedXHandle = options.verifiedXHandle || (await chrome.storage.local.get(['verifiedXHandle'])).verifiedXHandle;

    // ─────────────────────────────────────────────────────────────────────
    // BRANCH A: "NEWEST TWEET FIRST" (Sequential Top-Down Engagement on Timeline)
    // ─────────────────────────────────────────────────────────────────────
    if (isNewestFirst) {
      const searchUrl = (options.searchFeedUrl || (listId ? `https://x.com/search?q=${encodeURIComponent(`list:${listId} lang:en -filter:retweets -filter:replies exclude:replies`)}&f=live` : null));
      const canonicalListUrl = options.targetListUrl || (listId ? `https://x.com/i/lists/${listId}` : null);
      const primaryFeedUrl = searchUrl || canonicalListUrl || options.feedUrl || 'https://x.com';

      await syncAgentHud(workflow, `Opening Twitter feed for newest posts...`, 'ENGAGING', 10);
      try {
        const tabId = await getOrCreateReusedTab(agentWorkflowWorkingTabId, primaryFeedUrl);
        agentWorkflowWorkingTabId = tabId;
        await waitForTabLoad(tabId, 15000);
        await delay(3000);

        const lockCheck = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
        if (!lockCheck.ok) return;

        const stopCheck = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (stopCheck?.atomx_agent_workflow?.isStopped || !stopCheck?.atomx_agent_workflow?.active) return;

        await syncAgentHud(workflow, `Engaging on list timeline directly from top downwards...`, 'ENGAGING', 15);

        const cycleRes = await sendMessageToTab(tabId, {
          type: 'EXECUTE_FOLLOWERS_LIST_CYCLE',
          targetCount,
          freshness: options.freshness || '1h',
          sortPriority: 'recent',
          likePosts: options.likePosts !== false,
          replyPosts: options.replyPosts !== false,
          repostPosts: options.repostPosts === true,
          autoFollow: options.autoFollow !== false,
          style: options.style || 'Natural & Concise',
          stylePrompt: options.stylePrompt || null,
          backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
          verifiedXHandle
        }, 600000);

        const chk = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (chk?.atomx_agent_workflow?.isStopped || !chk?.atomx_agent_workflow?.active) return;

        const engaged = cycleRes?.engagedCount || 0;
        const skipped = cycleRes?.skippedCount || 0;

        if (engaged > 0) {
          const credData = await chrome.storage.local.get(['credits']).catch(() => ({}));
          const newCredits = Math.max(0, (credData.credits || 0) - engaged);
          await chrome.storage.local.set({ credits: newCredits }).catch(() => null);
        }

        const finishedWf = {
          ...workflow,
          active: false,
          isStopped: true,
          currentIndex: engaged,
          total: targetCount,
          successCount: engaged,
          ignoredCount: skipped,
          stateBadge: 'DONE',
          statusText: `✓ Followers Increase complete! ${engaged} posts engaged directly on timeline (${skipped} skipped).`
        };
        await chrome.storage.local.set({ atomx_agent_workflow: finishedWf });
        await syncAgentHud(finishedWf, finishedWf.statusText, 'DONE', 100);
        await finishAgentWorkflow(finishedWf);
        return;
      } catch (fErr) {
        console.warn('[ATOMX BG] Error in Followers Increase Newest cycle:', fErr);
        agentWorkflowWorkingTabId = null;
        await finishAgentWorkflow(workflow);
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // BRANCH B: "MOST ACTIVE" (Scan within timeframe, rank by replies, queue top posts)
    // ─────────────────────────────────────────────────────────────────────
    else {
      const searchUrl = (options.searchFeedUrl || (listId ? `https://x.com/search?q=${encodeURIComponent(`list:${listId} lang:en -filter:retweets -filter:replies exclude:replies`)}&f=live` : null));
      const canonicalListUrl = options.targetListUrl || (listId ? `https://x.com/i/lists/${listId}` : (options.feedUrl || 'https://x.com'));
      const primaryFeedUrl = searchUrl || canonicalListUrl;

      await syncAgentHud(workflow, `Opening filtered search feed for top active posts (${options.freshness || '1h'})...`, 'SCANNING', 10);
      try {
        const tabId = await getOrCreateReusedTab(agentWorkflowWorkingTabId, primaryFeedUrl);
        agentWorkflowWorkingTabId = tabId;
        await waitForTabLoad(tabId, 15000);
        await delay(3000);

        const lockCheck = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
        if (!lockCheck.ok) return;

        const discRes = await sendMessageToTab(tabId, {
          type: 'DISCOVER_TOP_ACTIVE_LIST_TWEETS',
          targetCount,
          freshness: options.freshness || '1h',
          sortPriority: 'active',
          verifiedXHandle
        }, 300000);

        // Immediate stop check after scan
        const stopCheck = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (stopCheck?.atomx_agent_workflow?.isStopped || !stopCheck?.atomx_agent_workflow?.active) return;

        const topTweets = Array.isArray(discRes?.topTweets) ? discRes.topTweets : [];

        if (topTweets.length === 0) {
          workflow.active = false;
          workflow.successCount = 0;
          workflow.total = targetCount;
          await syncAgentHud(workflow, `No unengaged posts found in selected timeframe (${options.freshness || '1h'}).`, 'DONE', 100);
          await finishAgentWorkflow(workflow);
          return;
        }

        // Populate workflow queue with top active posts sorted by replies
        const workflowItems = topTweets.slice(0, targetCount).map(t => ({
          tweetUrl: t.tweetUrl,
          tweetId: t.tweetId,
          targetHandle: t.authorHandle,
          authorHandle: t.authorHandle,
          authorName: t.authorName,
          text: t.text,
          repliesCount: t.repliesCount
        }));

        const updatedWorkflow = {
          ...workflow,
          items: workflowItems,
          total: workflowItems.length,
          targetCount,
          currentIndex: 0,
          successCount: 0,
          ignoredCount: discRes?.skippedCount || 0,
          statusText: `Selected top ${workflowItems.length} most active posts. Engaging individually...`
        };
        await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
        await syncAgentHud(updatedWorkflow, updatedWorkflow.statusText, 'ENGAGING', 20);
        setTimeout(() => processAgentWorkflowStep(), 800);
        return;
      } catch (aErr) {
        console.warn('[ATOMX BG] Error in Followers Most Active scan:', aErr);
        await finishAgentWorkflow(workflow);
        return;
      }
    }
  }

  // =========================================================================
  // AGENT 1: AUDIENCE BUILDER (In-Thread Single-Tab Comment Loop)
  // 1. Opens list to discover top engaged post(s)
  // 2. Navigates to top post in SAME tab
  // 3. Inspects comments directly: likes comment to track, clicks profile in SAME tab,
  //    engages, goes back in SAME tab, repeats for next comment!
  // =========================================================================
  if (agentId === 'audience') {
    const listId = options.listId;
    const searchUrl = options.searchFeedUrl || (listId ? `https://x.com/search?q=${encodeURIComponent(`list:${listId} lang:en -filter:retweets -filter:replies exclude:replies`)}&f=live` : null);
    const canonicalListUrl = options.targetListUrl || (listId ? `https://x.com/i/lists/${listId}` : null);
    const primaryFeedUrl = searchUrl || canonicalListUrl || options.feedUrl || 'https://x.com';
    const targetCount = Number(options.targetCount) || 10;
    const verifiedXHandle = options.verifiedXHandle || (await chrome.storage.local.get(['verifiedXHandle'])).verifiedXHandle;

    await syncAgentHud(workflow, `Opening Twitter List to discover top engaged posts...`, 'SCANNING', 10);
    try {
      const tabId = await getOrCreateReusedTab(agentWorkflowWorkingTabId, primaryFeedUrl);
      agentWorkflowWorkingTabId = tabId;
      await waitForTabLoad(tabId, 15000);
      await delay(3000);

      const lockCheck = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
      if (!lockCheck.ok) return;

      // Discover candidate top engaged tweets with replies
      let topTweetsRes = await sendMessageToTab(tabId, {
        type: 'DISCOVER_TOP_ENGAGED_LIST_TWEETS',
        freshness: options.freshness || '2h',
        targetCount
      }, 60000);

      let topTweets = Array.isArray(topTweetsRes?.topTweets) ? topTweetsRes.topTweets : [];
      if (topTweets.length === 0 && options.searchFeedUrl && options.searchFeedUrl !== primaryFeedUrl) {
        await getOrCreateReusedTab(tabId, options.searchFeedUrl);
        await waitForTabLoad(tabId, 15000);
        await delay(3000);
        topTweetsRes = await sendMessageToTab(tabId, {
          type: 'DISCOVER_TOP_ENGAGED_LIST_TWEETS',
          freshness: options.freshness || '2h',
          targetCount
        }, 60000);
        topTweets = Array.isArray(topTweetsRes?.topTweets) ? topTweetsRes.topTweets : [];
      }

      if (topTweets.length === 0) {
        workflow.active = false;
        await syncAgentHud(workflow, `No active posts found in selected timeframe (${options.freshness || '2h'}).`, 'DONE', 100);
        await finishAgentWorkflow(workflow);
        return;
      }

      // Loop through candidate top posts, inspecting their comment sections directly in-thread
      for (const t of topTweets) {
        if ((workflow.successCount || 0) >= targetCount) break;
        if (!t.url) continue;

        const chk = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
        if (chk?.atomx_agent_workflow?.isStopped || !chk?.atomx_agent_workflow?.active) return;

        const mainAuthor = (t.author || '').toLowerCase().replace(/^@/, '').trim();
        await syncAgentHud(workflow, `Navigating to post by @${mainAuthor || 'creator'} to inspect comments...`, 'SCANNING', Math.round(((workflow.successCount || 0) / targetCount) * 100));

        // Visibly move virtual cursor to top post on the page and click to enter!
        const clickPostRes = await sendMessageToTab(tabId, {
          type: 'CLICK_AND_OPEN_TARGET_POST',
          postUrl: t.url,
          author: mainAuthor
        }, 5000).catch(() => null);

        if (!clickPostRes || !clickPostRes.clicked) {
          // Fallback tab navigation if not clicked via DOM
          await getOrCreateReusedTab(tabId, t.url);
        }
        await waitForTabLoad(tabId, 15000);
        await delay(2500);

        // Inside this post: iteratively find unliked comment -> like comment -> visit profile in same tab -> engage -> go back -> repeat
        while ((workflow.successCount || 0) < targetCount) {
          const stopChk = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_skip_current']).catch(() => ({}));
          if (stopChk?.atomx_agent_workflow?.isStopped || !stopChk?.atomx_agent_workflow?.active) return;

          if (stopChk?.atomx_skip_current) {
            await chrome.storage.local.set({ atomx_skip_current: false });
            workflow.ignoredCount = (workflow.ignoredCount || 0) + 1;
            workflow.currentIndex = (workflow.successCount || 0) + (workflow.ignoredCount || 0);
            await syncAgentHud(
              workflow,
              `[${(workflow.successCount || 0) + 1}/${targetCount}] ⏭️ Skipped current item. Finding next...`,
              'SCANNING',
              Math.round(((workflow.successCount || 0) / targetCount) * 100)
            );
            continue;
          }

          await syncAgentHud(
            workflow,
            `[${(workflow.successCount || 0) + 1}/${targetCount}] Finding next unliked comment on post by @${mainAuthor || 'creator'}...`,
            'SCANNING',
            Math.round(((workflow.successCount || 0) / targetCount) * 100)
          );

          const commentRes = await sendMessageToTab(tabId, {
            type: 'FIND_AND_LIKE_NEXT_UNPROCESSED_COMMENT',
            verifiedXHandle,
            mainAuthor
          }, 45000);

          const stopChk2 = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
          if (stopChk2?.atomx_agent_workflow?.isStopped || !stopChk2?.atomx_agent_workflow?.active) return;

          if (!commentRes || !commentRes.found) {
            console.log(`[ATOMX BG] Comments exhausted or completed on post by @${mainAuthor}. Moving to next top post.`);
            const skipAfterFind = await chrome.storage.local.get(['atomx_skip_current']).catch(() => ({}));
            if (skipAfterFind?.atomx_skip_current) {
              await chrome.storage.local.set({ atomx_skip_current: false });
              workflow.ignoredCount = (workflow.ignoredCount || 0) + 1;
              workflow.currentIndex = (workflow.successCount || 0) + (workflow.ignoredCount || 0);
              await syncAgentHud(
                workflow,
                `[${workflow.successCount || 0}/${targetCount}] ⏭️ Skipped comment scan. Moving to next top post...`,
                'SCANNING',
                Math.round(((workflow.successCount || 0) / targetCount) * 100)
              );
            }
            break; // Move to next post in topTweets
          }

          const cleanHandle = commentRes.cleanHandle;
          const profileUrl = `https://x.com/${cleanHandle}`;

          await syncAgentHud(
            workflow,
            `[${(workflow.successCount || 0) + 1}/${targetCount}] Liked comment by @${cleanHandle}! Visiting profile in same tab...`,
            'ENGAGING',
            Math.round(((workflow.successCount || 0) / targetCount) * 100)
          );

          // Visit commenter profile in the SAME tab!
          if (commentRes?.profileClicked) {
            console.log(`[ATOMX BG] Profile was clicked via virtual cursor. Waiting for in-app navigation to @${cleanHandle}...`);
            let inAppDone = false;
            for (let w = 0; w < 12; w++) {
              await delay(350);
              try {
                const curTab = await chrome.tabs.get(tabId);
                const path = new URL(curTab.url).pathname.toLowerCase().replace(/^\//, '').split('/')[0];
                if (path === cleanHandle.toLowerCase()) {
                  inAppDone = true;
                  break;
                }
              } catch (e) {}
            }
            if (!inAppDone) {
              console.warn(`[ATOMX BG] In-app navigation fallback to URL load.`);
              await getOrCreateReusedTab(tabId, profileUrl);
              await waitForTabLoad(tabId, 12000);
            } else {
              await delay(1800); // Allow profile page components to mount smoothly
            }
          } else {
            await getOrCreateReusedTab(tabId, profileUrl);
            await waitForTabLoad(tabId, 15000);
            await delay(2500);
          }

          const lockCheck2 = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
          if (!lockCheck2.ok) return;

          // Engage on commenter profile
          const engageRes = await sendMessageToTab(tabId, {
            type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
            handle: cleanHandle,
            likePosts: options.likePosts !== false,
            replyPosts: options.replyPosts !== false,
            repostPosts: options.repostPosts === true,
            followPosts: options.autoFollow !== false,
            postsCount: options.postsCount || options.postsPerProfile || 'random',
            style: options.style || 'Bullish (5-10 words)',
            stylePrompt: options.stylePrompt || null,
            backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
            verifiedXHandle
          }, 65000);

          const stopChk3 = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
          if (stopChk3?.atomx_agent_workflow?.isStopped || !stopChk3?.atomx_agent_workflow?.active) return;

          const isIgnored = engageRes?.ignored || engageRes?.skipped || engageRes?.alreadyDone;
          const isSuccess = Boolean(engageRes?.success && !isIgnored);

          if (isSuccess) {
            workflow.successCount = (workflow.successCount || 0) + 1;
            chrome.storage.local.get(['credits'], (c) => {
              const curCredits = c?.credits || 0;
              if (curCredits > 0) chrome.storage.local.set({ credits: curCredits - 1 });
            });
          } else {
            const curWf = (await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({})))?.atomx_agent_workflow;
            workflow.ignoredCount = Math.max((workflow.ignoredCount || 0) + 1, curWf?.ignoredCount || 0);
          }

          // Clear skip flag
          await chrome.storage.local.set({ atomx_skip_current: false });

          // Persist history so commenter isn't targeted again within 24h
          chrome.storage.local.get(['atomx_audience_engaged_history'], (r) => {
            const hist = (r?.atomx_audience_engaged_history && typeof r.atomx_audience_engaged_history === 'object') ? r.atomx_audience_engaged_history : {};
            hist[cleanHandle.toLowerCase()] = Date.now();
            chrome.storage.local.set({ atomx_audience_engaged_history: hist }).catch(() => null);
          });

          // Accurately compute currentIndex = successCount + ignoredCount
          workflow.currentIndex = (workflow.successCount || 0) + (workflow.ignoredCount || 0);
          workflow.total = targetCount;
          await chrome.storage.local.set({ atomx_agent_workflow: workflow });

          await syncAgentHud(
            workflow,
            isIgnored
              ? `[${workflow.successCount}/${targetCount}] ⏭️ Skipped @${cleanHandle}! Returning back to post in same tab...`
              : `[${workflow.successCount}/${targetCount}] ✓ Engaged @${cleanHandle}! Returning back to post in same tab...`,
            'ENGAGING',
            Math.round(((workflow.successCount || 0) / targetCount) * 100)
          );

          // Return back to post in the EXACT SAME tab!
          await chrome.tabs.goBack(tabId).catch(() => null);
          await delay(1500);
          try {
            const curTab = await chrome.tabs.get(tabId);
            if (!curTab?.url || !curTab.url.includes('/status/')) {
              await getOrCreateReusedTab(tabId, t.url);
              await waitForTabLoad(tabId, 12000);
            }
          } catch (e) {}
          await delay(2500);

          if ((workflow.successCount || 0) >= targetCount) break;

          // Natural pacing delay countdown before next comment (bypassed if skipped)
          if (!isIgnored) {
            const safetyRes = await chrome.storage.local.get(['atomx_safety_settings']).catch(() => ({}));
            const profileWait = Number(safetyRes?.atomx_safety_settings?.profileWait) || 15;
            const delaySec = Math.max(5, profileWait + Math.floor(Math.random() * 5 - 2));
            await scheduleAgentPacingCountdown(delaySec, workflow, workflow.successCount, targetCount, `Next commenter from post`);
          }
        }
      }

      await finishAgentWorkflow(workflow);
      return;
    } catch (auditErr) {
      console.warn('[ATOMX BG] Error in Audience Builder cycle:', auditErr);
      await finishAgentWorkflow(workflow);
      return;
    }
  }

  if (currentIndex >= total) {
    await finishAgentWorkflow(workflow);
    return;
  }

  const item = items[currentIndex];
  const targetHandle = (item.cleanHandle || item.handle || '').replace(/^@/, '').trim();
  const indexStr = `[${currentIndex + 1}/${total}]`;

  const displayTarget = item.authorHandle ? `@${item.authorHandle}` : (targetHandle ? `@${targetHandle}` : 'target');
  await syncAgentHud(
    workflow,
    `${indexStr} Visiting ${displayTarget}...`,
    'ENGAGING',
    Math.round((currentIndex / total) * 100)
  );

  try {
    let targetUrl = '';
    let messagePayload = null;
    let timeoutMs = 45000;

    if (agentId === 'followers') {
      targetUrl = item.tweetUrl;
      messagePayload = {
        type: 'EXECUTE_AUTONOMOUS_ENGAGEMENT',
        tweetUrl: item.tweetUrl,
        tweetId: item.tweetId,
        authorHandle: item.authorHandle,
        actions: {
          like: options.likePosts !== false,
          comment: options.replyPosts !== false,
          repost: options.repostPosts === true,
          follow: options.autoFollow !== false,
          scroll: true
        },
        style: options.style || 'Natural & Concise',
        stylePrompt: options.stylePrompt || null,
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
        verifiedXHandle: options.verifiedXHandle
      };
      timeoutMs = 65000;
    } else if (agentId === 'replyback') {
      targetUrl = item.tweetUrl || options.tweetUrl;
      messagePayload = {
        type: 'EXECUTE_REPLY_BACK_CYCLE',
        maxComments: options.maxReplies || options.maxComments || 10,
        delaySec: options.delaySec || 12,
        autoLike: options.autoLike !== false,
        style: options.style || 'Natural & Concise',
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
        verifiedXHandle: options.verifiedXHandle
      };
      timeoutMs = 180000; // 3 minutes timeout for multiple replies with delaySec
    } else if (agentId === 'reciprocator') {
      targetUrl = `https://x.com/${targetHandle}`;
      messagePayload = {
        type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
        handle: targetHandle,
        likePosts: options.likePosts !== false && options.likeRecent !== false,
        replyPosts: options.replyPosts !== false && options.commentRecent !== false,
        repostPosts: options.repostPosts === true,
        followPosts: options.followPosts === true || options.followUser === true,
        postsCount: options.postsCount || options.postsPerProfile || 'random',
        style: options.style || 'Bullish (5-10 words)',
        stylePrompt: options.stylePrompt || null,
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
        verifiedXHandle: options.verifiedXHandle
      };
      timeoutMs = 45000;
    } else {
      // audience, sorsa
      targetUrl = `https://x.com/${targetHandle}`;
      const shouldFollow = options.autoFollow !== undefined ? Boolean(options.autoFollow) : (options.followPosts !== false);
      messagePayload = {
        type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
        handle: targetHandle,
        likePosts: options.likePosts !== false,
        replyPosts: options.replyPosts !== false,
        repostPosts: options.repostPosts === true,
        followPosts: shouldFollow,
        autoUnfollow: options.autoUnfollow === true,
        postsCount: options.postsCount || options.postsPerProfile || 'random',
        style: options.style || 'Bullish (5-10 words)',
        stylePrompt: options.stylePrompt || null,
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL,
        verifiedXHandle: options.verifiedXHandle
      };
      timeoutMs = 90000;
    }

    if (agentWorkflowWorkingTabId) {
      await sendMessageToTab(agentWorkflowWorkingTabId, { type: 'CLEANUP_DRAFTS_BEFORE_NAV' }, 1500).catch(() => null);
    }

    const tabId = await getOrCreateReusedTab(agentWorkflowWorkingTabId, targetUrl);
    agentWorkflowWorkingTabId = tabId;

    await waitForTabLoad(tabId, 12000);

    // Instant skip check right after tab load
    const skipCheckLoad = await chrome.storage.local.get(['atomx_skip_current']).catch(() => ({}));
    if (skipCheckLoad?.atomx_skip_current) {
      await chrome.storage.local.set({ atomx_skip_current: false });
      console.log(`[ATOMX BG] Target @${targetHandle} skipped on 1st click during tab load.`);
      const updatedWorkflow = {
        ...workflow,
        currentIndex: currentIndex + 1,
        ignoredCount: ignoredCount + 1
      };
      await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
      await syncAgentHud(updatedWorkflow, `${indexStr} Skipped ${displayTarget} (skipped by user)`, 'SKIPPED', Math.round(((currentIndex + 1) / total) * 100));
      setTimeout(() => processAgentWorkflowStep(), 100);
      return;
    }

    await delay(2500);

    // Instant Account Lock Check before executing task
    const verifiedXHandle = options.verifiedXHandle || (await chrome.storage.local.get(['verifiedXHandle'])).verifiedXHandle;
    const lockCheck = await verifyTabAccountLock(tabId, verifiedXHandle, workflow);
    if (!lockCheck.ok) return;

    const recheck = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_skip_current']).catch(() => ({}));
    if (!recheck?.atomx_agent_workflow?.active) {
      return;
    }

    if (recheck?.atomx_skip_current) {
      await chrome.storage.local.set({ atomx_skip_current: false });
      console.log(`[ATOMX BG] Target @${targetHandle} skipped on 1st click before message dispatch.`);
      const updatedWorkflow = {
        ...workflow,
        currentIndex: currentIndex + 1,
        ignoredCount: ignoredCount + 1
      };
      await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
      await syncAgentHud(updatedWorkflow, `${indexStr} Skipped ${displayTarget} (skipped by user)`, 'SKIPPED', Math.round(((currentIndex + 1) / total) * 100));
      setTimeout(() => processAgentWorkflowStep(), 100);
      return;
    }

    const result = await sendMessageToTab(tabId, messagePayload, timeoutMs);
    // Keep agentWorkflowWorkingTabId open so subsequent accounts/profiles reuse the exact same tab/window!

    // Verify if workflow was stopped during step execution
    const recheckAfter = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
    if (!recheckAfter?.atomx_agent_workflow?.active || recheckAfter?.atomx_agent_workflow?.isStopped) {
      console.log('[ATOMX BG] Workflow stopped while waiting for tab execution. Halting loop.');
      return;
    }
    const isSuccess = Boolean(result?.success);
    const isIgnored = Boolean(result?.ignored || result?.skipped || result?.alreadyDone);
    const newSuccess = isSuccess && !isIgnored ? successCount + 1 : successCount;
    const newIgnored = isIgnored || !isSuccess ? ignoredCount + 1 : ignoredCount;

    if (isSuccess && !isIgnored) {
      chrome.storage.local.get(['credits'], (c) => {
        const curCredits = c?.credits || 0;
        if (curCredits > 0) chrome.storage.local.set({ credits: curCredits - 1 });
      });

      if (agentId === 'reciprocator' && targetHandle) {
        chrome.storage.local.get(['atomx_reciprocated_commenters'], (r) => {
          const list = Array.isArray(r?.atomx_reciprocated_commenters) ? r.atomx_reciprocated_commenters : [];
          list.push(targetHandle);
          chrome.storage.local.set({ atomx_reciprocated_commenters: list }).catch(() => null);
        });
      }

      if (agentId === 'followers' && item.tweetId) {
        chrome.storage.local.get(['atomx_follower_engaged_tweets', 'atomx_follower_engaged_history'], (r) => {
          const tweets = (r?.atomx_follower_engaged_tweets && typeof r.atomx_follower_engaged_tweets === 'object') ? r.atomx_follower_engaged_tweets : {};
          const authors = (r?.atomx_follower_engaged_history && typeof r.atomx_follower_engaged_history === 'object') ? r.atomx_follower_engaged_history : {};
          tweets[item.tweetId] = Date.now();
          if (item.authorHandle) authors[item.authorHandle.toLowerCase()] = Date.now();
          chrome.storage.local.set({ atomx_follower_engaged_tweets: tweets, atomx_follower_engaged_history: authors }).catch(() => null);
        });
      }
    }

    // Always record visited timestamp for cool-off and deduplication across all visits
    if (targetHandle) {
      const lower = targetHandle.toLowerCase();
      if (agentId === 'sorsa') {
        chrome.storage.local.get(['atomx_sorsa_engaged_history'], (r) => {
          const history = (r?.atomx_sorsa_engaged_history && typeof r.atomx_sorsa_engaged_history === 'object') ? r.atomx_sorsa_engaged_history : {};
          history[lower] = Date.now();
          chrome.storage.local.set({ atomx_sorsa_engaged_history: history }).catch(() => null);
        });
      } else if (agentId === 'audience') {
        chrome.storage.local.get(['atomx_audience_engaged_history'], (r) => {
          const history = (r?.atomx_audience_engaged_history && typeof r.atomx_audience_engaged_history === 'object') ? r.atomx_audience_engaged_history : {};
          history[lower] = Date.now();
          chrome.storage.local.set({ atomx_audience_engaged_history: history }).catch(() => null);
        });
      } else if (agentId === 'followers') {
        chrome.storage.local.get(['atomx_follower_engaged_history'], (r) => {
          const history = (r?.atomx_follower_engaged_history && typeof r.atomx_follower_engaged_history === 'object') ? r.atomx_follower_engaged_history : {};
          history[lower] = Date.now();
          chrome.storage.local.set({ atomx_follower_engaged_history: history }).catch(() => null);
        });
      }
    }

    const updatedWorkflow = {
      ...workflow,
      currentIndex: currentIndex + 1,
      successCount: newSuccess,
      ignoredCount: newIgnored
    };
    await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });

    const statusLabel = isIgnored
      ? `${indexStr} Skipped ${displayTarget} (${result?.reason || 'already engaged'})`
      : `${indexStr} ✓ Engaged ${displayTarget}`;

    const targetGoal = Number(options.targetCount || workflow.targetCount || total);
    const targetReached = (targetGoal > 0) ? (newSuccess >= targetGoal) : (updatedWorkflow.currentIndex >= total);
    const progressPct = targetGoal > 0 ? Math.min(100, Math.round((newSuccess / targetGoal) * 100)) : Math.round(((currentIndex + 1) / total) * 100);

    await syncAgentHud(updatedWorkflow, statusLabel, 'ENGAGING', progressPct);

    if (!targetReached && updatedWorkflow.currentIndex < updatedWorkflow.items.length) {
      // Read centralized Anti-Ban Safety controls
      const safetyRes = await chrome.storage.local.get(['atomx_safety_settings']).catch(() => ({}));
      const safety = safetyRes?.atomx_safety_settings || {};
      const profileWait = Number(safety.profileWait) || Number(options.delaySec) || 20;
      const restDurationMin = Number(safety.restDuration) || 5;

      const nextIdx = updatedWorkflow.currentIndex;
      // Automatic Batching: if total > 10, rest after every batch of 5
      if (total > 10 && nextIdx % 5 === 0) {
        const restSec = restDurationMin * 60;
        await scheduleAgentPacingCountdown(restSec, updatedWorkflow, nextIdx, total, `Batch of 5 complete. Resting ${restDurationMin}m...`);
      } else if (agentId === 'followers' && Date.now() - (workflow.startedAt || 0) > 2 * 3600 * 1000) {
        // Followers Increase: 30m recovery pause after 2 hours
        await scheduleAgentPacingCountdown(30 * 60, updatedWorkflow, nextIdx, total, `Natural Schedule: 30m recovery pause after 2 hours...`);
      } else if (agentId === 'followers' && Date.now() - (workflow.startedAt || 0) > 30 * 60 * 1000 && !workflow.had30mBreak) {
        // Followers Increase: 12m rest break every 30 mins
        workflow.had30mBreak = true;
        await chrome.storage.local.set({ atomx_agent_workflow: workflow });
        await scheduleAgentPacingCountdown(12 * 60, updatedWorkflow, nextIdx, total, `Natural Schedule: 12m rest pause after 30 mins...`);
      } else {
        const delaySec = Math.max(5, profileWait + Math.floor(Math.random() * 6 - 3));
        await scheduleAgentPacingCountdown(delaySec, updatedWorkflow, nextIdx, total);
      }
    } else {
      await finishAgentWorkflow(updatedWorkflow);
    }

  } catch (err) {
    console.warn(`[ATOMX BG] Agent workflow error on @${targetHandle}:`, err);
    if (targetHandle) {
      const lower = targetHandle.toLowerCase();
      const historyKey = agentId === 'sorsa' ? 'atomx_sorsa_engaged_history'
        : agentId === 'followers' ? 'atomx_follower_engaged_history'
        : agentId === 'audience' ? 'atomx_audience_engaged_history' : null;
      if (historyKey) {
        chrome.storage.local.get([historyKey], (r) => {
          const hist = (r?.[historyKey] && typeof r[historyKey] === 'object') ? r[historyKey] : {};
          hist[lower] = Date.now();
          chrome.storage.local.set({ [historyKey]: hist }).catch(() => null);
        });
      }
    }
    const updatedWorkflow = { ...workflow, currentIndex: currentIndex + 1, ignoredCount: ignoredCount + 1 };
    await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
    if (updatedWorkflow.currentIndex < total) {
      const delaySec = Math.max(4, Math.min(options.delaySec || 12, 12));
      await scheduleAgentPacingCountdown(delaySec, updatedWorkflow, currentIndex + 1, total, 'Safety delay recovering before next target');
    } else {
      await finishAgentWorkflow(updatedWorkflow);
    }
  }
} finally {
  isAgentStepRunning = false;
}
}

async function scheduleAgentPacingCountdown(delaySec, workflow, completedIndex, total, nextActionText = '') {
  const pacingSession = currentWorkflowSessionId;
  for (let sec = delaySec; sec > 0; sec--) {
    if (currentWorkflowSessionId !== pacingSession) return;
    let recheck = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_workflow_paused', 'atomx_skip_current']).catch(() => ({}));
    if (!recheck?.atomx_agent_workflow?.active || recheck?.atomx_agent_workflow?.isStopped) return;

    if (recheck?.atomx_skip_current) {
      await chrome.storage.local.set({ atomx_skip_current: false });
      setTimeout(() => processAgentWorkflowStep(), 100);
      return;
    }

    while (recheck?.atomx_workflow_paused || recheck?.atomx_agent_workflow?.isPaused) {
      await delay(400);
      if (currentWorkflowSessionId !== pacingSession) return;
      recheck = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_workflow_paused', 'atomx_skip_current']).catch(() => ({}));
      if (!recheck?.atomx_agent_workflow?.active || recheck?.atomx_agent_workflow?.isStopped) return;
      if (recheck?.atomx_skip_current) {
        await chrome.storage.local.set({ atomx_skip_current: false });
        setTimeout(() => processAgentWorkflowStep(), 100);
        return;
      }
      if (!recheck?.atomx_workflow_paused && !recheck?.atomx_agent_workflow?.isPaused) break;
    }

    const timeStr = `0:${String(sec).padStart(2, '0')}`;
    await syncAgentHud(
      recheck.atomx_agent_workflow,
      `Safety Delay: ${sec}s before ${nextActionText || ('target ' + (completedIndex + 1) + '/' + total)}...`,
      'PACING',
      Math.round((completedIndex / total) * 100),
      `Next target in ${timeStr}`,
      nextActionText || `Target ${completedIndex + 1}/${total}`,
      `⏱️ ${timeStr}`
    );
    await delay(1000);
  }
  if (currentWorkflowSessionId === pacingSession) {
    setTimeout(() => processAgentWorkflowStep(), 200);
  }
}

async function finishAgentWorkflow(workflow) {
  const { title, successCount, ignoredCount, total } = workflow;
  console.log(`[ATOMX BG] ${title} COMPLETE: ${successCount}/${total} engaged, ${ignoredCount} skipped.`);

  const finalWorkflow = {
    ...workflow,
    active: false,
    stateBadge: 'DONE',
    progressPercent: 100,
    countdownText: '',
    statusText: `✓ Workflow complete! ${successCount} processed, ${ignoredCount} skipped.`,
    finishedAt: Date.now()
  };
  const activeHud = {
    title,
    stateBadge: 'DONE',
    indicator: `${total}/${total}`,
    done: successCount,
    collected: total,
    skipped: ignoredCount,
    progressPercent: 100,
    statusText: `✓ Workflow complete! ${successCount} processed, ${ignoredCount} skipped.`,
    countdownText: '',
    isStopped: true,
    active: false
  };
  await chrome.storage.local.set({
    atomx_agent_workflow: finalWorkflow,
    atomx_active_hud: activeHud
  });
  broadcastHudToTabs(activeHud);

  chrome.alarms.clear('atomx_agent_workflow_step').catch(() => null);
}

async function abortAgentWorkflow() {
  currentWorkflowSessionId = 0;
  isAgentStepRunning = false;

  const stored = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
  const workflow = stored?.atomx_agent_workflow;
  const activeHud = {
    title: workflow?.title || 'AtomX Agent',
    stateBadge: 'STOPPED',
    statusText: 'Workflow stopped by user.',
    countdownText: '',
    timerBadge: '🛑 Stopped',
    nextAction: 'Stopped',
    isStopped: true,
    active: false
  };
  await chrome.storage.local.set({
    atomx_agent_workflow: { ...workflow, active: false, isStopped: true, stateBadge: 'STOPPED', statusText: 'Workflow stopped by user.', countdownText: '', timerBadge: '🛑 Stopped' },
    atomx_active_hud: activeHud,
    atomx_workflow_paused: false,
    atomx_skip_current: false
  });

  // Broadcast ABORT_WORKFLOW to all open Twitter/X tabs
  try {
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(t => {
          if (t.id) chrome.tabs.sendMessage(t.id, { type: 'ABORT_WORKFLOW' }).catch(() => null);
        });
      }
    });
  } catch (e) {}

  broadcastHudToTabs(activeHud);
  try {
    chrome.runtime.sendMessage({ type: 'ABORT_WORKFLOW' }).catch(() => null);
  } catch (e) {}

  if (agentWorkflowWorkingTabId) {
    chrome.tabs.sendMessage(agentWorkflowWorkingTabId, { type: 'ABORT_WORKFLOW' }).catch(() => null);
  }
  chrome.alarms.clear('atomx_agent_workflow_step').catch(() => null);
  chrome.alarms.clear('atomx_agent_pacing').catch(() => null);
  chrome.alarms.clear('atomx_keepalive').catch(() => null);
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

async function delay(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const s = await chrome.storage.local.get(['atomx_skip_current', 'atomx_agent_workflow']).catch(() => ({}));
    if (s?.atomx_skip_current || s?.atomx_agent_workflow?.isStopped) break;
    const chunk = Math.min(100, ms - (Date.now() - start));
    if (chunk <= 0) break;
    await new Promise(r => setTimeout(r, chunk));
  }
}

async function waitForTabLoad(tabId, initialTimeout = 15000) {
  const startTime = Date.now();
  const TWO_MINUTES_MS = 2 * 60 * 1000;
  let warnedUser = false;
  let attempt = 0;

  while (Date.now() - startTime < 3 * 60 * 1000) {
    attempt++;
    const cycleTimeout = attempt === 1 ? initialTimeout : 18000;

    const loaded = await new Promise((resolve) => {
      let resolved = false;
      function listener(id, changeInfo) {
        if (id === tabId && changeInfo.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(true);
          }
        }
      }
      chrome.tabs.onUpdated.addListener(listener);

      // Check if tab is already complete
      chrome.tabs.get(tabId, (tab) => {
        if (!resolved && tab?.status === 'complete') {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(false);
        }
      }, cycleTimeout);
    });

    if (loaded) {
      await delay(1200);
      return true;
    }

    // Page taking time or stuck in error -> trigger refresh and wait
    const elapsed = Date.now() - startTime;
    if (elapsed >= TWO_MINUTES_MS && !warnedUser) {
      warnedUser = true;
      console.warn('[ATOMX BG] Page refresh has taken >2 minutes. Warning user.');
      chrome.storage.local.get(['atomx_agent_workflow'], (res) => {
        const wf = res?.atomx_agent_workflow;
        if (wf && wf.active) {
          syncAgentHud(
            wf,
            '⚠️ Page refresh is taking >2 min! Slow network or X error. Retrying...',
            'WARNING',
            wf.progressPercent || 10
          );
        }
      });
    }

    console.log(`[ATOMX BG] Tab ${tabId} taking time to load (${Math.round(elapsed / 1000)}s elapsed). Refreshing and waiting...`);
    try {
      await chrome.tabs.reload(tabId).catch(() => null);
    } catch (e) {}
    await delay(2500);
  }

  return false;
}

function sendMessageToTab(tabId, message, timeout = 30000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), timeout);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime?.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: true });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    }
  });
}
