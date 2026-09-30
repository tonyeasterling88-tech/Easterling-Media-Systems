import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function loadRenderer() {
  const source = await read('assets/newsletters.js');
  const sandbox = { console, URLSearchParams };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'assets/newsletters.js' });
  return sandbox.EMSNewsletterRenderer;
}

test('newsletter page uses the warm desk-system presentation', async () => {
  const [html, css] = await Promise.all([
    read('newsletters.html'),
    read('assets/newsletter.css'),
  ]);

  assert.match(html, /class="newsletter-page"/);
  assert.match(html, /assets\/newsletter\.css\?v=20260930/);
  assert.match(html, /id="newsletter-reader"/);
  assert.match(html, /data-newsletter-archive/);
  assert.match(css, /--paper:\s*#faf7f2/);
  assert.match(css, /--accent:\s*#b4691e/);
  assert.match(css, /\.ems-archive-item/);
  assert.doesNotMatch(css, /#67e8f9|#22d3ee|#a855f7/i);
});

test('September issue is first, complete, and free of provider placeholders', async () => {
  const archive = JSON.parse(await read('assets/newsletter-issues.json'));
  const issue = archive.issues[0];

  assert.equal(archive.issues.length, 15);
  assert.equal(issue.slug, 'systems-update-from-the-workshop-to-the-world');
  assert.equal(issue.publishedAt, '2026-09-29T12:00:00.000Z');
  assert.equal(issue.thumbnailUrl, 'assets/nagikumo/rainy-desk-night.png');
  assert.match(issue.html, /01 — Build desk/);
  assert.match(issue.html, /04 — NagiKumo desk/);
  assert.match(issue.html, /mindmark\.html#mindmark-beta/);
  assert.doesNotMatch(JSON.stringify(issue), /\[EDIT:|unsubscribe URL|provider's subscribe|#signup/i);
});

test('renderer selects issues safely and omits missing artwork', async () => {
  const renderer = await loadRenderer();
  assert.ok(renderer);

  const issues = [
    { slug: 'newest', title: 'Newest', publishedAt: '2026-09-29', excerpt: 'Latest', html: '<p>Body</p>' },
    { slug: 'older', title: 'Older', publishedAt: '2026-08-03', excerpt: 'Earlier', html: '<p>Old</p>' },
  ];

  assert.equal(renderer.selectIssue(issues, 'older').slug, 'older');
  assert.equal(renderer.selectIssue(issues, 'missing').slug, 'newest');

  const withoutArtwork = renderer.renderLatestIssue(issues[0]);
  assert.doesNotMatch(withoutArtwork, /<img/);
  assert.match(withoutArtwork, /class="ems-issue"/);

  const withArtwork = renderer.renderLatestIssue({
    ...issues[0],
    thumbnailUrl: 'assets/example.jpg',
    thumbnailAlt: 'A calm workshop scene',
  });
  assert.match(withArtwork, /src="assets\/example\.jpg"/);
  assert.match(withArtwork, /alt="A calm workshop scene"/);
});

test('archive rows and error state remain usable without artwork or data', async () => {
  const renderer = await loadRenderer();
  const row = renderer.renderArchiveRow({
    slug: 'field-note',
    title: 'Field note',
    publishedAt: '2026-08-03',
    excerpt: 'A practical note.',
  }, 'field-note');

  assert.match(row, /ems-archive-item is-active-issue/);
  assert.match(row, /href="newsletters\.html\?issue=field-note#newsletter-reader"/);
  assert.doesNotMatch(row, /<img/);
  assert.match(renderer.renderError('Archive unavailable.'), /role="status"/);
  assert.match(renderer.renderError('Archive unavailable.'), /Archive unavailable\./);
});
