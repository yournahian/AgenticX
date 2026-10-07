/**
 * ATOMX ENGAGE — BACKGROUND SERVICE WORKER (Manifest V3)
 * Orchestrates extension events, context menus, and Chrome Side Panel.
 */

const DEFAULT_BACKEND_URL = 'http://localhost:5000';

chrome.runtime.onInstalled.addListener(() => {
  console.log('ATOMX ENGAGE Extension Installed successfully.');

  // Set initial storage if empty
  chrome.storage.local.get(['credits'], (res) => {
    if (res.credits === undefined) {
      chrome.storage.local.set({ credits: 10000 });
    }
  });

  // Both default popup and side panel supported
  console.log('ATOMX: Default popup and Side Panel ready.');

  // Create right-click context menu
  chrome.contextMenus.create({
    id: 'atomx-generate-reply',
    title: 'ATOMX: Generate AI Reply for selection',
    contexts: ['selection']
  });
});

// Context Menu listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'atomx-generate-reply' && info.selectionText) {
    try {
      const response = await fetch(`${DEFAULT_BACKEND_URL}/api/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweetText: info.selectionText,
          style: 'Natural & Concise'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'INSERT_REPLY_TEXT',
            text: data.reply
          });
        }
      }
    } catch (err) {
      console.warn('Backend call failed via context menu:', err);
    }
  }
});

// Message listener from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ status: 'PONG', version: '1.0.0' });
    return true;
  }

  if (request.type === 'GET_CREDITS') {
    chrome.storage.local.get(['credits'], (result) => {
      sendResponse({ credits: result.credits || 0 });
    });
    return true;
  }

  // Handle live AI reply requests from content script (bypasses page-level HTTPS mixed-content blocks)
  if (request.type === 'GENERATE_AI_REPLY' || request.type === 'GENERATE_INLINE_REPLY') {
    (async () => {
      try {
        const [storedSync, storedLocal] = await Promise.all([
          chrome.storage.sync.get(['backendUrl']).catch(() => ({})),
          chrome.storage.local.get(['selectedTone', 'selectedTonePrompt', 'selectedToneId']).catch(() => ({}))
        ]);
        const backendUrl = storedSync?.backendUrl || DEFAULT_BACKEND_URL;

        const tweetText = request.tweetText || request.tweet?.text || '';
        const tweetAuthor = request.tweetAuthor || request.tweet?.authorHandle || '@user';
        const tweetAuthorName = request.tweetAuthorName || request.tweet?.authorName || '';
        const style = request.style || storedLocal?.selectedTone || 'Bullish (5-10 words)';
        const stylePrompt = request.stylePrompt || storedLocal?.selectedTonePrompt || null;

        console.log('[Background Service Worker] Generating live AI reply for post:', tweetText.slice(0, 50), 'Style:', style);
        const res = await fetch(`${backendUrl}/api/generate-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweetText,
            tweetAuthor,
            tweetAuthorName,
            style,
            stylePrompt
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
        console.error('[Background Worker] Fetch error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});
