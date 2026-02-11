const BASE = '/api';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login fehlgeschlagen');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  localStorage.setItem('username', data.username);
  return data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
}

export function isLoggedIn() {
  return !!localStorage.getItem('token');
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: headers() });
  if (res.status === 401) { logout(); window.location.reload(); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const kanban = {
  list: (boardId) => api(`/kanban/cards${boardId ? `?board_id=${boardId}` : ''}`),
  create: (card) => api('/kanban/cards', { method: 'POST', body: JSON.stringify(card) }),
  update: (id, data) => api(`/kanban/cards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/kanban/cards/${id}`, { method: 'DELETE' }),
  reorder: (cards) => api('/kanban/cards/reorder', { method: 'PUT', body: JSON.stringify({ cards }) }),
};

export const boards = {
  list: () => api('/kanban/boards'),
  create: (data) => api('/kanban/boards', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/kanban/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/kanban/boards/${id}`, { method: 'DELETE' }),
};

export const columns = {
  list: (boardId) => api(`/kanban/columns${boardId ? `?board_id=${boardId}` : ''}`),
  create: (col) => api('/kanban/columns', { method: 'POST', body: JSON.stringify(col) }),
  update: (id, data) => api(`/kanban/columns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/kanban/columns/${id}`, { method: 'DELETE' }),
};

export const memory = {
  files: () => api('/memory/files'),
  file: (path) => api(`/memory/file?path=${encodeURIComponent(path)}`),
};

export const log = {
  list: (limit = 50) => api(`/log/entries?limit=${limit}`),
  create: (message, category = '') => api('/log/entries', { method: 'POST', body: JSON.stringify({ message, category }) }),
  remove: (id) => api(`/log/entries/${id}`, { method: 'DELETE' }),
};

export const pages = {
  domains: () => api('/pages/domains'),
  createDomain: (data) => api('/pages/domains', { method: 'POST', body: JSON.stringify(data) }),
  updateDomain: (id, data) => api(`/pages/domains/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDomain: (id) => api(`/pages/domains/${id}`, { method: 'DELETE' }),
  listPages: (domainId) => api(`/pages/domains/${domainId}/pages`),
  createPage: (domainId, data) => api(`/pages/domains/${domainId}/pages`, { method: 'POST', body: JSON.stringify(data) }),
  getPage: (domainId, slug) => api(`/pages/domains/${domainId}/pages/${slug}`),
  updatePage: (domainId, slug, data) => api(`/pages/domains/${domainId}/pages/${slug}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePage: (domainId, slug) => api(`/pages/domains/${domainId}/pages/${slug}`, { method: 'DELETE' }),
};

export const channel = {
  conversations: () => api('/channel/conversations'),
  createConversation: (title, author) => api('/channel/conversations', { method: 'POST', body: JSON.stringify({ title, author }) }),
  messages: (convoId) => api(`/channel/conversations/${convoId}/messages`),
  sendMessage: (convoId, author, text, task_ref) => api(`/channel/conversations/${convoId}/messages`, { method: 'POST', body: JSON.stringify({ author, text, task_ref }) }),
  unanswered: () => api('/channel/unanswered'),
  deleteConversation: (id) => api(`/channel/conversations/${id}`, { method: 'DELETE' }),
  editMessage: (msgId, text) => api(`/channel/messages/${msgId}`, { method: 'PUT', body: JSON.stringify({ text }) }),
  deleteMessage: (msgId) => api(`/channel/messages/${msgId}`, { method: 'DELETE' }),
  agentUnread: () => api('/channel/agent-unread'),
  markAgentRead: (convoId) => api(`/channel/conversations/${convoId}/agent-read`, { method: 'POST' }),
};
