// src/services/api.js
import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/auth',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/auth'}/token/refresh/`,
          { refresh: refreshToken }
        );

        const { access, refresh } = response.data;
        localStorage.setItem('accessToken', access);
        localStorage.setItem('refreshToken', refresh);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * Request verification code for registration
 * @param {Object} data - { email, password, first_name?, last_name?, auth_provider? }
 */
export const registerUser = async (data) => {
  const response = await api.post('/register/request/', {
    ...data,
    auth_provider: data.auth_provider || 'email',
  });
  return response.data;
};

/**
 * Verify registration code
 * @param {Object} data - { email, code }
 */
export const verifyCode = async (data) => {
  const response = await api.post('/register/verify/', data);
  
  // Store tokens and user data
  if (response.data.tokens) {
    localStorage.setItem('accessToken', response.data.tokens.access);
    localStorage.setItem('refreshToken', response.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    localStorage.setItem('isFirstLogin', response.data.is_first_login);
  }
  
  return response.data;
};

/**
 * Login user
 * @param {Object} data - { email, password, auth_provider? }
 */
export const loginUser = async (data) => {
  const response = await api.post('/login/', {
    ...data,
    auth_provider: data.auth_provider || 'email',
  });
  
  // Store tokens and user data
  if (response.data.tokens) {
    localStorage.setItem('accessToken', response.data.tokens.access);
    localStorage.setItem('refreshToken', response.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }
  
  return response.data;
};

/**
 * Logout user
 */
export const logoutUser = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  // Clear local storage first
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('isFirstLogin');

  // Try to blacklist token on backend (don't wait for response)
  if (refreshToken) {
    try {
      await api.post('/logout/', { refresh: refreshToken });
    } catch (error) {
      // Ignore errors - user is already logged out locally
      console.log('Backend logout error (ignored):', error.message);
    }
  }
};

/**
 * Resend verification code
 * @param {Object} data - { email, purpose }
 */
export const resendCode = async (data) => {
  const response = await api.post('/resend-code/', {
    ...data,
    purpose: data.purpose || 'registration',
  });
  return response.data;
};

/**
 * Get current user profile
 */
export const getCurrentUser = async () => {
  const response = await api.get('/me/');
  return response.data;
};

/**
 * Update user profile
 * @param {Object} data - { first_name?, last_name? }
 */
export const updateProfile = async (data) => {
  const response = await api.patch('/profile/', data);
  
  // Update stored user data
  if (response.data.user) {
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }
  
  return response.data;
};

/**
 * Refresh access token
 */
export const refreshToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await axios.post(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/auth'}/token/refresh/`,
    { refresh: refreshToken }
  );
  
  localStorage.setItem('accessToken', response.data.access);
  localStorage.setItem('refreshToken', response.data.refresh);
  
  return response.data;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem('accessToken');
};

/**
 * Get stored user data
 */
export const getStoredUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * Check if this is user's first login
 */
export const isFirstLogin = () => {
  return localStorage.getItem('isFirstLogin') === 'true';
};

/**
 * Clear first login flag
 */
export const clearFirstLoginFlag = () => {
  localStorage.removeItem('isFirstLogin');
};

export default api;