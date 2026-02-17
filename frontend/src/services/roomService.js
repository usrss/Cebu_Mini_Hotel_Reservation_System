import axios from "axios";

// ─── Vite env variable — set VITE_API_BASE_URL in your .env file ──────────────
// .env: VITE_API_BASE_URL=http://localhost:8000/api
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

/**
 * Shared axios instance for all rooms API calls.
 *
 * Token keys match exactly what loginUser() in your auth api.js stores:
 *   localStorage.setItem('access_token',  data.tokens.access)
 *   localStorage.setItem('refresh_token', data.tokens.refresh)
 *   localStorage.setItem('user',          JSON.stringify(data.user))
 */
const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ─── Attach JWT to every request ──────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auto-refresh access token on 401 ────────────────────────────────────────
// Calls POST /api/auth/token/refresh/ (CustomTokenRefreshView in your auth urls)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) throw new Error("No refresh token");

        const { data } = await axios.post(
          `${BASE_URL}/auth/token/refresh/`,
          { refresh }
        );

        localStorage.setItem("access_token", data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        // Clear auth state and redirect to login
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        localStorage.removeItem("is_first_login");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Public Endpoints ─────────────────────────────────────────────────────────

export const getRooms = (params = {}) =>
  api.get("/rooms/", { params });

export const getRoomDetail = (id) =>
  api.get(`/rooms/${id}/`);

export const checkAvailability = (payload) =>
  api.post("/rooms/availability/", payload);

// ─── Booking Lock ─────────────────────────────────────────────────────────────

export const lockRoom = (payload) =>
  api.post("/rooms/lock/", payload);

export const releaseRoomLock = (roomId, sessionKey) =>
  api.post("/rooms/lock/release/", { room_id: roomId, session_key: sessionKey });

// ─── Admin / Staff Endpoints ──────────────────────────────────────────────────

export const adminGetRooms = (params = {}) =>
  api.get("/rooms/admin/", { params });

export const adminGetRoom = (id) =>
  api.get(`/rooms/admin/${id}/`);

export const adminCreateRoom = (data) =>
  api.post("/rooms/admin/", data);

export const adminUpdateRoom = (id, data) =>
  api.put(`/rooms/admin/${id}/`, data);

export const adminPatchRoom = (id, data) =>
  api.patch(`/rooms/admin/${id}/`, data);

export const adminDeleteRoom = (id) =>
  api.delete(`/rooms/admin/${id}/`);

export const adminUpdateRoomStatus = (id, newStatus) =>
  api.patch(`/rooms/admin/${id}/status/`, { status: newStatus });

export const adminUploadRoomImages = (id, formData) =>
  api.post(`/rooms/admin/${id}/images/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const adminDeleteRoomImage = (roomId, imageId) =>
  api.delete(`/rooms/admin/${roomId}/images/`, { data: { image_id: imageId } });

export const adminGetPriceHistory = (id) =>
  api.get(`/rooms/admin/${id}/price-history/`);

export default api;