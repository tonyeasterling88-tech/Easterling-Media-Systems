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
      const matchesTag = tag === 'all' || card.dataset.tags === tag;
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

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
