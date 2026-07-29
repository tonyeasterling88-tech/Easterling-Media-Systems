import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  cardsPerView,
  nextScrollPosition,
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

test('Season 1 renders ten ordered cards with four playable previews', async () => {
  const html = await readFile('nagikumo-chillfi.html', 'utf8');
  const cards = [...html.matchAll(/<article class="episode[^"]*"[^>]*data-episode-number="(\d+)"/g)]
    .map((match) => Number(match[1]));

  assert.deepEqual(cards, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal((html.match(/data-episode-preview/g) || []).length, 4);
  assert.equal((html.match(/class="episode unrevealed"/g) || []).length, 6);
});

test('unpublished episode cards contain no playable local video', async () => {
  const html = await readFile('nagikumo-chillfi.html', 'utf8');
  const unpublishedCards = [...html.matchAll(
    /<article class="episode unrevealed"[\s\S]*?<\/article>/g
  )];

  assert.equal(unpublishedCards.length, 6);
  for (const [index, match] of unpublishedCards.entries()) {
    assert.doesNotMatch(
      match[0],
      /<video|\.mp4/,
      `unpublished episode ${index + 5} must not expose a playable preview`
    );
  }
});
