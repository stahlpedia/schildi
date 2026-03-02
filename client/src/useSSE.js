import { useEffect, useRef, useCallback } from 'react';

/**
 * SSE hook for real-time dashboard updates
 * Connects to /api/events, parses events, calls handlers
 * Auto-reconnects on disconnect
 */
export function useSSE(onEvent) {
  const esRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // EventSource doesn't support custom headers, so we use query param
    // But our SSE endpoint uses authenticate middleware which reads Authorization header
    // We'll use a fetch-based approach instead
    const controller = new AbortController();
    
    fetch('/api/events', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal,
    }).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // Reconnect after 3s
            reconnectTimer.current = setTimeout(connect, 3000);
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type !== 'connected') {
                  onEventRef.current(event);
                }
              } catch {}
            }
          }
          read();
        }).catch(() => {
          reconnectTimer.current = setTimeout(connect, 3000);
        });
      }
      read();
    }).catch(() => {
      reconnectTimer.current = setTimeout(connect, 5000);
    });

    esRef.current = controller;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) esRef.current.abort();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}

/**
 * Request browser notification permission
 */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * Show a browser notification
 */
export function showNotification(title, body, options = {}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/api/admin/branding/logo',
      badge: '/api/admin/branding/logo',
      tag: options.tag || 'schildi-dashboard',
      ...options,
    });
    if (options.onClick) {
      n.onclick = options.onClick;
    }
    // Auto-close after 8s
    setTimeout(() => n.close(), 8000);
    return n;
  }
}
