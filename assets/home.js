(() => {
  'use strict';

  const queryMedia = (query) => (
    typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : { matches: false }
  );
  const reducedMotion = queryMedia('(prefers-reduced-motion: reduce)');
  const finePointer = queryMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const page = document.body;

  if (!page.classList.contains('home-editorial')) return;

  let revealObserver = null;
  let tiltController = null;

  const resetImage = (image) => {
    image.style.setProperty('--home-image-x', '0px');
    image.style.setProperty('--home-image-y', '0px');
    image.style.setProperty('--home-image-rx', '0deg');
    image.style.setProperty('--home-image-ry', '0deg');
  };

  const stopMotion = () => {
    root.classList.remove('home-motion-ready');
    revealObserver?.disconnect();
    revealObserver = null;
    tiltController?.abort();
    tiltController = null;

    document.querySelectorAll('[data-workshop-image]').forEach(resetImage);
  };

  const startMotion = () => {
    stopMotion();

    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

    const revealItems = Array.from(document.querySelectorAll('[data-reveal]'));
    root.classList.add('home-motion-ready');

    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -9% 0px',
      threshold: 0.12,
    });

    revealItems.forEach((item) => revealObserver.observe(item));

    if (!finePointer.matches) return;

    tiltController = new AbortController();
    const { signal } = tiltController;

    document.querySelectorAll('[data-workshop-image]').forEach((image) => {
      image.addEventListener('pointermove', (event) => {
        const bounds = image.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;

        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;

        image.style.setProperty('--home-image-x', `${(x * 5).toFixed(2)}px`);
        image.style.setProperty('--home-image-y', `${(y * 4).toFixed(2)}px`);
        image.style.setProperty('--home-image-rx', `${(-y * 2.2).toFixed(2)}deg`);
        image.style.setProperty('--home-image-ry', `${(x * 2.8).toFixed(2)}deg`);
      }, { signal });

      image.addEventListener('pointerleave', () => resetImage(image), { signal });
      image.addEventListener('pointercancel', () => resetImage(image), { signal });
    });
  };

  const watchQuery = (query, listener) => {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listener);
    } else if (typeof query.addListener === 'function') {
      query.addListener(listener);
    }
  };

  startMotion();
  watchQuery(reducedMotion, startMotion);
  watchQuery(finePointer, startMotion);
})();
