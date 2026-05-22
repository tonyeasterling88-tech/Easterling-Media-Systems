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
const TESTER_GROUP_SUBSCRIBE_EMAIL = 'mindmark-closed-testers+subscribe@googlegroups.com';
const PLAY_OPT_IN_URL = 'https://play.google.com/apps/testing/com.tonyeasterling88.mindmark';

const forms = Array.from(document.querySelectorAll('[data-closed-test-form]'));
const contactForm = document.querySelector('.contact-form');
const inquiryForm = document.querySelector('.inquiry-form');

const firebaseReady = isFirebaseConfigured(firebaseConfig);
const db = firebaseReady ? getDatabase(initializeApp(firebaseConfig)) : null;

if (forms.length) {
  forms.forEach((form) => {
    ensureSignupLinks(form);

    if (!firebaseReady) {
      setStatus(form, 'Add your Firebase config in assets/firebase-config.js before collecting signups.', 'error');
    }

    form.addEventListener('submit', (event) => {
      void handleSubmit(event, db);
    });
  });
}

if (contactForm) {
  if (!firebaseReady) {
    setStatus(contactForm, 'Add your Firebase config in assets/firebase-config.js before sending messages.', 'error');
  }
  contactForm.addEventListener('submit', (event) => {
    void handleContactSubmit(event, db);
  });
}

if (inquiryForm) {
  if (!firebaseReady) {
    setStatus(inquiryForm, 'Add your Firebase config in assets/firebase-config.js before submitting inquiries.', 'error');
  }
  inquiryForm.addEventListener('submit', (event) => {
    void handleInquirySubmit(event, db);
  });
}

function ensureSignupLinks(form) {
  if (form.querySelector('[data-closed-test-signup-links]')) {
    return;
  }

  const links = createTesterActions('Join Google Group', 'Open Play Test');
  links.dataset.closedTestSignupLinks = '';

  const helper = document.createElement('p');
  helper.className = 'muted tester-actions-note';
  helper.innerHTML = `The Google Group controls Play testing access. If Google says content is unavailable, sign in or switch accounts, or <a href="mailto:${TESTER_GROUP_SUBSCRIBE_EMAIL}">request access by email</a>.`;

  const target =
    form.querySelector('.signup-actions') ||
    form.querySelector('.cta-row') ||
    form.querySelector('button[type="submit"], input[type="submit"]')?.parentElement ||
    form;

  target.append(links, helper);
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

  const actions = createTesterActions('Join Google Group', 'Open Play Test');
  actions.dataset.closedTestActions = '';

  const helper = document.createElement('p');
  helper.className = 'muted tester-actions-note';
  helper.innerHTML = `Use the same Google account for both steps. If Google says content is unavailable, sign in or switch accounts, or <a href="mailto:${TESTER_GROUP_SUBSCRIBE_EMAIL}">request access by email</a>.`;

  success.append(actions, helper);
}

function createTesterActions(groupLabel, playLabel) {
  const actions = document.createElement('div');
  actions.className = 'tester-actions';

  const groupLink = document.createElement('a');
  groupLink.className = 'btn primary';
  groupLink.href = TESTER_GROUP_URL;
  groupLink.rel = 'noopener noreferrer';
  groupLink.textContent = groupLabel;

  const playLink = document.createElement('a');
  playLink.className = 'btn';
  playLink.href = PLAY_OPT_IN_URL;
  playLink.rel = 'noopener noreferrer';
  playLink.textContent = playLabel;

  actions.append(groupLink, playLink);
  return actions;
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
    const permissionDenied = isPermissionDenied(errorCode);
    
    if (permissionDenied) {
      // In production, permission-denied represents a blocked overwrite (the user is already signed up).
      // We log a detailed warning in case it is actually a database rules misconfiguration during setup.
      console.warn(
        'Closed testing signup: Write permission denied. This is expected if the email is already registered (updates are blocked by security rules), but it can also mean that your Firebase Realtime Database security rules have not been deployed or are rejecting writes globally. Verify your database rules if this is a new setup.',
        { email, error }
      );
      
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
      errorCode === 'network-request-failed' || errorCode === 'network_request_failed'
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

async function sendFormSubmitEmail(recipient, data) {
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn('Email forwarding failed:', text);
    }
  } catch (err) {
    console.error('Failed to forward email:', err);
  }
}

async function handleContactSubmit(event, db) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const nameInput = form.querySelector('[name="name"]') || form.querySelector('input[placeholder="Name"]');
  const emailInput = form.querySelector('[name="email"]') || form.querySelector('input[placeholder="Email"]');
  const messageInput = form.querySelector('[name="message"]') || form.querySelector('textarea');
  
  const name = normalize(nameInput?.value);
  const email = normalizeEmail(emailInput?.value);
  const message = normalize(messageInput?.value);

  if (!email || !isValidEmail(email)) {
    setStatus(form, 'Enter a valid email address.', 'error');
    return;
  }

  setStatus(form, 'Sending message...', 'info');
  if (submitButton) submitButton.disabled = true;

  try {
    // 1. Save to Firebase if configured
    if (db) {
      try {
        const key = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await set(ref(db, `contact_messages/${key}`), {
          name,
          email,
          message,
          user_agent: window.navigator.userAgent,
          created_at: serverTimestamp(),
        });
      } catch (fbErr) {
        console.warn('Firebase logging failed, continuing with email forward:', fbErr);
      }
    } else {
      console.warn('Firebase is not configured yet. Saving to database was skipped, proceeding with email forwarding.');
    }

    // 2. Forward email to site owner via FormSubmit.co
    await sendFormSubmitEmail('tonyeasterlingappsdev@gmail.com', {
      name: name || 'Anonymous',
      email: email,
      message: message || '(No message content)',
      _subject: 'New Contact Message from Easterling Media & Systems',
      _captcha: 'false'
    });

    showContactSuccess(form, 'Thank you! Your message has been sent successfully. We will contact you shortly.');
  } catch (error) {
    console.error('Contact submission failed:', error);
    setStatus(form, 'There was a problem sending your message. Please try again.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleInquirySubmit(event, db) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const nameInput = form.querySelector('[name="name"]') || form.querySelector('input[placeholder="Name"]');
  const emailInput = form.querySelector('[name="email"]') || form.querySelector('input[placeholder="Email"]');
  const companyInput = form.querySelector('[name="company"]') || form.querySelector('input[placeholder="Company"]');
  const messageInput = form.querySelector('[name="message"]') || form.querySelector('textarea');
  
  const name = normalize(nameInput?.value);
  const email = normalizeEmail(emailInput?.value);
  const company = normalize(companyInput?.value);
  const message = normalize(messageInput?.value);

  if (!email || !isValidEmail(email)) {
    setStatus(form, 'Enter a valid email address.', 'error');
    return;
  }

  setStatus(form, 'Submitting inquiry...', 'info');
  if (submitButton) submitButton.disabled = true;

  try {
    // 1. Save to Firebase if configured
    if (db) {
      try {
        const key = `inq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await set(ref(db, `collaboration_inquiries/${key}`), {
          name,
          email,
          company: company || 'N/A',
          message,
          user_agent: window.navigator.userAgent,
          created_at: serverTimestamp(),
        });
      } catch (fbErr) {
        console.warn('Firebase logging failed, continuing with email forward:', fbErr);
      }
    } else {
      console.warn('Firebase is not configured yet. Saving to database was skipped, proceeding with email forwarding.');
    }

    // 2. Forward email to site owner via FormSubmit.co
    await sendFormSubmitEmail('tonyeasterlingappsdev@gmail.com', {
      name: name || 'Anonymous',
      email: email,
      company: company || 'N/A',
      message: message || '(No message content)',
      _subject: 'New Collaboration Inquiry from Easterling Media & Systems',
      _captcha: 'false'
    });

    showContactSuccess(form, 'Thank you! Your collaboration inquiry has been received. We will review it shortly.');
  } catch (error) {
    console.error('Inquiry submission failed:', error);
    setStatus(form, 'There was a problem submitting your inquiry. Please try again.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function showContactSuccess(form, message) {
  const heading = form.parentElement.querySelector('h2');
  if (heading) heading.textContent = 'Submission Received!';
  
  form.innerHTML = `
    <div class="card signup-success" style="margin-top: 0;">
      <h3>Message Sent</h3>
      <p class="muted">${message}</p>
    </div>
  `;
}
