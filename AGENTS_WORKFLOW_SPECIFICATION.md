# ATOMX — Agent Architecture, Workflow & Global Rules Specification

> **Version:** 2.4.0  
> **Target Platform:** Twitter / X (x.com)  
> **Extension Architecture:** Manifest V3 (Service Worker `background.js` + Isolated Content Script `content.js` + Main World Protector `prevent-tab-close.js`)

---

## 1. Executive Summary & Core Philosophy

AtomX is an autonomous, human-mimicking Twitter/X engagement platform. It operates under two unbreakable golden rules:
1. **Indistinguishable from Human Behavior:** All interactions (mouse movements, clicks, pauses, typing speeds, and scrolls) must mimic authentic human physics. No instant synthetic clicks, no machine-like rigid scrolling, and no immediate burst actions.
2. **Fail-Safe Robustness & Non-Destructive Flow:** The extension must never crash the tab, get stuck in infinite deadlocks, re-engage skipped posts, or trigger Twitter's disruptive "Save post? Draft" prompts.

---

## 2. Global Human Interaction Engine (Global Rules)

### 2.1. Virtual Cursor & Bezier Movement
- **Visual Cursor:** A floating glowing cursor element (`#atomx-virtual-cursor`) rendered over the page.
- **Trajectory:** Mouse paths do not follow straight mathematical vectors. They follow **Cubic Bézier curves** with randomized control points and subtle micro-jitters (1-3px variance) simulating hand tremor.
- **Timing:** Cursor flight time is dynamically calculated based on Euclidean distance:
  $$\text{Flight Duration} = \min(850\text{ms}, \max(350\text{ms}, \text{distance} \times 0.65))$$
- **Pre-Click Dwell (Hover):** Upon reaching the target element's bounding box, the cursor dwells for 220ms – 450ms before depressing the mouse button.
- **Click Pulse & Feedback:** A radial ripple pulse illuminates over the target element upon mousedown.
- **Post-Click Pause:** After click release, an organic human pause (280ms – 520ms) occurs before any subsequent action.

### 2.2. Human Typing Engine (`simulateHumanTyping`)
- Never injects text via instant `input.value = text`.
- Types character-by-character using synthetic `KeyboardEvent('keydown')`, `InputEvent('beforeinput')`, and `InputEvent('input')`.
- **Keystroke Variance:** Typing interval varies organically between 35ms and 110ms per character.
- **Punctuation Pauses:** After commas (`,`), periods (`.`), or question marks (`?`), an extended thinking pause of 180ms – 400ms is naturally inserted.
- **Random Typos & Corrections:** Periodically simulates an accidental keystroke, pauses for 150ms, backspaces, and re-types the correct character.

---

## 3. Global Scroll Architecture (`humanSmoothScroll`)

Scrolling on Twitter/X is dangerous if done naively because Twitter employs **virtualized DOM lists** (tweets outside the viewport are dynamically detached from the DOM). AtomX uses a physics-based, multi-stage scroll engine:

### 3.1. The Scroll Guard (Critical Safety Rule)
```javascript
// Never scroll while a modal dialog, compose sheet, or confirmation prompt is open!
if (document.querySelector('div[role="dialog"], div[aria-modal="true"], div[data-testid="confirmationSheetDialog"]')) {
  return; // FREEZE SCROLL IMMEDIATELY
}
```
- **Why this exists:** While typing a comment or handling a skip, if the background timeline scrolls, Twitter's fixed modal shifts visual context, disorients the user, and causes element coordinate miscalculations.

### 3.2. Physics & Easing
- **Chunked Steps:** Instead of one massive `window.scrollTo`, distance is broken into variable-sized increments (18px – 48px).
- **Easing Curve:** Quadratic ease-out or sinusoidal decelerations.
- **Micro-Jitters:** Small 2px – 5px reverse or lateral scroll fluctuations mimic finger lift on a mouse wheel or trackpad.
- **Settlement Pause (`settlePause`):** After reaching the target distance, a resting pause of 350ms – 600ms is strictly maintained to allow Twitter's virtualized feed to hydrate new tweet DOM nodes.

### 3.3. Element Alignment (`scrollElementIntoViewAndEnsureVisible`)
- When a target post is identified, it is brought smoothly to the **center of the viewport** (`block: 'center'`).
- The script waits 350ms for layout shifts or sticky headers (`[data-testid="TopNavBar"]`) to settle before calculating bounding rectangles for buttons.

### 3.4. Post-Engagement Progression
- Once a post is engaged or skipped, the page performs a **500px – 550px downward scroll** to move the finished post out of focus and bring fresh, un-evaluated tweets into the active viewport.

### 3.5. Long Post & Modal Composer Alignment (`ensureCommentBoxComfortablyVisible`)
- **The Challenge:** When an original tweet is very long (multiple paragraphs, attached media, or embedded quote tweets), opening Twitter's reply modal pushes the comment textarea (`div[data-testid="tweetTextarea_0"]`) down to the very bottom cutoff of the modal dialog, partially or completely hidden behind bottom toolbars.
- **The Rule:** Before typing begins, `typeTextHumanLike` checks if the composer is pushed down (`rect.bottom > vh - 170` or `rect.bottom > containerRect.bottom - 70`).
- **The Execution:** ONLY when this condition is met, the engine performs a gentle, smooth scroll (`scrollContainer.scrollBy({ top: delta, behavior: 'smooth' })` or `editor.scrollIntoView({ behavior: 'smooth', block: 'center' })`) on the modal's internal scroll container.
- **Result:** The long tweet shifts upward slightly, placing the user's avatar, composer box, and typed text cleanly in the upper-middle of the modal. The user can see every word being typed with full visibility. Background window scroll position is strictly preserved (`window.scrollTo(0, initialWinY)`).

---

## 4. Skip & Clean-Up Protocol (No "Save Post?" Prompts)

### 4.1. The Problem
When skipping a post while the reply modal is open and has text typed:
- Clicking the Close (`X`) button triggers Twitter's confirmation sheet:  
  *"Save post? You can save this to send later from your drafts."* ➔ Options: `Save` or `Discard`.
- If unhandled or misclicked, it causes modal lockups, prompt loops, or inadvertent tab reloads.

### 4.2. The AtomX Solution: Direct Discard Click Protocol
1. **Instant Discard Detection:** If Twitter's "Save post?" confirmation sheet is already on screen, the **Discard** button is immediately located and clicked using authentic pointer events (`dispatchEnhancedHumanEvents`).
2. **Close (X) -> Discard Flow:** If the reply modal is open, the top-left Close (`X`) button is clicked. Twitter will trigger the "Save post?" confirmation sheet. The instant it appears, AtomX clicks **Discard**.
3. **Strict Discard Matching:** The selector strictly looks for elements containing text "Discard" (and explicitly excludes "Save").
4. **No Escape Key Dispatching:** Discarding does not dispatch synthetic `Escape` keys to prevent Twitter router loops or accidental tab close.
5. **Tab & Window Close Guard:** All `window.close()` and dangerous `history.back()` calls are neutralized in both the isolated content script and the main browser world (`prevent-tab-close.js`).

### 4.3. Anti-Repeat Protection (Never Re-Comment Skipped Posts)
To guarantee the bot never attempts to comment on the same skipped post again:
1. **DOM Tagging:** The article DOM node receives permanent attributes:
   ```javascript
   art.setAttribute('data-atomx-skipped', 'true');
   art.setAttribute('data-atomx-engaged', 'true');
   ```
2. **Memory Set:** The post's ID is pushed into the active runtime `alreadyEngagedSet`.
3. **Persistent Storage:** `tweetId` is saved to `chrome.storage.local` under `engagedTweetIds` and `atomx_follower_engaged_tweets`.
4. **Pre-Check Filter:** Every agent checks:
   ```javascript
   if (art.getAttribute('data-atomx-skipped') === 'true' || alreadyEngagedSet.has(tweetId)) {
     continue; // Skip silently
   }
   ```

---

## 5. Detailed Agent Specifications

---

### Agent 1: Audience Builder (In-Thread Commentator & Niche Growth Engine)
- **Primary Goal:** Identify high-intent, active commentators inside curated Twitter Lists and niche communities to build a high-signal, reciprocal audience.
- **Feed Ingestion & Filtering:**
  - When given a Twitter List URL (`https://x.com/i/lists/{listId}`), the engine extracts the `listId` and builds a filtered live search feed:
    ```text
    https://x.com/search?q=list:{listId} lang:en -filter:retweets -filter:replies exclude:replies&f=live
    ```
  - This ensures only original, highly engaging parent posts appear during candidate discovery.
- **Workflow & Lifecycle:**
  1. **Phase 1: Discover High-Engagement Seed Posts (`DISCOVER_TOP_ENGAGED_LIST_TWEETS`):**
     - Scans candidate posts within the user-specified freshness window (`15m`, `30m`, `1h`, `2h`, `6h`, `12h`, `24h`).
     - Extracts the reply count for each post using `extractTwitterMetric(replyBtn)`.
     - Selects the top parent posts with the highest reply velocity.
  2. **Phase 2: In-Thread Comment Exploration (Single-Tab Reused Loop):**
     - Navigates directly to the target post URL in the **SAME tab** (never opens child tabs).
     - Hydrates comment section via gentle human-like downward scrolling.
     - Scans comment articles (`article[data-testid="tweet"]`) under the focal tweet.
     - **Comment Filtering Rules:**
       - Auto-skip the original tweet author (focus is strictly on active commenters).
       - Auto-skip the logged-in user's own comments (`getLoggedInUserHandle()`).
       - Auto-skip previously processed commenters (`alreadyReplied` set and storage history).
       - Auto-skip spam/bot comments (< 10 chars, spam keywords).
  3. **Phase 3: Commenter Profile Engagement & Reciprocal Loop:**
     - Likes the target comment to visibly mark it as inspected.
     - Smoothly clicks the commenter's profile handle in the **SAME tab**.
     - On the commenter's profile page:
       - Verifies the user is not private or already followed (if unfollow mode is not desired).
       - Locates their topmost original root post (skipping pinned retweets and replies).
       - Smoothly aligns post to viewport center.
       - Likes the post (`simulateHumanLikeClick`).
       - Optionally types and submits an organic AI comment (`postCommentOnTargetArticle`).
       - Clicks "Follow" (`simulateHumanFollowClick`).
     - Navigates back (`history.back()` or direct thread URL) to the original comment thread in the **SAME tab**.
     - Resumes the comment loop for the next candidate until `targetCount` is satisfied.
- **Safety & Error Guards:**
  - 1-to-1 Verified Account Enforcement: Aborts immediately if the active logged-in Twitter account doesn't match `verifiedXHandle`.
  - Single-Tab Reused Architecture: All navigations reuse `agentWorkflowWorkingTabId`.
  - Skip & Close Guard: Protected by `prevent-tab-close.js` so `window.close()` or Twitter navigation errors never kill the active tab.

---

### Agent 3: Home Feed Engager / Auto Pilot (Continuous Timeline Presence)
- **Primary Goal:** Maintain an authentic, organic daily presence on the user's home timeline (`x.com/home`), interacting with followed accounts and algorithmically curated content without triggering bot patterns.
- **Feed Source:** Directly operates on `https://x.com/home` (Following or "For you" feed).
- **Multi-Tier Strict Filtering (Pure Root Posts Only):**
  1. **Own Posts Filter:** Never likes or replies to posts authored by the logged-in account (`getLoggedInUserHandle()`).
  2. **Promoted / Ads Filter:** Automatically detects and skips sponsored posts via `[data-testid="placementTracking"]`, "Ad", "Promoted" badges, and sponsored disclosure links.
  3. **Retweet / Repost Filter:**
     - Inspects `div[data-testid="socialContext"]` and `svg[data-testid="icon-retweet"]`.
     - Discards any tweet where text contains `/reposted|retweeted/i`.
  4. **Reply / Comment Thread Filter:**
     - Discards any tweet containing "Replying to @...", vertical thread connector lines (`div[style*="width: 2px"]`), or reply header links.
  5. **Already Engaged / Liked Filter:**
     - Checks if like button already has `[data-testid="unlike"]`.
     - Checks memory set `processedTweetIds` and persistent `engagedTweets` / `engagedTweetIds`.
  6. **Content Quality & Spam Filter:**
     - Rejects low-effort posts (< 15 characters or < 4 words).
     - Rejects spam/crypto-bot triggers (`airdrop`, `giveaway bot`, `presale`, `drop wallet`, `whitelist slot`, etc.).
- **Human Engagement Pipeline:**
  1. **Centering & Alignment:** Uses `scrollElementIntoViewAndEnsureVisible(art, 'center')` to smoothly bring the post into view. Waits 350ms for layout shifts and sticky navbars to settle.
  2. **Like Action:** Moves the virtual cursor (`#atomx-virtual-cursor`) along a Bézier trajectory to the like button, hovers, pulses rose (`#F43F5E`), and clicks authentically.
  3. **Repost Action (Optional):** If enabled, hovers the repost button, clicks, and confirms "Repost".
  4. **AI Comment Action (Optional):**
     - Generates contextual reply via backend AI service using the user's selected style prompt (e.g. "Natural & Concise", "Bullish", "Thought-Provoking").
     - Enforces anti-bot sanitization via `sanitizeClientComment`: strips quote marks, limits word count based on prompt.
     - Locates reply trigger, focuses composer (inline or modal), and types character-by-character with human micro-delays (35–110ms), punctuation pauses, and typo corrections.
     - Submits comment via debounced single-click `simulateHumanSubmitClick`.
     - Completely dismisses dialogs and clears draft buffers.
  5. **Human Pacing & Rest Interval:**
     - Executes a realistic pacing countdown (15–35 seconds randomized) between posts.
     - Updates floating HUD with remaining countdown timer (`⏱️ Next post in Xs...`).
     - Batches engagements (e.g. 3–5 posts), followed by a leisurely human pause (1–3 minutes) before scrolling.
- **Skip & Fail-Safe Protocol:**
  - Clicking HUD Skip (`⏭️`):
    - Instantly pauses pacing timer.
    - If a reply modal is open, clicks the close (`X`) button and immediately triggers the authentic **Discard** button (eliminating Twitter's "Save post?" prompt).
    - Tags post DOM with `data-atomx-skipped="true"`.
    - Scrolls 500px down to push the skipped post out of the viewport.
    - **NEVER closes the tab or navigates away.**

---

### Agent 4: Followers Increase Engine (Curated List Growth Platform)
- **Primary Goal:** Drive reciprocal follower growth by systematically engaging top accounts and authors inside a curated Twitter List.
- **THE UNBREAKABLE SEARCH LIVE RULE (No Direct Raw List URLs):**
  > [!CRITICAL]
  > **Why Raw Twitter List Pages (`x.com/i/lists/{listId}`) Must NEVER Be Used Directly:**
  > Navigating to raw Twitter List URLs displays an unfiltered stream containing retweets, reposts, and reply chains from all list members. This pollutes the feed and breaks the user requirement for pure, original parent posts.
  > 
  > **The Required Solution:**
  > The engine MUST ALWAYS construct and navigate to Twitter's **Search Live feed** with negative filters:
  > ```text
  > https://x.com/search?q=list:{listId} -filter:replies -filter:retweets&f=live
  > ```
  > - `list:{listId}`: Scopes search strictly to tweets authored by members of the specified list.
  > - `-filter:replies`: Hard-filters all replies, comment threads, and conversation snippets.
  > - `-filter:retweets`: Hard-filters all retweets and reposts.
  > - `&f=live`: Sorts the search feed in real-time chronological order (latest tweets first).
  > 
  > Both `background.js` and `popup.js` must set `feedUrl` and `searchFeedUrl` to this filtered search live URL. The raw canonical list URL is kept only as a metadata reference.

- **Supported Operating Modes:**
  1. **Newest Tweet First Mode (`sortPriority: 'recent'`):**
     - **Objective:** Pure chronological top-down engagement from the very top newest post downward.
     - **Timeframe:** Bypasses strict freshness cutoffs (`1h`, `2h`, etc.) because the Search Live feed is already chronological. It simply engages whatever original post is at the top of the feed down to `targetCount`.
     - **Execution Flow:**
       1. Opens `https://x.com/search?q=list:{listId} -filter:replies -filter:retweets&f=live`.
       2. Scans visible articles on screen.
       3. Applies strict root post filters (skip own tweets, skip retweets, skip replies, skip already liked/engaged, skip spam).
       4. Engages the qualifying post:
          - Like post (virtual cursor rose pulse).
          - Generate & type AI reply (sanitized via `params?.stylePrompt || params?.style`).
          - Follow author (if `autoFollow` enabled).
          - Record `tweetId` in `atomx_follower_engaged_tweets` and author in `atomx_follower_engaged_history`.
       5. Runs pacing delay (15–25 seconds) with live HUD countdown.
       6. Advances down to the next post. When visible posts are exhausted, smoothly scrolls down (`smoothScrollAndHydrate(850, 1000)`) to load the next batch.
       7. Continues until `engagedCount >= targetCount`.
  2. **Most Active Mode (`sortPriority: 'active'`):**
     - **Objective:** Identify and engage only the posts with the highest reply velocity within a specific freshness timeframe.
     - **Freshness Window:** Enforces user-selected cutoff (`15m`, `30m`, `1h`, `2h`, `6h`, `12h`, `24h`, `3d`, `7d`).
     - **Execution Flow:**
       1. Opens `https://x.com/search?q=list:{listId} -filter:replies -filter:retweets&f=live`.
       2. Scans feed down up to 50 smooth scroll passes.
       3. Filters for timestamp: `Date.now() - postTimestamp <= freshnessMs`.
       4. Extracts reply count for each post (`extractTwitterMetric(replyBtn)`).
       5. Sorts qualifying candidate posts descending by reply count (`b.repliesCount - a.repliesCount`).
       6. Takes top `targetCount` ranked posts and engages them in order.

- **DOM-Level Double Defense:**
  Even with `-filter:replies -filter:retweets` in the search URL, Twitter's backend occasionally leaks quotes or conversational items. AtomX enforces a mandatory DOM-level filter inside `content.js` before interacting with any tweet:
  ```javascript
  // 1. Skip retweets / reposts
  const socialContext = art.querySelector('div[data-testid="socialContext"], span[data-testid="socialContext"]');
  const isRetweet = !!socialContext || !!art.querySelector('svg[data-testid="icon-retweet"]') || /reposted|retweeted/i.test(socialContext?.innerText || '');
  if (isRetweet) continue;

  // 2. Skip comments / replies
  const artText = (art.innerText || '');
  const hasReplyingText = /replying to/i.test(artText);
  const hasThreadConnector = !!art.querySelector('div[style*="width: 2px"], div[style*="width: 0.125rem"]');
  const hasReplyLink = Array.from(art.querySelectorAll('a, div')).some(el => /replying to/i.test(el.innerText || ''));
  if (hasReplyingText || hasThreadConnector || hasReplyLink) continue;
  ```

- **Fault Tolerance & Variable Hygiene:**
  - **No `ReferenceError: options is not defined`:** Function parameters are named `params = {}`. Any prompt or style extraction must access `params?.stylePrompt || params?.style || stylePrompt || style`.
  - **Individual Post Try-Catch:** Every call to `performActionsOnTweet` is wrapped in its own `try...catch` block. If an unexpected DOM mutation or network error occurs on post #1, the error is logged, `skippedCount++` is updated, and the loop seamlessly continues to post #2.

---

### Agent 2: Cold DM / Leads Agent
- **Primary Goal:** Reach out to qualified prospects with highly personalized direct messages.
- **Workflow:**
  1. **Audience Extraction:** Parses author handles from target list or high-intent posts.
  2. **DM Eligibility Check:** Navigates to user profile or opens DM button to verify open DMs.
  3. **AI Personalization:** Analyzes bio and recent posts to craft a unique opener.
  4. **Humanized Typing & Send:** Types the message with realistic cadence and submits.
  5. **Rate Limiting:** Enforces strict safety cooldowns (e.g. 60–180 seconds between DMs) to protect account standing.

---

### Agent 5: Auto Unfollow & Defaulter Clean-Up Engine (Non-Reciprocal Follower Audit)
- **Primary Goal:** Systematically audit the user's Following list (`https://x.com/{username}/following`), filter out non-reciprocal accounts (accounts that do not follow back or score below threshold), and cleanly unfollow them using humanized virtual cursor actions, safety batching, and full HUD telemetry.
- **Connection to Global Extensions & Safety Engine:**
  - **Global AI Voice Connection:** Linked to the user's selected global tone (`selectedTone` & `selectedTonePrompt`) and displays the active voice banner in `popup.html` (`#unfollowActiveToneLabel`).
  - **Global Safety Engine Integration:** Fully governed by `atomx_safety_settings` (Zero local UI duplicate inputs; all pacing delays, batching breaks, and rest durations are sourced directly from the central Safety Settings):
    - **Pacing Interval (`profileWait`):** Enforces 15–20s (randomized jitter $\pm 2$s) between unfollows with a real-time HUD countdown (`⏱️ Next target in Xs`).
    - **Batching & Rest Breaks:** Pauses execution after every user-defined batch (e.g., 15 unfollows) for a dedicated resting duration (`breakDuration` 60s) to prevent platform bot detection.
    - **Protected Whitelist:** Bypasses any handle contained in the whitelist input (`#unfollowWhitelistInput`).
    - **Verified Account Lock (`verifyTabAccountLock`):** Strict single-tab lock ensures it only operates when the active Twitter profile matches `verifiedXHandle`.
  - **Global Scroll Compliance:** All vertical navigations strictly use the **Global Scroll Architecture (`humanSmoothScroll`)**:
    - Multi-stage cubic ease-out physics with 14–18 micro-steps per flick.
    - Modal Scroll Guard (`!allowModalScroll` freezes window scroll while confirmation sheet dialog is open).
    - Post-scroll settlement pauses (400ms – 450ms) to allow Twitter's virtualized list to hydrate new DOM elements without glitching.
  - **Credit Economics:** 1 credit is automatically deducted per 10 successful unfollows.
- **Continuous Scan & Unfollow Execution Flow:**
  > [!IMPORTANT]
  > **No Premature Halting / Deadlock Bug Fix:**  
  > Previous implementations stopped or returned on the very first user who followed back, causing the script to repeatedly scroll down without ever unfollowing.  
  > In the overhauled engine, `executeAutoUnfollowStep` iterates continuously through all `div[data-testid="UserCell"]` nodes in the viewport. When an account follows back (`"Follows you"` badge detected) or is in the whitelist, it logs the account, marks it as evaluated in `autoUnfollowSessionProcessed`, and immediately `continue`s to inspect the subsequent cell.
- **Step-by-Step Execution Lifecycle:**
  1. **Tab Navigation:** Background service worker reuses `agentWorkflowWorkingTabId` and navigates directly to `https://x.com/{verifiedXHandle}/following`.
  2. **Candidate Inspection:**
     - Checks user cell for `[data-testid="userFollowIndicator"]` or span text containing `"Follows you"`.
     - Checks whitelist and session history.
     - Identifies non-reciprocal accounts matching the user's criteria (`notFollowing` or `lowScore`).
  3. **Centering & Bounding Box Settlement:**
     - Aligns candidate cell to viewport center via `scrollElementIntoViewAndEnsureVisible(cell, 'center')`.
     - Waits 350ms for virtualized hydration and layout stabilization.
  4. **Authentic Virtual Cursor Click:**
     - Locates Following button: `button[data-testid$="-unfollow"]` or button containing text "Following".
     - Moves `#atomx-virtual-cursor` over the button with a 400ms pre-click hover dwell.
     - Depresses the button with a distinct red ripple pulse (`#EF4444`).
     - Detects and clicks secondary popovers if Twitter presents a revealed "Unfollow @handle" button (Creator Subscribe accounts).
  5. **Confirmation Sheet Dialog Protocol:**
     - Waits for Twitter's confirmation sheet (`button[data-testid="confirmationSheetConfirm"]`).
     - Hovers and clicks the confirmation button with authentic human pointer events.
     - Waits 800ms for Twitter to acknowledge and detach or update the button state to "Follow".
  6. **HUD Telemetry & Storage Sync:**
     - Updates `atomx_active_hud` and `atomx_unfollow_counters` (`done`, `skipped`, `progressPercent`).
     - Re-evaluates batch break threshold and schedules safety pacing countdowns.
  7. **Virtualized Feed Hydration:**
     - Once all visible accounts in the current viewport are processed, performs a physics-based 750px scroll down to hydrate new accounts from Twitter's virtualized list.
     - Continues until `successCount >= targetCount` or list is completely exhausted.

### 5.7. Agent 16: TG Liker (Mass Raid & Repost Engager)
1. **Target Ingestion:**
   - Accepts profile URL / @username (`/reposts` page or main profile), tweet link (Quotes / Replies), or active X tab.
2. **Selective Execution:**
   - Multi-action checkboxes: ❤️ Auto-Like, 🔁 Auto-Repost, 🔖 Auto-Bookmark.
   - Pacing Speeds: Turbo (0ms instant) through Human Natural (1.5s - 6s).
3. **Anti-Ban Protection:**
   - Short breaks (every 25-40 posts, 45-120s) and Long breaks (every 100-150 posts, 5-10m).
4. **Session Continuation:**
   - Maintains `atomx_tgliker_seen` map across sessions. "Add More Posts" allows seamlessly continuing from where it ended without re-engaging already handled posts.

---

## 6. HUD (Heads-Up Display) Interaction Architecture

The floating HUD (`#atomx-floating-hud`) provides transparent visibility and user control:

| Button / State | Functionality | Architecture Behavior |
| :--- | :--- | :--- |
| **Pause (`⏸️`)** | Temporarily halts workflow | Loops in background checking `atomx_workflow_paused`. Freezes scrolling and clicking. |
| **Resume (`▶️`)** | Continues workflow | Releases the pause loop; resumes from the current active post. |
| **Skip (`⏭️`)** | Aborts current post | **Instantly unpauses**, erases any open draft comment, dismisses modal, tags post as skipped, scrolls down, and moves to next tweet. |
| **Stop (`⏹️`)** | Cancels entire workflow | Sets `isWorkflowAborted = true`, clears storage active flags, removes HUD smoothly. |

---

## 7. Storage Keys Reference

| Storage Key | Type | Description |
| :--- | :--- | :--- |
| `atomx_agent_workflow` | `Object` | Active workflow descriptor (agentId, targetCount, successCount, options). |
| `atomx_workflow_paused` | `Boolean` | Flag indicating if the current execution is paused. |
| `atomx_skip_current` | `Boolean` | Ephemeral flag signaling immediate skip of the active item. |
| `engagedTweetIds` | `Array<string>` | Master array of all engaged & skipped tweet IDs to prevent duplicate actions. |
| `atomx_follower_engaged_tweets` | `Object` | Map of `{ tweetId: timestamp }` specific to the Followers Increase engine. |
| `atomx_tgliker_seen` | `Object` | Map of `{ targetUrl: [tweetIds] }` preserving handled posts for TG Liker continuation. |
| `atomx_tgliker_last_stats` | `Object` | Last run telemetry (handled, liked, reposted, bookmarked, skipped). |
| `atomx_safety_settings` | `Object` | Min/max intervals, typing delays, and daily engagement ceilings. |

---
*Created and maintained for AtomX AI Agentic Suite.*
