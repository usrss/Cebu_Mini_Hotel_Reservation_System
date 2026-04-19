/**
 * src/features/chatbot/ChatWidget.jsx
 *
 * Floating chat widget for hotel guests.
 * Mount via ChatWidgetWrapper.
 *
 * Header buttons:  [History]  [New Chat]  [✕]
 *
 * History button slides in HistoryPanel over the message area.
 * Guest can resume any past conversation; closed tickets are read-only.
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

  // Focus input when chat opens and history panel is not showing
  useEffect(() => {
    if (isOpen && !showHistory) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, showHistory]);

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
      {isOpen && (
        <div className="cmh-widget" role="dialog" aria-label="Hotel chat assistant">

          {/* ── Header ── */}
          <div className="cmh-header">
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
              {/* History button — highlights when panel is open */}
              <button
                className={`cmh-header-btn ${showHistory ? 'cmh-header-btn--active' : ''}`}
                onClick={toggleHistory}
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
                title="Start new conversation"
                aria-label="New chat"
              >
                <RotateCcw size={10} />
                New
              </button>

              <button
                className="cmh-header-btn cmh-header-btn--close"
                onClick={toggleChat}
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

          {/* ── Widget body (messages OR history panel) ── */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

            {/* History panel slides over the message area */}
            {showHistory && (
              <HistoryPanel
                conversations={conversations}
                localId={localId}
                onResume={resumeConversation}
                onDelete={deleteConversation}
              />
            )}

            {/* Messages */}
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

          {/* ── Bottom: quick replies + input OR closed notice ── */}
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

      {/* ── Floating Toggle — gold ── */}
      <button
        className={`cmh-toggle-btn ${isOpen ? 'cmh-toggle-btn--open' : ''}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={22} />}
        {!isOpen && hasUnread && <span className="cmh-unread-dot" />}
      </button>
    </>
  );
}