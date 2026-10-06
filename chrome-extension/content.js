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

let isWorkflowAborted = false;

// Human-like typing delay simulator
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robust detection of the Main Focal Post on Twitter/X status pages.
 * Ensures actions (like, retweet) NEVER hit a random comment below.
 */
function getMainPostArticle() {
  const primary = document.querySelector('div[data-testid="primaryColumn"]') || document;
  const articles = Array.from(primary.querySelectorAll('article[data-testid="tweet"]'));
  if (articles.length === 0) return null;

  // If viewing a status URL /status/12345, find matching article
  const statusMatch = window.location.pathname.match(/\/status\/(\d+)/);
  if (statusMatch) {
    const targetId = statusMatch[1];
    const match = articles.find(a => {
      const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
      return links.some(l => l.getAttribute('href').includes(targetId));
    });
    if (match) return match;
  }

  // Fallback: The topmost tweet article is the focal post
  return articles[0];
}

/**
 * Detect the logged-in user's Twitter handle from navigation/profile links
 */
function getLoggedInUserHandle() {
  try {
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const clean = href.replace('/', '').toLowerCase();
      if (clean) return clean;
    }
    const switcher = document.querySelector('div[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      const match = switcher.innerText.match(/@([\w_]+)/);
      if (match) return match[1].toLowerCase();
    }
  } catch (e) {}
  return null;
}

/**
 * Check if the logged-in user has already replied/commented on this tweet
 */
function hasUserAlreadyCommented(myHandle) {
  if (!myHandle) return false;
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (articles.length <= 1) return false;

  // Comments are all articles after the main tweet (index 1+)
  const comments = articles.slice(1);
  return comments.some(c => {
    const userEl = c.querySelector('div[data-testid="User-Name"]');
    const txt = userEl ? userEl.innerText.toLowerCase() : '';
    return txt.includes(`@${myHandle}`);
  });
}

/**
 * Human-like letter-by-letter typing into Twitter/X Lexical comment box.
 * Types one character at a time with realistic human jitter without duplicate synthetic events.
 */
async function typeTextHumanLike(editor, text) {
  if (!editor || !text) return;

  editor.focus();
  await sleep(100);

  // 1. Clean editor first using selectAll and delete
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(150);

  // 2. Type character by character cleanly
  for (let i = 0; i < text.length; i++) {
    if (isWorkflowAborted) {
      console.log('[ATOMX] Typing aborted by user.');
      return;
    }

    const char = text[i];
    // Native execCommand inserts char at caret and triggers browser's native beforeinput & input
    document.execCommand('insertText', false, char);

    let delay = Math.floor(Math.random() * 25) + 18; // 18ms - 43ms natural human speed
    if (char === '.' || char === '!' || char === '?') {
      delay += 110;
    } else if (char === ',' || char === ' ') {
      delay += 35;
    } else if (char === '\n') {
      delay += 120;
    }

    await sleep(delay);
  }

  // 3. Safety check: ensure editor text was not corrupted by 3rd party autocomplete extensions
  if (!isWorkflowAborted && editor.innerText) {
    const current = editor.innerText.trim();
    const target = text.trim();
    if (current.length > target.length + 10 || current.length < target.length - 10) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    }
  }

  // 4. Fire final input event to guarantee Twitter's React/Lexical submit button is enabled
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(400);
}

async function insertIntoTwitterInput(text) {
  const editor = document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                 document.querySelector('div[role="textbox"][contenteditable="true"]');
  if (editor) {
    await typeTextHumanLike(editor, text);
  }
}

// Listen to commands from Extension Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ABORT_WORKFLOW') {
    isWorkflowAborted = true;
    console.log('[ATOMX] Abort signal received. Stopping all automation.');
    sendResponse({ success: true, aborted: true });
    return true;
  }

  if (message.type === 'EXTRACT_FOCUSED_TWEET') {
    const firstTweet = getMainPostArticle();
    if (firstTweet) {
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
  isWorkflowAborted = false;
  const actions = params.actions || { like: true, comment: true, repost: false, follow: false, scroll: true };
  const replyText = params.replyText || '';
  const performed = [];

  console.log('[ATOMX AUTONOMOUS WORKFLOW] Starting execution with actions:', actions);

  // 1. Identify MAIN POST article (never a comment!)
  const mainArticle = getMainPostArticle() || document;

  // 2. Detect already liked & already commented status
  const isAlreadyLiked = !!mainArticle.querySelector('button[data-testid="unlike"]');
  const loggedInHandle = getLoggedInUserHandle();
  const isAlreadyCommented = hasUserAlreadyCommented(loggedInHandle);

  console.log(`[ATOMX STATUS CHECK] isAlreadyLiked: ${isAlreadyLiked}, isAlreadyCommented: ${isAlreadyCommented} (user: @${loggedInHandle || 'unknown'})`);

  // USER RULE: If both like and comment are already done -> IGNORE AUTOMATICALLY!
  if (isAlreadyLiked && isAlreadyCommented) {
    console.log('[ATOMX] Both like and comment already completed on this post. Auto-ignoring.');
    return {
      success: true,
      ignored: true,
      reason: 'Both like and comment already completed on this post.',
      performed: ['Auto-Ignored (Already Liked & Commented)']
    };
  }

  // USER RULE: If like only done -> do comment only. If neither -> do both.
  const shouldLike = actions.like && !isAlreadyLiked;
  const shouldComment = actions.comment && !isAlreadyCommented;

  if (isAlreadyLiked && actions.like) {
    performed.push('Already Liked (Skipped like)');
  }
  if (isAlreadyCommented && actions.comment) {
    performed.push('Already Commented (Skipped comment)');
  }

  // If no remaining requested actions needed:
  if (!shouldLike && !shouldComment && !actions.repost && !actions.follow) {
    return {
      success: true,
      ignored: true,
      reason: 'Requested actions were already satisfied on this post.',
      performed
    };
  }

  // 3. Smooth Scroll down to mimic human reader
  if (actions.scroll !== false && !isWorkflowAborted) {
    window.scrollBy({ top: 320, behavior: 'smooth' });
    performed.push('Scrolled & hydrated');
    await sleep(800);
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 4. Auto-Like Action (MAIN POST ONLY)
  if (shouldLike && !isWorkflowAborted) {
    try {
      const likeBtn = mainArticle.querySelector('button[data-testid="like"]');
      if (likeBtn) {
        likeBtn.click();
        performed.push('Liked Main Post ❤️');
        await sleep(600);
      }
    } catch (e) {
      console.warn('Like action error:', e);
    }
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 5. Auto-Repost Action (MAIN POST ONLY)
  if (actions.repost && !isWorkflowAborted) {
    try {
      const rtBtn = mainArticle.querySelector('button[data-testid="retweet"]');
      if (rtBtn) {
        rtBtn.click();
        await sleep(500);
        const confirmBtn = await waitForElement('div[data-testid="retweetConfirm"], button[data-testid="retweetConfirm"]', 3000);
        if (confirmBtn) {
          confirmBtn.click();
          performed.push('Reposted 🔁');
          await sleep(600);
        }
      }
    } catch (e) {
      console.warn('Repost action error:', e);
    }
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 6. Auto-Follow Creator Action
  if (actions.follow && !isWorkflowAborted) {
    try {
      const followButtons = Array.from(mainArticle.querySelectorAll('button'));
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
      console.warn('Follow action error:', e);
    }
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 7. Auto-Comment Action with Human-Like Typing
  if (shouldComment && replyText && !isWorkflowAborted) {
    try {
      // Look for reply input or click reply button on MAIN post
      let textarea = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (!textarea) {
        const replyBtn = mainArticle.querySelector('button[data-testid="reply"]') || document.querySelector('button[data-testid="reply"]');
        if (replyBtn) {
          replyBtn.click();
          await sleep(600);
        }
      }

      textarea = await waitForElement('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]', 5000);
      if (textarea) {
        // Human-like letter-by-letter typing animation into the reply box
        await typeTextHumanLike(textarea, replyText);

        if (isWorkflowAborted) {
          return { success: false, aborted: true, performed };
        }

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
      console.warn('Comment action error:', e);
    }
  }

  console.log('[ATOMX AUTONOMOUS WORKFLOW] Finished. Actions completed:', performed);
  return {
    success: true,
    performed,
    isAlreadyLiked,
    isAlreadyCommented
  };
}
