import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  getDatabase,
  ref,
  serverTimestamp,
  set,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const SIGNUPS_PATH = 'closed_test_signups';
const ALLOWED_SOURCES = new Set(['home', 'blog', 'newsletter', 'mindmark']);
const TESTER_GROUP_URL = 'https://groups.google.com/g/mindmark-closed-testers';
const PLAY_OPT_IN_URL = 'https://play.google.com/apps/testing/com.tonyeasterling88.mindmark';

const forms = Array.from(document.querySelectorAll('[data-closed-test-form]'));

if (forms.length) {
  const firebaseReady = isFirebaseConfigured(firebaseConfig);
  const db = firebaseReady ? getDatabase(initializeApp(firebaseConfig)) : null;

  forms.forEach((form) => {
    if (!firebaseReady) {
      setStatus(form, 'Add your Firebase config in assets/firebase-config.js before collecting signups.', 'error');
    }

    form.addEventListener('submit', (event) => {
      void handleSubmit(event, db);
    });
  });
}

function isFirebaseConfigured(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const requiredKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
  return requiredKeys.every((key) => {
    const value = String(config[key] || '').trim();
    return value && !value.startsWith('replace-me');
  });
}

function normalize(value) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emailKey(value) {
  return window
    .btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function setStatus(form, message, tone) {
  const status = form.querySelector('[data-closed-test-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = tone || 'info';
}

function showSuccessState(form, message) {
  const container = findClosedTestContainer(form);
  const success = container?.querySelector('[data-closed-test-success]');
  setStatus(form, message, 'success');

  if (!success) {
    return;
  }

  const text = success.querySelector('[data-closed-test-success-message]');
  if (text) {
    text.textContent = message;
  }

  ensureTesterActions(success);
  success.hidden = false;
  success.removeAttribute('hidden');
  form.hidden = true;
  success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ensureTesterActions(success) {
  if (success.querySelector('[data-closed-test-actions]')) {
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'tester-actions';
  actions.dataset.closedTestActions = '';

  const groupLink = document.createElement('a');
  groupLink.className = 'btn primary';
  groupLink.href = TESTER_GROUP_URL;
  groupLink.target = '_blank';
  groupLink.rel = 'noopener noreferrer';
  groupLink.textContent = 'Join Google Group';

  const playLink = document.createElement('a');
  playLink.className = 'btn';
  playLink.href = PLAY_OPT_IN_URL;
  playLink.target = '_blank';
  playLink.rel = 'noopener noreferrer';
  playLink.textContent = 'Open Play Test';

  actions.append(groupLink, playLink);

  const helper = document.createElement('p');
  helper.className = 'muted tester-actions-note';
  helper.textContent = 'Use the same Google account for both steps. Join the group first, then open the Play test link to opt in.';

  success.append(actions, helper);
}

function findClosedTestContainer(form) {
  return (
    form.closest('.signup-panel') ||
    form.closest('.beta-band') ||
    form.parentElement
  );
}

async function handleSubmit(event, db) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
  const source = ALLOWED_SOURCES.has(form.dataset.sourcePage) ? form.dataset.sourcePage : 'home';
  const emailInput = form.querySelector('[name="email"]');
  const consentInput = form.querySelector('[name="consent_marketing"]');
  const email = normalizeEmail(emailInput?.value);
  const name = normalize(form.querySelector('[name="name"]')?.value);
  const deviceType = normalize(form.querySelector('[name="device_type"]')?.value);
  const phoneModel = normalize(form.querySelector('[name="phone_model"]')?.value);
  const heardAbout = normalize(form.querySelector('[name="heard_about"]')?.value);
  const consentMarketing = Boolean(consentInput?.checked);

  if (!db) {
    setStatus(form, 'Firebase is not configured yet. Add your project settings and try again.', 'error');
    return;
  }

  if (!email || !isValidEmail(email)) {
    setStatus(form, 'Enter a valid Google account email for Android closed testing.', 'error');
    emailInput?.focus();
    return;
  }

  if (!consentMarketing) {
    setStatus(form, 'Please agree to receive MindMark closed testing updates before submitting.', 'error');
    consentInput?.focus();
    return;
  }

  setStatus(form, 'Saving your request for early access...', 'info');

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const key = emailKey(email);

    await set(ref(db, `${SIGNUPS_PATH}/${key}`), {
      email,
      email_key: key,
      name,
      device_type: deviceType,
      phone_model: phoneModel,
      heard_about: heardAbout,
      source,
      consent_marketing: consentMarketing,
      user_agent: window.navigator.userAgent,
      created_at: serverTimestamp(),
    });

    showSuccessState(form, 'Thanks for signing up. Join the Google Group with this same account, then open the Play test link to opt in for MindMark.');
  } catch (error) {
    const errorCode = normalizeErrorCode(error);
    const duplicate = isPermissionDenied(errorCode);
    if (duplicate) {
      showSuccessState(form, 'Thanks for signing up. You are already on the list. Join the Google Group with this same account, then open the Play test link to opt in for MindMark.');
      return;
    }

    console.error('Closed testing signup failed.', {
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown Firebase error',
      source,
      email,
    });

    const friendlyMessage =
      isPermissionDenied(errorCode)
        ? 'There was a problem saving your request. Firebase rejected the write, which usually means the Realtime Database rules need attention.'
        : errorCode === 'network-request-failed'
          || errorCode === 'network_request_failed'
          ? 'There was a problem reaching Firebase. Check your connection and try again.'
          : `There was a problem saving your request. Reference: ${errorCode}.`;

    setStatus(form, friendlyMessage, 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function normalizeErrorCode(error) {
  const code = String(error?.code || '').trim();
  if (!code) {
    return 'unknown';
  }

  const normalized = code.startsWith('database/') ? code.slice('database/'.length) : code;
  return normalized.trim().toLowerCase();
}

function isPermissionDenied(code) {
  return code === 'permission-denied' || code === 'permission_denied';
}
