/**
 * src/features/chatbot/FrontDeskSupportPage.jsx
 *
 * Support ticket page for Front Desk / Receptionist role.
 *
 * What Front Desk sees:
 *   - Only FRONT_DESK tier tickets assigned to them (backend enforces this)
 *   - Full conversation history per ticket
 *   - Reply to guest
 *   - Escalate to Manager (with required reason)
 *   - Close ticket when resolved
 *
 * What they do NOT see:
 *   - Manager-tier or Admin-tier tickets
 *   - Tier filter (irrelevant — they only have one tier)
 *   - Priority filter (shown as labels only, not as a routing control)
 *
 * Route: /front-desk/support  (or wherever FD panel lives)
 *
 * Usage:
 *   import FrontDeskSupportPage from './features/chatbot/FrontDeskSupportPage';
 *   <Route path="/front-desk/support" element={<FrontDeskSupportPage />} />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSupportTickets,
  getSupportTicketDetail,
  replyToTicket,
  closeTicket,
  escalateTicket,
} from '../../services/chatApi';
import './FrontDeskSupportPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Reusable badge components ────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <span className="fd-badge" style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className="fd-badge" style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
      {cfg.label}
    </span>
  );
}

function CategoryTag({ category }) {
  const icon  = CATEGORY_ICONS[category] || '📋';
  const label = category?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Other';
  return <span className="fd-category">{icon} {label}</span>;
}

// ─── Escalation Modal ─────────────────────────────────────────────────────────

function EscalateModal({ ticketId, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');

  return (
    <div className="fd-modal-overlay" onClick={onCancel}>
      <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fd-modal-header">
          <h3>Escalate Ticket #{ticketId} to Manager</h3>
          <button className="fd-modal-close" onClick={onCancel}>✕</button>
        </div>
        <p className="fd-modal-desc">
          Escalating sends this ticket to the <strong>Manager</strong> team.
          Please describe why you're escalating so the Manager has context.
        </p>
        <textarea
          className="fd-reply-input"
          placeholder="Reason for escalation (required)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          autoFocus
        />
        <div className="fd-modal-actions">
          <button className="fd-cancel-btn" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="fd-escalate-btn"
            onClick={() => onConfirm(reason)}
            disabled={loading || !reason.trim()}
          >
            {loading ? 'Escalating…' : '↑ Escalate to Manager'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket list item ─────────────────────────────────────────────────────────

function TicketItem({ ticket, isActive, onClick }) {
  return (
    <button
      className={`fd-ticket-item ${isActive ? 'fd-ticket-item--active' : ''} ${ticket.priority === 'critical' || ticket.priority === 'high' ? 'fd-ticket-item--urgent' : ''}`}
      onClick={onClick}
    >
      <div className="fd-ticket-top">
        <span className="fd-ticket-id">#{ticket.id}</span>
        <div className="fd-ticket-badges">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>
      <p className="fd-ticket-subject">{ticket.subject || 'No subject'}</p>
      <div className="fd-ticket-meta">
        <CategoryTag category={ticket.category} />
        <span className="fd-ticket-guest">✉️ {ticket.user_email}</span>
        <span className="fd-ticket-count">💬 {ticket.message_count}</span>
      </div>
      {ticket.assigned_to_name && (
        <span className="fd-ticket-assigned">👤 {ticket.assigned_to_name}</span>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ConvMessage({ msg }) {
  const isUser    = msg.sender === 'user';
  const isSupport = msg.sender === 'support';
  return (
    <div className={`fd-msg fd-msg--${msg.sender}`}>
      <div className="fd-msg-meta">
        <span className="fd-msg-sender">
          {isUser ? '👤 Guest' : isSupport ? '🛎 You (Support)' : '🤖 Bot'}
        </span>
        <span className="fd-msg-time">{new Date(msg.timestamp).toLocaleString()}</span>
      </div>
      <div className={`fd-msg-bubble fd-msg-bubble--${msg.sender}`}>
        {msg.message_text}
      </div>
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyQueue() {
  return (
    <div className="fd-empty-queue">
      <span>✅</span>
      <p>No open tickets in your queue</p>
      <small>New guest support requests will appear here automatically</small>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FrontDeskSupportPage() {
  const [tickets,      setTickets]      = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [replyText,    setReplyText]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error,        setError]        = useState(null);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalating,   setEscalating]   = useState(false);
  const bottomRef = useRef(null);

  // ── Load front-desk tier tickets ────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    try {
      const data = await getSupportTickets({
        tier:   'front_desk',
        status: statusFilter,
      });
      setTickets(data.tickets || []);
    } catch {
      setError('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Auto-refresh every 20s
  useEffect(() => {
    const interval = setInterval(loadTickets, 20_000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  // ── Open ticket ─────────────────────────────────────────────────────────────
  const openTicket = useCallback(async (ticket) => {
    setActiveTicket(ticket);
    setConversation(null);
    setReplyText('');
    try {
      const data = await getSupportTicketDetail(ticket.id);
      setActiveTicket(data.ticket);
      setConversation(data.conversation);
    } catch {
      setError('Failed to load conversation.');
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // ── Send reply ──────────────────────────────────────────────────────────────
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
    if (!activeTicket || !window.confirm('Mark this ticket as resolved and close it?')) return;
    try {
      const updated = await closeTicket(activeTicket.id);
      setActiveTicket(updated);
      loadTickets();
    } catch {
      setError('Failed to close ticket.');
    }
  }, [activeTicket, loadTickets]);

  // ── Escalate ticket to Manager ───────────────────────────────────────────────
  const handleEscalate = useCallback(async (reason) => {
    if (!activeTicket || !reason.trim()) return;
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

  const isClosed    = activeTicket?.status === 'closed';
  const isEscalated = activeTicket?.status === 'escalated';
  const canAct      = activeTicket && !isClosed && !isEscalated;

  // Count by priority for the header stats
  const urgentCount = tickets.filter(t => ['high', 'critical'].includes(t.priority) && t.status !== 'closed').length;
  const openCount   = tickets.filter(t => t.status !== 'closed').length;

  return (
    <div className="fd-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="fd-header">
        <div className="fd-header-left">
          <h1 className="fd-title">🛎 Guest Support</h1>
          <p className="fd-subtitle">Front Desk · Incoming guest tickets</p>
        </div>

        <div className="fd-header-stats">
          <div className="fd-stat">
            <span className="fd-stat-val">{openCount}</span>
            <span className="fd-stat-label">Open</span>
          </div>
          {urgentCount > 0 && (
            <div className="fd-stat fd-stat--urgent">
              <span className="fd-stat-val">{urgentCount}</span>
              <span className="fd-stat-label">Urgent</span>
            </div>
          )}
        </div>

        <div className="fd-filters">
          {['', 'open', 'in_progress', 'closed'].map((s) => (
            <button
              key={s}
              className={`fd-filter-btn ${statusFilter === s ? 'fd-filter-btn--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === '' ? 'All Active' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button className="fd-refresh-btn" onClick={loadTickets} title="Refresh">↻</button>
        </div>
      </div>

      {error && (
        <div className="fd-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>
      )}

      <div className="fd-body">
        {/* ── Ticket list ──────────────────────────────────────────────────── */}
        <div className="fd-ticket-list">
          {loading ? (
            <div className="fd-empty-queue"><span>⏳</span><p>Loading tickets…</p></div>
          ) : tickets.length === 0 ? (
            <EmptyQueue />
          ) : (
            tickets.map((t) => (
              <TicketItem
                key={t.id}
                ticket={t}
                isActive={activeTicket?.id === t.id}
                onClick={() => openTicket(t)}
              />
            ))
          )}
        </div>

        {/* ── Conversation panel ────────────────────────────────────────────── */}
        <div className="fd-conv-panel">
          {!activeTicket ? (
            <div className="fd-conv-placeholder">
              <span>💬</span>
              <p>Select a ticket to start responding</p>
            </div>
          ) : (
            <>
              {/* Ticket header */}
              <div className="fd-conv-header">
                <div className="fd-conv-header-info">
                  <span className="fd-conv-id">Ticket #{activeTicket.id}</span>
                  <StatusBadge status={activeTicket.status} />
                  <PriorityBadge priority={activeTicket.priority} />
                  <CategoryTag category={activeTicket.category} />
                  <span className="fd-conv-guest">✉️ {activeTicket.user_email}</span>
                </div>

                <div className="fd-conv-header-actions">
                  {/* Escalate — only when ticket is still active at FD level */}
                  {canAct && activeTicket.can_escalate && (
                    <button
                      className="fd-escalate-trigger"
                      onClick={() => setShowEscalate(true)}
                      title="Can't resolve? Pass to Manager"
                    >
                      ↑ Escalate to Manager
                    </button>
                  )}
                  {canAct && (
                    <button className="fd-close-trigger" onClick={handleClose}>
                      ✓ Resolve &amp; Close
                    </button>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div className="fd-conv-subject">📋 {activeTicket.subject || 'No subject'}</div>

              {/* Escalation notice */}
              {isEscalated && (
                <div className="fd-escalated-notice">
                  ↑ This ticket has been escalated to Manager.
                  {activeTicket.escalation_reason && (
                    <> Reason: <em>{activeTicket.escalation_reason}</em></>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="fd-conv-messages">
                {!conversation ? (
                  <div className="fd-empty-queue"><span>⏳</span><p>Loading…</p></div>
                ) : conversation.messages?.length === 0 ? (
                  <div className="fd-empty-queue"><span>💬</span><p>No messages yet.</p></div>
                ) : (
                  conversation.messages?.map((msg) => (
                    <ConvMessage key={msg.id} msg={msg} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply — only when active */}
              {canAct && (
                <div className="fd-reply-box">
                  <textarea
                    className="fd-reply-input"
                    placeholder="Type your reply to the guest… (Ctrl+Enter to send)"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply();
                    }}
                    rows={3}
                    disabled={sending}
                  />
                  <div className="fd-reply-actions">
                    <span className="fd-reply-hint">Ctrl + Enter to send</span>
                    <button
                      className="fd-reply-btn"
                      onClick={handleReply}
                      disabled={sending || !replyText.trim()}
                    >
                      {sending ? 'Sending…' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}

              {isClosed && (
                <div className="fd-closed-notice">✅ This ticket has been resolved and closed.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Escalation modal ─────────────────────────────────────────────────── */}
      {showEscalate && (
        <EscalateModal
          ticketId={activeTicket?.id}
          onConfirm={handleEscalate}
          onCancel={() => setShowEscalate(false)}
          loading={escalating}
        />
      )}
    </div>
  );
}