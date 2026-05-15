import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createVisitorState,
  normalizeVisitMetrics,
} from '../assets/visitor-count-core.js';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

test('normalizes visit metrics without negative other visits', () => {
  assert.deepEqual(normalizeVisitMetrics(3, 5), {
    totalVisits: 3,
    visitorVisits: 5,
    otherVisits: 0,
  });
});

test('adds known prior visits to tracked visits', () => {
  assert.deepEqual(normalizeVisitMetrics(2, 1, 15), {
    totalVisits: 17,
    visitorVisits: 1,
    otherVisits: 16,
  });
});

test('creates and increments local visitor state', () => {
  const storage = createMemoryStorage();
  const state = createVisitorState(storage, () => 'visitor-123');

  assert.equal(state.visitorId, 'visitor-123');
  assert.equal(state.visitorVisits, 1);
  assert.equal(storage.getItem('ems.visitor.id'), 'visitor-123');
  assert.equal(storage.getItem('ems.visitor.visits'), '1');
});

test('reuses existing local visitor state on later visits', () => {
  const storage = createMemoryStorage({
    'ems.visitor.id': 'visitor-abc',
    'ems.visitor.visits': '2',
  });

  const state = createVisitorState(storage, () => 'visitor-new');

  assert.equal(state.visitorId, 'visitor-abc');
  assert.equal(state.visitorVisits, 3);
  assert.equal(storage.getItem('ems.visitor.visits'), '3');
});
