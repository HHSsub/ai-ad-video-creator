import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // API 호출 헬퍼
  const apiCall = async (url, options = {}) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || 'API call failed');
    }

    return response.json();
  };

  // 로그인
  const login = async (username, password) => {
    try {
      const response = await apiCall('/nexxii/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (response.success) {
        setToken(response.token);
        setUser(response.user);
        localStorage.setItem('token', response.token);
        return { success: true };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  // 로그아웃
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  // 관리자 권한 확인
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    // 토큰 검증 로직
    if (token) {
      // 사용자 정보 확인 API 호출
    }
    setLoading(false);
  }, [token]);

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAdmin,
    apiCall,
  };

  return (
    
      {children}
    
  );
};
