import { useEffect, useState, useRef } from 'react';

/**
 * 🔥 실시간 설정 동기화 컴포넌트 (WebSocket 기반)
 * - WebSocket을 통해 서버와 실시간 연결
 * - Admin이 설정을 변경하면 모든 브라우저/PC의 사용자에게 즉시 반영
 * - Fallback 폴링 시스템으로 안정성 보장
 */
const RealtimeConfigSync = ({ onConfigUpdate, onAdminUpdate }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const pingIntervalRef = useRef(null);

  // WebSocket 연결 함수
  const connectWebSocket = () => {
    try {
      // WebSocket URL 설정 (환경에 따라 조정)
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '3000');
      
      // 로컬 개발환경에서는 8000 포트 사용
      const finalPort = (wsHost === 'localhost' || wsHost === '127.0.0.1') ? '8000' : wsPort;
      const wsUrl = `${wsProtocol}//${wsHost}:${finalPort}`;
      
      console.log('[RealtimeConfigSync] WebSocket 연결 시도:', wsUrl);
      setConnectionStatus('connecting');

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[RealtimeConfigSync] ✅ WebSocket 연결 성공');
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        
        // 연결 상태 확인을 위한 ping 시작
        startPing();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[RealtimeConfigSync] 📨 메시지 수신:', data.type);

          if (data.type === 'CONFIG_SYNC_UPDATE') {
            // 필드 설정 업데이트
            if (data.fieldConfig && onConfigUpdate) {
              console.log('[RealtimeConfigSync] 🔄 필드 설정 동기화');
              onConfigUpdate(data.fieldConfig);
            }

            // Admin 설정 업데이트
            if (data.adminSettings && onAdminUpdate) {
              console.log('[RealtimeConfigSync] 🔄 Admin 설정 동기화');
              onAdminUpdate(data.adminSettings);
            }

            setLastUpdateTime(new Date().toLocaleTimeString());
            console.log('[RealtimeConfigSync] ✅ 설정 동기화 완료');
          }
          else if (data.type === 'SERVER_SHUTDOWN') {
            console.log('[RealtimeConfigSync] 🔴 서버 종료 알림 수신');
            setConnectionStatus('server_shutdown');
          }
          else if (data.type === 'pong') {
            // 서버로부터 pong 응답 (연결 상태 확인)
            console.log('[RealtimeConfigSync] 🏓 pong 수신');
          }
        } catch (error) {
          console.error('[RealtimeConfigSync] ❌ 메시지 처리 오류:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[RealtimeConfigSync] 📴 WebSocket 연결 종료:', event.code, event.reason);
        setConnectionStatus('disconnected');
        stopPing();
        
        // 자동 재연결 시도 (서버 종료가 아닌 경우만)
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[RealtimeConfigSync] 🔄 ${delay}ms 후 재연결 시도 (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else {
          console.warn('[RealtimeConfigSync] ⚠️ 최대 재연결 시도 횟수 초과 또는 정상 종료');
          setConnectionStatus('failed');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[RealtimeConfigSync] ❌ WebSocket 오류:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('[RealtimeConfigSync] ❌ WebSocket 연결 생성 오류:', error);
      setConnectionStatus('error');
    }
  };

  // 연결 상태 확인을 위한 ping 시작
  const startPing = () => {
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30초마다 ping
  };

  // ping 중지
  const stopPing = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  // 컴포넌트 마운트 시 WebSocket 연결
  useEffect(() => {
    connectWebSocket();

    // 정리 함수
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      stopPing();
      
      if (wsRef.current) {
        wsRef.current.close(1000, '컴포넌트 언마운트');
      }
    };
  }, []);

  // Fallback: 서버 설정 폴링 (WebSocket 실패 시)
  useEffect(() => {
    let pollInterval;

    if (connectionStatus === 'failed' || connectionStatus === 'error') {
      console.log('[RealtimeConfigSync] 🔄 WebSocket 실패, 폴링 모드로 전환');
      
      const pollServerSettings = async () => {
        try {
          const response = await fetch('/api/admin-config');
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              if (data.adminSettings && onAdminUpdate) {
                onAdminUpdate(data.adminSettings);
              }
              if (data.fieldConfig && onConfigUpdate) {
                onConfigUpdate(data.fieldConfig);
              }
              
              // 폴링 성공 시 상태 업데이트
              if (connectionStatus !== 'polling') {
                setConnectionStatus('polling');
                console.log('[RealtimeConfigSync] 📡 폴링 모드 활성화');
              }
            }
          }
        } catch (error) {
          console.error('[RealtimeConfigSync] ❌ 폴링 오류:', error);
        }
      };

      // 즉시 한 번 실행
      pollServerSettings();
      
      // 30초마다 폴링
      pollInterval = setInterval(pollServerSettings, 30000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [connectionStatus, onConfigUpdate, onAdminUpdate]);

  // 수동 재연결 함수
  const handleManualReconnect = () => {
    console.log('[RealtimeConfigSync] 🔄 수동 재연결 시도');
    reconnectAttempts.current = 0;
    setConnectionStatus('connecting');
    connectWebSocket();
  };

  // 개발 모드에서만 상태 표시
  if (process.env.NODE_ENV === 'development') {
    const statusConfig = {
      connected: { 
        bg: 'bg-green-100', 
        text: 'text-green-800', 
        label: '실시간 연결됨',
        icon: '🟢'
      },
      connecting: { 
        bg: 'bg-yellow-100', 
        text: 'text-yellow-800', 
        label: '연결 중...',
        icon: '🟡'
      },
      polling: { 
        bg: 'bg-blue-100', 
        text: 'text-blue-800', 
        label: '폴링 모드',
        icon: '🔵'
      },
      disconnected: { 
        bg: 'bg-gray-100', 
        text: 'text-gray-800', 
        label: '연결 끊김',
        icon: '⚪'
      },
      error: { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        label: '오류',
        icon: '🔴'
      },
      failed: { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        label: '연결 실패',
        icon: '🔴'
      },
      server_shutdown: { 
        bg: 'bg-orange-100', 
        text: 'text-orange-800', 
        label: '서버 종료',
        icon: '🟠'
      }
    };

    const config = statusConfig[connectionStatus] || statusConfig.disconnected;

    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium ${config.bg} ${config.text} border border-gray-300`}>
          <div className="flex items-center space-x-2">
            <span>{config.icon}</span>
            <span>설정 동기화: {config.label}</span>
          </div>
          
          {lastUpdateTime && (
            <div className="text-xs text-gray-600 mt-1">
              마지막 업데이트: {lastUpdateTime}
            </div>
          )}
          
          {(connectionStatus === 'failed' || connectionStatus === 'error') && (
            <button
              onClick={handleManualReconnect}
              className="mt-2 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
            >
              재연결 시도
            </button>
          )}
          
          {connectionStatus === 'connected' && (
            <div className="text-xs text-green-600 mt-1">
              연결된 클라이언트와 실시간 동기화 중
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default RealtimeConfigSync;
