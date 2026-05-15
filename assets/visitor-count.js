import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js';

import { firebaseConfig } from './firebase-config.js';
import { createVisitorState, normalizeVisitMetrics } from './visitor-count-core.js';

const TOTAL_VISITS_PATH = 'site_metrics/visits/total';
const KNOWN_PRIOR_VISITS = 15;

initVisitorCount();

async function initVisitorCount() {
  const totalTargets = Array.from(document.querySelectorAll('[data-site-total-visits]'));
  const visitorTargets = Array.from(document.querySelectorAll('[data-site-your-visits]'));
  const otherTargets = Array.from(document.querySelectorAll('[data-site-other-visits]'));

  const visitorState = createVisitorState(window.localStorage);
  renderMetrics({ totalVisits: 0, visitorVisits: visitorState.visitorVisits });

  try {
    const app = initializeApp(firebaseConfig, 'visitor-count');
    const totalRef = ref(getDatabase(app), TOTAL_VISITS_PATH);

    await runTransaction(totalRef, (currentTotal) => {
      const numericTotal = Number(currentTotal);
      return Number.isFinite(numericTotal) && numericTotal >= 0 ? numericTotal + 1 : 1;
    });

    onValue(totalRef, (snapshot) => {
      renderMetrics({
        totalVisits: snapshot.val(),
        visitorVisits: visitorState.visitorVisits,
      });
    });
  } catch (_error) {
    setText(totalTargets, 'Unavailable');
    renderMetrics({ totalVisits: visitorState.visitorVisits, visitorVisits: visitorState.visitorVisits });
  }

  function renderMetrics(metrics) {
    const normalized = normalizeVisitMetrics(metrics.totalVisits, metrics.visitorVisits, KNOWN_PRIOR_VISITS);
    setText(totalTargets, formatCount(normalized.totalVisits));
    setText(visitorTargets, formatCount(normalized.visitorVisits));
    setText(otherTargets, formatCount(normalized.otherVisits));
  }
}

function setText(targets, text) {
  targets.forEach((target) => {
    target.textContent = text;
  });
}

function formatCount(value) {
  return Number(value).toLocaleString();
}
