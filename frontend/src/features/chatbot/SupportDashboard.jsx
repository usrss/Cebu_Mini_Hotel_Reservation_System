/**
 * SupportDashboard.jsx — Revised
 * Matches FrontDeskDashboard light theme (DM Sans / DM Serif Display, fd- tokens).
 * Lucide icons only — no emoji. Real-time auto-poll every 15s.
 * No back button, no refresh button, no arrow symbols.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Send, ArrowUpCircle, CheckCircle2,
  AlertCircle, User, Bot, Headphones, Shield, X,
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

const TIER_CONFIG = {
  front_desk: { label: 'Front Desk', cls: 'fd-badge-green'  },
  manager:    { label: 'Manager',    cls: 'fd-badge-blue'   },
  admin:      { label: 'Admin',      cls: 'fd-badge-red'    },
};

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
  booking_inquiry:  'Booking',
  payment_issue:    'Payment',
  room_complaint:   'Room',
  cancellation:     'Cancellation',
  vip_request:      'VIP',
  technical_error:  'Technical',
  general_inquiry:  'General',
  security_concern: 'Security',
  other:            'Other',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.front_desk;
  return <span className={`fd-badge ${cfg.cls}`}>{cfg.label}</span>;
}

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

// ─── Routing timeline ─────────────────────────────────────────────────────────

function RoutingTimeline({ ticket }) {
  const chain = ['front_desk', 'manager', 'admin'];
  const currentIdx = chain.indexOf(ticket.tier);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {chain.map((tier, idx) => {
        const cfg       = TIER_CONFIG[tier];
        const isPast    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              opacity: isCurrent ? 1 : isPast ? 0.6 : 0.3,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isCurrent ? 'var(--fd-accent)' : isPast ? 'var(--fd-text-muted)' : 'var(--fd-surface-3)',
              }} />
              <span style={{ fontSize: 10, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--fd-text)' : 'var(--fd-text-muted)' }}>
                {cfg.label}
              </span>
            </div>
            {idx < chain.length - 1 && (
              <div style={{ width: 20, height: 1, background: isPast ? 'var(--fd-text-muted)' : 'var(--fd-surface-3)', margin: '0 6px', opacity: 0.5 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Escalation modal ─────────────────────────────────────────────────────────

function EscalateModal({ ticket, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  const nextLabel = ticket?.next_tier ? (TIER_CONFIG[ticket.next_tier]?.label || ticket.next_tier) : 'higher tier';

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
            Escalate Ticket #{ticket?.id}
          </span>
          <button onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 7, background: '#E4E6ED', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13, color: '#52515E', marginBottom: 14, lineHeight: 1.6 }}>
            This ticket will be escalated to <strong>{nextLabel}</strong>. Provide context so they can respond effectively.
          </p>
          <textarea
            className="fd-textarea-lg"
            placeholder="Reason for escalation (optional but recommended)"
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
            disabled={loading}
            className="fd-btn fd-btn-primary"
            style={{ padding: '9px 16px' }}
          >
            {loading ? 'Escalating…' : `Escalate to ${nextLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket list item ─────────────────────────────────────────────────────────

function TicketListItem({ ticket, isActive, onClick }) {
  const priorityColor = ticket.priority === 'critical'
    ? 'var(--fd-red)'
    : ticket.priority === 'high'
    ? 'var(--fd-amber)'
    : 'transparent';

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: isActive ? 'var(--fd-accent-lt)' : 'transparent',
        border: 'none',
        borderLeft: `3px solid ${isActive ? 'var(--fd-accent)' : priorityColor}`,
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
        <StatusBadge status={ticket.status} />
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--fd-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {ticket.subject || 'No subject'}
      </p>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
        <TierBadge tier={ticket.tier} />
        <PriorityBadge priority={ticket.priority} />
        <CategoryTag category={ticket.category} />
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--fd-text-faint)' }}>
        <span>{ticket.user_email}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <MessageSquare size={10} /> {ticket.message_count}
        </span>
      </div>
      {ticket.escalation_reason && (
        <span style={{ fontSize: 10, color: 'var(--fd-blue)', marginTop: 3, display: 'block', fontStyle: 'italic' }}>
          {ticket.escalation_reason.slice(0, 60)}{ticket.escalation_reason.length > 60 ? '…' : ''}
        </span>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ConvMessage({ msg }) {
  const isSupport = msg.sender === 'support';
  const isBot     = msg.sender === 'bot';
  const Icon = msg.sender === 'user' ? User : isSupport ? Headphones : Bot;
  const senderLabel = msg.sender === 'user' ? 'Guest' : isSupport ? 'Support' : 'Bot';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isSupport ? 'flex-end' : 'flex-start',
      gap: 4, maxWidth: '72%',
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
        fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word',
        background: isSupport ? 'var(--fd-accent)' : isBot ? 'var(--fd-surface-2)' : '#fff',
        color: isSupport ? '#fff' : 'var(--fd-text)',
        boxShadow: 'var(--fd-shadow-xs)',
        fontStyle: isBot ? 'italic' : 'normal',
      }}>
        {msg.message_text}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SupportDashboard() {
  const [tickets,      setTickets]      = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [replyText,    setReplyText]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [viewerRole,   setViewerRole]   = useState('');
  const [filters,      setFilters]      = useState({ status: '', tier: '', priority: '' });
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalating,   setEscalating]   = useState(false);
  const bottomRef = useRef(null);

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
  useEffect(() => {
    const iv = setInterval(loadTickets, 5_000);
    return () => clearInterval(iv);
  }, [loadTickets]);

  // Auto-poll active conversation every 10s
useEffect(() => {
  if (!activeTicket) return;

  const iv = setInterval(async () => {
    try {
      const data = await getSupportTicketDetail(activeTicket.id);
      setActiveTicket(data.ticket);
      setConversation(data.conversation);
    } catch {
      // silently fail — don't show error on background poll
    }
  }, 5_000);

  return () => clearInterval(iv);
}, [activeTicket?.id]); // re-run when a different ticket is opened

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
    if (!activeTicket || !window.confirm('Close this support ticket?')) return;
    try {
      const updated = await closeTicket(activeTicket.id);
      setActiveTicket(updated);
      loadTickets();
    } catch {
      setError('Failed to close ticket.');
    }
  }, [activeTicket, loadTickets]);

  const handleEscalate = useCallback(async (reason) => {
    if (!activeTicket) return;
    setEscalating(true);
    try {
      const data = await escalateTicket(activeTicket.id, reason);
      setActiveTicket(data.ticket);
      setShowEscalate(false);
      loadTickets();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to escalate.');
    } finally {
      setEscalating(false);
    }
  }, [activeTicket, loadTickets]);

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: f[key] === val ? '' : val }));
  const isClosed    = activeTicket?.status === 'closed';
  const isEscalated = activeTicket?.status === 'escalated';
  const canAct      = activeTicket && !isClosed && !isEscalated;

  const roleLabel = {
    admin:        'Admin — All Tickets',
    manager:      'Manager Tier',
    front_desk:   'Front Desk Tier',
    receptionist: 'Front Desk Tier',
  }[viewerRole] || 'Support Tickets';

  const STATUS_OPTIONS = ['', 'open', 'in_progress', 'escalated', 'closed'];
  const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'critical'];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
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
          <p className="fd-eyebrow" style={{ marginBottom: 2 }}>Admin</p>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, fontWeight: 400, margin: 0, color: 'var(--fd-text)' }}>
            Support Tickets
          </h1>
          <p style={{ fontSize: 12, color: 'var(--fd-text-muted)', margin: 0 }}>{roleLabel}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fd-text-faint)' }}>Status</span>
            <div className="fd-status-tabs" style={{ marginBottom: 0 }}>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`fd-status-tab${filters.status === s ? ' active' : ''}`}
                  onClick={() => setFilter('status', s)}
                >
                  {s === '' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fd-text-faint)' }}>Priority</span>
            <div className="fd-status-tabs" style={{ marginBottom: 0 }}>
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p}
                  className={`fd-status-tab${filters.priority === p ? ' active' : ''}`}
                  onClick={() => setFilter('priority', p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tier filters (admin only) */}
          {viewerRole === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fd-text-faint)' }}>Tier</span>
              <div className="fd-status-tabs" style={{ marginBottom: 0 }}>
                {['front_desk', 'manager', 'admin'].map(t => (
                  <button
                    key={t}
                    className={`fd-status-tab${filters.tier === t ? ' active' : ''}`}
                    onClick={() => setFilter('tier', t)}
                  >
                    {TIER_CONFIG[t]?.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fd-notice fd-notice-error" style={{ margin: 0, borderRadius: 0 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden' }}>

        {/* Ticket list */}
        <div style={{ borderRight: '1px solid var(--fd-surface-2)', overflowY: 'auto', background: '#fff' }}>
          {loading ? (
            <div className="fd-loading" style={{ minHeight: 200 }}><div className="fd-spinner" /></div>
          ) : tickets.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 20px', color: 'var(--fd-text-faint)', textAlign: 'center' }}>
              <CheckCircle2 size={32} style={{ opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>No tickets found</p>
            </div>
          ) : (
            tickets.map(t => (
              <TicketListItem key={t.id} ticket={t} isActive={activeTicket?.id === t.id} onClick={() => openTicket(t)} />
            ))
          )}
        </div>

        {/* Conversation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--fd-surface-2)' }}>
          {!activeTicket ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--fd-text-faint)' }}>
              <MessageSquare size={40} style={{ opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Select a ticket to view the conversation</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                background: '#fff',
                borderBottom: '1px solid var(--fd-surface-2)',
                padding: '12px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8, flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fd-text)' }}>#{activeTicket.id}</span>
                  <StatusBadge status={activeTicket.status} />
                  <TierBadge tier={activeTicket.tier} />
                  <PriorityBadge priority={activeTicket.priority} />
                  <CategoryTag category={activeTicket.category} />
                  <span style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>{activeTicket.user_email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {activeTicket.can_escalate && activeTicket.status !== 'closed' && (
                    <button className="fd-btn" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowEscalate(true)}>
                      <ArrowUpCircle size={13} /> Escalate to {TIER_CONFIG[activeTicket.next_tier]?.label || 'Next Tier'}
                    </button>
                  )}
                  {activeTicket.status !== 'closed' && (
                    <button className="fd-btn fd-btn-primary" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={handleClose}>
                      <CheckCircle2 size={13} /> Close
                    </button>
                  )}
                </div>
              </div>

              {/* Routing timeline */}
              <div style={{
                background: '#fff',
                borderBottom: '1px solid var(--fd-surface-2)',
                padding: '8px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, flexWrap: 'wrap', flexShrink: 0,
              }}>
                <RoutingTimeline ticket={activeTicket} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <CategoryTag category={activeTicket.category} />
                  {activeTicket.escalated_by_name && (
                    <span style={{ fontSize: 10, color: 'var(--fd-blue)', fontStyle: 'italic' }}>
                      Escalated by {activeTicket.escalated_by_name}
                      {activeTicket.escalation_reason && ` — "${activeTicket.escalation_reason}"`}
                    </span>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div style={{ padding: '8px 20px', background: 'var(--fd-surface-2)', borderBottom: '1px solid var(--fd-surface-3)', flexShrink: 0, fontSize: 12, color: 'var(--fd-text-muted)' }}>
                {activeTicket.subject || 'No subject'}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              {activeTicket.status !== 'closed' && (
                <div style={{ borderTop: '1px solid var(--fd-surface-2)', background: '#fff', padding: '14px 20px', flexShrink: 0 }}>
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
                  padding: '12px 20px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                  color: '#0D9488', background: 'rgba(13,148,136,0.07)',
                  borderTop: '1px solid var(--fd-surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
                }}>
                  <CheckCircle2 size={14} /> Ticket resolved and closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>

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