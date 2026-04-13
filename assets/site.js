(function () {
  const BEEHIIV_NEWSLETTER_URL = 'https://easterling-ms-newsletter.beehiiv.com/p/building-quietly';
  const BEEHIIV_SUBSCRIBE_URL = 'https://easterling-ms-newsletter.beehiiv.com/subscribe';
  const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@NagiKumoChillFi';
  const YOUTUBE_CHANNEL_ID = 'UCNhXHBT6Efo1xEjIGKgPNKw';
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
        setStatus('Latest uploads pulled automatically from YouTube.');
        return;
      }

      setStatus('No public YouTube uploads are available yet. New videos will appear here automatically.');
    } catch (_error) {
      setStatus('Latest uploads could not be loaded right now. Visit the YouTube channel directly.');
    }
  }

  async function loadYouTubeVideos() {
    try {
      const response = await fetch('/api/youtube-feed', {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const payload = await response.json();
      return Array.isArray(payload?.videos) ? payload.videos.slice(0, 6) : [];
    } catch (_error) {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
      const fallbackUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
      const response = await fetch(fallbackUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Fallback request failed: ${response.status}`);
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];

      return items
        .map((item) => {
          const title = item?.title?.trim() || 'Untitled video';
          const link = item?.link || `${YOUTUBE_CHANNEL_URL}/videos`;
          const published = item?.pubDate || '';
          const author = item?.author || payload?.feed?.author || 'NagiKumoChillFi';
          const videoId = extractYouTubeVideoId(link);

          return {
            title,
            videoId,
            published,
            link,
            author,
          };
        })
        .filter((video) => video.videoId && video.link)
        .slice(0, 6);
    }
  }

  function extractYouTubeVideoId(url) {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('v') || '';
    } catch {
      return '';
    }
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

  initIntersectionReveals();
  wireBeehiivNewsletterSignups();
  updateBeehiivSubscriberCount();
  updateYouTubeVideos();

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
