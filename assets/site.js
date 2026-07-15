(function () {
  const search = document.querySelector('#post-search');
  const tagFilter = document.querySelector('#tag-filter');
  const cards = Array.from(document.querySelectorAll('article.card[data-tags]'));

  function markActiveNavLink() {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const activeTargets = currentPage === 'index.html' ? ['index.html', ''] : [currentPage];

    document.querySelectorAll('nav a[href]').forEach((link) => {
      const hrefPage = (link.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (!activeTargets.includes(hrefPage)) return;
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    });
  }

  function applyFilters() {
    if (!cards.length) return;
    const q = (search?.value || '').toLowerCase();
    const tag = tagFilter?.value || 'all';
    cards.forEach((card) => {
      const txt = card.textContent.toLowerCase();
      const matchesText = !q || txt.includes(q);
      const tags = (card.dataset.tags || '')
        .split(/\s+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const matchesTag = tag === 'all' || tags.includes(tag);
      card.style.display = matchesText && matchesTag ? '' : 'none';
    });
  }

  search?.addEventListener('input', applyFilters);
  tagFilter?.addEventListener('change', applyFilters);

  function wireBuildFilters() {
    const filterRoot = document.querySelector('[data-build-filter]');
    const buildCards = Array.from(document.querySelectorAll('.archive-card[data-status]'));
    if (!filterRoot || !buildCards.length) return;

    const buttons = Array.from(filterRoot.querySelectorAll('[data-filter]'));
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const filter = button.dataset.filter || 'All';
        buttons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
        buildCards.forEach((card) => {
          const matches = filter === 'All' || card.dataset.status === filter;
          card.classList.toggle('is-hidden', !matches);
        });
      });
    });
  }

  async function updateYouTubeVideos() {
    const container = document.querySelector('[data-youtube-feed]');
    if (!container) return;

    const status = document.querySelector('[data-youtube-feed-status]');
    const setStatus = (text) => {
      if (status) {
        status.textContent = text;
      }
    };

    try {
      const videos = await loadYouTubeVideos();
      if (videos.length) {
        container.innerHTML = videos.map(renderVideoCard).join('');
        setStatus('Latest uploads synced from YouTube.');
        return;
      }

      setStatus('No public YouTube uploads are available yet. New videos will appear here automatically.');
    } catch (_error) {
      setStatus('Latest uploads could not be loaded right now. Visit the YouTube channel directly.');
    }
  }

  async function loadYouTubeVideos() {
    try {
      // 1. Try to fetch from the live Vercel API endpoint
      const response = await fetch(`/api/youtube?v=${Date.now()}`, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload?.videos)) {
          return payload.videos.slice(0, 6);
        }
      }
    } catch (apiErr) {
      console.warn('Live API fetch failed, falling back to local static JSON:', apiErr.message);
    }

    // 2. Fallback: load the local static JSON mock
    const response = await fetch(`assets/youtube-videos.json?v=${Date.now()}`, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Fallback request failed: ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.videos) ? payload.videos.slice(0, 6) : [];
  }

  function renderVideoCard(video) {
    const publishedLabel = formatDate(video.published);
    const thumbnail = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

    return `
      <article class="card">
        <a href="${escapeHtml(video.link)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(video.title)} thumbnail" loading="lazy" />
        </a>
        <h3><a href="${escapeHtml(video.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(video.title)}</a></h3>
        <p class="muted">YouTube | ${escapeHtml(video.author)}</p>
        <p class="muted">${escapeHtml(publishedLabel)}</p>
      </article>
    `;
  }

  function formatDate(value) {
    if (!value) {
      return 'Recently published';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Recently published';
    }

    return `Published: ${parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initIntersectionReveals() {
    const revealTargets = Array.from(
      new Set([
        ...document.querySelectorAll('main > section'),
        ...document.querySelectorAll('main .card'),
        ...document.querySelectorAll('main .cta-row'),
      ])
    );

    if (!revealTargets.length) return;

    revealTargets.forEach((el, index) => {
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', `${(index % 8) * 70}ms`);
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealTargets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    );

    revealTargets.forEach((el) => observer.observe(el));
  }

  // initIntersectionReveals();
  markActiveNavLink();
  wireBuildFilters();
  updateYouTubeVideos();
  import('./visitor-count.js').catch(() => {});

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
