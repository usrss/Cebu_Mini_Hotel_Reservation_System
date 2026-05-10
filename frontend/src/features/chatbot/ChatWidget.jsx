/**
 * src/features/chatbot/ChatWidget.jsx
 *
 * Floating chat widget for hotel guests.
 * Mount via ChatWidgetWrapper.
 *
 * Changes:
 *  - Widget and toggle button are now draggable. Click and drag either one
 *    to reposition. A short movement (<= 5px) is treated as a click so the
 *    toggle still works normally. Position is clamped to the viewport and
 *    persisted to localStorage so it survives page reloads.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Hotel, MessageCircle, X, Send, RotateCcw,
  Headphones, Bot, AlertTriangle, Clock, History,
} from 'lucide-react';
import { useChatbot } from './useChatbot';
import MessageBubble from './MessageBubble';
import QuickReplies from './QuickReplies';
import HistoryPanel from './HistoryPanel';
import './ChatWidget.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const WIDGET_WIDTH   = 380;
const WIDGET_HEIGHT  = 580;
const TOGGLE_SIZE    = 56;
const EDGE_PADDING   = 16;
const STORAGE_KEY    = 'cmh_widget_pos';
const DRAG_THRESHOLD = 5; // px — movement below this is treated as a click

// ─── Persist / restore position ───────────────────────────────────────────────
function loadPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePosition(pos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {}
}

// Clamp so the toggle button never leaves the viewport
function clampPos(x, y) {
  const maxX = window.innerWidth  - TOGGLE_SIZE - EDGE_PADDING;
  const maxY = window.innerHeight - TOGGLE_SIZE - EDGE_PADDING;
  return {
    x: Math.max(EDGE_PADDING, Math.min(x, maxX)),
    y: Math.max(EDGE_PADDING, Math.min(y, maxY)),
  };
}

// Default: bottom-right corner (mirrors original CSS position)
function defaultPosition() {
  return clampPos(
    window.innerWidth  - TOGGLE_SIZE - EDGE_PADDING - 4,
    window.innerHeight - TOGGLE_SIZE - EDGE_PADDING - 4,
  );
}

// Work out where to open the widget so it stays inside the viewport.
// Prefers opening above-left of the toggle, falls back to other quadrants.
function widgetPosition(togglePos) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = togglePos.x - WIDGET_WIDTH  + TOGGLE_SIZE;
  let top  = togglePos.y - WIDGET_HEIGHT - EDGE_PADDING;

  // Flip right if going off left edge
  if (left < EDGE_PADDING) left = togglePos.x;
  // Flip below if going off top edge
  if (top  < EDGE_PADDING) top  = togglePos.y + TOGGLE_SIZE + EDGE_PADDING;

  // Final clamp
  left = Math.max(EDGE_PADDING, Math.min(left, vw - WIDGET_WIDTH  - EDGE_PADDING));
  top  = Math.max(EDGE_PADDING, Math.min(top,  vh - WIDGET_HEIGHT - EDGE_PADDING));

  return { left, top };
}

// ─── useDraggable ─────────────────────────────────────────────────────────────
/**
 * Returns { pos, dragHandlers, wasDragged }
 *
 * dragHandlers — spread onto the draggable element's onMouseDown / onTouchStart.
 * wasDragged   — ref; read in the click handler to suppress toggle when dragging.
 */
function useDraggable(onDragEnd) {
  const saved  = loadPosition();
  const [pos, setPos] = useState(saved || defaultPosition());

  const dragging    = useRef(false);
  const startMouse  = useRef({ x: 0, y: 0 });
  const startPos    = useRef({ x: 0, y: 0 });
  const wasDragged  = useRef(false);

  const onMove = useCallback((clientX, clientY) => {
    const dx = clientX - startMouse.current.x;
    const dy = clientY - startMouse.current.y;

    if (!dragging.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragging.current = true;
      wasDragged.current = true;
    }
    if (!dragging.current) return;

    const next = clampPos(startPos.current.x + dx, startPos.current.y + dy);
    setPos(next);
  }, []);

  const onEnd = useCallback((clientX, clientY) => {
    if (dragging.current) {
      const dx   = clientX - startMouse.current.x;
      const dy   = clientY - startMouse.current.y;
      const next = clampPos(startPos.current.x + dx, startPos.current.y + dy);
      savePosition(next);
      onDragEnd?.(next);
    }
    dragging.current = false;

    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup',   handleMouseUp);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend',  handleTouchEnd);
  }, [onDragEnd]);

  // Keep stable references for removeEventListener
  const handleMouseMove = useCallback((e) => onMove(e.clientX, e.clientY), [onMove]);
  const handleMouseUp   = useCallback((e) => onEnd(e.clientX, e.clientY),  [onEnd]);
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [onMove]);
  const handleTouchEnd  = useCallback((e) => {
    const t = e.changedTouches[0];
    onEnd(t.clientX, t.clientY);
  }, [onEnd]);

  const onStart = useCallback((clientX, clientY) => {
    wasDragged.current = false;
    startMouse.current = { x: clientX, y: clientY };
    startPos.current   = pos;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup',   handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend',  handleTouchEnd);
  }, [pos, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const dragHandlers = {
    onMouseDown: (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); },
    onTouchStart: (e) => { onStart(e.touches[0].clientX, e.touches[0].clientY); },
  };

  // Re-clamp on window resize so the widget doesn't go off-screen
  useEffect(() => {
    const onResize = () => {
      setPos(prev => {
        const next = clampPos(prev.x, prev.y);
        savePosition(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { pos, setPos, dragHandlers, wasDragged };
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="cmh-message-row cmh-message-row--bot">
      <div className="cmh-avatar cmh-avatar--bot">
        <Bot size={13} />
      </div>
      <div className="cmh-typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ─── Closed ticket notice ─────────────────────────────────────────────────────
function ClosedNotice() {
  return (
    <div className="cmh-closed-notice">
      <Clock size={13} />
      This ticket has been resolved and closed. Start a New Chat if you need further assistance.
    </div>
  );
}

// ─── ChatWidget ───────────────────────────────────────────────────────────────
export default function ChatWidget() {
  const {
    messages, loading, error, isOpen, isEscalated, isClosed,
    hasUnread, quickReplies, bottomRef,
    conversations, localId, showHistory,
    send, toggleChat, newChat,
    resumeConversation, deleteConversation, toggleHistory,
  } = useChatbot();

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  // Track toggle position; when drag ends, widget position re-derives from it
  const [widgetPos, setWidgetPos] = useState(null);

  const { pos, setPos, dragHandlers, wasDragged } = useDraggable((newTogglePos) => {
    if (isOpen) setWidgetPos(widgetPosition(newTogglePos));
  });

  // Recompute widget position whenever the toggle moves or the widget opens
  useEffect(() => {
    if (isOpen) setWidgetPos(widgetPosition(pos));
  }, [isOpen, pos]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !showHistory) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, showHistory]);

  const handleToggleClick = useCallback(() => {
    // Suppress click if the pointer actually dragged
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    toggleChat();
  }, [toggleChat, wasDragged]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || loading || isClosed) return;
    setInputValue('');
    send(text);
  }, [inputValue, loading, send, isClosed]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickReply = useCallback((reply) => {
    if (!isClosed) send(reply);
  }, [send, isClosed]);

  return (
    <>
      {/* ── Widget panel ── */}
      {isOpen && widgetPos && (
        <div
          className="cmh-widget"
          role="dialog"
          aria-label="Hotel chat assistant"
          style={{
            position:  'fixed',
            left:      widgetPos.left,
            top:       widgetPos.top,
            width:     WIDGET_WIDTH,
            height:    WIDGET_HEIGHT,
            // Remove any bottom/right defaults your CSS may set
            bottom:    'unset',
            right:     'unset',
            zIndex:    1000,
          }}
        >
          {/* ── Header — also acts as a drag handle ── */}
          <div
            className="cmh-header"
            {...dragHandlers}
            style={{ cursor: 'grab' }}
            title="Drag to move"
          >
            <div className="cmh-header-left">
              <div className="cmh-header-avatar">
                <Hotel size={16} />
              </div>
              <div className="cmh-header-info">
                <span className="cmh-header-name">CMH Bot</span>
                <span className="cmh-header-status">
                  {isClosed ? (
                    <><span className="cmh-status-dot" style={{ background: '#909090' }} />Ticket closed</>
                  ) : isEscalated ? (
                    <><span className="cmh-status-dot cmh-status-dot--support" />Support mode</>
                  ) : (
                    <><span className="cmh-status-dot cmh-status-dot--online" />Online</>
                  )}
                </span>
              </div>
            </div>

            <div className="cmh-header-actions">
              <button
                className={`cmh-header-btn ${showHistory ? 'cmh-header-btn--active' : ''}`}
                onClick={toggleHistory}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                title="View conversation history"
                aria-label="Conversation history"
              >
                <History size={10} />
                History
                {conversations.length > 0 && (
                  <span className="cmh-history-count">{conversations.length}</span>
                )}
              </button>

              <button
                className="cmh-header-btn"
                onClick={newChat}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                title="Start new conversation"
                aria-label="New chat"
              >
                <RotateCcw size={10} />
                New
              </button>

              <button
                className="cmh-header-btn cmh-header-btn--close"
                onClick={toggleChat}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                aria-label="Close chat"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* ── Support mode banner ── */}
          {isEscalated && !isClosed && !showHistory && (
            <div className="cmh-support-banner">
              <Headphones size={12} />
              Connected with support — a staff member will respond shortly.
            </div>
          )}

          {/* ── Body ── */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {showHistory && (
              <HistoryPanel
                conversations={conversations}
                localId={localId}
                onResume={resumeConversation}
                onDelete={deleteConversation}
              />
            )}

            <div className="cmh-messages" role="log" aria-live="polite"
              style={{ display: showHistory ? 'none' : 'flex' }}>
              {messages.length === 0 && !loading && (
                <div className="cmh-empty-state">
                  <div className="cmh-empty-icon-wrap">
                    <Hotel size={28} />
                  </div>
                  <p>Welcome to Cebu Mini Hotel</p>
                  <p className="cmh-empty-sub">
                    Ask about rooms, bookings, or anything about our hotel.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {loading && <TypingIndicator />}

              {error && (
                <div className="cmh-error-msg">
                  <AlertTriangle size={12} />
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Bottom ── */}
          {!showHistory && (
            <>
              {isClosed ? (
                <ClosedNotice />
              ) : (
                <>
                  <QuickReplies
                    replies={quickReplies}
                    onSelect={handleQuickReply}
                    disabled={loading}
                  />
                  <div className="cmh-input-row">
                    <textarea
                      ref={inputRef}
                      className="cmh-input"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message…"
                      rows={1}
                      disabled={loading}
                      aria-label="Chat message input"
                    />
                    <button
                      className="cmh-send-btn"
                      onClick={handleSend}
                      disabled={loading || !inputValue.trim()}
                      aria-label="Send message"
                    >
                      {loading ? <span className="cmh-send-spinner" /> : <Send size={13} />}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Footer ── */}
          <div className="cmh-footer">
            Powered by CMH Bot · Cebu Mini Hotel
          </div>
        </div>
      )}

      {/* ── Floating toggle — hidden while widget is open ── */}
      {!isOpen && (
        <button
          className="cmh-toggle-btn"
          onClick={handleToggleClick}
          {...dragHandlers}
          aria-label="Open chat"
          style={{
            position:    'fixed',
            left:        pos.x,
            top:         pos.y,
            bottom:      'unset',
            right:       'unset',
            cursor:      'grab',
            touchAction: 'none',
          }}
        >
          <MessageCircle size={22} />
          {hasUnread && <span className="cmh-unread-dot" />}
        </button>
      )}
    </>
  );
}