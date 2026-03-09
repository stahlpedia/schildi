const output = document.getElementById('output');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function show(data) {
  output.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function callApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (response.status === 204) {
    return { ok: true, data: null };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, data };
  }

  return { ok: true, data };
}

function body() {
  return {
    email: emailInput.value.trim(),
    password: passwordInput.value
  };
}

document.getElementById('register-btn').addEventListener('click', async () => {
  const res = await callApi('/api/auth/register', { method: 'POST', body: JSON.stringify(body()) });
  show(res);
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const res = await callApi('/api/auth/login', { method: 'POST', body: JSON.stringify(body()) });
  show(res);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  const res = await callApi('/api/auth/logout', { method: 'POST' });
  show(res);
});

document.getElementById('me-btn').addEventListener('click', async () => {
  const res = await callApi('/api/auth/me');
  show(res);
});

document.getElementById('protected-btn').addEventListener('click', async () => {
  const res = await callApi('/api/protected');
  show(res);
});
