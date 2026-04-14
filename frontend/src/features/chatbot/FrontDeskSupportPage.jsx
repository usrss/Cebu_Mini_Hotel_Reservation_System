/**
 * FrontDeskSupportPage.jsx — Revised
 * Matches FrontDeskDashboard light theme (DM Sans / DM Serif Display, fd- tokens).
 * Lucide icons only — no emoji. Real-time auto-poll every 20s.
 * No back button, no refresh button, no arrow symbols.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Send, ArrowUpCircle, CheckCircle2,
  AlertCircle, Clock, User, Bot, Headphones, X, ChevronRight,
} from 'lucide-react';
import {
  getSupportTickets,
  getSupportTicketDetail,
  replyToTicket,
  closeTicket,
  escalateTicket,
} from '../../services/chatApi';
import '../staff/frontdesk/FrontDesk.css';
import '../staff/Staff.css';

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      cls: 'fd-badge-muted'  },
  normal:   { label: 'Normal',   cls: 'fd-badge-green'  },
  high:     { label: 'High',     cls: 'fd-badge-amber'  },
  critical: { label: 'Critical', cls: 'fd-badge-red'    },
};

const STATUS_CONFIG = {
  open:        { label: 'Open',        cls: 'fd-badge-amber' },
  in_progress: { label: 'In Progress', cls: 'fd-badge-blue'  },
  escalated:   { label: 'Escalated',   cls: 'fd-badge-red'   },
  closed:      { label: 'Closed',      cls: 'fd-badge-muted' },
};

const CATEGORY_LABELS = {
  booking_inquiry:  'Booking Inquiry',
  payment_issue:    'Payment Issue',
  room_complaint:   'Room Complaint',
  cancellation:     'Cancellation',
  vip_request:      'VIP Request',
  technical_error:  'Technical Error',
  general_inquiry:  'General Inquiry',
  security_concern: 'Security',
  other:            'Other',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return <span className={`fd-badge ${cfg.cls}`}>{cfg.label}</span>;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return <span className={`fd-badge ${cfg.cls}`}>{cfg.label}</span>;
}

function CategoryTag({ category }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      background: 'var(--fd-accent-lt)', color: 'var(--fd-text-muted)',
      borderRadius: 'var(--fd-radius-sm)',
    }}>
      {CATEGORY_LABELS[category] || category}
    </span>
  );
}

// ─── Escalation Modal ─────────────────────────────────────────────────────────

function EscalateModal({ ticketId, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 440,
        boxShadow: '0 8px 40px rgba(1,0,13,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid #F2F3F7', background: '#F2F3F7',
        }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 400, color: '#01000D' }}>
            Escalate Ticket #{ticketId}
          </span>
          <button onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 7, background: '#E4E6ED', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13, color: '#52515E', marginBottom: 14, lineHeight: 1.6 }}>
            This ticket will be escalated to the Manager team. Describe why so the Manager has context.
          </p>
          <textarea
            className="fd-textarea-lg"
            placeholder="Reason for escalation (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
          />
        </div>
        <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} className="fd-btn" style={{ padding: '9px 16px' }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading || !reason.trim()}
            className="fd-btn fd-btn-primary"
            style={{ padding: '9px 16px' }}
          >
            {loading ? 'Escalating…' : 'Escalate to Manager'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket list item ─────────────────────────────────────────────────────────

function TicketItem({ ticket, isActive, onClick }) {
  const isUrgent = ticket.priority === 'critical' || ticket.priority === 'high';
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: isActive ? 'var(--fd-accent-lt)' : 'transparent',
        border: 'none',
        borderLeft: `3px solid ${isActive ? 'var(--fd-accent)' : isUrgent ? 'var(--fd-amber)' : 'transparent'}`,
        borderBottom: '1px solid var(--fd-surface-2)',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        fontFamily: "'DM Sans', sans-serif",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--fd-surface-2)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fd-text-muted)', letterSpacing: '0.04em' }}>
          #{ticket.id}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--fd-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {ticket.subject || 'No subject'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <CategoryTag category={ticket.category} />
        <span style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>{ticket.user_email}</span>
        <span style={{ fontSize: 11, color: 'var(--fd-text-faint)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <MessageSquare size={10} /> {ticket.message_count}
        </span>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ConvMessage({ msg }) {
  const isUser    = msg.sender === 'user';
  const isSupport = msg.sender === 'support';
  const isBot     = msg.sender === 'bot';

  const Icon = isUser ? User : isSupport ? Headphones : Bot;
  const senderLabel = isUser ? 'Guest' : isSupport ? 'You' : 'Bot';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isSupport ? 'flex-end' : 'flex-start',
      gap: 4,
      maxWidth: '72%',
      alignSelf: isSupport ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={10} style={{ color: 'var(--fd-text-faint)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {senderLabel}
        </span>
        <span style={{ fontSize: 10, color: 'var(--fd-text-faint)' }}>
          {new Date(msg.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{
        padding: '10px 14px',
        borderRadius: isSupport ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
        background: isSupport
          ? 'var(--fd-accent)'
          : isBot
          ? 'var(--fd-surface-2)'
          : 'var(--fd-surface)',
        color: isSupport ? '#fff' : 'var(--fd-text)',
        boxShadow: 'var(--fd-shadow-xs)',
        fontStyle: isBot ? 'italic' : 'normal',
      }}>
        {msg.message_text}
      </div>
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

  const loadTickets = useCallback(async () => {
    try {
      const data = await getSupportTickets({ tier: 'front_desk', status: statusFilter });
      setTickets(data.tickets || []);
    } catch {
      setError('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => {
    const iv = setInterval(loadTickets, 20_000);
    return () => clearInterval(iv);
  }, [loadTickets]);

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

  const handleReply = useCallback(async () => {
    if (!replyText.trim() || sending || !activeTicket) return;
    setSending(true);
    try {
      const data = await replyToTicket(activeTicket.id, replyText.trim());
      setReplyText('');
      setActiveTicket(data.ticket);
      setConversation(prev => ({ ...prev, messages: [...(prev?.messages || []), data.message] }));
      loadTickets();
    } catch {
      setError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  }, [replyText, sending, activeTicket, loadTickets]);

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

  const openCount   = tickets.filter(t => t.status !== 'closed').length;
  const urgentCount = tickets.filter(t => ['high', 'critical'].includes(t.priority) && t.status !== 'closed').length;

  const STATUS_FILTERS = [
    { value: '',            label: 'All'         },
    { value: 'open',        label: 'Open'        },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'closed',      label: 'Closed'      },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--fd-bg)',
      fontFamily: "'DM Sans', sans-serif",
      color: 'var(--fd-text)',
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid var(--fd-surface-2)',
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        flexShrink: 0,
      }}>
        <div>
          <p className="fd-eyebrow" style={{ marginBottom: 2 }}>Front Desk</p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, fontWeight: 400, margin: 0, color: 'var(--fd-text)' }}>
            Guest Support
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* KPI pills */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="fd-card" style={{ padding: '8px 16px', marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: 'var(--fd-text)' }}>{openCount}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fd-text-muted)' }}>Open</span>
            </div>
            {urgentCount > 0 && (
              <div className="fd-card" style={{ padding: '8px 16px', marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60, background: 'var(--fd-amber-bg)' }}>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: 'var(--fd-amber)' }}>{urgentCount}</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fd-amber)' }}>Urgent</span>
              </div>
            )}
          </div>

          {/* Status filters */}
          <div className="fd-status-tabs" style={{ marginBottom: 0 }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                className={`fd-status-tab${statusFilter === f.value ? ' active' : ''}`}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="fd-notice fd-notice-error" style={{ margin: '0 28px 0', borderRadius: 0, marginBottom: 0 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden' }}>

        {/* ── Ticket list ─────────────────────────────────────────────── */}
        <div style={{
          borderRight: '1px solid var(--fd-surface-2)',
          overflowY: 'auto',
          background: '#fff',
        }}>
          {loading ? (
            <div className="fd-loading" style={{ minHeight: 200 }}><div className="fd-spinner" /></div>
          ) : tickets.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 20px', color: 'var(--fd-text-faint)', textAlign: 'center' }}>
              <CheckCircle2 size={32} style={{ opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>No open tickets</p>
              <p style={{ margin: 0, fontSize: 11 }}>New guest requests will appear here</p>
            </div>
          ) : (
            tickets.map(t => (
              <TicketItem key={t.id} ticket={t} isActive={activeTicket?.id === t.id} onClick={() => openTicket(t)} />
            ))
          )}
        </div>

        {/* ── Conversation panel ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--fd-surface-2)' }}>
          {!activeTicket ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--fd-text-faint)' }}>
              <MessageSquare size={40} style={{ opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Select a ticket to start responding</p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div style={{
                background: '#fff',
                borderBottom: '1px solid var(--fd-surface-2)',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fd-text)' }}>#{activeTicket.id}</span>
                  <StatusBadge status={activeTicket.status} />
                  <PriorityBadge priority={activeTicket.priority} />
                  <CategoryTag category={activeTicket.category} />
                  <span style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>{activeTicket.user_email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {canAct && activeTicket.can_escalate && (
                    <button className="fd-btn" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowEscalate(true)}>
                      <ArrowUpCircle size={13} /> Escalate to Manager
                    </button>
                  )}
                  {canAct && (
                    <button className="fd-btn fd-btn-primary" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={handleClose}>
                      <CheckCircle2 size={13} /> Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div style={{ padding: '8px 20px', background: 'var(--fd-surface-2)', borderBottom: '1px solid var(--fd-surface-3)', flexShrink: 0, fontSize: 12, color: 'var(--fd-text-muted)' }}>
                {activeTicket.subject || 'No subject'}
              </div>

              {/* Escalation notice */}
              {isEscalated && (
                <div className="fd-notice fd-notice-amber" style={{ margin: '8px 20px', borderRadius: 'var(--fd-radius-md)' }}>
                  <ArrowUpCircle size={14} />
                  <span>Escalated to Manager.{activeTicket.escalation_reason && ` Reason: ${activeTicket.escalation_reason}`}</span>
                </div>
              )}

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                {!conversation ? (
                  <div className="fd-loading"><div className="fd-spinner" /></div>
                ) : conversation.messages?.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--fd-text-faint)', fontSize: 12, padding: '40px 0' }}>No messages yet.</div>
                ) : (
                  conversation.messages?.map(msg => <ConvMessage key={msg.id} msg={msg} />)
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              {canAct && (
                <div style={{
                  borderTop: '1px solid var(--fd-surface-2)',
                  background: '#fff',
                  padding: '14px 20px',
                  flexShrink: 0,
                }}>
                  <textarea
                    className="fd-textarea-lg"
                    placeholder="Reply to guest… (Ctrl + Enter to send)"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply(); }}
                    rows={3}
                    disabled={sending}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>Ctrl + Enter to send</span>
                    <button
                      className="fd-btn fd-btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      onClick={handleReply}
                      disabled={sending || !replyText.trim()}
                    >
                      <Send size={13} />
                      {sending ? 'Sending…' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}

              {isClosed && (
                <div style={{
                  padding: '12px 20px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--fd-green, #0D9488)',
                  background: 'var(--fd-green-bg)',
                  borderTop: '1px solid var(--fd-surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  flexShrink: 0,
                }}>
                  <CheckCircle2 size={14} /> Ticket resolved and closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>

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