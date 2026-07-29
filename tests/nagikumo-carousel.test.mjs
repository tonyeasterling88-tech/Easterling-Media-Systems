import assert from 'node:assert/strict';
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
