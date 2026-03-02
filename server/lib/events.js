/**
 * SSE (Server-Sent Events) system for real-time updates
 * Emits events when data changes, connected clients auto-refresh
 */
const EventEmitter = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

// Connected SSE clients
const clients = new Set();

/**
 * Emit an event to all connected clients
 * @param {string} type - Event type (kanban, content, channel, project, pages)
 * @param {object} data - Event payload
 */
function emit(type, data = {}) {
  const event = { type, data, timestamp: Date.now() };
  const msg = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(msg);
    } catch {
      clients.delete(client);
    }
  }
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
