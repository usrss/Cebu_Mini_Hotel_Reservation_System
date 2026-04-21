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

// ─── Helper: does the payload contain a real File? ────────────────────────────
function hasFile(data) {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some((v) => v instanceof File || v instanceof Blob);
}

// ─── Helper: build FormData for multipart payloads ───────────────────────────
/**
 * Converts a plain JS object into a FormData instance.
 *
 * Rules:
 *  - File / Blob          → appended as binary
 *  - ALL arrays           → JSON-stringified so the backend _parse_json_fields
 *                           helper always receives a reliable string to parse.
 *                           This includes empty arrays [] which must reach the
 *                           backend so it can clear amenities/inclusions.
 *  - Plain objects        → JSON-stringified (e.g. inclusion_notes)
 *  - panorama_image=""    → appended as "" so backend can detect and clear field
 *  - null / undefined     → skipped (except panorama_image — see above)
 */
function toFormData(data) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    // panorama_image="" means "clear the panorama" — must be sent even when empty
    if (k === "panorama_image" && (v === "" || v === null)) {
      fd.append(k, "");
      return;
    }
    if (v === null || v === undefined) return;

    if (v instanceof File || v instanceof Blob) {
      fd.append(k, v);
    } else if (Array.isArray(v)) {
      // Always JSON-stringify arrays — this handles both empty arrays (to clear
      // amenities/inclusions) and arrays of objects (seasonal_prices) reliably.
      // The backend _parse_json_fields() parses this string back to a list.
      fd.append(k, JSON.stringify(v));
    } else if (typeof v === "object") {
      // e.g. inclusion_notes: { "5": "note" } — stringify
      fd.append(k, JSON.stringify(v));
    } else {
      fd.append(k, v);
    }
  });
  return fd;
}

// ─── Public Endpoints ─────────────────────────────────────────────────────────
export const getRooms          = (params = {}) => api.get("/rooms/", { params });
export const getRoomDetail     = (id)          => api.get(`/rooms/${id}/`);
export const checkAvailability = (payload)     => api.post("/rooms/availability/", payload);

// ─── Booking Lock ─────────────────────────────────────────────────────────────
export const lockRoom = (payload) =>
  api.post("/rooms/lock/", payload);

export const releaseRoomLock = (roomId, sessionKey) =>
  api.post("/rooms/lock/release/", { room_id: roomId, session_key: sessionKey });

// ─── Admin: rooms ─────────────────────────────────────────────────────────────
export const adminGetRooms = (params = {}) => api.get("/rooms/admin/", { params });
export const adminGetRoom  = (id)          => api.get(`/rooms/admin/${id}/`);

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
  // FIX: if data contains panorama_image="" (clear) we still need multipart
  // so the empty string reaches the backend as a field, not lost in JSON null.
  const needsMultipart =
    hasFile(data) ||
    ("panorama_image" in data && (data.panorama_image === "" || data.panorama_image === null));

  if (needsMultipart) {
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

// ─── Admin: images ────────────────────────────────────────────────────────────
/**
 * Upload one or more images for a room.
 *
 * FIX: accepts either a plain array of File objects or an already-built
 * FormData instance (RoomImageModal passes FormData directly).
 * Always sends as multipart/form-data.
 */
export const adminUploadRoomImages = (id, filesOrFormData) => {
  let fd;
  if (filesOrFormData instanceof FormData) {
    fd = filesOrFormData;
  } else {
    // Array of File objects
    fd = new FormData();
    const files = Array.isArray(filesOrFormData) ? filesOrFormData : [filesOrFormData];
    files.forEach((file) => fd.append("images", file));
  }
  return api.post(`/rooms/admin/${id}/images/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Delete a single image.
 *
 * FIX: sends image_id as JSON body (axios DELETE with `data`).
 * The backend AdminRoomImageUploadView.delete() reads request.data.get("image_id").
 */
export const adminDeleteRoomImage = (roomId, imageId) =>
  api.delete(`/rooms/admin/${roomId}/images/`, {
    data: { image_id: imageId },
    headers: { "Content-Type": "application/json" },
  });

export const adminGetPriceHistory = (id) =>
  api.get(`/rooms/admin/${id}/price-history/`);

export default api;