import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexHtml = await readFile('index.html', 'utf8');
const homeCss = await readFile('assets/home.css', 'utf8').catch(() => '');
const homeJs = await readFile('assets/home.js', 'utf8').catch(() => '');

test('homepage uses the Editorial Workshop surface without replacing site metadata', () => {
  assert.match(indexHtml, /<body class="home-editorial">/);
  assert.match(indexHtml, /<link rel="stylesheet" href="assets\/home\.css"/);
  assert.match(indexHtml, /<script defer src="assets\/home\.js"/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/www\.easterlingmediasystems\.com\/"/);
  assert.match(indexHtml, /<script type="application\/ld\+json">[\s\S]*?"@type": "Organization"/);
});

test('homepage presents each real pillar once in the workshop ledger', () => {
  const ledger = indexHtml.match(/<section class="home-ledger"[\s\S]*?<\/section>/)?.[0] || '';
  for (const href of ['builds.html', 'blogs.html', 'newsletters.html', 'nagikumo-chillfi.html']) {
    assert.equal(
      (ledger.match(new RegExp(`href="${href}"`, 'g')) || []).length,
      1,
      `${href} should appear once in the pillar ledger`,
    );
  }
  assert.equal((ledger.match(/class="home-ledger__item/g) || []).length, 4);
});

test('homepage uses current repository-backed writing, newsletter, and imagery', () => {
  assert.match(indexHtml, /posts\/august-10-systems-note-build-for-the-next-episode\.html/);
  assert.match(indexHtml, /Systems Note: Build for the Next Episode/);
  assert.match(indexHtml, /data-newsletter-home-issue/);
  assert.match(indexHtml, /data-newsletter-archive-status/);
  assert.match(indexHtml, /assets\/nagikumo\/(?:rainy-cafe|train-ride-sunset|tatami-morning|rainy-desk-night)\.(?:jpg|png)/);
  assert.match(indexHtml, /<img[^>]+alt="[^"]+"/);

  const main = indexHtml.match(/<main[\s\S]*?<\/main>/)?.[0] || '';
  assert.doesNotMatch(main, /easterlingms_header\.png/);
});

test('homepage keeps real visitor hooks and removes fake system analytics', () => {
  for (const hook of ['data-site-total-visits', 'data-site-your-visits', 'data-site-other-visits']) {
    assert.equal((indexHtml.match(new RegExp(hook, 'g')) || []).length, 1);
  }
  assert.doesNotMatch(indexHtml, /system-status|mini-line|mini-bars|mini-meter|System Status/);
});

test('homepage has keyboard, responsive, and reduced-motion protections', () => {
  assert.match(indexHtml, /class="skip-link" href="#main-content"/);
  assert.match(indexHtml, /<main id="main-content"/);
  assert.match(homeCss, /--ink:\s*#171912/i);
  assert.match(homeCss, /--bone:\s*#f3eee3/i);
  assert.match(homeCss, /--oxide:\s*#c85b32/i);
  assert.match(homeCss, /--moss:\s*#5c6b45/i);
  assert.match(homeCss, /--mustard:\s*#d2a33b/i);
  assert.match(homeCss, /--hairline:\s*#d3c9b7/i);
  assert.match(homeCss, /:focus-visible/);
  assert.match(homeCss, /@media\s*\([^)]*max-width/i);
  assert.match(homeCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(homeJs, /prefers-reduced-motion:\s*reduce/);
  assert.match(homeJs, /IntersectionObserver/);
});
