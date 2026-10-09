// Generate Chrome Web Store images into store/out/:
//   screenshot-1..4.png  1280x800  (badges drawn by the real extension)
//   promo-small.png      440x280   (required)
//   promo-marquee.png    1400x560  (optional)
//   icon128.png          store icon (copy of the manifest icon)
//
//   npm run store:assets
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, EXT, extensionId, launchWithExtension } from './lib/chromium.mjs';

const SRC = join(ROOT, 'store', 'assets-src');
const OUT = join(ROOT, 'store', 'out');
const data = JSON.parse(readFileSync(join(SRC, 'data.json'), 'utf8'));

// Users as they appear in X's 2026 GraphQL responses.
function usersPayload() {
  return {
    data: {
      users: Object.entries(data.users).map(([screen_name, u]) => ({
        __typename: 'User',
        core: { name: u.name, screen_name },
        relationship_counts: { followers: u.f, following: u.g },
      })),
    },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await launchWithExtension({ viewport: { width: 1280, height: 800 } });
  let popupPng = null;

  await ctx.route('https://x.com/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/i/api/graphql/store/Users') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(usersPayload()) });
    }
    if (pathname === '/__store/data.json') return route.fulfill({ path: join(SRC, 'data.json') });
    if (pathname === '/__store/icon32.png') return route.fulfill({ path: join(EXT, 'icons', 'icon32.png') });
    if (pathname === '/__store/popup.png') return route.fulfill({ contentType: 'image/png', body: popupPng });
    if (pathname.startsWith('/__store/promo')) return route.fulfill({ path: join(SRC, 'promo.html') });
    return route.fulfill({ path: join(SRC, 'scene.html') });
  });

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extensionId()}/popup/popup.html`);
  const setSettings = (s) => popup.evaluate((v) => chrome.storage.sync.set(v), s);

  async function shoot(scene, file, expectBadges) {
    const page = await ctx.newPage();
    await page.goto(`https://x.com/__store/scene?s=${scene}`);
    await page.waitForFunction(() => window.__sceneReady);
    await page.waitForFunction((n) => document.querySelectorAll('.window .xfc-badge').length >= n, expectBadges, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, file) });
    await page.waitForTimeout(3500); // let the extension persist its cache (popup shows the count)
    await page.close();
    console.log('wrote', file);
  }

  const tweetsAndSide = data.timeline.length + data.timeline.filter((t) => t.quote).length + data.suggested.length;
  await setSettings({ enabled: true, showInTweets: true, showInLists: true, lang: 'zh', tierColors: false });
  await shoot('timeline', 'screenshot-1.png', tweetsAndSide);
  await shoot('followers', 'screenshot-2.png', data.followers.length + data.suggested.length);
  await setSettings({ tierColors: true });
  await shoot('dark', 'screenshot-3.png', tweetsAndSide);

  // Popup as it looks with tier colours on, after the scenes above populated the cache.
  await popup.setViewportSize({ width: 340, height: 640 });
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('count').textContent !== '0');
  await popup.waitForTimeout(200);
  popupPng = await popup.screenshot({ fullPage: true });
  await shoot('settings', 'screenshot-4.png', tweetsAndSide);
  await setSettings({ tierColors: false });

  for (const [size, w, h] of [['small', 440, 280], ['marquee', 1400, 560]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`https://x.com/__store/promo?size=${size}`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `promo-${size}.png`) });
    await page.close();
    console.log(`wrote promo-${size}.png`);
  }

  copyFileSync(join(EXT, 'icons', 'icon128.png'), join(OUT, 'icon128.png'));
  console.log('wrote icon128.png');
  await ctx.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
