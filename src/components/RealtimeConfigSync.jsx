import { useEffect, useRef, useCallback } from 'react';

const RealtimeConfigSync = ({ onConfigUpdate }) => {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 2000;

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // 올바른 포트: 3000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3000/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'config-update' && onConfigUpdate) {
            onConfigUpdate(data.config);
            window.location.reload();
          }
        } catch (error) {
          // 무시
        }
      };

      wsRef.current.onclose = () => {
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };

      wsRef.current.onerror = () => {
        // 무시
      };

    } catch (error) {
      // 무시
    }
  }, [onConfigUpdate]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return null;
};

export default RealtimeConfigSync;
