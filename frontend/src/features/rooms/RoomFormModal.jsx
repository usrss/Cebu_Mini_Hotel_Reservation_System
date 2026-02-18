import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

const ROOM_TYPES = ["standard", "deluxe", "suite", "family", "penthouse"];
const BED_TYPES = ["single", "double", "queen", "king", "twin"];
const STATUSES = ["available", "occupied", "maintenance", "reserved"];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RoomFormModal({ room, onSave, onClose, submitting }) {
  const isEdit = !!room;
  const [form, setForm] = useState({
    room_number: "",
    room_type: "standard",
    floor: 1,
    bed_type: "double",
    capacity: 2,
    price_per_night: "",
    status: "available",
    description: "",
    size_sqm: "",
    is_active: true,
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (room) {
      setForm({
        room_number: room.room_number || "",
        room_type: room.room_type || "standard",
        floor: room.floor || 1,
        bed_type: room.bed_type || "double",
        capacity: room.capacity || 2,
        price_per_night: room.price_per_night || "",
        status: room.status || "available",
        description: room.description || "",
        size_sqm: room.size_sqm || "",
        is_active: room.is_active ?? true,
      });
    }
  }, [room]);

  const set = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const handleSubmit = async () => {
    setErrors({});
    const payload = {
      ...form,
      floor: Number(form.floor),
      capacity: Number(form.capacity),
      price_per_night: parseFloat(form.price_per_night),
      size_sqm: form.size_sqm ? parseFloat(form.size_sqm) : null,
    };
    const result = await onSave(payload);
    if (!result.success) setErrors(result.errors || {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? `Edit Room ${room.room_number}` : "Add New Room"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Room Number + Floor */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Number" error={errors.room_number} required>
              <input
                type="text"
                value={form.room_number}
                onChange={(e) => set("room_number", e.target.value)}
                placeholder="e.g., 101"
                className={inputClass(errors.room_number)}
              />
            </Field>
            <Field label="Floor" error={errors.floor}>
              <input
                type="number"
                min={1}
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
                className={inputClass(errors.floor)}
              />
            </Field>
          </div>

          {/* Room Type + Bed Type */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Type" error={errors.room_type}>
              <select
                value={form.room_type}
                onChange={(e) => set("room_type", e.target.value)}
                className={inputClass(errors.room_type)}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {capitalize(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bed Type" error={errors.bed_type}>
              <select
                value={form.bed_type}
                onChange={(e) => set("bed_type", e.target.value)}
                className={inputClass(errors.bed_type)}
              >
                {BED_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {capitalize(t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Capacity + Price */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max Guests" error={errors.capacity}>
              <input
                type="number"
                min={1}
                max={20}
                value={form.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                className={inputClass(errors.capacity)}
              />
            </Field>
            <Field label="Price per Night" error={errors.price_per_night} required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={form.price_per_night}
                  onChange={(e) => set("price_per_night", e.target.value)}
                  className={`${inputClass(errors.price_per_night)} pl-8`}
                />
              </div>
            </Field>
          </div>

          {/* Size + Status */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Size (m²)" error={errors.size_sqm}>
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g., 32.5"
                value={form.size_sqm}
                onChange={(e) => set("size_sqm", e.target.value)}
                className={inputClass(errors.size_sqm)}
              />
            </Field>
            <Field label="Status" error={errors.status}>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={inputClass(errors.status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {capitalize(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description" error={errors.description}>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the room features and amenities..."
              className={`${inputClass(errors.description)} resize-none`}
            />
          </Field>

          {/* Active Toggle */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <button
              type="button"
              onClick={() => set("is_active", !form.is_active)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.is_active ? "bg-indigo-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.is_active ? "translate-x-5" : ""
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-900">Active Room</span>
              <p className="text-xs text-gray-500">
                {form.is_active ? "Visible in listings" : "Hidden from guests"}
              </p>
            </div>
          </div>

          {/* Global Error */}
          {errors.non_field_errors && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.non_field_errors}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600 mt-1">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

const inputClass = (error) =>
  `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
    error
      ? "border-red-300 focus:ring-red-500 bg-red-50"
      : "border-gray-300 focus:ring-indigo-500 bg-white"
  }`;