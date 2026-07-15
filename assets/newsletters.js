(function () {
  const dataUrl = 'assets/newsletter-issues.json';
  const latestIssueContainers = Array.from(document.querySelectorAll('[data-newsletter-latest-issue]'));
  const archiveContainers = Array.from(document.querySelectorAll('[data-newsletter-archive]'));
  const homeContainers = Array.from(document.querySelectorAll('[data-newsletter-home-issue]'));
  const statusTargets = Array.from(document.querySelectorAll('[data-newsletter-archive-status]'));

  if (!latestIssueContainers.length && !archiveContainers.length && !homeContainers.length) return;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function issueUrl(issue) {
    return `newsletters.html?issue=${encodeURIComponent(issue.slug)}#newsletter-reader`;
  }

  function setStatus(text) {
    statusTargets.forEach((target) => { target.textContent = text; });
  }

  function renderHomeIssue(issue) {
    return `
      <div class="newsletter-spotlight card">
        <p class="muted">Latest issue</p>
        <h3><a href="${issueUrl(issue)}">${escapeHtml(issue.title)}</a></h3>
        <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))}</p>
        <p>${escapeHtml(issue.excerpt)}</p>
        <a class="btn" href="${issueUrl(issue)}">Read on-site</a>
      </div>`;
  }

  function renderIssueCta(issue) {
    const cta = issue?.cta;
    if (!cta) return '';

    const socials = Array.isArray(cta.socials)
      ? cta.socials
        .filter((social) => social?.label && social?.url)
        .map((social) => `<a href="${escapeHtml(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(social.label)}</a>`)
        .join('')
      : '';

    return `
      <aside class="newsletter-cta" aria-labelledby="newsletter-cta-heading">
        <span class="section-kicker">Keep exploring</span>
        <h3 id="newsletter-cta-heading">${escapeHtml(cta.heading)}</h3>
        <p>${escapeHtml(cta.body)}</p>
        <div class="newsletter-cta-actions">
          <a class="btn primary" href="${escapeHtml(cta.mindmarkUrl)}">${escapeHtml(cta.mindmarkLabel)}</a>
          <a class="btn" href="${escapeHtml(cta.youtubeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cta.youtubeLabel)}</a>
        </div>
        ${socials ? `<div class="newsletter-cta-social"><span>Follow</span>${socials}</div>` : ''}
      </aside>`;
  }

  function renderLatestIssue(issue) {
    const authors = Array.isArray(issue.authors) && issue.authors.length
      ? issue.authors.join(', ')
      : 'Easterling Media & Systems';

    return `
      <article class="newsletter-reader card">
        <div class="newsletter-reader-head">
          <p class="muted">Newsletter issue</p>
          <h2>${escapeHtml(issue.title)}</h2>
          <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))} &middot; ${escapeHtml(authors)}</p>
          <a class="btn" href="#newsletter-archive">Browse archive</a>
        </div>
        <div class="newsletter-reader-body">
          ${issue.html || `<p>${escapeHtml(issue.excerpt)}</p>`}
          ${renderIssueCta(issue)}
        </div>
      </article>`;
  }

  function renderArchiveCard(issue, activeSlug) {
    return `
      <article class="card${issue.slug === activeSlug ? ' is-active-issue' : ''}">
        <h3><a href="${issueUrl(issue)}">${escapeHtml(issue.title)}</a></h3>
        <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))}</p>
        <p>${escapeHtml(issue.excerpt)}</p>
      </article>`;
  }

  async function loadIssues() {
    try {
      const response = await fetch(`${dataUrl}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Unable to load newsletter archive (${response.status})`);

      const payload = await response.json();
      const issues = Array.isArray(payload?.issues) ? payload.issues : [];
      if (!issues.length) {
        setStatus('The first issue is being prepared.');
        return;
      }

      const selectedSlug = new URLSearchParams(window.location.search).get('issue');
      const selectedIssue = issues.find((issue) => issue.slug === selectedSlug) || issues[0];

      homeContainers.forEach((container) => { container.innerHTML = renderHomeIssue(issues[0]); });
      latestIssueContainers.forEach((container) => { container.innerHTML = renderLatestIssue(selectedIssue); });
      archiveContainers.forEach((container) => {
        container.innerHTML = issues.map((issue) => renderArchiveCard(issue, selectedIssue.slug)).join('');
      });

      setStatus(`${issues.length} issue${issues.length === 1 ? '' : 's'} published on this site.`);
    } catch (error) {
      console.error('Newsletter archive failed to load.', error);
      setStatus('The newsletter archive is temporarily unavailable.');
    }
  }

  void loadIssues();
})();
