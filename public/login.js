// login.js – robust handling for TAVO Cloud ERP login modal
(function() {
  const modal = document.getElementById('login-modal');
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorSpans = modal.querySelectorAll('.error');

  // Expose globally for fetch interceptor (401 -> show modal)
  window.openLoginModal = function() {
    modal.setAttribute('aria-hidden', 'false');
    emailInput.focus();
  };

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    clearErrors();
  }

  function clearErrors() {
    errorSpans.forEach(span => span.textContent = '');
  }

  function displayError(index, message) {
    if (errorSpans[index]) errorSpans[index].textContent = message;
  }

  async function submitLogin(payload) {
    return await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErrors();
    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };
    try {
      const response = await submitLogin(payload);
      if (!response.ok) {
        // Parse server error (JSON or plain text)
        let msg = 'Credenciales inválidas';
        try {
          const data = await response.json();
          msg = data.message || data.error || data.msg || msg;
        } catch (_) {
          const txt = await response.text();
          if (txt) msg = txt;
        }
        displayError(0, msg);
        return;
      }
      const data = await response.json();
      if (data.token) localStorage.setItem('tavo_auth_token', data.token);
      if (data.csrf_token) localStorage.setItem('tavo_csrf_token', data.csrf_token);
      // Refresh app state after login
      if (typeof initAuth === 'function') initAuth();
      closeModal();
    } catch (ex) {
      console.error('Login error', ex);
      displayError(0, 'Error de red. Intente nuevamente.');
    }
  });
})();
