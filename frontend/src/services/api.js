// src/services/api.js
import axios from 'axios';

// ─── BASE URLs ───────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const AUTH_BASE = import.meta.env.VITE_AUTH_URL || 'http://localhost:8000/api/auth';

// ─── AXIOS INSTANCE ──────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const resp = await axios.post(`${AUTH_BASE}/token/refresh/`, { refresh: refreshToken });
        const { access, refresh } = resp.data;

        localStorage.setItem('accessToken', access);
        localStorage.setItem('refreshToken', refresh);

        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Logout if refresh fails
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

// ─── AUTH FUNCTIONS ──────────────────────────────────────────────────────────
export const loginUser = async (data) => {
  const response = await axios.post(`${AUTH_BASE}/login/`, {
    ...data,
    auth_provider: data.auth_provider || 'email',
  });

  if (response.data.tokens) {
    localStorage.setItem('accessToken', response.data.tokens.access);
    localStorage.setItem('refreshToken', response.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }

  return response.data;
};

export const registerUser = async (data) => {
  const response = await axios.post(`${AUTH_BASE}/register/request/`, {
    ...data,
    auth_provider: data.auth_provider || 'email',
  });

  // Only store tokens for social auth (Google, etc.) - skip OTP verification
  if (data.auth_provider && data.auth_provider !== 'email' && response.data.tokens) {
    localStorage.setItem('accessToken', response.data.tokens.access);
    localStorage.setItem('refreshToken', response.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }

  return response.data;
};

// Add a new function specifically for Google authentication that handles both login and registration
export const googleAuthenticate = async (accessToken, userInfo) => {
  const { email, given_name, family_name, sub } = userInfo;

  try {
    // First try to login with Google credentials
    const loginResponse = await loginUser({
      email,
      auth_provider: 'google',
      access_token: accessToken,
    });
    return loginResponse;
  } catch (loginError) {
    // If login fails (user doesn't exist), try to register
    if (loginError.response?.status === 400 || loginError.response?.status === 404) {
      const registerResponse = await registerUser({
        email,
        first_name: given_name || '',
        last_name: family_name || '',
        auth_provider: 'google',
        access_token: accessToken,
        social_id: sub,
      });
      return registerResponse;
    }
    throw loginError;
  }
};

export const verifyCode = async (data) => {
  const response = await axios.post(`${AUTH_BASE}/register/verify/`, data);

  if (response.data.tokens) {
    localStorage.setItem('accessToken', response.data.tokens.access);
    localStorage.setItem('refreshToken', response.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    localStorage.setItem('isFirstLogin', response.data.is_first_login);
  }

  return response.data;
};

export const logoutUser = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('isFirstLogin');

  if (refreshToken) {
    try {
      await axios.post(`${AUTH_BASE}/logout/`, { refresh: refreshToken });
    } catch (err) {
      console.log('Logout ignored:', err.message);
    }
  }
};

export const getCurrentUser = async () => {
  const response = await api.get('/auth/me/');
  return response.data;
};

// ─── BOOKINGS ───────────────────────────────────────────────────────────────
export const createBooking = async (payload) => {
  const response = await api.post('/bookings/', payload);
  return response.data;
};

export const cancelBooking = async (id, reason = '') => {
  const response = await api.post(`/bookings/my/${id}/cancel/`, { reason });
  return response.data;
};

export const getMyBookings = async () => {
  const response = await api.get('/bookings/my/');
  return response.data;
};

export const getBookingDetail = async (id) => {
  const response = await api.get(`/bookings/my/${id}/`);
  return response.data;
};

export const lookupBooking = async (reference) => {
  const response = await api.get(`/bookings/lookup/?reference=${encodeURIComponent(reference)}`);
  return response.data;
};

export const resendCode = async (data) => {
  const response = await axios.post(`${AUTH_BASE}/resend-code/`, {
    ...data,
    purpose: data.purpose || 'registration',
  });
  return response.data;
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────
export const isAuthenticated = () => !!localStorage.getItem('accessToken');

export const getStoredUser = () => {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
};

export const isFirstLogin = () => localStorage.getItem('isFirstLogin') === 'true';
export const clearFirstLoginFlag = () => localStorage.removeItem('isFirstLogin');

export default api;