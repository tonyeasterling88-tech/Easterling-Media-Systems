export function cardsPerView(viewportWidth) {
  if (viewportWidth <= 640) return 1;
  if (viewportWidth <= 980) return 2;
  return 4;
}

export function nextScrollPosition(current, direction, step, maximum) {
  return Math.max(0, Math.min(maximum, current + direction * step));
}

export function initEpisodeCarousels(root = document) {
  root.querySelectorAll('[data-episode-carousel]').forEach(() => {});
}

if (typeof document !== 'undefined') {
  initEpisodeCarousels();
}
