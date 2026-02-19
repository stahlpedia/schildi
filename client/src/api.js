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
  createDomain: (name) => api('/pages/domains', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteDomain: (name) => api(`/pages/domains/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  files: (domain) => api(`/pages/domains/${encodeURIComponent(domain)}/files`),
  readFile: (domain, path) => api(`/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(path)}`),
  createFile: (domain, path, content) => api(`/pages/domains/${encodeURIComponent(domain)}/files`, { method: 'POST', body: JSON.stringify({ path, content }) }),
  updateFile: (domain, filePath, content) => api(`/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(filePath)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteFile: (domain, path) => api(`/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(path)}`, { method: 'DELETE' }),
};

export const chatChannels = {
  list: () => api('/channel/chat-channels'),
  create: (data) => api('/channel/chat-channels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/channel/chat-channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/channel/chat-channels/${id}`, { method: 'DELETE' }),
  models: () => api('/channel/models'),
};

export const channel = {
  conversations: (channelId) => api(`/channel/conversations${channelId ? `?channel_id=${channelId}` : ''}`),
  createConversation: (title, channel_id) => api('/channel/conversations', { method: 'POST', body: JSON.stringify({ title, channel_id }) }),
  messages: (convoId) => api(`/channel/conversations/${convoId}/messages`),
  sendMessage: (convoId, author, text, task_ref) => api(`/channel/conversations/${convoId}/messages`, { method: 'POST', body: JSON.stringify({ author, text, task_ref }) }),
  unanswered: () => api('/channel/unanswered'),
  deleteConversation: (id) => api(`/channel/conversations/${id}`, { method: 'DELETE' }),
  editMessage: (msgId, text) => api(`/channel/messages/${msgId}`, { method: 'PUT', body: JSON.stringify({ text }) }),
  deleteMessage: (msgId) => api(`/channel/messages/${msgId}`, { method: 'DELETE' }),
  agentUnread: () => api('/channel/agent-unread'),
  markAgentRead: (convoId) => api(`/channel/conversations/${convoId}/agent-read`, { method: 'POST' }),
};

export const attachments = {
  list: (entityType, entityId) => api(`/attachments?entity_type=${entityType}&entity_id=${entityId}`),
  upload: async (file, entityType, entityId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);
    
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/attachments/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  download: (id) => `${BASE}/attachments/${id}`,
  remove: (id) => api(`/attachments/${id}`, { method: 'DELETE' }),
};
