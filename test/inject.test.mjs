// Runs the real extension/src/inject.js inside a vm sandbox with fake
// XMLHttpRequest / fetch / document, and checks what it forwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { homeTimeline2026, followersLegacy, restUser } from './fixtures.mjs';

const SRC = readFileSync(new URL('../extension/src/inject.js', import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 10));

function sandbox() {
  const sent = [];
  const listeners = {};
  const document = {
    dispatchEvent(e) {
      if (e.type === 'xfc:users') sent.push(JSON.parse(e.detail));
      for (const fn of listeners[e.type] || []) fn(e);
      return true;
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
  };
  class FakeXHR {
    constructor() {
      this.l = {};
      this.status = 0;
      this.responseType = '';
    }
    open() {}
    send() {}
    addEventListener(type, fn) {
      (this.l[type] ||= []).push(fn);
    }
    respond(status, body, responseType = '') {
      this.status = status;
      this.responseType = responseType;
      if (responseType === 'json') this.response = body;
      else this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
      for (const fn of this.l.load || []) fn.call(this);
    }
  }
  let nextFetch = null;
  const ctx = {
    document,
    XMLHttpRequest: FakeXHR,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    setTimeout,
    fetch: async () => nextFetch,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    sent,
    xhr(url) {
      const x = new ctx.XMLHttpRequest();
      x.open('GET', url);
      x.send();
      return x;
    },
    async fetch(url, body, init = {}) {
      nextFetch = new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { 'content-type': init.type || 'application/json; charset=utf-8' },
      });
      await ctx.window.fetch(url);
      await tick();
    },
    ready() {
      document.dispatchEvent(new ctx.CustomEvent('xfc:ready'));
    },
    reset() {
      document.dispatchEvent(new ctx.CustomEvent('xfc:reset'));
    },
  };
}

const byHandle = (batch) => Object.fromEntries(batch.map((r) => [r.h, [r.f, r.g]]));

test('2026 schema over XHR: relationship_counts + core.screen_name', async () => {
  const s = sandbox();
  s.xhr('https://x.com/i/api/graphql/V0wM/HomeTimeline?variables=%7B%7D').respond(200, homeTimeline2026());
  await tick();
  assert.equal(s.sent.length, 1);
  assert.deepEqual(byHandle(s.sent[0]), {
    alice_ai: [174123, 512],
    bob_builds: [11000, 90],
    carol_dev: [1574, 300],
    dan_quotes: [164000, 10], // quoted tweet author
  });
});

test('legacy schema with responseType=json', async () => {
  const s = sandbox();
  s.xhr('https://x.com/i/api/graphql/abc/BlueVerifiedFollowers').respond(200, followersLegacy(), 'json');
  await tick();
  assert.deepEqual(byHandle(s.sent[0]), { erin_cn: [35000, 800], frank_7: [7, 40], grace_lynne: [7806, 1200] });
});

test('REST shape over fetch', async () => {
  const s = sandbox();
  await s.fetch('https://api.x.com/1.1/users/show.json', restUser());
  assert.deepEqual(byHandle(s.sent[0]), { rest_user: [123456789, 5] });
});

test('ignores non-API URLs, errors, non-JSON and bad bodies', async () => {
  const s = sandbox();
  s.xhr('https://x.com/home').respond(200, homeTimeline2026());
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(429, homeTimeline2026());
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, '<html>nope</html>');
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, '{broken json');
  await s.fetch('https://x.com/i/api/graphql/a/HomeTimeline', homeTimeline2026(), { status: 500 });
  await s.fetch('https://x.com/i/api/graphql/a/HomeTimeline', homeTimeline2026(), { type: 'text/plain' });
  await tick();
  assert.equal(s.sent.length, 0);
});

test('rejects invalid handles and negative counts', async () => {
  const s = sandbox();
  s.xhr('https://x.com/i/api/graphql/a/X').respond(200, {
    a: { screen_name: 'has space', followers_count: 1 },
    b: { screen_name: 'way_too_long_handle_x', followers_count: 1 },
    c: { screen_name: 'neg', followers_count: -5 },
    d: { __typename: 'Tweet', core: { screen_name: 'tweety' }, relationship_counts: { followers: 1 } },
    e: { screen_name: 'ok_one', followers_count: 0 },
  });
  await tick();
  assert.deepEqual(byHandle(s.sent[0]), { ok_one: [0, null] });
});

test('sends only changes, and replays everything on ready', async () => {
  const s = sandbox();
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, homeTimeline2026());
  await tick();
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, homeTimeline2026());
  await tick();
  assert.equal(s.sent.length, 1, 'identical payload is not re-sent');

  const changed = homeTimeline2026();
  changed.data.home.home_timeline_urt.instructions[0].entries[0].content.itemContent.tweet_results.result.core.user_results.result.relationship_counts.followers = 174200;
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, changed);
  await tick();
  assert.equal(s.sent.length, 2);
  assert.deepEqual(byHandle(s.sent[1]), { alice_ai: [174200, 512] });

  s.ready();
  assert.equal(s.sent.length, 3);
  assert.equal(s.sent[2].length, 4);
});

test('reset makes previously sent users go out again', async () => {
  const s = sandbox();
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, homeTimeline2026());
  await tick();
  s.reset();
  s.ready();
  assert.equal(s.sent.length, 1, 'nothing left to replay after reset');
  s.xhr('https://x.com/i/api/graphql/a/HomeTimeline').respond(200, homeTimeline2026());
  await tick();
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[1].length, 4);
});
