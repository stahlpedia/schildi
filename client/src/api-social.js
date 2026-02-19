// Social Media API - Separate from main api.js to avoid conflicts

const BASE = '/api';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: headers() });
  if (res.status === 401) { logout(); window.location.reload(); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const socialApi = {
  // Content Profile
  getProfile: () => api('/social/profile'),
  updateProfile: (data) => api('/social/profile', { method: 'PUT', body: JSON.stringify(data) }),
  
  // Posts
  getPosts: (params) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return api(`/social/posts${queryString}`);
  },
  createPost: (data) => api('/social/posts', { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (id, data) => api(`/social/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePost: (id) => api(`/social/posts/${id}`, { method: 'DELETE' }),
  
  // Plan Generation
  generatePlan: (params) => api('/social/generate-plan', { method: 'POST', body: JSON.stringify(params) }),
  
  // PNG Rendering
  renderPreview: async (data) => api('/social/render/preview', { method: 'POST', body: JSON.stringify(data) }),
  renderDownload: async (data) => {
    const response = await fetch(`${BASE}/social/render`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Render error: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `social-${data.template}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
  renderSave: (data) => api('/social/render/save', { method: 'POST', body: JSON.stringify(data) }),
};