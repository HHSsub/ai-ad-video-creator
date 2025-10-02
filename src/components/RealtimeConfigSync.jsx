import { useEffect, useRef } from 'react';

const RealtimeConfigSync = ({ onConfigUpdate }) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/admin-field-config/field-config');
        const data = await response.json();
        
        if (data.success && data.config && onConfigUpdate) {
          const currentConfig = localStorage.getItem('server-field-config');
          const newConfigStr = JSON.stringify(data.config);
          
          if (currentConfig !== newConfigStr) {
            localStorage.setItem('server-field-config', newConfigStr);
            onConfigUpdate(data.config);
            window.location.reload();
          }
        }
      } catch (error) {
        // 무시
      }
    };

    // 5초마다 체크
    intervalRef.current = setInterval(checkConfig, 5000);
    
    // 첫 실행
    checkConfig();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onConfigUpdate]);

  return null;
};

export default RealtimeConfigSync;
