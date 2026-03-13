(function () {
  const dataUrl = 'assets/beehiiv-posts.json';
  const latestIssueContainers = Array.from(document.querySelectorAll('[data-beehiiv-latest-issue]'));
  const archiveContainers = Array.from(document.querySelectorAll('[data-beehiiv-archive]'));
  const homeContainers = Array.from(document.querySelectorAll('[data-beehiiv-home-issue]'));
  const statusTargets = Array.from(document.querySelectorAll('[data-beehiiv-sync-status]'));

  if (!latestIssueContainers.length && !archiveContainers.length && !homeContainers.length) {
    return;
  }

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
    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function issueUrl(issue) {
    return `newsletters.html?issue=${encodeURIComponent(issue.slug)}#newsletter-reader`;
  }

  function setStatus(text) {
    statusTargets.forEach((target) => {
      target.textContent = text;
    });
  }

  function renderHomeIssue(issue) {
    return `
      <div class="newsletter-spotlight card">
        <p class="muted">Latest issue</p>
        <h3><a href="${issueUrl(issue)}">${escapeHtml(issue.title)}</a></h3>
        <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))}</p>
        <p>${escapeHtml(issue.excerpt)}</p>
        <div class="cta-row">
          <a class="btn" href="${issueUrl(issue)}">Read on-site</a>
          ${issue.webUrl ? `<a class="btn" href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener noreferrer">Open on Beehiiv</a>` : ''}
        </div>
      </div>
    `;
  }

  function renderLatestIssue(issue) {
    const authorText = Array.isArray(issue.authors) && issue.authors.length
      ? issue.authors.join(', ')
      : 'Easterling Media & Systems';

    return `
      <article class="newsletter-reader card">
        <div class="newsletter-reader-head">
          <p class="muted">Latest issue</p>
          <h2>${escapeHtml(issue.title)}</h2>
          <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))} &middot; ${escapeHtml(authorText)}</p>
          <div class="cta-row">
            ${issue.webUrl ? `<a class="btn" href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener noreferrer">Open on Beehiiv</a>` : ''}
            <a class="btn" href="#newsletter-archive">Browse archive</a>
          </div>
        </div>
        <div class="newsletter-reader-body">
          ${issue.html || `<p>${escapeHtml(issue.excerpt)}</p>`}
        </div>
      </article>
    `;
  }

  function renderArchiveCard(issue, activeSlug) {
    const isActive = issue.slug === activeSlug;
    return `
      <article class="card${isActive ? ' is-active-issue' : ''}">
        <h3><a href="${issueUrl(issue)}">${escapeHtml(issue.title)}</a></h3>
        <p class="muted">Published: ${escapeHtml(formatDate(issue.publishedAt))}</p>
        <p>${escapeHtml(issue.excerpt)}</p>
      </article>
    `;
  }

  async function loadIssues() {
    try {
      const response = await fetch(`${dataUrl}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Unable to load Beehiiv data (${response.status})`);
      }

      const payload = await response.json();
      const issues = Array.isArray(payload?.issues) ? payload.issues : [];
      if (!issues.length) {
        setStatus('Beehiiv archive is waiting for its first sync.');
        return;
      }

      const selectedSlug = new URLSearchParams(window.location.search).get('issue');
      const selectedIssue = issues.find((issue) => issue.slug === selectedSlug) || issues[0];

      homeContainers.forEach((container) => {
        container.innerHTML = renderHomeIssue(issues[0]);
      });

      latestIssueContainers.forEach((container) => {
        container.innerHTML = renderLatestIssue(selectedIssue);
      });

      archiveContainers.forEach((container) => {
        container.innerHTML = issues.map((issue) => renderArchiveCard(issue, selectedIssue.slug)).join('');
      });

      const updatedDate = payload?.updatedAt ? formatDate(payload.updatedAt) : 'recently';
      setStatus(`Auto-synced from Beehiiv. Last refresh: ${updatedDate}.`);
    } catch (_error) {
      setStatus('Showing fallback newsletter content until the Beehiiv sync completes.');
    }
  }

  loadIssues();
})();
