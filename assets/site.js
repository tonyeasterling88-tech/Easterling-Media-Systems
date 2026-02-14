(function () {
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

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
