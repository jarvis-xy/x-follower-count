import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// format.js is a classic script that sets globalThis.XFCFormat, as in the browser.
const ctx = vm.createContext({ Intl, Date, Math });
vm.runInContext(readFileSync(new URL('../extension/src/format.js', import.meta.url), 'utf8'), ctx);
const F = ctx.XFCFormat;

test('zh compact matches the reference screenshot', () => {
  assert.equal(F.compact(3, 'zh'), '3');
  assert.equal(F.compact(1574, 'zh'), '1,574');
  assert.equal(F.compact(7806, 'zh'), '7,806');
  assert.equal(F.compact(9999, 'zh'), '9,999');
  assert.equal(F.compact(10000, 'zh'), '1万');
  assert.equal(F.compact(11000, 'zh'), '1.1万');
  assert.equal(F.compact(35000, 'zh'), '3.5万');
  assert.equal(F.compact(174123, 'zh'), '17.4万');
  assert.equal(F.compact(99999, 'zh'), '9.9万'); // truncates, never rounds up
  assert.equal(F.compact(123456789, 'zh'), '1.2亿');
});

test('en compact follows X conventions', () => {
  assert.equal(F.compact(7806, 'en'), '7,806');
  assert.equal(F.compact(10000, 'en'), '10K');
  assert.equal(F.compact(174123, 'en'), '174.1K');
  assert.equal(F.compact(999999, 'en'), '999.9K');
  assert.equal(F.compact(2345678, 'en'), '2.3M');
  assert.equal(F.compact(1200000000, 'en'), '1.2B');
});

test('labels', () => {
  assert.equal(F.label(174123, 'zh'), '粉丝 17.4万');
  assert.equal(F.label(174123, 'en'), '174.1K followers');
});

test('tiers', () => {
  assert.equal(F.tier(0), 1);
  assert.equal(F.tier(999), 1);
  assert.equal(F.tier(1000), 2);
  assert.equal(F.tier(9999), 2);
  assert.equal(F.tier(10000), 3);
  assert.equal(F.tier(99999), 3);
  assert.equal(F.tier(100000), 4);
});

test('tooltip shows exact numbers', () => {
  const zh = F.tooltip({ f: 174123, g: 512, t: Date.now() }, 'zh');
  assert.match(zh, /^粉丝 174,123 · 正在关注 512\n数据更新于 /);
  const en = F.tooltip({ f: 174123, g: null, t: 0 }, 'en');
  assert.equal(en, '174,123 followers');
});
