/**
 * SSE (Server-Sent Events) system for real-time updates
 * Emits events when data changes, connected clients auto-refresh
 */
const EventEmitter = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

// Connected SSE clients
const clients = new Set();

// Import push notification handler (lazy loaded to avoid circular deps)
let sendPushToAll = null;
try {
  sendPushToAll = require('../routes/push').sendPushToAll;
} catch (e) {
  // Push module not available, continue without push notifications
}

/**
 * Emit an event to all connected clients (SSE + Push)
 * @param {string} type - Event type (kanban, content, channel, project, pages)
 * @param {object} data - Event payload
 */
function emit(type, data = {}) {
  const event = { type, data, timestamp: Date.now() };
  const msg = `data: ${JSON.stringify(event)}\n\n`;
  
  // Send to SSE clients
  for (const client of clients) {
    try {
      client.write(msg);
    } catch {
      clients.delete(client);
    }
  }
  
  // Send push notification (async, non-blocking)
  if (sendPushToAll) {
    const pushPayload = createPushPayload(type, data);
    if (pushPayload) {
      sendPushToAll(pushPayload).catch(error => {
        console.error('Push notification error:', error);
      });
    }
  }
}

/**
 * Create push notification payload from SSE event
 * @param {string} type - Event type
 * @param {object} data - Event data
 * @returns {object|null} Push payload or null to skip
 */
function createPushPayload(type, data) {
  switch (type) {
    case 'kanban': {
      const { action, card, cardId } = data;
      if (action === 'created') {
        return {
          title: 'Neuer Task',
          body: card?.title || 'Ein Task wurde erstellt',
          tag: `kanban-${card?.id}`,
          data: { type, action, cardId: card?.id }
        };
      } else if (action === 'updated') {
        const status = card?.column_name;
        const label = status === 'done' ? '✅ Erledigt' : 
                     status === 'in-progress' ? '🔄 In Arbeit' : 
                     status || 'Aktualisiert';
        return {
          title: `Task: ${label}`,
          body: card?.title || '',
          tag: `kanban-${card?.id}`,
          data: { type, action, cardId: card?.id }
        };
      } else if (action === 'deleted') {
        return {
          title: 'Task gelöscht',
          body: `Task #${cardId} wurde entfernt`,
          tag: `kanban-${cardId}`,
          data: { type, action, cardId }
        };
      }
      break;
    }
    case 'content': {
      const { action, file } = data;
      if (action === 'uploaded') {
        return {
          title: 'Neue Datei',
          body: file?.filename || 'Eine Datei wurde hochgeladen',
          tag: `content-${file?.id}`,
          data: { type, action, fileId: file?.id }
        };
      } else if (action === 'updated') {
        return {
          title: 'Datei aktualisiert',
          body: file?.filename || '',
          tag: `content-${file?.id}`,
          data: { type, action, fileId: file?.id }
        };
      }
      break;
    }
    case 'pages': {
      const { action, domain, path } = data;
      const label = action === 'created' ? 'Neue Datei' : 
                   action === 'updated' ? 'Datei aktualisiert' : 
                   'Datei gelöscht';
      return {
        title: `Webapps: ${label}`,
        body: `${domain}/${path || ''}`,
        tag: `pages-${domain}-${path}`,
        data: { type, action, domain, path }
      };
    }
    case 'channel': {
      const { action } = data;
      if (action === 'agent_reply') {
        return {
          title: 'Neue Antwort',
          body: 'Der Agent hat geantwortet',
          tag: `channel-${data.conversationId}`,
          data: { type, action, conversationId: data.conversationId }
        };
      } else if (action === 'message' && data.message?.author === 'agent') {
        return {
          title: 'Neue Nachricht',
          body: data.message.text?.slice(0, 100) || '',
          tag: `channel-${data.conversationId}`,
          data: { type, action, conversationId: data.conversationId }
        };
      }
      break;
    }
  }
  
  return null; // Skip push for this event
}

/**
 * Express middleware: SSE endpoint
 * GET /api/events
 */
function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  
  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 30000);
  
  clients.add(res);
  
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

module.exports = { emit, sseHandler, bus };
