import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  cardsPerView,
  initEpisodeCarousel,
  nextScrollPosition,
  startEpisodePreview,
  stopEpisodePreview,
} from '../assets/episode-carousel.js';

test('cardsPerView selects the approved responsive card count', () => {
  assert.equal(cardsPerView(1200), 4);
  assert.equal(cardsPerView(981), 4);
  assert.equal(cardsPerView(980), 2);
  assert.equal(cardsPerView(641), 2);
  assert.equal(cardsPerView(640), 1);
  assert.equal(cardsPerView(520), 1);
});

test('nextScrollPosition moves one card and clamps at both edges', () => {
  assert.equal(nextScrollPosition(0, 1, 280, 840), 280);
  assert.equal(nextScrollPosition(800, 1, 280, 840), 840);
  assert.equal(nextScrollPosition(20, -1, 280, 840), 0);
});

test('Season 1 renders all ten published episodes with four retained previews', async () => {
  const html = await readFile('nagikumo-chillfi.html', 'utf8');
  const cards = [...html.matchAll(/<article class="episode[^"]*"[^>]*data-episode-number="(\d+)"/g)]
    .map((match) => Number(match[1]));

  assert.deepEqual(cards, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal((html.match(/data-episode-preview/g) || []).length, 4);
  assert.equal((html.match(/data-episode-status>Episode \d{2} \| Published/g) || []).length, 10);
  assert.doesNotMatch(html, /unrevealed|Scheduled|Edit Phase|waits for approval/);
  assert.doesNotMatch(html, /data-youtube-episode=/);
  assert.match(html, /playlist\?list=PLIdSmVfZcc0c/);
});

test('each thumbnail links directly to its matching Season 1 video', async () => {
  const html = await readFile('nagikumo-chillfi.html', 'utf8');
  const videoIds = [
    '7d9_8z2UIx0', 'k3DzZ_SiXeg', 'VrylQev5vNE', 'WbhsPqwAUwQ',
    'VVWWRfpta3Y', 'rroewxEKLNc', 'ek7EYvSudmk', 'xy4Bzncz4Vs',
    'zcNwtI7CpFU', 'uX_RcskS7yI',
  ];
  const cards = [...html.matchAll(/<article class="episode"[\s\S]*?<\/article>/g)];

  assert.equal(cards.length, videoIds.length);
  for (const [index, [card]] of cards.entries()) {
    const videoId = videoIds[index];
    const link = card.match(/<a class="episode-watch"([^>]*)>([\s\S]*?)<\/a>/);
    assert.ok(link, `episode ${index + 1} must have a thumbnail link`);
    assert.ok(link[1].includes(`href="https://www.youtube.com/watch?v=${videoId}"`));
    assert.ok(card.includes(`data-youtube-video-id="${videoId}"`));
    assert.match(link[1], /target="_blank" rel="noopener noreferrer"/);
    assert.match(link[1], /aria-label="Watch Episode \d{2}: [^"]+ on YouTube/);
    const thumbnail = link[2].match(/<img data-episode-thumbnail src="([^"]+)" alt="([^"]+)"/);
    assert.ok(thumbnail, `episode ${index + 1} thumbnail must be inside its link`);
    const image = await readFile(thumbnail[1]);
    assert.equal(image.subarray(0, 2).toString('hex'), 'ffd8');
  }
});

test('published preview starts muted and stops at its poster frame', async () => {
  const classes = new Set();
  const video = {
    currentTime: 3,
    muted: false,
    pauseCalls: 0,
    playCalls: 0,
    pause() {
      this.pauseCalls += 1;
    },
    play() {
      this.playCalls += 1;
      return Promise.resolve();
    },
  };
  const card = {
    classList: {
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name),
      remove: (name) => classes.delete(name),
    },
    querySelector: () => video,
  };

  assert.equal(startEpisodePreview(card, false), true);
  assert.equal(video.muted, true);
  assert.equal(video.playCalls, 1);
  assert.equal(classes.has('is-previewing'), true);

  stopEpisodePreview(card);
  assert.equal(video.pauseCalls, 1);
  assert.equal(video.currentTime, 0);
  assert.equal(classes.has('is-previewing'), false);
});

test('unpublished and reduced-motion cards never play', () => {
  let playCalls = 0;
  const video = {
    play() {
      playCalls += 1;
      return Promise.resolve();
    },
  };
  const unpublishedCard = {
    classList: {
      add() {},
      contains: (name) => name === 'unrevealed',
    },
    querySelector: () => video,
  };
  const publishedCard = {
    classList: {
      add() {},
      contains: () => false,
    },
    querySelector: () => video,
  };

  assert.equal(startEpisodePreview(unpublishedCard, false), false);
  assert.equal(startEpisodePreview(publishedCard, true), false);
  assert.equal(playCalls, 0);
});

test('next arrow scrolls exactly one measured card and updates edge states', () => {
  const listeners = new Map();
  const nextListeners = new Map();
  const previous = {
    attributes: new Map(),
    addEventListener() {},
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
  const next = {
    attributes: new Map(),
    addEventListener(name, listener) {
      nextListeners.set(name, listener);
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
  const track = {
    children: [],
    clientWidth: 500,
    firstElementChild: {
      getBoundingClientRect: () => ({ width: 250 }),
    },
    scrollLeft: 0,
    scrollWidth: 1000,
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    scrollTo(options) {
      this.scrollLeft = options.left;
      this.lastScroll = options;
    },
  };
  const carousel = {
    querySelector(selector) {
      return {
        '[data-carousel-next]': next,
        '[data-carousel-prev]': previous,
        '[data-carousel-track]': track,
      }[selector];
    },
  };
  const viewportWindow = {
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
  };

  initEpisodeCarousel(carousel, {
    getStyles: () => ({ columnGap: '16px' }),
    viewportWindow,
  });
  nextListeners.get('click')();

  assert.deepEqual(track.lastScroll, { behavior: 'smooth', left: 266 });
  assert.equal(previous.disabled, false);
  assert.equal(previous.attributes.get('aria-disabled'), 'false');
});
