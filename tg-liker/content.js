// =====================================================================
// TG LIKER — content script (X / Twitter page er vitore cholo)
// Kono server / login / credit nai. Shob kichu local browser e.
//
// Storage keys:
//   tgl_cfg   -> popup likhe (settings + targets)         [content shudhu pore]
//   tgl_ctrl  -> popup likhe (running / paused / stopped) [content shudhu pore]
//   tgl_state -> content likhe (stats, status, progress)   [popup shudhu pore]
//   tgl_hourlog -> content likhe (hourly limit er jonno timestamps)
// =====================================================================
(() => {
  'use strict';
  if (window.__TGL_LOADED__) return;
  window.__TGL_LOADED__ = true;

  const K = { cfg: 'tgl_cfg', ctrl: 'tgl_ctrl', state: 'tgl_state', hour: 'tgl_hourlog', seen: 'tgl_seen' };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let ctrl = { state: 'stopped', runId: 0 };
  let S = {};            // content-written state
  let hourLog = [];      // last 1 hour er action timestamps
  let myRun = null;
  let seenMap = {};      // { [targetUrl]: [post ids jegulo already handle hoyeche] } — Continue er jonno "jekhane shesh" mone rakhe
  let seenCtx = null;    // ei page er seen list
  let dead = false;
  let busy = false;

  const extAlive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[K.ctrl]) {
      ctrl = changes[K.ctrl].newValue || { state: 'stopped', runId: 0 };
    }
  });

  // ---------------------------------------------------------------- state / status
  let lastStatus = '';
  let lastStatusAt = 0;

  async function save(patch) {
    if (!extAlive()) { dead = true; return; }
    Object.assign(S, patch);
    try { await chrome.storage.local.set({ [K.state]: S }); } catch (e) { dead = true; }
  }

  function status(text, force) {
    const now = Date.now();
    if (!force && (text === lastStatus || now - lastStatusAt < 200)) return;
    lastStatus = text;
    lastStatusAt = now;
    save({ status: text });
  }

  async function saveHour() {
    if (!extAlive()) return;
    try { await chrome.storage.local.set({ [K.hour]: hourLog }); } catch (e) {}
  }

  async function flushSeen() {
    if (!seenCtx || !extAlive()) return;
    seenMap[seenCtx.url] = seenCtx.list.slice(-4000);
    try { await chrome.storage.local.set({ [K.seen]: seenMap }); } catch (e) {}
  }

  function markSeen(id) {
    if (!seenCtx) return;
    seenCtx.list.push(id);
    if (seenCtx.list.length % 5 === 0) flushSeen();
  }

  // Pause / Stop gate: paused hole ekhane thake, stopped hole false return kore
  async function gate() {
    while (true) {
      if (dead || !extAlive()) return false;
      if (ctrl.runId !== myRun || ctrl.state === 'stopped') return false;
      if (ctrl.state === 'paused') {
        status('⏸ Paused');
        await sleep(250);
        continue;
      }
      return true;
    }
  }

  async function waitUntil(fn, maxMs, step = 50) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (dead || ctrl.state === 'stopped' || ctrl.runId !== myRun) return false;
      try { if (fn()) return true; } catch (e) {}
      await sleep(step);
    }
    try { return !!fn(); } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- DOM helpers
  const isLiked = (a) => !!a.querySelector('[data-testid="unlike"]');

  function articleId(a) {
    const timeLink = a.querySelector('a[href*="/status/"] time');
    const link = (timeLink && timeLink.closest('a')) || a.querySelector('a[href*="/status/"]');
    const href = (link && link.getAttribute('href')) || '';
    const m = href.match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  }

  const articlesNow = () =>
    Array.from((document.querySelector('div[data-testid="primaryColumn"]') || document)
      .querySelectorAll('article[data-testid="tweet"]'));

  async function clickShowMore() {
    const btn = Array.from(document.querySelectorAll('div[role="button"], button')).find((b) => {
      const t = (b.textContent || '').trim();
      return t.length < 90 && /show (more|additional) replies|show probable spam/i.test(t);
    });
    if (btn) { try { btn.click(); } catch (e) {} await sleep(1000); }
  }

  const nextFrame = () => new Promise((res) => {
    let fired = false;
    const f = () => { if (!fired) { fired = true; res(); } };
    requestAnimationFrame(f);
    setTimeout(f, 50);   // background tab e rAF thame jay, tai fallback
  });

  // ---------------------------------------------------------------- virtual mouse cursor
  let cursorEl = null;
  let cur = { x: 0, y: 0 };

  function placeCursor(x, y) {
    cur = { x, y };
    if (cursorEl) cursorEl.style.transform = `translate3d(${Math.round(x - 3)}px, ${Math.round(y - 2)}px, 0)`;
  }

  function ensureCursor() {
    if (cursorEl && cursorEl.isConnected) return;
    cursorEl = document.createElement('div');
    cursorEl.id = 'tgl-cursor';
    cursorEl.style.cssText =
      'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;' +
      'will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));';
    cursorEl.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" style="display:block;transform-origin:3px 2px">' +
      '<path d="M3 2v17l4.6-4.1 3 6.6 2.7-1.2-3-6.5H17z" fill="#fff" stroke="#0b0b0b" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursorEl);
    if (!cur.x && !cur.y) cur = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.55 };
    placeCursor(cur.x, cur.y);
  }

  function removeCursor() {
    if (cursorEl) cursorEl.remove();
    cursorEl = null;
  }

  // Curved path e cursor chalano (ease-in-out)
  async function moveCursor(tx, ty, ms) {
    ensureCursor();
    const sx = cur.x, sy = cur.y;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) { placeCursor(tx, ty); return; }
    const nx = -dy / dist, ny = dx / dist;
    const bend = (Math.random() - 0.5) * Math.min(80, dist * 0.3);
    const cx = sx + dx / 2 + nx * bend;
    const cy = sy + dy / 2 + ny * bend;
    const t0 = performance.now();
    while (true) {
      if (dead) return;
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const u = 1 - e;
      placeCursor(u * u * sx + 2 * u * e * cx + e * e * tx, u * u * sy + 2 * u * e * cy + e * e * ty);
      if (t >= 1) break;
      await nextFrame();
    }
  }

  function clickEffect(x, y, color) {
    const svg = cursorEl && cursorEl.firstElementChild;
    if (svg && svg.animate) {
      svg.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' });
    }
    const ring = document.createElement('div');
    ring.style.cssText =
      `position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;` +
      `border:2px solid ${color};background:${color}33;z-index:2147483646;pointer-events:none;`;
    document.documentElement.appendChild(ring);
    if (ring.animate) {
      const an = ring.animate([{ transform: 'scale(.3)', opacity: 0.95 }, { transform: 'scale(1.9)', opacity: 0 }],
        { duration: 480, easing: 'ease-out' });
      an.onfinish = () => ring.remove();
    } else {
      setTimeout(() => ring.remove(), 480);
    }
  }

  function dispatchClick(el, x, y) {
    const PE = window.PointerEvent || MouseEvent;
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0 };
    const p = { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PE('pointerover', p));
    el.dispatchEvent(new MouseEvent('mouseover', o));
    el.dispatchEvent(new PE('pointermove', p));
    el.dispatchEvent(new MouseEvent('mousemove', o));
    el.dispatchEvent(new PE('pointerdown', { ...p, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...o, buttons: 1 }));
    el.dispatchEvent(new PE('pointerup', p));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  // Cursor element er upore jabe, ektu thambe, tarpor click
  async function humanClick(el, color, delay) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) { el.click(); return; }
    const x = r.left + r.width * rand(0.3, 0.7);
    const y = r.top + r.height * rand(0.3, 0.7);
    const cursorMs = clamp(delay * 0.15, 220, 500);
    const dist = Math.hypot(x - cur.x, y - cur.y);
    await moveCursor(x, y, clamp(cursorMs + dist * 0.25, cursorMs, 650));
    await sleep(clamp(delay * 0.05, 70, 250));          // button er upor ektu thame
    clickEffect(x, y, color);
    await sleep(rand(60, 110));                          // press hold
    dispatchClick(el, x, y);
  }

  // ---------------------------------------------------------------- smooth scroll
  async function glideScroll(dy, ms) {
    if (Math.abs(dy) < 4) return;
    const t0 = performance.now();
    let last = 0;
    while (true) {
      if (dead || ctrl.state === 'stopped') return;
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
      const target = Math.round(dy * e);
      if (target !== last) { window.scrollBy({ top: target - last, behavior: 'instant' }); last = target; }
      if (t >= 1) break;
      await nextFrame();
    }
  }

  // ---------------------------------------------------------------- break
  // Break (short ba long). Timer state "wait" e likhe jate panel e boro kore dekhay
  async function takeBreak(cfg, long) {
    const b = long ? cfg.longBreak : cfg.breaks;
    const total = long ? rand(b.minMin * 60, b.minMax * 60) : rand(b.secMin, b.secMax);
    const kind = long ? 'long' : 'break';
    let left = total;
    let lastSave = 0;
    await save({ onBreak: true, wait: { kind, left: total, total } });
    while (left > 0) {
      if (!(await gate())) { await save({ onBreak: false, wait: null }); return false; }
      const now = Date.now();
      if (now - lastSave >= 1000) {
        lastSave = now;
        lastStatus = '';
        save({ status: `${long ? '🛑 Long break' : '☕ Break'} — ${fmt(Math.max(0, left))} baki`, wait: { kind, left: Math.max(0, left), total } });
      }
      await sleep(250);
      left -= 0.25;                  // pause thakle gate() ekhane atke thake, tai pause er shomoy count hoy na
    }
    const patch = {
      onBreak: false, wait: null,
      sinceBreak: 0, breakAt: randInt(cfg.breaks.everyMin, cfg.breaks.everyMax)
    };
    if (long) { patch.sinceLong = 0; patch.longAt = randInt(cfg.longBreak.everyMin, cfg.longBreak.everyMax); }
    await save(patch);
    return true;
  }

  // Hourly limit: ghontay max N ta post e kaj
  async function quotaGate(cfg) {
    if (!cfg.hourlyMax) return true;
    while (true) {
      const now = Date.now();
      hourLog = hourLog.filter((t) => now - t < 3600e3);
      if (hourLog.length < cfg.hourlyMax) { if (S.wait) await save({ wait: null }); return true; }
      const waitSec = Math.ceil((hourLog[0] + 3600e3 - now) / 1000);
      if (!(await gate())) { await save({ wait: null }); return false; }
      lastStatus = '';
      save({ status: `⏳ Hourly limit (${hourLog.length}/${cfg.hourlyMax}) — ${fmt(waitSec)} por abar shuru`,
             wait: { kind: 'hourly', left: waitSec, total: 3600 } });
      await sleep(1000);
    }
  }

  // ---------------------------------------------------------------- main raid (ekta page)
  async function raidPage(cfg, target) {
    try { return await raidPageInner(cfg, target); }
    finally { await flushSeen(); }
  }

  async function raidPageInner(cfg, target) {
    const delay = Number.isFinite(cfg.speedMs) ? cfg.speedMs : 2000;
    const instant = delay < 1000;       // Turbo: instant jump + direct click, cursor nai
    const human = !instant;             // baki: smooth scroll + mouse cursor
    const A = cfg.actions || { like: true };

    const SPEED = instant
      ? { settle: 30, likeMax: 900, menuMax: 2000, afterAction: 80, scrollWaitMax: 1200, pollStep: 40 }
      : { settle: 70, likeMax: 1500, menuMax: 2500, afterAction: 60, scrollWaitMax: 2000, pollStep: 60,
          scrollMsMin: 320, scrollMsMax: Math.min(800, Math.round(delay * 0.35)), likeAtViewportPct: 0.62 };

    const mainId = (location.pathname.match(/\/status\/(\d+)/) || [])[1] || null;
    // Ager run e jegulo handle hoyeche (Continue e) segulo silently skip hobe, count hobe na
    const seenList = Array.isArray(seenMap[target.url]) ? seenMap[target.url].slice() : [];
    seenCtx = { url: target.url, list: seenList };
    const done = new Set(seenList);
    const preSeen = seenList.length;
    const viewed = new Set();
    const doneNoId = new WeakSet();
    let emptyScrolls = 0;
    let failStreak = 0;

    const hasFresh = () => articlesNow().some((a) => {
      const id = articleId(a);
      return id ? (id !== mainId && !done.has(id)) : !doneNoId.has(a);
    });

    const nextArticle = () => {
      for (const a of articlesNow()) {
        const id = articleId(a);
        if (!id) { if (doneNoId.has(a)) continue; return { a, id: null }; }
        if (id === mainId || done.has(id)) continue;
        return { a, id };
      }
      return null;
    };

    // Ei post e kaj baki ache kina (already like/repost/bookmark kora hole scroll/click lagbe na)
    const needsWork = (a) =>
      (A.like && !isLiked(a)) ||
      (A.repost && !!a.querySelector('[data-testid="retweet"]')) ||
      (A.bookmark && !!a.querySelector('[data-testid="bookmark"]'));

    const glideToPost = async (a) => {
      const anchor = a.querySelector('[data-testid="like"], [data-testid="unlike"]') || a;
      const vh = window.innerHeight || 800;
      const dy = anchor.getBoundingClientRect().top - vh * SPEED.likeAtViewportPct;
      const ms = clamp(260 + Math.abs(dy) * 0.45, SPEED.scrollMsMin, SPEED.scrollMsMax) * rand(0.92, 1.08);
      ensureCursor();
      // scroll korar shomoy cursor o ektu ghure jay (manush er moto)
      await Promise.all([
        glideScroll(dy, ms),
        moveCursor(clamp(cur.x + rand(-140, 140), 40, window.innerWidth - 40),
                   clamp(cur.y + rand(-90, 90), 80, window.innerHeight - 40), Math.min(ms, 420))
      ]);
    };

    status('Loading posts...', true);
    const first = await waitUntil(() => document.querySelector('article[data-testid="tweet"]'), 15000, 200);
    if (!first) {
      if (ctrl.state === 'stopped') return { stopped: true };
      return { error: 'X page e kono post paoa jayni (login / page load check koro)' };
    }

    let handled = 0;

    while (true) {
      if (!(await gate())) return { stopped: true };

      const item = nextArticle();

      // notun post nai -> niche scroll
      if (!item) {
        // DOM e notun (ekhono na dekha) post ashle seta progress, "list shesh" na
        const idsNow = articlesNow().map(articleId).filter(Boolean);
        const newInDom = idsNow.some((x) => !viewed.has(x));
        idsNow.forEach((x) => viewed.add(x));
        if (newInDom) emptyScrolls = 0; else emptyScrolls++;
        if (emptyScrolls > (instant ? 7 : 6)) return { endReached: true };

        // Continue: ager jaygay pouchhanor jonno dhuto instant scroll (ager post gulo already kora)
        if (preSeen > 0 && handled === 0) {
          status(`⏩ Ager jaygay jachhe... ${done.size} post paar hoyeche`);
          window.scrollBy({ top: Math.round(window.innerHeight * 1.6), behavior: 'instant' });
          await waitUntil(() => hasFresh() || articlesNow().some((x) => { const i = articleId(x); return i && !viewed.has(i); }), 1200, 60);
          continue;
        }

        status(`Scrolling... ${done.size} post dekha, ${handled} te kaj`);
        if (emptyScrolls >= 2) await clickShowMore();
        if (human) await glideScroll(Math.round(window.innerHeight * 0.85), 650);
        else window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: 'instant' });
        await waitUntil(hasFresh, SPEED.scrollWaitMax, SPEED.pollStep);
        continue;
      }
      emptyScrolls = 0;

      const { a, id } = item;
      if (!id) { doneNoId.add(a); continue; }   // Ad / promoted skip
      done.add(id);

      // Shob kaj already kora -> scroll/click chhara skip
      if (!needsWork(a)) {
        S.stats.skipped++;
        handled++;
        markSeen(id);
        S.total = (S.total || 0) + 1;
        if (cfg.maxPosts && S.total >= cfg.maxPosts) {
          await save({ stats: S.stats, total: S.total });
          return { limitReached: true };
        }
        if (S.stats.skipped % 10 === 0) await save({ stats: S.stats, total: S.total });   // storage e beshi write na
        status(`${instant ? '⚡ Turbo' : '🖱️ Running'} — ${S.total}${cfg.maxPosts ? '/' + cfg.maxPosts : ''} posts`);
        continue;
      }

      if (!(await quotaGate(cfg))) return { stopped: true };

      const postStart = Date.now();
      const ev = { liked: false, reposted: false, bookmarked: false };
      let attempted = false;
      let failed = false;

      // ---- scroll ----
      if (human) await glideToPost(a);
      else a.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(SPEED.settle);
      if (!(await gate())) return { stopped: true };

      // ---- 1) LIKE ----
      if (A.like && !isLiked(a)) {
        attempted = true;
        const lb = a.querySelector('[data-testid="like"]');
        if (lb) {
          if (human) await humanClick(lb, '#F43F5E', delay); else lb.click();
        }
        let ok = await waitUntil(() => isLiked(a), SPEED.likeMax);
        if (!ok && lb && ctrl.state !== 'stopped') {      // cursor click kaj na korle ekbar direct click
          try { lb.click(); } catch (e) {}
          ok = await waitUntil(() => isLiked(a), 700);
        }
        if (isLiked(a)) ev.liked = true; else failed = true;
      }

      // ---- 2) REPOST ----
      if (A.repost && (await gate())) {
        const rt = a.querySelector('[data-testid="retweet"]');     // already hole 'unretweet' thake
        if (rt) {
          attempted = true;
          if (human) await humanClick(rt, '#10B981', delay); else rt.click();
          await waitUntil(() => document.querySelector('[data-testid="retweetConfirm"]'), SPEED.menuMax);
          const confirmItem = document.querySelector('[data-testid="retweetConfirm"]');
          if (confirmItem) {
            if (human) {
              await humanClick(confirmItem, '#10B981', delay);
              if (document.querySelector('[data-testid="retweetConfirm"]')) { try { confirmItem.click(); } catch (e) {} }
            } else {
              confirmItem.click();
            }
            const ok = await waitUntil(() => a.querySelector('[data-testid="unretweet"]'), SPEED.likeMax);
            if (ok) ev.reposted = true; else failed = true;
            await sleep(SPEED.afterAction);
          } else {
            failed = true;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await sleep(150);
          }
        }
      }

      // ---- 3) BOOKMARK ----
      if (A.bookmark && (await gate())) {
        const bm = a.querySelector('[data-testid="bookmark"]');    // already hole 'removeBookmark' thake
        if (bm) {
          attempted = true;
          if (human) await humanClick(bm, '#3B82F6', delay); else bm.click();
          let ok = await waitUntil(() => a.querySelector('[data-testid="removeBookmark"]'), SPEED.likeMax);
          if (!ok && ctrl.state !== 'stopped') {
            try { bm.click(); } catch (e) {}
            ok = await waitUntil(() => a.querySelector('[data-testid="removeBookmark"]'), 700);
          }
          if (ok) ev.bookmarked = true; else failed = true;
        }
      }

      const acted = ev.liked || ev.reposted || ev.bookmarked;
      handled++;
      markSeen(id);
      if (ev.liked) S.stats.liked++;
      if (ev.reposted) S.stats.reposted++;
      if (ev.bookmarked) S.stats.bookmarked++;
      if (!acted) S.stats.skipped++;

      failStreak = (attempted && failed && !acted) ? failStreak + 1 : 0;

      if (acted) {
        hourLog.push(Date.now());
        S.sinceBreak = (S.sinceBreak || 0) + 1;
        S.sinceLong = (S.sinceLong || 0) + 1;
        saveHour();
      }
      S.total = (S.total || 0) + 1;
      await save({ stats: S.stats, sinceBreak: S.sinceBreak, sinceLong: S.sinceLong, total: S.total });
      status(`${instant ? '⚡ Turbo' : '🖱️ Running'} — ${S.total}${cfg.maxPosts ? '/' + cfg.maxPosts : ''} posts`);

      // Max posts: N ta post dekha (like + skip mile) hoye gele nijei stop
      if (cfg.maxPosts && S.total >= cfg.maxPosts) return { limitReached: true };

      // 3 ta post e porpor fail -> X rate limit / block hote pare, thamo
      if (failStreak >= 3) {
        return { error: 'Porpor 3 ta post e action fail holo (X rate limit hote pare). Kichhukkhon por abar try koro.' };
      }

      // ---- Break system ----
      if (acted) {
        const longDue = cfg.longBreak && cfg.longBreak.enabled && S.sinceLong >= S.longAt;
        const shortDue = cfg.breaks && cfg.breaks.enabled && S.sinceBreak >= S.breakAt;
        if (longDue) { if (!(await takeBreak(cfg, true))) return { stopped: true }; }
        else if (shortDue) { if (!(await takeBreak(cfg, false))) return { stopped: true }; }
      }

      // Post proti total time = select kora delay
      if (human && acted) {
        const remain = delay * rand(0.92, 1.08) - (Date.now() - postStart);
        if (remain > 0) await sleep(remain);
      }
    }
  }

  // ---------------------------------------------------------------- target navigation / loop
  const normPath = (p) => p.replace(/\/+$/, '').toLowerCase();

  async function waitActive(seconds, label) {
    let left = seconds;
    while (left > 0) {
      if (!(await gate())) return false;
      status(`${label} — ${Math.ceil(left)}s`);
      await sleep(250);
      left -= 0.25;
    }
    return true;
  }

  async function runJob(cfg) {
    const idx = S.targetIndex || 0;
    const target = cfg.targets[idx];
    if (!target) return;

    myRun = ctrl.runId;
    const res = await raidPage(cfg, target);
    removeCursorLater();

    if (res.limitReached) {
      const s = S.stats || {};
      await save({
        phase: 'done',
        status: `✓ Target complete: ${S.total} post (${s.liked || 0} like, ${s.reposted || 0} repost, ${s.bookmarked || 0} bookmark, ${s.skipped || 0} skip). Tab open ache.`
      });
      return;
    }
    if (res.stopped) { await save({ phase: 'stopped', status: '⏹ Stopped (tab open ache)' }, true); return; }
    if (res.error) { await save({ phase: 'error', status: '⚠ ' + res.error }); return; }

    // page er shesh -> porer target
    if (idx + 1 < cfg.targets.length) {
      await save({ targetIndex: idx + 1, status: 'Porer target e jachhe...' });
      await sleep(500);
      location.href = cfg.targets[idx + 1].url;
      return;
    }

    if (cfg.loop) {
      const wait = cfg.speedMs < 3000 ? 20 : 60;
      const ok = await waitActive(wait, '✓ Pass complete — refresh hobe');
      if (!ok) { await save({ phase: 'stopped', status: '⏹ Stopped (tab open ache)' }); return; }
      await save({ targetIndex: 0, round: (S.round || 1) + 1, status: 'Refresh...' });
      location.href = cfg.targets[0].url;
      return;
    }

    await save({ phase: 'done', status: '✓ Complete (tab open ache)' });
  }

  function removeCursorLater() { setTimeout(removeCursor, 1500); }

  // ---------------------------------------------------------------- init
  async function init() {
    if (!extAlive() || busy) return;
    busy = true;
    try {
      const data = await chrome.storage.local.get([K.cfg, K.ctrl, K.state, K.hour, K.seen]);
      const cfg = data[K.cfg];
      ctrl = data[K.ctrl] || { state: 'stopped', runId: 0 };
      S = data[K.state] || {};
      hourLog = Array.isArray(data[K.hour]) ? data[K.hour] : [];
      seenMap = data[K.seen] && typeof data[K.seen] === 'object' ? data[K.seen] : {};

      if (!cfg || !(ctrl.state === 'running' || ctrl.state === 'paused') || S.phase !== 'running') return;

      const me = await chrome.runtime.sendMessage({ type: 'whoami' });
      if (!me || me.tabId !== cfg.tabId) return;

      const target = cfg.targets[S.targetIndex || 0];
      if (!target) return;

      let want = '';
      try { want = normPath(new URL(target.url).pathname); } catch (e) {}
      if (want && normPath(location.pathname) !== want) {
        await save({ status: '⚠ Tab ta target page e nai. Start abar dao.' });
        return;
      }

      S.stats = S.stats || { liked: 0, reposted: 0, bookmarked: 0, skipped: 0 };
      if (S.breakAt == null && cfg.breaks) S.breakAt = randInt(cfg.breaks.everyMin, cfg.breaks.everyMax);
      if (S.sinceBreak == null) S.sinceBreak = 0;
      if (S.longAt == null && cfg.longBreak) S.longAt = randInt(cfg.longBreak.everyMin, cfg.longBreak.everyMax);
      if (S.sinceLong == null) S.sinceLong = 0;

      await runJob(cfg);
    } catch (e) {
      // extension reload hole purano script chup kore thamo
    } finally {
      busy = false;
    }
  }

  init();
})();
