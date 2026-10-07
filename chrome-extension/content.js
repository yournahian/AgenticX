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

  let tweetUrl = '';
  let tweetId = '';
  const statusLink = article.querySelector('a[href*="/status/"]');
  if (statusLink) {
    const href = statusLink.getAttribute('href');
    if (href) {
      const match = href.match(/\/([a-zA-Z0-9_]+)\/status\/(\d+)/);
      if (match) {
        tweetId = match[2];
        tweetUrl = `https://x.com/${match[1]}/status/${match[2]}`;
      } else {
        tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
      }
    }
  }

  return { text, authorName, authorHandle, tweetUrl, tweetId };
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

// QWERTY keyboard adjacent keys map for realistic typo simulation
const QWERTY_NEIGHBORS = {
  a: ['s', 'q', 'z'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'],
  e: ['w', 'r', 'd', 's'],
  f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'o', 'k', 'j'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'p', 'k', 'l'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 't', 'f', 'd'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'y', 'g', 'f'],
  u: ['y', 'i', 'j', 'h'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'e', 's', 'a'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'u', 'h', 'g'],
  z: ['a', 's', 'x']
};

/**
 * Human-like letter-by-letter typing with intentional typos & backspace corrections.
 * Simulates real human typing with natural cadence, blinking cursor, and accidental mistakes.
 */
async function typeTextHumanLike(editor, text) {
  if (!editor || !text) return;

  // 1. Focus editor and place blinking cursor in comment box
  editor.focus();
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}

  await sleep(150);

  // 2. Clean editor first using selectAll and delete
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(200);

  // 3. Plan 1 intentional typo for realism (if text is long enough, e.g. > 15 chars)
  let typoIndices = [];
  if (text.length >= 15) {
    const eligibleIndices = [];
    for (let i = 5; i < text.length - 5; i++) {
      const ch = text[i].toLowerCase();
      if (QWERTY_NEIGHBORS[ch]) {
        eligibleIndices.push(i);
      }
    }
    if (eligibleIndices.length > 0) {
      // Pick 1 random position for intentional typo
      const picked = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
      typoIndices.push(picked);
    }
  }

  // 4. Type character by character with realistic speed & typos
  for (let i = 0; i < text.length; i++) {
    if (isWorkflowAborted) {
      console.log('[ATOMX] Typing aborted by user.');
      return;
    }

    const char = text[i];
    const lower = char.toLowerCase();

    // Intentional typo simulation: type adjacent key, pause, backspace, type correct
    if (typoIndices.includes(i) && QWERTY_NEIGHBORS[lower]) {
      const neighbors = QWERTY_NEIGHBORS[lower];
      const wrongChar = neighbors[Math.floor(Math.random() * neighbors.length)];
      const isUpper = char !== lower;
      const typoTyped = isUpper ? wrongChar.toUpperCase() : wrongChar;

      // Type the mistaken character
      document.execCommand('insertText', false, typoTyped);
      
      // Human reaction pause: notice the mistake
      const reactionDelay = Math.floor(Math.random() * 160) + 200; // 200ms - 360ms
      await sleep(reactionDelay);

      if (isWorkflowAborted) return;

      // Backspace to erase mistake
      document.execCommand('delete', false, null);
      
      // Pause before correcting
      await sleep(Math.floor(Math.random() * 90) + 110); // 110ms - 200ms

      if (isWorkflowAborted) return;

      // Now type the correct letter
      document.execCommand('insertText', false, char);
    } else {
      // Normal typing
      document.execCommand('insertText', false, char);
    }

    // Realistic human cadence & pauses
    let delay = Math.floor(Math.random() * 40) + 40; // 40ms - 80ms human keystroke
    if (char === '.' || char === '!' || char === '?') {
      delay += Math.floor(Math.random() * 150) + 220; // 220ms - 370ms sentence end pause
    } else if (char === ',' || char === ';') {
      delay += Math.floor(Math.random() * 80) + 120; // 120ms - 200ms comma pause
    } else if (char === ' ') {
      delay += Math.floor(Math.random() * 45) + 35; // word pause
    } else if (char === '\n') {
      delay += 250;
    }

    await sleep(delay);
  }

  // 5. Final check to ensure entire text is intact
  if (!isWorkflowAborted && editor.innerText) {
    const current = editor.innerText.trim();
    const target = text.trim();
    if (Math.abs(current.length - target.length) > 5) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    }
  }

  // 6. Dispatch events for Twitter Lexical editor
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
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

  // Agent 1: Audience Builder — Scan active profiles on Twitter list
  if (message.type === 'SCAN_ACTIVE_PROFILES_FROM_LIST' || message.type === 'AUDIENCE_BUILDER_HUNT_USERS') {
    huntAudienceUsers(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 1: Audience Builder — Collect repliers from tweet discussion thread
  if (message.type === 'COLLECT_REPLIERS_FROM_TWEET_THREAD') {
    collectRepliersFromTweetThread(message.targetCount || 10)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, profiles: [] }));
    return true;
  }

  // Agent 1: Audience Builder — Follow & engage user on page
  if (message.type === 'FOLLOW_USER_ON_PAGE' || message.type === 'AUDIENCE_ENGAGE_AND_FOLLOW') {
    engageAndFollowProfile(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 2: Reply Back Loop — Scan and reply to comments
  if (message.type === 'EXECUTE_REPLY_BACK_CYCLE') {
    executeReplyBackCycle(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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

  // 7. Auto-Comment Action with Live Contextual AI Generation & Human-Like Typing
  if (shouldComment && !isWorkflowAborted) {
    try {
      // Step A: Extract the REAL TWEET TEXT directly from Twitter DOM
      const tweetData = extractTweetData(mainArticle);
      const liveTweetText = (tweetData.text || '').trim();
      const liveAuthor = tweetData.authorHandle || tweetData.authorName || params.tweetAuthor || '@user';

      let commentToPost = params.replyText;

      // Generate reply using the REAL tweet content from the page DOM via background service worker
      if (!commentToPost || params.generateContextual !== false) {
        try {
          console.log('[ATOMX] Asking background worker for live contextual AI reply for post:', liveTweetText.slice(0, 100));
          const aiResp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'GENERATE_AI_REPLY',
              tweetText: liveTweetText || params.tweetUrl || '',
              tweetAuthor: liveAuthor,
              tweetAuthorName: tweetData.authorName || '',
              style: params.style || 'CT Human Reply',
              stylePrompt: params.stylePrompt || null
            }, resolve);
          });

          if (aiResp && aiResp.success && aiResp.reply) {
            commentToPost = aiResp.reply;
            console.log('[ATOMX] Live AI reply received via background service worker:', commentToPost);
          } else {
            console.warn('[ATOMX] Background worker reply generation failed:', aiResp?.error);
          }
        } catch (genErr) {
          console.warn('[ATOMX] Error communicating with background worker:', genErr);
        }
      }

      if (!commentToPost) {
        commentToPost = 'Spot on insight. Focused execution is key.';
      }

      // Step B: Look for reply input or click reply button on MAIN post
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
        // Step C: Focus textarea, place cursor, and type letter-by-letter with typo and backspace correction
        await typeTextHumanLike(textarea, commentToPost);

        if (isWorkflowAborted) {
          return { success: false, aborted: true, performed };
        }

        await sleep(700);

        // Step D: Click Tweet / Reply submit button
        const submitBtn = document.querySelector('button[data-testid="tweetButtonInline"]') ||
                          document.querySelector('button[data-testid="tweetButton"]');
        if (submitBtn) {
          submitBtn.removeAttribute('disabled');
          submitBtn.click();
          performed.push(`Human Typed & Commented: "${commentToPost}" 💬`);
          await sleep(1000);
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

/**
 * Robust numerical metric parser for Twitter (handles "1.2K", "500", "2M", aria-labels)
 */
function extractTwitterMetric(element) {
  if (!element) return 0;
  const rawText = (element.innerText || element.getAttribute('aria-label') || '').trim();
  if (!rawText) return 0;
  const match = rawText.match(/([\d,.]+)\s*([kKmMbB])?/);
  if (!match) return 0;
  let val = parseFloat(match[1].replace(/,/g, ''));
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'k') val *= 1000;
  else if (unit === 'm') val *= 1000000;
  else if (unit === 'b') val *= 1000000000;
  return Math.round(val) || 0;
}

/**
 * Agent 1: Audience Builder Profile Scanner & Tweet Hunter (Phase B & C)
 * Performs DEEP SCAN across the target timeline dynamically,
 * indexes tweets with full engagement metrics (replies, retweets, likes),
 * filters by date range, ranks them to find genuine busy tweets, and extracts candidate profiles.
 * Dynamically scales scanning cycles to reliably collect 10, 25, 50, or 100 profiles.
 */
async function huntAudienceUsers(options = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(options.targetCount) || 10;
  const dateRange = options.dateRange || '24h';
  const sortBy = options.sortBy || 'replies';

  const tweetMap = new Map();
  const directProfiles = [];
  const seenHandles = new Set();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase();

  let maxAgeMs = Infinity;
  if (dateRange === '24h') maxAgeMs = 24 * 3600 * 1000;
  else if (dateRange === '3d') maxAgeMs = 3 * 24 * 3600 * 1000;
  else if (dateRange === '7d') maxAgeMs = 7 * 24 * 3600 * 1000;

  console.log(`[ATOMX AUDIENCE] Starting deep timeline scan (Target: ${targetCount}, Date: ${dateRange}, Sort: ${sortBy})...`);

  // Dynamically scale scan cycles: for 10 -> 15 cycles; 25 -> 32 cycles; 50 -> 60 cycles; 100 -> 90 cycles
  const maxScanCycles = Math.min(100, Math.max(15, Math.ceil(targetCount * 1.25)));
  let consecutiveStalls = 0;
  let prevDiscoveredCount = 0;

  for (let cycle = 0; cycle < maxScanCycles; cycle++) {
    if (isWorkflowAborted) break;

    const visibleArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    for (const article of visibleArticles) {
      const data = extractTweetData(article);
      const cleanHandle = (data.authorHandle || '').replace('@', '').toLowerCase();
      if (!cleanHandle || cleanHandle === loggedInHandle) continue;

      const tweetKey = data.tweetId || `${cleanHandle}_${(data.text || '').slice(0, 30)}`;
      if (tweetMap.has(tweetKey)) continue;

      // Parse timestamp from <time>
      const timeEl = article.querySelector('time');
      const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
      const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
      const ageMs = Date.now() - timestamp;

      // Date range filter
      if (maxAgeMs !== Infinity && ageMs > maxAgeMs) {
        continue;
      }

      // Parse full engagement metrics
      const replyBtn = article.querySelector('button[data-testid="reply"]');
      const likeBtn = article.querySelector('button[data-testid="like"], button[data-testid="unlike"]');
      const rtBtn = article.querySelector('button[data-testid="retweet"], button[data-testid="unretweet"]');

      const repliesCount = extractTwitterMetric(replyBtn);
      const likesCount = extractTwitterMetric(likeBtn);
      const retweetsCount = extractTwitterMetric(rtBtn);
      const engagementScore = (repliesCount * 5) + (retweetsCount * 3) + likesCount;

      const tweetObj = {
        tweetId: data.tweetId,
        tweetUrl: data.tweetUrl,
        authorHandle: data.authorHandle || `@${cleanHandle}`,
        cleanHandle,
        authorName: data.authorName || cleanHandle,
        text: data.text,
        timestamp,
        repliesCount,
        likesCount,
        retweetsCount,
        engagementScore
      };

      tweetMap.set(tweetKey, tweetObj);

      // Index creator handle
      if (!seenHandles.has(cleanHandle)) {
        seenHandles.add(cleanHandle);
        directProfiles.push({
          handle: data.authorHandle || `@${cleanHandle}`,
          cleanHandle,
          name: data.authorName || cleanHandle,
          tweetSnippet: (data.text || '').slice(0, 90),
          repliesCount,
          likesCount,
          timestamp
        });
      }
    }

    // Early termination buffer: if we have indexed more than enough creators and tweets, stop scrolling
    if (directProfiles.length >= Math.max(targetCount * 1.5, targetCount + 20) && tweetMap.size >= 15) {
      console.log(`[ATOMX AUDIENCE DEEP SCAN] Target buffer satisfied (${directProfiles.length} profiles). Stopping scan early at cycle ${cycle + 1}.`);
      break;
    }

    // Stall check: if no new tweets discovered for 4 consecutive cycles, break
    if (tweetMap.size === prevDiscoveredCount) {
      consecutiveStalls++;
      if (consecutiveStalls >= 4) {
        console.log(`[ATOMX AUDIENCE DEEP SCAN] Feed reached end or stalled at ${tweetMap.size} tweets.`);
        break;
      }
    } else {
      consecutiveStalls = 0;
      prevDiscoveredCount = tweetMap.size;
    }

    // Smooth scroll down to load next batch of timeline posts
    window.scrollBy({ top: 1050, behavior: 'smooth' });
    await sleep(700);
  }

  const allDiscovered = Array.from(tweetMap.values());
  console.log(`[ATOMX AUDIENCE DEEP SCAN] Completed scan: indexed ${allDiscovered.length} tweets, ${directProfiles.length} unique creators.`);

  // Sort tweets and post-authors based on user setting
  if (sortBy === 'replies') {
    allDiscovered.sort((a, b) => (b.repliesCount - a.repliesCount) || (b.engagementScore - a.engagementScore));
    directProfiles.sort((a, b) => (b.repliesCount - a.repliesCount) || (b.likesCount - a.likesCount));
  } else {
    allDiscovered.sort((a, b) => b.timestamp - a.timestamp);
    directProfiles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  // Provide candidate busy tweets (with replies)
  let topTweets = allDiscovered.filter(t => t.repliesCount > 0 && t.tweetUrl);
  if (topTweets.length === 0 && allDiscovered.length > 0) {
    topTweets = allDiscovered.filter(t => t.tweetUrl).slice(0, 15);
  } else {
    topTweets = topTweets.slice(0, Math.min(25, Math.max(10, Math.ceil(targetCount / 2))));
  }

  if (topTweets.length > 0) {
    console.log(`[ATOMX TOP BUSY TWEETS] Found ${topTweets.length} active candidate threads for reply extraction.`);
  }

  return {
    success: true,
    targetCount,
    topTweets,
    profiles: directProfiles,
    directProfiles: directProfiles,
    totalScanned: allDiscovered.length,
    aborted: isWorkflowAborted
  };
}

// Backward compatibility alias
const scanActiveProfilesFromList = (count) => huntAudienceUsers({ targetCount: count });

/**
 * Agent 1: Collect active repliers/commenters from a busy tweet discussion thread (Phase C)
 * Extracts the real community members who participated and replied to the busy tweet.
 * Dynamically scrolls until targetCount is met or thread replies are exhausted.
 */
async function collectRepliersFromTweetThread(targetCount = 10) {
  isWorkflowAborted = false;
  const numTarget = Number(targetCount) || 10;
  const collected = [];
  const seenHandles = new Set();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase();

  // Dynamically scroll discussion thread up to 25 cycles or until target reached
  const maxThreadScrolls = Math.min(25, Math.max(6, Math.ceil(numTarget * 1.2)));
  let consecutiveNoNew = 0;

  for (let s = 0; s < maxThreadScrolls; s++) {
    if (isWorkflowAborted || collected.length >= numTarget) break;

    const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    // Replies are articles after index 0 (index 0 is focal post)
    const replyArticles = allArticles.length > 1 ? allArticles.slice(1) : allArticles;

    let newInThisScroll = 0;
    for (const art of replyArticles) {
      if (collected.length >= numTarget || isWorkflowAborted) break;

      const data = extractTweetData(art);
      const cleanHandle = (data.authorHandle || '').replace('@', '').toLowerCase();
      if (!cleanHandle || cleanHandle === loggedInHandle || seenHandles.has(cleanHandle)) {
        continue;
      }

      seenHandles.add(cleanHandle);
      newInThisScroll++;
      console.log(`[ATOMX THREAD REPLIER] Collected engaged user: @${cleanHandle}`);
      collected.push({
        handle: data.authorHandle || `@${cleanHandle}`,
        cleanHandle,
        name: data.authorName || cleanHandle,
        tweetSnippet: (data.text || '').slice(0, 90)
      });
    }

    if (collected.length >= numTarget || isWorkflowAborted) break;

    if (newInThisScroll === 0) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 3) {
        // Thread replies exhausted
        break;
      }
    } else {
      consecutiveNoNew = 0;
    }

    window.scrollBy({ top: 900, behavior: 'smooth' });
    await sleep(750);
  }

  return {
    success: true,
    targetCount: numTarget,
    collectedCount: collected.length,
    profiles: collected,
    aborted: isWorkflowAborted
  };
}

/**
 * Agent 1: Audience Builder Per-Profile Interaction (Phase D)
 * Smoothly deep-scrolls profile page past header/bio/tabs, skips pinned posts,
 * centers the creator's real recent post on screen, likes it, generates AI reply adhering
 * to "Tone & Style (Applied Globally)", and follows the user.
 */
async function engageAndFollowProfile(options = {}) {
  isWorkflowAborted = false;
  const targetHandle = typeof options === 'string' ? options : (options.handle || '');
  const likePosts = options.likePosts !== false;
  const replyPosts = !!options.replyPosts;
  const style = options.style || 'Bullish (5-10 words)';
  const stylePrompt = options.stylePrompt || null;
  const backendUrl = (options.backendUrl || 'https://agenticx-two.vercel.app').replace(/\/+$/, '');

  let likesDone = 0;
  let replyDone = 0;

  try {
    // Step 1: Check if already followed on page
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const alreadyBtn = buttons.find(b => {
      const txt = (b.innerText || '').trim();
      const testId = b.getAttribute('data-testid') || '';
      return txt === 'Following' || testId.includes('unfollow') || txt.includes('Following');
    });

    if (alreadyBtn) {
      return { success: true, alreadyFollowing: true, handle: targetHandle, message: 'Already Following' };
    }

    // Step 2: DEEP SCROLL past profile header banner, avatar, bio & tabs to load recent posts
    window.scrollBy({ top: 700, behavior: 'smooth' });
    await sleep(1100);
    window.scrollBy({ top: 500, behavior: 'smooth' });
    await sleep(1000);

    // Step 3: Find Recent Posts and SKIP Pinned Tweets & Reposts
    const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const validRecentArticles = allArticles.filter(art => {
      const socialCtx = art.querySelector('div[data-testid="socialContext"]')?.innerText?.toLowerCase() || '';
      return !socialCtx.includes('pinned') && !socialCtx.includes('pin');
    });

    // The topmost non-pinned post is the creator's recent post
    const targetRecentPost = validRecentArticles[0] || allArticles[0];

    // Scroll that target post directly into center of screen so user sees the bot working on it!
    if (targetRecentPost) {
      targetRecentPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(900);
    }

    // Step 4: Like recent posts on user's profile timeline (max 2 non-pinned)
    if (likePosts) {
      const postsToLike = (validRecentArticles.length > 0 ? validRecentArticles : allArticles).slice(0, 2);
      for (const art of postsToLike) {
        if (isWorkflowAborted) break;
        const likeBtn = art.querySelector('button[data-testid="like"]');
        if (likeBtn) {
          likeBtn.click();
          likesDone++;
          await sleep(650);
        }
      }
    }

    // Step 5: Generate AI Reply adhering to "Tone & Style (Applied Globally)" and comment on centered recent post
    if (replyPosts && targetRecentPost && !isWorkflowAborted) {
      try {
        const tweetData = extractTweetData(targetRecentPost);
        const tweetText = tweetData.text || '';
        const authorName = tweetData.authorName || targetHandle;
        const authorHandle = tweetData.authorHandle || `@${targetHandle}`;

        console.log(`[ATOMX AUDIENCE] Generating contextual AI reply for @${targetHandle}'s recent post: "${tweetText.slice(0, 60)}..." Style: ${style}`);

        let commentToPost = '';

        // Call background worker with active tone and prompt
        try {
          const aiRes = await chrome.runtime.sendMessage({
            type: 'GENERATE_INLINE_REPLY',
            tweetText,
            tweetAuthor: authorHandle,
            tweetAuthorName: authorName,
            style,
            stylePrompt
          });
          if (aiRes?.reply) {
            commentToPost = aiRes.reply.trim();
          }
        } catch (mErr) {
          console.warn('[ATOMX] Background worker message error:', mErr);
        }

        // Direct fetch fallback if background worker failed
        if (!commentToPost) {
          try {
            const directRes = await fetch(`${backendUrl}/api/generate-reply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tweetText,
                tweetAuthor: authorHandle,
                tweetAuthorName: authorName,
                style,
                stylePrompt
              })
            });
            if (directRes.ok) {
              const dJson = await directRes.json();
              commentToPost = dJson?.reply?.trim();
            }
          } catch (dErr) {
            console.warn('[ATOMX] Direct fetch reply error:', dErr);
          }
        }

        // Clean quotes and preambles
        if (commentToPost) {
          commentToPost = commentToPost.replace(/^["']|["']$/g, '').trim();
        }

        if (commentToPost) {
          const replyBtn = targetRecentPost.querySelector('button[data-testid="reply"]');
          if (replyBtn) {
            replyBtn.click();
            await sleep(700);
            const textarea = await waitForElement('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]', 3500);
            if (textarea) {
              await typeTextHumanLike(textarea, commentToPost);
              await sleep(600);
              const submitBtn = document.querySelector('button[data-testid="tweetButtonInline"]') ||
                                document.querySelector('button[data-testid="tweetButton"]');
              if (submitBtn) {
                submitBtn.removeAttribute('disabled');
                submitBtn.click();
                replyDone++;
                console.log(`[ATOMX] Successfully posted AI Reply on @${targetHandle}: "${commentToPost}"`);
                await sleep(1100);
              }
            }
          }
        }
      } catch (rErr) {
        console.warn('Could not post profile reply:', rErr);
      }
    }

    if (isWorkflowAborted) {
      return { success: false, aborted: true };
    }

    // Step 6: Click Follow button
    const refreshedButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const followBtn = refreshedButtons.find(b => {
      const txt = (b.innerText || '').trim();
      const testId = b.getAttribute('data-testid') || '';
      return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following') && !testId.includes('unfollow');
    });

    if (!followBtn) {
      const nowFollowing = refreshedButtons.some(b => (b.innerText || '').trim() === 'Following');
      if (nowFollowing) {
        return { success: true, alreadyFollowing: true, handle: targetHandle, likesDone, replyDone };
      }
      return { success: false, error: 'Follow button not found', likesDone, replyDone };
    }

    followBtn.click();
    await sleep(750);

    return {
      success: true,
      alreadyFollowing: false,
      followed: true,
      handle: targetHandle,
      likesDone,
      replyDone
    };
  } catch (err) {
    return { success: false, error: err.message, likesDone, replyDone };
  }
}

// Backward compatibility alias
const followUserOnPage = (handle) => engageAndFollowProfile({ handle, likePosts: false, replyPosts: false });

/**
 * Agent 2: Reply Back Loop Execution on Current Post
 * Iterates through all comments on your tweet, auto-likes, and replies with AI + human typing.
 */
async function executeReplyBackCycle(params = {}) {
  isWorkflowAborted = false;
  const mainArticle = getMainPostArticle();
  const loggedInHandle = getLoggedInUserHandle();
  const style = params.style || 'Natural & Concise';
  const delaySec = Number(params.delaySec || 12);

  // Collect all comments below the main post
  const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const commentArticles = allArticles.filter(a => a !== mainArticle);

  const results = [];
  let doneCount = 0;

  for (let i = 0; i < commentArticles.length; i++) {
    if (isWorkflowAborted) break;

    const commentArt = commentArticles[i];
    const commentData = extractTweetData(commentArt);
    const commenterHandle = (commentData.authorHandle || '').toLowerCase().replace('@', '');

    // Skip your own comments
    if (commenterHandle && loggedInHandle && commenterHandle === loggedInHandle.toLowerCase()) {
      continue;
    }

    // Scroll comment into view
    commentArt.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(600);

    // 1. Auto-Like the comment (❤️)
    try {
      const likeBtn = commentArt.querySelector('button[data-testid="like"]');
      if (likeBtn) {
        likeBtn.click();
        await sleep(400);
      }
    } catch (e) {}

    // 2. Generate Contextual AI reply for this comment via background worker
    let replyText = '';
    try {
      const aiResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_AI_REPLY',
          tweetText: commentData.text || 'Great comment!',
          tweetAuthor: commentData.authorHandle || '@user',
          style
        }, resolve);
      });
      if (aiResp && aiResp.success && aiResp.reply) {
        replyText = aiResp.reply;
      }
    } catch (e) {}

    if (!replyText) {
      replyText = 'Appreciate you sharing this perspective!';
    }

    // 3. Click reply button on the comment
    const replyBtn = commentArt.querySelector('button[data-testid="reply"]');
    if (replyBtn) {
      replyBtn.click();
      await sleep(600);
    }

    // 4. Focus textarea and type letter-by-letter with intentional typo and correction
    const textarea = await waitForElement('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]', 4000);
    if (textarea) {
      await typeTextHumanLike(textarea, replyText);

      if (isWorkflowAborted) break;
      await sleep(600);

      // 5. Click submit reply button
      const submitBtn = document.querySelector('button[data-testid="tweetButtonInline"]') ||
                        document.querySelector('button[data-testid="tweetButton"]');
      if (submitBtn) {
        submitBtn.removeAttribute('disabled');
        submitBtn.click();
        doneCount++;
        results.push({ commenter: commentData.authorHandle, reply: replyText });
        await sleep(800);
      }
    }

    // 6. Safe delay before next comment
    if (i < commentArticles.length - 1 && !isWorkflowAborted) {
      await sleep(delaySec * 1000);
    }
  }

  return {
    success: true,
    totalComments: commentArticles.length,
    repliedCount: doneCount,
    results,
    aborted: isWorkflowAborted
  };
}

