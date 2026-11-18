// login.js – Handles login modal behavior and authentication
(function() {
  const modal = document.getElementById('login-modal');
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorSpans = modal.querySelectorAll('.error');

  // Show modal (called by fetch interceptor on 401)
  window.openLoginModal = function() {
    modal.setAttribute('aria-hidden', 'false');
    emailInput.focus();
  };

  // Hide modal after successful login
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

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErrors();
    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const err = await response.json();
        displayError(0, err.message || 'Credenciales inválidas');
        return;
      }
      const data = await response.json();
      if (data.token) localStorage.setItem('tavo_auth_token', data.token);
      if (data.csrf_token) localStorage.setItem('tavo_csrf_token', data.csrf_token);
      // Notify app that login succeeded – existing initAuth loads user data
      if (typeof initAuth === 'function') initAuth();
      closeModal();
    } catch (ex) {
      console.error('Login error', ex);
      displayError(0, 'Error de red. Intente nuevamente.');
    }
  });
})();
