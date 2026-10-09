// Runs in the page's MAIN world at document_start, before X's own scripts.
// It only *reads* responses X already requested (XHR + fetch) and forwards
// {handle, followers, following} records to the isolated content script.
// It never issues a request of its own.
(() => {
  'use strict';

  const FLAG = Symbol.for('xfc.inject');
  if (window[FLAG]) return;
  window[FLAG] = true;

  const EVT_USERS = 'xfc:users';
  const EVT_READY = 'xfc:ready';
  const EVT_RESET = 'xfc:reset';
  const API_RE = /\/i\/api\/|\/graphql\/|\/\/api\.(?:x|twitter)\.com\//;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const MAX_NODES = 300000; // visit cap per payload, guards against pathological responses

  const known = new Map(); // lowercased handle -> last record sent

  // X has shipped three user shapes over time; accept all of them.
  //   2026 GraphQL: { core: { screen_name }, relationship_counts: { followers, following } }
  //   older GraphQL: { core?: { screen_name }, legacy: { screen_name?, followers_count, friends_count } }
  //   REST v1.1:     { screen_name, followers_count, friends_count }
  function toRecord(o) {
    if (o.__typename !== undefined && o.__typename !== 'User') return null;
    const core = o.core;
    const legacy = o.legacy;
    const rc = o.relationship_counts;
    let handle, followers, following;
    if (rc && typeof rc.followers === 'number') {
      followers = rc.followers;
      following = rc.following;
      handle = (core && core.screen_name) || (legacy && legacy.screen_name);
    } else if (legacy && typeof legacy.followers_count === 'number') {
      followers = legacy.followers_count;
      following = legacy.friends_count;
      handle = (core && core.screen_name) || legacy.screen_name;
    } else if (typeof o.followers_count === 'number') {
      followers = o.followers_count;
      following = o.friends_count;
      handle = o.screen_name;
    } else {
      return null;
    }
    if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return null;
    if (!Number.isFinite(followers) || followers < 0) return null;
    return { h: handle, f: followers, g: Number.isFinite(following) ? following : null };
  }

  function extract(root) {
    const out = [];
    const stack = [root];
    let budget = MAX_NODES;
    while (stack.length && budget-- > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          const v = node[i];
          if (v && typeof v === 'object') stack.push(v);
        }
        continue;
      }
      const rec = toRecord(node);
      if (rec) out.push(rec);
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return out;
  }

  function send(list) {
    document.dispatchEvent(new CustomEvent(EVT_USERS, { detail: JSON.stringify(list) }));
  }

  function ingest(data) {
    const fresh = [];
    for (const r of extract(data)) {
      const key = r.h.toLowerCase();
      const prev = known.get(key);
      if (prev && prev.f === r.f && prev.g === r.g && prev.h === r.h) continue;
      known.set(key, r);
      fresh.push(r);
    }
    if (fresh.length) send(fresh);
  }

  // Parse after X's own handlers have run so we never delay its rendering.
  function ingestLater(getData) {
    setTimeout(() => {
      try {
        const data = getData();
        if (data && typeof data === 'object') ingest(data);
      } catch (_) {
        // not JSON / unexpected shape — ignore
      }
    }, 0);
  }

  // The isolated script may load before or after us; when it announces itself,
  // replay everything captured so far.
  document.addEventListener(EVT_READY, () => {
    if (known.size) send([...known.values()]);
  });
  // Records were cleared from the popup: forget them so new responses resend.
  document.addEventListener(EVT_RESET, () => known.clear());

  // ---- XMLHttpRequest ----
  const xhrUrls = new WeakMap();
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  function onXhrLoad() {
    const xhr = this;
    if (xhr.status < 200 || xhr.status >= 300) return;
    const type = xhr.responseType;
    if (type === 'json') {
      const data = xhr.response;
      ingestLater(() => data);
    } else if (type === '' || type === 'text') {
      const text = xhr.responseText;
      if (text && (text[0] === '{' || text[0] === '[')) ingestLater(() => JSON.parse(text));
    }
  }

  XHR.open = function (method, url) {
    try {
      xhrUrls.set(this, String(url));
    } catch (_) {}
    return origOpen.apply(this, arguments);
  };

  XHR.send = function () {
    const url = xhrUrls.get(this);
    if (url && API_RE.test(url)) this.addEventListener('load', onXhrLoad);
    return origSend.apply(this, arguments);
  };

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input) {
      const promise = origFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input);
        if (API_RE.test(url)) {
          promise.then((res) => {
            if (!res.ok) return;
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('json')) return;
            res.clone().json().then((data) => ingestLater(() => data), () => {});
          }, () => {});
        }
      } catch (_) {}
      return promise;
    };
  }
})();
