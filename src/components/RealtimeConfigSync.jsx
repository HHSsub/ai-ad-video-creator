import { useEffect, useState } from 'react';

/**
 * 🔥 실시간 설정 동기화 컴포넌트
 * - BroadcastChannel API를 사용하여 탭/창 간 실시간 설정 동기화
 * - Admin이 설정을 변경하면 모든 사용자에게 즉시 반영
 */
const RealtimeConfigSync = ({ onConfigUpdate, onAdminUpdate }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  useEffect(() => {
    // BroadcastChannel 지원 여부 확인
    if (typeof window === 'undefined' || !window.BroadcastChannel) {
      console.warn('[RealtimeConfigSync] BroadcastChannel 미지원');
      return;
    }

    setConnectionStatus('connecting');

    // 채널 설정
    const configChannel = new BroadcastChannel('field-config-updates');
    const adminChannel = new BroadcastChannel('admin-settings-updates');

    // 필드 설정 업데이트 리스너
    configChannel.onmessage = (event) => {
      console.log('[RealtimeConfigSync] 필드 설정 업데이트 수신:', event.data);
      
      if (event.data.type === 'FIELD_CONFIG_UPDATED') {
        onConfigUpdate?.(event.data.config);
      }
    };

    // Admin 설정 업데이트 리스너
    adminChannel.onmessage = (event) => {
      console.log('[RealtimeConfigSync] Admin 설정 업데이트 수신:', event.data);
      
      if (event.data.type === 'ADMIN_SETTINGS_UPDATED') {
        onAdminUpdate?.(event.data.settings);
      }
    };

    // 연결 상태 업데이트
    const handleChannelOpen = () => setConnectionStatus('connected');
    const handleChannelError = () => setConnectionStatus('error');

    configChannel.addEventListener('message', handleChannelOpen);
    adminChannel.addEventListener('message', handleChannelOpen);
    
    // 초기 연결 상태
    setConnectionStatus('connected');

    // 정리 함수
    return () => {
      configChannel.close();
      adminChannel.close();
      setConnectionStatus('disconnected');
    };
  }, [onConfigUpdate, onAdminUpdate]);

  // 서버 설정 폴링 (Fallback)
  useEffect(() => {
    const pollInterval = 30000; // 30초마다 서버 설정 확인

    const pollServerSettings = async () => {
      try {
        const response = await fetch('/api/admin-config');
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // 로컬 설정과 서버 설정 비교하여 차이가 있으면 업데이트
            onAdminUpdate?.(data.adminSettings);
            onConfigUpdate?.(data.fieldConfig);
          }
        }
      } catch (error) {
        console.error('[RealtimeConfigSync] 서버 설정 폴링 오류:', error);
        setConnectionStatus('error');
      }
    };

    // 초기 로드
    pollServerSettings();

    // 정기적 폴링 설정
    const intervalId = setInterval(pollServerSettings, pollInterval);

    return () => clearInterval(intervalId);
  }, [onConfigUpdate, onAdminUpdate]);

  // 개발 모드에서만 상태 표시
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          connectionStatus === 'connected' 
            ? 'bg-green-100 text-green-800' 
            : connectionStatus === 'connecting'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
        }`}>
          실시간 동기화: {connectionStatus === 'connected' ? '연결됨' : connectionStatus}
        </div>
      </div>
    );
  }

  return null;
};

export default RealtimeConfigSync;
