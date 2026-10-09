'use strict';

// Keep in sync with DEFAULTS in src/content.js.
const DEFAULTS = {
  enabled: true,
  showInTweets: true,
  showInLists: true,
  lang: 'zh',
  tierColors: false,
  showNoFollowBack: true,
};
const SWITCHES = ['enabled', 'showInTweets', 'showInLists', 'tierColors', 'showNoFollowBack'];
const CACHE_KEY = 'xfcCache';
const SAMPLE_FOLLOWERS = 174123;
const F = globalThis.XFCFormat;

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

// content.css keys its dark badge colors off this attribute.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => { document.documentElement.dataset.xfcTheme = darkQuery.matches ? 'dark' : 'light'; };
applyTheme();
darkQuery.addEventListener('change', applyTheme);

function renderPreview() {
  const badge = $('pv-badge');
  badge.textContent = F.label(SAMPLE_FOLLOWERS, settings.lang);
  badge.className = settings.tierColors ? 'xfc-badge xfc-tier-' + F.tier(SAMPLE_FOLLOWERS) : 'xfc-badge';
  $('legend').hidden = !settings.tierColors;
  $('nofb-sample').textContent = settings.lang === 'en' ? "Doesn't follow you" : '未回关';
  $('options').disabled = !settings.enabled;
}

function renderControls() {
  for (const id of SWITCHES) $(id).checked = !!settings[id];
  for (const r of document.querySelectorAll('input[name="lang"]')) r.checked = r.value === settings.lang;
  renderPreview();
}

async function save(patch) {
  settings = { ...settings, ...patch };
  renderPreview();
  await chrome.storage.sync.set(patch);
}

async function refreshCount() {
  const cache = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
  $('count').textContent = Object.keys(cache).length.toLocaleString('en-US');
}

async function init() {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  renderControls();
  // Two frames: the saved state must paint before transitions are enabled.
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
  refreshCount();

  for (const id of SWITCHES) {
    $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
  }
  for (const r of document.querySelectorAll('input[name="lang"]')) {
    r.addEventListener('change', (e) => e.target.checked && save({ lang: e.target.value }));
  }

  const clear = $('clear');
  clear.addEventListener('click', async () => {
    await chrome.storage.local.remove(CACHE_KEY);
    await refreshCount();
    clear.textContent = '已清空';
    setTimeout(() => { clear.textContent = '清空记录'; }, 1500);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[CACHE_KEY]) refreshCount();
  });
}

init();
