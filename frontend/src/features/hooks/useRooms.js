import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getRooms,
  getRoomDetail,
  checkAvailability,
  lockRoom,
  releaseRoomLock,
  adminGetRooms,
  adminCreateRoom,
  adminUpdateRoom,
  adminPatchRoom,
  adminDeleteRoom,
  adminUpdateRoomStatus,
  adminUploadRoomImages,
  adminDeleteRoomImage,
  adminGetPriceHistory,
} from "../../services/roomService";
import api from "../../services/api";

// ─── useRooms ─────────────────────────────────────────────────────────────────
export function useRooms(initialFilters = {}) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);

  const fetchRooms = useCallback(async (params = filters) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getRooms(params);
      setRooms(data.results || data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchRooms(filters);
  }, [JSON.stringify(filters)]);

  return { rooms, loading, error, filters, setFilters, refetch: fetchRooms };
}

// ─── useRoomDetail ────────────────────────────────────────────────────────────
export function useRoomDetail(id) {
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchRoom = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await getRoomDetail(id);
        if (!cancelled) setRoom(data);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          navigate("/login");
          return;
        }
        setError(err.response?.data?.detail || "Room not found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRoom();
    return () => { cancelled = true; };
  }, [id]);

  return { room, loading, error };
}

// ─── useAvailability ──────────────────────────────────────────────────────────
export function useAvailability() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await checkAvailability(payload);
      setResults(data);
      return data;
    } catch (err) {
      const errData = err.response?.data;
      let msg = "Failed to check availability.";
      if (errData) {
        const firstField = Object.values(errData)[0];
        msg = Array.isArray(firstField) ? firstField[0] : (firstField || msg);
      }
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, search, reset };
}

// ─── useRoomLock ──────────────────────────────────────────────────────────────
export function useRoomLock() {
  const [locked, setLocked] = useState(false);
  const [lockInfo, setLockInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const sessionKey = useRef(
    sessionStorage.getItem("booking_session_key") ||
    (() => {
      const key = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("booking_session_key", key);
      return key;
    })()
  );

  const acquireLock = useCallback(async (roomId, checkIn, checkOut) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await lockRoom({
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        session_key: sessionKey.current,
      });
      setLocked(true);
      setLockInfo(data);

      const expiresIn = new Date(data.expires_at) - Date.now() - 5000;
      timerRef.current = setTimeout(() => {
        setLocked(false);
        setLockInfo(null);
      }, Math.max(expiresIn, 0));

      return true;
    } catch (err) {
      setError(err.response?.data?.error || "Could not lock room.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const releaseLock = useCallback(async (roomId) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await releaseRoomLock(roomId, sessionKey.current);
    } finally {
      setLocked(false);
      setLockInfo(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    locked, lockInfo, loading, error,
    acquireLock, releaseLock,
    sessionKey: sessionKey.current,
  };
}

// ─── Amenity / Inclusion API helpers ─────────────────────────────────────────
const amenityApi = {
  list:   ()         => api.get("/rooms/amenities/"),
  create: (data)     => api.post("/rooms/amenities/", data),
  update: (id, data) => api.put("/rooms/amenities/" + id + "/", data),
  delete: (id)       => api.delete("/rooms/amenities/" + id + "/"),
};

const inclusionApi = {
  list:   ()         => api.get("/rooms/inclusions/"),
  create: (data)     => api.post("/rooms/inclusions/", data),
  update: (id, data) => api.put("/rooms/inclusions/" + id + "/", data),
  delete: (id)       => api.delete("/rooms/inclusions/" + id + "/"),
};

// ─── useAdminRooms ────────────────────────────────────────────────────────────
export function useAdminRooms() {
  const navigate = useNavigate();

  const [rooms,      setRooms]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [amenities,  setAmenities]  = useState([]);
  const [inclusions, setInclusions] = useState([]);

  const fetchRooms = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminGetRooms(params || {});
      setRooms(data.results || data);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        navigate("/login");
        return;
      }
      setError("Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAmenities = useCallback(async () => {
    try {
      const { data } = await amenityApi.list();
      setAmenities(data.results || data);
    } catch (_) {
      // non-fatal
    }
  }, []);

  const fetchInclusions = useCallback(async () => {
    try {
      const { data } = await inclusionApi.list();
      setInclusions(data.results || data);
    } catch (_) {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    fetchAmenities();
    fetchInclusions();
  }, []);

  // ── Room CRUD ────────────────────────────────────────────────────────────
  const createRoom = useCallback(async (formData) => {
    setSubmitting(true);
    try {
      const res = await adminCreateRoom(formData);
      setRooms(function(prev) { return [res.data].concat(prev); });
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const updateRoom = useCallback(async (id, formData, partial) => {
    setSubmitting(true);
    try {
      const res = partial
        ? await adminPatchRoom(id, formData)
        : await adminUpdateRoom(id, formData);
      setRooms(function(prev) {
        return prev.map(function(r) { return r.id === id ? res.data : r; });
      });
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const updateStatus = useCallback(async (id, newStatus) => {
    try {
      const res = await adminUpdateRoomStatus(id, newStatus);
      setRooms(function(prev) {
        return prev.map(function(r) {
          return r.id === id ? Object.assign({}, r, { status: res.data.status }) : r;
        });
      });
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }, []);

  // FIX: capture and return the actual backend error instead of swallowing it
  const deleteRoom = useCallback(async (id) => {
    try {
      await adminDeleteRoom(id);
      setRooms(function(prev) { return prev.filter(function(r) { return r.id !== id; }); });
      return { success: true };
    } catch (err) {
      const detail = err.response?.data?.detail
        || err.response?.data?.error
        || "Failed to delete room.";
      return { success: false, error: detail };
    }
  }, []);

  const uploadImages = useCallback(async (roomId, files) => {
    const formData = new FormData();
    files.forEach(function(file) { formData.append("images", file); });
    try {
      const res = await adminUploadRoomImages(roomId, formData);
      const uploaded = Array.isArray(res.data) ? res.data : [];
      setRooms(function(prev) {
        return prev.map(function(r) {
          if (r.id !== roomId) return r;
          return Object.assign({}, r, { images: (r.images || []).concat(uploaded) });
        });
      });
      return { success: true, images: res.data };
    } catch (_) {
      return { success: false };
    }
  }, []);

  // FIX: capture and return the actual backend error instead of swallowing it
  const deleteImage = useCallback(async (roomId, imageId) => {
    try {
      await adminDeleteRoomImage(roomId, imageId);
      setRooms(function(prev) {
        return prev.map(function(r) {
          if (r.id !== roomId) return r;
          return Object.assign({}, r, {
            images: (r.images || []).filter(function(img) { return img.id !== imageId; })
          });
        });
      });
      return { success: true };
    } catch (err) {
      const detail = err.response?.data?.detail
        || err.response?.data?.error
        || "Failed to delete image.";
      return { success: false, error: detail };
    }
  }, []);

  // ── Amenity CRUD ─────────────────────────────────────────────────────────
  const createAmenity = useCallback(async (item) => {
    try {
      const { data } = await amenityApi.create(item);
      setAmenities(function(prev) { return prev.concat([data]); });
      return { success: true, data: data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    }
  }, []);

  const updateAmenity = useCallback(async (item) => {
    try {
      const { data } = await amenityApi.update(item.id, item);
      setAmenities(function(prev) {
        return prev.map(function(a) { return a.id === item.id ? data : a; });
      });
      return { success: true, data: data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    }
  }, []);

  const deleteAmenity = useCallback(async (id) => {
    try {
      await amenityApi.delete(id);
      setAmenities(function(prev) { return prev.filter(function(a) { return a.id !== id; }); });
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }, []);

  // ── Inclusion CRUD ───────────────────────────────────────────────────────
  const createInclusion = useCallback(async (item) => {
    try {
      const { data } = await inclusionApi.create(item);
      setInclusions(function(prev) { return prev.concat([data]); });
      return { success: true, data: data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    }
  }, []);

  const updateInclusion = useCallback(async (item) => {
    try {
      const { data } = await inclusionApi.update(item.id, item);
      setInclusions(function(prev) {
        return prev.map(function(i) { return i.id === item.id ? data : i; });
      });
      return { success: true, data: data };
    } catch (err) {
      return { success: false, errors: err.response ? err.response.data : {} };
    }
  }, []);

  const deleteInclusion = useCallback(async (id) => {
    try {
      await inclusionApi.delete(id);
      setInclusions(function(prev) { return prev.filter(function(i) { return i.id !== id; }); });
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }, []);

  return {
    rooms, loading, error, submitting,
    fetchRooms, createRoom, updateRoom, updateStatus, deleteRoom,
    uploadImages, deleteImage,
    amenities,
    createAmenity, updateAmenity, deleteAmenity,
    inclusions,
    createInclusion, updateInclusion, deleteInclusion,
  };
}

// ─── usePriceHistory ──────────────────────────────────────────────────────────
export function usePriceHistory(roomId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    adminGetPriceHistory(roomId)
      .then(function(res) { setHistory(res.data); })
      .catch(function() { setHistory([]); })
      .finally(function() { setLoading(false); });
  }, [roomId]);

  return { history, loading };
}