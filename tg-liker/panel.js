// TG LIKER side panel — shudhu settings likhe, Pause/Resume/Stop control kore, status dekhay.
// Asol kaj content.js e hoy (tai popup bondho korleo raid cholte thake).
(() => {
  'use strict';
  const K = { cfg: 'tgl_cfg', ctrl: 'tgl_ctrl', state: 'tgl_state', form: 'tgl_form', seen: 'tgl_seen' };
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ link parsing
  const RESERVED = new Set(['home', 'i', 'explore', 'search', 'notifications', 'messages', 'settings', 'compose',
    'intent', 'hashtag', 'login', 'signup', 'tos', 'privacy', 'jobs', 'share', 'account', 'lists',
    'communities', 'premium', 'grok', 'about']);

  function parseTargets(raw) {
    const out = [];
    const seen = new Set();
    const push = (t) => { if (!seen.has(t.key)) { seen.add(t.key); out.push(t); } };
    const text = String(raw || '');
    let m;

    // 1) tweet (status) link
    const reStatus = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/gi;
    while ((m = reStatus.exec(text)) !== null) {
      push({ kind: 'status', key: 's' + m[2], handle: m[1].toLowerCase() === 'i' ? null : m[1], id: m[2] });
    }

    // 2) profile link  (x.com/username  ba  x.com/username/reposts)
    const reProfile = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})((?:\/[^\s]*)?)/gi;
    while ((m = reProfile.exec(text)) !== null) {
      const handle = m[1];
      const rest = (m[2] || '').toLowerCase();
      if (RESERVED.has(handle.toLowerCase())) continue;
      if (rest.startsWith('/status')) continue;
      push({ kind: 'profile', key: 'p' + handle.toLowerCase(), handle });
    }

    // 3) plain @username
    const reAt = /(?:^|\s)@([A-Za-z0-9_]{1,15})(?=\s|$)/g;
    while ((m = reAt.exec(text)) !== null) {
      push({ kind: 'profile', key: 'p' + m[1].toLowerCase(), handle: m[1] });
    }
    return out;
  }

  function buildTarget(t, section) {
    let mode = section || 'auto';
    if (mode === 'auto') mode = t.kind === 'profile' ? 'profile_reposts' : 'quotes';

    const profile = (h) => mode === 'profile_all'
      ? { url: `https://x.com/${h}`, label: `@${h} profile` }
      : { url: `https://x.com/${h}/reposts`, label: `@${h} reposts` };

    if (t.kind === 'profile') return profile(t.handle);
    if (mode.startsWith('profile') && t.handle) return profile(t.handle);

    const base = `https://x.com/${t.handle || 'i'}/status/${t.id}`;
    if (mode === 'replies') return { url: base, label: 'Replies' };
    return { url: `${base}/quotes`, label: 'Quotes' };
  }

  // ------------------------------------------------------------ form save / load
  const FIELDS = ['links', 'section', 'speed', 'evMin', 'evMax', 'bsMin', 'bsMax', 'hourly', 'maxPosts', 'lbEvMin', 'lbEvMax', 'lbMinMin', 'lbMinMax'];
  const CHECKS = ['aLike', 'aRepost', 'aBookmark', 'loop', 'brkOn', 'lbOn'];

  async function loadForm() {
    const { [K.form]: f } = await chrome.storage.local.get(K.form);
    if (!f) return;
    FIELDS.forEach((id) => { if (f[id] != null) $(id).value = f[id]; });
    CHECKS.forEach((id) => { if (f[id] != null) $(id).checked = !!f[id]; });
  }

  function saveForm() {
    const f = {};
    FIELDS.forEach((id) => (f[id] = $(id).value));
    CHECKS.forEach((id) => (f[id] = $(id).checked));
    chrome.storage.local.set({ [K.form]: f });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ------------------------------------------------------------ UI state
  let ctrl = { state: 'stopped', runId: 0 };
  let st = {};
  let cfgSaved = null;

  function render() {
    const active = (ctrl.state === 'running' || ctrl.state === 'paused') && st.phase === 'running';
    const paused = active && ctrl.state === 'paused';

    $('btnStart').classList.toggle('hide', active);
    $('btnPause').classList.toggle('hide', !active || paused);
    $('btnResume').classList.toggle('hide', !paused);
    $('btnStop').classList.toggle('hide', !active);

    // job chalar shomoy settings lock
    FIELDS.concat(CHECKS).forEach((id) => { $(id).disabled = active; });

    const pill = $('pill');
    pill.className = 'pill';
    let label = 'Idle';
    if (active) {
      if (paused) { label = 'Paused'; pill.classList.add('pause'); }
      else if (st.onBreak) { label = 'On break'; pill.classList.add('brk'); }
      else { label = 'Running'; pill.classList.add('run'); }
    } else if (ctrl.state === 'stopped' && st.phase === 'running') {
      label = 'Stopped';
    } else if (st.phase === 'done') { label = 'Done'; }
    else if (st.phase === 'error') { label = 'Error'; pill.classList.add('err'); }
    else if (st.phase === 'stopped') { label = 'Stopped'; }
    pill.textContent = label;

    const s = st.stats || { liked: 0, reposted: 0, bookmarked: 0, skipped: 0 };
    $('sLiked').textContent = s.liked;
    $('sReposted').textContent = s.reposted;
    $('sBook').textContent = s.bookmarked;
    $('sSkip').textContent = s.skipped;

    let line = st.status || 'Ready.';
    if (active && st.round > 1) line = `Round ${st.round} • ` + line;
    if (!active && ctrl.state === 'stopped' && st.phase === 'running') line = '⏹ Stopped (tab open ache)';
    $('statusLine').textContent = line;

    // ---- boro break / wait timer ----
    const wb = $('waitBanner');
    const w = st.wait;
    if (active && w && typeof w.left === 'number') {
      const kind = w.kind === 'long' ? 'long' : (w.kind === 'hourly' ? 'hourly' : 'break');
      wb.className = 'wait ' + kind + (paused ? ' paused' : '');
      $('waitLabel').textContent = kind === 'long' ? '🛑 LONG BREAK' : (kind === 'hourly' ? '⏳ HOURLY LIMIT — WAITING' : '☕ BREAK');
      $('waitTime').textContent = fmtTime(w.left);
      const pct = w.total > 0 ? Math.min(100, Math.max(0, (1 - w.left / w.total) * 100)) : 0;
      $('waitBar').style.width = pct + '%';
      $('waitNote').textContent = paused ? '⏸ Paused — timer ruk ache' : 'Timer shesh hole nijei abar shuru hobe';
    } else {
      wb.className = 'wait hide';
    }

    // ---- porer break kokhon ----
    const ni = $('nextInfo');
    if (active && !w && cfgSaved) {
      const parts = [];
      if (cfgSaved.breaks && cfgSaved.breaks.enabled && st.breakAt) parts.push(`☕ Next break: ${Math.max(0, st.breakAt - (st.sinceBreak || 0))} post por`);
      if (cfgSaved.longBreak && cfgSaved.longBreak.enabled && st.longAt) parts.push(`🛑 Long break: ${Math.max(0, st.longAt - (st.sinceLong || 0))} post por`);
      ni.textContent = parts.join('  •  ');
      ni.classList.toggle('hide', parts.length === 0);
    } else {
      ni.classList.add('hide');
    }

    // ---- Add-on / Continue box ----
    const ended = !active && cfgSaved && (st.total || 0) > 0 &&
      (st.phase === 'done' || st.phase === 'stopped' || (ctrl.state === 'stopped' && st.phase === 'running'));
    $('contBox').classList.toggle('hide', !ended);
    if (ended) {
      const tg = cfgSaved.targets && cfgSaved.targets[st.targetIndex || 0];
      $('contInfo').textContent = `Last: ${st.total} post • ${s.liked} like, ${s.skipped} skip${tg ? ' • ' + tg.label : ''}`;
      const n = parseInt($('contN').value, 10) || 0;
      $('contNew').textContent = n > 0 ? `Limit: ${st.total} ➔ ${st.total + n}` : '';
      document.querySelectorAll('#presets .pre').forEach((b) => b.classList.toggle('on', parseInt(b.dataset.n, 10) === n));
    }
  }

  async function refresh() {
    const d = await chrome.storage.local.get([K.ctrl, K.state, K.cfg]);
    ctrl = d[K.ctrl] || { state: 'stopped', runId: 0 };
    st = d[K.state] || {};
    cfgSaved = d[K.cfg] || null;
    render();
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch[K.ctrl]) ctrl = ch[K.ctrl].newValue || { state: 'stopped', runId: 0 };
    if (ch[K.state]) st = ch[K.state].newValue || {};
    if (ch[K.cfg]) cfgSaved = ch[K.cfg].newValue || null;
    render();
  });

  // ------------------------------------------------------------ actions
  function num(id, fallback, min = 0) {
    const v = parseInt($(id).value, 10);
    return Number.isFinite(v) ? Math.max(min, v) : fallback;
  }

  async function start() {
    const actions = { like: $('aLike').checked, repost: $('aRepost').checked, bookmark: $('aBookmark').checked };
    if (!actions.like && !actions.repost && !actions.bookmark) {
      $('statusLine').textContent = '⚠ Kom pokkhe ekta action (Like / Repost / Bookmark) select koro.';
      return;
    }

    // current tab
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = tabs && tabs[0];
    const isX = !!(activeTab && /^https:\/\/(x|twitter)\.com\//i.test(activeTab.url || ''));

    // targets: textarea, na thakle current X tab er link
    let parsed = parseTargets($('links').value);
    if (!parsed.length && isX) parsed = parseTargets(activeTab.url);
    if (!parsed.length) {
      $('statusLine').textContent = '⚠ Profile link (x.com/username) ba tweet link paste koro, ba X tab khule rakho.';
      return;
    }
    const section = $('section').value;
    const targets = parsed.map((t) => buildTarget(t, section));

    let evMin = num('evMin', 25, 1), evMax = num('evMax', 40, 1);
    if (evMax < evMin) [evMin, evMax] = [evMax, evMin];
    let bsMin = num('bsMin', 45, 1), bsMax = num('bsMax', 120, 1);
    if (bsMax < bsMin) [bsMin, bsMax] = [bsMax, bsMin];

    let lbEvMin = num('lbEvMin', 100, 1), lbEvMax = num('lbEvMax', 150, 1);
    if (lbEvMax < lbEvMin) [lbEvMin, lbEvMax] = [lbEvMax, lbEvMin];
    let lbMinMin = num('lbMinMin', 5, 1), lbMinMax = num('lbMinMax', 10, 1);
    if (lbMinMax < lbMinMin) [lbMinMin, lbMinMax] = [lbMinMax, lbMinMin];

    const cfg = {
      tabId: null,
      targets,
      actions,
      speedMs: parseInt($('speed').value, 10) || 0,
      loop: $('loop').checked,
      breaks: { enabled: $('brkOn').checked, everyMin: evMin, everyMax: evMax, secMin: bsMin, secMax: bsMax },
      longBreak: { enabled: $('lbOn').checked, everyMin: lbEvMin, everyMax: lbEvMax, minMin: lbMinMin, minMax: lbMinMax },
      hourlyMax: num('hourly', 0, 0),
      maxPosts: num('maxPosts', 0, 0)
    };

    // tab thik koro: X tab hole ota, na hole notun tab
    let tabId;
    let newTab = false;
    if (isX) {
      tabId = activeTab.id;
    } else {
      const t = await chrome.tabs.create({ url: 'about:blank', active: true });
      tabId = t.id;
      newTab = true;
    }
    cfg.tabId = tabId;

    const runId = Date.now();
    const first = cfg.breaks.enabled ? evMin + Math.floor(Math.random() * (evMax - evMin + 1)) : 0;
    const firstLong = cfg.longBreak.enabled ? lbEvMin + Math.floor(Math.random() * (lbEvMax - lbEvMin + 1)) : 0;

    // storage AGE, navigation PORE (content script load holei config pabe)
    await chrome.storage.local.set({
      [K.cfg]: cfg,
      [K.ctrl]: { state: 'running', runId },
      [K.seen]: {},    // notun Start = notun kore shuru (ager "seen" post bhule jao)
      [K.state]: {
        phase: 'running', targetIndex: 0, round: 1, total: 0, onBreak: false, wait: null,
        sinceBreak: 0, breakAt: first, sinceLong: 0, longAt: firstLong,
        stats: { liked: 0, reposted: 0, bookmarked: 0, skipped: 0 },
        status: 'Starting...'
      }
    });
    saveForm();

    await chrome.tabs.update(tabId, { url: targets[0].url, active: true });
    if (newTab) { /* about:blank theke navigate hoyeche */ }
  }

  // ➕ Add-on: ager shesh jayga theke aro N ta post
  async function continueRun() {
    const n = parseInt($('contN').value, 10) || 0;
    if (n < 1) { $('statusLine').textContent = '⚠ Koyta post aro chao seta likho (jemon 20).'; return; }
    const d = await chrome.storage.local.get([K.cfg, K.state]);
    const cfg = d[K.cfg];
    const S = d[K.state] || {};
    if (!cfg || !cfg.targets || !cfg.targets.length) return;

    // ager tab ekhono ache kina
    let tabId = cfg.tabId;
    let ok = false;
    try { ok = !!(tabId != null && (await chrome.tabs.get(tabId))); } catch (e) { ok = false; }
    if (!ok) { const t = await chrome.tabs.create({ url: 'about:blank', active: true }); tabId = t.id; }
    cfg.tabId = tabId;
    cfg.maxPosts = (S.total || 0) + n;          // 100 shesh hole +20 = 120

    const idx = S.targetIndex || 0;
    await chrome.storage.local.set({
      [K.cfg]: cfg,
      [K.ctrl]: { state: 'running', runId: Date.now() },
      [K.state]: { ...S, phase: 'running', onBreak: false, wait: null, status: `Continuing... (+${n} post)` }
    });
    await chrome.tabs.update(tabId, { url: cfg.targets[idx].url, active: true });
  }

  async function setCtrl(state) {
    const d = await chrome.storage.local.get(K.ctrl);
    const c = d[K.ctrl] || { runId: 0 };
    await chrome.storage.local.set({ [K.ctrl]: { ...c, state } });
  }

  $('btnStart').addEventListener('click', start);
  $('btnPause').addEventListener('click', () => setCtrl('paused'));
  $('btnResume').addEventListener('click', () => setCtrl('running'));
  $('btnStop').addEventListener('click', () => setCtrl('stopped'));
  $('btnContinue').addEventListener('click', continueRun);
  document.querySelectorAll('#presets .pre').forEach((b) => b.addEventListener('click', () => { $('contN').value = b.dataset.n; render(); }));
  $('contN').addEventListener('input', render);

  FIELDS.concat(CHECKS).forEach((id) => {
    $(id).addEventListener('change', saveForm);
    $(id).addEventListener('input', saveForm);
  });

  (async () => { await loadForm(); await refresh(); })();
})();
