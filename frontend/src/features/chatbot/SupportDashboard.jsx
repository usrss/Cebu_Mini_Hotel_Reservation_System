/**
 * src/features/chatbot/SupportDashboard.jsx
 *
 * Admin/Manager support ticket dashboard.
 * Route: /admin/support  (add to AdminPanelRoutes.jsx)
 *
 * Features:
 *  - List open/in-progress support tickets
 *  - Open a ticket to see full conversation
 *  - Reply as support agent
 *  - Close or assign tickets
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSupportTickets,
  getSupportTicketDetail,
  replyToTicket,
  closeTicket,
  assignTicket,
} from '../../services/chatApi';
import './SupportDashboard.css';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    open:        { label: 'Open',        color: '#FCD34D' },
    in_progress: { label: 'In Progress', color: '#6EE7B7' },
    closed:      { label: 'Closed',      color: '#9ca3af' },
  };
  const { label, color } = cfg[status] || cfg.open;
  return (
    <span
      className="sd-status-badge"
      style={{ color, borderColor: `${color}40`, background: `${color}10` }}
    >
      {label}
    </span>
  );
}

// ─── Ticket list item ─────────────────────────────────────────────────────────
function TicketListItem({ ticket, isActive, onClick }) {
  return (
    <button
      className={`sd-ticket-item ${isActive ? 'sd-ticket-item--active' : ''}`}
      onClick={onClick}
    >
      <div className="sd-ticket-item-top">
        <span className="sd-ticket-id">#{ticket.id}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="sd-ticket-subject">{ticket.subject || 'No subject'}</p>
      <div className="sd-ticket-item-meta">
        <span>✉️ {ticket.user_email}</span>
        <span>💬 {ticket.message_count} msgs</span>
      </div>
      {ticket.assigned_to_name && (
        <span className="sd-ticket-assigned">👤 {ticket.assigned_to_name}</span>
      )}
    </button>
  );
}

// ─── Message bubble (read-only) ───────────────────────────────────────────────
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

// ─── Main SupportDashboard ────────────────────────────────────────────────────
export default function SupportDashboard() {
  const [tickets,       setTickets]       = useState([]);
  const [activeTicket,  setActiveTicket]  = useState(null);
  const [conversation,  setConversation]  = useState(null);
  const [replyText,     setReplyText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [filterStatus,  setFilterStatus]  = useState('');
  const [error,         setError]         = useState(null);
  const bottomRef = useRef(null);

  // ── Load tickets ────────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    try {
      const data = await getSupportTickets(filterStatus);
      setTickets(data.tickets || []);
    } catch {
      setError('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Poll for updates every 15s ──────────────────────────────────────────────
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

  // Scroll to bottom when conversation loads
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
      // Append new message to conversation
      setConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), data.message],
      }));
      // Refresh ticket list
      loadTickets();
    } catch {
      setError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  }, [replyText, sending, activeTicket, loadTickets]);

  // ── Close ticket ────────────────────────────────────────────────────────────
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

  return (
    <div className="sd-page">
      <div className="sd-header">
        <div>
          <h1 className="sd-title">Support Tickets</h1>
          <p className="sd-subtitle">Manage guest support conversations</p>
        </div>
        <div className="sd-filter-row">
          {['', 'open', 'in_progress', 'closed'].map((s) => (
            <button
              key={s}
              className={`sd-filter-btn ${filterStatus === s ? 'sd-filter-btn--active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === '' ? 'All Active' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button className="sd-refresh-btn" onClick={loadTickets} title="Refresh">
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="sd-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>
      )}

      <div className="sd-body">
        {/* ── Ticket list ─────────────────────────────────────────────────── */}
        <div className="sd-ticket-list">
          {loading ? (
            <div className="sd-empty">Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div className="sd-empty">
              <span>✅</span>
              <p>No open tickets</p>
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

        {/* ── Conversation panel ───────────────────────────────────────────── */}
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
                  <span className="sd-conv-user">✉️ {activeTicket.user_email}</span>
                </div>
                {activeTicket.status !== 'closed' && (
                  <button className="sd-close-btn" onClick={handleClose}>
                    Close Ticket
                  </button>
                )}
              </div>

              {/* Subject */}
              <div className="sd-conv-subject">
                📋 {activeTicket.subject || 'No subject'}
              </div>

              {/* Messages */}
              <div className="sd-conv-messages">
                {!conversation ? (
                  <div className="sd-empty">Loading conversation…</div>
                ) : conversation.messages.length === 0 ? (
                  <div className="sd-empty">No messages yet.</div>
                ) : (
                  conversation.messages.map((msg) => (
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
    </div>
  );
}