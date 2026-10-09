// Number/label formatting shared by the content script and the popup.
(function (root) {
  'use strict';

  const grouped = new Intl.NumberFormat('en-US');

  // Truncate (not round) to one decimal, the way X shows "17.4K".
  function cut(n, unit) {
    return Math.floor(n / (unit / 10)) / 10;
  }

  // zh: 7,806 / 1.1万 / 17.4万 / 2.3亿   en: 7,806 / 11K / 174.1K / 2.3M
  function compact(n, lang) {
    if (n < 10000) return grouped.format(n);
    if (lang === 'en') {
      if (n < 1e6) return cut(n, 1e3) + 'K';
      if (n < 1e9) return cut(n, 1e6) + 'M';
      return cut(n, 1e9) + 'B';
    }
    if (n < 1e8) return cut(n, 1e4) + '万';
    return cut(n, 1e8) + '亿';
  }

  function label(n, lang) {
    return lang === 'en' ? compact(n, 'en') + ' followers' : '粉丝 ' + compact(n, 'zh');
  }

  // 1: <1k  2: 1k–10k  3: 10k–100k  4: 100k+
  function tier(n) {
    if (n >= 1e5) return 4;
    if (n >= 1e4) return 3;
    if (n >= 1e3) return 2;
    return 1;
  }

  function stamp(t, lang) {
    const d = new Date(t);
    const sameDay = d.toDateString() === new Date().toDateString();
    const opts = sameDay
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', opts);
  }

  function tooltip(rec, lang) {
    const f = grouped.format(rec.f);
    const g = rec.g == null ? null : grouped.format(rec.g);
    if (lang === 'en') {
      return f + ' followers' + (g == null ? '' : ' · ' + g + ' following') +
        (rec.t ? '\nUpdated ' + stamp(rec.t, 'en') : '');
    }
    return '粉丝 ' + f + (g == null ? '' : ' · 正在关注 ' + g) +
      (rec.t ? '\n数据更新于 ' + stamp(rec.t, 'zh') : '');
  }

  root.XFCFormat = { compact, label, tier, tooltip };
})(globalThis);
