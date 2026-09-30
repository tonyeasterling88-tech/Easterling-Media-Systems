(function () {
  const dataUrl = 'assets/newsletter-issues.json';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? 'Date unavailable'
      : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function issueUrl(issue) {
    return `newsletters.html?issue=${encodeURIComponent(issue.slug)}#newsletter-reader`;
  }

  function selectIssue(issues, slug) {
    return issues.find((issue) => issue.slug === slug) || issues[0];
  }

  function renderHomeIssue(issue) {
    return `<div class="newsletter-spotlight card">
      <p class="muted">Latest issue</p>
      <h3><a href="${issueUrl(issue)}">${escapeHtml(issue.title)}</a></h3>
      <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))}</p>
      <p>${escapeHtml(issue.excerpt)}</p>
      <a class="btn" href="${issueUrl(issue)}">Read on-site</a>
    </div>`;
  }

  function renderIssueCta(issue) {
    const cta = issue.cta;
    if (!cta) return '';
    const socials = Array.isArray(cta.socials)
      ? cta.socials.filter((social) => social?.label && social?.url)
        .map((social) => `<a href="${escapeHtml(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(social.label)}</a>`).join('')
      : '';
    return `<aside class="newsletter-cta">
      <span class="section-kicker">Keep exploring</span>
      <h3>${escapeHtml(cta.heading)}</h3>
      <p>${escapeHtml(cta.body)}</p>
      <div class="newsletter-cta-actions">
        ${cta.mindmarkUrl ? `<a class="btn primary" href="${escapeHtml(cta.mindmarkUrl)}">${escapeHtml(cta.mindmarkLabel)}</a>` : ''}
        ${cta.youtubeUrl ? `<a class="btn" href="${escapeHtml(cta.youtubeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cta.youtubeLabel)}</a>` : ''}
      </div>
      ${socials ? `<div class="newsletter-cta-social"><span>Follow</span>${socials}</div>` : ''}
    </aside>`;
  }

  function renderLatestIssue(issue) {
    const authors = Array.isArray(issue.authors) && issue.authors.length
      ? issue.authors.join(', ') : 'Easterling Media & Systems';
    const art = issue.thumbnailUrl
      ? `<figure class="ems-hero"><img src="${escapeHtml(issue.thumbnailUrl)}" alt="${escapeHtml(issue.thumbnailAlt || '')}" /><figcaption>${escapeHtml(issue.thumbnailCaption || '')}</figcaption></figure>`
      : '';
    return `<article class="ems-issue">
      <header class="ems-masthead">
        <span class="brand">Easterling Media &amp; Systems</span>
        <h2>${escapeHtml(issue.title)}</h2>
        <p class="issue-meta">${escapeHtml(formatDate(issue.publishedAt))} · ${escapeHtml(authors)} · <a href="#newsletter-archive">Browse the archive</a></p>
      </header>
      <hr class="ems-rule-double" />
      ${art}
      <div class="ems-body">
        ${issue.html || `<section class="ems-section"><p>${escapeHtml(issue.excerpt)}</p></section>`}
        ${renderIssueCta(issue)}
      </div>
    </article>`;
  }

  function renderArchiveRow(issue, activeSlug) {
    return `<a class="ems-archive-item${issue.slug === activeSlug ? ' is-active-issue' : ''}" href="${issueUrl(issue)}"${issue.slug === activeSlug ? ' aria-current="page"' : ''}>
      <span class="date">${escapeHtml(formatDate(issue.publishedAt))}</span>
      <span class="title">${escapeHtml(issue.title)}</span>
      <span class="desc">${escapeHtml(issue.excerpt)}</span>
    </a>`;
  }

  function renderError(message) {
    return `<p class="ems-loading" role="status">${escapeHtml(message)}</p>`;
  }

  globalThis.EMSNewsletterRenderer = { selectIssue, renderLatestIssue, renderArchiveRow, renderError };
  if (typeof document === 'undefined') return;

  const latestContainers = document.querySelectorAll('[data-newsletter-latest-issue]');
  const archiveContainers = document.querySelectorAll('[data-newsletter-archive]');
  const homeContainers = document.querySelectorAll('[data-newsletter-home-issue]');
  const statusTargets = document.querySelectorAll('[data-newsletter-archive-status]');
  if (!latestContainers.length && !archiveContainers.length && !homeContainers.length) return;

  function setStatus(message) {
    statusTargets.forEach((target) => { target.textContent = message; });
  }

  async function loadIssues() {
    try {
      const response = await fetch(dataUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Archive request failed: ${response.status}`);
      const payload = await response.json();
      const issues = Array.isArray(payload?.issues)
        ? [...payload.issues].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        : [];
      if (!issues.length) throw new Error('Archive is empty');
      const selected = selectIssue(issues, new URLSearchParams(window.location.search).get('issue'));
      latestContainers.forEach((container) => { container.innerHTML = renderLatestIssue(selected); });
      archiveContainers.forEach((container) => {
        container.innerHTML = `<div class="ems-archive-list">${issues.map((issue) => renderArchiveRow(issue, selected.slug)).join('')}</div>`;
      });
      homeContainers.forEach((container) => { container.innerHTML = renderHomeIssue(issues[0]); });
      setStatus(`${issues.length} issues in the on-site archive.`);
    } catch (error) {
      console.error('Newsletter archive failed to load.', error);
      latestContainers.forEach((container) => { container.innerHTML = renderError('The issue is temporarily unavailable.'); });
      archiveContainers.forEach((container) => { container.innerHTML = renderError('The archive is temporarily unavailable.'); });
      homeContainers.forEach((container) => { container.innerHTML = renderError('The latest issue is temporarily unavailable.'); });
      setStatus('The newsletter archive is temporarily unavailable.');
    }
  }

  void loadIssues();
})();
