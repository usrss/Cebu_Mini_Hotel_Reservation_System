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
  adminGetPriceHistory,
} from "../../services/roomService";

// ─── useRooms ─────────────────────────────────────────────────────────────────
// Fetches the public room list with optional filters.
// Used in RoomListPage.

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
// Fetches full room data for the detail page.
// Redirects to /login on 401 — same pattern as Dashboard.jsx.

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
// Checks available rooms for a given date range.
// Used in RoomListPage when guest enters check-in/check-out dates.

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
// Temporarily locks a room during checkout to prevent double booking.
// Uses sessionStorage (tab-scoped) so each tab has its own lock session.

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

// ─── useAdminRooms ────────────────────────────────────────────────────────────
// Full CRUD for admin/staff room management.
// Used in AdminRoomsPage.

export function useAdminRooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRooms = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminGetRooms(params);
      setRooms(data.results || data);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }
      setError("Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, []);

  const createRoom = useCallback(async (formData) => {
    setSubmitting(true);
    try {
      const res = await adminCreateRoom(formData);
      setRooms((prev) => [res.data, ...prev]);
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, errors: err.response?.data || {} };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const updateRoom = useCallback(async (id, formData, partial = false) => {
    setSubmitting(true);
    try {
      const res = partial
        ? await adminPatchRoom(id, formData)
        : await adminUpdateRoom(id, formData);
      setRooms((prev) => prev.map((r) => (r.id === id ? res.data : r)));
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, errors: err.response?.data || {} };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const updateStatus = useCallback(async (id, newStatus) => {
    try {
      const res = await adminUpdateRoomStatus(id, newStatus);
      setRooms((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: res.data.status } : r))
      );
      return { success: true };
    } catch {
      return { success: false };
    }
  }, []);

  const deleteRoom = useCallback(async (id) => {
    try {
      await adminDeleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    } catch {
      return { success: false };
    }
  }, []);

  const uploadImages = useCallback(async (roomId, files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    try {
      const res = await adminUploadRoomImages(roomId, formData);
      return { success: true, images: res.data };
    } catch {
      return { success: false };
    }
  }, []);

  return {
    rooms, loading, error, submitting,
    fetchRooms, createRoom, updateRoom, updateStatus, deleteRoom, uploadImages,
  };
}

// ─── usePriceHistory ──────────────────────────────────────────────────────────
// Fetches price change history for a room. Used in admin panel.

export function usePriceHistory(roomId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    adminGetPriceHistory(roomId)
      .then(({ data }) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [roomId]);

  return { history, loading };
}