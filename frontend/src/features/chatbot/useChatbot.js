/**
 * src/features/chatbot/useChatbot.js
 *
 * Central state hook for the chatbot widget.
 * Handles: messages, conversation tracking, session key, loading, errors.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMessage, pollMessages } from '../../services/chatApi';
import { getStoredUser } from '../../services/api';

// ─── Generate/persist anonymous session key ───────────────────────────────────
function getSessionKey() {
  let key = sessionStorage.getItem('cmh_chat_session');
  if (!key) {
    key = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('cmh_chat_session', key);
  }
  return key;
}

// ─── Persist conversation ID across page reloads ──────────────────────────────
function getStoredConversationId() {
  const raw = sessionStorage.getItem('cmh_conversation_id');
  return raw ? parseInt(raw, 10) : null;
}

function storeConversationId(id) {
  if (id) sessionStorage.setItem('cmh_conversation_id', String(id));
  else sessionStorage.removeItem('cmh_conversation_id');
}

export function useChatbot() {
  const user       = getStoredUser();
  const sessionKey = useRef(getSessionKey()).current;

  const [messages,        setMessages]        = useState([]);
  const [conversationId,  setConversationId]  = useState(getStoredConversationId);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [isEscalated,     setIsEscalated]     = useState(false);
  const [isOpen,          setIsOpen]          = useState(false);
  const [hasUnread,       setHasUnread]       = useState(false);
  const [quickReplies,    setQuickReplies]    = useState([
    'Check room availability',
    'View room prices',
    'Hotel information',
    'Talk to support',
  ]);

  const pollIntervalRef = useRef(null);

  // ── Poll for admin replies when in support mode ───────────────────────────
  useEffect(() => {
    // Only poll when escalated and we have a conversation
    if (!isEscalated || !conversationId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const doPoll = async () => {
      try {
        // Get the highest message ID we currently have
        const lastId = messages.length > 0
          ? Math.max(...messages.map(m => m.id))
          : 0;

        const data = await pollMessages(conversationId, lastId, sessionKey);

        if (data.messages && data.messages.length > 0) {
          // Only add messages we don't already have
          setMessages((prev) => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = data.messages
              .filter(m => !existingIds.has(m.id))
              .map(m => ({
                id:        m.id,
                sender:    m.sender,      // 'support' from backend
                text:      m.message_text,
                timestamp: m.timestamp,
                data:      null,
              }));
            if (newMsgs.length === 0) return prev;
            return [...prev, ...newMsgs];
          });

          // Mark unread if widget is closed
          if (!isOpen) setHasUnread(true);
        }
      } catch (_) {
        // Silent — polling failures should never crash the widget
      }
    };

    // Poll every 5 seconds when in support mode
    pollIntervalRef.current = setInterval(doPoll, 5000);
    doPoll(); // immediate first poll

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isEscalated, conversationId, sessionKey, isOpen]);

  const bottomRef = useRef(null);

  // ── Auto-scroll to bottom on new message ──────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // ── Mark unread when widget is closed and bot responds ────────────────────
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.sender === 'bot') setHasUnread(true);
    }
  }, [messages]);

  // ── Add a bot message directly (no API call) ──────────────────────────────
  // MUST be defined before openChat which calls it
  const _addBotMessage = useCallback((text, replies = []) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: 'bot', text, timestamp: new Date().toISOString() },
    ]);
    if (replies.length) setQuickReplies(replies);
  }, []);

  // ── Clear unread when opened ──────────────────────────────────────────────
  const openChat = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);

    // Show greeting if no messages yet
    if (messages.length === 0) {
      _addBotMessage(
        `Hello${user?.first_name ? `, ${user.first_name}` : ''}! 👋 Welcome to **Cebu Mini Hotel**.\n\nI'm CMH Bot, your virtual assistant. How can I help you today?`,
        [
          'Check room availability',
          'View room prices',
          user ? 'My bookings' : 'Hotel information',
          'Talk to support',
        ]
      );
    }
  }, [messages.length, user, _addBotMessage]);

  const closeChat = useCallback(() => setIsOpen(false), []);

  const toggleChat = useCallback(() => {
    if (isOpen) closeChat();
    else openChat();
  }, [isOpen, openChat, closeChat]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (!text.trim() || loading) return;

    setError(null);
    setQuickReplies([]); // clear while loading

    // Optimistically add user message
    const userMsg = {
      id:        Date.now(),
      sender:    'user',
      text:      text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const data = await sendMessage({
        message:        text.trim(),
        conversationId: conversationId,
        sessionKey:     sessionKey,
      });

      // Persist conversation ID
      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id);
        storeConversationId(data.conversation_id);
      }

      // Staff redirect — show message but no conversation saved
      if (data.intent === 'STAFF_REDIRECT') {
        setMessages((prev) => [
          ...prev,
          {
            id:        Date.now() + 1,
            sender:    'bot',
            text:      data.message,
            intent:    'STAFF_REDIRECT',
            data:      data.data,
            timestamp: new Date().toISOString(),
          },
        ]);
        setQuickReplies([]);
        return;
      }

      // Add bot response — skip if no message returned (support mode quiet ack)
      if (data.message && data.bot_message_id !== null) {
        setMessages((prev) => [
          ...prev,
          {
            id:        data.bot_message_id || Date.now() + 1,
            sender:    'bot',
            text:      data.message,
            intent:    data.intent,
            data:      data.data,
            escalated: data.escalated,
            timestamp: new Date().toISOString(),
          },
        ]);
      }

      if (data.escalated) setIsEscalated(true);
      setQuickReplies(data.quick_replies || []);

    } catch (err) {
      setError('Something went wrong. Please try again.');
      setQuickReplies(['Try again', 'Talk to support']);
    } finally {
      setLoading(false);
    }
  }, [loading, conversationId, sessionKey]);

  // ── Clear / reset conversation ─────────────────────────────────────────────
  const clearChat = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setMessages([]);
    setConversationId(null);
    storeConversationId(null);
    setIsEscalated(false);
    setQuickReplies([
      'Check room availability',
      'View room prices',
      'Hotel information',
      'Talk to support',
    ]);
    sessionStorage.removeItem('cmh_conversation_id');
  }, []);

  return {
    messages,
    loading,
    error,
    isOpen,
    isEscalated,
    hasUnread,
    quickReplies,
    conversationId,
    bottomRef,
    send,
    openChat,
    closeChat,
    toggleChat,
    clearChat,
  };
}