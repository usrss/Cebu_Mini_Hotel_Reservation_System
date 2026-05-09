import { useState, useEffect } from "react";
import api from "../../services/api";
import Navbar from "../../components/UIComponents/Navbar";
import Footer from "../../components/UIComponents/Footer";
import './FoodAndDrinks.css';

const CATEGORIES = ["all", "food", "drinks", "snacks", "desserts"];

const STATUS_BADGE = {
  pending:   { label: "Pending",   className: "fd-badge fd-badge--pending"   },
  completed: { label: "Completed", className: "fd-badge fd-badge--completed" },
  cancelled: { label: "Cancelled", className: "fd-badge fd-badge--cancelled" },
};

const PAYMENT_BADGE = {
  unpaid: { label: "Unpaid", className: "fd-badge fd-badge--unpaid" },
  paid:   { label: "Paid",   className: "fd-badge fd-badge--paid"   },
};

// ── Notification Modal ────────────────────────────────────────────────────────
function NotifModal({ type, message, onClose }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "36px 32px 28px",
          maxWidth: "380px",
          width: "90%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          textAlign: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div style={{ marginBottom: "14px", fontSize: "36px" }}>
          {type === "success" ? "✓" : "✕"}
        </div>

        {/* Title */}
        <p style={{
          fontSize: "17px",
          fontWeight: "700",
          color: "#111",
          marginBottom: "8px",
        }}>
          {type === "success" ? "Order Placed" : "Unable to Order"}
        </p>

        {/* Message */}
        <p style={{
          fontSize: "14px",
          color: "#444",
          lineHeight: "1.6",
          marginBottom: "24px",
        }}>
          {message}
        </p>

        {/* Button */}
        <button
          onClick={onClose}
          style={{
            padding: "10px 32px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FoodAndDrinks() {
  const [menuItems,     setMenuItems]     = useState([]);
  const [myOrders,      setMyOrders]      = useState([]);
  const [activeTab,     setActiveTab]     = useState("menu");
  const [category,      setCategory]      = useState("all");
  const [modal,         setModal]         = useState(null);
  const [quantity,      setQuantity]      = useState(1);
  const [notes,         setNotes]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // Notification modal state
  const [notif, setNotif] = useState({ type: "", message: "" });

  function showNotif(type, message) {
    setNotif({ type, message });
  }
  function closeNotif() {
    setNotif({ type: "", message: "" });
  }

  useEffect(() => { fetchMenu(); fetchMyOrders(); }, []);

  async function fetchMenu() {
    setLoading(true);
    try {
      const res = await api.get("/food/menu/");
      setMenuItems(res.data.results ?? res.data);
    } catch {
      showNotif("error", "Failed to load menu. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyOrders() {
    try {
      const res = await api.get("/food/orders/my/");
      setMyOrders(res.data.results ?? res.data);
    } catch { /* silent */ }
  }

  function openModal(item) {
    setModal(item);
    setQuantity(1);
    setNotes("");
  }

  function closeModal() {
    setModal(null);
  }

  async function handleOrder() {
    setSubmitting(true);
    try {
      await api.post("/food/orders/", {
        food_item_id: modal.id,
        quantity,
        payment_type: "pay_checkout",
        notes,
      });
      closeModal();
      fetchMyOrders();
      showNotif("success", `Your order for ${modal.name} has been placed! It will be delivered to your room shortly.`);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail;
      closeModal();
      showNotif(
        "error",
        msg || "You need to be checked in to place a room service order."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelOrder(orderId) {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      await api.post(`/food/orders/${orderId}/cancel/`);
      fetchMyOrders();
      showNotif("success", "Your order has been cancelled.");
    } catch (err) {
      showNotif("error", err.response?.data?.error || "Failed to cancel order.");
    }
  }

  const filtered = category === "all"
    ? menuItems
    : menuItems.filter(i => i.category === category);

  const pendingCount = myOrders.filter(o => o.order_status === "pending").length;

  return (
    <div className="fd-page">
      <Navbar />

      {/* Notification Modal */}
      <NotifModal
        type={notif.type}
        message={notif.message}
        onClose={closeNotif}
      />

      <div className="fd-header">
        <p className="fd-eyebrow">Room Service</p>
        <h1 className="fd-page-title">Food &amp; Drinks</h1>
        <p className="fd-page-subtitle">Order directly to your room, anytime</p>
      </div>

      <div className="fd-container">

        {/* Tabs */}
        <div className="fd-tabs">
          <button
            className={`fd-tab ${activeTab === "menu" ? "fd-tab--active" : ""}`}
            onClick={() => setActiveTab("menu")}
          >
            Menu
          </button>
          <button
            className={`fd-tab ${activeTab === "orders" ? "fd-tab--active" : ""}`}
            onClick={() => { setActiveTab("orders"); fetchMyOrders(); }}
          >
            My Orders
            {pendingCount > 0 && (
              <span className="fd-tab__badge">{pendingCount}</span>
            )}
          </button>
        </div>

        {/* ══ MENU TAB ══ */}
        {activeTab === "menu" && (
          <>
            <div className="fd-categories">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`fd-category-btn ${category === cat ? "fd-category-btn--active" : ""}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {loading && (
              <div className="fd-state">
                <div className="fd-spinner" />
                <p>Loading menu…</p>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="fd-state">
                <p>No items in this category.</p>
              </div>
            )}

            <div className="fd-grid">
              {filtered.map(item => (
                <div key={item.id} className="fd-card">
                  {item.image
                    ? <img src={item.image_url || item.image} alt={item.name} className="fd-card__image" />
                    : <div className="fd-card__image fd-card__image--placeholder">
                        <span className="fd-card__placeholder-icon">🍽</span>
                      </div>
                  }
                  <div className="fd-card__body">
                    <span className="fd-card__category">{item.category}</span>
                    <h3 className="fd-card__name">{item.name}</h3>
                    <p className="fd-card__desc">{item.description}</p>
                    <div className="fd-card__footer">
                      <span className="fd-card__price">
                        ₱{parseFloat(item.price).toFixed(2)}
                      </span>
                      <button
                        className="fd-btn fd-btn--primary fd-btn--sm"
                        onClick={() => openModal(item)}
                      >
                        Order Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ MY ORDERS TAB ══ */}
        {activeTab === "orders" && (
          <div className="fd-orders">
            {myOrders.length === 0 && (
              <div className="fd-state">
                <p>You have no orders yet.</p>
              </div>
            )}
            {myOrders.map(order => (
              <div key={order.id} className="fd-order-card">
                <div className="fd-order-card__left">
                  <p className="fd-order-card__name">{order.food_item_name}</p>
                  <p className="fd-order-card__meta">
                    Qty: <strong>{order.quantity}</strong>
                    &nbsp;·&nbsp;
                    ₱{parseFloat(order.total_price).toFixed(2)}
                  </p>
                  <p className="fd-order-card__time">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="fd-order-card__right">
                  {STATUS_BADGE[order.order_status] && (
                    <span className={STATUS_BADGE[order.order_status].className}>
                      {STATUS_BADGE[order.order_status].label}
                    </span>
                  )}
                  {PAYMENT_BADGE[order.payment_status] && (
                    <span className={PAYMENT_BADGE[order.payment_status].className}>
                      {PAYMENT_BADGE[order.payment_status].label}
                    </span>
                  )}
                </div>
                {order.order_status !== "completed" && order.order_status !== "cancelled" && (
                  <button
                    className="fd-btn fd-btn--danger fd-btn--sm"
                    onClick={() => handleCancelOrder(order.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      <Footer />

      {/* ══ ORDER MODAL ══ */}
      {modal && (
        <div className="fd-overlay" onClick={closeModal}>
          <div className="fd-modal" onClick={e => e.stopPropagation()}>

            <div className="fd-modal__header">
              <h2 className="fd-modal__title">{modal.name}</h2>
              <button className="fd-modal__close" onClick={closeModal}>✕</button>
            </div>

            <div className="fd-modal__body">
              {modal.image && (
                <img src={modal.image_url || modal.image} alt={modal.name} className="fd-modal__image" />
              )}
              <p className="fd-modal__desc">{modal.description}</p>
              <p className="fd-modal__price">
                ₱{parseFloat(modal.price).toFixed(2)}
              </p>

              {/* Quantity */}
              <div className="fd-field">
                <label className="fd-label">Quantity</label>
                <div className="fd-qty">
                  <button
                    className="fd-qty__btn"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  >−</button>
                  <span className="fd-qty__value">{quantity}</span>
                  <button
                    className="fd-qty__btn"
                    onClick={() => setQuantity(q => Math.min(20, q + 1))}
                  >+</button>
                </div>
              </div>

              {/* Notes */}
              <div className="fd-field">
                <label className="fd-label">Special instructions (optional)</label>
                <textarea
                  className="fd-textarea"
                  rows={2}
                  placeholder="e.g. no onions, extra sauce…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {/* Total */}
              <div className="fd-modal__total">
                <span>Total</span>
                <strong>₱{(parseFloat(modal.price) * quantity).toFixed(2)}</strong>
              </div>
            </div>

            <div className="fd-modal__footer">
              <button className="fd-btn fd-btn--ghost" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="fd-btn fd-btn--primary"
                onClick={handleOrder}
                disabled={submitting}
              >
                {submitting ? "Placing order…" : "Confirm Order"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}