(function () {
  const BEEHIIV_NEWSLETTER_URL = 'https://easterling-ms-newsletter.beehiiv.com/p/building-quietly';
  const BEEHIIV_SUBSCRIBE_URL = 'https://easterling-ms-newsletter.beehiiv.com/subscribe';
  const search = document.querySelector('#post-search');
  const tagFilter = document.querySelector('#tag-filter');
  const cards = Array.from(document.querySelectorAll('article.card[data-tags]'));

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

  function wireBeehiivNewsletterSignups() {
    const forms = Array.from(document.querySelectorAll('form'));
    forms.forEach((form) => {
      const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!submitButton) return;

      const buttonLabel = (submitButton.textContent || submitButton.value || '').toLowerCase();
      if (!buttonLabel.includes('subscribe')) return;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        window.open(BEEHIIV_SUBSCRIBE_URL, '_blank', 'noopener,noreferrer');
      });

      if (submitButton.tagName === 'BUTTON') {
        submitButton.textContent = 'Subscribe on Beehiiv';
      } else {
        submitButton.value = 'Subscribe on Beehiiv';
      }
    });
  }

  async function updateBeehiivSubscriberCount() {
    const targets = Array.from(document.querySelectorAll('[data-beehiiv-subscriber-count]'));
    if (!targets.length) return;

    const setText = (text) => targets.forEach((el) => { el.textContent = text; });
    const normalizeCount = (value) => {
      const parsed = Number(String(value).replace(/[^0-9.]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const extractCount = (html) => {
      const patterns = [
        /([0-9][0-9,\.]*)\s+(?:subscribers|readers)/i,
        /Join\s+([0-9][0-9,\.]*)\+?/i,
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) return match[1];
      }
      return null;
    };

    const sources = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(BEEHIIV_NEWSLETTER_URL)}`,
      `https://r.jina.ai/http://${BEEHIIV_NEWSLETTER_URL.replace(/^https?:\/\//, '')}`,
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source, { method: 'GET' });
        if (!response.ok) continue;
        const html = await response.text();
        const count = extractCount(html);
        if (count) {
          const numericCount = normalizeCount(count);
          if (numericCount !== null && numericCount < 50) {
            setText('Growing Daily');
          } else {
            setText(count);
          }
          return;
        }
      } catch (_err) {
        // Try the next source.
      }
    }

    setText('Growing Daily');
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
  wireBuildFilters();
  wireBeehiivNewsletterSignups();
  updateBeehiivSubscriberCount();
  updateYouTubeVideos();
  import('./visitor-count.js').catch(() => {});

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
