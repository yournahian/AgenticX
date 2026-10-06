/**
 * ATOMX ENGAGE — TWITTER / X CONTENT SCRIPT
 * Injects one-click AI reply buttons into Twitter/X interface and handles DOM extraction.
 */

console.log('ATOMX ENGAGE content script active on Twitter/X.');

// Observe DOM changes to inject ATOMX buttons into tweet action toolbars
const observer = new MutationObserver(() => {
  injectAtomXButtons();
});

observer.observe(document.body, { childList: true, subtree: true });

function injectAtomXButtons() {
  // Find tweet action bars (like, retweet, reply bars)
  const actionBars = document.querySelectorAll('div[role="group"]:not([data-atomx-injected="true"])');

  actionBars.forEach(bar => {
    bar.setAttribute('data-atomx-injected', 'true');

    // Create AtomX Quick Reply Button
    const btn = document.createElement('button');
    btn.className = 'atomx-inline-btn';
    btn.title = 'Generate ATOMX AI Reply';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>AtomX</span>
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const tweetArticle = bar.closest('article[data-testid="tweet"]');
      if (!tweetArticle) return;

      const tweetData = extractTweetData(tweetArticle);
      btn.classList.add('loading');
      btn.querySelector('span').textContent = 'Thinking...';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_INLINE_REPLY',
          tweet: tweetData
        });

        // Or direct fetch if background worker route
        const replyText = response?.reply || `Spot on insight. Focused execution on ${tweetData.text.slice(0, 30)}... drives compounding returns.`;

        // Click tweet reply button to open input if not open
        const nativeReplyBtn = tweetArticle.querySelector('button[data-testid="reply"]');
        if (nativeReplyBtn) nativeReplyBtn.click();

        // Wait a tick for textarea to appear and insert text
        setTimeout(() => {
          insertIntoTwitterInput(replyText);
        }, 500);

      } catch (err) {
        console.error('Error generating AtomX inline reply:', err);
      } finally {
        btn.classList.remove('loading');
        btn.querySelector('span').textContent = 'AtomX';
      }
    });

    bar.appendChild(btn);
  });
}

function extractTweetData(article) {
  const textEl = article.querySelector('div[data-testid="tweetText"]');
  const userEl = article.querySelector('div[data-testid="User-Name"]');

  const text = textEl ? textEl.innerText.trim() : '';
  let authorName = '';
  let authorHandle = '';

  if (userEl) {
    const textLines = userEl.innerText.split('\n');
    authorName = textLines[0] || '';
    const handleMatch = userEl.innerText.match(/@[\w_]+/);
    authorHandle = handleMatch ? handleMatch[0] : '';
  }

  return { text, authorName, authorHandle };
}

// Human-like typing delay simulator
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Human-like letter-by-letter typing into Twitter/X Draft.js / Lexical comment box.
 * Types one character at a time with realistic human jitter, natural pauses on punctuation,
 * and synthetic events so Twitter's React state reflects each typed letter.
 */
async function typeTextHumanLike(editor, text) {
  if (!editor || !text) return;

  editor.focus();
  // Clear any existing placeholder or content if needed
  await sleep(150);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Twitter Draft.js/Lexical requires insertText via execCommand to update editor state properly
    document.execCommand('insertText', false, char);

    // Fire standard input event for full React synthetic compatibility
    try {
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: char,
        inputType: 'insertText'
      }));
    } catch (e) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Realistic human typing cadence:
    // Base keystroke delay: 28ms to 65ms
    let delay = Math.floor(Math.random() * 38) + 28;

    // Natural pauses:
    if (char === '.' || char === '!' || char === '?') {
      delay += Math.floor(Math.random() * 120) + 120; // 148ms - 213ms thought pause
    } else if (char === ',' || char === ';' || char === ':') {
      delay += Math.floor(Math.random() * 80) + 70;   // 98ms - 175ms breath pause
    } else if (char === ' ') {
      delay += Math.floor(Math.random() * 30) + 15;   // minor word boundary jitter
    } else if (char === '\n') {
      delay += Math.floor(Math.random() * 150) + 100; // newline pause
    }

    await sleep(delay);
  }

  // Final slight pause after sentence completion
  await sleep(400);
}

async function insertIntoTwitterInput(text) {
  const editor = document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                 document.querySelector('div[role="textbox"][contenteditable="true"]');
  if (editor) {
    await typeTextHumanLike(editor, text);
  }
}

// Listen to commands from the Extension Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_FOCUSED_TWEET') {
    // Look for focused or topmost visible tweet
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length > 0) {
      const firstTweet = articles[0];
      const data = extractTweetData(firstTweet);
      sendResponse({
        success: true,
        tweetText: data.text,
        authorName: data.authorName,
        authorHandle: data.authorHandle
      });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.type === 'INSERT_REPLY_TEXT') {
    insertIntoTwitterInput(message.text);
    sendResponse({ success: true });
    return true;
  }

  // Master Autonomous Automation Handler: Performs selected actions on current tweet
  if (message.type === 'EXECUTE_AUTONOMOUS_ENGAGEMENT') {
    executeAutonomousTweetWorkflow(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

// Wait for element helper with timeout

function waitForElement(selector, timeout = 7000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const found = document.querySelector(selector);
      if (found) {
        clearInterval(interval);
        resolve(found);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

async function executeAutonomousTweetWorkflow(params) {
  const actions = params.actions || { like: true, comment: true, repost: false, follow: false, scroll: true };
  const replyText = params.replyText || '';
  const performed = [];

  console.log('[ATOMX AUTONOMOUS WORKFLOW] Starting execution with actions:', actions);

  // 1. Smooth Scroll down to hydrate tweet content and mimic human reader
  if (actions.scroll !== false) {
    window.scrollBy({ top: 320, behavior: 'smooth' });
    performed.push('Scrolled & hydrated');
    await sleep(900);
  }

  // 2. Auto-Like Action
  if (actions.like) {
    try {
      const likeBtn = await waitForElement('button[data-testid="like"]', 3000);
      if (likeBtn) {
        likeBtn.click();
        performed.push('Liked ❤️');
        await sleep(600);
      } else {
        const unlikeBtn = document.querySelector('button[data-testid="unlike"]');
        if (unlikeBtn) performed.push('Already Liked');
      }
    } catch (e) {
      console.warn('Like action skipped:', e);
    }
  }

  // 3. Auto-Repost Action
  if (actions.repost) {
    try {
      const rtBtn = await waitForElement('button[data-testid="retweet"]', 3000);
      if (rtBtn) {
        rtBtn.click();
        await sleep(500);
        // Wait for Repost confirmation popover
        const confirmBtn = await waitForElement('div[data-testid="retweetConfirm"], button[data-testid="retweetConfirm"]', 3000);
        if (confirmBtn) {
          confirmBtn.click();
          performed.push('Reposted 🔁');
          await sleep(600);
        }
      }
    } catch (e) {
      console.warn('Repost action skipped:', e);
    }
  }

  // 4. Auto-Follow Creator Action
  if (actions.follow) {
    try {
      // Find follow button on page (e.g. author follow button)
      const followButtons = Array.from(document.querySelectorAll('button'));
      const followBtn = followButtons.find(b => {
        const txt = b.innerText.trim();
        const testId = b.getAttribute('data-testid') || '';
        return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following');
      });

      if (followBtn && followBtn.innerText.trim() === 'Follow') {
        followBtn.click();
        performed.push('Followed ➕');
        await sleep(600);
      }
    } catch (e) {
      console.warn('Follow action skipped:', e);
    }
  }

  // 5. Auto-Comment / Reply Action
  if (actions.comment && replyText) {
    try {
      // Look for reply input or trigger reply button
      let textarea = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (!textarea) {
        const replyBtn = document.querySelector('button[data-testid="reply"]');
        if (replyBtn) {
          replyBtn.click();
          await sleep(600);
        }
      }

      textarea = await waitForElement('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]', 5000);
      if (textarea) {
        // Human-like letter-by-letter typing animation into the reply box
        await typeTextHumanLike(textarea, replyText);
        await sleep(500);

        // Click Tweet / Reply submit button
        const submitBtn = document.querySelector('button[data-testid="tweetButtonInline"]') ||
                          document.querySelector('button[data-testid="tweetButton"]');
        if (submitBtn) {
          submitBtn.removeAttribute('disabled');
          submitBtn.click();
          performed.push('Human Typed & Commented 💬');
          await sleep(900);
        }
      }
    } catch (e) {
      console.warn('Comment action skipped:', e);
    }
  }

  console.log('[ATOMX AUTONOMOUS WORKFLOW] Finished. Actions completed:', performed);
  return {
    success: true,
    performed
  };
}
