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

// Projects API
export const projects = {
  list: () => api('/projects'),
  get: (id) => api('/projects/' + id),
  create: (data) => api('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api('/projects/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api('/projects/' + id, { method: 'DELETE' }),
};

// Project-scoped helpers
export const projectBoards = (pid) => api('/projects/' + pid + '/boards');
export const projectCalendar = (pid, month) => api('/projects/' + pid + '/calendar?month=' + month);

// Kanban (backward-compat, global endpoints)
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

// Project-scoped pages
export const projectPages = {
  domains: (pid) => api(`/projects/${pid}/pages/domains`),
  createDomain: (pid, name) => api(`/projects/${pid}/pages/domains`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteDomain: (pid, name) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  files: (pid, domain) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(domain)}/files`),
  readFile: (pid, domain, path) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(path)}`),
  createFile: (pid, domain, path, content) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(domain)}/files`, { method: 'POST', body: JSON.stringify({ path, content }) }),
  updateFile: (pid, domain, filePath, content) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(filePath)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteFile: (pid, domain, path) => api(`/projects/${pid}/pages/domains/${encodeURIComponent(domain)}/files/${encodeURIComponent(path)}`, { method: 'DELETE' }),
  addMedia: (pid, pageId, mediaFileId) => api(`/projects/${pid}/pages/${pageId}/media`, { method: 'POST', body: JSON.stringify({ media_file_id: mediaFileId }) }),
  removeMedia: (pid, pageId, mediaId) => api(`/projects/${pid}/pages/${pageId}/media/${mediaId}`, { method: 'DELETE' }),
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

export const admin = {
  changePassword: (oldPassword, newPassword) => api('/admin/password', { 
    method: 'PUT', 
    body: JSON.stringify({ oldPassword, newPassword }) 
  }),
  systemInfo: () => api('/admin/system-info'),
  backupDb: () => `${BASE}/admin/backup/db`,
  backupWorkspace: () => `${BASE}/admin/backup/workspace`,
  backupAttachments: () => `${BASE}/admin/backup/attachments`,
  restoreDb: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/admin/restore/db`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  restoreWorkspace: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/admin/restore/workspace`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  branding: () => api('/admin/branding'),
  updateBranding: (data) => api('/admin/branding', { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: async (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/admin/branding/logo`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  deleteLogo: () => api('/admin/branding/logo', { method: 'DELETE' }),
};

// Media (deprecated - use context instead)
export const media = {
  folders: () => api('/media/folders'),
  createFolder: (data) => api('/media/folders', { method: 'POST', body: JSON.stringify(data) }),
  updateFolder: (id, data) => api(`/media/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFolder: (id, confirm = false) => api(`/media/folders/${id}?confirm=${confirm}`, { method: 'DELETE' }),
  files: (params) => {
    const queryString = new URLSearchParams();
    Object.keys(params || {}).forEach(key => {
      if (params[key] !== undefined && params[key] !== '') queryString.append(key, params[key]);
    });
    return api(`/media/files${queryString.toString() ? '?' + queryString.toString() : ''}`);
  },
  upload: async (file, folderId, tags = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('tags', JSON.stringify(tags));
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/media/files/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  updateFile: (id, data) => api(`/media/files/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFile: (id) => api(`/media/files/${id}`, { method: 'DELETE' }),
  serve: (id) => `${BASE}/media/files/${id}/serve`,
};

// Context API (project-scoped media, replaces media for project contexts)
export const context = {
  folders: (pid) => api(`/projects/${pid}/context/folders`),
  createFolder: (pid, data) => api(`/projects/${pid}/context/folders`, { method: 'POST', body: JSON.stringify(data) }),
  updateFolder: (pid, id, data) => api(`/projects/${pid}/context/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFolder: (pid, id, confirm = false) => api(`/projects/${pid}/context/folders/${id}?confirm=${confirm}`, { method: 'DELETE' }),
  files: (pid, params) => {
    const queryString = new URLSearchParams();
    Object.keys(params || {}).forEach(key => {
      if (params[key] !== undefined && params[key] !== '') queryString.append(key, params[key]);
    });
    return api(`/projects/${pid}/context/files${queryString.toString() ? '?' + queryString.toString() : ''}`);
  },
  upload: async (pid, file, folderId, tags = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('tags', JSON.stringify(tags));
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/projects/${pid}/context/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.status === 401) { logout(); window.location.reload(); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  updateFile: (pid, id, data) => api(`/projects/${pid}/context/files/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFile: (pid, id) => api(`/projects/${pid}/context/files/${id}`, { method: 'DELETE' }),
  serve: (id) => `${BASE}/media/file/${id}`,
};

// Social API (project-scoped)
export const social = {
  channels: (pid) => api(`/projects/${pid}/social/channels`),
  createChannel: (pid, data) => api(`/projects/${pid}/social/channels`, { method: 'POST', body: JSON.stringify(data) }),
  updateChannel: (pid, id, data) => api(`/projects/${pid}/social/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChannel: (pid, id) => api(`/projects/${pid}/social/channels/${id}`, { method: 'DELETE' }),
  folders: (pid) => api(`/projects/${pid}/social/folders`),
  createFolder: (pid, data) => api(`/projects/${pid}/social/folders`, { method: 'POST', body: JSON.stringify(data) }),
  updateFolder: (pid, id, data) => api(`/projects/${pid}/social/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFolder: (pid, id) => api(`/projects/${pid}/social/folders/${id}`, { method: 'DELETE' }),
  assets: (pid, folderId) => api(`/projects/${pid}/social/assets${folderId ? '?folder_id=' + folderId : ''}`),
  createAsset: (pid, data) => api(`/projects/${pid}/social/assets`, { method: 'POST', body: JSON.stringify(data) }),
  getAsset: (pid, id) => api(`/projects/${pid}/social/assets/${id}`),
  updateAsset: (pid, id, data) => api(`/projects/${pid}/social/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAsset: (pid, id) => api(`/projects/${pid}/social/assets/${id}`, { method: 'DELETE' }),
  addAssetMedia: (pid, assetId, mediaFileId) => api(`/projects/${pid}/social/assets/${assetId}/media`, { method: 'POST', body: JSON.stringify({ media_file_id: mediaFileId }) }),
  removeAssetMedia: (pid, assetId, mediaId) => api(`/projects/${pid}/social/assets/${assetId}/media/${mediaId}`, { method: 'DELETE' }),
  profile: (pid) => api(`/projects/${pid}/social/profile`),
  updateProfile: (pid, data) => api(`/projects/${pid}/social/profile`, { method: 'PUT', body: JSON.stringify(data) }),
};
