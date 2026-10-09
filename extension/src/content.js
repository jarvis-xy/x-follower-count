// Isolated-world content script: keeps the follower cache, reads settings,
// and renders a "粉丝 17.4万" badge next to display names on x.com.
(() => {
  'use strict';

  const F = globalThis.XFCFormat;
  const EVT_USERS = 'xfc:users';
  const EVT_READY = 'xfc:ready';
  const EVT_RESET = 'xfc:reset';
  const CACHE_KEY = 'xfcCache';
  const MAX_ENTRIES = 10000;
  const DEFAULTS = { enabled: true, showInTweets: true, showInLists: true, lang: 'zh', tierColors: false };
  // Tweet headers (incl. quoted tweets) and user rows (followers, following, likes, who-to-follow, search).
  const CONTAINERS = '[data-testid="User-Name"], [data-testid="UserCell"]';
  const AT_HANDLE_RE = /^@([A-Za-z0-9_]{1,15})$/;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const BIDI_RE = /[‎‏‪-‮⁦-⁩]/g;

  const users = new Map(); // lowercased handle -> { h, f, g, t }
  const dirty = new Set();
  let settings = { ...DEFAULTS };

  const extOk = () => {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  };

  // ---------- data in ----------

  function onUsers(e) {
    let list;
    try {
      list = JSON.parse(e.detail);
    } catch (_) {
      return;
    }
    if (!Array.isArray(list)) return;
    const now = Date.now();
    let changed = false;
    for (const r of list) {
      if (!r || typeof r.h !== 'string' || !HANDLE_RE.test(r.h)) continue;
      if (!Number.isFinite(r.f) || r.f < 0) continue;
      const key = r.h.toLowerCase();
      const g = Number.isFinite(r.g) ? r.g : null;
      const prev = users.get(key);
      users.set(key, { h: r.h, f: r.f, g, t: now });
      dirty.add(key);
      if (!prev || prev.f !== r.f || prev.g !== g) changed = true;
    }
    schedulePersist();
    if (changed) scheduleRender();
  }

  document.addEventListener(EVT_USERS, onUsers);
  document.dispatchEvent(new CustomEvent(EVT_READY));

  // ---------- persistence ----------

  let persistTimer = 0;
  function schedulePersist() {
    if (!persistTimer) persistTimer = setTimeout(persist, 3000);
  }

  async function persist() {
    persistTimer = 0;
    if (!dirty.size || !extOk()) return;
    const keys = [...dirty];
    dirty.clear();
    try {
      // Re-read first so several open X tabs merge instead of overwriting each other.
      const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
      for (const k of keys) {
        const u = users.get(k);
        const old = stored[k];
        if (u && (!old || old[2] <= u.t)) stored[k] = [u.f, u.g, u.t, u.h];
      }
      const all = Object.keys(stored);
      if (all.length > MAX_ENTRIES) {
        all.sort((a, b) => stored[a][2] - stored[b][2]);
        for (let i = 0; i < all.length - MAX_ENTRIES; i++) delete stored[all[i]];
      }
      await chrome.storage.local.set({ [CACHE_KEY]: stored });
    } catch (_) {
      // extension reloaded or storage unavailable; the in-memory cache still works
    }
  }

  // Flush right away when the tab is hidden or closed instead of losing the
  // last few seconds of records to the debounce.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !dirty.size) return;
    clearTimeout(persistTimer);
    persist();
  });

  async function load() {
    try {
      const [s, c] = await Promise.all([
        chrome.storage.sync.get(DEFAULTS),
        chrome.storage.local.get(CACHE_KEY),
      ]);
      settings = { ...DEFAULTS, ...s };
      const stored = c[CACHE_KEY] || {};
      for (const k in stored) {
        const v = stored[k];
        if (users.has(k) || !Array.isArray(v) || !Number.isFinite(v[0])) continue;
        users.set(k, { f: v[0], g: v[1], t: v[2], h: v[3] || k });
      }
    } catch (_) {}
    scheduleRender();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        let touched = false;
        for (const k in DEFAULTS) {
          if (!changes[k]) continue;
          settings[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue;
          touched = true;
        }
        if (touched) scheduleRender();
      } else if (area === 'local' && changes[CACHE_KEY] && changes[CACHE_KEY].newValue === undefined) {
        // Cache cleared from the popup: forget everything, and let the page
        // script forget what it already sent so new responses repopulate.
        users.clear();
        dirty.clear();
        document.dispatchEvent(new CustomEvent(EVT_RESET));
        scheduleRender();
      }
    });
  } catch (_) {}

  // ---------- rendering ----------

  // Handle = first text node that reads exactly "@handle". Text nodes (not
  // link.textContent) keep this working when translation extensions inject
  // extra spans. A bio "@mention" always comes after the real handle.
  function findHandle(c) {
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      if (v.indexOf('@') === -1) continue;
      const m = AT_HANDLE_RE.exec(v.replace(BIDI_RE, '').trim());
      if (!m) continue;
      const parent = n.parentElement;
      if (!parent || parent.closest('.xfc-badge')) continue;
      const link = parent.closest('a[href]');
      if (link && c.contains(link)) {
        const href = (link.getAttribute('href') || '').toLowerCase();
        if (href !== '/' + m[1].toLowerCase()) continue;
      }
      return { key: m[1].toLowerCase(), node: n };
    }
    return null;
  }

  // Display name = first text block ([dir] is on every X text element) before
  // the handle, skipping the avatar.
  function findNameEl(c, handleNode) {
    for (const el of c.querySelectorAll('[dir]')) {
      if (el.contains(handleNode)) return null;
      if (!(el.compareDocumentPosition(handleNode) & Node.DOCUMENT_POSITION_FOLLOWING)) return null;
      if (el.closest('[data-testid^="UserAvatar-Container"]') || el.closest('.xfc-badge')) continue;
      if (!el.textContent.trim() && !el.querySelector('img')) continue;
      return el;
    }
    return null;
  }

  function isFlexRow(el) {
    const cs = getComputedStyle(el);
    return cs.display.includes('flex') && cs.flexDirection.startsWith('row');
  }

  // The name sits in a small flex row with the verified icon:
  //   row > [div[dir] name] [div[dir] ✓]
  // Appending there puts the badge right after the ✓ on the name line — in
  // tweet headers and in follower rows alike.
  function place(c, handleNode, badge) {
    const nameEl = findNameEl(c, handleNode);
    if (nameEl) {
      const row = nameEl.parentElement;
      if (row && c.contains(row) && isFlexRow(row)) row.appendChild(badge);
      else nameEl.after(badge);
      return;
    }
    const block = handleNode.parentElement.closest('[dir]') || handleNode.parentElement;
    block.after(badge);
  }

  function paint(badge, rec) {
    const tier = settings.tierColors ? F.tier(rec.f) : 0;
    const sig = rec.f + '|' + rec.g + '|' + settings.lang + '|' + tier;
    if (badge.dataset.xfcSig === sig) return;
    badge.dataset.xfcSig = sig;
    badge.textContent = F.label(rec.f, settings.lang);
    badge.className = tier ? 'xfc-badge xfc-tier-' + tier : 'xfc-badge';
    badge.title = F.tooltip(rec, settings.lang);
  }

  function makeBadge(key) {
    const badge = document.createElement('span');
    badge.className = 'xfc-badge';
    badge.dataset.xfcKey = key;
    // Refresh the "updated at" line in the tooltip on hover.
    badge.addEventListener('mouseenter', () => {
      const rec = users.get(badge.dataset.xfcKey);
      if (rec) badge.title = F.tooltip(rec, settings.lang);
    });
    return badge;
  }

  function wanted(c, isCell) {
    if (!settings.enabled) return false;
    if (isCell ? !settings.showInLists : !settings.showInTweets) return false;
    if (c.closest('[data-testid="HoverCard"]')) return false; // already shows counts
    if (isCell && c.querySelector('[data-testid="User-Name"]')) return false; // handled as tweet header
    return true;
  }

  function processContainer(c) {
    const isCell = c.getAttribute('data-testid') === 'UserCell';
    let badge = c.querySelector('.xfc-badge');
    const found = wanted(c, isCell) ? findHandle(c) : null;
    const rec = found && users.get(found.key);
    if (!rec) {
      if (badge) badge.remove();
      return;
    }
    if (badge && badge.dataset.xfcKey !== found.key) {
      badge.remove();
      badge = null;
    }
    if (!badge) {
      badge = makeBadge(found.key);
      place(c, found.node, badge);
    }
    paint(badge, rec);
  }

  function syncTheme() {
    const body = document.body;
    if (!body) return;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(body).backgroundColor);
    if (!m) return;
    const lum = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255;
    const theme = lum < 0.5 ? 'dark' : 'light';
    const root = document.documentElement;
    if (root.dataset.xfcTheme !== theme) root.dataset.xfcTheme = theme;
  }

  let renderTimer = 0;
  function scheduleRender() {
    if (!renderTimer) renderTimer = setTimeout(render, 80);
  }

  function render() {
    renderTimer = 0;
    syncTheme();
    for (const c of document.querySelectorAll(CONTAINERS)) {
      try {
        processContainer(c);
      } catch (_) {
        // one odd container must not stop the rest
      }
    }
  }

  // Leftovers from a previous instance (e.g. after the extension was reloaded).
  for (const el of document.querySelectorAll('.xfc-badge')) el.remove();

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.addedNodes.length) {
        scheduleRender();
        return;
      }
    }
  }).observe(document, { childList: true, subtree: true }); // documentElement may not exist yet at document_start

  load();
})();
