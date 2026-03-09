export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (response.status === 204) {
    return { ok: true, data: null, status: response.status };
  }

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data, status: response.status };
}
