(function () {
  const SUPABASE_URL = 'https://pouoksgiaribvbnvstsm.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Xj8ynM_AysW2tgNR8IySsA_Y4YmxXWy';
  const TABLE_NAME = 'closed_test_signups';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const forms = Array.from(document.querySelectorAll('[data-closed-test-form]'));
  if (!forms.length) {
    return;
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

  function setStatus(form, message, tone) {
    const status = form.querySelector('[data-closed-test-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = tone || 'info';
  }

  function showSuccessState(form, message) {
    const panel = form.closest('.signup-panel');
    const success = panel?.querySelector('[data-closed-test-success]');
    form.hidden = true;
    if (success) {
      const text = success.querySelector('[data-closed-test-success-message]');
      if (text) {
        text.textContent = message;
      }
      success.hidden = false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    const source = form.dataset.sourcePage || 'unknown';
    const emailInput = form.querySelector('[name="email"]');
    const consentInput = form.querySelector('[name="consent_marketing"]');
    const email = normalizeEmail(emailInput?.value);
    const name = normalize(form.querySelector('[name="name"]')?.value);
    const deviceType = normalize(form.querySelector('[name="device_type"]')?.value);
    const phoneModel = normalize(form.querySelector('[name="phone_model"]')?.value);
    const heardAbout = normalize(form.querySelector('[name="heard_about"]')?.value);
    const consentMarketing = Boolean(consentInput?.checked);

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

    const { error } = await supabase.from(TABLE_NAME).insert({
      email,
      name,
      device_type: deviceType,
      phone_model: phoneModel,
      heard_about: heardAbout,
      source,
      consent_marketing: consentMarketing,
      user_agent: window.navigator.userAgent,
    });

    if (submitButton) {
      submitButton.disabled = false;
    }

    if (error) {
      const duplicate = /duplicate|unique/i.test(error.message || '');
      if (duplicate) {
        showSuccessState(form, 'Thanks for signing up. You are already on the list for MindMark closed testing updates.');
        return;
      }

      setStatus(
        form,
        'There was a problem saving your request. Run the latest Supabase SQL setup and try again.',
        'error'
      );
      return;
    }

    showSuccessState(form, "Thanks for signing up. You're on the list for MindMark closed testing updates.");
  }

  forms.forEach((form) => {
    form.addEventListener('submit', handleSubmit);
  });
})();
