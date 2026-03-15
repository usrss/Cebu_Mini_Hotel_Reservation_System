import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ─── Attach JWT ───────────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Auto-refresh on 401 ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refreshToken");
        if (!refresh) throw new Error("No refresh token");
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
        localStorage.setItem("accessToken", data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("isFirstLogin");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Helper: build FormData when a File is present ───────────────────────────
function toFormData(data) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    // Arrays (e.g. amenity_ids, inclusion_ids) must be appended individually
    if (Array.isArray(v)) {
      v.forEach(item => fd.append(k, item));
    } else {
      fd.append(k, v);
    }
  });
  return fd;
}

function hasFile(data) {
  return Object.values(data).some(v => v instanceof File);
}

// ─── Public Endpoints ─────────────────────────────────────────────────────────
export const getRooms       = (params = {}) => api.get("/rooms/", { params });
export const getRoomDetail  = (id)          => api.get(`/rooms/${id}/`);
export const checkAvailability = (payload)  => api.post("/rooms/availability/", payload);

// ─── Booking Lock ─────────────────────────────────────────────────────────────
export const lockRoom = (payload) =>
  api.post("/rooms/lock/", payload);

export const releaseRoomLock = (roomId, sessionKey) =>
  api.post("/rooms/lock/release/", { room_id: roomId, session_key: sessionKey });

// ─── Admin Endpoints ──────────────────────────────────────────────────────────
export const adminGetRooms  = (params = {}) => api.get("/rooms/admin/", { params });
export const adminGetRoom   = (id)          => api.get(`/rooms/admin/${id}/`);

export const adminCreateRoom = (data) => {
  if (hasFile(data)) {
    return api.post("/rooms/admin/", toFormData(data), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.post("/rooms/admin/", data);
};

export const adminUpdateRoom = (id, data) => {
  if (hasFile(data)) {
    return api.put(`/rooms/admin/${id}/`, toFormData(data), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.put(`/rooms/admin/${id}/`, data);
};

export const adminPatchRoom = (id, data) => {
  if (hasFile(data)) {
    return api.patch(`/rooms/admin/${id}/`, toFormData(data), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.patch(`/rooms/admin/${id}/`, data);
};

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