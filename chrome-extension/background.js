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

function safeRemoveTab(tabId) {
  if (typeof tabId === 'number' && Number.isInteger(tabId) && tabId > 0) {
    try {
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime?.lastError) { /* ignore silently */ }
      });
    } catch (e) {
      // ignore
    }
  }
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
      const response = await fetch(`${DEFAULT_BACKEND_URL}/api/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetText: info.selectionText, style: 'Natural & Concise' })
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

  if (request.type === 'GET_CREDITS') {
    chrome.storage.local.get(['credits'], (result) => sendResponse({ credits: result.credits || 0 }));
    return true;
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

    const res = await fetch(`${backendUrl}/api/generate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetText, tweetAuthor, tweetAuthorName, style, stylePrompt })
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
  await chrome.storage.local.set({ atomx_tg_raid: raidState });
  await syncTgHud(raidState, `Starting Telegram Raid engagement (${total} tweets)...`, 'ENGAGING', 5);

  // Keepalive heartbeat so service worker stays alive
  chrome.alarms.create('atomx_keepalive', { delayInMinutes: 0.4 });

  // Fire first step immediately (small delay to ensure storage is written)
  setTimeout(() => processTgRaidStep(), 300);

  sendResponse({ ok: true });
}

async function processTgRaidStep() {
  const stored = await chrome.storage.local.get(['atomx_tg_raid']).catch(() => ({}));
  const raid = stored?.atomx_tg_raid;

  if (!raid || !raid.active) {
    console.log('[ATOMX BG] TG Raid: no active raid found, stopping.');
    return;
  }

  const { tweets, actions, options, currentIndex, total, successCount, ignoredCount } = raid;

  // Finished?
  if (currentIndex >= total) {
    await finishTgRaid(raid);
    return;
  }

  const tweet = tweets[currentIndex];
  const indexStr = `[${currentIndex + 1}/${total}]`;
  console.log(`[ATOMX BG] TG Raid step ${indexStr}: ${tweet.canonicalUrl}`);

  await syncTgHud(raid,
    `${indexStr} Visiting @${tweet.handle || 'user'}...`,
    'ENGAGING',
    Math.round((currentIndex / total) * 100)
  );

  try {
    // Open tweet tab
    const tab = await chrome.tabs.create({ url: tweet.canonicalUrl, active: true });
    tgRaidWorkingTabId = tab.id;

    // Wait for tab to fully load (max 12s)
    await waitForTabLoad(tab.id, 12000);
    await delay(2500); // React hydration

    // Re-check abort after tab load
    const recheckStored = await chrome.storage.local.get(['atomx_tg_raid']).catch(() => ({}));
    if (!recheckStored?.atomx_tg_raid?.active) {
      safeRemoveTab(tab.id);
      tgRaidWorkingTabId = null;
      return;
    }

    // Get options from storage (tone, backend, etc.)
    const localData = await chrome.storage.local.get(['backendUrl', 'selectedTone', 'selectedTonePrompt', 'verifiedXHandle']).catch(() => ({}));
    const backendUrl = (options.backendUrl || localData.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

    // Send engagement command to content script
    const result = await sendMessageToTab(tab.id, {
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
      safeRemoveTab(tab.id);
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
    } else {
      newSuccessCount++;
      // Deduct credit via storage
      const credData = await chrome.storage.local.get(['credits']).catch(() => ({}));
      const newCredits = Math.max(0, (credData.credits || 0) - 1);
      await chrome.storage.local.set({ credits: newCredits }).catch(() => null);

      // Persist engaged tweet ID
      const engData = await chrome.storage.local.get(['engagedTweetIds']).catch(() => ({}));
      const engIds = Array.from(new Set([...(engData.engagedTweetIds || []), tweet.tweetId].filter(Boolean)));
      await chrome.storage.local.set({ engagedTweetIds: engIds }).catch(() => null);

      // Mark engaged on backend (fire-and-forget)
      fetch(`${backendUrl}/api/tweets/mark-engaged`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweets: [{ tweet_id: tweet.tweetId, handle: tweet.handle, canonical_url: tweet.canonicalUrl, action_type: 'autonomous_raid' }] })
      }).catch(() => null);
    }

    // Close tab after 1.5s
    await delay(1500);
    safeRemoveTab(tab.id);
    tgRaidWorkingTabId = null;

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
      ? `${indexStr} Skipped @${tweet.handle || 'user'} (already done)`
      : `${indexStr} ✓ Engaged @${tweet.handle || 'user'}`;
    await syncTgHud(updatedRaid, statusLabel, 'ENGAGING', Math.round(((currentIndex + 1) / total) * 100));

    // Schedule anti-ban pacing delay before next tweet
    if (updatedRaid.currentIndex < total) {
      const delaySec = Math.max(3, (options.delaySeconds || 7) + Math.floor(Math.random() * 4 - 2));
      await schedulePacingCountdown(delaySec, updatedRaid, currentIndex + 1, total);
    } else {
      // Last tweet — finish immediately
      await finishTgRaid(updatedRaid);
    }

  } catch (err) {
    console.warn(`[ATOMX BG] TG Raid error on ${tweet.canonicalUrl}:`, err);
    // Clean up tab if open
    if (tgRaidWorkingTabId) {
      safeRemoveTab(tgRaidWorkingTabId);
      tgRaidWorkingTabId = null;
    }
    // Skip this tweet and move to next
    const updatedRaid = { ...raid, currentIndex: currentIndex + 1 };
    await chrome.storage.local.set({ atomx_tg_raid: updatedRaid });
    chrome.alarms.create('atomx_tg_raid_step', { when: Date.now() + 2000 });
  }
}

async function schedulePacingCountdown(delaySec, raid, completedIndex, total) {
  // Update HUD each second during the pacing delay
  for (let sec = delaySec; sec > 0; sec--) {
    const recheckStored = await chrome.storage.local.get(['atomx_tg_raid']).catch(() => ({}));
    if (!recheckStored?.atomx_tg_raid?.active) return; // Aborted during pacing

    await syncTgHud(
      recheckStored.atomx_tg_raid,
      `Anti-ban delay: ${sec}s before tweet ${completedIndex + 1}/${total}...`,
      'PACING',
      Math.round((completedIndex / total) * 100),
      `Next tweet in 0:${String(sec).padStart(2, '0')}`
    );
    await delay(1000);
  }

  // Schedule next step via alarm (allows service worker to rest between steps)
  chrome.alarms.create('atomx_tg_raid_step', { when: Date.now() + 500 });
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
      atomx_tg_raid: { ...raid, active: false, stateBadge: 'STOPPED', statusText: 'Workflow stopped by user.', countdownText: '' },
      atomx_active_hud: {
        title: 'Telegram Group Engage',
        stateBadge: 'STOPPED',
        done: raid.successCount || 0,
        collected: raid.total || 0,
        skipped: raid.ignoredCount || 0,
        progressPercent: Math.round(((raid.currentIndex || 0) / (raid.total || 1)) * 100),
        statusText: 'Workflow stopped by user.',
        countdownText: '',
        isStopped: true,
        active: false
      }
    });
  }

  if (tgRaidWorkingTabId) {
    chrome.tabs.sendMessage(tgRaidWorkingTabId, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    await delay(500);
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
          if (t.id) chrome.tabs.sendMessage(t.id, { type: 'UPDATE_FLOATING_HUD', hud: hudPayload }).catch(() => null);
        }
      }
    });
  } catch (e) {}
}

// Sync floating HUD state and Telegram raid state to chrome.storage.local
async function syncTgHud(raid, statusText, stateBadge = 'ENGAGING', progressPercent = 0, countdownText = '') {
  const { successCount = 0, ignoredCount = 0, total = 0, currentIndex = 0 } = raid;
  const updatedRaid = {
    ...raid,
    statusText,
    stateBadge,
    progressPercent,
    countdownText
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
    isStopped: false,
    active: true
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

async function handleStartAgentWorkflow(request, sendResponse) {
  const { agentId, title, items = [], options = {} } = request;
  if ((!items || items.length === 0) && !(agentId === 'reciprocator' && options.postUrl)) {
    sendResponse({ ok: false, error: 'No targets/items provided.' });
    return;
  }

  const total = items.length;
  const workflowState = {
    active: true,
    agentId,
    title: title || 'AtomX Agent',
    items,
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
      : `Starting ${title || 'Agent'} automation (${total} targets)...`
  };

  await chrome.storage.local.remove('atomx_hud_dismissed').catch(() => null);
  await chrome.storage.local.set({ atomx_agent_workflow: workflowState });
  await syncAgentHud(workflowState, workflowState.statusText, 'RUNNING', 5);

  chrome.alarms.create('atomx_keepalive', { delayInMinutes: 0.4 });
  setTimeout(() => processAgentWorkflowStep(), 300);

  sendResponse({ ok: true });
}

async function syncAgentHud(workflow, statusText, stateBadge = 'RUNNING', progressPercent = 0, countdownText = '') {
  const { title, successCount = 0, ignoredCount = 0, total = 0, currentIndex = 0 } = workflow;
  const updated = {
    ...workflow,
    statusText,
    stateBadge,
    progressPercent,
    countdownText
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
    isStopped: false,
    active: true
  };
  await chrome.storage.local.set({
    atomx_agent_workflow: updated,
    atomx_active_hud: activeHud
  }).catch(() => null);
  broadcastHudToTabs(activeHud);
}

async function processAgentWorkflowStep() {
  const stored = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
  const workflow = stored?.atomx_agent_workflow;

  if (!workflow || !workflow.active) {
    console.log('[ATOMX BG] Agent workflow inactive, stopping.');
    return;
  }

  const { agentId, items = [], options = {}, currentIndex = 0, total = 0, successCount = 0, ignoredCount = 0 } = workflow;

  // Commenter Reciprocator initial scan phase (runs 100% in background if items not pre-collected)
  if (agentId === 'reciprocator' && (!items || items.length === 0)) {
    if (!options.postUrl) {
      await finishAgentWorkflow(workflow);
      return;
    }
    await syncAgentHud(workflow, `Opening post to scan commenters...`, 'COLLECTING', 10);
    try {
      const tab = await chrome.tabs.create({ url: options.postUrl, active: false });
      agentWorkflowWorkingTabId = tab.id;
      await waitForTabLoad(tab.id, 15000);
      await delay(3000);

      const auditRes = await sendMessageToTab(tab.id, { type: 'AUDIT_POST_DEFAULTERS', maxScrolls: 15 }, 45000);
      safeRemoveTab(tab.id);
      agentWorkflowWorkingTabId = null;

      const rawCommenters = Array.isArray(auditRes?.commenters) ? auditRes.commenters : [];
      const mainAuthor = (auditRes?.mainAuthor || '').toLowerCase();

      let persistedReciprocated = [];
      try {
        const storedRecip = await chrome.storage.local.get(['atomx_reciprocated_commenters']).catch(() => ({}));
        if (Array.isArray(storedRecip?.atomx_reciprocated_commenters)) persistedReciprocated = storedRecip.atomx_reciprocated_commenters;
      } catch (e) {}
      const reciprocatedSet = new Set(persistedReciprocated.map(h => h.toLowerCase()));

      const uniqueCommenters = [];
      const seenHandles = new Set();
      const maxCount = options.maxCount || 10;

      for (const raw of rawCommenters) {
        const clean = (raw || '').toLowerCase().trim().replace(/^@/, '');
        if (!clean || clean === mainAuthor || seenHandles.has(clean) || reciprocatedSet.has(clean)) continue;
        seenHandles.add(clean);
        uniqueCommenters.push(clean);
        if (uniqueCommenters.length >= maxCount) break;
      }

      if (uniqueCommenters.length === 0) {
        workflow.active = false;
        await syncAgentHud(workflow, `No new commenters found on post.`, 'DONE', 100);
        await finishAgentWorkflow(workflow);
        return;
      }

      const newItems = uniqueCommenters.map(h => ({ cleanHandle: h, handle: `@${h}` }));
      const updatedWorkflow = {
        ...workflow,
        items: newItems,
        total: newItems.length,
        currentIndex: 0,
        statusText: `Found ${newItems.length} commenters. Beginning reciprocation...`
      };
      await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
      await syncAgentHud(updatedWorkflow, updatedWorkflow.statusText, 'ENGAGING', 15);
      setTimeout(() => processAgentWorkflowStep(), 1000);
      return;
    } catch (auditErr) {
      console.warn('[ATOMX BG] Error auditing commenters:', auditErr);
      if (agentWorkflowWorkingTabId) {
        safeRemoveTab(agentWorkflowWorkingTabId);
        agentWorkflowWorkingTabId = null;
      }
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

  await syncAgentHud(
    workflow,
    `${indexStr} Visiting @${targetHandle || 'target'}...`,
    'ENGAGING',
    Math.round((currentIndex / total) * 100)
  );

  try {
    let targetUrl = '';
    let messagePayload = null;
    let timeoutMs = 45000;

    if (agentId === 'replyback') {
      targetUrl = item.tweetUrl || options.tweetUrl;
      messagePayload = {
        type: 'EXECUTE_REPLY_BACK_CYCLE',
        maxComments: options.maxReplies || options.maxComments || 10,
        delaySec: options.delaySec || 12,
        autoLike: options.autoLike !== false,
        style: options.style || 'Natural & Concise',
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL
      };
      timeoutMs = 180000; // 3 minutes timeout for multiple replies with delaySec
    } else if (agentId === 'reciprocator') {
      targetUrl = `https://x.com/${targetHandle}`;
      messagePayload = {
        type: 'RECIPROCAL_PROFILE_ENGAGEMENT',
        handle: targetHandle,
        likeRecent: options.likeRecent ?? true,
        commentRecent: options.commentRecent ?? true,
        style: options.style || 'Supportive & Relatable',
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL
      };
      timeoutMs = 45000;
    } else {
      // audience, sorsa, followers
      targetUrl = `https://x.com/${targetHandle}`;
      messagePayload = {
        type: 'AUDIENCE_ENGAGE_AND_FOLLOW',
        handle: targetHandle,
        likePosts: options.likePosts ?? true,
        replyPosts: options.replyPosts ?? true,
        followPosts: options.followPosts ?? true,
        autoUnfollow: options.autoUnfollow ?? false,
        style: options.style || 'Bullish (5-10 words)',
        stylePrompt: options.stylePrompt || null,
        backendUrl: options.backendUrl || DEFAULT_BACKEND_URL
      };
      timeoutMs = 45000;
    }

    const tab = await chrome.tabs.create({ url: targetUrl, active: true });
    agentWorkflowWorkingTabId = tab.id;

    await waitForTabLoad(tab.id, 12000);
    await delay(2500);

    const recheck = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
    if (!recheck?.atomx_agent_workflow?.active) {
      safeRemoveTab(tab.id);
      agentWorkflowWorkingTabId = null;
      return;
    }

    const result = await sendMessageToTab(tab.id, messagePayload, timeoutMs);

    await delay(1200);
    safeRemoveTab(tab.id);
    agentWorkflowWorkingTabId = null;

    const isSuccess = result?.success !== false;
    const isIgnored = result?.ignored || result?.alreadyDone;
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
    }

    const updatedWorkflow = {
      ...workflow,
      currentIndex: currentIndex + 1,
      successCount: newSuccess,
      ignoredCount: newIgnored
    };
    await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });

    const statusLabel = isIgnored
      ? `${indexStr} Skipped @${targetHandle || 'target'} (${result?.reason || 'already engaged'})`
      : `${indexStr} ✓ Engaged @${targetHandle || 'target'}`;

    await syncAgentHud(updatedWorkflow, statusLabel, 'ENGAGING', Math.round(((currentIndex + 1) / total) * 100));

    if (updatedWorkflow.currentIndex < total) {
      const delaySec = Math.max(3, (options.delaySec || 12) + Math.floor(Math.random() * 4 - 2));
      await scheduleAgentPacingCountdown(delaySec, updatedWorkflow, currentIndex + 1, total);
    } else {
      await finishAgentWorkflow(updatedWorkflow);
    }

  } catch (err) {
    console.warn(`[ATOMX BG] Agent workflow error on @${targetHandle}:`, err);
    if (agentWorkflowWorkingTabId) {
      safeRemoveTab(agentWorkflowWorkingTabId);
      agentWorkflowWorkingTabId = null;
    }
    const updatedWorkflow = { ...workflow, currentIndex: currentIndex + 1, ignoredCount: ignoredCount + 1 };
    await chrome.storage.local.set({ atomx_agent_workflow: updatedWorkflow });
    chrome.alarms.create('atomx_agent_workflow_step', { when: Date.now() + 2000 });
  }
}

async function scheduleAgentPacingCountdown(delaySec, workflow, completedIndex, total) {
  for (let sec = delaySec; sec > 0; sec--) {
    const recheck = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
    if (!recheck?.atomx_agent_workflow?.active) return;

    await syncAgentHud(
      recheck.atomx_agent_workflow,
      `Safety Delay: ${sec}s before target ${completedIndex + 1}/${total}...`,
      'PACING',
      Math.round((completedIndex / total) * 100),
      `Next target in 0:${String(sec).padStart(2, '0')}`
    );
    await delay(1000);
  }
  chrome.alarms.create('atomx_agent_workflow_step', { when: Date.now() + 500 });
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
  const stored = await chrome.storage.local.get(['atomx_agent_workflow']).catch(() => ({}));
  const workflow = stored?.atomx_agent_workflow;
  if (workflow) {
    const activeHud = {
      title: workflow.title || 'AtomX Agent',
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      countdownText: '',
      isStopped: true,
      active: false
    };
    await chrome.storage.local.set({
      atomx_agent_workflow: { ...workflow, active: false, isStopped: true, stateBadge: 'STOPPED', statusText: 'Workflow stopped by user.', countdownText: '' },
      atomx_active_hud: activeHud
    });
    broadcastHudToTabs(activeHud);
  }
  if (agentWorkflowWorkingTabId) {
    chrome.tabs.sendMessage(agentWorkflowWorkingTabId, { type: 'ABORT_WORKFLOW' }).catch(() => null);
    safeRemoveTab(agentWorkflowWorkingTabId);
    agentWorkflowWorkingTabId = null;
  }
  chrome.alarms.clear('atomx_agent_workflow_step').catch(() => null);
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeout);
  });
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
