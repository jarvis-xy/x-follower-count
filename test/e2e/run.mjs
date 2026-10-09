// End-to-end: load the real unpacked extension into Chromium, serve a mock
// x.com (page + GraphQL responses) through request routing, and check the
// badges, the popup settings, and the persisted cache.
//
//   npm run test:e2e            (headless)
//   HEADED=1 npm run test:e2e   (watch it)
//   CHROME_PATH=/path/to/chromium npm run test:e2e
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeTimeline2026, followersLegacy } from '../fixtures.mjs';
import { ROOT, extensionId, launchWithExtension } from '../../scripts/lib/chromium.mjs';

const OUT = join(ROOT, 'test', 'e2e', 'out');
const MOCK = readFileSync(new URL('./mock-x.html', import.meta.url), 'utf8');

let apiMode = 'normal'; // 'nocounts': tweets/users arrive without follower counts

// Same payload with every follower count removed, so the page still renders
// authors but only the extension's persisted cache can supply the numbers.
function stripCounts(o) {
  if (Array.isArray(o)) return o.map(stripCounts);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'relationship_counts' || k === 'followers_count') continue;
    out[k] = stripCounts(v);
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await launchWithExtension({ viewport: { width: 760, height: 1000 } });

  await ctx.route('https://x.com/**', (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const maybeStrip = (body) => (apiMode === 'nocounts' ? stripCounts(body) : body);
    if (url.pathname.endsWith('/HomeTimeline')) return json(maybeStrip(homeTimeline2026()));
    if (url.pathname.endsWith('/BlueVerifiedFollowers')) return json(maybeStrip(followersLegacy()));
    return route.fulfill({ status: 200, contentType: 'text/html', body: MOCK });
  });

  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push(['PASS', name]);
    } catch (e) {
      results.push(['FAIL', name, e.message.split('\n')[0]]);
    }
  };

  const page = await ctx.newPage();
  await page.goto('https://x.com/home');
  await page.waitForFunction(() => window.__timelineReady && window.__followersReady);
  await page.waitForFunction(() => document.querySelectorAll('.xfc-badge').length >= 7, null, { timeout: 5000 }).catch(() => {});

  const badges = () => page.evaluate(() => {
    const out = {};
    for (const c of document.querySelectorAll('[data-testid="User-Name"], [data-testid="UserCell"]')) {
      const h = [...c.querySelectorAll('span')].map((s) => s.firstChild && s.firstChild.nodeValue).find((t) => t && /^@\w+$/.test(t));
      const b = c.querySelectorAll('.xfc-badge');
      out[h.slice(1)] = b.length === 0 ? null : b.length > 1 ? 'DUPLICATE' : b[0].textContent;
    }
    return out;
  });

  await check('timeline + quote + followers badges', async () => {
    assert.deepEqual(await badges(), {
      alice_ai: '粉丝 17.4万',
      bob_builds: '粉丝 1.1万',
      carol_dev: '粉丝 1,574',
      dan_quotes: '粉丝 16.4万',
      henry_nodata: null,
      erin_cn: '粉丝 3.5万',
      frank_7: '粉丝 7',
      grace_lynne: '粉丝 7,806',
    });
  });

  await check('badge sits on the name line: after ✓, before @handle', async () => {
    const geo = await page.evaluate(() => [...document.querySelectorAll('.xfc-badge')].map((b) => {
      const c = b.closest('[data-testid="User-Name"], [data-testid="UserCell"]');
      const ver = c.querySelector('[data-testid="icon-verified"]').getBoundingClientRect();
      const handle = [...c.querySelectorAll('span')].find((s) => s.firstChild && /^@\w+$/.test(s.firstChild.nodeValue || '')).getBoundingClientRect();
      const r = b.getBoundingClientRect();
      const midDiff = Math.abs((r.top + r.bottom) / 2 - (ver.top + ver.bottom) / 2);
      const cell = c.getAttribute('data-testid') === 'UserCell';
      return { ok: r.left >= ver.right - 0.5 && midDiff < 3 && (cell ? r.bottom <= handle.top + 2 : r.right <= handle.left + 0.5), cell, r: [r.left, r.top, r.width, r.height] };
    }));
    assert.ok(geo.length >= 7, 'expected >= 7 badges');
    for (const g of geo) assert.ok(g.ok, 'misplaced badge ' + JSON.stringify(g));
  });

  await check('bio @mention does not steal the handle', async () => {
    const b = await badges();
    assert.equal(b.grace_lynne, '粉丝 7,806');
  });

  await check('remounted (virtualised) tweet gets its badge back', async () => {
    await page.evaluate(() => window.__mock.remount('1'));
    await page.waitForTimeout(300);
    assert.equal((await badges()).alice_ai, '粉丝 17.4万');
  });

  await check('reused header node switches to the new author', async () => {
    await page.evaluate(() => window.__mock.retarget('2', 'Carol', 'carol_dev'));
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => document.querySelector('article[data-id="2"] [data-testid="User-Name"] .xfc-badge').textContent);
    assert.equal(txt, '粉丝 1,574');
    await page.evaluate(() => window.__mock.retarget('2', 'Bob Builder', 'bob_builds'));
    await page.waitForTimeout(300);
  });

  const pills = () => page.evaluate(() => [...document.querySelectorAll('.xfc-nofb')].map((p) => ({
    section: p.closest('[data-testid="UserCell"]').parentElement.id,
    handle: p.dataset.xfcKey,
    text: p.textContent,
  })));

  await check('未回关 tags exactly the people you follow who do not follow you', async () => {
    assert.deepEqual(await pills(), [
      { section: 'following', handle: 'bob_builds', text: '未回关' },
      { section: 'following', handle: 'dan_quotes', text: '未回关' },
    ]);
  });

  await check('未回关 sits right after the @handle, on the handle line', async () => {
    const geo = await page.evaluate(() => [...document.querySelectorAll('.xfc-nofb')].map((p) => {
      const cell = p.closest('[data-testid="UserCell"]');
      const h = [...cell.querySelectorAll('span')].find((s) => s.firstChild && /^@\w+$/.test(s.firstChild.nodeValue || '')).getBoundingClientRect();
      const r = p.getBoundingClientRect();
      return r.left >= h.right - 0.5 && Math.abs((r.top + r.bottom) / 2 - (h.top + h.bottom) / 2) < 3;
    }));
    assert.deepEqual(geo, [true, true]);
  });

  await page.locator('[data-testid="primaryColumn"]').screenshot({ path: join(OUT, 'mock-light.png') });

  await check('dark theme switches badge palette', async () => {
    await page.evaluate(() => document.body.classList.add('dark'));
    await page.evaluate(() => document.body.appendChild(document.createElement('i'))); // nudge observer
    await page.waitForTimeout(300);
    const color = await page.evaluate(() => [document.documentElement.dataset.xfcTheme, getComputedStyle(document.querySelector('.xfc-badge')).color]);
    assert.deepEqual(color, ['dark', 'rgb(29, 155, 240)']);
  });
  await page.locator('[data-testid="primaryColumn"]').screenshot({ path: join(OUT, 'mock-dark.png') });
  await page.evaluate(() => document.body.classList.remove('dark'));

  await check('unfollowing (data-testid flips in place) drops 未回关 at once', async () => {
    await page.evaluate(() => window.__mock.unfollow('dan_quotes'));
    await page.waitForTimeout(300);
    assert.deepEqual((await pills()).map((p) => p.handle), ['bob_builds']);
  });

  // ---- popup ----
  const id = extensionId();
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 340, height: 600 });
  await check('popup opens and shows the recorded count', async () => {
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await popup.waitForTimeout(3500); // content script persists on a 3 s debounce
    await popup.reload();
    await popup.waitForFunction(() => document.getElementById('count').textContent !== '0', null, { timeout: 4000 });
    assert.equal(await popup.locator('#count').textContent(), '7');
    const { version } = JSON.parse(readFileSync(join(ROOT, 'extension', 'manifest.json'), 'utf8'));
    assert.equal(await popup.locator('#version').textContent(), 'v' + version);
  });
  await popup.screenshot({ path: join(OUT, 'popup-light.png'), fullPage: true });

  const toggle = (sel) => popup.locator(sel).click();

  await check('popup: English format applies live', async () => {
    await popup.locator('input[name="lang"][value="en"]').check({ force: true });
    await page.waitForTimeout(400);
    const b = await badges();
    assert.equal(b.alice_ai, '174.1K followers');
    assert.equal(b.frank_7, '7 followers');
    assert.equal(await popup.locator('#pv-badge').textContent(), '174.1K followers');
    assert.deepEqual((await pills()).map((p) => p.text), ["Doesn't follow you"]);
    await popup.locator('input[name="lang"][value="zh"]').check({ force: true });
  });

  await check('popup: tier colours', async () => {
    await toggle('#tierColors');
    await page.waitForTimeout(400);
    const tiers = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.xfc-badge')].map((b) => [b.textContent, b.className])));
    assert.equal(tiers['粉丝 17.4万'], 'xfc-badge xfc-tier-4');
    assert.equal(tiers['粉丝 3.5万'], 'xfc-badge xfc-tier-3');
    assert.equal(tiers['粉丝 7,806'], 'xfc-badge xfc-tier-2');
    assert.equal(tiers['粉丝 7'], 'xfc-badge xfc-tier-1');
  });
  await popup.screenshot({ path: join(OUT, 'popup-tiers.png'), fullPage: true });
  await page.locator('[data-testid="primaryColumn"]').screenshot({ path: join(OUT, 'mock-tiers.png') });
  await toggle('#tierColors');

  await check('popup: 未回关 switch', async () => {
    await toggle('#showNoFollowBack');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.xfc-nofb').count(), 0);
    await toggle('#showNoFollowBack');
    await page.waitForTimeout(400);
    assert.deepEqual((await pills()).map((p) => p.handle), ['bob_builds']);
  });

  await check('popup: hide in user lists only', async () => {
    await toggle('#showInLists');
    await page.waitForTimeout(400);
    const b = await badges();
    assert.equal(b.erin_cn, null);
    assert.equal(b.carol_dev, '粉丝 1,574');
    assert.deepEqual((await pills()).map((p) => p.handle), ['bob_builds'], '未回关 has its own switch');
    await toggle('#showInLists');
    await page.waitForTimeout(400);
    assert.equal((await badges()).erin_cn, '粉丝 3.5万');
  });

  await check('popup: master switch removes and restores everything', async () => {
    const before = await page.locator('.xfc-badge').count();
    await toggle('#enabled');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.xfc-badge').count(), 0);
    assert.equal(await page.locator('.xfc-nofb').count(), 0);
    assert.equal(await popup.locator('#options').evaluate((f) => f.disabled), true);
    await toggle('#enabled');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.xfc-badge').count(), before);
    assert.equal(await page.locator('.xfc-nofb').count(), 1);
  });

  await check('persisted cache renders badges when X serves no counts', async () => {
    apiMode = 'nocounts';
    try {
      await page.reload();
      await page.waitForFunction(() => window.__timelineReady && window.__followersReady);
      await page.waitForTimeout(600);
      const b = await badges();
      assert.equal(b.alice_ai, '粉丝 17.4万');
      assert.equal(b.dan_quotes, '粉丝 16.4万');
      assert.equal(b.erin_cn, '粉丝 3.5万');
    } finally {
      apiMode = 'normal';
    }
  });

  await check('popup: clear forgets records; fresh responses repopulate', async () => {
    await toggle('#clear');
    await popup.waitForFunction(() => document.getElementById('count').textContent === '0');
    assert.deepEqual(await popup.evaluate(() => chrome.storage.local.get('xfcCache')), {});
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.xfc-badge').count(), 0, 'open tab drops its badges');
    await page.waitForTimeout(3500);
    assert.equal(await popup.locator('#count').textContent(), '0', 'count must not bounce back');
    await page.reload();
    await page.waitForFunction(() => window.__timelineReady && window.__followersReady);
    await page.waitForTimeout(600);
    assert.equal((await badges()).alice_ai, '粉丝 17.4万');
  });

  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.reload();
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: join(OUT, 'popup-dark.png'), fullPage: true });

  await ctx.close();

  for (const [s, n, why] of results) console.log(`${s === 'PASS' ? '✔' : '✖'} ${n}${why ? '\n    ' + why : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed · screenshots in test/e2e/out/`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
