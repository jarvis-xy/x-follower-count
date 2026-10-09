// Shared by the e2e test and the store-asset generator: launch Chromium with
// the unpacked extension loaded.
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const EXT = realpathSync(join(ROOT, 'extension'));

export function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const mac = join(cache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(mac)) return mac;
  }
  throw new Error('No Chromium found. Run `npx playwright-core install chromium` or set CHROME_PATH.');
}

// Chrome derives an unpacked extension's ID from its absolute path.
export function extensionId(path = EXT) {
  const hex = createHash('sha256').update(path).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

export function launchWithExtension(options = {}) {
  return chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'xfc-')), {
    executablePath: findChromium(),
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    ...options,
  });
}
