/**
 * src/features/chatbot/HistoryPanel.jsx
 *
 * Slide-in panel that lists all saved conversations.
 * Guest can:
 *   - See each conversation's subject, date, and ticket status
 *   - Click to resume — if ticket is not closed they can still send messages
 *   - Delete a conversation from local history
 *
 * Ticket status badge colours match FrontDesk.css tokens translated to
 * the editorial light palette.
 */

import { Trash2, MessageCircle, ChevronRight, Inbox } from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  open:        { label: 'Open',        bg: 'rgba(5,150,105,0.08)',   color: '#059669', border: 'rgba(5,150,105,0.25)' },
  in_progress: { label: 'In Progress', bg: 'rgba(24,95,165,0.08)',   color: '#185FA5', border: 'rgba(24,95,165,0.25)' },
  escalated:   { label: 'Escalated',   bg: 'rgba(186,117,23,0.08)',  color: '#BA7517', border: 'rgba(186,117,23,0.25)' },
  closed:      { label: 'Closed',      bg: 'rgba(1,0,13,0.05)',      color: '#909090', border: 'rgba(1,0,13,0.15)' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || {
    label: 'Chat', bg: 'rgba(1,0,13,0.05)', color: '#909090', border: 'rgba(1,0,13,0.12)',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px',
      fontSize: 9, fontWeight: 800,
      letterSpacing: '0.10em', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ─── Single conversation row ──────────────────────────────────────────────────
function ConvRow({ record, isActive, onResume, onDelete }) {
  const isClosed = record.ticketStatus === 'closed';
  const msgCount = record.messages?.length || 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: '1px solid rgba(1,0,13,0.07)',
        background: isActive ? '#F0EDE6' : '#fff',
        transition: 'background 0.15s',
        borderLeft: isActive ? '3px solid #01000D' : '3px solid transparent',
      }}
    >
      {/* Main clickable area */}
      <button
        onClick={onResume}
        disabled={false}  // always allow click — we show "closed" state inside
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          textAlign: 'left',
          padding: '12px 14px 12px 12px',
          cursor: 'pointer',
          minWidth: 0,
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        {/* Top row: subject + date */}
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 8, marginBottom: 5,
        }}>
          <p style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 12, fontWeight: 700,
            color: isClosed ? '#909090' : '#01000D',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {record.subject || 'Conversation'}
          </p>
          <span style={{
            fontSize: 9, fontWeight: 600, color: '#909090',
            letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {formatDate(record.updatedAt)}
          </span>
        </div>

        {/* Bottom row: status badge + message count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {record.ticketStatus ? (
            <StatusBadge status={record.ticketStatus} />
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 700, color: '#909090',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              <MessageCircle size={9} /> Bot chat
            </span>
          )}
          <span style={{ fontSize: 10, color: '#909090', fontWeight: 500 }}>
            {msgCount} {msgCount === 1 ? 'message' : 'messages'}
          </span>
          {isClosed && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#C0392B',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              · Read only
            </span>
          )}
        </div>
      </button>

      {/* Resume chevron / delete */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        paddingRight: 10, flexShrink: 0,
      }}>
        {!isClosed && (
          <ChevronRight size={14} style={{ color: '#909090' }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete from history"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 6px', color: '#C8C6C0',
            display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#C0392B'}
          onMouseLeave={e => e.currentTarget.style.color = '#C8C6C0'}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────
export default function HistoryPanel({ conversations, localId, onResume, onDelete }) {
  // Sort newest first
  const sorted = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      background: '#FAF9F6',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      fontFamily: "'Montserrat', sans-serif",
    }}>
      {/* Panel header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid rgba(1,0,13,0.10)',
        background: '#F0EDE6',
        flexShrink: 0,
      }}>
        <p style={{
          margin: 0,
          fontSize: 9, fontWeight: 900,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: '#909090', marginBottom: 2,
        }}>
          Conversation History
        </p>
        <p style={{
          margin: 0, fontSize: 11, color: '#535252', fontWeight: 500,
        }}>
          {sorted.length} {sorted.length === 1 ? 'conversation' : 'conversations'} saved
        </p>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
        {sorted.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '60px 20px',
            color: '#909090',
          }}>
            <Inbox size={32} style={{ opacity: 0.35 }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>No conversations yet</p>
            <p style={{ margin: 0, fontSize: 11 }}>Your chat history will appear here</p>
          </div>
        ) : (
          sorted.map(record => (
            <ConvRow
              key={record.localId}
              record={record}
              isActive={record.localId === localId}
              onResume={() => onResume(record)}
              onDelete={() => onDelete(record.localId)}
            />
          ))
        )}
      </div>

      {/* Footer note */}
      {sorted.length > 0 && (
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(1,0,13,0.07)',
          background: '#F0EDE6',
          fontSize: 9, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#909090', textAlign: 'center',
          flexShrink: 0,
        }}>
          Closed tickets are read-only · History saved on this device
        </div>
      )}
    </div>
  );
}