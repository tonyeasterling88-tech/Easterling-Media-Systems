export const VISITOR_ID_KEY = 'ems.visitor.id';
export const VISITOR_VISITS_KEY = 'ems.visitor.visits';

export function normalizeVisitMetrics(totalVisits, visitorVisits, knownPriorVisits = 0) {
  const normalizedTotal = normalizeCount(totalVisits);
  const normalizedVisitor = normalizeCount(visitorVisits);
  const normalizedPrior = normalizeCount(knownPriorVisits);
  const combinedTotal = normalizedTotal + normalizedPrior;

  return {
    totalVisits: combinedTotal,
    visitorVisits: normalizedVisitor,
    otherVisits: Math.max(combinedTotal - normalizedVisitor, 0),
  };
}

export function createVisitorState(storage, createId = createRandomVisitorId) {
  const visitorId = getStoredValue(storage, VISITOR_ID_KEY) || createId();
  const previousVisits = normalizeCount(getStoredValue(storage, VISITOR_VISITS_KEY));
  const visitorVisits = previousVisits + 1;

  setStoredValue(storage, VISITOR_ID_KEY, visitorId);
  setStoredValue(storage, VISITOR_VISITS_KEY, String(visitorVisits));

  return {
    visitorId,
    visitorVisits,
  };
}

export function createRandomVisitorId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  return `visitor-${Date.now().toString(36)}-${random}`;
}

function normalizeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

function getStoredValue(storage, key) {
  try {
    return storage?.getItem(key) || '';
  } catch (_error) {
    return '';
  }
}

function setStoredValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch (_error) {
    // Storage can be unavailable in private browsing modes.
  }
}
