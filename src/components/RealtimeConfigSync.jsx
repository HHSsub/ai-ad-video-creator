import { useEffect, useRef } from 'react';

const RealtimeConfigSync = ({ onConfigUpdate }) => {
  const intervalRef = useRef(null);
  const lastConfigRef = useRef(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/admin-field-config/field-config', {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        const data = await response.json();
        
        if (data.success && data.config) {
          const newConfigStr = JSON.stringify(data.config);
          
          if (lastConfigRef.current === null) {
            lastConfigRef.current = newConfigStr;
          } else if (lastConfigRef.current !== newConfigStr) {
            lastConfigRef.current = newConfigStr;
            window.location.reload();
          }
        }
      } catch (error) {
        // 무시
      }
    };

    intervalRef.current = setInterval(checkConfig, 2000);
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
