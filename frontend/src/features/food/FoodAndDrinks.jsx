import { useState, useEffect } from "react";
import api from "../../services/api";
import Navbar from "../../components/UIComponents/Navbar";
import Footer from "../../components/UIComponents/Footer";
import './FoodAndDrinks.css';

const CATEGORIES = ["all", "food", "drinks", "snacks", "desserts"];

// FIX: Updated class names to use the fd-badge--* prefix that matches FoodAndDrinks.css
const STATUS_BADGE = {
  pending:   { label: "Pending",   className: "fd-badge fd-badge--pending"   },
  completed: { label: "Completed", className: "fd-badge fd-badge--completed" },
  cancelled: { label: "Cancelled", className: "fd-badge fd-badge--cancelled" },
};

const PAYMENT_BADGE = {
  unpaid: { label: "Unpaid", className: "fd-badge fd-badge--unpaid" },
  paid:   { label: "Paid",   className: "fd-badge fd-badge--paid"   },
};

export default function FoodAndDrinks() {
  const [menuItems,     setMenuItems]     = useState([]);
  const [myOrders,      setMyOrders]      = useState([]);
  const [activeTab,     setActiveTab]     = useState("menu");
  const [category,      setCategory]      = useState("all");
  const [modal,         setModal]         = useState(null);
  const [quantity,      setQuantity]      = useState(1);
  const [paymentType,   setPaymentType]   = useState("pay_now");
  const [foodPayMethod, setFoodPayMethod] = useState("card");
  const [notes,         setNotes]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");

  useEffect(() => { fetchMenu(); fetchMyOrders(); }, []);

  async function fetchMenu() {
    setLoading(true);
    try {
      const res = await api.get("/food/menu/");
      setMenuItems(res.data.results ?? res.data);
    } catch {
      setError("Failed to load menu.");
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
    setPaymentType("pay_now");
    setFoodPayMethod("card");
    setNotes("");
    setError("");
  }

  function closeModal() {
    setModal(null);
    setError("");
  }

  async function handleOrder() {
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post("/food/orders/", {
        food_item_id: modal.id,
        quantity,
        payment_type: paymentType,
        notes,
      });

      const order = res.data.order;

      if (paymentType === "pay_now") {
        const payRes = await api.post("/food/orders/initiate-payment/", {
          order_id:       order.id,
          payment_method: foodPayMethod,
        });
        if (payRes.data.checkout_url) {
          window.location.href = payRes.data.checkout_url;
          return;
        }
      }

      setSuccess(`Order placed for ${modal.name}!`);
      closeModal();
      fetchMyOrders();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to place order. Are you checked in?");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = category === "all"
    ? menuItems
    : menuItems.filter(i => i.category === category);

  const pendingCount = myOrders.filter(o => o.order_status === "pending").length;

  return (
    <div className="fd-page">

      <Navbar />

      <div className="fd-hero">
        <div className="fd-hero__inner">
          <p className="fd-hero__eyebrow">Room Service</p>
          <h1 className="fd-hero__title">Food &amp; Drinks</h1>
          <p className="fd-hero__subtitle">Order directly to your room, anytime</p>
        </div>
      </div>

      <div className="fd-container">

        {success && (
          <div className="fd-alert fd-alert--success">{success}</div>
        )}

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
                    ? <img src={item.image} alt={item.name} className="fd-card__image" />
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
                  {/* FIX: Use the corrected className from STATUS_BADGE / PAYMENT_BADGE */}
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
                  <span className="fd-badge fd-badge--neutral">
                    {order.payment_type === "pay_now" ? "Pay Now" : "Pay at Checkout"}
                  </span>
                </div>
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
                <img src={modal.image} alt={modal.name} className="fd-modal__image" />
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

              {/* Payment type */}
              <div className="fd-field">
                <label className="fd-label">Payment</label>
                <div className="fd-radio-group">
                  <label className="fd-radio-label">
                    <input
                      type="radio"
                      value="pay_now"
                      checked={paymentType === "pay_now"}
                      onChange={() => setPaymentType("pay_now")}
                    />
                    Pay Now
                  </label>
                  <label className="fd-radio-label">
                    <input
                      type="radio"
                      value="pay_checkout"
                      checked={paymentType === "pay_checkout"}
                      onChange={() => setPaymentType("pay_checkout")}
                    />
                    Pay at Checkout
                  </label>
                </div>
              </div>

              {/* Payment method — only when Pay Now */}
              {paymentType === "pay_now" && (
                <div className="fd-field">
                  <label className="fd-label">Payment method</label>
                  <div className="fd-radio-group fd-radio-group--wrap">
                    {[
                      { value: "card",          label: "Card"          },
                      { value: "gcash",         label: "GCash"         },
                      { value: "bank_transfer", label: "Bank Transfer" },
                      { value: "paypal",        label: "PayPal"        },
                    ].map(m => (
                      <label key={m.value} className="fd-radio-label">
                        <input
                          type="radio"
                          value={m.value}
                          checked={foodPayMethod === m.value}
                          onChange={() => setFoodPayMethod(m.value)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

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

              {error && <p className="fd-error">{error}</p>}
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