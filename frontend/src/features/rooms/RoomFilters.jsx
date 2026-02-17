import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

const ROOM_TYPES = [
  { value: "", label: "All Types" },
  { value: "standard",   label: "Standard" },
  { value: "deluxe",     label: "Deluxe" },
  { value: "suite",      label: "Suite" },
  { value: "family",     label: "Family" },
  { value: "penthouse",  label: "Penthouse" },
];

const BED_TYPES = [
  { value: "",       label: "Any" },
  { value: "single", label: "Single" },
  { value: "double", label: "Double" },
  { value: "queen",  label: "Queen" },
  { value: "king",   label: "King" },
  { value: "twin",   label: "Twin" },
];

export default function RoomFilters({ filters, onChange, onReset }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const set = (key, value) => onChange({ ...filters, [key]: value || undefined });

  const hasActive = Object.values(filters).some(
    (v) => v !== undefined && v !== "" && v !== null
  );

  const panel = (
    <div className="p-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <SlidersHorizontal size={15} /> Filters
        </h2>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button onClick={() => { onReset(); setMobileOpen(false); }} className="text-xs text-indigo-600 hover:underline">
              Reset
            </button>
          )}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-gray-400">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Dates */}
      <Section title="Dates">
        <label className="text-xs text-gray-500 block mb-1">Check-in</label>
        <input
          type="date"
          value={filters.check_in || ""}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => set("check_in", e.target.value)}
          className={inputCls}
        />
        <label className="text-xs text-gray-500 block mt-2 mb-1">Check-out</label>
        <input
          type="date"
          value={filters.check_out || ""}
          min={filters.check_in || new Date().toISOString().split("T")[0]}
          onChange={(e) => set("check_out", e.target.value)}
          className={inputCls}
        />
      </Section>

      {/* Room Type */}
      <Section title="Room Type">
        <div className="flex flex-wrap gap-1.5">
          {ROOM_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => set("room_type", value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                (filters.room_type || "") === value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Bed Type */}
      <Section title="Bed Type">
        <div className="flex flex-wrap gap-1.5">
          {BED_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => set("bed_type", value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                (filters.bed_type || "") === value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Price */}
      <Section title="Price per Night">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
            <input
              type="number" min={0} placeholder="Min"
              value={filters.min_price || ""}
              onChange={(e) => set("min_price", e.target.value)}
              className={`${inputCls} pl-6`}
            />
          </div>
          <span className="text-gray-300">—</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
            <input
              type="number" min={0} placeholder="Max"
              value={filters.max_price || ""}
              onChange={(e) => set("max_price", e.target.value)}
              className={`${inputCls} pl-6`}
            />
          </div>
        </div>
      </Section>

      {/* Guests */}
      <Section title="Min. Guests">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => set("min_capacity", n === filters.min_capacity ? undefined : n)}
              className={`w-10 h-9 rounded-lg border text-xs font-semibold transition-colors ${
                filters.min_capacity === n
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {n}+
            </button>
          ))}
        </div>
      </Section>

      <button
        onClick={() => setMobileOpen(false)}
        className="lg:hidden w-full mt-2 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold"
      >
        Apply
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
      >
        <SlidersHorizontal size={15} />
        Filters
        {hasActive && <span className="w-2 h-2 bg-indigo-600 rounded-full" />}
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {panel}
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-40 w-72 bg-white shadow-xl lg:hidden overflow-y-auto">
            {panel}
          </aside>
        </>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5 border-b border-gray-100 pb-5 last:border-0 last:pb-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{title}</p>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";