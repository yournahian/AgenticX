/**
 * ATOMX ENGAGE — TWITTER / X CONTENT SCRIPT
 * Injects one-click AI reply buttons into Twitter/X interface and handles DOM extraction.
 */

console.log('ATOMX ENGAGE content script active on Twitter/X.');

function isExtensionValid() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

// Observe DOM changes to inject ATOMX buttons into tweet action toolbars
const observer = new MutationObserver(() => {
  if (!isExtensionValid()) {
    try { observer.disconnect(); } catch (e) {}
    return;
  }
  injectAtomXButtons();
});

if (isExtensionValid()) {
  observer.observe(document.body, { childList: true, subtree: true });
}

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

  if (!authorHandle) {
    const userLink = article.querySelector('div[data-testid="User-Name"] a[role="link"], div[data-testid*="UserAvatar"] a[href^="/"], a[role="link"][href^="/"]');
    if (userLink) {
      const href = (userLink.getAttribute('href') || '').replace(/^\//, '').split('/')[0].split('?')[0];
      if (href && !['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(href.toLowerCase())) {
        authorHandle = `@${href}`;
      }
    }
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
let isWorkflowItemSkipped = false;

// Human-like typing delay simulator with instant pause & abort support
async function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (isWorkflowAborted || isWorkflowItemSkipped) break;
    // If paused via HUD or extension, freeze here until resumed
    while (isHudWorkflowPaused && !isWorkflowAborted && !isWorkflowItemSkipped) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (isWorkflowAborted || isWorkflowItemSkipped) break;
    const remaining = Math.min(100, ms - (Date.now() - start));
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }
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
 * Detect the logged-in user's Twitter handle from navigation/profile links.
 * Supports both Desktop and Mobile browsers (Kiwi, Lemur, Mises, Yandex).
 */
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

function getLoggedInUserHandle() {
  const RESERVED_X_PATHS = [
    'home', 'explore', 'notifications', 'messages', 'i', 'compose',
    'settings', 'search', 'hashtag', 'lists', 'communities', 'verified-orgs-signup', 'login', 'signup',
    'unknown', 'undefined', 'null', 'user', 'none', 'jobs', 'premium'
  ];

  try {
    // 1. Desktop & Tablet Primary Navigation: a[data-testid="AppTabBar_Profile_Link"]
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (isValidTwitterHandle(clean)) {
        return clean;
      }
    }

    // 2. Desktop SideNav Account Switcher: button or div[data-testid="SideNav_AccountSwitcher_Button"]
    const switcher = document.querySelector('div[data-testid="SideNav_AccountSwitcher_Button"], button[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      const text = switcher.innerText || switcher.textContent || '';
      const match = text.match(/@([\w_]{1,30})/);
      if (match && isValidTwitterHandle(match[1])) return match[1].toLowerCase();
    }

    // 3. Mobile Navigation Drawer Profile Link: a[data-testid="SideNav_Profile_Link"]
    const sideNavProfile = document.querySelector('a[data-testid="SideNav_Profile_Link"]');
    if (sideNavProfile) {
      const href = sideNavProfile.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (isValidTwitterHandle(clean)) {
        return clean;
      }
    }

    // 4. Mobile Drawer Account Switcher (if mounted):
    const mobileDrawerSwitcher = document.querySelector('div[data-testid="AccountSwitcher_Account_Button"]');
    if (mobileDrawerSwitcher) {
      const text = mobileDrawerSwitcher.innerText || mobileDrawerSwitcher.textContent || '';
      const match = text.match(/@([\w_]{1,30})/);
      if (match && isValidTwitterHandle(match[1])) return match[1].toLowerCase();
    }

    // 5. Mobile Top Bar User Menu Avatar (button[data-testid="TopNavBar_UserMenu_Button"]):
    const topUserMenu = document.querySelector('div[data-testid="TopNavBar_UserMenu_Button"], button[data-testid="TopNavBar_UserMenu_Button"]');
    if (topUserMenu) {
      const aria = topUserMenu.getAttribute('aria-label') || '';
      const match = aria.match(/@([\w_]{1,30})/);
      if (match && isValidTwitterHandle(match[1])) return match[1].toLowerCase();
      const img = topUserMenu.querySelector('img');
      const alt = (img?.getAttribute('alt') || '').trim();
      const altMatch = alt.match(/@([\w_]{1,30})/);
      if (altMatch && isValidTwitterHandle(altMatch[1])) return altMatch[1].toLowerCase();
    }

    // 6. Tweet Status Page: User's own avatar in the inline reply box (universal on PC and Mobile)
    const inlineReplyUser = document.querySelector('div[data-testid="inline_reply"] a[role="link"][href^="/"]');
    if (inlineReplyUser) {
      const href = inlineReplyUser.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (isValidTwitterHandle(clean)) {
        return clean;
      }
    }

    // 7. Primary Navigation bar specifically (scoped to navigation container only, NEVER whole header):
    const navProfileLink = document.querySelector('nav[aria-label="Primary Navigation"] a[href^="/"][aria-label*="Profile" i], nav a[href^="/"][aria-label*="Profile" i]');
    if (navProfileLink) {
      const href = navProfileLink.getAttribute('href') || '';
      const clean = href.replace(/^\//, '').split('/')[0].split('?')[0].replace('@', '').trim().toLowerCase();
      if (isValidTwitterHandle(clean)) return clean;
    }

    // 8. Twitter React avatar container testid: data-testid="UserAvatar-Container-<handle>"
    const topAvatarContainer = document.querySelector(
      'button[data-testid="TopNavBar_UserMenu_Button"] [data-testid^="UserAvatar-Container-"], ' +
      'div[data-testid="TopNavBar_UserMenu_Button"] [data-testid^="UserAvatar-Container-"], ' +
      '[data-testid="TopNavBar"] [data-testid^="UserAvatar-Container-"], ' +
      'header [data-testid^="UserAvatar-Container-"], ' +
      'div[data-testid="inline_reply"] [data-testid^="UserAvatar-Container-"]'
    );
    if (topAvatarContainer) {
      const tid = topAvatarContainer.getAttribute('data-testid') || '';
      const match = tid.match(/UserAvatar-Container-([\w_]{1,30})/i);
      if (match && isValidTwitterHandle(match[1])) {
        return match[1].toLowerCase();
      }
    }
  } catch (e) {}
  return null;
}

function isDefinitelyLoggedOut() {
  try {
    return !!document.querySelector(
      'a[data-testid="loginButton"], a[href*="/login"], a[data-testid="signupButton"], div[data-testid="BottomBar"] a[href*="/login"], div[data-testid="LoggedOutBottomBar"]'
    );
  } catch (e) {
    return false;
  }
}

async function waitForLoggedInUserHandle(timeoutMs = 2500) {
  let h = getLoggedInUserHandle();
  if (h) return h;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(250);
    h = getLoggedInUserHandle();
    if (h) return h;
  }
  return null;
}

function showAccountMismatchModal(expectedHandle, actualHandle) {
  if (!isValidTwitterHandle(actualHandle) && actualHandle !== 'Not Logged In') return;
  const existing = document.getElementById('atomx-account-mismatch-banner');
  if (existing) existing.remove();

  // Route lock warning strictly inside the Extension (do not pollute Twitter DOM)
  chrome.storage.local.set({
    atomx_account_lock_warning: {
      expected: expectedHandle,
      current: actualHandle,
      timestamp: Date.now()
    }
  }).catch(() => null);

  chrome.runtime.sendMessage({
    type: 'ACCOUNT_LOCK_WARNING',
    expected: expectedHandle,
    current: actualHandle
  }).catch(() => null);
}

async function verifyAccountLockOrAbort(expectedHandle) {
  if (!expectedHandle) return { ok: true };
  const expected = expectedHandle.replace(/^@/, '').toLowerCase().trim();
  const rawCurrent = await waitForLoggedInUserHandle(2500);
  const current = (rawCurrent || '').toLowerCase().trim();

  // ONLY lock if current is a REAL, VALID Twitter handle that genuinely differs from expected!
  if (isValidTwitterHandle(current) && current !== expected) {
    showAccountMismatchModal(expected, current);
    return {
      ok: false,
      error: `Account Lock Mismatch: Active Twitter ID is @${current}, but extension is locked to @${expected}. Please log into @${expected}.`,
      unauthorizedAccount: true
    };
  }
  if (!isValidTwitterHandle(current) && isDefinitelyLoggedOut()) {
    showAccountMismatchModal(expected, 'Not Logged In');
    return {
      ok: false,
      error: `Please log into your verified Twitter account (@${expected}) on x.com.`,
      unauthorizedAccount: true
    };
  }
  // Clear any stale warning since session is valid
  chrome.storage?.local?.remove('atomx_account_lock_warning').catch(() => null);
  return { ok: true, current: expected };
}

/**
 * Check if the logged-in user has already replied/commented on this tweet
 */
function hasUserAlreadyCommented(myHandle) {
  if (!myHandle || typeof myHandle !== 'string') return false;
  const cleanHandle = myHandle.replace(/^@+/, '').trim().toLowerCase();
  // Never false-positive match reserved words, routes, or single-character strings
  if (cleanHandle.length < 3 || ['i', 'user', 'home', 'explore', 'notifications', 'messages', 'compose', 'settings', 'premium', 'jobs', 'lists', 'unknown'].includes(cleanHandle)) {
    return false;
  }

  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (articles.length <= 1) return false;

  // The main focal tweet is identified so we only inspect actual reply/comment articles
  const mainArticle = getMainPostArticle() || articles[0];
  const comments = articles.filter(a => a !== mainArticle);

  return comments.some(c => {
    // 1. Direct profile links in the comment author header (e.g. href="/KhanWg60464")
    const links = Array.from(c.querySelectorAll('a[href]'));
    const hasProfileLink = links.some(a => {
      const href = (a.getAttribute('href') || '').toLowerCase().replace(/^\/+/, '').split('?')[0].split('/')[0];
      return href === cleanHandle;
    });
    if (hasProfileLink) return true;

    // 2. Avatar container testid: UserAvatar-Container-<handle>
    const avatarEl = c.querySelector(`[data-testid*="${cleanHandle}" i]`);
    if (avatarEl) return true;

    // 3. User-Name testid text content (e.g. "Wg saim Khan @KhanWg60464")
    const userEl = c.querySelector('div[data-testid="User-Name"]');
    if (userEl) {
      const txt = userEl.innerText.toLowerCase();
      const regex = new RegExp(`@${cleanHandle}(?:\\b|[^a-zA-Z0-9_]|$)`, 'i');
      if (regex.test(txt)) return true;
    }

    // 4. Comment author header area text
    const fullText = (c.innerText || '').toLowerCase();
    const commentHeader = fullText.slice(0, 300);
    const regex = new RegExp(`@${cleanHandle}(?:\\b|[^a-zA-Z0-9_]|$)`, 'i');
    if (regex.test(commentHeader)) return true;

    return false;
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
 * Natural Human Smooth Scrolling Engine:
 * Simulates genuine physical mousewheel / trackpad / touch strokes with:
 * - Variable stroke flick distances (140px - 220px per stroke)
 * - Cubic velocity deceleration curves (easing)
 * - 60fps micro-steps (15-25ms intervals)
 * - Organic human pauses between strokes (as a person scans reading material)
 * NEVER violently jumps, snaps, or jerks the viewport ("akbae tan diya chole ashe na").
 */
async function humanSmoothScroll(distance, options = {}) {
  const isUp = distance < 0;
  const absDist = Math.abs(distance);
  if (absDist < 6) return;

  const flickBase = options.flickSize || (110 + Math.random() * 45);
  const numFlicks = Math.max(1, Math.round(absDist / flickBase));
  const flickDist = absDist / numFlicks;

  for (let f = 0; f < numFlicks; f++) {
    if (isWorkflowAborted || isWorkflowItemSkipped) break;

    const steps = 14 + Math.floor(Math.random() * 5); // 14-18 smooth micro-steps per stroke
    const thisFlickTarget = (f === numFlicks - 1) ? (absDist - f * flickDist) : flickDist;

    let traveled = 0;
    for (let s = 1; s <= steps; s++) {
      if (isWorkflowAborted || isWorkflowItemSkipped) break;
      const t = s / steps;
      // Smooth cubic ease-out curve
      const ease = 1 - Math.pow(1 - t, 3);
      const stepTarget = Math.round(thisFlickTarget * ease);
      const delta = stepTarget - traveled;
      traveled = stepTarget;

      if (delta !== 0) {
        window.scrollBy(0, isUp ? -delta : delta);
      }
      await sleep(22 + Math.floor(Math.random() * 14)); // 22-36ms per micro-step
    }

    if (f < numFlicks - 1) {
      await sleep(180 + Math.floor(Math.random() * 140)); // Leisurely human pause between strokes
    }
  }

  await sleep(options.settlePause || 250);
}

/**
 * Human-like smooth alignment: scrolls the element into comfortable viewport position
 * using natural human strokes without any violent instant snapping.
 */
async function humanScrollElementIntoView(element, position = 'center') {
  if (!element || typeof element.getBoundingClientRect !== 'function') return false;
  try {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let rect = element.getBoundingClientRect();

    let targetY = 0;
    if (position === 'center') {
      targetY = rect.top - (vh / 2 - rect.height / 2);
    } else if (position === 'top') {
      targetY = rect.top - 100;
    } else if (position === 'bottom') {
      targetY = rect.bottom - (vh - 90);
    } else {
      if (rect.top >= 90 && rect.bottom <= vh - 70) return true; // Already comfortably in view
      targetY = rect.top < 90 ? (rect.top - 110) : (rect.bottom - (vh - 90));
    }

    if (Math.abs(targetY) < 18) return true; // Already in comfortable position

    await humanSmoothScroll(Math.round(targetY), { settlePause: 220 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Non-blocking gentle scroll helper using human smooth scrolling
 */
function gentleScrollIntoView(element) {
  if (!element) return;
  try {
    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 90 && rect.bottom <= vh - 60) return;
    humanScrollElementIntoView(element, 'center');
  } catch (e) {}
}

/**
 * Global Rule: First smoothly scroll target post and its like/action button into viewport,
 * wait for scroll animation to settle so the button is visibly shown on screen, and THEN engage.
 */
async function scrollElementIntoViewAndEnsureVisible(element, blockPosition = 'center') {
  if (!element) return false;
  return await humanScrollElementIntoView(element, blockPosition);
}

/**
 * Natural human-like reading scroll for tweet status pages.
 * Smoothly scrolls down through the tweet text to bring the action toolbar
 * (like/repost) and reply/comment composer comfortably into the lower-middle viewport.
/**
 * Smart Viewport Alignment (Screenshot 2 Standard):
 * Positions the page so that:
 * 1. The tweet content/media is visible in the upper-to-middle screen.
 * 2. The action bar (Like, Retweet, Reply) is visible in the lower-middle screen.
 * 3. The inline comment box ("Post your reply") is comfortably visible right below the action bar.
 * Guarantees the like button and comment box are never pushed to the bottom edge or hidden (Screenshot 1).
 */
async function ensurePostAndActionsInView(mainArticle, targetButton = null) {
  if (!mainArticle || isWorkflowAborted || isWorkflowItemSkipped) return;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const isStatusPage = window.location.pathname.includes('/status/');

  try {
    const inlineReply = document.querySelector('div[data-testid="inline_reply"]') ||
                        document.querySelector('div[data-testid="tweetTextarea_0"]')?.closest('div[role="group"]') ||
                        document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                        mainArticle.querySelector('div[role="group"]');

    const btn = targetButton ||
                mainArticle.querySelector('button[data-testid="like"], button[data-testid="unlike"]') ||
                mainArticle.querySelector('div[role="group"]');

    if (isStatusPage && inlineReply && btn) {
      const btnRect = btn.getBoundingClientRect();
      const replyRect = inlineReply.getBoundingClientRect();

      // Check if already in ideal layout (like Screenshot 2):
      // Like button is clearly visible in viewport, and reply container is visible above bottom edge
      const isAlreadyIdeal = (btnRect.top >= 70 && btnRect.bottom <= vh - 70) &&
                             (replyRect.top >= 100 && replyRect.bottom <= vh - 15);

      if (isAlreadyIdeal) {
        await sleep(250);
        return;
      }

      // Calculate target scroll position so the inline reply container sits comfortably at ~75% - 82% of viewport height.
      // This positions the Like button right above it at ~55% - 65% of viewport height (exact Screenshot 2 layout).
      const deltaY = targetY - window.scrollY;
      if (Math.abs(deltaY) > 25) {
        await humanSmoothScroll(Math.round(deltaY), { settlePause: 220 });
      }
      return;
    }

    // Fallback for feeds/timeline posts: ensure action button is centered
    if (btn) {
      await humanScrollElementIntoView(btn, 'center');
    }
  } catch (err) {
    console.warn('[ATOMX] ensurePostAndActionsInView error:', err);
  }
}

/**
 * Natural human-like reading scroll for tweet status pages.
 * Smoothly scrolls down to ensure the action toolbar and comment box sit together (Screenshot 2).
 */
async function smoothScrollPostForReading(mainArticle) {
  if (!mainArticle) {
    window.scrollBy({ top: 380, behavior: 'smooth' });
    await sleep(800);
    return;
  }
  await ensurePostAndActionsInView(mainArticle);
}

// ─────────────────────────────────────────────────────────────────────────────
// HYBRID HUMANIZED ACTION ENGINE (MODE A: VIRTUAL CURSOR | MODE B: CDP DEBUGGER)
// ─────────────────────────────────────────────────────────────────────────────

let virtualCursorEl = null;
let currentCursorPos = { x: -100, y: -100 };
let isCursorAnimating = false;
let lastScrollTime = 0;

function injectVirtualCursorStylesFallback() {
  if (document.getElementById('atomx-virtual-cursor-styles')) return;
  const style = document.createElement('style');
  style.id = 'atomx-virtual-cursor-styles';
  style.textContent = `
    .atomx-virtual-cursor {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      user-select: none !important;
      will-change: transform !important;
      transition: transform 0.04s linear;
    }
    .atomx-cursor-icon-wrap {
      position: relative !important;
      display: inline-block !important;
      transform-origin: 4px 4px !important;
      transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    }
    .atomx-cursor-icon-wrap.atomx-cursor-pressed {
      transform: scale(0.82) !important;
    }
    .atomx-cursor-svg {
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 8px rgba(56, 189, 248, 0.65)) !important;
      display: block !important;
    }
    .atomx-cursor-badge {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 9.5px !important;
      font-weight: 700 !important;
      background: rgba(15, 23, 42, 0.9) !important;
      color: #38BDF8 !important;
      border: 1px solid rgba(56, 189, 248, 0.45) !important;
      border-radius: 9999px !important;
      padding: 1.5px 7px !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
      letter-spacing: 0.3px !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      animation: atomxPulseBadge 2.5s infinite ease-in-out !important;
    }
    @keyframes atomxPulseBadge {
      0%, 100% { border-color: rgba(56, 189, 248, 0.45); }
      50% { border-color: rgba(56, 189, 248, 0.85); box-shadow: 0 0 10px rgba(56, 189, 248, 0.3); }
    }
    .atomx-cursor-ripple {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 22px !important;
      height: 22px !important;
      border-radius: 50% !important;
      border: 2px solid #38BDF8 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translate(-30%, -30%) scale(0.2) !important;
    }
    .atomx-cursor-ripple.atomx-ripple-active {
      animation: atomxRippleAnim 0.45s ease-out forwards !important;
    }
    @keyframes atomxRippleAnim {
      0% {
        transform: translate(-30%, -30%) scale(0.2);
        opacity: 1;
        border-color: #38BDF8;
      }
      100% {
        transform: translate(-30%, -30%) scale(2.2);
        opacity: 0;
        border-color: #10B981;
      }
    }
  `;
  document.head?.appendChild(style);
}

function onPageScrollCursorDrift() {
  if (!virtualCursorEl || isCursorAnimating) return;
  const now = Date.now();
  if (now - lastScrollTime < 90) return;
  lastScrollTime = now;
  // Natural minor micro-drift (1-2px) to simulate human hand resting on mouse during scrolling
  const driftX = (Math.random() - 0.5) * 3;
  const driftY = (Math.random() - 0.5) * 3;
  currentCursorPos.x = Math.max(20, Math.min(window.innerWidth - 30, currentCursorPos.x + driftX));
  currentCursorPos.y = Math.max(20, Math.min(window.innerHeight - 30, currentCursorPos.y + driftY));
  virtualCursorEl.style.transform = `translate3d(${Math.round(currentCursorPos.x)}px, ${Math.round(currentCursorPos.y)}px, 0)`;
}

function ensureVirtualCursorActive() {
  injectVirtualCursorStylesFallback();
  const existing = document.getElementById('atomx-virtual-cursor');
  if (existing) {
    virtualCursorEl = existing;
    virtualCursorEl.style.display = 'flex';
    virtualCursorEl.style.opacity = '1';
    return virtualCursorEl;
  }

  const cursor = document.createElement('div');
  cursor.id = 'atomx-virtual-cursor';
  cursor.className = 'atomx-virtual-cursor';
  cursor.innerHTML = `
    <div class="atomx-cursor-icon-wrap" style="position:relative; display:inline-block;">
      <svg class="atomx-cursor-svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.85a.5.5 0 0 0-.35.36z" fill="#0F172A" stroke="#38BDF8" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
      <div class="atomx-cursor-ripple"></div>
    </div>
    <div class="atomx-cursor-badge">AtomX</div>
  `;

  const initialX = Math.round(window.innerWidth * 0.6);
  const initialY = Math.round(window.innerHeight * 0.4);
  currentCursorPos = { x: initialX, y: initialY };
  cursor.style.transform = `translate3d(${initialX}px, ${initialY}px, 0)`;

  document.body.appendChild(cursor);
  virtualCursorEl = cursor;

  window.removeEventListener('scroll', onPageScrollCursorDrift);
  window.addEventListener('scroll', onPageScrollCursorDrift, { passive: true });

  return cursor;
}

function removeVirtualCursor() {
  if (virtualCursorEl) {
    virtualCursorEl.style.transition = 'opacity 0.25s ease';
    virtualCursorEl.style.opacity = '0';
    setTimeout(() => {
      virtualCursorEl?.remove();
      virtualCursorEl = null;
    }, 260);
  }
  window.removeEventListener('scroll', onPageScrollCursorDrift);
}

async function animateVirtualCursorTo(targetX, targetY, durationMs = 220) {
  const cursor = ensureVirtualCursorActive();
  if (!cursor) return;

  isCursorAnimating = true;
  const startX = currentCursorPos.x;
  const startY = currentCursorPos.y;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy);

  if (dist < 8) {
    currentCursorPos = { x: targetX, y: targetY };
    cursor.style.transform = `translate3d(${Math.round(targetX)}px, ${Math.round(targetY)}px, 0)`;
    isCursorAnimating = false;
    return;
  }

  const animTime = Math.min(520, Math.max(260, Math.round(durationMs * (dist / 300))));
  const steps = Math.min(26, Math.max(12, Math.round(animTime / 22)));
  const stepDelay = animTime / steps;

  // Organic curved Bezier control point with perpendicular offset
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const curveMagnitude = (Math.random() - 0.5) * Math.min(50, dist * 0.22);
  const ctrlX = startX + dx * 0.5 + perpX * curveMagnitude;
  const ctrlY = startY + dy * 0.5 + perpY * curveMagnitude;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const u = 1 - easeT;
    const curX = u * u * startX + 2 * u * easeT * ctrlX + easeT * easeT * targetX;
    const curY = u * u * startY + 2 * u * easeT * ctrlY + easeT * easeT * targetY;

    cursor.style.transform = `translate3d(${Math.round(curX)}px, ${Math.round(curY)}px, 0)`;
    await sleep(stepDelay);
  }

  cursor.style.transform = `translate3d(${Math.round(targetX)}px, ${Math.round(targetY)}px, 0)`;
  currentCursorPos = { x: targetX, y: targetY };
  isCursorAnimating = false;

  await sleep(60 + Math.random() * 50);
}

function triggerVirtualCursorClickEffect() {
  if (!virtualCursorEl) return;
  const iconWrap = virtualCursorEl.querySelector('.atomx-cursor-icon-wrap');
  const ripple = virtualCursorEl.querySelector('.atomx-cursor-ripple');

  if (iconWrap) {
    iconWrap.classList.remove('atomx-cursor-pressed');
    void iconWrap.offsetWidth;
    iconWrap.classList.add('atomx-cursor-pressed');
  }

  if (ripple) {
    ripple.classList.remove('atomx-ripple-active');
    void ripple.offsetWidth;
    ripple.classList.add('atomx-ripple-active');
  }

  setTimeout(() => {
    iconWrap?.classList.remove('atomx-cursor-pressed');
    ripple?.classList.remove('atomx-ripple-active');
  }, 450);
}

function triggerElementClickPulse(element, color = '#38BDF8') {
  if (!element) return;
  const origTransition = element.style.transition;
  const origOutline = element.style.outline;
  const origBoxShadow = element.style.boxShadow;

  element.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease';
  element.style.outline = `2px solid ${color}`;
  element.style.boxShadow = `0 0 14px ${color}99`;

  setTimeout(() => {
    element.style.outline = origOutline || 'none';
    element.style.boxShadow = origBoxShadow || 'none';
    element.style.transition = origTransition || 'none';
  }, 350);
}

/**
 * Dispatches the complete human event sequence:
 * 'pointermove', 'mousemove', 'mouseover', 'pointerdown', 'mousedown', 'focus', 'click', 'pointerup', and 'mouseup'.
 */
function dispatchEnhancedHumanEvents(element, clientX, clientY) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const x = Math.round(clientX !== undefined ? clientX : rect.left + rect.width / 2);
  const y = Math.round(clientY !== undefined ? clientY : rect.top + rect.height / 2);

  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const pointerProps = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pageX: window.pageXOffset + x,
    pageY: window.pageYOffset + y,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
    pressure: 0.5,
    width: 1,
    height: 1
  };

  const mouseProps = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pageX: window.pageXOffset + x,
    pageY: window.pageYOffset + y,
    button: 0,
    buttons: 1
  };

  // 1. pointermove
  element.dispatchEvent(new PointerEvent('pointermove', { ...pointerProps, buttons: 0, pressure: 0 }));
  // 2. mousemove
  element.dispatchEvent(new MouseEvent('mousemove', { ...mouseProps, buttons: 0 }));
  // 3. mouseover
  element.dispatchEvent(new MouseEvent('mouseover', { ...mouseProps, buttons: 0 }));

  // 4. pointerdown
  element.dispatchEvent(new PointerEvent('pointerdown', pointerProps));
  // 5. mousedown
  element.dispatchEvent(new MouseEvent('mousedown', mouseProps));

  // 6. focus
  try {
    if (typeof element.focus === 'function') {
      element.focus({ preventScroll: true });
    }
  } catch (e) {}

  // 7. pointerup
  element.dispatchEvent(new PointerEvent('pointerup', { ...pointerProps, buttons: 0, pressure: 0 }));
  // 8. mouseup
  element.dispatchEvent(new MouseEvent('mouseup', { ...mouseProps, buttons: 0 }));

  // 9. Single authentic click (NEVER dispatch both MouseEvent('click') AND element.click() to prevent duplicate submissions)
  try {
    element.click();
  } catch (e) {
    element.dispatchEvent(new MouseEvent('click', { ...mouseProps, buttons: 0 }));
  }
}

async function getActiveExecutionStrategy() {
  try {
    const res = await chrome.storage.local.get(['atomx_execution_strategy']);
    return res?.atomx_execution_strategy === 'debugger' ? 'debugger' : 'dom';
  } catch (e) {
    return 'dom';
  }
}

/**
 * Unified Humanized Action Engine (Hybrid Mode: Visual DOM Simulation vs CDP Debugger API)
 * Routes every click through:
 *  - Mode A: Enhanced Visual DOM Simulation (Virtual Cursor + Multi-Event Sequence)
 *  - Mode B: Chrome Debugger API (CDP Native Input.dispatchMouseEvent) with graceful DOM fallback
 */
async function performHumanClick(targetElement, options = {}) {
  if (!targetElement) return false;

  // Viewport scroll alignment if enabled
  if (options.scroll !== false) {
    gentleScrollIntoView(targetElement);
    await sleep(options.prePause || 150);
  }

  const rect = targetElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    targetElement.click();
    return true;
  }

  // Calculate randomized coordinate inside element bounding box (inward padding 15-25%)
  const padX = Math.min(rect.width * 0.25, 10);
  const padY = Math.min(rect.height * 0.25, 10);
  const targetX = rect.left + padX + Math.random() * Math.max(1, rect.width - padX * 2);
  const targetY = rect.top + padY + Math.random() * Math.max(1, rect.height - padY * 2);

  const strategy = await getActiveExecutionStrategy();

  // Mode B: Chrome Debugger API Integration (Advanced Desktop Mode)
  if (strategy === 'debugger') {
    try {
      console.log(`[ATOMX ACTION] Dispatching CDP click via Debugger API at (${Math.round(targetX)}, ${Math.round(targetY)})`);
      const response = await chrome.runtime.sendMessage({
        type: 'CDP_DISPATCH_MOUSE_CLICK',
        x: targetX,
        y: targetY
      });

      if (response && response.ok) {
        triggerElementClickPulse(targetElement, options.pulseColor || '#38BDF8');
        await sleep(options.postPause || 250);
        return true;
      }
      console.warn('[ATOMX ACTION] CDP click response not ok, falling back to Visual DOM mode:', response?.error);
    } catch (err) {
      console.warn('[ATOMX ACTION] CDP message failed, falling back to Visual DOM mode:', err);
    }
    // Graceful fallback to Mode A if debugger is unavailable (e.g. on mobile/Kiwi)
  }

  // Mode A: Enhanced Visual DOM Simulation (Default & Safe Mode)
  ensureVirtualCursorActive();

  // 1. Visibly animate cursor from current position to target element FIRST
  await animateVirtualCursorTo(targetX, targetY, options.animDuration || 400);

  // 2. Human dwell pause (380-520ms) so user visibly sees the cursor resting ON the button before clicking
  await sleep(options.hoverDwell || (380 + Math.random() * 140));

  // 3. Trigger click ripple effect and cursor press animation
  triggerVirtualCursorClickEffect();

  // Press dwell: natural human finger hold duration before release (130-180ms)
  await sleep(130 + Math.random() * 50);

  // 4. Visual element pulse (button reacts to cursor click)
  triggerElementClickPulse(targetElement, options.pulseColor || '#38BDF8');

  // 5. Dispatch single human event sequence (single click only)
  dispatchEnhancedHumanEvents(targetElement, targetX, targetY);

  await sleep(options.postPause || 350);
  return true;
}

/**
 * Visually highlights the Follow button with an emerald glow and dispatches human pointer events.
 * Guarantees the user and screen recording visibly witness the follow action.
 */
async function simulateHumanFollowClick(followBtn) {
  if (!followBtn) return false;
  try {
    gentleScrollIntoView(followBtn);
    await sleep(150);

    // Perform human click: Virtual cursor moves to followBtn FIRST, hovers, pulses green, then clicks!
    await performHumanClick(followBtn, { pulseColor: '#10B981', scroll: false, postPause: 300 });
    return true;
  } catch (e) {
    followBtn.click();
    return true;
  }
}

/**
 * Detects whether a tweet/article has already been liked by the logged-in user.
 * Checks for data-testid="unlike" or aria-labels indicating existing like status.
 */
function isPostAlreadyLiked(targetArticle) {
  if (!targetArticle) return false;
  if (targetArticle.querySelector('button[data-testid="unlike"], div[data-testid="unlike"], [data-testid="unlike"]')) {
    return true;
  }
  const likeBtn = targetArticle.querySelector('button[data-testid="like"], div[data-testid="like"]');
  if (likeBtn) {
    const aria = (likeBtn.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('unlike') || aria.endsWith('liked') || aria === 'liked') return true;
    return false; // Confirmed unliked
  }
  return false;
}

/**
 * 100% reliable Like Click with zero random skips and no duplicate clicks.
 * Global Rule: First scrolls post and like button onto screen, waits until visible, then moves cursor and clicks.
 */
async function simulateHumanLikeClick(targetArticle) {
  if (!targetArticle) return false;

  // Check if already liked
  if (isPostAlreadyLiked(targetArticle)) {
    return true; // Already liked
  }

  // 1. Find like button with all possible Twitter/X selectors
  let likeBtn = targetArticle.querySelector('button[data-testid="like"], div[data-testid="like"], [data-testid="like"]') ||
                Array.from(targetArticle.querySelectorAll('button, div[role="button"]')).find(b => {
                  const label = (b.getAttribute('aria-label') || '').toLowerCase();
                  return label.includes('like') && !label.includes('unlike');
                });

  if (!likeBtn) {
    await sleep(350);
    likeBtn = targetArticle.querySelector('button[data-testid="like"], div[data-testid="like"], [data-testid="like"]');
  }

  if (!likeBtn) return false;

  // 2. Smart Viewport Alignment (Screenshot 2 standard):
  await ensurePostAndActionsInView(targetArticle, likeBtn);
  if (isWorkflowAborted || isWorkflowItemSkipped) return false;

  // Natural human pause so the like button and post are visibly clear on screen before clicking
  await sleep(300);
  if (isWorkflowAborted || isWorkflowItemSkipped) return false;

  try {
    // Perform human click: Virtual cursor moves to likeBtn FIRST, hovers, pulses rose, then clicks single time!
    await performHumanClick(likeBtn, { pulseColor: '#F43F5E', scroll: false, postPause: 250 });
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
    await sleep(150);

    // Perform human click: Virtual cursor moves to replyBtn FIRST, hovers, pulses emerald, then clicks!
    await performHumanClick(replyBtn, { pulseColor: '#10B981', scroll: false, postPause: 250 });
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
let lastSubmitClickTimestamp = 0;
async function simulateHumanSubmitClick(btn) {
  if (!btn) return false;
  // Debounce guard: Prevent duplicate click within 3 seconds
  const now = Date.now();
  if (now - lastSubmitClickTimestamp < 3000) {
    console.warn('[ATOMX SUBMIT] Duplicate submit prevented by debounce guard.');
    return true;
  }
  lastSubmitClickTimestamp = now;

  try {
    await humanScrollElementIntoView(btn, 'nearest');
    await sleep(250);

    // Global rule: Cursor moves to Reply button, waits/hovers (420ms), and clicks
    console.log('[ATOMX SUBMIT] Moving virtual cursor to Reply button, hovering, and submitting...');
    await performHumanClick(btn, {
      pulseColor: '#3B82F6',
      scroll: false,
      hoverDwell: 420,
      postPause: 380
    });
    return true;
  } catch (e) {
    btn.click();
    return true;
  }
}

/**
 * 100% reliable Repost Click with green glow & modal confirmation.
 */
async function simulateHumanRepostClick(targetArticle) {
  if (!targetArticle) return false;
  if (targetArticle.querySelector('button[data-testid="unretweet"], div[data-testid="unretweet"]')) {
    return true; // Already reposted
  }

  // Scroll article into view first
  await scrollElementIntoViewAndEnsureVisible(targetArticle, 'center');
  if (isWorkflowAborted || isWorkflowItemSkipped) return false;

  const rtBtn = targetArticle.querySelector('button[data-testid="retweet"], div[data-testid="retweet"]') ||
                Array.from(targetArticle.querySelectorAll('button, div[role="button"]')).find(b => {
                  const label = (b.getAttribute('aria-label') || '').toLowerCase();
                  return label.includes('repost') || label.includes('retweet');
                });
  if (!rtBtn) return false;

  try {
    await scrollElementIntoViewAndEnsureVisible(rtBtn, 'nearest');
    await sleep(300);
    if (isWorkflowAborted || isWorkflowItemSkipped) return false;

    rtBtn.style.transition = 'transform 0.2s ease, filter 0.2s ease';
    rtBtn.style.transform = 'scale(1.2)';
    rtBtn.style.filter = 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.85))';

    await performHumanClick(rtBtn, { pulseColor: '#10B981', scroll: false, postPause: 300 });

    await sleep(250);
    rtBtn.style.transform = 'scale(1)';
    rtBtn.style.filter = 'none';

    const confirmBtn = await waitForElement('div[data-testid="retweetConfirm"], button[data-testid="retweetConfirm"], [data-testid="retweetConfirm"]', 2500) ||
                       Array.from(document.querySelectorAll('div[role="menuitem"], button[role="menuitem"], div[data-testid="Dropdown"] span')).find(el => {
                         const txt = (el.innerText || '').trim();
                         return txt === 'Repost' || txt === 'Retweet';
                       });

    if (confirmBtn) {
      await performHumanClick(confirmBtn, { pulseColor: '#10B981', scroll: false, postPause: 350 });
      await sleep(350);
      return true;
    }
    return false;
  } catch (e) {
    rtBtn.click();
    return true;
  }
}

/**
 * Natural human-like smooth scrolling with micro-steps allowing Twitter React virtual DOM to hydrate.
 */
async function smoothScrollAndHydrate(totalDelta = 650, pauseAfter = 900) {
  const steps = 4;
  const stepDelta = Math.round(totalDelta / steps);
  for (let s = 0; s < steps; s++) {
    if (isWorkflowAborted) break;
    const randomized = stepDelta + Math.floor(Math.random() * 40 - 20);
    window.scrollBy({ top: randomized, behavior: 'smooth' });
    await sleep(120 + Math.floor(Math.random() * 80));
  }
  await sleep(pauseAfter);
}

/**
 * Human-like letter-by-letter typing with intentional typos & backspace corrections.
 * Fully compatible with modern X (Twitter) DraftJS & Lexical rich-text editors.
 */
async function typeTextHumanLike(editor, text) {
  if (!editor || !text) return false;

  // 1. Move Virtual Cursor to editor/comment box, hover and click to activate text cursor
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const editorRect = editor.getBoundingClientRect();
  if (editorRect.top < 80 || editorRect.bottom > vh - 20) {
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await sleep(350);
  }

  // Visibly move virtual cursor to the comment box and click
  console.log('[ATOMX] Moving virtual cursor to comment box and clicking...');
  await performHumanClick(editor, {
    pulseColor: '#38BDF8',
    scroll: false,
    hoverDwell: 380,
    postPause: 450
  });

  editor.focus({ preventScroll: true });
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
  await sleep(180);

  let typedOk = false;

  // 3. Type character-by-character using realistic human cadence (slow & natural)
  // execCommand natively maintains DraftJS's internal ContentState, block offset keys, and backspace handling.
  try {
    for (let i = 0; i < text.length; i++) {
      if (isWorkflowAborted || isWorkflowItemSkipped) {
        console.log('[ATOMX] Typing aborted or skipped by user.');
        return false;
      }

      // Respect user pause while typing
      while (isHudWorkflowPaused && !isWorkflowAborted && !isWorkflowItemSkipped) {
        await sleep(400);
      }

      const char = text[i];
      const ok = document.execCommand('insertText', false, char);
      if (!ok) {
        throw new Error('execCommand insertText failed');
      }

      // Slower, natural human typing cadence
      let delay = Math.floor(Math.random() * 55) + 80; // 80ms - 135ms per character
      if (char === '.' || char === '!' || char === '?') {
        delay += Math.floor(Math.random() * 180) + 240; // 240ms - 420ms after sentences
      } else if (char === ',' || char === ';') {
        delay += Math.floor(Math.random() * 120) + 160; // 160ms - 280ms after commas
      } else if (char === ' ') {
        delay += Math.floor(Math.random() * 80) + 110;  // 110ms - 190ms between words
      } else if (i > 0 && i % 15 === 0) {
        delay += Math.floor(Math.random() * 150) + 120; // Occasional natural thinking pause
      }
      await sleep(delay);
    }

    if ((editor.innerText || editor.textContent || '').trim().length > 0) {
      typedOk = true;
    }
  } catch (err) {
    console.warn('[ATOMX] Letter typing warning, using ClipboardEvent paste fallback:', err);
  }

  // 4. Robust Fallback via ClipboardEvent (Paste) if editor is still empty
  // Twitter's DraftJS handles native paste events cleanly without corrupting the backspace tree
  if (!typedOk || !(editor.innerText || editor.textContent || '').trim()) {
    console.log('[ATOMX] Fallback to ClipboardEvent paste for DraftJS editor...');
    try {
      editor.focus({ preventScroll: true });
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

  await sleep(250);
  return true;
}

/**
 * Universal detector: Checks if target profile is protected/locked or comment section is turned off/restricted.
 */
function isTargetRestrictedOrCommentsLocked(targetArticle = null) {
  try {
    const pageText = (document.body ? document.body.innerText : '') || '';

    // 1. Check if profile account is locked/protected (strictly scoped to user profile header/name)
    const isProtected = pageText.includes('These posts are protected') ||
                        pageText.includes('Only confirmed followers have access') ||
                        !!document.querySelector('div[data-testid="UserName"] svg[data-testid="icon-lock"], div[data-testid="UserProfileHeader_Items"] svg[data-testid="icon-lock"], div[data-testid="UserProfileHeader_Items"] [aria-label*="Protected" i]');
    if (isProtected) {
      return { restricted: true, reason: 'Profile account is locked/protected' };
    }

    // 2. Check inline composer restriction box (only on tweet status pages)
    if (window.location.pathname.includes('/status/')) {
      const inlineBox = document.querySelector('div[data-testid="inline_reply"]');
      const inlineText = (inlineBox?.innerText || '').toLowerCase();
      if (
        inlineText.includes('who can reply') ||
        inlineText.includes('replies to this post are disabled') ||
        inlineText.includes('replies are restricted') ||
        inlineText.includes('accounts the author mentioned') ||
        inlineText.includes('people the author follows')
      ) {
        return { restricted: true, reason: 'Comments/replies are restricted on this post' };
      }
    }

    // 3. Check reply button on target article
    if (targetArticle) {
      const replyBtn = targetArticle.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      if (!replyBtn) {
        return { restricted: true, reason: 'No reply button available (comments turned off)' };
      }
      const isBtnDisabled = replyBtn.getAttribute('aria-disabled') === 'true' || replyBtn.disabled || replyBtn.getAttribute('disabled') !== null;
      const btnLabel = (replyBtn.getAttribute('aria-label') || '').toLowerCase();
      if (isBtnDisabled || btnLabel.includes('disabled') || btnLabel.includes('restricted')) {
        return { restricted: true, reason: 'Reply button is disabled/restricted' };
      }
    }

    // 4. Check global page notice
    if (
      pageText.includes('Replies to this post are disabled') ||
      pageText.includes('Who can reply? People @') ||
      pageText.includes('Who can reply? Accounts @')
    ) {
      return { restricted: true, reason: 'Replies disabled by author' };
    }
  } catch (e) {}

  return { restricted: false };
}

/**
 * Universal, rock-solid Twitter / X Comment & Reply Engine
 * Reliably opens modal dialogs for comments and timeline posts,
 * scopes typing & submit strictly to the dialog, and prevents self-commenting bugs.
 */
async function postCommentOnTargetArticle(targetArticle, commentText) {
  if (!commentText || isWorkflowAborted || isWorkflowItemSkipped) {
    if (isWorkflowItemSkipped) closeAnyOpenTwitterDialog();
    return { success: false, error: 'Empty text, skipped or aborted' };
  }

  // Instant check: If comments are locked/restricted, skip immediately without waiting
  const restriction = isTargetRestrictedOrCommentsLocked(targetArticle);
  if (restriction.restricted) {
    console.warn(`[ATOMX COMMENT ENGINE] Comments locked/restricted: ${restriction.reason}. Skipping.`);
    closeAnyOpenTwitterDialog();
    return { success: false, skipped: true, commentsRestricted: true, error: restriction.reason };
  }

  console.log('[ATOMX COMMENT ENGINE] Posting comment:', commentText);

  let textarea = null;
  let dialog = null;
  let isDialog = false;

  const isStatusPage = window.location.pathname.includes('/status/');
  const mainArt = getMainPostArticle();
  const isMainTarget = !targetArticle || targetArticle === mainArt;

  // 1. On tweet status pages, check if inline reply box is already sitting under the tweet
  if (isStatusPage && isMainTarget) {
    const inlineContainer = document.querySelector('div[data-testid="inline_reply"]');
    let inlineBox = document.querySelector('div[data-testid="inline_reply"] div[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"][contenteditable="true"]');

    // If placeholder "Post your reply" is present but tweetTextarea_0 isn't yet focused/mounted
    if (!inlineBox && inlineContainer) {
      const placeholder = inlineContainer.querySelector('div[role="button"], div[contenteditable="true"], div[data-testid="tweetTextarea_0"], span');
      if (placeholder) {
        await humanScrollElementIntoView(placeholder, 'center');
        await sleep(350);
        await performHumanClick(placeholder, {
          pulseColor: '#38BDF8',
          scroll: false,
          hoverDwell: 380,
          postPause: 400
        });
        await sleep(350);
        inlineBox = document.querySelector('div[data-testid="inline_reply"] div[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"][contenteditable="true"]');
      }
    }

    if (inlineBox) {
      console.log('[ATOMX COMMENT ENGINE] Direct inline reply box detected, activating via virtual cursor...');
      await humanScrollElementIntoView(inlineBox, 'center');
      await sleep(350);
      await performHumanClick(inlineBox, {
        pulseColor: '#38BDF8',
        scroll: false,
        hoverDwell: 380,
        postPause: 400
      });
      textarea = inlineBox;
      isDialog = false;
      await sleep(250);
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

  if (!textarea || isWorkflowAborted || isWorkflowItemSkipped) {
    if (isWorkflowItemSkipped) closeAnyOpenTwitterDialog();
    console.warn('[ATOMX COMMENT ENGINE] Reply textarea not found, skipped or aborted!');
    return { success: false, error: 'Textarea not found, skipped or aborted' };
  }

  // Pre-typing verification: If comment section just loaded and user already has a reply, abort immediately
  const curHandle = getLoggedInUserHandle() || '';
  if (curHandle && hasUserAlreadyCommented(curHandle)) {
    console.warn(`[ATOMX COMMENT ENGINE] User @${curHandle} already has a comment on this post. Aborting and clearing dialog.`);
    clearAnyDraftComment();
    return { success: true, ignored: true, commentSkipped: true, reason: 'Already commented on this post previously.' };
  }

  // 3. Type human-like into the editor
  await typeTextHumanLike(textarea, commentText);

  if (isWorkflowAborted || isWorkflowItemSkipped) {
    clearAnyDraftComment();
    return { success: false, aborted: isWorkflowAborted, skipped: isWorkflowItemSkipped, error: 'Workflow was aborted or skipped by user' };
  }

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
      textarea.focus({ preventScroll: true });
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

  // Pre-submit verification: If comment section hydrated during typing, abort submission
  if (curHandle && hasUserAlreadyCommented(curHandle)) {
    console.warn(`[ATOMX COMMENT ENGINE] User @${curHandle} comment appeared before submit. Aborting submission.`);
    clearAnyDraftComment();
    return { success: true, ignored: true, commentSkipped: true, reason: 'Already commented on this post previously.' };
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
  const isMobileScreen = window.innerWidth <= 480;
  hud.style.cssText = `
    position: fixed;
    bottom: ${isMobileScreen ? '10px' : '24px'};
    right: ${isMobileScreen ? '8px' : '24px'};
    width: ${isMobileScreen ? 'calc(100vw - 16px)' : '330px'};
    max-width: 360px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-radius: 14px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #F8FAFC;
    z-index: 2147483647;
    padding: 13px;
    box-sizing: border-box;
    transition: transform 0.2s ease, opacity 0.2s ease;
    user-select: none;
  `;

  hud.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px;">
      <div style="display: flex; align-items: center; gap: 7px;">
        <span id="hud-badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">RUNNING</span>
        <strong id="hud-title" style="font-size: 13px; font-weight: 700; color: #FFFFFF;">AtomX Agent</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span id="hud-indicator" style="font-size: 11px; font-weight: 700; color: #60A5FA;">Active</span>
        <button id="hud-minimize-btn" title="Minimize / Expand" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #CBD5E1; font-size: 14px; font-weight: 700; border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;">−</button>
        <button id="hud-close-btn" title="Close & Hide HUD (✕)" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #FCA5A5; font-size: 13px; font-weight: 800; border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;">✕</button>
      </div>
    </div>

    <!-- 3 Metric Cards Grid -->
    <div id="hud-body" style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9px; color: #94A3B8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">DONE</div>
          <div id="hud-done-count" style="font-size: 17px; font-weight: 800; color: #10B981; margin-top: 1px;">0</div>
        </div>
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9px; color: #94A3B8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">COLLECTED</div>
          <div id="hud-col-count" style="font-size: 17px; font-weight: 800; color: #60A5FA; margin-top: 1px;">0</div>
        </div>
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 4px; text-align: center;">
          <div style="font-size: 9px; color: #94A3B8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">SKIPPED</div>
          <div id="hud-skip-count" style="font-size: 17px; font-weight: 800; color: #F59E0B; margin-top: 1px;">0</div>
        </div>
      </div>

      <!-- Progress Track -->
      <div style="width: 100%; height: 5px; background: rgba(255, 255, 255, 0.08); border-radius: 99px; overflow: hidden;">
        <div id="hud-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3B82F6, #10B981); transition: width 0.3s ease;"></div>
      </div>

      <!-- Live Status Text -->
      <div id="hud-status-text" style="font-size: 11px; color: #CBD5E1; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Initializing agent automation...
      </div>

      <!-- Next Action & Real-Time Countdown Row -->
      <div id="hud-next-action-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 7px; padding: 5px 8px; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
          <span style="color: #94A3B8; font-size: 9.5px; font-weight: 700; text-transform: uppercase;">NEXT:</span>
          <span id="hud-next-action-text" style="color: #60A5FA; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Preparing next target...</span>
        </div>
        <div id="hud-timer-badge" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10B981; font-weight: 800; font-family: monospace; font-size: 11px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; margin-left: 6px;">
          ⚡ Active
        </div>
      </div>

      <!-- Action Controls: Pause/Resume, Skip, Stop -->
      <div style="display: flex; gap: 7px; margin-top: 6px;">
        <button id="hud-pause-btn" style="flex: 1; padding: 7.5px 0; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(251, 191, 36, 0.55); border-radius: 8px; color: #FFFFFF; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 0 10px rgba(245, 158, 11, 0.2); transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);" title="Pause or Resume current workflow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24"><rect x="6" y="5" width="4" height="14" rx="2"/><rect x="14" y="5" width="4" height="14" rx="2"/></svg>
          <span id="hud-pause-text">Pause</span>
        </button>
        <button id="hud-skip-action-btn" style="flex: 1; padding: 7.5px 0; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(96, 165, 250, 0.55); border-radius: 8px; color: #FFFFFF; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 0 10px rgba(59, 130, 246, 0.22); transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);" title="Skip current tweet/profile link immediately">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#60A5FA"><path d="M5 19L14 12L5 5v14z"/><rect x="16" y="5" width="3" height="14" rx="1.5"/></svg>
          <span>Skip</span>
        </button>
        <button id="hud-stop-btn" style="flex: 1; padding: 7.5px 0; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(248, 113, 113, 0.6); border-radius: 8px; color: #FFFFFF; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 0 10px rgba(239, 68, 68, 0.25); transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);" title="Completely abort and stop workflow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#F87171"><rect x="5.5" y="5.5" width="13" height="13" rx="3.5"/></svg>
          <span>STOP</span>
        </button>
        <button id="hud-dismiss-btn" style="flex: 1; padding: 7.5px 0; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #FFFFFF; font-size: 11px; font-weight: 700; cursor: pointer; display: none; align-items: center; justify-content: center; gap: 4px;" title="Dismiss HUD">
          Dismiss
        </button>
      </div>
    </div>
  `;

  // Pause / Resume listener — Instant response
  hud.querySelector('#hud-pause-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isHudWorkflowPaused = !isHudWorkflowPaused;
    const pauseBtn = hud.querySelector('#hud-pause-btn');
    if (pauseBtn) {
      pauseBtn.innerHTML = isHudWorkflowPaused
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#34D399"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l13-7.5a1 1 0 0 0 0-1.72l-13-7.5A1 1 0 0 0 7 4.5z"/></svg><span id="hud-pause-text">Resume</span>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24"><rect x="6" y="5" width="4" height="14" rx="2"/><rect x="14" y="5" width="4" height="14" rx="2"/></svg><span id="hud-pause-text">Pause</span>`;
      pauseBtn.style.color = '#FFFFFF';
      pauseBtn.style.background = 'rgba(30, 41, 59, 0.75)';
      pauseBtn.style.borderColor = isHudWorkflowPaused ? 'rgba(52, 211, 153, 0.6)' : 'rgba(251, 191, 36, 0.55)';
      pauseBtn.style.boxShadow = isHudWorkflowPaused ? '0 0 10px rgba(16, 185, 129, 0.2)' : '0 0 10px rgba(245, 158, 11, 0.2)';
    }
    const badge = hud.querySelector('#hud-badge');
    if (badge) {
      badge.textContent = isHudWorkflowPaused ? 'PAUSED' : 'RUNNING';
      badge.style.color = isHudWorkflowPaused ? '#FBBF24' : '#10B981';
      badge.style.background = isHudWorkflowPaused ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)';
      badge.style.borderColor = isHudWorkflowPaused ? 'rgba(245, 158, 11, 0.5)' : 'rgba(16, 185, 129, 0.4)';
    }
    const timerBadge = hud.querySelector('#hud-timer-badge');
    if (timerBadge) {
      timerBadge.textContent = isHudWorkflowPaused ? '⏸️ Paused' : '⚡ Active';
    }
    chrome.storage.local.set({ atomx_workflow_paused: isHudWorkflowPaused }).catch(() => null);
    chrome.runtime.sendMessage({ type: 'TOGGLE_WORKFLOW_PAUSE', isPaused: isHudWorkflowPaused }).catch(() => null);
  });

  // Skip current item listener — Instant response & real-time tracker update
  hud.querySelector('#hud-skip-action-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isWorkflowItemSkipped = true;
    clearAnyDraftComment();

    // Instant local HUD visual feedback
    const skipEl = hud.querySelector('#hud-skip-count');
    let newSkipped = 1;
    if (skipEl) {
      newSkipped = (parseInt(skipEl.textContent, 10) || 0) + 1;
      skipEl.textContent = String(newSkipped);
    }
    const statusEl = hud.querySelector('#hud-status-text');
    if (statusEl) statusEl.textContent = '⏭️ Skipping current item...';
    const timerBadge = hud.querySelector('#hud-timer-badge');
    if (timerBadge) timerBadge.textContent = '⏭️ Skip';

    chrome.storage.local.get(['atomx_active_hud', 'atomx_agent_workflow'], (res) => {
      const activeHud = res?.atomx_active_hud || {};
      const wf = res?.atomx_agent_workflow;
      const prevSkipped = (activeHud.skipped || 0) + 1;
      const total = activeHud.collected || activeHud.total || (wf?.total || 10);
      const done = activeHud.done || (wf?.successCount || 0);
      const nextIdx = Math.min(total, done + prevSkipped);

      const indEl = hud.querySelector('#hud-indicator');
      if (indEl) indEl.textContent = `${nextIdx}/${total}`;

      const updatedHud = {
        ...activeHud,
        skipped: prevSkipped,
        indicator: `${nextIdx}/${total}`,
        statusText: '⏭️ Skipping current item...'
      };
      const updates = {
        atomx_skip_current: true,
        atomx_active_hud: updatedHud
      };
      if (wf && wf.active) {
        updates.atomx_agent_workflow = {
          ...wf,
          ignoredCount: prevSkipped,
          currentIndex: nextIdx,
          statusText: '⏭️ Skipping current item...'
        };
      }
      chrome.storage.local.set(updates).catch(() => null);
    });

    chrome.runtime.sendMessage({ type: 'SKIP_WORKFLOW_ITEM' }).catch(() => null);
  });

  // Stop workflow listener — Instant response
  hud.querySelector('#hud-stop-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    isWorkflowAborted = true;
    closeAnyOpenTwitterDialog();

    const stored = await chrome.storage.local.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
    const prevWf = stored?.atomx_agent_workflow || {};
    const prevHud = stored?.atomx_active_hud || {};
    const agentId = prevWf.agentId || 'audience';
    const title = prevWf.title || prevHud.title || 'AtomX Agent';
    const total = prevWf.total || prevHud.collected || 0;
    const done = prevWf.successCount ?? prevHud.done ?? 0;
    const skipped = prevWf.ignoredCount ?? prevHud.skipped ?? 0;

    const stoppedHud = {
      ...prevHud,
      title,
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      timerBadge: '🛑 Stopped',
      countdownText: '',
      nextAction: 'Stopped',
      isStopped: true,
      active: false,
      done,
      collected: total,
      skipped,
      indicator: `${done}/${total}`
    };

    const stoppedWf = {
      ...prevWf,
      agentId,
      title,
      active: false,
      isStopped: true,
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      countdownText: '',
      timerBadge: '🛑 Stopped',
      total,
      successCount: done,
      ignoredCount: skipped
    };

    updateFloatingHud(stoppedHud);

    if (isExtensionValid()) {
      await chrome.storage.local.set({
        atomx_active_hud: stoppedHud,
        atomx_agent_workflow: stoppedWf,
        atomx_workflow_paused: false,
        atomx_tg_raid: { active: false, stateBadge: 'STOPPED', isStopped: true }
      }).catch(() => null);

      chrome.runtime.sendMessage({ type: 'ABORT_WORKFLOW' }).catch(() => null);
      chrome.runtime.sendMessage({ type: 'BG_ABORT_AGENT_WORKFLOW' }).catch(() => null);
    }
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
    if (isExtensionValid()) {
      chrome.storage.local.set({ atomx_hud_dismissed: true }).catch(() => null);
    }
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
  if (data.isStopped || data.stateBadge === 'STOPPED') {
    isWorkflowAborted = true;
    removeVirtualCursor();
  } else if (data.active || data.isNewWorkflow) {
    isWorkflowAborted = false;
    ensureVirtualCursorActive();
  }

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

  // Next action display
  const nextActionEl = hud.querySelector('#hud-next-action-text');
  if (nextActionEl) {
    if (data.isStopped || data.stateBadge === 'STOPPED') {
      nextActionEl.textContent = 'Stopped by user';
    } else if (data.stateBadge === 'DONE') {
      nextActionEl.textContent = 'Workflow Completed';
    } else if (data.stateBadge === 'PAUSED' || isHudWorkflowPaused) {
      nextActionEl.textContent = 'Workflow Paused';
    } else if (data.nextAction && data.nextAction !== 'Completed') {
      nextActionEl.textContent = data.nextAction;
    } else if (data.countdownText && (data.countdownText.includes('Next') || data.countdownText.includes('Delay'))) {
      nextActionEl.textContent = data.countdownText;
    } else if (data.indicator) {
      nextActionEl.textContent = `Target ${data.indicator}`;
    }
  }

  // Timer badge display
  const timerBadgeEl = hud.querySelector('#hud-timer-badge');
  if (timerBadgeEl) {
    if (data.stateBadge === 'PAUSED' || isHudWorkflowPaused) {
      timerBadgeEl.textContent = '⏸️ Paused';
    } else if (data.isStopped || data.stateBadge === 'STOPPED') {
      timerBadgeEl.textContent = '⏹️ Stopped';
    } else if (data.stateBadge === 'DONE') {
      timerBadgeEl.textContent = '✓ Done';
    } else if (data.timerBadge) {
      timerBadgeEl.textContent = data.timerBadge;
    } else if (data.countdownText) {
      const match = data.countdownText.match(/(\d+:\d+|\d+s|\d+)/);
      timerBadgeEl.textContent = match ? (match[0].includes('s') || match[0].includes(':') ? `⏱️ ${match[0]}` : `⏱️ ${match[0]}s`) : '⚡ Active';
    } else if (data.stateBadge !== 'PACING') {
      const currentText = (timerBadgeEl.textContent || '').trim();
      if (!currentText.startsWith('⏱️') && !currentText.includes(':')) {
        timerBadgeEl.textContent = '⚡ Active';
      }
    }
  }

  // Sync Pause, Skip, Stop, Dismiss appearance
  const pauseBtn = hud.querySelector('#hud-pause-btn');
  const skipBtn = hud.querySelector('#hud-skip-action-btn');
  const stopBtn = hud.querySelector('#hud-stop-btn');
  const dismissBtn = hud.querySelector('#hud-dismiss-btn');

  const isFinished = Boolean(data.isStopped) && (data.stateBadge === 'DONE' || data.stateBadge === 'STOPPED');
  const isRunning = Boolean(data.active) || (!isFinished && data.stateBadge !== 'DONE' && data.stateBadge !== 'STOPPED');

  if (isRunning) {
    if (stopBtn) stopBtn.style.display = 'flex';
    if (pauseBtn) {
      pauseBtn.style.display = 'flex';
      const isPaused = data.stateBadge === 'PAUSED' || isHudWorkflowPaused;
      pauseBtn.innerHTML = isPaused
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#34D399"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l13-7.5a1 1 0 0 0 0-1.72l-13-7.5A1 1 0 0 0 7 4.5z"/></svg><span id="hud-pause-text">Resume</span>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24"><rect x="6" y="5" width="4" height="14" rx="2"/><rect x="14" y="5" width="4" height="14" rx="2"/></svg><span id="hud-pause-text">Pause</span>`;
      pauseBtn.style.color = '#FFFFFF';
      pauseBtn.style.background = 'rgba(30, 41, 59, 0.75)';
      pauseBtn.style.borderColor = isPaused ? 'rgba(52, 211, 153, 0.6)' : 'rgba(251, 191, 36, 0.55)';
      pauseBtn.style.boxShadow = isPaused ? '0 0 10px rgba(16, 185, 129, 0.2)' : '0 0 10px rgba(245, 158, 11, 0.2)';
    }
    if (skipBtn) skipBtn.style.display = 'flex';
    if (dismissBtn) dismissBtn.style.display = 'none';
  } else {
    if (stopBtn) stopBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (skipBtn) skipBtn.style.display = 'none';
    if (dismissBtn) dismissBtn.style.display = 'flex';
  }

  // Real-time synchronization to storage so popup progress tracker stays 1:1 in sync
  if (!window._atomxHudSyncTimer && typeof chrome !== 'undefined' && chrome.storage?.local) {
    window._atomxHudSyncTimer = setTimeout(() => {
      window._atomxHudSyncTimer = null;
      chrome.storage.local.get(['atomx_active_hud', 'atomx_agent_workflow'], (res) => {
        const activeHud = { ...(res?.atomx_active_hud || {}), ...data };
        const updates = { atomx_active_hud: activeHud };
        if (res?.atomx_agent_workflow && res.atomx_agent_workflow.active) {
          updates.atomx_agent_workflow = {
            ...res.atomx_agent_workflow,
            statusText: data.statusText || res.atomx_agent_workflow.statusText,
            stateBadge: data.stateBadge || res.atomx_agent_workflow.stateBadge,
            ignoredCount: data.skipped !== undefined ? data.skipped : res.atomx_agent_workflow.ignoredCount,
            successCount: data.done !== undefined ? data.done : res.atomx_agent_workflow.successCount,
            countdownText: data.countdownText !== undefined ? data.countdownText : res.atomx_agent_workflow.countdownText
          };
        }
        chrome.storage.local.set(updates).catch(() => null);
      });
    }, 150);
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
    if (!isExtensionValid() || area !== 'local') return;

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

    if (changes.atomx_skip_current !== undefined) {
      isWorkflowItemSkipped = Boolean(changes.atomx_skip_current.newValue);
      if (isWorkflowItemSkipped) {
        closeAnyOpenTwitterDialog();
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

    if (changes.atomx_agent_workflow) {
      const wf = changes.atomx_agent_workflow.newValue;
      if (wf && (wf.active === false || wf.isStopped || wf.stateBadge === 'STOPPED')) {
        isWorkflowAborted = true;
      }
    }

    if (changes.atomx_active_hud) {
      const val = changes.atomx_active_hud.newValue;

      if (val && val.isNewWorkflow) {
        isHudDismissedLocally = false;
      }

      if (val && (val.isStopped || val.stateBadge === 'STOPPED')) {
        isWorkflowAborted = true;
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
    (async () => {
      let handle = await waitForLoggedInUserHandle(1500);
      if (!isValidTwitterHandle(handle)) handle = null;
      const isLoggedOut = !handle && isDefinitelyLoggedOut();
      sendResponse({
        success: true,
        handle: handle ? `@${handle}` : null,
        rawHandle: handle || null,
        isLoggedIn: Boolean(handle) || !isLoggedOut,
        isDefinitelyLoggedOut: isLoggedOut
      });
    })();
    return true;
  }

  if (message.type === 'SHOW_ACCOUNT_MISMATCH_MODAL') {
    showAccountMismatchModal(message.expected, message.current);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'INIT_VIRTUAL_CURSOR' || message.type === 'START_VIRTUAL_CURSOR') {
    ensureVirtualCursorActive();
    sendResponse({ ok: true, active: true });
    return true;
  }

  if (message.type === 'REMOVE_VIRTUAL_CURSOR') {
    removeVirtualCursor();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'ABORT_WORKFLOW') {
    isWorkflowAborted = true;
    removeVirtualCursor();
    console.log('[ATOMX] Abort signal received. Stopping all automation.');
    updateFloatingHud({
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      countdownText: '',
      isStopped: true,
      active: false
    });
    sendResponse({ success: true, aborted: true });
    return true;
  }

  if (message.type === 'TOGGLE_WORKFLOW_PAUSE') {
    isHudWorkflowPaused = Boolean(message.isPaused);
    const pauseBtn = floatingHudEl?.querySelector('#hud-pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = isHudWorkflowPaused ? '▶️ Resume' : '⏸️ Pause';
      pauseBtn.style.color = isHudWorkflowPaused ? '#34D399' : '#FBBF24';
      pauseBtn.style.background = isHudWorkflowPaused ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      pauseBtn.style.borderColor = isHudWorkflowPaused ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)';
    }
    const badge = floatingHudEl?.querySelector('#hud-badge');
    if (badge && !isWorkflowAborted) {
      badge.textContent = isHudWorkflowPaused ? 'PAUSED' : 'RUNNING';
      badge.style.color = isHudWorkflowPaused ? '#FBBF24' : '#10B981';
    }
    const timerBadge = floatingHudEl?.querySelector('#hud-timer-badge');
    if (timerBadge) {
      timerBadge.textContent = isHudWorkflowPaused ? '⏸️ Paused' : '⚡ Active';
    }
    sendResponse({ success: true, isPaused: isHudWorkflowPaused });
    return true;
  }

  if (message.type === 'SKIP_WORKFLOW_ITEM') {
    isWorkflowItemSkipped = true;
    clearAnyDraftComment();
    const statusEl = floatingHudEl?.querySelector('#hud-status-text');
    if (statusEl) statusEl.textContent = '⏭️ Skipping current item...';
    const timerBadge = floatingHudEl?.querySelector('#hud-timer-badge');
    if (timerBadge) timerBadge.textContent = '⏭️ Skip';
    sendResponse({ success: true, skipped: true });
    return true;
  }

  if (message.type === 'UPDATE_FLOATING_HUD') {
    const payload = message.data || message.hud || message.payload || message;
    updateFloatingHud(payload);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'ABORT_WORKFLOW' || message.type === 'BG_ABORT_AGENT_WORKFLOW' || message.type === 'STOP_WORKFLOW') {
    isWorkflowAborted = true;
    removeVirtualCursor();
    closeAnyOpenTwitterDialog();
    updateFloatingHud({
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      timerBadge: '🛑 Stopped',
      countdownText: '',
      isStopped: true,
      active: false
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'HIDE_FLOATING_HUD') {
    isHudDismissedLocally = true;
    hideFloatingHud();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'POPUP_OPENED') {
    isPopupOpenLocally = true;
    hideFloatingHud();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'POPUP_CLOSED') {
    isPopupOpenLocally = false;
    chrome.storage.local.get(['atomx_active_hud', 'atomx_hud_dismissed', 'atomx_tg_raid', 'atomx_agent_workflow']).then(s => {
      const activeHud = s?.atomx_active_hud;
      const isRunning = Boolean(s?.atomx_tg_raid?.active || s?.atomx_agent_workflow?.active || activeHud?.active);
      if (isRunning && !s?.atomx_hud_dismissed && activeHud) {
        updateFloatingHud(activeHud);
      }
    }).catch(() => null);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CLEANUP_DRAFTS_BEFORE_NAV') {
    clearAnyDraftComment();
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

  if (message.type === 'SYNC_WORKFLOW_OPTIONS') {
    if (message.options) {
      console.log('[ATOMX CONTENT] Synced live workflow options from popup:', message.options);
    }
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

  // Agent 1: Audience Builder — Scrape commenters from most engaged recent tweets in Twitter List
  if (message.type === 'COLLECT_AUDIENCE_FROM_LIST') {
    collectAudienceFromListTimeline(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, profiles: [] }));
    return true;
  }

  // Agent 1: Audience Builder — Collect repliers from tweet discussion thread
  if (message.type === 'COLLECT_REPLIERS_FROM_TWEET_THREAD') {
    collectRepliersFromTweetThread(message.targetCount || 10)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, profiles: [] }));
    return true;
  }

  // Agent 1: Audience Builder — Click and open top post with virtual cursor
  if (message.type === 'CLICK_AND_OPEN_TARGET_POST') {
    clickAndOpenTargetPost(message.postUrl, message.author)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Agent 1: Audience Builder — Find, mark/like, and extract next unvisited comment in thread
  if (message.type === 'FIND_AND_LIKE_NEXT_UNPROCESSED_COMMENT') {
    findAndLikeNextUnprocessedComment(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ found: false, error: err.message }));
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

  // Agent 13: Commenter Reciprocator — Scan post comments, like unliked comments & collect profiles
  if (message.type === 'COLLECT_RECIPROCATOR_COMMENTERS') {
    collectReciprocatorCommenters(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, commenters: [] }));
    return true;
  }

  // Agent 13: Commenter Reciprocator — Engage on commenter profile
  if (message.type === 'RECIPROCAL_PROFILE_ENGAGEMENT') {
    engageAndFollowProfile(message)
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

  // Agent 4: Followers Increase — Autonomous direct timeline engagement on List's recent posts
  if (message.type === 'EXECUTE_FOLLOWERS_LIST_CYCLE') {
    executeFollowersListCycle(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, engagedCount: 0 }));
    return true;
  }

  // Agent 1: Audience Builder — Discover most engaged recent tweets from list query
  if (message.type === 'DISCOVER_TOP_ENGAGED_LIST_TWEETS') {
    discoverTopEngagedListTweets(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, topTweets: [] }));
    return true;
  }

  // Agent 4: Followers Increase — Discover top active/recent posts from List timeline
  if (message.type === 'DISCOVER_TOP_ACTIVE_LIST_TWEETS') {
    discoverTopActiveListTweets(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message, topTweets: [] }));
    return true;
  }
});

// Neutralize Twitter / X "Leave site? Changes you made may not be saved" prompt
function suppressBeforeUnloadPrompt() {
  try {
    window.addEventListener('beforeunload', (e) => {
      try { e.stopImmediatePropagation(); } catch (err) {}
    }, true);

    const script = document.createElement('script');
    script.textContent = `
      try {
        window.addEventListener('beforeunload', function(e) {
          e.stopImmediatePropagation();
        }, true);
        window.onbeforeunload = null;
        Object.defineProperty(window, 'onbeforeunload', {
          get: () => null,
          set: () => {}
        });
      } catch (e) {}
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {}
}
suppressBeforeUnloadPrompt();

// Helper: Discards any unsaved draft comment in editor to prevent browser navigation locks
function clearAnyDraftComment() {
  try {
    const confirmDiscard = document.querySelector('button[data-testid="confirmationSheetConfirm"]');
    if (confirmDiscard) {
      confirmDiscard.click();
      return;
    }

    const textarea = document.querySelector('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
    if (textarea && (textarea.innerText || textarea.textContent || '').trim()) {
      textarea.focus({ preventScroll: true });
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    }
    closeAnyOpenTwitterDialog();
  } catch (e) {}
}

// Helper: Closes any open modal/compose dialog or discard confirmation on Twitter
function closeAnyOpenTwitterDialog() {
  try {
    const discardBtn = document.querySelector('button[data-testid="confirmationSheetConfirm"]');
    if (discardBtn) {
      discardBtn.click();
      return;
    }
    const dialog = document.querySelector('div[role="dialog"], div[aria-modal="true"]');
    if (dialog) {
      const closeBtn = dialog.querySelector('button[aria-label="Close"], div[data-testid="app-bar-close"], button[data-testid="app-bar-close"]');
      if (closeBtn) {
        closeBtn.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      }
      setTimeout(() => {
        const confirmDiscard = document.querySelector('button[data-testid="confirmationSheetConfirm"]');
        if (confirmDiscard) confirmDiscard.click();
      }, 150);
    }
  } catch (e) {}
}

// Wait for element helper with timeout and abort support
function waitForElement(selector, timeout = 7000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (isWorkflowAborted) {
        clearInterval(interval);
        return resolve(null);
      }
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
  isWorkflowItemSkipped = false;
  await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);

  // 1-to-1 Verified Account Enforcement
  if (params.verifiedXHandle) {
    const lockCheck = await verifyAccountLockOrAbort(params.verifiedXHandle);
    if (!lockCheck.ok) {
      return { success: false, error: lockCheck.error, unauthorizedAccount: true };
    }
  }

  const actions = params.actions || { like: true, comment: true, repost: false, follow: false, scroll: true };
  const replyText = params.replyText || '';
  const performed = [];

  console.log('[ATOMX AUTONOMOUS WORKFLOW] Starting execution with actions:', actions);

  // 1. Identify MAIN POST article (wait for tweet DOM hydration up to 3.5s)
  let mainArticle = getMainPostArticle();
  if (!mainArticle) {
    for (let r = 0; r < 7; r++) {
      await sleep(500);
      mainArticle = getMainPostArticle();
      if (mainArticle) break;
    }
  }
  if (!mainArticle) mainArticle = document;

  // On status pages: Allow Twitter 1.5 - 2s to stream/hydrate comments under the post!
  if (window.location.pathname.includes('/status/')) {
    for (let cWait = 0; cWait < 5; cWait++) {
      const allArts = document.querySelectorAll('article[data-testid="tweet"]');
      if (allArts.length > 1) break;
      await sleep(400);
    }
  }

  // 2. Detect already liked & already commented status
  const isAlreadyLiked = isPostAlreadyLiked(mainArticle);
  let loggedInHandle = getLoggedInUserHandle() || (params.verifiedXHandle || '').replace(/^@+/, '');
  if (!loggedInHandle) {
    try {
      const stored = await chrome.storage.local.get(['verifiedXHandle']);
      loggedInHandle = (stored?.verifiedXHandle || '').replace(/^@+/, '');
    } catch (e) {}
  }
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
  if (actions.comment && isAlreadyCommented) {
    console.log('[ATOMX] User already commented on this post previously. Auto-ignoring.');
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

  if (shouldComment) {
    const restriction = isTargetRestrictedOrCommentsLocked(mainArticle);
    if (restriction.restricted) {
      console.log(`[ATOMX] Tweet comments restricted: ${restriction.reason}. Auto-skipping.`);
      return {
        success: true,
        skipped: true,
        ignored: true,
        reason: restriction.reason,
        performed: [`Auto-Skipped (${restriction.reason})`]
      };
    }
  }

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

  if (isWorkflowItemSkipped || isWorkflowAborted) {
    return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };
  }

  // 3. Auto-Follow Creator FIRST (Naturally executed at top of post while avatar & header are in full view)
  if (actions.follow && !isWorkflowAborted && !isWorkflowItemSkipped) {
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

      if (followBtn && !isWorkflowItemSkipped && !isWorkflowAborted) {
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

  if (isWorkflowItemSkipped || isWorkflowAborted) return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };

  // 4. Natural Reading Scroll: Smoothly scroll down through post to bring action bar & comment box into view together
  if (actions.scroll !== false && !isWorkflowAborted && !isWorkflowItemSkipped) {
    await smoothScrollPostForReading(mainArticle);
    performed.push('Scrolled & hydrated');
  }

  if (isWorkflowItemSkipped || isWorkflowAborted) return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };

  // 5. Auto-Like Action (MAIN POST ONLY) — 100% reliable execution with visual pulse
  if (shouldLike && !isWorkflowAborted && !isWorkflowItemSkipped) {
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

  if (isWorkflowItemSkipped || isWorkflowAborted) return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };

  // 6. Auto-Repost Action (MAIN POST ONLY)
  if (actions.repost && !isWorkflowAborted && !isWorkflowItemSkipped) {
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
          if (confirmBtn && !isWorkflowItemSkipped && !isWorkflowAborted) {
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

  if (isWorkflowItemSkipped || isWorkflowAborted) return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };

  // 7. Auto-Comment Action with Live Contextual AI Generation & Human-Like Typing
  if (shouldComment && !isWorkflowAborted && !isWorkflowItemSkipped) {
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

      if (isWorkflowItemSkipped || isWorkflowAborted) return { success: true, skipped: true, ignored: true, reason: 'Skipped by user', performed };

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
    const lockCheck = await verifyAccountLockOrAbort(options.verifiedXHandle);
    if (!lockCheck.ok) {
      return {
        success: false,
        error: lockCheck.error,
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

  const storedAudience = await new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['atomx_audience_engaged_history'], r);
    } else r({});
  });
  const engagedHistory = (storedAudience?.atomx_audience_engaged_history && typeof storedAudience.atomx_audience_engaged_history === 'object')
    ? storedAudience.atomx_audience_engaged_history : {};

  // DYNAMIC SCROLL: Keep scrolling until targetCount repliers are met
  const maxThreadScrolls = Math.max(80, numTarget * 4);
  let consecutiveNoNew = 0;

  for (let s = 0; s < maxThreadScrolls; s++) {
    if (isWorkflowAborted || collected.length >= numTarget) break;

    const stopCheck = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
    if (stopCheck?.atomx_agent_workflow?.isStopped || stopCheck?.atomx_active_hud?.stateBadge === 'STOPPED' || stopCheck?.atomx_agent_workflow?.active === false) {
      isWorkflowAborted = true;
      break;
    }

    const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    // Replies are articles after index 0 (index 0 is focal post)
    const replyArticles = allArticles.length > 1 ? allArticles.slice(1) : allArticles;

    let newInThisScroll = 0;
    for (const art of replyArticles) {
      if (collected.length >= numTarget || isWorkflowAborted) break;

      const data = extractTweetData(art);
      const cleanHandle = (data.authorHandle || '').replace('@', '').toLowerCase();
      const lastTime = engagedHistory[cleanHandle];
      // Only skip if cleanHandle is missing, own handle, duplicate, or engaged within last 24h
      if (!cleanHandle || cleanHandle === loggedInHandle || seenHandles.has(cleanHandle) || (lastTime && (Date.now() - lastTime < 24 * 3600 * 1000))) {
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

function isCommentAlreadyLiked(art) {
  if (!art) return false;
  if (art.querySelector('button[data-testid="unlike"], div[data-testid="unlike"], [data-testid="unlike"]')) {
    return true;
  }
  const likeBtn = art.querySelector('button[data-testid="like"], div[data-testid="like"]');
  if (likeBtn) {
    const aria = (likeBtn.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('unlike') || aria.endsWith('liked') || aria === 'liked') return true;
    return false; // Confirmed unliked
  }
  return false;
}

/**
 * Agent 1: Audience Builder In-Thread Comment Scanner & Marker
 * Inspects comments on the current tweet status post directly.
 * Skips comments that are already liked (tracked from previous sessions).
 * For the next unliked comment:
 *  - Likes the comment on the post (serves as permanent visual & DOM tracking marker)
 *  - Returns the commenter's handle so the same tab visits their profile, engages, and goes back.
 */
async function findAndLikeNextUnprocessedComment(options = {}) {
  isWorkflowItemSkipped = false;
  const verifiedHandle = (options.verifiedXHandle || '').toLowerCase().replace(/^@/, '').trim();
  const mainAuthor = (options.mainAuthor || '').toLowerCase().replace(/^@/, '').trim();
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase();

  let persistedHistory = {};
  try {
    const stored = await new Promise(r => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['atomx_audience_engaged_history'], r);
      } else r({});
    });
    if (stored?.atomx_audience_engaged_history && typeof stored.atomx_audience_engaged_history === 'object') {
      persistedHistory = stored.atomx_audience_engaged_history;
    }
  } catch (e) {}

  const maxScrollAttempts = 20;
  const seenHandlesInThisScan = new Set();

  for (let s = 0; s < maxScrollAttempts; s++) {
    if (isWorkflowAborted || isWorkflowItemSkipped) {
      return { found: false, aborted: true };
    }

    const mainArticle = getMainPostArticle();
    const allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const commentArticles = allArticles.filter(a => a !== mainArticle);

    for (const art of commentArticles) {
      if (isWorkflowAborted || isWorkflowItemSkipped) {
        return { found: false, aborted: true };
      }

      const data = extractTweetData(art);
      const cleanHandle = (data.authorHandle || '').replace('@', '').toLowerCase().trim();
      if (!cleanHandle) continue;

      // Skip user's own handle or post creator's handle
      if (cleanHandle === loggedInHandle || cleanHandle === verifiedHandle || (mainAuthor && cleanHandle === mainAuthor)) {
        continue;
      }

      // Check if this article has a like/unlike button (confirming it is an actionable comment)
      const hasActionButtons = art.querySelector('button[data-testid="like"], button[data-testid="unlike"], div[data-testid="like"], div[data-testid="unlike"]');
      if (!hasActionButtons) continue;

      // CRITICAL: Check if this comment is ALREADY liked (already processed & tracked!)
      const isAlreadyLiked = isCommentAlreadyLiked(art);
      if (isAlreadyLiked) {
        // Already processed in this or previous session! Skip!
        continue;
      }

      // 24h deduplication check (only when not explicitly told to ignore history)
      if (!options.ignoreEngagedHistory) {
        const lastTime = persistedHistory[cleanHandle];
        if (lastTime && (Date.now() - lastTime < 24 * 3600 * 1000)) {
          continue;
        }
      }

      if (seenHandlesInThisScan.has(cleanHandle)) continue;
      seenHandlesInThisScan.add(cleanHandle);

      // Found a fresh, unliked comment!
      await humanScrollElementIntoView(art, 'center');
      await sleep(300);

      // 1. LIKE the comment on the post with Virtual Cursor (cursor moves, hovers, clicks)
      const likeBtn = art.querySelector('button[data-testid="like"]');
      let commentLiked = false;
      if (likeBtn) {
        try {
          await performHumanClick(likeBtn, {
            pulseColor: '#F43F5E',
            scroll: false,
            hoverDwell: 300,
            postPause: 350
          });
          commentLiked = true;
          console.log(`[ATOMX AUDIENCE] Successfully liked comment by @${cleanHandle} with virtual cursor!`);
          await sleep(350);
        } catch (likeErr) {
          console.warn('[ATOMX AUDIENCE] Like comment click notice:', likeErr);
        }
      }

      // 2. Visibly move Virtual Cursor to commenter's avatar/handle and click to open their profile!
      let profileClicked = false;
      const profileLink = art.querySelector('div[data-testid="User-Name"] a[role="link"]') ||
                          art.querySelector(`a[href="/${cleanHandle}" i], a[href="/${cleanHandle}/" i]`) ||
                          art.querySelector('div[data-testid*="UserAvatar"]')?.closest('a');
      if (profileLink) {
        try {
          console.log(`[ATOMX AUDIENCE] Moving virtual cursor to @${cleanHandle}'s profile link and clicking to visit...`);
          await sleep(250);
          await performHumanClick(profileLink, {
            pulseColor: '#38BDF8',
            scroll: false,
            hoverDwell: 380,
            postPause: 600
          });
          profileClicked = true;
        } catch (pErr) {}
      }

      return {
        found: true,
        cleanHandle,
        handle: `@${cleanHandle}`,
        authorName: data.authorName || cleanHandle,
        commentText: (data.text || '').slice(0, 100),
        commentLiked,
        profileClicked
      };
    }

    // Check for "Show replies" buttons
    const showBtns = Array.from(document.querySelectorAll('button[role="button"], div[role="button"]')).filter(b => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('show replies') || txt.includes('show more replies') || txt.includes('show probability') || txt.includes('hidden replies');
    });
    if (showBtns.length > 0) {
      await performHumanClick(showBtns[0], { scroll: false, hoverDwell: 250 });
      await sleep(600);
    }

    // Scroll down human-like to reveal more comments
    await humanSmoothScroll(520 + Math.floor(Math.random() * 140), { settlePause: 400 });
  }

  return { found: false, exhausted: true };
}

/**
 * Find the Following button on a Twitter profile page.
 * Supports both standard Twitter profiles (button with "Following" text / data-testid)
 * and Creator profiles with Subscriptions enabled (where "Following" is represented
 * by the [👤✓] icon button situated immediately to the left of the purple "Subscribe" button).
 */
function findProfileFollowingButton() {
  const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));

  // 1. Standard Profile Check:
  const standardBtn = allButtons.find(b => {
    const txt = (b.innerText || '').trim();
    const testId = (b.getAttribute('data-testid') || '').toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return (
      txt === 'Following' ||
      txt.includes('Following') ||
      testId.includes('unfollow') ||
      aria === 'following' ||
      aria.startsWith('following @') ||
      aria.includes('following')
    );
  });
  if (standardBtn) {
    return { button: standardBtn, isSubscribeLayout: false };
  }

  // 2. Creator Profile with "Subscribe" button:
  const subscribeBtn = allButtons.find(b => {
    const txt = (b.innerText || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return txt === 'subscribe' || aria === 'subscribe' || aria.startsWith('subscribe to') || aria.includes('subscribe');
  });

  if (subscribeBtn) {
    // Check siblings or preceding buttons within the same container
    const parent = subscribeBtn.parentElement;
    if (parent) {
      const containerBtns = Array.from(parent.querySelectorAll('button, div[role="button"]'));
      const subIdx = containerBtns.indexOf(subscribeBtn);
      if (subIdx > 0) {
        return { button: containerBtns[subIdx - 1], isSubscribeLayout: true };
      }
    }

    // Fallback: search in allButtons preceding subscribeBtn
    const globalIdx = allButtons.indexOf(subscribeBtn);
    if (globalIdx > 0) {
      for (let i = globalIdx - 1; i >= Math.max(0, globalIdx - 4); i--) {
        const candidate = allButtons[i];
        const rect = candidate.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < 650) {
          return { button: candidate, isSubscribeLayout: true };
        }
      }
    }
  }

  return null;
}

/**
 * Find the Follow button on a Twitter profile page.
 * Supports standard profiles and Creator profiles with Subscriptions.
 */
function findProfileFollowButton() {
  const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));

  // 1. Standard Follow button:
  const standardFollowBtn = allButtons.find(b => {
    const txt = (b.innerText || '').trim();
    const testId = (b.getAttribute('data-testid') || '').toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return (
      (txt === 'Follow' || testId.endsWith('-follow') || aria.startsWith('follow @') || aria === 'follow') &&
      !txt.includes('Following') &&
      !testId.includes('unfollow') &&
      !aria.includes('following')
    );
  });
  if (standardFollowBtn) return standardFollowBtn;

  // 2. Creator profile check:
  const subscribeBtn = allButtons.find(b => {
    const txt = (b.innerText || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return txt === 'subscribe' || aria === 'subscribe' || aria.startsWith('subscribe to') || aria.includes('subscribe');
  });

  if (subscribeBtn) {
    const parent = subscribeBtn.parentElement;
    if (parent) {
      const containerBtns = Array.from(parent.querySelectorAll('button, div[role="button"]'));
      const subIdx = containerBtns.indexOf(subscribeBtn);
      if (subIdx > 0) {
        const candidate = containerBtns[subIdx - 1];
        const txt = (candidate.innerText || '').trim();
        const testId = (candidate.getAttribute('data-testid') || '').toLowerCase();
        if (!txt.includes('Following') && !testId.includes('unfollow')) {
          return candidate;
        }
      }
    }
    const globalIdx = allButtons.indexOf(subscribeBtn);
    if (globalIdx > 0) {
      for (let i = globalIdx - 1; i >= Math.max(0, globalIdx - 4); i--) {
        const candidate = allButtons[i];
        const txt = (candidate.innerText || '').trim();
        const testId = (candidate.getAttribute('data-testid') || '').toLowerCase();
        const rect = candidate.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < 650 && !txt.includes('Following') && !testId.includes('unfollow')) {
          return candidate;
        }
      }
    }
  }

  return null;
}

/**
 * Executes unfollow on a profile page.
 * Handles both standard confirmation dialogs and the Creator Subscribe layout
 * where clicking [👤✓] expands "Unfollow @username" button before confirmation.
 */
async function executeProfileUnfollowAction(followingInfo, targetHandle = '') {
  if (!followingInfo || !followingInfo.button) return false;
  const btn = followingInfo.button;

  console.log(`[ATOMX] Initiating unfollow on @${targetHandle} (Subscribe layout: ${followingInfo.isSubscribeLayout})...`);

  // 1. Click following button or [👤✓] icon button
  btn.click();
  await sleep(550);

  // 2. If it expanded/revealed an "Unfollow @username" option (as seen in Subscribe profiles):
  const findRevealedOption = () => {
    const items = Array.from(document.querySelectorAll('button, div[role="button"], div[role="menuitem"], span[role="button"]'));
    const cleanHandle = (targetHandle || '').replace(/^@/, '').toLowerCase();
    return items.find(el => {
      const txt = (el.innerText || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const testId = (el.getAttribute('data-testid') || '').toLowerCase();

      // Don't mistake the confirmation dialog's final confirm button for the revealed menu
      if (testId.includes('confirmationsheetconfirm')) return false;

      const hasUnfollow = txt.startsWith('unfollow') || aria.startsWith('unfollow') || testId.includes('unfollow');
      const matchesHandle = cleanHandle ? (txt.includes(cleanHandle) || aria.includes(cleanHandle)) : true;
      return hasUnfollow && matchesHandle;
    });
  };

  const revealedBtn = findRevealedOption();
  if (revealedBtn && revealedBtn !== btn) {
    console.log(`[ATOMX] Found expanded unfollow button ("${revealedBtn.innerText.trim()}"). Clicking...`);
    revealedBtn.click();
    await sleep(550);
  }

  // 3. Confirm Unfollow via Twitter confirmation dialog / sheet if presented
  const confirmBtn = await waitForElement(
    'button[data-testid="confirmationSheetConfirm"], div[data-testid="confirmationSheetConfirm"]',
    2200
  ) || Array.from(document.querySelectorAll('div[role="dialog"] button, div[role="alertdialog"] button, button')).find(b => {
    const txt = (b.innerText || '').trim().toLowerCase();
    const testId = (b.getAttribute('data-testid') || '').toLowerCase();
    return testId.includes('confirmationsheetconfirm') || txt === 'unfollow';
  });

  if (confirmBtn) {
    console.log('[ATOMX] Confirming unfollow modal...');
    confirmBtn.click();
    await sleep(800);
    return true;
  }

  await sleep(500);
  return true;
}

/**
 * Agent 1: Audience Builder Per-Profile Interaction (Phase D)
 * Smoothly deep-scrolls profile page past header/bio/tabs, skips pinned posts,
 * centers the creator's real recent post on screen, likes it, generates AI reply adhering
 * to "Tone & Style (Applied Globally)", and follows the user.
 */
async function engageAndFollowProfile(options = {}) {
  isWorkflowAborted = false;

  // Instant 1-click skip detection from storage or memory
  const initialSkip = await chrome.storage.local.get(['atomx_skip_current']).catch(() => ({}));
  if (initialSkip?.atomx_skip_current || isWorkflowItemSkipped) {
    isWorkflowItemSkipped = false;
    await chrome.storage.local.set({ atomx_skip_current: false }).catch(() => null);
    console.log('[ATOMX] Target profile was skipped by user before execution.');
    return { success: true, skipped: true, ignored: true, reason: 'Skipped by user' };
  }
  isWorkflowItemSkipped = false;

  // 1-to-1 Verified Account Enforcement
  if (options.verifiedXHandle) {
    const lockCheck = await verifyAccountLockOrAbort(options.verifiedXHandle);
    if (!lockCheck.ok) {
      return { success: false, error: lockCheck.error, unauthorizedAccount: true };
    }
  }

  const targetHandle = typeof options === 'string' ? options : (options.handle || '');
  const likePosts = options.likePosts !== false;
  const replyPosts = !!options.replyPosts;
  const repostPosts = !!options.repostPosts;
  const followPosts = options.followPosts !== false;
  const autoUnfollow = !!options.autoUnfollow;
  const postsCountSetting = options.postsCount || options.postsPerProfile || 'random';
  const style = options.style || 'Bullish (5-10 words)';
  const stylePrompt = options.stylePrompt || null;
  const backendUrl = (options.backendUrl || 'https://agenticx-two.vercel.app').replace(/\/+$/, '');

  let likesDone = 0;
  let replyDone = 0;
  let repostDone = 0;
  let followed = false;
  let unfollowedFirst = false;

  if (checkTwitterRateLimit()) {
    triggerRateLimitAbort();
    return { success: false, aborted: true, rateLimited: true, error: 'Twitter Rate Limit detected' };
  }

  if (isWorkflowItemSkipped || isWorkflowAborted) {
    return { success: true, skipped: true, ignored: true, reason: 'Skipped by user' };
  }

  // Auto-skip if profile is protected or locked
  const profileRestriction = isTargetRestrictedOrCommentsLocked();
  if (profileRestriction.restricted) {
    console.log(`[ATOMX] @${targetHandle} is protected/locked: ${profileRestriction.reason}. Auto-skipping.`);
    return { success: true, skipped: true, ignored: true, reason: profileRestriction.reason };
  }

  try {
    // Step 1: Follow & Smart Unfollow Status Check (supports both standard and Subscribe layouts)
    const followingInfo = findProfileFollowingButton();
    const pageText = (document.body ? document.body.innerText : '') || '';
    const hasFollowsYouBadge = pageText.includes('Follows you');

    // Smart Unfollow Strategy for Sorsa Booster:
    // If target does not follow back and we already follow them -> unfollow first, engage on posts, then re-follow!
    if (autoUnfollow && followingInfo && !hasFollowsYouBadge && !isWorkflowItemSkipped && !isWorkflowAborted) {
      console.log(`[ATOMX] @${targetHandle} does not follow back. Executing Unfollow First strategy (Subscribe layout: ${followingInfo.isSubscribeLayout})...`);
      const unfollowDone = await executeProfileUnfollowAction(followingInfo, targetHandle);
      if (unfollowDone) {
        unfollowedFirst = true;
        await sleep(900);
      }
    } else if (!followingInfo && followPosts && !isWorkflowItemSkipped && !isWorkflowAborted) {
      // Follow action if requested and not yet following
      const followBtn = findProfileFollowButton();
      if (followBtn && !isWorkflowItemSkipped && !isWorkflowAborted) {
        await simulateHumanFollowClick(followBtn);
        followed = true;
        await sleep(500);
      }
    }

    if (isWorkflowItemSkipped || isWorkflowAborted) {
      return { success: true, skipped: true, ignored: true, reason: 'Skipped by user' };
    }

    // Step 2: Smooth scroll down past profile header/bio with human hydration
    await smoothScrollAndHydrate(550, 900);

    if (isWorkflowItemSkipped || isWorkflowAborted) {
      return { success: true, skipped: true, ignored: true, reason: 'Skipped by user' };
    }

    // Step 3: Wait for timeline posts to hydrate with retry scrolling
    let allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (allArticles.length === 0) {
      for (let retries = 0; retries < 6 && allArticles.length === 0; retries++) {
        if (isWorkflowItemSkipped || isWorkflowAborted) break;
        await sleep(500);
        await humanSmoothScroll(350, { settlePause: 350 });
        allArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      }
    }

    if (allArticles.length === 0) {
      console.log(`[ATOMX] No tweets found on profile timeline for @${targetHandle}.`);
      return { success: true, skipped: true, ignored: true, reason: 'No tweets found on profile' };
    }

    if (isWorkflowItemSkipped || isWorkflowAborted) {
      return { success: true, skipped: true, ignored: true, reason: 'Skipped by user' };
    }

    // Filter out pinned posts and any posts that are already liked
    const validRecentArticles = allArticles.filter(art => {
      const socialCtx = art.querySelector('div[data-testid="socialContext"]')?.innerText?.toLowerCase() || '';
      const isPinned = socialCtx.includes('pinned') || socialCtx.includes('pin');
      return !isPinned && !isPostAlreadyLiked(art);
    });

    let candidatePosts = validRecentArticles;
    if (candidatePosts.length === 0) {
      // If no unliked posts found:
      // If commenting or reposting is enabled, we can still comment/repost on recent non-pinned posts!
      if (replyPosts || repostPosts) {
        candidatePosts = allArticles.filter(art => {
          const socialCtx = art.querySelector('div[data-testid="socialContext"]')?.innerText?.toLowerCase() || '';
          return !socialCtx.includes('pinned') && !socialCtx.includes('pin');
        });
        if (candidatePosts.length === 0) candidatePosts = allArticles;
      } else {
        console.log(`[ATOMX] Recent posts for @${targetHandle} are already liked. Auto-skipping profile as per global rule.`);
        return { success: true, skipped: true, ignored: true, reason: 'Recent posts already liked' };
      }
    }

    // Determine how many posts to engage
    let numPostsToEngage = 1;
    if (postsCountSetting === 'random') {
      numPostsToEngage = Math.floor(Math.random() * 2) + 1; // 1 or 2 posts
    } else {
      numPostsToEngage = Math.max(1, Number(postsCountSetting) || 1);
    }
    const postsSlice = candidatePosts.slice(0, numPostsToEngage);

    // Step 4: Engage each post in postsSlice with all selected actions (Like, Repost, Comment)
    // Runs sequentially down the timeline without needing to scroll back up!
    for (let pIdx = 0; pIdx < postsSlice.length; pIdx++) {
      if (isWorkflowAborted || isWorkflowItemSkipped) break;
      const art = postsSlice[pIdx];

      // Center this post comfortably on screen
      await humanScrollElementIntoView(art, 'center');
      await sleep(400);

      // Action 1: Auto-Like
      if (likePosts && !isWorkflowItemSkipped && !isWorkflowAborted) {
        if (!isPostAlreadyLiked(art)) {
          const ok = await simulateHumanLikeClick(art);
          if (ok) {
            likesDone++;
            await sleep(450);
          }
        } else {
          console.log('[ATOMX] Post already liked. Skipping like.');
        }
      }

      // Action 2: Auto-Repost
      if (repostPosts && !isWorkflowItemSkipped && !isWorkflowAborted) {
        const ok = await simulateHumanRepostClick(art);
        if (ok) {
          repostDone++;
          await sleep(450);
        }
      }

      // Action 3: Auto-Comment
      if (replyPosts && !isWorkflowItemSkipped && !isWorkflowAborted) {
        const postRestriction = isTargetRestrictedOrCommentsLocked(art);
        if (postRestriction.restricted) {
          console.log(`[ATOMX] Comments restricted on post ${pIdx + 1}: ${postRestriction.reason}. Skipping comment.`);
        } else {
          try {
            const tweetData = extractTweetData(art);
            const tweetText = tweetData.text || '';
            const authorName = tweetData.authorName || targetHandle;
            const authorHandle = tweetData.authorHandle || `@${targetHandle}`;

            let commentToPost = '';
            try {
              const aiRes = await chrome.runtime.sendMessage({
                type: 'GENERATE_INLINE_REPLY',
                tweetText,
                tweetAuthor: authorHandle,
                tweetAuthorName: authorName,
                style,
                stylePrompt
              });
              if (aiRes?.reply) commentToPost = aiRes.reply.trim();
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
              } catch (dErr) {}
            }

            if (!commentToPost) {
              commentToPost = 'Spot on insight. Keep building!';
            }

            commentToPost = sanitizeClientComment(commentToPost, 10);
            if (commentToPost) {
              const commentRes = await postCommentOnTargetArticle(art, commentToPost);
              if (commentRes && commentRes.success) {
                replyDone++;
                await sleep(800);
              }
            }
          } catch (rErr) {
            console.warn('[ATOMX] Could not post profile reply:', rErr);
          }
        }
      }

      // Smoothly scroll down to next post in postsSlice if multiple posts requested
      if (pIdx < postsSlice.length - 1 && !isWorkflowAborted && !isWorkflowItemSkipped) {
        await humanSmoothScroll(380 + Math.floor(Math.random() * 80), { settlePause: 350 });
      }
    }

    // Step 7: If unfollowed first, RE-FOLLOW now to maximize follow-back!
    if (unfollowedFirst && followPosts && !isWorkflowAborted) {
      console.log(`[ATOMX] Re-following @${targetHandle} after engagement...`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(800);
      const reFollowBtn = findProfileFollowButton();
      if (reFollowBtn) {
        await simulateHumanFollowClick(reFollowBtn);
        followed = true;
        await sleep(500);
      }
    }

    if (isWorkflowAborted) {
      return { success: false, aborted: true };
    }

    return {
      success: true,
      alreadyFollowing: !!followingInfo && !unfollowedFirst,
      followed,
      unfollowedFirst,
      handle: targetHandle,
      likesDone,
      replyDone,
      repostDone
    };
  } catch (err) {
    return { success: false, error: err.message, likesDone, replyDone, repostDone };
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
    const lockCheck = await verifyAccountLockOrAbort(params.verifiedXHandle);
    if (!lockCheck.ok) {
      return {
        success: false,
        error: lockCheck.error,
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

    // Support expanded/revealed menuitem or button if rendered
    const revealedMenu = Array.from(document.querySelectorAll('button, div[role="button"], div[role="menuitem"]')).find(b => {
      const txt = (b.innerText || '').trim().toLowerCase();
      const testId = (b.getAttribute('data-testid') || '').toLowerCase();
      return (txt.startsWith('unfollow') || testId.includes('unfollow')) && !testId.includes('confirmationsheetconfirm');
    });
    if (revealedMenu && revealedMenu !== followBtn) {
      revealedMenu.click();
      await sleep(500);
    }

    // Confirm dialog: click "Unfollow" in confirmation modal
    const confirmBtn = await waitForElement('button[data-testid="confirmationSheetConfirm"]', 2500);
    if (confirmBtn) {
      confirmBtn.click();
      await sleep(700);
      return { success: true, action: 'UNFOLLOWED', handle: href };
    } else {
      // Try fallback modal confirmation
      const modalBtn = Array.from(document.querySelectorAll('div[role="dialog"] button, div[role="alertdialog"] button, button')).find(b => {
        const txt = (b.innerText || '').trim().toLowerCase();
        const testId = (b.getAttribute('data-testid') || '').toLowerCase();
        return testId.includes('confirmationsheetconfirm') || txt === 'unfollow';
      });
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
  const maxScrolls = Math.max(Number(params.maxScrolls) || 100, 80);
  const commenters = new Set();
  const mainArticle = getMainPostArticle();
  const mainHandle = mainArticle ? (extractTweetData(mainArticle).authorHandle || '').toLowerCase().replace(/^@/, '').trim() : '';

  let consecutiveNoNew = 0;
  let prevSize = 0;
  let clickedSpamOrHidden = false;

  console.log('[ATOMX DEFAULTERS] Starting deep comment audit on post. Will scroll till end and expand probable spam/hidden replies.');

  for (let i = 0; i < maxScrolls; i++) {
    if (isWorkflowAborted) break;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(art => {
      if (mainArticle && art === mainArticle) return;

      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (userEl) {
        // 1. Direct handle match from User-Name text: @username
        const handleMatch = (userEl.innerText || userEl.textContent || '').match(/@([a-zA-Z0-9_]{1,25})/);
        if (handleMatch) {
          const clean = handleMatch[1].toLowerCase().trim();
          if (clean && clean !== mainHandle && !['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'hashtag', 'settings'].includes(clean)) {
            commenters.add(clean);
          }
        }

        // 2. Also check profile link
        const links = userEl.querySelectorAll('a[href^="/"]');
        for (const link of links) {
          const href = (link.getAttribute('href') || '').replace(/^\//, '').split('?')[0].split('/')[0].toLowerCase().trim();
          if (href && !['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'hashtag', 'settings'].includes(href)) {
            if (href !== mainHandle && /^[a-z0-9_]{1,25}$/.test(href)) {
              commenters.add(href);
            }
            break;
          }
        }
      }
    });

    // Detect and Auto-Click "Probable Spam" or hidden / additional replies
    const actionButtons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
    let buttonClicked = false;
    for (const btn of actionButtons) {
      const txt = (btn.innerText || btn.textContent || '').toLowerCase().trim();
      if (
        txt.includes('probable spam') ||
        txt.includes('offensive content') ||
        txt.includes('show additional replies') ||
        txt.includes('show more replies') ||
        txt.includes('show replies') ||
        txt.includes('show probability')
      ) {
        try {
          gentleScrollIntoView(btn);
          btn.click();
          buttonClicked = true;
          clickedSpamOrHidden = true;
          console.log(`[ATOMX DEFAULTERS] Clicked expand button: "${txt.slice(0, 40)}"`);
          await sleep(1400);
          break;
        } catch (e) {}
      }
    }

    if (commenters.size === prevSize && !buttonClicked) {
      consecutiveNoNew++;
      // Check if user has scrolled past bottom
      if (consecutiveNoNew >= 8) {
        console.log(`[ATOMX DEFAULTERS] No new comments for 8 consecutive cycles. Scan complete.`);
        break;
      }
    } else {
      consecutiveNoNew = 0;
      prevSize = commenters.size;
    }

    await smoothScrollAndHydrate(850, 800);
  }

  console.log(`[ATOMX DEFAULTERS] Finished audit. Total unique commenters found: ${commenters.size} (expanded spam: ${clickedSpamOrHidden})`);

  return {
    success: true,
    mainAuthor: mainHandle,
    commenters: Array.from(commenters)
  };
}

// =========================================================================
// AGENT 13: COMMENTER RECIPROCATOR — PRE-COLLECTION LIKING & SMART DEDUPLICATION
// =========================================================================
async function collectReciprocatorCommenters(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || params.maxCount || 10);
  const maxScrolls = Math.max(params.maxScrolls || 40, targetCount * 4);
  const likeDelayMs = Number(params.commentLikeDelayMs || params.likeDelay || 4000);
  const collectedProfiles = [];
  const collectedHandles = new Set();
  const mainArticle = getMainPostArticle();
  const mainHandle = mainArticle ? (extractTweetData(mainArticle).authorHandle || '').toLowerCase().replace(/^@/, '').trim() : '';
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let likesGiven = 0;
  let skippedAlreadyLiked = 0;
  let consecutiveNoNew = 0;
  let prevSize = 0;

  console.log(`[ATOMX RECIPROCATOR] Scanning comments for post (target: ${targetCount}, special like delay: ${likeDelayMs}ms). Will auto-like unliked comments and skip already-liked comments.`);

  for (let i = 0; i < maxScrolls; i++) {
    if (isWorkflowAborted) break;

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    for (const art of articles) {
      if (isWorkflowAborted) break;
      if (mainArticle && art === mainArticle) continue;

      // Extract author handle
      let commentAuthor = '';
      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (userEl) {
        const links = userEl.querySelectorAll('a[href^="/"]');
        for (const link of links) {
          const href = (link.getAttribute('href') || '').replace(/^\//, '').split('?')[0].split('/')[0].toLowerCase().trim();
          if (href && !['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(href)) {
            commentAuthor = href;
            break;
          }
        }
      }

      if (!commentAuthor) {
        const d = extractTweetData(art);
        commentAuthor = (d.authorHandle || '').toLowerCase().replace(/^@/, '').trim();
      }

      // Skip self comments and main post author
      if (!commentAuthor || commentAuthor === mainHandle || (loggedInHandle && commentAuthor === loggedInHandle)) {
        continue;
      }

      // If author already collected in this run, skip
      if (collectedHandles.has(commentAuthor)) {
        continue;
      }

      // ── CRITICAL FEATURE ──
      // Check if this comment is ALREADY LIKED
      const isAlreadyLiked = !!art.querySelector('button[data-testid="unlike"], div[data-testid="unlike"], [data-testid="unlike"]') ||
                             Array.from(art.querySelectorAll('button, div[role="button"]')).some(b => {
                               const l = (b.getAttribute('aria-label') || '').toLowerCase();
                               return l.includes('unlike') || l.includes('liked');
                             });

      if (isAlreadyLiked) {
        // ALREADY LIKED: Skip collecting this profile (native deduplication)
        skippedAlreadyLiked++;
        continue;
      }

      // NOT YET LIKED: Like the comment on the spot before collecting profile!
      gentleScrollIntoView(art);
      await sleep(200);
      const likedOk = await simulateHumanLikeClick(art);
      if (likedOk) {
        likesGiven++;
      }

      // Special Delay Between Comment Likes (Commenter Reciprocator Exclusive)
      const specialPacing = Math.max(1500, likeDelayMs + Math.floor(Math.random() * 1000 - 500));
      console.log(`[ATOMX RECIPROCATOR] Comment liked. Special like delay pause: ${(specialPacing / 1000).toFixed(1)}s`);
      await sleep(specialPacing);

      // Collect this commenter's profile for reciprocal engagement
      collectedHandles.add(commentAuthor);
      collectedProfiles.push(commentAuthor);

      if (collectedProfiles.length >= targetCount) {
        break;
      }
    }

    if (collectedProfiles.length >= targetCount) {
      break;
    }

    // Auto-click "Show more replies" if visible
    const showBtns = Array.from(document.querySelectorAll('button[role="button"], div[role="button"]')).filter(b => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('show replies') || txt.includes('show more replies') || txt.includes('show probability');
    });
    if (showBtns.length > 0) {
      showBtns[0].click();
      await sleep(1000);
    }

    if (collectedProfiles.length === prevSize) {
      consecutiveNoNew++;
      if (consecutiveNoNew >= 8) break;
    } else {
      consecutiveNoNew = 0;
      prevSize = collectedProfiles.length;
    }

    await smoothScrollAndHydrate(650, 750);
  }

  console.log(`[ATOMX RECIPROCATOR] Scan finished. Collected ${collectedProfiles.length} profiles, liked ${likesGiven} comments, skipped ${skippedAlreadyLiked} already-liked.`);

  return {
    success: true,
    mainAuthor: mainHandle,
    commenters: collectedProfiles,
    likesGiven,
    skippedAlreadyLiked
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
// AGENT 1: AUDIENCE BUILDER — COLLECT ENGAGED COMMENTERS FROM LIST TIMELINE
// =========================================================================
async function collectAudienceFromListTimeline(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 10);
  const freshness = params.freshness || '1h';
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let freshnessMs = 60 * 60 * 1000;
  if (freshness === '15m') freshnessMs = 15 * 60 * 1000;
  else if (freshness === '30m') freshnessMs = 30 * 60 * 1000;
  else if (freshness === '1h') freshnessMs = 60 * 60 * 1000;
  else if (freshness === '2h') freshnessMs = 2 * 3600 * 1000;
  else if (freshness === '6h') freshnessMs = 6 * 3600 * 1000;
  else if (freshness === '12h') freshnessMs = 12 * 3600 * 1000;
  else if (freshness === '24h') freshnessMs = 24 * 3600 * 1000;
  else if (freshness === '3d') freshnessMs = 3 * 24 * 3600 * 1000;
  else if (freshness === '7d') freshnessMs = 7 * 24 * 3600 * 1000;

  const storedAudience = await new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['atomx_audience_engaged_history'], r);
    } else r({});
  });
  const engagedHistory = (storedAudience?.atomx_audience_engaged_history && typeof storedAudience.atomx_audience_engaged_history === 'object')
    ? storedAudience.atomx_audience_engaged_history : {};

  const collectedProfiles = new Map();
  const startTime = Date.now();
  let consecutiveEmptyScrolls = 0;
  const maxScanDurationMs = 120000; // 2 minutes warning threshold

  for (let s = 0; s < 25; s++) {
    if (isWorkflowAborted) break;
    if (Date.now() - startTime > maxScanDurationMs) {
      console.warn('[ATOMX AUDIENCE] Scraper reached 2-minute safety threshold.');
      break;
    }

    const initialCount = collectedProfiles.size;
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    for (const art of articles) {
      if (collectedProfiles.size >= targetCount) break;

      const timeEl = art.querySelector('time');
      const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
      const tweetTime = timeStr ? new Date(timeStr).getTime() : Date.now();
      const ageMs = Date.now() - tweetTime;
      if (ageMs > freshnessMs) continue; // Skip tweets older than freshness window

      const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      const repliesCount = extractTwitterMetric(replyBtn);

      const tweetData = extractTweetData(art);
      const authorHandle = (tweetData.authorHandle || '').replace(/^@/, '').toLowerCase().trim();

      // Collect commenters / repliers in thread
      const userLinks = Array.from(art.querySelectorAll('a[role="link"][href^="/"], div[data-testid="User-Name"] a[href^="/"]'));
      for (const link of userLinks) {
        const href = (link.getAttribute('href') || '').replace(/^\//, '').split('?')[0].split('/')[0].toLowerCase().trim();
        if (!href || ['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(href) || href === loggedInHandle) continue;

        if (engagedHistory[href]) continue; // Skip if already engaged

        if (!collectedProfiles.has(href)) {
          collectedProfiles.set(href, {
            cleanHandle: href,
            handle: `@${href}`,
            name: href,
            repliesCount: repliesCount || 1
          });
        }
      }

      if (authorHandle && authorHandle !== loggedInHandle && !engagedHistory[authorHandle] && !collectedProfiles.has(authorHandle)) {
        collectedProfiles.set(authorHandle, {
          cleanHandle: authorHandle,
          handle: `@${authorHandle}`,
          name: authorHandle,
          repliesCount: repliesCount || 1
        });
      }
    }

    if (collectedProfiles.size >= targetCount) break;

    if (collectedProfiles.size === initialCount) {
      consecutiveEmptyScrolls++;
    } else {
      consecutiveEmptyScrolls = 0;
    }

    // If 5-6 scrolls find no fresh tweets, scroll back up slightly to re-trigger feed hydration
    if (consecutiveEmptyScrolls >= 5) {
      console.log('[ATOMX AUDIENCE] 5 scrolls found no fresh tweets. Re-hydrating feed...');
      window.scrollTo({ top: Math.max(0, window.scrollY - 800), behavior: 'smooth' });
      await sleep(1500);
      consecutiveEmptyScrolls = 0;
      continue;
    }

    await smoothScrollAndHydrate(650, 900);
  }

  const profilesArray = Array.from(collectedProfiles.values()).slice(0, targetCount);
  const warned = (Date.now() - startTime > maxScanDurationMs) && profilesArray.length < targetCount;

  return {
    success: true,
    profiles: profilesArray,
    totalFound: profilesArray.length,
    warned: warned ? 'Warning: List had few fresh tweets in chosen timeframe after 2 minutes of scanning.' : null
  };
}

// =========================================================================
// AGENT 4: COLLECT ENGAGING NICHE PROFILES (FOLLOWERS INCREASE DISCOVERY)
// =========================================================================
async function collectEngagingNicheProfiles(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 8);
  const maxScrolls = Number(params.maxScrolls || 16);
  const freshness = params.freshness || '1h';
  const sortBy = params.sortBy || 'active'; // 'active' (highest replies) vs 'recent'
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let freshnessMs = 60 * 60 * 1000;
  if (freshness === '15m') freshnessMs = 15 * 60 * 1000;
  else if (freshness === '30m') freshnessMs = 30 * 60 * 1000;
  else if (freshness === '1h') freshnessMs = 60 * 60 * 1000;
  else if (freshness === '2h') freshnessMs = 2 * 3600 * 1000;
  else if (freshness === '6h') freshnessMs = 6 * 3600 * 1000;
  else if (freshness === '12h') freshnessMs = 12 * 3600 * 1000;
  else if (freshness === '24h') freshnessMs = 24 * 3600 * 1000;
  else if (freshness === '3d') freshnessMs = 3 * 24 * 3600 * 1000;
  else if (freshness === '7d') freshnessMs = 7 * 24 * 3600 * 1000;

  const foundMap = new Map();
  let consecutiveEmptyScrolls = 0;

  for (let s = 0; s < maxScrolls; s++) {
    if (isWorkflowAborted) break;
    const initialSize = foundMap.size;

    // Scrape tweet articles from list timeline
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    for (const art of articles) {
      // Filter out spam / giveaway / weak junk posts
      const text = (art.innerText || '').toLowerCase();
      if (text.includes('airdrop bot') || text.includes('send 0.1 eth') || text.includes('giveaway bot') || text.includes('dm to claim')) {
        continue;
      }

      // Filter out comments / replies strictly
      const artText = (art.innerText || '');
      const hasReplyingText = /replying to/i.test(artText);
      const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
      const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
      if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;

      const timeEl = art.querySelector('time');
      const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
      const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
      const ageMs = Date.now() - timestamp;
      if (ageMs > freshnessMs) continue;

      let handle = '';
      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (userEl) {
        const textMatch = (userEl.innerText || '').match(/@([a-zA-Z0-9_]{1,25})/);
        if (textMatch && textMatch[1]) {
          handle = textMatch[1].toLowerCase().trim();
        }
      }

      if (!handle || ['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(handle) || handle === loggedInHandle) {
        continue;
      }

      const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      const likeBtn = art.querySelector('button[data-testid="like"], div[data-testid="like"]');
      const repliesCount = extractTwitterMetric(replyBtn);
      const likesCount = extractTwitterMetric(likeBtn);
      const score = (repliesCount * 5) + likesCount + (sortBy === 'recent' ? Math.round(timestamp / 100000000) : 0);

      const existing = foundMap.get(handle);
      if (!existing || score > existing.score) {
        foundMap.set(handle, {
          cleanHandle: handle,
          handle: `@${handle}`,
          name: handle,
          score,
          timestamp,
          repliesCount
        });
      }
    }

    if (foundMap.size >= targetCount * 2) break;

    if (foundMap.size === initialSize) {
      consecutiveEmptyScrolls++;
    } else {
      consecutiveEmptyScrolls = 0;
    }

    // If 5-6 scrolls find no fresh tweets, re-hydrate feed without reloading page
    if (consecutiveEmptyScrolls >= 5) {
      console.log('[ATOMX FOLLOWERS] 5-6 scrolls found no new tweets. Re-hydrating feed...');
      window.scrollTo({ top: Math.max(0, window.scrollY - 800), behavior: 'smooth' });
      await sleep(1500);
      consecutiveEmptyScrolls = 0;
      continue;
    }

    await smoothScrollAndHydrate(700, 900);
  }

  const sorted = Array.from(foundMap.values())
    .sort((a, b) => sortBy === 'recent' ? b.timestamp - a.timestamp : b.score - a.score)
    .slice(0, targetCount);

  return { success: true, profiles: sorted, totalFound: sorted.length };
}

// =========================================================================
// AGENT 1: AUDIENCE BUILDER — DISCOVER TOP ENGAGED TWEETS FROM LIST TIMELINE
// Finds highest reply count tweets within timeframe, refreshing after 5-6 scrolls
// =========================================================================
async function discoverTopEngagedListTweets(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 10);
  const freshness = params.freshness || '2h';
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let freshnessMs = 2 * 3600 * 1000;
  if (freshness === '15m') freshnessMs = 15 * 60 * 1000;
  else if (freshness === '30m') freshnessMs = 30 * 60 * 1000;
  else if (freshness === '1h') freshnessMs = 60 * 60 * 1000;
  else if (freshness === '2h') freshnessMs = 2 * 3600 * 1000;
  else if (freshness === '6h') freshnessMs = 6 * 3600 * 1000;
  else if (freshness === '12h') freshnessMs = 12 * 3600 * 1000;
  else if (freshness === '24h') freshnessMs = 24 * 3600 * 1000;
  else if (freshness === '3d') freshnessMs = 3 * 24 * 3600 * 1000;
  else if (freshness === '7d') freshnessMs = 7 * 24 * 3600 * 1000;

  const topTweetsMap = new Map();
  let consecutiveEmptyScrolls = 0;
  let consecutiveOlderCount = 0;
  const maxScrolls = 50;

  console.log(`[ATOMX AUDIENCE] Scanning full timeframe (${freshness}) for highest engaged tweets...`);

  for (let s = 0; s < maxScrolls; s++) {
    if (isWorkflowAborted) break;

    const stopCheck = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
    if (stopCheck?.atomx_agent_workflow?.isStopped || stopCheck?.atomx_active_hud?.stateBadge === 'STOPPED' || stopCheck?.atomx_agent_workflow?.active === false) {
      isWorkflowAborted = true;
      break;
    }

    while (isHudWorkflowPaused && !isWorkflowAborted) {
      await sleep(1000);
    }

    const initialCount = topTweetsMap.size;
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let foundOlderInPass = 0;

    for (const art of articles) {
      if (isWorkflowAborted) break;

      const timeEl = art.querySelector('time');
      const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
      const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
      const ageMs = Date.now() - timestamp;
      if (ageMs > freshnessMs) {
        foundOlderInPass++;
        continue;
      }

      // Filter out comments / replies strictly
      const artText = (art.innerText || '');
      const hasReplyingText = /replying to/i.test(artText);
      const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
      const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
      if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;

      const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      const repliesCount = extractTwitterMetric(replyBtn) || 0;

      const statusLink = art.querySelector('a[href*="/status/"]');
      if (!statusLink) continue;
      const href = statusLink.getAttribute('href') || '';
      const fullUrl = href.startsWith('http') ? href : `https://x.com${href}`;

      const tweetData = extractTweetData(art);
      const author = (tweetData.authorHandle || '').replace(/^@/, '').trim();
      if (author && author.toLowerCase() === loggedInHandle) continue;

      if (!topTweetsMap.has(fullUrl)) {
        topTweetsMap.set(fullUrl, {
          url: fullUrl,
          repliesCount,
          author,
          timestamp
        });
      }
    }

    if (topTweetsMap.size === initialCount) {
      consecutiveEmptyScrolls++;
    } else {
      consecutiveEmptyScrolls = 0;
    }

    // If bottom tweets are consistently beyond user's timeframe (after at least 6 scrolls), stop scanning
    if (foundOlderInPass > 5 && s >= 6) {
      consecutiveOlderCount++;
      if (consecutiveOlderCount >= 4) {
        console.log(`[ATOMX AUDIENCE] Reached timeframe boundary (${freshness}). Completed deep scan.`);
        break;
      }
    } else {
      consecutiveOlderCount = 0;
    }

    // Provide live scan progress on HUD
    const maxRepliesFound = Array.from(topTweetsMap.values()).reduce((max, t) => Math.max(max, t.repliesCount || 0), 0);
    updateFloatingHud({
      title: 'Audience Builder',
      stateBadge: 'SCANNING',
      statusText: `Scanning list (${freshness})... Found ${topTweetsMap.size} posts (Highest: ${maxRepliesFound} comments)`
    });

    if (consecutiveEmptyScrolls >= 8) {
      // Reached bottom of timeline without new DOM elements
      break;
    }

    await smoothScrollAndHydrate(650, 900);
  }

  // Filter & prioritize tweets with genuine engagement (avoid 2-3 comment posts)
  const allCandidates = Array.from(topTweetsMap.values());
  const highReplyCandidates = allCandidates.filter(t => t.repliesCount >= 3);
  const filtered = highReplyCandidates.length > 0 ? highReplyCandidates : allCandidates.filter(t => t.repliesCount >= 1);
  const finalCandidates = filtered.length > 0 ? filtered : allCandidates;

  // Sort descending by highest replies count
  const sorted = finalCandidates.sort((a, b) => b.repliesCount - a.repliesCount);

  console.log(`[ATOMX AUDIENCE] Selected ${sorted.length} top engaged list tweets:`, sorted.slice(0, 5));

  return {
    success: true,
    topTweets: sorted,
    aborted: isWorkflowAborted
  };
}

/**
 * Visibly moves virtual cursor to target tweet card and clicks to open its status thread
 */
async function clickAndOpenTargetPost(postUrl, targetAuthor) {
  ensureVirtualCursorActive();
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  let targetArticle = null;

  for (const art of articles) {
    const links = Array.from(art.querySelectorAll('a[href*="/status/"]'));
    if (links.some(a => a.href && postUrl && a.href.includes(postUrl.split('/status/')[1]))) {
      targetArticle = art;
      break;
    }
  }

  if (!targetArticle && targetAuthor) {
    for (const art of articles) {
      const userEl = art.querySelector('div[data-testid="User-Name"]');
      if (userEl && userEl.innerText.toLowerCase().includes(targetAuthor.toLowerCase())) {
        targetArticle = art;
        break;
      }
    }
  }

  if (!targetArticle && articles.length > 0) {
    targetArticle = articles[0];
  }

  if (targetArticle) {
    await humanScrollElementIntoView(targetArticle, 'center');
    await sleep(250);

    const statusLink = targetArticle.querySelector('a[href*="/status/"] time')?.closest('a') ||
                       targetArticle.querySelector('a[href*="/status/"]') ||
                       targetArticle;

    console.log('[ATOMX] Moving virtual cursor to target post and clicking to open...');
    await performHumanClick(statusLink, {
      pulseColor: '#38BDF8',
      scroll: false,
      hoverDwell: 320,
      postPause: 500
    });
    return { success: true, clicked: true };
  }
  return { success: false };
}

// =========================================================================
// AGENT 4: FOLLOWERS INCREASE — DISCOVER TOP ACTIVE/RECENT POSTS FROM LIST
// Scans timeline within timeframe, extracts candidate posts for queue-based execution.
// =========================================================================
async function discoverTopActiveListTweets(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 8);
  const freshness = params.freshness || '1h';
  const sortPriority = params.sortPriority || 'active'; // 'active' (Most Active) vs 'recent' (Newest First)
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let freshnessMs = 60 * 60 * 1000;
  if (freshness === '15m') freshnessMs = 15 * 60 * 1000;
  else if (freshness === '30m') freshnessMs = 30 * 60 * 1000;
  else if (freshness === '1h') freshnessMs = 60 * 60 * 1000;
  else if (freshness === '2h') freshnessMs = 2 * 3600 * 1000;
  else if (freshness === '6h') freshnessMs = 6 * 3600 * 1000;
  else if (freshness === '12h') freshnessMs = 12 * 3600 * 1000;
  else if (freshness === '24h') freshnessMs = 24 * 3600 * 1000;
  else if (freshness === '3d') freshnessMs = 3 * 24 * 3600 * 1000;
  else if (freshness === '7d') freshnessMs = 7 * 24 * 3600 * 1000;

  const stored = await new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['atomx_follower_engaged_tweets', 'atomx_follower_engaged_history'], r);
    } else r({});
  });
  const engagedTweets = (stored?.atomx_follower_engaged_tweets && typeof stored.atomx_follower_engaged_tweets === 'object')
    ? stored.atomx_follower_engaged_tweets : {};
  const engagedAuthors = (stored?.atomx_follower_engaged_history && typeof stored.atomx_follower_engaged_history === 'object')
    ? stored.atomx_follower_engaged_history : {};

  const isNewest = sortPriority === 'recent';
  const candidateMap = new Map();
  let consecutiveOlderCount = 0;
  let consecutiveEmptyScrolls = 0;
  let skippedCount = 0;
  const maxScanScrolls = isNewest ? 4 : 50;

  console.log(`[ATOMX FOLLOWERS] Collecting posts. Mode: ${isNewest ? 'Newest First' : 'Most Active'}, Target: ${targetCount}`);

  // Ensure tweet articles are rendered on the page
  await waitForElement('article[data-testid="tweet"]', 10000);

  for (let s = 0; s < maxScanScrolls; s++) {
    if (isWorkflowAborted) break;

    const stopCheck = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
    if (stopCheck?.atomx_agent_workflow?.isStopped || stopCheck?.atomx_active_hud?.stateBadge === 'STOPPED' || stopCheck?.atomx_agent_workflow?.active === false) {
      isWorkflowAborted = true;
      break;
    }

    while (isHudWorkflowPaused && !isWorkflowAborted) {
      await sleep(1000);
    }

    const initialCandidateCount = candidateMap.size;
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let foundOlderInPass = 0;

    for (const art of articles) {
      if (isWorkflowAborted) break;

      const tweetData = extractTweetData(art);
      const tweetId = tweetData.id || tweetData.tweetUrl;
      const authorHandle = (tweetData.authorHandle || '').replace(/^@/, '').toLowerCase().trim();
      if (!tweetId || !authorHandle) continue;

      // Skip own tweets
      if (authorHandle === loggedInHandle) continue;

      // Check freshness: ONLY enforce for 'active' mode. For 'newest', feed is already sorted newest first!
      const timeEl = art.querySelector('time');
      const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
      const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
      const ageMs = Date.now() - timestamp;
      if (!isNewest && ageMs > freshnessMs) {
        foundOlderInPass++;
        continue;
      }

      // Check already engaged or already liked
      if (engagedTweets[tweetId] || engagedAuthors[authorHandle]) {
        skippedCount++;
        continue;
      }

      const alreadyLiked = art.querySelector('button[data-testid="unlike"]');
      if (alreadyLiked) {
        engagedTweets[tweetId] = Date.now();
        skippedCount++;
        continue;
      }

      // STRICT: Root post only, skip replies/comments
      const artText = (art.innerText || '');
      const hasReplyingText = /replying to/i.test(artText);
      const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
      const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
      if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;

      // Weak & Spam filter
      const tweetText = (tweetData.text || '').trim();
      const words = tweetText.split(/\s+/).filter(Boolean);
      if (tweetText.length < 15 || words.length < 4) continue;
      const lowerText = tweetText.toLowerCase();
      const spamKeywords = [
        'airdrop', 'send 0.1 eth', 'send eth', 'giveaway bot', 'dm to claim',
        'presale', 'free mint', 'claim your free', 'airdrop bot', 'pump',
        'drop wallet', 'drop address', 'whitelist slot'
      ];
      if (spamKeywords.some(kw => lowerText.includes(kw))) continue;

      // Extract replies count
      const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      const repliesCount = extractTwitterMetric(replyBtn) || 0;

      const statusLink = art.querySelector('a[href*="/status/"]');
      let tweetUrl = statusLink ? (statusLink.getAttribute('href') || '') : '';
      if (tweetUrl && !tweetUrl.startsWith('http')) tweetUrl = `https://x.com${tweetUrl}`;
      if (!tweetUrl && authorHandle && tweetId) tweetUrl = `https://x.com/${authorHandle}/status/${tweetId}`;

      if (!candidateMap.has(tweetId)) {
        candidateMap.set(tweetId, {
          tweetUrl,
          tweetId,
          authorHandle,
          authorName: tweetData.authorName || authorHandle,
          text: tweetText,
          repliesCount,
          timestamp,
          ageMs
        });

        // Fast exit inside pass if newest first and target count + reserve buffer reached
        if (isNewest && candidateMap.size >= targetCount + 3) {
          break;
        }
      }
    }

    // Fast exit if newest first and target posts reached
    if (isNewest && candidateMap.size >= targetCount) {
      console.log(`[ATOMX FOLLOWERS] Found ${candidateMap.size} newest posts directly from top of timeline. Scan complete.`);
      updateFloatingHud({
        title: 'Followers Increase',
        agentId: 'followers',
        stateBadge: 'ENGAGING',
        statusText: `Selected top ${Math.min(candidateMap.size, targetCount)} newest posts. Starting engagement...`,
        skipped: skippedCount
      });
      break;
    }

    if (candidateMap.size === initialCandidateCount) {
      consecutiveEmptyScrolls++;
    } else {
      consecutiveEmptyScrolls = 0;
    }

    if (!isNewest && foundOlderInPass > 3) {
      consecutiveOlderCount++;
      if (consecutiveOlderCount >= 3) {
        console.log(`[ATOMX FOLLOWERS] Reached timeframe boundary (${freshness}). Deep scan complete.`);
        break;
      }
    } else {
      consecutiveOlderCount = 0;
    }

    if (isNewest) {
      updateFloatingHud({
        title: 'Followers Increase',
        agentId: 'followers',
        stateBadge: 'ENGAGING',
        statusText: `Getting newest posts... Found ${candidateMap.size}/${targetCount}`,
        skipped: skippedCount
      });
    } else {
      const maxReplies = Array.from(candidateMap.values()).reduce((m, c) => Math.max(m, c.repliesCount || 0), 0);
      updateFloatingHud({
        title: 'Followers Increase',
        agentId: 'followers',
        stateBadge: 'SCANNING',
        statusText: `Scanning list (${freshness})... Found ${candidateMap.size} posts (Highest: ${maxReplies} comments)`,
        skipped: skippedCount
      });
    }

    if (consecutiveEmptyScrolls >= 5) break;
    await smoothScrollAndHydrate(600, 800);
  }

  const allCandidates = Array.from(candidateMap.values());
  let sorted = [];
  if (sortPriority === 'active') {
    sorted = allCandidates.sort((a, b) => b.repliesCount - a.repliesCount);
  } else {
    sorted = allCandidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  console.log(`[ATOMX FOLLOWERS] Discovered ${sorted.length} unengaged candidate posts (${skippedCount} skipped from top).`);

  return {
    success: true,
    topTweets: sorted,
    skippedCount,
    aborted: isWorkflowAborted
  };
}

// =========================================================================
// AGENT 4: FOLLOWERS INCREASE — DIRECT TIMELINE ENGAGEMENT ENGINE
// Engages directly on the List's recent posts (not comments) within timeframe.
// Skips weak tweets (< 15 chars, < 4 words, spam keywords).
// Auto-refreshes list if 5-6 scrolls yield no new tweets.
// =========================================================================
async function executeFollowersListCycle(params = {}) {
  isWorkflowAborted = false;
  const targetCount = Number(params.targetCount || 8);
  const freshness = params.freshness || '1h';
  const sortPriority = params.sortPriority || 'active'; // 'active' (Most Active) vs 'recent' (Newest Tweets First)
  const likePosts = params.likePosts !== false;
  const replyPosts = params.replyPosts !== false;
  const repostPosts = params.repostPosts === true;
  const autoFollow = params.autoFollow !== false;
  const style = params.style || 'Natural & Concise';
  const stylePrompt = params.stylePrompt || null;
  const backendUrl = (params.backendUrl || 'https://agenticx-two.vercel.app').replace(/\/+$/, '');
  const loggedInHandle = (getLoggedInUserHandle() || '').toLowerCase().replace(/^@/, '').trim();

  let freshnessMs = 60 * 60 * 1000;
  if (freshness === '15m') freshnessMs = 15 * 60 * 1000;
  else if (freshness === '30m') freshnessMs = 30 * 60 * 1000;
  else if (freshness === '1h') freshnessMs = 60 * 60 * 1000;
  else if (freshness === '2h') freshnessMs = 2 * 3600 * 1000;
  else if (freshness === '6h') freshnessMs = 6 * 3600 * 1000;
  else if (freshness === '12h') freshnessMs = 12 * 3600 * 1000;
  else if (freshness === '24h') freshnessMs = 24 * 3600 * 1000;
  else if (freshness === '3d') freshnessMs = 3 * 24 * 3600 * 1000;
  else if (freshness === '7d') freshnessMs = 7 * 24 * 3600 * 1000;

  const stored = await new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['atomx_follower_engaged_tweets', 'atomx_follower_engaged_history', 'atomx_safety_settings'], r);
    } else r({});
  });
  const engagedTweets = (stored?.atomx_follower_engaged_tweets && typeof stored.atomx_follower_engaged_tweets === 'object')
    ? stored.atomx_follower_engaged_tweets : {};
  const engagedAuthors = (stored?.atomx_follower_engaged_history && typeof stored.atomx_follower_engaged_history === 'object')
    ? stored.atomx_follower_engaged_history : {};
  const safety = stored?.atomx_safety_settings || {};
  const postWaitSec = Number(safety.postWait) || 20;

  let engagedCount = 0;
  let skippedCount = 0;
  const processedTweetIds = new Set();

  console.log(`[ATOMX FOLLOWERS] Starting Followers Increase engine. Mode: ${sortPriority === 'active' ? 'Most Active' : 'Newest First'}, Target: ${targetCount}, Freshness: ${freshness}`);

  // Helper: Execute engagement actions on a single tweet element
  async function performActionsOnTweet(art, tweetData, tweetId, authorHandle) {
    const skipCheckFollowers = await chrome.storage.local.get(['atomx_skip_current']).catch(() => ({}));
    if (skipCheckFollowers?.atomx_skip_current || isWorkflowItemSkipped) {
      isWorkflowItemSkipped = false;
      closeAnyOpenTwitterDialog();
      await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
      skippedCount++;
      updateFloatingHud({
        skipped: skippedCount,
        statusText: `Skipped @${authorHandle || 'user'}'s post. Moving to next...`
      });
      window.scrollBy({ top: 450, behavior: 'smooth' });
      return;
    }

    // Global Rule: Scroll post into center of screen and ensure visible before acting
    await scrollElementIntoViewAndEnsureVisible(art, 'center');
    await sleep(350);

    if (isWorkflowItemSkipped) {
      isWorkflowItemSkipped = false;
      closeAnyOpenTwitterDialog();
      await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
      skippedCount++;
      updateFloatingHud({
        skipped: skippedCount,
        statusText: `Skipped @${authorHandle || 'user'}'s post. Moving to next...`
      });
      window.scrollBy({ top: 450, behavior: 'smooth' });
      return;
    }

    // Global Rule: If post is already liked, auto-skip immediately!
    if (isPostAlreadyLiked(art)) {
      console.log(`[ATOMX FOLLOWERS] Post by @${authorHandle || 'user'} is already liked. Auto-skipping as per global rule.`);
      skippedCount++;
      updateFloatingHud({
        skipped: skippedCount,
        statusText: `Post by @${authorHandle || 'user'} already liked. Auto-skipping to next...`
      });
      window.scrollBy({ top: 450, behavior: 'smooth' });
      return;
    }

    // DYNAMIC SYNC: Re-read latest user action toggles from storage in case user paused & changed settings in popup
    const latestSync = await chrome.storage.local.get(['atomx_follower_settings', 'atomx_agent_workflow']).catch(() => ({}));
    const dynamicOpts = latestSync?.atomx_agent_workflow?.options || latestSync?.atomx_follower_settings || {};
    const actLike = typeof dynamicOpts.likePosts === 'boolean' ? dynamicOpts.likePosts : likePosts;
    const actReply = typeof dynamicOpts.replyPosts === 'boolean' ? dynamicOpts.replyPosts : replyPosts;
    const actRepost = typeof dynamicOpts.repostPosts === 'boolean' ? dynamicOpts.repostPosts : repostPosts;
    const actFollow = typeof dynamicOpts.autoFollow === 'boolean' ? dynamicOpts.autoFollow : autoFollow;

    // Respect pause before engaging
    while (isHudWorkflowPaused && !isWorkflowAborted && !isWorkflowItemSkipped) {
      await sleep(500);
    }
    if (isWorkflowAborted || isWorkflowItemSkipped) return;

    const statusMsg = `Engaging post [${engagedCount + 1}/${targetCount}] by @${authorHandle || 'user'}...`;
    updateFloatingHud({
      title: 'Followers Increase',
      stateBadge: 'ENGAGING',
      indicator: `${engagedCount}/${targetCount}`,
      done: engagedCount,
      collected: targetCount,
      skipped: skippedCount,
      progressPercent: Math.round((engagedCount / targetCount) * 100),
      statusText: statusMsg,
      nextAction: `Post [${Math.min(engagedCount + 1, targetCount)}/${targetCount}]`
    });

    // 1. ❤️ Like
    if (actLike && !isWorkflowAborted) {
      if (isWorkflowItemSkipped) {
        isWorkflowItemSkipped = false;
        closeAnyOpenTwitterDialog();
        await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
        skippedCount++;
        window.scrollBy({ top: 450, behavior: 'smooth' });
        return;
      }
      await simulateHumanLikeClick(art);
      await sleep(400);
    }

    // 2. 🔁 Repost
    if (actRepost && !isWorkflowAborted) {
      if (isWorkflowItemSkipped) {
        isWorkflowItemSkipped = false;
        closeAnyOpenTwitterDialog();
        await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
        skippedCount++;
        window.scrollBy({ top: 450, behavior: 'smooth' });
        return;
      }
      await simulateHumanRepostClick(art);
      await sleep(400);
    }

    // 3. 💬 Comment
    if (actReply && !isWorkflowAborted) {
      if (isWorkflowItemSkipped) {
        isWorkflowItemSkipped = false;
        closeAnyOpenTwitterDialog();
        await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
        skippedCount++;
        window.scrollBy({ top: 450, behavior: 'smooth' });
        return;
      }
      const tweetText = (tweetData.text || '').trim();
      let replyContent = '';
      try {
        const aiRes = await chrome.runtime.sendMessage({
          type: 'GENERATE_INLINE_REPLY',
          tweetText,
          tweetAuthor: `@${authorHandle}`,
          tweetAuthorName: tweetData.authorName || authorHandle,
          style,
          stylePrompt
        });
        if (aiRes?.reply) replyContent = aiRes.reply.trim();
      } catch (e) {
        console.warn('[ATOMX FOLLOWERS] AI reply error:', e);
      }

      if (!replyContent) {
        replyContent = 'Solid point. Appreciate the clear insight here.';
      }

      replyContent = sanitizeClientComment(replyContent, 10);
      if (replyContent && !isWorkflowAborted) {
        if (isWorkflowItemSkipped) {
          isWorkflowItemSkipped = false;
          closeAnyOpenTwitterDialog();
          await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
          skippedCount++;
          window.scrollBy({ top: 450, behavior: 'smooth' });
          return;
        }
        await postCommentOnTargetArticle(art, replyContent);
        await sleep(900);
      }
    }

    // 4. ➕ Follow author
    if (actFollow && authorHandle && !isWorkflowAborted) {
      if (isWorkflowItemSkipped) {
        isWorkflowItemSkipped = false;
        closeAnyOpenTwitterDialog();
        await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
        window.scrollBy({ top: 450, behavior: 'smooth' });
        return;
      }
      const followBtn = art.querySelector('button[data-testid$="-follow"]:not([data-testid*="unfollow"]), div[data-testid$="-follow"]:not([data-testid*="unfollow"]') ||
        Array.from(art.querySelectorAll('button, div[role="button"]')).find(b => {
          const t = (b.innerText || '').trim();
          const tid = (b.getAttribute('data-testid') || '').toLowerCase();
          return (t === 'Follow' || tid.includes('-follow')) && !t.includes('Following') && !tid.includes('unfollow');
        });
      if (followBtn) {
        await simulateHumanFollowClick(followBtn);
        await sleep(500);
      }
    }

    engagedCount++;
    engagedTweets[tweetId] = Date.now();
    if (authorHandle) engagedAuthors[authorHandle] = Date.now();

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        atomx_follower_engaged_tweets: engagedTweets,
        atomx_follower_engaged_history: engagedAuthors
      }).catch(() => null);
    }

    updateFloatingHud({
      title: 'Followers Increase',
      stateBadge: engagedCount >= targetCount ? 'DONE' : 'ENGAGING',
      indicator: `${engagedCount}/${targetCount}`,
      done: engagedCount,
      collected: targetCount,
      skipped: skippedCount,
      progressPercent: Math.round((engagedCount / targetCount) * 100),
      statusText: `✓ Engaged [${engagedCount}/${targetCount}] on @${authorHandle || 'user'}'s post`,
      nextAction: engagedCount >= targetCount ? 'Workflow Completed' : `Post [${engagedCount + 1}/${targetCount}]`
    });

    if (engagedCount >= targetCount || isWorkflowAborted) return;

    // Pacing countdown between posts
    const waitSec = Math.max(8, postWaitSec + Math.floor(Math.random() * 6 - 3));
    for (let sec = waitSec; sec > 0 && !isWorkflowAborted; sec--) {
      const check = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud', 'atomx_skip_current']).catch(() => ({}));
      if (check?.atomx_agent_workflow?.active === false || check?.atomx_agent_workflow?.isStopped || check?.atomx_active_hud?.isStopped || check?.atomx_active_hud?.stateBadge === 'STOPPED') {
        isWorkflowAborted = true;
        break;
      }
      if (isWorkflowItemSkipped || check?.atomx_skip_current) {
        isWorkflowItemSkipped = false;
        closeAnyOpenTwitterDialog();
        await chrome.storage?.local?.set({ atomx_skip_current: false }).catch(() => null);
        console.log('[ATOMX FOLLOWERS] Skip signal received during pacing delay. Advancing to next post.');
        break;
      }
      updateFloatingHud({
        nextAction: `Post [${Math.min(engagedCount + 1, targetCount)}/${targetCount}]`,
        countdownText: `⏱️ Next post in ${sec}s...`,
        timerBadge: `⏱️ ${sec}s`
      });
      await sleep(1000);
      if (isWorkflowAborted) break;
    }
  }

  // =========================================================================
  // STRATEGY 1: "MOST ACTIVE" (Sort by highest replies within timeframe)
  // =========================================================================
  if (sortPriority === 'active') {
    const candidateMap = new Map();
    let consecutiveOlderCount = 0;
    let consecutiveEmptyScrolls = 0;
    const maxScanScrolls = 50;

    for (let s = 0; s < maxScanScrolls; s++) {
      if (isWorkflowAborted) break;

      const stopCheck = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
      if (stopCheck?.atomx_agent_workflow?.isStopped || stopCheck?.atomx_active_hud?.stateBadge === 'STOPPED' || stopCheck?.atomx_agent_workflow?.active === false) {
        isWorkflowAborted = true;
        break;
      }

      while (isHudWorkflowPaused && !isWorkflowAborted && !isWorkflowItemSkipped) {
        await sleep(500);
      }

      const initialCandidateCount = candidateMap.size;
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      let foundOlderInPass = 0;

      for (const art of articles) {
        if (isWorkflowAborted) break;

        const tweetData = extractTweetData(art);
        const tweetId = tweetData.id || tweetData.tweetUrl;
        const authorHandle = (tweetData.authorHandle || '').replace(/^@/, '').toLowerCase().trim();
        if (!tweetId) continue;

        // Skip own tweets
        if (authorHandle && authorHandle === loggedInHandle) continue;

        // Check freshness
        const timeEl = art.querySelector('time');
        const timeStr = timeEl ? timeEl.getAttribute('datetime') : null;
        const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
        const ageMs = Date.now() - timestamp;
        if (ageMs > freshnessMs) {
          foundOlderInPass++;
          continue;
        }

        // Already engaged -> Skip and keep scrolling
        if (engagedTweets[tweetId]) {
          if (!processedTweetIds.has(tweetId)) {
            processedTweetIds.add(tweetId);
            skippedCount++;
          }
          continue;
        }

        if (isPostAlreadyLiked(art)) {
          engagedTweets[tweetId] = Date.now();
          if (!processedTweetIds.has(tweetId)) {
            processedTweetIds.add(tweetId);
            skippedCount++;
          }
          continue;
        }

        // STRICT: Root post only, skip replies/comments
        const artText = (art.innerText || '');
        const hasReplyingText = /replying to/i.test(artText);
        const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
        const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
        if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;

        // Weak & Spam filter
        const tweetText = (tweetData.text || '').trim();
        const words = tweetText.split(/\s+/).filter(Boolean);
        if (tweetText.length < 15 || words.length < 4) continue;
        const lowerText = tweetText.toLowerCase();
        const spamKeywords = [
          'airdrop', 'send 0.1 eth', 'send eth', 'giveaway bot', 'dm to claim',
          'presale', 'free mint', 'claim your free', 'airdrop bot', 'pump',
          'drop wallet', 'drop address', 'whitelist slot'
        ];
        if (spamKeywords.some(kw => lowerText.includes(kw))) continue;

        // Extract replies count
        const replyBtn = art.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
        const repliesCount = extractTwitterMetric(replyBtn) || 0;

        if (!candidateMap.has(tweetId)) {
          candidateMap.set(tweetId, {
            art,
            tweetData,
            tweetId,
            authorHandle,
            repliesCount,
            timestamp,
            ageMs
          });
        }
      }

      if (candidateMap.size === initialCandidateCount) {
        consecutiveEmptyScrolls++;
      } else {
        consecutiveEmptyScrolls = 0;
      }

      if (foundOlderInPass > 3) {
        consecutiveOlderCount++;
        if (consecutiveOlderCount >= 3) {
          console.log(`[ATOMX FOLLOWERS] Reached timeframe boundary (${freshness}). Scan complete.`);
          break;
        }
      } else {
        consecutiveOlderCount = 0;
      }

      updateFloatingHud({
        title: 'Followers Increase',
        stateBadge: 'SCANNING',
        statusText: `Scanning (${freshness}). Found ${candidateMap.size} unengaged posts (${skippedCount} skipped)...`,
        skipped: skippedCount
      });

      if (consecutiveEmptyScrolls >= 8) break;
      await smoothScrollAndHydrate(700, 1000);
    }

    if (candidateMap.size === 0 && !isWorkflowAborted) {
      console.log(`[ATOMX FOLLOWERS] No unengaged posts found in timeframe (${freshness}).`);
      const emptyMsg = `No unengaged posts found in selected timeframe (${freshness}).`;
      updateFloatingHud({
        title: 'Followers Increase',
        stateBadge: 'DONE',
        statusText: emptyMsg,
        timerBadge: '✓ Finished',
        done: 0,
        collected: targetCount,
        skipped: skippedCount,
        progressPercent: 100,
        countdownText: ''
      });
      return {
        success: true,
        engagedCount: 0,
        targetCount,
        emptyTimeframe: true,
        statusText: emptyMsg,
        aborted: false
      };
    }

    // Sort descending by highest replies count
    const rankedCandidates = Array.from(candidateMap.values())
      .sort((a, b) => b.repliesCount - a.repliesCount)
      .slice(0, targetCount);

    console.log(`[ATOMX FOLLOWERS] Engaging top ${rankedCandidates.length} most active posts:`, rankedCandidates);

    for (const item of rankedCandidates) {
      if (engagedCount >= targetCount || isWorkflowAborted) break;
      await performActionsOnTweet(item.art, item.tweetData, item.tweetId, item.authorHandle);
    }
  }

  // =========================================================================
  // STRATEGY 2: "NEWEST TWEETS FIRST" (Chronological downward engagement from top)
  // Engages directly on timeline cards from top to bottom until targetCount is met.
  // Skips already-engaged posts and advances to next post down.
  // =========================================================================
  else {
    const maxRecentScrolls = 75;
    let consecutiveEmptyScrolls = 0;

    for (let s = 0; s < maxRecentScrolls; s++) {
      if (isWorkflowAborted || engagedCount >= targetCount) break;

      const stopCheck = await chrome.storage?.local?.get(['atomx_agent_workflow', 'atomx_active_hud']).catch(() => ({}));
      if (stopCheck?.atomx_agent_workflow?.isStopped || stopCheck?.atomx_active_hud?.stateBadge === 'STOPPED' || stopCheck?.atomx_agent_workflow?.active === false) {
        isWorkflowAborted = true;
        break;
      }

      while (isHudWorkflowPaused && !isWorkflowAborted && !isWorkflowItemSkipped) {
        await sleep(500);
      }

      const initialEngaged = engagedCount;
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      let foundNewInPass = 0;

      for (const art of articles) {
        if (isWorkflowAborted || engagedCount >= targetCount) break;

        const tweetData = extractTweetData(art);
        const tweetId = tweetData.id || tweetData.tweetUrl;
        const authorHandle = (tweetData.authorHandle || '').replace(/^@/, '').toLowerCase().trim();

        if (!tweetId || processedTweetIds.has(tweetId)) continue;
        processedTweetIds.add(tweetId);
        foundNewInPass++;

        // Skip own tweets
        if (authorHandle && authorHandle === loggedInHandle) continue;

        // Skip if already engaged on this tweet -> Skip and advance to next post down!
        if (engagedTweets[tweetId]) {
          skippedCount++;
          updateFloatingHud({
            skipped: skippedCount,
            statusText: `Skipping already engaged post by @${authorHandle || 'user'}... Continuing down...`
          });
          continue;
        }

        if (isPostAlreadyLiked(art)) {
          engagedTweets[tweetId] = Date.now();
          skippedCount++;
          updateFloatingHud({
            skipped: skippedCount,
            statusText: `Skipping already liked post by @${authorHandle || 'user'}... Continuing down...`
          });
          continue;
        }

        // STRICT: Root posts only (skip comments/replies in timeline)
        const artText = (art.innerText || '');
        const hasReplyingText = /replying to/i.test(artText);
        const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
        const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
        if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;

        // Filter out spam
        const tweetText = (tweetData.text || '').trim();
        const words = tweetText.split(/\s+/).filter(Boolean);
        if (tweetText.length < 10 || words.length < 3) continue;
        const lowerText = tweetText.toLowerCase();
        const spamKeywords = [
          'airdrop bot', 'send 0.1 eth', 'send eth', 'giveaway bot', 'dm to claim',
          'presale', 'free mint', 'claim your free', 'drop wallet', 'drop address', 'whitelist slot'
        ];
        if (spamKeywords.some(kw => lowerText.includes(kw))) continue;

        // QUALIFYING RECENT POST FROM TOP FOUND — ENGAGE DIRECTLY ON TIMELINE CARD!
        console.log(`[ATOMX FOLLOWERS] Engaging post [${engagedCount + 1}/${targetCount}] by @${authorHandle || 'user'}`);
        await performActionsOnTweet(art, tweetData, tweetId, authorHandle);
      }

      if (engagedCount >= targetCount) break;

      if (foundNewInPass > 0 || engagedCount > initialEngaged) {
        consecutiveEmptyScrolls = 0;
      } else {
        consecutiveEmptyScrolls++;
      }

      if (consecutiveEmptyScrolls >= 12) {
        console.log('[ATOMX FOLLOWERS] Reached end of scrollable feed.');
        break;
      }

      // Smooth scroll down to bring next tweets into view
      await smoothScrollAndHydrate(850, 1000);
    }

    if (engagedCount === 0 && !isWorkflowAborted) {
      console.log(`[ATOMX FOLLOWERS] No unengaged posts found in current feed.`);
      const emptyMsg = `No unengaged posts found in current list feed.`;
      updateFloatingHud({
        title: 'Followers Increase',
        stateBadge: 'DONE',
        statusText: emptyMsg,
        timerBadge: '✓ Finished',
        done: 0,
        collected: targetCount,
        skipped: skippedCount,
        progressPercent: 100,
        countdownText: ''
      });
      return {
        success: true,
        engagedCount: 0,
        targetCount,
        emptyTimeframe: true,
        statusText: emptyMsg,
        aborted: false
      };
    }
  }

  if (isWorkflowAborted) {
    updateFloatingHud({
      stateBadge: 'STOPPED',
      statusText: 'Workflow stopped by user.',
      timerBadge: '🛑 Stopped',
      countdownText: '',
      isStopped: true,
      active: false
    });
  }

  return {
    success: true,
    engagedCount,
    targetCount,
    aborted: isWorkflowAborted
  };
}

// =========================================================================
// AGENT 13: COMMENTER RECIPROCATOR PROFILE ENGAGEMENT ENGINE
// =========================================================================
async function executeReciprocalProfileEngagement(params = {}) {
  isWorkflowAborted = false;

  // 1-to-1 Verified Account Enforcement
  if (params.verifiedXHandle) {
    const lockCheck = await verifyAccountLockOrAbort(params.verifiedXHandle);
    if (!lockCheck.ok) {
      return {
        success: false,
        error: lockCheck.error,
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


