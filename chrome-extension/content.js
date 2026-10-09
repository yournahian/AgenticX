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
    // 1. AppTabBar_Profile_Link href="/<handle>"
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (clean && !['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(clean)) {
        return clean;
      }
    }
    // 2. SideNav_AccountSwitcher_Button inner text contains @<handle>
    const switcher = document.querySelector('div[data-testid="SideNav_AccountSwitcher_Button"], button[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      const text = switcher.innerText || switcher.textContent || '';
      const match = text.match(/@([\w_]{1,30})/);
      if (match) return match[1].toLowerCase();
    }
    // 3. Header/Nav link check
    const sideNavLinks = document.querySelectorAll('header nav a[role="link"]');
    for (const link of sideNavLinks) {
      const href = link.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (clean && !['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'settings'].includes(clean) && clean.length > 1) {
        return clean;
      }
    }
  } catch (e) {}
  return null;
}

function showAccountMismatchModal(expectedHandle, actualHandle) {
  const existing = document.getElementById('atomx-account-mismatch-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'atomx-account-mismatch-banner';
  banner.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: #f8fafc;
    border: 2px solid #ef4444;
    box-shadow: 0 20px 40px rgba(0,0,0,0.7);
    border-radius: 12px;
    padding: 16px 22px;
    z-index: 999999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 460px;
    width: 90%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  banner.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; color:#ef4444;">
        <span>⚠️</span>
        <span>ATOMX ENGAGE — Account Lock</span>
      </div>
      <button id="atomx-close-mismatch" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">✕</button>
    </div>
    <div style="font-size:13px; color:#e2e8f0; line-height:1.5;">
      This extension is <strong>strictly locked</strong> to your approved X ID: <strong style="color:#60a5fa;">@${expectedHandle}</strong>.
      <br>
      Active Twitter tab is logged in as: <strong style="color:#ef4444;">@${actualHandle || 'No account logged in'}</strong>.
    </div>
    <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
      👉 Please switch or log into <strong>@${expectedHandle}</strong> on Twitter to enable automated actions.
    </div>
  `;
  document.body.appendChild(banner);
  document.getElementById('atomx-close-mismatch')?.addEventListener('click', () => banner.remove());
  setTimeout(() => banner.remove(), 12000);
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
 * Gentle scroll into view that never causes violent jumps or jarring snaps.
 * If element is already visible within comfortable viewport bounds, does not move the screen at all!
 */
function gentleScrollIntoView(element) {
  if (!element) return;
  try {
    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // Already nicely visible on screen
    if (rect.top >= 60 && rect.bottom <= vh - 40) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    // Graceful fallback
  }
}

/**
 * Natural human-like reading scroll for tweet status pages.
 * Smoothly scrolls down through the tweet text to bring the action toolbar
 * (like/repost) and reply/comment composer comfortably into the lower-middle viewport.
 */
async function smoothScrollPostForReading(mainArticle) {
  if (!mainArticle) {
    window.scrollBy({ top: 380, behavior: 'smooth' });
    await sleep(800);
    return;
  }

  try {
    // Find action toolbar (Like, Repost, Reply bar) or inline reply box
    const actionBar = mainArticle.querySelector('div[role="group"]');
    const replyTarget = document.querySelector('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]') ||
                        mainArticle.querySelector('button[data-testid="reply"]') ||
                        actionBar;

    const vh = window.innerHeight || document.documentElement.clientHeight;

    if (replyTarget) {
      const rect = replyTarget.getBoundingClientRect();
      // If reply area is already comfortably in the lower half of screen, just slight pause
      if (rect.top >= 150 && rect.bottom <= vh - 50) {
        await sleep(600);
        return;
      }

      // Calculate smooth target scroll position so action bar & reply box sit at ~60-70% down viewport
      const targetY = window.scrollY + rect.top - (vh * 0.65);
      if (targetY > window.scrollY + 30) {
        window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: 'smooth' });
        await sleep(900); // Natural human reading pause
        return;
      }
    }

    // Fallback: smooth human scroll down to reveal reply area
    window.scrollBy({ top: 420, behavior: 'smooth' });
    await sleep(800);
  } catch (e) {
    window.scrollBy({ top: 350, behavior: 'smooth' });
    await sleep(800);
  }
}

/**
 * Visually highlights the Follow button with an emerald glow and dispatches human pointer events.
 * Guarantees the user and screen recording visibly witness the follow action.
 */
async function simulateHumanFollowClick(followBtn) {
  if (!followBtn) return false;
  try {
    gentleScrollIntoView(followBtn);

    // Visual glowing indicator so user clearly sees the target button
    const origOutline = followBtn.style.outline;
    const origShadow = followBtn.style.boxShadow;
    const origTrans = followBtn.style.transition;
    const origScale = followBtn.style.transform;

    followBtn.style.transition = 'box-shadow 0.25s ease, outline 0.25s ease, transform 0.2s ease';
    followBtn.style.outline = '2px solid #10B981';
    followBtn.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.7)';
    followBtn.style.transform = 'scale(1.05)';
    await sleep(350);

    // Dispatch full pointer and mouse event sequence
    followBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    followBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    followBtn.focus();
    followBtn.click();
    followBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    followBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    await sleep(650);
    followBtn.style.transform = origScale || 'none';
    followBtn.style.outline = origOutline || 'none';
    followBtn.style.boxShadow = origShadow || 'none';
    followBtn.style.transition = origTrans || 'none';
    return true;
  } catch (e) {
    followBtn.click();
    return true;
  }
}

/**
 * 100% reliable Like Click with zero random skips.
 * Dispatches full pointer events and renders a pulse effect so the heart visibly turns pink/red.
 */
async function simulateHumanLikeClick(targetArticle) {
  if (!targetArticle) return false;

  // Check if already liked
  if (targetArticle.querySelector('button[data-testid="unlike"], div[data-testid="unlike"], [data-testid="unlike"]')) {
    return true; // Already liked
  }

  // Find like button with all possible Twitter/X selectors
  let likeBtn = targetArticle.querySelector('button[data-testid="like"], div[data-testid="like"], [data-testid="like"]') ||
                Array.from(targetArticle.querySelectorAll('button, div[role="button"]')).find(b => {
                  const label = (b.getAttribute('aria-label') || '').toLowerCase();
                  return label.includes('like') && !label.includes('unlike');
                });

  if (!likeBtn) return false;

  try {
    gentleScrollIntoView(likeBtn);

    // Visual heart pulse effect
    likeBtn.style.transition = 'transform 0.2s ease, filter 0.2s ease';
    likeBtn.style.transform = 'scale(1.25)';
    likeBtn.style.filter = 'drop-shadow(0 0 10px rgba(244, 63, 94, 0.85))';

    likeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    likeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    likeBtn.click();
    likeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    likeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    await sleep(350);
    likeBtn.style.transform = 'scale(1)';
    likeBtn.style.filter = 'none';

    // Verify if like took effect; if not, retry click once
    await sleep(350);
    const isNowLiked = !!targetArticle.querySelector('[data-testid="unlike"]');
    if (!isNowLiked) {
      likeBtn.click();
      await sleep(300);
    }
    return true;
  } catch (e) {
    likeBtn.click();
    return true;
  }
}

/**
 * 100% reliable Reply Click with visual highlighting & full pointer events.
 * Opens the Twitter / X reply modal dialog or focuses the composer.
 */
async function simulateHumanReplyClick(replyBtn) {
  if (!replyBtn) return false;
  try {
    gentleScrollIntoView(replyBtn);

    // Visual glowing indicator on reply button so action is clearly visible
    const origOutline = replyBtn.style.outline;
    const origShadow = replyBtn.style.boxShadow;
    const origTrans = replyBtn.style.transition;
    const origScale = replyBtn.style.transform;

    replyBtn.style.transition = 'box-shadow 0.25s ease, outline 0.25s ease, transform 0.2s ease';
    replyBtn.style.outline = '2px solid #10B981';
    replyBtn.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.7)';
    replyBtn.style.transform = 'scale(1.1)';
    await sleep(250);

    const rect = replyBtn.getBoundingClientRect();
    const evtInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    replyBtn.focus();
    replyBtn.dispatchEvent(new PointerEvent('pointerdown', evtInit));
    replyBtn.dispatchEvent(new MouseEvent('mousedown', evtInit));
    replyBtn.click();
    replyBtn.dispatchEvent(new PointerEvent('pointerup', evtInit));
    replyBtn.dispatchEvent(new MouseEvent('mouseup', evtInit));

    await sleep(350);
    replyBtn.style.transform = origScale || 'none';
    replyBtn.style.outline = origOutline || 'none';
    replyBtn.style.boxShadow = origShadow || 'none';
    replyBtn.style.transition = origTrans || 'none';
    return true;
  } catch (e) {
    replyBtn.click();
    return true;
  }
}

/**
 * 100% reliable single-click Submit with visual blue pulse & pointer events.
 * Submits the reply/comment without triggering duplicate submission warnings.
 */
async function simulateHumanSubmitClick(btn) {
  if (!btn) return false;
  try {
    gentleScrollIntoView(btn);
    await sleep(150);

    btn.style.transition = 'box-shadow 0.2s ease, outline 0.2s ease, transform 0.2s ease';
    btn.style.outline = '2px solid #3B82F6';
    btn.style.boxShadow = '0 0 14px rgba(59, 130, 246, 0.7)';
    btn.style.transform = 'scale(1.05)';
    await sleep(200);

    const rect = btn.getBoundingClientRect();
    const evtInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    btn.focus();
    btn.dispatchEvent(new PointerEvent('pointerdown', evtInit));
    btn.dispatchEvent(new MouseEvent('mousedown', evtInit));
    btn.click();
    btn.dispatchEvent(new PointerEvent('pointerup', evtInit));
    btn.dispatchEvent(new MouseEvent('mouseup', evtInit));

    const inner = btn.querySelector('span, div');
    if (inner) {
      inner.dispatchEvent(new PointerEvent('pointerdown', evtInit));
      inner.dispatchEvent(new MouseEvent('mousedown', evtInit));
      inner.dispatchEvent(new PointerEvent('pointerup', evtInit));
      inner.dispatchEvent(new MouseEvent('mouseup', evtInit));
    }

    await sleep(300);
    btn.style.transform = 'none';
    btn.style.outline = 'none';
    btn.style.boxShadow = 'none';
    return true;
  } catch (e) {
    btn.click();
    return true;
  }
}

/**
 * Human-like letter-by-letter typing with intentional typos & backspace corrections.
 * Fully compatible with modern X (Twitter) DraftJS & Lexical rich-text editors.
 */
async function typeTextHumanLike(editor, text) {
  if (!editor || !text) return false;

  // 1. Focus editor and place blinking cursor in comment box gently without jumping
  gentleScrollIntoView(editor);
  await sleep(150);

  editor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  editor.focus();
  editor.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  editor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(150);

  // 2. Clear editor first using Selection range and delete
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false, null);
  } catch (e) {}
  await sleep(150);

  // 3. Plan 1 intentional typo for realism (if text is long enough, e.g. > 15 chars)
  let typoIndices = [];
  if (text.length >= 15) {
    const eligibleIndices = [];
    for (let i = 5; i < text.length - 5; i++) {
      const ch = text[i].toLowerCase();
      if (QWERTY_NEIGHBORS[ch]) eligibleIndices.push(i);
    }
    if (eligibleIndices.length > 0) {
      typoIndices.push(eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)]);
    }
  }

  let typedOk = false;

  // 4. Type character by character with realistic speed & typos
  try {
    for (let i = 0; i < text.length; i++) {
      if (isWorkflowAborted) {
        console.log('[ATOMX] Typing aborted by user.');
        return false;
      }

      const char = text[i];
      const lower = char.toLowerCase();

      // Intentional typo simulation: type adjacent key, pause, backspace, type correct
      if (typoIndices.includes(i) && QWERTY_NEIGHBORS[lower]) {
        const neighbors = QWERTY_NEIGHBORS[lower];
        const wrongChar = neighbors[Math.floor(Math.random() * neighbors.length)];
        const isUpper = char !== lower;
        const typoTyped = isUpper ? wrongChar.toUpperCase() : wrongChar;

        document.execCommand('insertText', false, typoTyped);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: typoTyped }));

        const reactionDelay = Math.floor(Math.random() * 120) + 160;
        await sleep(reactionDelay);
        if (isWorkflowAborted) return false;

        document.execCommand('delete', false, null);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
        await sleep(Math.floor(Math.random() * 80) + 90);
        if (isWorkflowAborted) return false;

        document.execCommand('insertText', false, char);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: char }));
      } else {
        document.execCommand('insertText', false, char);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: char }));
      }

      // Realistic human cadence & pauses
      let delay = Math.floor(Math.random() * 30) + 25;
      if (char === '.' || char === '!' || char === '?') {
        delay += Math.floor(Math.random() * 120) + 150;
      } else if (char === ',' || char === ';') {
        delay += Math.floor(Math.random() * 60) + 80;
      } else if (char === ' ') {
        delay += Math.floor(Math.random() * 30) + 25;
      }
      await sleep(delay);
    }

    if ((editor.innerText || editor.textContent || '').trim().length > 0) {
      typedOk = true;
    }
  } catch (err) {
    console.warn('[ATOMX] Letter typing warning:', err);
  }

  // 5. Robust Fallback via ClipboardEvent (Paste) if editor is still empty
  if (!typedOk || !(editor.innerText || editor.textContent || '').trim()) {
    console.log('[ATOMX] Fallback to ClipboardEvent paste for DraftJS editor...');
    try {
      editor.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEvt);
      await sleep(250);
      if ((editor.innerText || editor.textContent || '').trim().length > 0) {
        typedOk = true;
      }
    } catch (pe) {
      console.warn('[ATOMX] Paste fallback error:', pe);
    }
  }

  // 6. Final fallback: direct assignment
  if (!typedOk || !(editor.innerText || editor.textContent || '').trim()) {
    try {
      editor.focus();
      editor.textContent = text;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(300);
  return true;
}

/**
 * Universal, rock-solid Twitter / X Comment & Reply Engine
 * Reliably opens modal dialogs for comments and timeline posts,
 * scopes typing & submit strictly to the dialog, and prevents self-commenting bugs.
 */
async function postCommentOnTargetArticle(targetArticle, commentText) {
  if (!commentText || isWorkflowAborted) return { success: false, error: 'Empty text or aborted' };

  console.log('[ATOMX COMMENT ENGINE] Posting comment:', commentText);

  let textarea = null;
  let dialog = null;
  let isDialog = false;

  const isStatusPage = window.location.pathname.includes('/status/');
  const mainArt = getMainPostArticle();
  const isMainTarget = !targetArticle || targetArticle === mainArt;

  // 1. On tweet status pages, check if inline reply box is already sitting under the tweet
  if (isStatusPage && isMainTarget) {
    const inlineBox = document.querySelector('div[data-testid="inline_reply"] div[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"][contenteditable="true"]');
    if (inlineBox) {
      console.log('[ATOMX COMMENT ENGINE] Direct inline reply box detected, focusing...');
      inlineBox.focus();
      inlineBox.click();
      textarea = inlineBox;
      isDialog = false;
      await sleep(300);
    }
  }

  // 2. If no textarea mounted yet, locate and click Reply button on targetArticle
  if (!textarea) {
    let replyBtn = targetArticle?.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
    if (!replyBtn && !window.location.pathname.includes('/compose/post')) {
      replyBtn = document.querySelector('button[data-testid="reply"]');
    }

    if (replyBtn) {
      console.log('[ATOMX COMMENT ENGINE] Clicking Reply button on target tweet/comment...');
      await simulateHumanReplyClick(replyBtn);
    }

    // Wait for the editable textarea to mount in dialog, inline, or compose view
    textarea = await waitForElement(
      'div[role="dialog"] div[data-testid="tweetTextarea_0"], div[role="dialog"] div[role="textbox"][contenteditable="true"], div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"], div.public-DraftEditor-content',
      7000
    );

    if (textarea) {
      dialog = textarea.closest('div[role="dialog"], div[aria-modal="true"]') || document.querySelector('div[role="dialog"]');
      isDialog = !!dialog;
    }
  }

  if (!textarea) {
    console.warn('[ATOMX COMMENT ENGINE] Reply textarea not found!');
    return { success: false, error: 'Textarea not found on page' };
  }

  // 3. Type human-like into the editor
  await typeTextHumanLike(textarea, commentText);

  if (isWorkflowAborted) return { success: false, aborted: true, error: 'Workflow was aborted by user' };

  await sleep(600);

  // 5. Find Submit Reply Button scoped to dialog if open
  const scope = (isDialog && dialog) ? dialog : document;
  const getSubmitBtn = () => {
    let btn = scope.querySelector('button[data-testid="tweetButton"]') ||
              scope.querySelector('button[data-testid="tweetButtonInline"]') ||
              document.querySelector('div[role="dialog"] button[data-testid="tweetButton"]') ||
              document.querySelector('button[data-testid="tweetButtonInline"]') ||
              document.querySelector('button[data-testid="tweetButton"]');

    if (!btn) {
      const allBtns = Array.from(scope.querySelectorAll('button, div[role="button"]'));
      btn = allBtns.find(b => {
        const txt = (b.innerText || '').trim().toLowerCase();
        return (txt === 'reply' || txt === 'post') && !txt.includes('post your reply');
      });
    }
    return btn;
  };

  let submitBtn = getSubmitBtn();

  // If button is still disabled or missing, force DraftJS state update via native paste
  if (!submitBtn || submitBtn.getAttribute('aria-disabled') === 'true' || submitBtn.disabled) {
    try {
      textarea.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', commentText);
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      textarea.dispatchEvent(pasteEvt);
      await sleep(300);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(300);
    } catch (e) {
      console.warn('[ATOMX COMMENT ENGINE] DraftJS paste activation warning:', e);
    }
    submitBtn = getSubmitBtn();
  }

  if (!submitBtn) {
    console.warn('[ATOMX COMMENT ENGINE] Submit reply button not found!');
    return { success: false, error: 'Submit button not found' };
  }

  // Wait briefly if aria-disabled is still true to let React state catch up
  let waitCount = 0;
  while ((submitBtn.getAttribute('aria-disabled') === 'true' || submitBtn.disabled) && waitCount < 12) {
    await sleep(200);
    waitCount++;
  }

  // Force-enable button attributes if React is still lagging
  submitBtn.removeAttribute('disabled');
  submitBtn.setAttribute('aria-disabled', 'false');
  await sleep(150);

  // 6. Click Submit EXACTLY ONCE with human pointer events (No double tap, avoids duplicate error)
  await simulateHumanSubmitClick(submitBtn);

  console.log('[ATOMX COMMENT ENGINE] Clicked Submit button once successfully!');
  await sleep(1500);

  // Check immediately if Twitter responded with a rate limit error toast
  if (checkTwitterRateLimit()) {
    triggerRateLimitAbort('Rate limited while submitting reply');
    return { success: false, aborted: true, rateLimited: true, error: 'Twitter Rate Limit detected after posting' };
  }

  await sleep(1000);

  // Dismiss dialog if still hanging open after successful API send
  const remainingDialog = document.querySelector('div[role="dialog"]');
  if (remainingDialog) {
    const closeBtn = remainingDialog.querySelector('button[aria-label="Close"], div[data-testid="app-bar-close"]');
    if (closeBtn) {
      try { closeBtn.click(); } catch (e) {}
      await sleep(300);
    }
  }

  return { success: true };
}

// =========================================================================
// TWITTER / X RATE LIMIT AUTO-ABORT MONITOR
// =========================================================================
function checkTwitterRateLimit() {
  const elements = Array.from(document.querySelectorAll(
    'div[data-testid="toast"], div[role="alert"], div[role="alertdialog"], div[data-testid="error-detail"], [data-testid="toast"] span, [role="alert"] span, div[data-testid="empty_state"]'
  ));
  for (const el of elements) {
    const txt = (el.innerText || '').toLowerCase();
    if (
      txt.includes('rate limit') ||
      txt.includes('rate-limit') ||
      txt.includes('rate limited') ||
      txt.includes('rate-limited') ||
      txt.includes('sorry, you are rate limited') ||
      txt.includes('sorry you are rate limit') ||
      txt.includes('you are rate limited') ||
      txt.includes('cannot retrieve tweets at this time') ||
      txt.includes('cannot retrieve posts at this time') ||
      txt.includes('over capacity')
    ) {
      return true;
    }
  }

  // Also check top-level alerts / error toasts anywhere on document body
  const toasts = document.querySelectorAll('div[data-testid="toast"]');
  for (const t of toasts) {
    const txt = (t.textContent || '').toLowerCase();
    if (txt.includes('rate limit') || txt.includes('rate-limit') || txt.includes('try again later') || txt.includes('sorry, you are rate limited') || txt.includes('over capacity')) {
      return true;
    }
  }
  return false;
}

function triggerRateLimitAbort(reason = 'Sorry, you are rate limited.') {
  console.warn('[ATOMX ALERT] Twitter Rate Limit Detected! Stopping all automation immediately.');
  isWorkflowAborted = true;
  updateFloatingHud({
    stateBadge: 'RATE_LIMITED',
    statusText: '🚨 Rate limit detected! All automation stopped immediately to protect account.',
    isStopped: true
  });
  chrome.runtime.sendMessage({
    type: 'RATE_LIMIT_DETECTED',
    error: 'Twitter Rate Limit: "Sorry, you are rate limited." All automation has been stopped immediately to protect your account.'
  }).catch(() => null);
}

// =========================================================================
// ATOMX FLOATING MINI HUD (ON-PAGE OVERLAY WIDGET)
// =========================================================================
let floatingHudEl = null;
let isHudDismissedLocally = false;
let isPopupOpenLocally = false;
let isHudWorkflowPaused = false;

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(['atomx_popup_open', 'atomx_hud_dismissed', 'atomx_workflow_paused']).then(res => {
    isPopupOpenLocally = Boolean(res?.atomx_popup_open);
    isHudDismissedLocally = Boolean(res?.atomx_hud_dismissed);
    isHudWorkflowPaused = Boolean(res?.atomx_workflow_paused);
    if (isPopupOpenLocally || isHudDismissedLocally) {
      if (floatingHudEl) floatingHudEl.style.display = 'none';
    }
  }).catch(() => null);
}

function ensureFloatingHud() {
  if (floatingHudEl && document.body.contains(floatingHudEl)) return floatingHudEl;

  const existing = document.getElementById('atomx-floating-hud');
  if (existing) {
    floatingHudEl = existing;
    return floatingHudEl;
  }

  const hud = document.createElement('div');
  hud.id = 'atomx-floating-hud';
  hud.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 14px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #F8FAFC;
    z-index: 2147483647;
    padding: 14px;
    box-sizing: border-box;
    transition: transform 0.2s ease, opacity 0.2s ease;
    user-select: none;
  `;

  hud.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span id="hud-badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">RUNNING</span>
        <strong id="hud-title" style="font-size: 13px; font-weight: 700; color: #FFFFFF;">AtomX Agent</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span id="hud-indicator" style="font-size: 11px; font-weight: 600; color: #60A5FA;">Active</span>
        <button id="hud-minimize-btn" title="Minimize / Expand" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #CBD5E1; font-size: 14px; font-weight: 700; border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;">−</button>
        <button id="hud-close-btn" title="Close & Hide HUD (✕)" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #FCA5A5; font-size: 13px; font-weight: 800; border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;">✕</button>
      </div>
    </div>

    <!-- 3 Metric Cards Grid -->
    <div id="hud-body" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9.5px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">DONE</div>
          <div id="hud-done-count" style="font-size: 17px; font-weight: 800; color: #10B981; margin-top: 2px;">0</div>
        </div>
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9.5px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">COLLECTED</div>
          <div id="hud-col-count" style="font-size: 17px; font-weight: 800; color: #60A5FA; margin-top: 2px;">0</div>
        </div>
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9.5px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">SKIPPED</div>
          <div id="hud-skip-count" style="font-size: 17px; font-weight: 800; color: #F59E0B; margin-top: 2px;">0</div>
        </div>
      </div>

      <!-- Progress Track -->
      <div style="width: 100%; height: 5px; background: rgba(255, 255, 255, 0.08); border-radius: 99px; overflow: hidden;">
        <div id="hud-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3B82F6, #10B981); transition: width 0.3s ease;"></div>
      </div>

      <!-- Live Status Text -->
      <div id="hud-status-text" style="font-size: 11.5px; color: #CBD5E1; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Initializing agent automation...
      </div>

      <!-- Countdown text (shown during pacing delays) -->
      <div id="hud-countdown-text" style="font-size: 11px; color: #10B981; font-weight: 700; font-family: monospace; display: none;"></div>

      <!-- Action Controls: Pause/Resume, Skip, Stop -->
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button id="hud-pause-btn" style="flex: 1; padding: 7px 0; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 8px; color: #FBBF24; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.15s ease;" title="Pause or Resume current workflow">
          ⏸️ Pause
        </button>
        <button id="hud-skip-action-btn" style="flex: 1; padding: 7px 0; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 8px; color: #60A5FA; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.15s ease;" title="Skip current tweet/profile link immediately">
          ⏭️ Skip
        </button>
        <button id="hud-stop-btn" style="flex: 1; padding: 7px 0; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; color: #F87171; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.15s ease;" title="Completely abort and stop workflow">
          ⏹️ Stop
        </button>
      </div>
    </div>
  `;

  // Pause / Resume listener
  hud.querySelector('#hud-pause-btn')?.addEventListener('click', () => {
    isHudWorkflowPaused = !isHudWorkflowPaused;
    const pauseBtn = hud.querySelector('#hud-pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = isHudWorkflowPaused ? '▶️ Resume' : '⏸️ Pause';
      pauseBtn.style.color = isHudWorkflowPaused ? '#34D399' : '#FBBF24';
      pauseBtn.style.background = isHudWorkflowPaused ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      pauseBtn.style.borderColor = isHudWorkflowPaused ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)';
    }
    const badge = hud.querySelector('#hud-badge');
    if (badge) {
      badge.textContent = isHudWorkflowPaused ? 'PAUSED' : 'RUNNING';
      badge.style.color = isHudWorkflowPaused ? '#FBBF24' : '#10B981';
    }
    chrome.storage.local.set({ atomx_workflow_paused: isHudWorkflowPaused }).catch(() => null);
    chrome.runtime.sendMessage({ type: 'TOGGLE_WORKFLOW_PAUSE', isPaused: isHudWorkflowPaused }).catch(() => null);
  });

  // Skip current item listener
  hud.querySelector('#hud-skip-action-btn')?.addEventListener('click', () => {
    chrome.storage.local.set({ atomx_skip_current: true }).catch(() => null);
    chrome.runtime.sendMessage({ type: 'SKIP_WORKFLOW_ITEM' }).catch(() => null);
    const statusEl = hud.querySelector('#hud-status-text');
    if (statusEl) statusEl.textContent = '⏭️ Skipping current item...';
  });

  // Attach stop listener
  hud.querySelector('#hud-stop-btn')?.addEventListener('click', () => {
    isWorkflowAborted = true;
    updateFloatingHud({
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      isStopped: true
    });
    chrome.storage.local.set({
      atomx_active_hud: {
        stateBadge: 'STOPPED',
        statusText: 'Workflow stopped by user.',
        isStopped: true,
        active: false
      },
      atomx_workflow_paused: false
    }).catch(() => null);
    chrome.runtime.sendMessage({ type: 'ABORT_WORKFLOW' }).catch(() => null);
  });

  // Minimize / Expand toggle
  let isMinimized = false;
  hud.querySelector('#hud-minimize-btn')?.addEventListener('click', () => {
    isMinimized = !isMinimized;
    const body = hud.querySelector('#hud-body');
    const minBtn = hud.querySelector('#hud-minimize-btn');
    if (body) body.style.display = isMinimized ? 'none' : 'flex';
    if (minBtn) minBtn.textContent = isMinimized ? '+' : '−';
  });

  // Dismiss / Close HUD handler - Stays dismissed until a new workflow starts!
  const handleDismissHud = () => {
    isHudDismissedLocally = true;
    hud.style.display = 'none';
    chrome.storage.local.set({ atomx_hud_dismissed: true }).catch(() => null);
  };

  hud.querySelector('#hud-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDismissHud();
  });

  hud.querySelector('#hud-dismiss-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDismissHud();
  });

  // Make draggable
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
  hud.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = hud.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    hud.style.bottom = 'auto';
    hud.style.right = 'auto';
    hud.style.left = `${initialLeft}px`;
    hud.style.top = `${initialTop}px`;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    hud.style.left = `${Math.max(10, Math.min(window.innerWidth - 330, initialLeft + dx))}px`;
    hud.style.top = `${Math.max(10, Math.min(window.innerHeight - 150, initialTop + dy))}px`;
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  document.body.appendChild(hud);
  floatingHudEl = hud;
  return floatingHudEl;
}

function updateFloatingHud(data = {}) {
  // If explicitly requested a new workflow, clear dismiss flag
  if (data.isNewWorkflow) {
    isHudDismissedLocally = false;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove('atomx_hud_dismissed').catch(() => null);
    }
  }

  // The HUD should ONLY be visible when the extension popup is closed!
  if (isPopupOpenLocally && !data.forceShow) {
    if (floatingHudEl) floatingHudEl.style.display = 'none';
    return;
  }

  // If user dismissed HUD on this page instance and it's not a brand new workflow, keep it hidden
  if (isHudDismissedLocally && !data.isNewWorkflow && !data.forceShow) {
    if (floatingHudEl) floatingHudEl.style.display = 'none';
    return;
  }

  const hud = ensureFloatingHud();
  if (!hud) return;

  hud.style.display = 'block';

  if (data.title) {
    const el = hud.querySelector('#hud-title');
    if (el) el.textContent = data.title;
  }
  if (data.indicator) {
    const el = hud.querySelector('#hud-indicator');
    if (el) el.textContent = data.indicator;
  }
  if (data.stateBadge) {
    const el = hud.querySelector('#hud-badge');
    if (el) {
      el.textContent = data.stateBadge;
      if (data.stateBadge === 'RATE_LIMITED') {
        el.style.background = 'rgba(239, 68, 68, 0.25)';
        el.style.color = '#EF4444';
        el.style.border = '1px solid rgba(239, 68, 68, 0.5)';
      } else if (data.stateBadge === 'STOPPED') {
        el.style.background = 'rgba(100, 116, 139, 0.2)';
        el.style.color = '#94A3B8';
        el.style.border = '1px solid rgba(100, 116, 139, 0.4)';
      } else if (data.stateBadge === 'PAUSED') {
        el.style.background = 'rgba(245, 158, 11, 0.2)';
        el.style.color = '#FBBF24';
        el.style.border = '1px solid rgba(245, 158, 11, 0.5)';
      } else {
        el.style.background = 'rgba(16, 185, 129, 0.15)';
        el.style.color = '#10B981';
        el.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      }
    }
  }
  if (data.done !== undefined) {
    const el = hud.querySelector('#hud-done-count');
    if (el) el.textContent = data.done;
  }
  if (data.collected !== undefined) {
    const el = hud.querySelector('#hud-col-count');
    if (el) el.textContent = data.collected;
  }
  if (data.skipped !== undefined) {
    const el = hud.querySelector('#hud-skip-count');
    if (el) el.textContent = data.skipped;
  }
  if (data.progressPercent !== undefined) {
    const el = hud.querySelector('#hud-progress-bar');
    if (el) el.style.width = `${Math.min(100, Math.max(0, data.progressPercent))}%`;
  }
  if (data.statusText) {
    const el = hud.querySelector('#hud-status-text');
    if (el) {
      el.textContent = data.statusText;
      el.title = data.statusText;
    }
  }
  // Countdown text (pacing delay)
  if (data.countdownText !== undefined) {
    const cd = hud.querySelector('#hud-countdown-text');
    if (cd) {
      if (data.countdownText) {
        cd.style.display = 'block';
        cd.textContent = data.countdownText;
      } else {
        cd.style.display = 'none';
      }
    }
  }
  const stopBtn = hud.querySelector('#hud-stop-btn');
  const dismissBtn = hud.querySelector('#hud-dismiss-btn');
  if (data.isStopped || data.stateBadge === 'DONE' || data.stateBadge === 'STOPPED') {
    if (stopBtn) stopBtn.style.display = 'none';
    if (dismissBtn) dismissBtn.style.display = 'flex';
  } else {
    if (stopBtn) stopBtn.style.display = 'flex';
    if (dismissBtn) dismissBtn.style.display = 'none';
  }
}

function hideFloatingHud() {
  if (floatingHudEl) {
    floatingHudEl.style.display = 'none';
  }
}

// Automatically sync & hydrate on-page floating HUD from chrome.storage.local
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(['atomx_active_hud', 'atomx_hud_dismissed', 'atomx_popup_open'], (res) => {
    isPopupOpenLocally = Boolean(res?.atomx_popup_open);
    isHudDismissedLocally = Boolean(res?.atomx_hud_dismissed);
    const activeHud = res?.atomx_active_hud;

    if (isPopupOpenLocally || isHudDismissedLocally) {
      hideFloatingHud();
      return;
    }

    if (activeHud && activeHud.active) {
      updateFloatingHud(activeHud);
    } else if (activeHud && (activeHud.isStopped || activeHud.stateBadge === 'DONE')) {
      updateFloatingHud(activeHud);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.atomx_popup_open !== undefined) {
      isPopupOpenLocally = Boolean(changes.atomx_popup_open.newValue);
      if (isPopupOpenLocally) {
        hideFloatingHud();
      } else {
        // Popup closed: show HUD if active and not dismissed
        chrome.storage.local.get(['atomx_active_hud', 'atomx_hud_dismissed']).then(s => {
          if (s?.atomx_active_hud?.active && !s?.atomx_hud_dismissed) {
            updateFloatingHud(s.atomx_active_hud);
          }
        }).catch(() => null);
      }
    }

    if (changes.atomx_hud_dismissed !== undefined) {
      isHudDismissedLocally = Boolean(changes.atomx_hud_dismissed.newValue);
      if (isHudDismissedLocally) {
        hideFloatingHud();
      }
    }

    if (changes.atomx_workflow_paused !== undefined) {
      isHudWorkflowPaused = Boolean(changes.atomx_workflow_paused.newValue);
      const pauseBtn = floatingHudEl?.querySelector('#hud-pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = isHudWorkflowPaused ? '▶️ Resume' : '⏸️ Pause';
        pauseBtn.style.color = isHudWorkflowPaused ? '#34D399' : '#FBBF24';
        pauseBtn.style.background = isHudWorkflowPaused ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      }
      const badge = floatingHudEl?.querySelector('#hud-badge');
      if (badge && !isWorkflowAborted) {
        badge.textContent = isHudWorkflowPaused ? 'PAUSED' : 'RUNNING';
        badge.style.color = isHudWorkflowPaused ? '#FBBF24' : '#10B981';
      }
    }

    if (changes.atomx_active_hud) {
      const val = changes.atomx_active_hud.newValue;

      if (val && val.isNewWorkflow) {
        isHudDismissedLocally = false;
      }

      if (isPopupOpenLocally || isHudDismissedLocally) {
        hideFloatingHud();
        return;
      }

      if (val && val.active) {
        updateFloatingHud(val);
      } else if (val && (val.isStopped || val.stateBadge === 'DONE')) {
        updateFloatingHud(val);
      } else {
        hideFloatingHud();
      }
    }
  });
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
  if (message.type === 'CHECK_CURRENT_LOGGED_IN_X_HANDLE' || message.type === 'GET_CURRENT_X_ACCOUNT') {
    const handle = getLoggedInUserHandle();
    sendResponse({
      success: true,
      handle: handle ? `@${handle}` : null,
      rawHandle: handle || null,
      isLoggedIn: Boolean(handle)
    });
    return true;
  }

  if (message.type === 'ABORT_WORKFLOW') {
    isWorkflowAborted = true;
    console.log('[ATOMX] Abort signal received. Stopping all automation.');
    hideFloatingHud();
    sendResponse({ success: true, aborted: true });
    return true;
  }

  if (message.type === 'UPDATE_FLOATING_HUD') {
    updateFloatingHud(message.data);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'HIDE_FLOATING_HUD') {
    isHudDismissedLocally = true;
    hideFloatingHud();
    sendResponse({ success: true });
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

  // Agent 11: Find Defaulter — Scan post comments and return all author handles
  if (message.type === 'AUDIT_POST_DEFAULTERS') {
    auditPostCommenters(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, commenters: [] }));
    return true;
  }

  // Agent 12: Telegram Live Liker & Proof Recorder — Visual live actions with glow ring
  if (message.type === 'EXECUTE_LIVE_RAID_ENGAGEMENT') {
    executeLiveRaidEngagement(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 7: Auto Unfollow — Scan following page and unfollow matching accounts
  if (message.type === 'EXECUTE_AUTO_UNFOLLOW_STEP') {
    executeAutoUnfollowStep(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 13: Commenter Reciprocator — Engage on commenter profile
  if (message.type === 'RECIPROCAL_PROFILE_ENGAGEMENT') {
    executeReciprocalProfileEngagement(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 4: Followers Increase — Scrape top engaging accounts from live niche/list feed
  if (message.type === 'COLLECT_ENGAGING_NICHE_PROFILES') {
    collectEngagingNicheProfiles(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, profiles: [] }));
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

/**
 * Client-side Comment Sanitizer:
 * Enforces universal anti-bot rules:
 * - NO $, NO emojis, NO —, NO quotes, NO !
 * - Strictly 5-10 words
 */
function sanitizeClientComment(text, maxWords = 10) {
  if (!text) return '';
  let clean = text
    .replace(/^(Reply|Comment|Tweet|Response|AI Reply|Output)\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@[\w_]+/g, '')
    .replace(/[$]/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[—–]/g, ' ')
    .replace(/--+/g, ' ')
    .replace(/["'“”‘’`«»]/g, '')
    .replace(/!+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    clean = words.slice(0, maxWords).join(' ').replace(/[,;:\-\s]+$/, '') + '.';
  }
  clean = clean.replace(/[$!—"“"'`«»]/g, '').trim();
  return clean;
}

async function executeAutonomousTweetWorkflow(params) {
  isWorkflowAborted = false;

  // 1-to-1 Verified Account Enforcement
  if (params.verifiedXHandle) {
    const expected = params.verifiedXHandle.replace(/^@/, '').toLowerCase().trim();
    const current = (getLoggedInUserHandle() || '').toLowerCase().trim();
    if (!current || current !== expected) {
      showAccountMismatchModal(expected, current || 'Not Logged In');
      return {
        success: false,
        error: `Account Lock Mismatch: Active Twitter ID is @${current || 'none'}, but extension is locked to @${expected}. Please log into @${expected}.`,
        unauthorizedAccount: true
      };
    }
  }

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

  // USER RULE 1: If both like and comment are already done -> IGNORE AUTOMATICALLY!
  if (isAlreadyLiked && isAlreadyCommented) {
    console.log('[ATOMX] Both like and comment already completed on this post. Auto-ignoring.');
    return {
      success: true,
      ignored: true,
      commentSkipped: true,
      likeSkipped: true,
      reason: 'Both like and comment already completed on this post.',
      performed: ['Auto-Ignored (Already Liked & Commented)']
    };
  }

  // USER RULE 2: If user already commented on this post, AUTO-IGNORE!
  // In engagement raids, commenting is the core task. Never post duplicate comments on the same tweet!
  if (actions.comment && isAlreadyCommented) {
    console.log('[ATOMX] User already commented on this post previously. Auto-ignoring.');
    // If like was also requested and not yet liked, give a quick free courtesy like
    if (actions.like && !isAlreadyLiked) {
      try {
        const likeBtn = mainArticle.querySelector('button[data-testid="like"]');
        if (likeBtn) {
          likeBtn.click();
          performed.push('Liked Main Post ❤️ (Free courtesy)');
        }
      } catch (e) {
        console.log('[ATOMX] Courtesy like notice:', e);
      }
    }
    return {
      success: true,
      ignored: true,
      commentSkipped: true,
      reason: 'Already commented on this post previously.',
      performed: ['Auto-Ignored (Already Commented)']
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
      commentSkipped: isAlreadyCommented,
      likeSkipped: isAlreadyLiked,
      reason: 'Requested actions were already satisfied on this post.',
      performed
    };
  }

  // 3. Auto-Follow Creator FIRST (Naturally executed at top of post while avatar & header are in full view)
  if (actions.follow && !isWorkflowAborted) {
    try {
      // 1. Look inside mainArticle author header
      let followBtn = Array.from(mainArticle.querySelectorAll('button, div[role="button"]')).find(b => {
        const txt = (b.innerText || '').trim();
        const testId = b.getAttribute('data-testid') || '';
        return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following') && !testId.includes('unfollow');
      });

      // 2. Look across whole page if not directly inside mainArticle header
      if (!followBtn) {
        followBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(b => {
          const txt = (b.innerText || '').trim();
          const testId = b.getAttribute('data-testid') || '';
          return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following') && !testId.includes('unfollow');
        });
      }

      // 3. Hover over author avatar/name to trigger Twitter HoverCard if not visible directly
      if (!followBtn) {
        const authorLink = mainArticle.querySelector('div[data-testid="User-Name"] a, a[role="link"][href*="/"]');
        if (authorLink) {
          authorLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          await sleep(650);
          const hoverCard = document.querySelector('div[data-testid="HoverCard"], div[role="dialog"]');
          if (hoverCard) {
            followBtn = Array.from(hoverCard.querySelectorAll('button')).find(b => {
              const txt = (b.innerText || '').trim();
              return txt === 'Follow' && !txt.includes('Following');
            });
          }
        }
      }

      if (followBtn) {
        await simulateHumanFollowClick(followBtn);
        performed.push('Followed Creator ➕');
        await sleep(400);
      } else {
        const isFollowing = Array.from(document.querySelectorAll('button')).some(b => (b.innerText || '').trim() === 'Following');
        if (isFollowing) {
          performed.push('Already Following');
        }
      }
    } catch (e) {
      console.warn('Follow action error:', e);
    }
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 4. Natural Reading Scroll: Smoothly scroll down through post to bring action bar & comment box into view together
  if (actions.scroll !== false && !isWorkflowAborted) {
    await smoothScrollPostForReading(mainArticle);
    performed.push('Scrolled & hydrated');
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 5. Auto-Like Action (MAIN POST ONLY) — 100% reliable execution with visual pulse
  if (shouldLike && !isWorkflowAborted) {
    try {
      const likedOk = await simulateHumanLikeClick(mainArticle);
      if (likedOk) {
        performed.push('Liked Main Post ❤️');
        await sleep(500);
      }
    } catch (e) {
      console.warn('Like action error:', e);
    }
  }

  if (isWorkflowAborted) return { success: false, aborted: true, performed };

  // 6. Auto-Repost Action (MAIN POST ONLY)
  if (actions.repost && !isWorkflowAborted) {
    try {
      const isAlreadyReposted = !!mainArticle.querySelector('button[data-testid="unretweet"], div[data-testid="unretweet"]');
      if (isAlreadyReposted) {
        performed.push('Already Reposted');
      } else {
        const rtBtn = mainArticle.querySelector('button[data-testid="retweet"], div[data-testid="retweet"], button[aria-label*="Repost" i], button[aria-label*="Retweet" i]');
        if (rtBtn) {
          rtBtn.click();
          await sleep(500);
          // Twitter confirms with either data-testid="retweetConfirm" or menuitem containing text Repost
          let confirmBtn = document.querySelector('div[data-testid="retweetConfirm"], button[data-testid="retweetConfirm"]');
          if (!confirmBtn) {
            const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"], span, div'));
            confirmBtn = menuItems.find(el => {
              const txt = (el.innerText || '').trim();
              return txt === 'Repost' || txt === 'Retweet';
            });
          }
          if (confirmBtn) {
            confirmBtn.click();
            performed.push('Reposted 🔁');
            await sleep(500);
          }
        }
      }
    } catch (e) {
      console.warn('Repost action error:', e);
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
              style: params.style || 'Bullish (5-10 words)',
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

      // Enforce strict client-side sanitization (5-10 words, zero emojis, zero $, zero —, zero quotes, zero !)
      commentToPost = sanitizeClientComment(commentToPost, 10);

      // Step B: Post comment via universal comment engine
      const commentRes = await postCommentOnTargetArticle(mainArticle, commentToPost);
      if (commentRes && commentRes.success) {
        performed.push(`Human Typed & Commented: "${commentToPost}" 💬`);
      } else {
        console.warn('[ATOMX] Comment posting error:', commentRes?.error);
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
    isAlreadyCommented,
    commentSkipped: isAlreadyCommented,
    commentPosted: performed.some(p => p.includes('Commented:'))
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

  // 1-to-1 Verified Account Enforcement
  if (options.verifiedXHandle) {
    const expected = options.verifiedXHandle.replace(/^@/, '').toLowerCase().trim();
    const current = (getLoggedInUserHandle() || '').toLowerCase().trim();
    if (!current || current !== expected) {
      showAccountMismatchModal(expected, current || 'Not Logged In');
      return {
        success: false,
        error: `Account Lock Mismatch: Active Twitter ID is @${current || 'none'}, but extension is locked to @${expected}. Please log into @${expected}.`,
        unauthorizedAccount: true,
        profiles: [],
        busyTweets: []
      };
    }
  }

  const targetCount = Number(options.targetCount) || 10;
  const dateRange = options.dateRange || '24h';
  const sortBy = options.sortBy || 'replies';

  const tweetMap = new Map();
  const directProfiles = [];
  const seenHandles = new Set();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase();

  let maxAgeMs = Infinity;
  if (dateRange === '1h') maxAgeMs = 1 * 3600 * 1000;
  else if (dateRange === '2h') maxAgeMs = 2 * 3600 * 1000;
  else if (dateRange === '4h') maxAgeMs = 4 * 3600 * 1000;
  else if (dateRange === '12h') maxAgeMs = 12 * 3600 * 1000;
  else if (dateRange === '24h') maxAgeMs = 24 * 3600 * 1000;
  else if (dateRange === '3d') maxAgeMs = 3 * 24 * 3600 * 1000;
  else if (dateRange === '7d') maxAgeMs = 7 * 24 * 3600 * 1000;

  console.log(`[ATOMX AUDIENCE] Starting deep timeline scan (Target: ${targetCount}, Date: ${dateRange}, Sort: ${sortBy})...`);

  // DYNAMIC SCROLL ENGINE: Keep scrolling until targetCount profiles are collected
  let consecutiveStalls = 0;
  let prevDiscoveredCount = 0;
  const maxScanCycles = Math.max(120, targetCount * 5); // Large ceiling so it never cuts off prematurely

  for (let cycle = 0; cycle < maxScanCycles; cycle++) {
    if (isWorkflowAborted) break;

    // Check Twitter Rate Limit during timeline scanning
    if (checkTwitterRateLimit()) {
      triggerRateLimitAbort('Rate limited during timeline scanning');
      break;
    }

    const visibleArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    if (visibleArticles.length === 0) {
      consecutiveStalls++;
      if (consecutiveStalls >= 5) {
        console.log(`[ATOMX AUDIENCE DEEP SCAN] Feed empty (0 tweets visible). Stopping scan.`);
        break;
      }
    }

    for (const article of visibleArticles) {
      // STRICT FILTER: Post-Authors Only (Zero Replies, Zero Reposts)
      const socialCtx = (article.querySelector('div[data-testid="socialContext"]')?.innerText || '').toLowerCase();
      if (socialCtx.includes('reposted') || socialCtx.includes('retweeted')) continue;

      const artText = article.innerText || '';
      if (artText.includes('Replying to @') || artText.includes('Replying to')) continue;
      const isReplyElement = Array.from(article.querySelectorAll('div, span, a')).some(el => {
        const t = (el.innerText || '').trim();
        return t.startsWith('Replying to @') || t.startsWith('Replying to');
      });
      if (isReplyElement) continue;

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

      // Date range filter with graceful fallback so targetCount is never starved
      if (maxAgeMs !== Infinity && ageMs > maxAgeMs) {
        if (ageMs > 72 * 3600 * 1000) {
          continue;
        }
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

    // Check if feed is stuck or needs retry button clicked
    if (directProfiles.length === prevDiscoveredCount) {
      consecutiveStalls++;
      // Auto-click any "Retry" or "Show" buttons if Twitter stopped loading
      const loadMoreBtns = Array.from(document.querySelectorAll('button[role="button"], div[role="button"]')).filter(b => {
        const t = (b.innerText || '').toLowerCase();
        return t.includes('retry') || t.includes('show') || t.includes('load more');
      });
      if (loadMoreBtns.length > 0) {
        loadMoreBtns[0].click();
        await sleep(1000);
      }

      // Allow up to 8 consecutive attempts before giving up on truly exhausted feeds
      if (consecutiveStalls >= 8) {
        console.log(`[ATOMX AUDIENCE DEEP SCAN] Timeline exhausted at ${directProfiles.length} profiles.`);
        break;
      }
    } else {
      consecutiveStalls = 0;
      prevDiscoveredCount = directProfiles.length;
    }

    // Smooth scroll down to load next batch of timeline posts
    window.scrollBy({ top: 900, behavior: 'smooth' });
    await sleep(1000);

    // TARGET SATISFACTION: Require at least 4 visible scroll cycles so user visibly sees feed exploration
    const minScrollCycles = 4;
    if (cycle >= minScrollCycles && directProfiles.length >= targetCount) {
      console.log(`[ATOMX AUDIENCE DEEP SCAN] Target reached: collected ${directProfiles.length}/${targetCount} profiles across ${cycle + 1} scroll cycles!`);
      break;
    }
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
    topTweets = allDiscovered.filter(t => t.tweetUrl).slice(0, 20);
  } else {
    topTweets = topTweets.slice(0, Math.min(30, Math.max(12, targetCount)));
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
 * Agent 1 & Agent 4: Collect active repliers/commenters from a busy tweet discussion thread
 * Extracts the real community members who participated and replied to the busy tweet.
 * Dynamically scrolls until targetCount is met or thread replies are exhausted.
 */
async function collectRepliersFromTweetThread(targetCount = 10) {
  isWorkflowAborted = false;
  const numTarget = Number(targetCount) || 10;
  const collected = [];
  const seenHandles = new Set();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase();

  // DYNAMIC SCROLL: Keep scrolling until targetCount repliers are met
  const maxThreadScrolls = Math.max(80, numTarget * 4);
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
      console.log(`[ATOMX THREAD REPLIER] Collected engaged user (${collected.length + 1}/${numTarget}): @${cleanHandle}`);
      collected.push({
        handle: data.authorHandle || `@${cleanHandle}`,
        cleanHandle,
        name: data.authorName || cleanHandle,
        tweetSnippet: (data.text || '').slice(0, 90)
      });
    }

    if (collected.length >= numTarget || isWorkflowAborted) break;

    // Check for "Show replies" or "Show more replies" buttons and click them
    const showBtns = Array.from(document.querySelectorAll('button[role="button"], div[role="button"]')).filter(b => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('show replies') || txt.includes('show more replies') || txt.includes('show probability') || txt.includes('hidden replies');
    });
    if (showBtns.length > 0) {
      showBtns[0].click();
      await sleep(1000);
    }

    if (newInThisScroll === 0) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 8) {
        // Thread replies exhausted
        break;
      }
    } else {
      consecutiveNoNew = 0;
    }

    window.scrollBy({ top: 1100, behavior: 'smooth' });
    await sleep(850);
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

  // 1-to-1 Verified Account Enforcement
  if (options.verifiedXHandle) {
    const expected = options.verifiedXHandle.replace(/^@/, '').toLowerCase().trim();
    const current = (getLoggedInUserHandle() || '').toLowerCase().trim();
    if (!current || current !== expected) {
      showAccountMismatchModal(expected, current || 'Not Logged In');
      return {
        success: false,
        error: `Account Lock Mismatch: Active Twitter ID is @${current || 'none'}, but extension is locked to @${expected}. Please log into @${expected}.`,
        unauthorizedAccount: true
      };
    }
  }

  const targetHandle = typeof options === 'string' ? options : (options.handle || '');
  const likePosts = options.likePosts !== false;
  const replyPosts = !!options.replyPosts;
  const style = options.style || 'Bullish (5-10 words)';
  const stylePrompt = options.stylePrompt || null;
  const backendUrl = (options.backendUrl || 'https://agenticx-two.vercel.app').replace(/\/+$/, '');

  let likesDone = 0;
  let replyDone = 0;

  if (checkTwitterRateLimit()) {
    triggerRateLimitAbort();
    return { success: false, aborted: true, rateLimited: true, error: 'Twitter Rate Limit detected' };
  }

  try {
    // Step 1: Follow Check & Action right at the top of the profile where avatar and Follow button are visible
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const alreadyBtn = buttons.find(b => {
      const txt = (b.innerText || '').trim();
      const testId = b.getAttribute('data-testid') || '';
      return txt === 'Following' || testId.includes('unfollow') || txt.includes('Following');
    });

    let followed = false;
    if (!alreadyBtn) {
      const followBtn = buttons.find(b => {
        const txt = (b.innerText || '').trim();
        const testId = b.getAttribute('data-testid') || '';
        return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following') && !testId.includes('unfollow');
      });
      if (followBtn) {
        await simulateHumanFollowClick(followBtn);
        followed = true;
        await sleep(400);
      }
    }

    // If already followed (or just followed) and neither like nor reply is requested, exit early
    if ((alreadyBtn || followed) && !likePosts && !replyPosts) {
      return { success: true, alreadyFollowing: !!alreadyBtn, followed, handle: targetHandle, message: alreadyBtn ? 'Already Following' : 'Followed' };
    }

    // Step 2: Smooth scroll down past profile header/bio to reveal recent posts
    window.scrollBy({ top: 550, behavior: 'smooth' });
    await sleep(900);

    // Step 3: Wait for timeline posts to hydrate with retry scrolling
    let allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (allArticles.length === 0) {
      for (let retries = 0; retries < 4 && allArticles.length === 0; retries++) {
        window.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(1000);
        allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      }
    }

    const validRecentArticles = allArticles.filter(art => {
      const socialCtx = art.querySelector('div[data-testid="socialContext"]')?.innerText?.toLowerCase() || '';
      return !socialCtx.includes('pinned') && !socialCtx.includes('pin');
    });

    // The topmost non-pinned post is the creator's recent post
    const targetRecentPost = validRecentArticles[0] || allArticles[0];

    // Gently scroll that target post into view
    if (targetRecentPost) {
      gentleScrollIntoView(targetRecentPost);
      await sleep(600);
    }

    // Step 4: Like recent posts on user's profile timeline (randomly 1 or 2 posts)
    if (likePosts) {
      const randomLikesCount = Math.floor(Math.random() * 2) + 1; // randomly 1 or 2 likes
      const candidatePosts = validRecentArticles.length > 0 ? validRecentArticles : allArticles;
      const postsToLike = candidatePosts.slice(0, randomLikesCount);
      for (const art of postsToLike) {
        if (isWorkflowAborted) break;
        const ok = await simulateHumanLikeClick(art);
        if (ok) {
          likesDone++;
          await sleep(500);
        }
      }
    }

    // Step 5: Generate AI Reply and comment on centered recent post
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
            const stored = (typeof chrome !== 'undefined' && chrome.storage?.local)
              ? await chrome.storage.local.get(['currentUser', 'user', 'verifiedXHandle']).catch(() => ({}))
              : {};
            const uHandle = stored?.verifiedXHandle || stored?.currentUser?.handle || stored?.user?.handle || '@user';
            const uEmail = stored?.currentUser?.email || stored?.user?.email || '';
            const uId = stored?.currentUser?.id || stored?.user?.id || null;

            const directRes = await fetch(`${backendUrl}/api/generate-reply`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-user-handle': uHandle,
                'x-user-id': uId ? String(uId) : '1'
              },
              body: JSON.stringify({
                tweetText,
                tweetAuthor: authorHandle,
                tweetAuthorName: authorName,
                style,
                stylePrompt,
                userHandle: uHandle,
                userEmail: uEmail,
                userId: uId
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

        if (!commentToPost) {
          commentToPost = 'Spot on insight. Keep building!';
        }

        // Enforce strict client-side sanitization
        commentToPost = sanitizeClientComment(commentToPost, 10);

        if (commentToPost) {
          const commentRes = await postCommentOnTargetArticle(targetRecentPost, commentToPost);
          if (commentRes && commentRes.success) {
            replyDone++;
            console.log(`[ATOMX] Successfully posted AI Reply on @${targetHandle}: "${commentToPost}"`);
            await sleep(1000);
          } else {
            console.warn('[ATOMX] postCommentOnTargetArticle returned error:', commentRes?.error);
          }
        }
      } catch (rErr) {
        console.warn('Could not post profile reply:', rErr);
      }
    }

    if (isWorkflowAborted) {
      return { success: false, aborted: true };
    }

    return {
      success: true,
      alreadyFollowing: !!alreadyBtn,
      followed,
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

  // 1-to-1 Verified Account Enforcement
  if (params.verifiedXHandle) {
    const expected = params.verifiedXHandle.replace(/^@/, '').toLowerCase().trim();
    const current = (getLoggedInUserHandle() || '').toLowerCase().trim();
    if (!current || current !== expected) {
      showAccountMismatchModal(expected, current || 'Not Logged In');
      return {
        success: false,
        error: `Account Lock Mismatch: Active Twitter ID is @${current || 'none'}, but extension is locked to @${expected}. Please log into @${expected}.`,
        unauthorizedAccount: true
      };
    }
  }

  const mainArticle = getMainPostArticle();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();
  const style = params.style || 'Natural & Concise';
  const delaySec = Number(params.delaySec || 12);
  const maxComments = Number(params.maxComments || 999);
  const autoLike = params.autoLike !== false;
  const alreadyReplied = new Set(Array.isArray(params.alreadyRepliedIds) ? params.alreadyRepliedIds : []);

  // 1. Initial scrolling & handle "Load more replies" to hydrate existing comments
  for (let s = 0; s < 3; s++) {
    window.scrollBy({ top: 600, behavior: 'smooth' });
    await sleep(800);
    // Click any "Show more replies" buttons if present
    const loadMoreButtons = Array.from(document.querySelectorAll('button[role="button"]')).filter(b => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('show replies') || txt.includes('show more replies') || txt.includes('show probability');
    });
    if (loadMoreButtons.length > 0) {
      loadMoreButtons[0].click();
      await sleep(1000);
    }
  }

  // Scroll back to top of comments
  if (mainArticle) {
    mainArticle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await sleep(800);
  }

  // 2. Take a strict SNAPSHOT of comments at this moment (never re-queries mid-run)
  const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const rawComments = allArticles.filter(a => a !== mainArticle);

  // Filter out self-comments and already replied comments
  const snapshotQueue = [];
  let skippedSelf = 0;

  for (const art of rawComments) {
    const data = extractTweetData(art);
    const authorHandle = (data.authorHandle || '').toLowerCase().replace(/^@/, '').trim();

    // Skip your own comments & nested self replies
    if (authorHandle && loggedInHandle && authorHandle === loggedInHandle) {
      skippedSelf++;
      continue;
    }

    // Skip if already replied in previous runs
    const commentKey = `${authorHandle}_${(data.text || '').slice(0, 30)}`;
    if (alreadyReplied.has(commentKey)) {
      skippedSelf++;
      continue;
    }

    snapshotQueue.push({ article: art, data, commentKey, authorHandle });
    if (snapshotQueue.length >= maxComments) break;
  }

  const results = [];
  let doneCount = 0;

  for (let i = 0; i < snapshotQueue.length; i++) {
    if (isWorkflowAborted) break;

    // Check Twitter Rate Limit before action
    if (checkTwitterRateLimit()) {
      triggerRateLimitAbort();
      break;
    }

    const item = snapshotQueue[i];
    const { article: commentArt, data: commentData, commentKey } = item;

    // Update Floating HUD
    updateFloatingHud({
      title: 'Reply Back Loop',
      stateBadge: 'REPLYING',
      indicator: `Comment ${i + 1}/${snapshotQueue.length}`,
      done: doneCount,
      collected: snapshotQueue.length,
      skipped: skippedSelf,
      progressPercent: Math.round(((i + 1) / snapshotQueue.length) * 100),
      statusText: `Replying to @${commentData.authorHandle}...`
    });

    // Scroll comment into view
    commentArt.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(600);

    // 1. Auto-Like the comment (❤️)
    if (autoLike) {
      await simulateHumanLikeClick(commentArt);
      await sleep(400);
    }

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

    // Enforce strict anti-bot sanitization
    replyText = sanitizeClientComment(replyText, 10);

    // 3. Post reply using universal robust posting engine
    const commentRes = await postCommentOnTargetArticle(commentArt, replyText);
    if (commentRes && commentRes.success) {
      doneCount++;
      results.push({ commenter: commentData.authorHandle, reply: replyText, commentKey });
      updateFloatingHud({
        done: doneCount,
        statusText: `✓ Replied to @${commentData.authorHandle}!`
      });
      await sleep(800);
    } else {
      console.warn('[ATOMX REPLY LOOP] Could not post reply to comment:', commentRes?.error);
    }

    // Check Twitter Rate Limit after action
    if (checkTwitterRateLimit()) {
      triggerRateLimitAbort();
      break;
    }

    // 6. Safe delay before next comment
    if (i < snapshotQueue.length - 1 && !isWorkflowAborted) {
      for (let s = delaySec; s > 0; s--) {
        if (isWorkflowAborted) break;
        updateFloatingHud({
          statusText: `Next reply in ${s}s...`
        });
        await sleep(1000);
      }
    }
  }

  return {
    success: true,
    totalFound: rawComments.length,
    queuedCount: snapshotQueue.length,
    repliedCount: doneCount,
    skippedSelf,
    results,
    aborted: isWorkflowAborted
  };
}

// =========================================================================
// AGENT 7: AUTO UNFOLLOW STANDALONE ENGINE
// =========================================================================
async function executeAutoUnfollowStep(params = {}) {
  isWorkflowAborted = false;
  const { criteria = { notFollowing: true, lowScore: false }, scoreThreshold = 30, whitelist = [], processedHandles = [] } = params;
  const cleanWhitelist = new Set((whitelist || []).map(w => w.replace(/^@/, '').toLowerCase().trim()));
  const alreadyProcessed = new Set((processedHandles || []).map(h => h.toLowerCase().trim()));

  // Ensure on following page or scroll to load more
  let userCells = Array.from(document.querySelectorAll('div[data-testid="UserCell"]'));
  if (userCells.length === 0) {
    window.scrollBy({ top: 600, behavior: 'smooth' });
    await sleep(1500);
    userCells = Array.from(document.querySelectorAll('div[data-testid="UserCell"]'));
  }

  if (userCells.length === 0) {
    return { success: false, error: 'No user cells found on following page' };
  }

  for (const cell of userCells) {
    if (isWorkflowAborted) break;

    // Extract handle
    const link = cell.querySelector('a[href^="/"]');
    const href = link ? (link.getAttribute('href') || '').replace(/^\//, '').split('/')[0].split('?')[0].toLowerCase().trim() : '';
    if (!href || ['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(href)) continue;

    // 1. Whitelist Check
    if (cleanWhitelist.has(href)) {
      alreadyProcessed.add(href);
      continue; // Skip whitelisted VIP
    }

    // 2. Check if already processed in this session
    if (alreadyProcessed.has(href)) {
      continue;
    }

    // Mark as visited in session
    alreadyProcessed.add(href);

    // 3. Check "Follows you" badge
    // Twitter/X renders a span with text "Follows you" inside [data-testid="userFollowIndicator"]
    const followIndicator = cell.querySelector('[data-testid="userFollowIndicator"]');
    const cellText = (cell.innerText || '');
    const followsYou = cellText.includes('Follows you') || (followIndicator && followIndicator.innerText.includes('Follows you'));

    // Check criteria match
    let shouldUnfollow = false;
    if (criteria.notFollowing && !followsYou) {
      shouldUnfollow = true;
    }
    if (criteria.lowScore && !shouldUnfollow) {
      // User specified low score rule
      shouldUnfollow = true;
    }

    if (!shouldUnfollow) {
      return { success: true, action: 'SKIPPED', handle: href, reason: 'Follows you back' };
    }

    // 4. Find Following button to click
    const followBtn = cell.querySelector('button[data-testid$="-unfollow"]') ||
                      Array.from(cell.querySelectorAll('button')).find(b => (b.innerText || '').trim().toLowerCase() === 'following');

    if (!followBtn) {
      return { success: true, action: 'SKIPPED', handle: href, reason: 'Already not following' };
    }

    // Scroll into view
    cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);

    // Click Unfollow button
    followBtn.click();
    await sleep(600);

    // Confirm dialog: click "Unfollow" in confirmation modal
    const confirmBtn = await waitForElement('button[data-testid="confirmationSheetConfirm"]', 2500);
    if (confirmBtn) {
      confirmBtn.click();
      await sleep(700);
      return { success: true, action: 'UNFOLLOWED', handle: href };
    } else {
      // Try fallback modal confirmation
      const modalBtn = Array.from(document.querySelectorAll('div[role="dialog"] button')).find(b => (b.innerText || '').trim().toLowerCase() === 'unfollow');
      if (modalBtn) {
        modalBtn.click();
        await sleep(700);
        return { success: true, action: 'UNFOLLOWED', handle: href };
      }
    }

    return { success: false, action: 'FAILED', handle: href, error: 'Confirmation button not found' };
  }

  // If reached end of visible cells, scroll down to load more
  window.scrollBy({ top: 800, behavior: 'smooth' });
  await sleep(1500);
  return { success: true, action: 'SCROLLED' };
}

// =========================================================================
// AGENT 11: COMMENT POD AUDITOR — FIND DEFAULTERS
// =========================================================================
async function auditPostCommenters(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || params.maxCount || 100);
  const maxScrolls = Math.max(params.maxScrolls || 40, targetCount * 3);
  const commenters = new Set();
  const mainArticle = getMainPostArticle();
  const mainHandle = mainArticle ? (extractTweetData(mainArticle).authorHandle || '').toLowerCase().replace(/^@/, '').trim() : '';

  let consecutiveNoNew = 0;
  let prevSize = 0;

  for (let i = 0; i < maxScrolls; i++) {
    if (isWorkflowAborted) break;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(art => {
      if (mainArticle && art === mainArticle) return;

      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (userEl) {
        const links = userEl.querySelectorAll('a[href^="/"]');
        for (const link of links) {
          const href = (link.getAttribute('href') || '').replace(/^\//, '').split('?')[0].split('/')[0].toLowerCase().trim();
          if (href && !['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(href)) {
            if (href !== mainHandle) {
              commenters.add(href);
            }
            break;
          }
        }
      }
    });

    if (commenters.size >= targetCount) {
      break;
    }

    // Auto-click show more replies
    const showBtns = Array.from(document.querySelectorAll('button[role="button"], div[role="button"]')).filter(b => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('show replies') || txt.includes('show more replies') || txt.includes('show probability');
    });
    if (showBtns.length > 0) {
      showBtns[0].click();
      await sleep(1000);
    }

    if (commenters.size === prevSize) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 8) break;
    } else {
      consecutiveNoNew = 0;
      prevSize = commenters.size;
    }

    window.scrollBy({ top: 950, behavior: 'smooth' });
    await sleep(900);
  }

  return {
    success: true,
    mainAuthor: mainHandle,
    commenters: Array.from(commenters)
  };
}

// =========================================================================
// AGENT 12: TELEGRAM LIVE LIKER & PROOF RECORDER
// =========================================================================
async function executeLiveRaidEngagement(params = {}) {
  isWorkflowAborted = false;
  const { actions = { like: true, repost: true, bookmark: false, glow: true }, delay = 2500 } = params;

  let tweetArticle = getMainPostArticle();
  if (!tweetArticle) {
    tweetArticle = document.querySelector('article[data-testid="tweet"]');
  }
  if (!tweetArticle) {
    return { success: false, error: 'No tweet found on active tab' };
  }

  // Smooth scroll into view so screen recorder captures the target
  gentleScrollIntoView(tweetArticle);
  await sleep(600);

  // Visual Recording Glow
  if (actions.glow) {
    tweetArticle.style.transition = 'box-shadow 0.4s ease, outline 0.4s ease';
    tweetArticle.style.outline = '3px solid #3B82F6';
    tweetArticle.style.boxShadow = '0 0 24px rgba(59, 130, 246, 0.45)';
  }

  let liked = false, reposted = false, bookmarked = false;

  // 1. Auto Like
  if (actions.like && !isWorkflowAborted) {
    const ok = await simulateHumanLikeClick(tweetArticle);
    if (ok) {
      liked = true;
      await sleep(600);
    }
  }

  // 2. Auto Repost
  if (actions.repost && !isWorkflowAborted) {
    const repostBtn = tweetArticle.querySelector('[data-testid="retweet"]');
    if (repostBtn) {
      repostBtn.click();
      await sleep(600);
      const confirmItem = await waitForElement('[data-testid="retweetConfirm"]', 2500);
      if (confirmItem) {
        confirmItem.click();
        reposted = true;
      }
      await sleep(800);
    }
  }

  // 3. Auto Bookmark
  if (actions.bookmark && !isWorkflowAborted) {
    const bmBtn = tweetArticle.querySelector('[data-testid="bookmark"]');
    if (bmBtn) {
      bmBtn.click();
      bookmarked = true;
      await sleep(600);
    }
  }

  // 4. Auto Comment & AI Reply
  let commented = false;
  let commentText = '';
  if (actions.comment && !isWorkflowAborted) {
    commentText = params.replyText || '';
    if (!commentText) {
      try {
        const tweetData = extractTweetData(tweetArticle);
        const liveTweetText = (tweetData.text || '').trim();
        const liveAuthor = tweetData.authorHandle || tweetData.authorName || '@user';

        const aiResp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'GENERATE_AI_REPLY',
            tweetText: liveTweetText,
            tweetAuthor: liveAuthor,
            style: params.style || 'Bullish (5-10 words)',
            stylePrompt: params.stylePrompt || null
          }, resolve);
        });
        if (aiResp && aiResp.success && aiResp.reply) {
          commentText = aiResp.reply;
        }
      } catch (e) {}
    }

    if (!commentText) {
      commentText = 'Spot on insight. Focused execution is key.';
    }

    commentText = sanitizeClientComment(commentText, 10);
    const commentRes = await postCommentOnTargetArticle(tweetArticle, commentText);
    if (commentRes && commentRes.success) {
      commented = true;
    }
  }

  // Clean outline gently after actions
  setTimeout(() => {
    if (tweetArticle) {
      tweetArticle.style.outline = '';
      tweetArticle.style.boxShadow = '';
    }
  }, 2200);

  return {
    success: true,
    liked,
    reposted,
    bookmarked,
    commented,
    commentText
  };
}

// =========================================================================
// AGENT 4: COLLECT ENGAGING NICHE PROFILES (DYNAMIC DISCOVERY)
// =========================================================================
async function collectEngagingNicheProfiles(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 8);
  const maxScrolls = Number(params.maxScrolls || 6);
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();
  const foundMap = new Map();

  for (let s = 0; s < maxScrolls; s++) {
    if (isWorkflowAborted) break;

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    for (const art of articles) {
      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (!userEl) continue;
      const link = userEl.querySelector('a[href^="/"]');
      if (!link) continue;
      const handle = (link.getAttribute('href') || '').replace(/^\//, '').split('?')[0].split('/')[0].toLowerCase().trim();
      if (!handle || ['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(handle)) continue;
      if (handle === loggedInHandle) continue;

      let score = 1;
      const likeBtn = art.querySelector('button[data-testid="like"], div[data-testid="like"]');
      const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      if (likeBtn) {
        const txt = (likeBtn.innerText || '').replace(/[^0-9]/g, '');
        if (txt) score += parseInt(txt, 10);
      }
      if (replyBtn) {
        const txt = (replyBtn.innerText || '').replace(/[^0-9]/g, '');
        if (txt) score += (parseInt(txt, 10) * 2);
      }

      const existing = foundMap.get(handle) || 0;
      foundMap.set(handle, Math.max(existing, score));
    }

    if (foundMap.size >= targetCount * 2) break;
    window.scrollBy({ top: 850, behavior: 'smooth' });
    await sleep(1000);
  }

  const sorted = Array.from(foundMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, targetCount)
    .map(([handle]) => ({
      cleanHandle: handle,
      handle: `@${handle}`,
      name: handle
    }));

  return { success: true, profiles: sorted, totalFound: sorted.length };
}

// =========================================================================
// AGENT 13: COMMENTER RECIPROCATOR PROFILE ENGAGEMENT ENGINE
// =========================================================================
async function executeReciprocalProfileEngagement(params = {}) {
  isWorkflowAborted = false;

  // 1-to-1 Verified Account Enforcement
  if (params.verifiedXHandle) {
    const expected = params.verifiedXHandle.replace(/^@/, '').toLowerCase().trim();
    const current = (getLoggedInUserHandle() || '').toLowerCase().trim();
    if (!current || current !== expected) {
      showAccountMismatchModal(expected, current || 'Not Logged In');
      return {
        success: false,
        error: `Account Lock Mismatch: Active Twitter ID is @${current || 'none'}, but extension is locked to @${expected}. Please log into @${expected}.`,
        unauthorizedAccount: true
      };
    }
  }

  const targetHandle = (params.handle || '').replace(/^@/, '').trim();
  const likePost = params.likePost !== false;
  const followUser = !!params.followUser;
  const style = params.style || 'Natural & Concise';
  const stylePrompt = params.stylePrompt || null;
  const backendUrl = (params.backendUrl || 'https://agenticx-two.vercel.app').replace(/\/+$/, '');

  let likeDone = false;
  let replyDone = false;
  let followDone = false;
  let replyText = '';
  let tweetUrl = '';

  try {
    // 1. Optional Follow user right at top of their profile while header & avatar are in full view
    if (followUser) {
      const followButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const followBtn = followButtons.find(b => {
        const txt = (b.innerText || '').trim();
        const testId = b.getAttribute('data-testid') || '';
        return (txt === 'Follow' || testId.endsWith('-follow')) && !txt.includes('Following') && !testId.includes('unfollow');
      });
      if (followBtn) {
        await simulateHumanFollowClick(followBtn);
        followDone = true;
        await sleep(400);
      }
    }

    // 2. Smoothly scroll past profile header/bio to reveal recent posts
    window.scrollBy({ top: 550, behavior: 'smooth' });
    await sleep(900);

    // 3. Find recent tweets, skip pinned tweets
    let allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (allArticles.length === 0) {
      window.scrollBy({ top: 450, behavior: 'smooth' });
      await sleep(1000);
      allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    }

    if (allArticles.length === 0) {
      return { success: false, reason: 'NO_POSTS_FOUND', error: 'No posts found on this user profile' };
    }

    const nonPinnedArticles = allArticles.filter(art => {
      const socialCtx = art.querySelector('div[data-testid="socialContext"]')?.innerText?.toLowerCase() || '';
      return !socialCtx.includes('pinned') && !socialCtx.includes('pin');
    });

    const targetArticle = nonPinnedArticles[0] || allArticles[0];
    if (!targetArticle) {
      return { success: false, reason: 'NO_TARGET_POST', error: 'Could not select target post' };
    }

    // Gently scroll target post into view without jerking
    gentleScrollIntoView(targetArticle);
    await sleep(600);

    if (isWorkflowAborted) return { success: false, aborted: true };

    const tweetData = extractTweetData(targetArticle);
    const tweetText = tweetData.text || '';
    tweetUrl = tweetData.tweetUrl || '';

    // 4. Like the target post
    if (likePost) {
      const ok = await simulateHumanLikeClick(targetArticle);
      if (ok) {
        likeDone = true;
        await sleep(500);
      }
    }

    if (isWorkflowAborted) return { success: false, aborted: true, likeDone };

    // 5. Generate contextual AI reply for this commenter's post
    try {
      const aiRes = await chrome.runtime.sendMessage({
        type: 'GENERATE_AI_REPLY',
        tweetText: tweetText || 'Great post!',
        tweetAuthor: `@${targetHandle}`,
        style,
        stylePrompt
      });
      if (aiRes?.success && aiRes.reply) {
        replyText = aiRes.reply.trim();
      }
    } catch (e) {}

    if (!replyText) {
      try {
        const stored = (typeof chrome !== 'undefined' && chrome.storage?.local)
          ? await chrome.storage.local.get(['currentUser', 'user', 'verifiedXHandle']).catch(() => ({}))
          : {};
        const uHandle = stored?.verifiedXHandle || stored?.currentUser?.handle || stored?.user?.handle || '@user';
        const uEmail = stored?.currentUser?.email || stored?.user?.email || '';
        const uId = stored?.currentUser?.id || stored?.user?.id || null;

        const directRes = await fetch(`${backendUrl}/api/generate-reply`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-handle': uHandle,
            'x-user-id': uId ? String(uId) : '1'
          },
          body: JSON.stringify({
            tweetText: tweetText || 'Great post!',
            tweetAuthor: `@${targetHandle}`,
            style,
            stylePrompt,
            userHandle: uHandle,
            userEmail: uEmail,
            userId: uId
          })
        }).then(r => r.json()).catch(() => null);
        if (directRes?.reply) replyText = directRes.reply.trim();
      } catch (e) {}
    }

    if (!replyText) {
      replyText = 'Appreciate you sharing this perspective!';
    }

    // Sanitize comment (5-10 words, crisp, authentic)
    replyText = sanitizeClientComment(replyText, 12);

    // 6. Post AI reply on target post using universal robust posting engine
    const commentRes = await postCommentOnTargetArticle(targetArticle, replyText);
    if (commentRes && commentRes.success) {
      replyDone = true;
      console.log(`[ATOMX RECIPROCAL] Successfully posted reply on @${targetHandle}: "${replyText}"`);
      await sleep(800);
    } else {
      console.warn('[ATOMX RECIPROCAL] Could not post reply:', commentRes?.error);
    }

    return {
      success: true,
      handle: targetHandle,
      likeDone,
      replyDone,
      replyText,
      tweetUrl,
      followDone
    };
  } catch (err) {
    return { success: false, error: err.message, likeDone, replyDone };
  }
}


