/**
 * src/features/chatbot/ChatWidget.jsx
 *
 * Floating chat widget — appears on every page globally.
 * Mount this once in App.jsx or main.jsx.
 *
 * Usage:
 *   import ChatWidget from './features/chatbot/ChatWidget';
 *   // Inside your App/layout component:
 *   <ChatWidget />
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatbot } from './useChatbot';
import MessageBubble from './MessageBubble';
import QuickReplies from './QuickReplies';
import './ChatWidget.css';

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="cmh-message-row cmh-message-row--bot">
      <div className="cmh-avatar cmh-avatar--bot">🏨</div>
      <div className="cmh-typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ─── ChatWidget ───────────────────────────────────────────────────────────────
export default function ChatWidget() {
  const {
    messages, loading, error, isOpen, isEscalated,
    hasUnread, quickReplies, bottomRef,
    send, toggleChat, clearChat,
  } = useChatbot();

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || loading) return;
    setInputValue('');
    send(text);
  }, [inputValue, loading, send]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickReply = useCallback((reply) => {
    send(reply);
  }, [send]);

  return (
    <>
      {/* ── Chat Window ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="cmh-widget" role="dialog" aria-label="Hotel chat assistant">

          {/* Header */}
          <div className="cmh-header">
            <div className="cmh-header-left">
              <div className="cmh-header-avatar">🏨</div>
              <div className="cmh-header-info">
                <span className="cmh-header-name">CMH Bot</span>
                <span className="cmh-header-status">
                  {isEscalated ? (
                    <><span className="cmh-status-dot cmh-status-dot--support" />Support mode</>
                  ) : (
                    <><span className="cmh-status-dot cmh-status-dot--online" />Online</>
                  )}
                </span>
              </div>
            </div>
            <div className="cmh-header-actions">
              <button
                className="cmh-header-btn"
                onClick={clearChat}
                title="New conversation"
                aria-label="Start new conversation"
              >
                ✕ New
              </button>
              <button
                className="cmh-header-btn cmh-header-btn--close"
                onClick={toggleChat}
                title="Close chat"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Support mode banner */}
          {isEscalated && (
            <div className="cmh-support-banner">
              🙋 You're connected with our support team. A staff member will respond shortly.
            </div>
          )}

          {/* Message list */}
          <div className="cmh-messages" role="log" aria-live="polite">
            {messages.length === 0 && !loading && (
              <div className="cmh-empty-state">
                <span className="cmh-empty-icon">🏨</span>
                <p>Welcome to Cebu Mini Hotel!</p>
                <p className="cmh-empty-sub">Ask me anything about rooms, bookings, or our hotel.</p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {loading && <TypingIndicator />}

            {error && (
              <div className="cmh-error-msg">
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick replies */}
          <QuickReplies
            replies={quickReplies}
            onSelect={handleQuickReply}
            disabled={loading}
          />

          {/* Input */}
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
              {loading ? (
                <span className="cmh-send-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="cmh-footer">
            Powered by <strong>CMH Bot</strong> · Cebu Mini Hotel
          </div>
        </div>
      )}

      {/* ── Floating Toggle Button ─────────────────────────────────────── */}
      <button
        className={`cmh-toggle-btn ${isOpen ? 'cmh-toggle-btn--open' : ''}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        title={isOpen ? 'Close chat' : 'Chat with us'}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
        )}
        {!isOpen && hasUnread && <span className="cmh-unread-dot" />}
      </button>
    </>
  );
}