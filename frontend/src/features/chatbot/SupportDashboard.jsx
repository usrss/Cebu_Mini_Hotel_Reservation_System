/**
 * src/features/chatbot/SupportDashboard.jsx
 *
 * Role-based support ticket dashboard.
 * Route: /admin/support  (add to AdminPanelRoutes.jsx)
 *
 * Role scoping (enforced by backend, reflected in UI):
 *   Admin       → all tiers visible; can see full routing chain
 *   Manager     → MANAGER + ADMIN tier tickets; can escalate to Admin
 *   Front Desk  → FRONT_DESK tier only; can escalate to Manager
 *   Receptionist→ same as Front Desk
 *
 * Features:
 *   - Tier-aware ticket list with priority + category badges
 *   - Full conversation view with sender differentiation
 *   - Reply as support agent
 *   - One-click escalation to next tier with reason modal
 *   - Close ticket
 *   - Auto-refresh every 15s
 *   - Filter by status / tier / priority / category
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSupportTickets,
  getSupportTicketDetail,
  replyToTicket,
  closeTicket,
  escalateTicket,
} from '../../services/chatApi';
import './SupportDashboard.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  front_desk: { label: 'Front Desk', color: '#6EE7B7', icon: '🛎' },
  manager:    { label: 'Manager',    color: '#818CF8', icon: '👔' },
  admin:      { label: 'Admin',      color: '#F87171', icon: '⚙️' },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: '#9ca3af' },
  normal:   { label: 'Normal',   color: '#6EE7B7' },
  high:     { label: 'High',     color: '#FCD34D' },
  critical: { label: 'Critical', color: '#F87171' },
};

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#FCD34D' },
  in_progress: { label: 'In Progress', color: '#6EE7B7' },
  escalated:   { label: 'Escalated',   color: '#818CF8' },
  closed:      { label: 'Closed',      color: '#9ca3af' },
};

const CATEGORY_ICONS = {
  booking_inquiry:  '📅',
  payment_issue:    '💳',
  room_complaint:   '🛏',
  cancellation:     '❌',
  vip_request:      '⭐',
  technical_error:  '⚠️',
  general_inquiry:  '💬',
  security_concern: '🔒',
  other:            '📋',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.front_desk;
  return (
    <span className="sd-tier-badge" style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <span className="sd-priority-badge" style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className="sd-status-badge" style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
      {cfg.label}
    </span>
  );
}

function CategoryTag({ category }) {
  const icon = CATEGORY_ICONS[category] || '📋';
  const label = category?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Other';
  return (
    <span className="sd-category-tag">
      {icon} {label}
    </span>
  );
}

// ─── Escalation Modal ─────────────────────────────────────────────────────────

function EscalateModal({ ticket, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  const nextTierLabel = ticket?.next_tier
    ? (TIER_CONFIG[ticket.next_tier]?.label || ticket.next_tier)
    : 'higher tier';

  return (
    <div className="sd-modal-overlay" onClick={onCancel}>
      <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-header">
          <h3 className="sd-modal-title">Escalate Ticket #{ticket?.id}</h3>
          <button className="sd-modal-close" onClick={onCancel}>✕</button>
        </div>
        <p className="sd-modal-desc">
          This ticket will be escalated to the{' '}
          <strong style={{ color: TIER_CONFIG[ticket?.next_tier]?.color || '#C9A84C' }}>
            {nextTierLabel}
          </strong>{' '}
          team. Please provide a reason.
        </p>
        <textarea
          className="sd-reply-input"
          placeholder="Reason for escalation (optional but recommended)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="sd-modal-actions">
          <button className="sd-cancel-btn" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="sd-escalate-confirm-btn"
            onClick={() => onConfirm(reason)}
            disabled={loading}
          >
            {loading ? 'Escalating…' : `Escalate to ${nextTierLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket list item ─────────────────────────────────────────────────────────

function TicketListItem({ ticket, isActive, onClick }) {
  const priorityColor = PRIORITY_CONFIG[ticket.priority]?.color || '#9ca3af';
  return (
    <button
      className={`sd-ticket-item ${isActive ? 'sd-ticket-item--active' : ''}`}
      style={ticket.priority === 'critical' ? { borderLeft: `3px solid ${priorityColor}` } : {}}
      onClick={onClick}
    >
      <div className="sd-ticket-item-top">
        <span className="sd-ticket-id">#{ticket.id}</span>
        <div className="sd-ticket-badges">
          <StatusBadge status={ticket.status} />
        </div>
      </div>
      <p className="sd-ticket-subject">{ticket.subject || 'No subject'}</p>
      <div className="sd-ticket-routing">
        <TierBadge tier={ticket.tier} />
        <PriorityBadge priority={ticket.priority} />
        <CategoryTag category={ticket.category} />
      </div>
      <div className="sd-ticket-item-meta">
        <span>✉️ {ticket.user_email}</span>
        <span>💬 {ticket.message_count} msgs</span>
      </div>
      {ticket.assigned_to_name && (
        <span className="sd-ticket-assigned">👤 {ticket.assigned_to_name}</span>
      )}
      {ticket.escalation_reason && (
        <span className="sd-ticket-escalation-note">
          ↑ {ticket.escalation_reason.slice(0, 60)}{ticket.escalation_reason.length > 60 ? '…' : ''}
        </span>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ConvMessage({ msg }) {
  const isUser    = msg.sender === 'user';
  const isSupport = msg.sender === 'support';

  return (
    <div className={`sd-msg sd-msg--${msg.sender}`}>
      <div className="sd-msg-meta">
        <span className="sd-msg-sender">
          {isUser ? '👤 Guest' : isSupport ? '🛎 Support' : '🤖 Bot'}
        </span>
        <span className="sd-msg-time">
          {new Date(msg.timestamp).toLocaleString()}
        </span>
      </div>
      <div className={`sd-msg-bubble sd-msg-bubble--${msg.sender}`}>
        {msg.message_text}
      </div>
    </div>
  );
}

// ─── Routing timeline ─────────────────────────────────────────────────────────

function RoutingTimeline({ ticket }) {
  const chain = ['front_desk', 'manager', 'admin'];
  const currentIdx = chain.indexOf(ticket.tier);

  return (
    <div className="sd-routing-timeline">
      {chain.map((tier, idx) => {
        const cfg     = TIER_CONFIG[tier];
        const isPast  = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={tier} className={`sd-timeline-node ${isCurrent ? 'sd-timeline-node--active' : ''} ${isPast ? 'sd-timeline-node--past' : ''}`}>
            <div className="sd-timeline-dot" style={{ background: isCurrent ? cfg.color : isPast ? `${cfg.color}50` : 'transparent', borderColor: cfg.color }}>
              {isCurrent ? '●' : isPast ? '✓' : '○'}
            </div>
            <span className="sd-timeline-label" style={{ color: isCurrent ? cfg.color : isPast ? `${cfg.color}80` : 'rgba(248,246,240,0.3)' }}>
              {cfg.icon} {cfg.label}
            </span>
            {idx < chain.length - 1 && (
              <div className={`sd-timeline-line ${isPast || isCurrent ? 'sd-timeline-line--active' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main SupportDashboard ────────────────────────────────────────────────────

export default function SupportDashboard() {
  const [tickets,       setTickets]       = useState([]);
  const [activeTicket,  setActiveTicket]  = useState(null);
  const [conversation,  setConversation]  = useState(null);
  const [replyText,     setReplyText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [viewerRole,    setViewerRole]    = useState('');
  const [filters,       setFilters]       = useState({ status: '', tier: '', priority: '', category: '' });
  const [showEscalate,  setShowEscalate]  = useState(false);
  const [escalating,    setEscalating]    = useState(false);
  const bottomRef = useRef(null);

  // ── Load tickets ────────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    try {
      const data = await getSupportTickets(filters);
      setTickets(data.tickets || []);
      if (data.viewer_role) setViewerRole(data.viewer_role);
    } catch {
      setError('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Auto-refresh every 15s ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(loadTickets, 15_000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  // ── Open ticket detail ──────────────────────────────────────────────────────
  const openTicket = useCallback(async (ticket) => {
    setActiveTicket(ticket);
    setConversation(null);
    try {
      const data = await getSupportTicketDetail(ticket.id);
      setActiveTicket(data.ticket);
      setConversation(data.conversation);
    } catch {
      setError('Failed to load conversation.');
    }
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // ── Send reply ───────────────────────────────────────────────────────────────
  const handleReply = useCallback(async () => {
    if (!replyText.trim() || sending || !activeTicket) return;
    setSending(true);
    try {
      const data = await replyToTicket(activeTicket.id, replyText.trim());
      setReplyText('');
      setActiveTicket(data.ticket);
      setConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), data.message],
      }));
      loadTickets();
    } catch {
      setError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  }, [replyText, sending, activeTicket, loadTickets]);

  // ── Close ticket ─────────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (!activeTicket || !window.confirm('Close this support ticket?')) return;
    try {
      const updated = await closeTicket(activeTicket.id);
      setActiveTicket(updated);
      loadTickets();
    } catch {
      setError('Failed to close ticket.');
    }
  }, [activeTicket, loadTickets]);

  // ── Escalate ticket ──────────────────────────────────────────────────────────
  const handleEscalate = useCallback(async (reason) => {
    if (!activeTicket) return;
    setEscalating(true);
    try {
      const data = await escalateTicket(activeTicket.id, reason);
      setActiveTicket(data.ticket);
      setShowEscalate(false);
      loadTickets();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to escalate ticket.');
    } finally {
      setEscalating(false);
    }
  }, [activeTicket, loadTickets]);

  // ── Filter helpers ────────────────────────────────────────────────────────────
  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: f[key] === val ? '' : val }));

  const roleLabel = {
    admin:        'Admin — All Tickets',
    manager:      'Manager — Manager & Admin Tiers',
    front_desk:   'Front Desk — Front Desk Tickets',
    receptionist: 'Receptionist — Front Desk Tickets',
  }[viewerRole] || 'Support Tickets';

  return (
    <div className="sd-page">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="sd-header">
        <div>
          <h1 className="sd-title">Support Tickets</h1>
          <p className="sd-subtitle">{roleLabel}</p>
        </div>

        <div className="sd-filter-section">
          {/* Status filters */}
          <div className="sd-filter-group">
            <span className="sd-filter-label">Status</span>
            <div className="sd-filter-row">
              {['', 'open', 'in_progress', 'escalated', 'closed'].map((s) => (
                <button
                  key={s}
                  className={`sd-filter-btn ${filters.status === s ? 'sd-filter-btn--active' : ''}`}
                  onClick={() => setFilter('status', s)}
                >
                  {s === '' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filters */}
          <div className="sd-filter-group">
            <span className="sd-filter-label">Priority</span>
            <div className="sd-filter-row">
              {['low', 'normal', 'high', 'critical'].map((p) => (
                <button
                  key={p}
                  className={`sd-filter-btn ${filters.priority === p ? 'sd-filter-btn--active' : ''}`}
                  style={filters.priority === p ? { color: PRIORITY_CONFIG[p]?.color, borderColor: PRIORITY_CONFIG[p]?.color } : {}}
                  onClick={() => setFilter('priority', p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tier filters — only show tiers the viewer can access */}
          {viewerRole === 'admin' && (
            <div className="sd-filter-group">
              <span className="sd-filter-label">Tier</span>
              <div className="sd-filter-row">
                {['front_desk', 'manager', 'admin'].map((t) => (
                  <button
                    key={t}
                    className={`sd-filter-btn ${filters.tier === t ? 'sd-filter-btn--active' : ''}`}
                    style={filters.tier === t ? { color: TIER_CONFIG[t]?.color, borderColor: TIER_CONFIG[t]?.color } : {}}
                    onClick={() => setFilter('tier', t)}
                  >
                    {TIER_CONFIG[t]?.icon} {TIER_CONFIG[t]?.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="sd-refresh-btn" onClick={loadTickets} title="Refresh">↻</button>
        </div>
      </div>

      {error && (
        <div className="sd-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>
      )}

      <div className="sd-body">
        {/* ── Ticket list ──────────────────────────────────────────────────── */}
        <div className="sd-ticket-list">
          {loading ? (
            <div className="sd-empty">Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div className="sd-empty">
              <span>✅</span>
              <p>No tickets in your queue</p>
            </div>
          ) : (
            tickets.map((t) => (
              <TicketListItem
                key={t.id}
                ticket={t}
                isActive={activeTicket?.id === t.id}
                onClick={() => openTicket(t)}
              />
            ))
          )}
        </div>

        {/* ── Conversation panel ────────────────────────────────────────────── */}
        <div className="sd-conv-panel">
          {!activeTicket ? (
            <div className="sd-conv-empty">
              <span className="sd-conv-empty-icon">💬</span>
              <p>Select a ticket to view the conversation</p>
            </div>
          ) : (
            <>
              {/* Ticket info bar */}
              <div className="sd-conv-header">
                <div className="sd-conv-header-left">
                  <span className="sd-conv-ticket-id">Ticket #{activeTicket.id}</span>
                  <StatusBadge status={activeTicket.status} />
                  <TierBadge tier={activeTicket.tier} />
                  <PriorityBadge priority={activeTicket.priority} />
                  <span className="sd-conv-user">✉️ {activeTicket.user_email}</span>
                </div>
                <div className="sd-conv-actions">
                  {/* Escalate button — only when can_escalate and ticket is in viewer's scope */}
                  {activeTicket.can_escalate && activeTicket.status !== 'closed' && (
                    <button
                      className="sd-escalate-btn"
                      onClick={() => setShowEscalate(true)}
                      title={`Escalate to ${TIER_CONFIG[activeTicket.next_tier]?.label || 'next tier'}`}
                    >
                      ↑ Escalate to {TIER_CONFIG[activeTicket.next_tier]?.label || 'Next Tier'}
                    </button>
                  )}
                  {activeTicket.status !== 'closed' && (
                    <button className="sd-close-btn" onClick={handleClose}>
                      Close Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Routing timeline */}
              <div className="sd-routing-bar">
                <RoutingTimeline ticket={activeTicket} />
                <div className="sd-routing-meta">
                  <CategoryTag category={activeTicket.category} />
                  {activeTicket.escalated_by_name && (
                    <span className="sd-escalation-by">
                      Escalated by {activeTicket.escalated_by_name}
                      {activeTicket.escalation_reason && ` — "${activeTicket.escalation_reason}"`}
                    </span>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div className="sd-conv-subject">📋 {activeTicket.subject || 'No subject'}</div>

              {/* Messages */}
              <div className="sd-conv-messages">
                {!conversation ? (
                  <div className="sd-empty">Loading conversation…</div>
                ) : conversation.messages?.length === 0 ? (
                  <div className="sd-empty">No messages yet.</div>
                ) : (
                  conversation.messages?.map((msg) => (
                    <ConvMessage key={msg.id} msg={msg} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              {activeTicket.status !== 'closed' && (
                <div className="sd-reply-box">
                  <textarea
                    className="sd-reply-input"
                    placeholder="Type your reply to the guest…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply();
                    }}
                    rows={3}
                    disabled={sending}
                  />
                  <div className="sd-reply-actions">
                    <span className="sd-reply-hint">Ctrl + Enter to send</span>
                    <button
                      className="sd-reply-btn"
                      onClick={handleReply}
                      disabled={sending || !replyText.trim()}
                    >
                      {sending ? 'Sending…' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Escalation modal ─────────────────────────────────────────────────── */}
      {showEscalate && activeTicket && (
        <EscalateModal
          ticket={activeTicket}
          onConfirm={handleEscalate}
          onCancel={() => setShowEscalate(false)}
          loading={escalating}
        />
      )}
    </div>
  );
}