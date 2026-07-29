export function cardsPerView(viewportWidth) {
  if (viewportWidth <= 640) return 1;
  if (viewportWidth <= 980) return 2;
  return 4;
}

export function nextScrollPosition(current, direction, step, maximum) {
  return Math.max(0, Math.min(maximum, current + direction * step));
}

export function startEpisodePreview(card, reduceMotion) {
  if (reduceMotion || card.classList.contains('unrevealed')) return false;

  const video = card.querySelector('[data-episode-preview]');
  if (!video) return false;

  video.muted = true;
  card.classList.add('is-previewing');
  const playAttempt = video.play();
  playAttempt?.catch(() => {
    card.classList.remove('is-previewing');
  });
  return true;
}

export function stopEpisodePreview(card) {
  const video = card.querySelector('[data-episode-preview]');
  if (!video) return;

  video.pause();
  video.currentTime = 0;
  card.classList.remove('is-previewing');
}

export function initEpisodeCarousel(
  carousel,
  {
    getStyles = getComputedStyle,
    viewportWindow = window,
  } = {}
) {
  const track = carousel.querySelector('[data-carousel-track]');
  const previous = carousel.querySelector('[data-carousel-prev]');
  const next = carousel.querySelector('[data-carousel-next]');
  if (!track || !previous || !next || !track.firstElementChild) return;

  const reduceMotion = viewportWindow
    .matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  const maximumScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const cardStep = () => {
    const cardWidth = track.firstElementChild.getBoundingClientRect().width;
    const gap = Number.parseFloat(getStyles(track).columnGap) || 0;
    return cardWidth + gap;
  };
  const updateControls = (position = track.scrollLeft) => {
    const maximum = maximumScroll();
    const atStart = position <= 1;
    const atEnd = maximum <= 1 || position >= maximum - 1;

    previous.disabled = atStart;
    previous.setAttribute('aria-disabled', String(atStart));
    next.disabled = atEnd;
    next.setAttribute('aria-disabled', String(atEnd));
  };
  const move = (direction) => {
    const target = nextScrollPosition(
      track.scrollLeft,
      direction,
      cardStep(),
      maximumScroll()
    );
    track.scrollTo({
      left: target,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    updateControls(target);
  };

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', () => updateControls(), { passive: true });
  viewportWindow.addEventListener('resize', () => updateControls(), { passive: true });

  Array.from(track.children).forEach((card) => {
    card.addEventListener('pointerenter', () => {
      startEpisodePreview(card, reduceMotion);
    });
    card.addEventListener('pointerleave', () => {
      stopEpisodePreview(card);
    });
    card.addEventListener('focusin', () => {
      startEpisodePreview(card, reduceMotion);
    });
    card.addEventListener('focusout', (event) => {
      if (!card.contains(event.relatedTarget)) {
        stopEpisodePreview(card);
      }
    });
  });

  if ('IntersectionObserver' in viewportWindow) {
    const observer = new viewportWindow.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) stopEpisodePreview(entry.target);
        });
      },
      { threshold: 0.2 }
    );
    Array.from(track.children).forEach((card) => observer.observe(card));
  }

  updateControls();
}

export function initEpisodeCarousels(root = document) {
  root.querySelectorAll('[data-episode-carousel]').forEach((carousel) => {
    initEpisodeCarousel(carousel);
  });
}

if (typeof document !== 'undefined') {
  initEpisodeCarousels();
}
