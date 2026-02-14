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

  // Lightweight analytics placeholder
  window.commandCenterAnalytics = {
    track(eventName, payload = {}) {
      console.log('[analytics]', eventName, payload);
    }
  };
})();
