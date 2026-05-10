/**
 * src/features/chatbot/useChatbot.js
 *
 * Central state hook for the chatbot widget.
 *
 * Changes from original:
 *  1. Auth gate for "Talk to support" — unauthenticated guests see a login
 *     prompt instead of triggering escalation. The quick reply is also hidden
 *     from the default set for anonymous sessions.
 *  2. Status-only poll — a lightweight 10-second interval runs whenever
 *     we have a conversationId but isEscalated is still false. This means
 *     when staff closes a ticket the guest UI updates within ~10 s even if
 *     the guest never sent another message. The existing 5-second message
 *     poll (isEscalated === true) is unchanged.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMessage, pollMessages } from '../../services/chatApi';
import { getStoredUser } from '../../services/api';

const SESSION_KEY_STORE = 'cmh_chat_session';
const CONVERSATIONS_KEY = 'cmh_conversations';
const ACTIVE_CONV_KEY   = 'cmh_active_conv_id';

// ─── Quick reply sets ─────────────────────────────────────────────────────────

// Unauthenticated guests never see "Talk to support" — it would be blocked
// by the auth gate anyway, so hiding it avoids the confusing rejection flow.
const DEFAULT_QUICK_REPLIES_GUEST = [
  'Check room availability',
  'View room prices',
  'Hotel information',
];

const DEFAULT_QUICK_REPLIES_USER = [
  'Check room availability',
  'View room prices',
  'My bookings',
  'Talk to support',
];

// Phrases that signal the guest wants human support.
// Checked case-insensitively against the full message text.
const SUPPORT_INTENT_PHRASES = [
  'talk to support',
  'contact support',
  'speak to support',
  'human support',
  'speak to agent',
  'talk to agent',
];

// ─── Session key ──────────────────────────────────────────────────────────────
function getSessionKey() {
  let key = sessionStorage.getItem(SESSION_KEY_STORE);
  if (!key) {
    key = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY_STORE, key);
  }
  return key;
}

// ─── Conversation store helpers ───────────────────────────────────────────────
function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
  } catch { return []; }
}

function saveConversations(convs) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs.slice(-20)));
  } catch {}
}

function getActiveId() {
  const raw = localStorage.getItem(ACTIVE_CONV_KEY);
  return raw ? parseInt(raw, 10) : null;
}

function setActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_CONV_KEY, String(id));
  else localStorage.removeItem(ACTIVE_CONV_KEY);
}

function upsertConversation(convs, patch) {
  const idx = convs.findIndex(c => c.localId === patch.localId);
  if (idx === -1) return [...convs, patch];
  const updated = [...convs];
  updated[idx] = { ...updated[idx], ...patch };
  return updated;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useChatbot() {
  const user       = getStoredUser();
  const sessionKey = useRef(getSessionKey()).current;

  const defaultQuickReplies = user ? DEFAULT_QUICK_REPLIES_USER : DEFAULT_QUICK_REPLIES_GUEST;

  const [conversations,  setConversations]  = useState(loadConversations);
  const [localId,        setLocalId]        = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [isEscalated,    setIsEscalated]    = useState(false);
  const [ticketStatus,   setTicketStatus]   = useState(null);
  const [quickReplies,   setQuickReplies]   = useState(defaultQuickReplies);

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [isOpen,      setIsOpen]      = useState(false);
  const [hasUnread,   setHasUnread]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const pollIntervalRef       = useRef(null);
  const statusPollIntervalRef = useRef(null); // NEW: status-only poll handle
  const bottomRef             = useRef(null);
  const greetingShown         = useRef(false);
  const lastSeenIdRef         = useRef(0);

  // ── Persist conversations ──────────────────────────────────────────────────
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // ── Auto-resume on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const savedId = getActiveId();
    const convs   = loadConversations();
    if (savedId && convs.length > 0) {
      const record = convs.find(c => c.localId === savedId) || convs[convs.length - 1];
      if (record) { _loadRecord(record); return; }
    }
    if (convs.length > 0) {
      const latest = [...convs].reverse().find(c => c.ticketStatus !== 'closed') || convs[convs.length - 1];
      _loadRecord(latest);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !showHistory) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, showHistory]);

  // ── Unread dot ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.sender !== 'user') setHasUnread(true);
    }
  }, [messages]);

  // ── Sync active conversation into store ────────────────────────────────────
  useEffect(() => {
    if (!localId) return;
    setConversations(prev =>
      upsertConversation(prev, {
        localId,
        conversationId,
        messages: messages.slice(-100),
        isEscalated,
        ticketStatus,
        quickReplies,
        updatedAt: Date.now(),
        subject: messages.find(m => m.sender === 'user')?.text?.slice(0, 60) || 'New conversation',
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isEscalated, ticketStatus]);

  // ── Helper: inject the "ticket closed" system message ─────────────────────
  const _injectClosedMessage = useCallback(() => {
    setMessages(prev => {
      // Avoid duplicate closed messages if both polls fire close together
      const alreadyInjected = prev.some(
        m => m.sender === 'bot' && m._isClosedNotice
      );
      if (alreadyInjected) return prev;
      return [
        ...prev,
        {
          id:             Date.now(),
          sender:         'bot',
          text:           '✅ **Your support request has been resolved.**\n\nThis conversation is now closed. If you need further help, please start a new chat.',
          timestamp:      new Date().toISOString(),
          data:           null,
          _isClosedNotice: true,
        },
      ];
    });
  }, []);

  // ── Support message poll (runs when escalated) ─────────────────────────────
  useEffect(() => {
    if (!isEscalated || !conversationId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (ticketStatus === 'closed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const doPoll = async () => {
      try {
        const data = await pollMessages(conversationId, lastSeenIdRef.current, sessionKey);

        if (data.messages && data.messages.length > 0) {
          setMessages(prev => {
            const existing = new Set(prev.map(m => m.id));
            const newMsgs  = data.messages
              .filter(m => !existing.has(m.id))
              .map(m => ({
                id:        m.id,
                dbId:      m.id,
                sender:    m.sender,
                text:      m.message_text,
                timestamp: m.timestamp,
                data:      null,
              }));

            if (newMsgs.length) {
              const maxId = Math.max(...newMsgs.map(m => m.id));
              if (maxId > lastSeenIdRef.current) {
                lastSeenIdRef.current = maxId;
              }
              return [...prev, ...newMsgs];
            }
            return prev;
          });

          if (!isOpen) setHasUnread(true);
        }

        if (data.ticket?.status && data.ticket.status !== ticketStatus) {
          setTicketStatus(data.ticket.status);
          if (data.ticket.status === 'closed') {
            _injectClosedMessage();
          }
        }
      } catch { /* silent */ }
    };

    pollIntervalRef.current = setInterval(doPoll, 5000);
    doPoll();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEscalated, conversationId, ticketStatus, sessionKey, isOpen]);

  // ── Status-only poll (NEW) ─────────────────────────────────────────────────
  // Runs whenever we have a conversationId but haven't escalated yet.
  // Only checks ticket.status — if staff somehow closes the ticket before
  // the guest escalates (edge case), or if the guest needs to know the
  // ticket was resolved, this catches it within ~10 seconds.
  // Also covers the case where the guest has the widget closed: when they
  // reopen it the status will already be correct from the last poll result
  // stored in ticketStatus state / localStorage.
  useEffect(() => {
    // Don't run alongside the full message poll — that already tracks status
    if (isEscalated) {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
      return;
    }

    // Nothing to poll without a backend conversation
    if (!conversationId) {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
      return;
    }

    // Already closed — no need to keep polling
    if (ticketStatus === 'closed') {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
      return;
    }

    const doStatusPoll = async () => {
      try {
        // Reuse pollMessages with after=lastSeenIdRef so we don't re-fetch
        // old messages; we only care about data.ticket.status here.
        const data = await pollMessages(conversationId, lastSeenIdRef.current, sessionKey);

        if (data.ticket?.status && data.ticket.status !== ticketStatus) {
          setTicketStatus(data.ticket.status);

          if (data.ticket.status === 'closed') {
            _injectClosedMessage();
            if (!isOpen) setHasUnread(true);
          }

          // If the ticket got escalated by the backend (e.g. auto-routing),
          // promote to the full message poll so staff replies come through.
          if (data.ticket.status === 'escalated' || data.escalated) {
            setIsEscalated(true);
          }
        }
      } catch { /* silent */ }
    };

    statusPollIntervalRef.current = setInterval(doStatusPoll, 10000);

    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEscalated, conversationId, ticketStatus, sessionKey, isOpen]);

  // ── Internal: load a conversation record ──────────────────────────────────
  function _loadRecord(record) {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (statusPollIntervalRef.current) {
      clearInterval(statusPollIntervalRef.current);
      statusPollIntervalRef.current = null;
    }

    const msgs = record.messages || [];
    lastSeenIdRef.current = msgs.length > 0
      ? Math.max(0, ...msgs.map(m => m.dbId || 0))
      : 0;

    setLocalId(record.localId);
    setConversationId(record.conversationId || null);
    setMessages(msgs);
    setIsEscalated(record.isEscalated || false);
    setTicketStatus(record.ticketStatus || null);
    setQuickReplies(record.quickReplies || defaultQuickReplies);
    setActiveId(record.localId);
    greetingShown.current = (msgs.length || 0) > 0;
  }

  // ── _addBotMessage ─────────────────────────────────────────────────────────
  const _addBotMessage = useCallback((text, replies = []) => {
    setMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'bot', text, timestamp: new Date().toISOString() },
    ]);
    if (replies.length) setQuickReplies(replies);
  }, []);

  // ── Open / close / toggle ──────────────────────────────────────────────────
  const openChat = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
    setShowHistory(false);

    if (!greetingShown.current && messages.length === 0) {
      greetingShown.current = true;
      const newLocalId = `conv_${Date.now()}`;
      setLocalId(newLocalId);
      setActiveId(newLocalId);
      _addBotMessage(
        `Hello${user?.first_name ? `, ${user.first_name}` : ''}! Welcome to **Cebu Mini Hotel**.\n\nI'm CMH Bot, your virtual assistant. How can I help you today?`,
        user ? DEFAULT_QUICK_REPLIES_USER : DEFAULT_QUICK_REPLIES_GUEST
      );
    }
  }, [messages.length, user, _addBotMessage]);

  const closeChat  = useCallback(() => { setIsOpen(false); setShowHistory(false); }, []);
  const toggleChat = useCallback(() => {
    if (isOpen) closeChat();
    else openChat();
  }, [isOpen, openChat, closeChat]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    if (ticketStatus === 'closed') return;

    // ── Auth gate: block support escalation for unauthenticated guests ──────
    const isAttemptingSupport = SUPPORT_INTENT_PHRASES.some(p =>
      text.toLowerCase().includes(p)
    );

    if (isAttemptingSupport && !user) {
      // Show the user's message in the bubble so it doesn't feel swallowed,
      // then reply with a login prompt — never call sendMessage().
      const currentLocalId = localId || `conv_${Date.now()}`;
      if (!localId) {
        setLocalId(currentLocalId);
        setActiveId(currentLocalId);
      }
      setMessages(prev => [
        ...prev,
        {
          id:        Date.now(),
          sender:    'user',
          text:      text.trim(),
          timestamp: new Date().toISOString(),
        },
      ]);
      setQuickReplies([]);
      setTimeout(() => {
        _addBotMessage(
          'To connect with our support team, you need to be **logged in**. Please sign in or create an account and try again.',
          DEFAULT_QUICK_REPLIES_GUEST
        );
      }, 300);
      return;
    }
    // ── End auth gate ────────────────────────────────────────────────────────

    setError(null);
    setQuickReplies([]);
    setShowHistory(false);

    const currentLocalId = localId || `conv_${Date.now()}`;
    if (!localId) {
      setLocalId(currentLocalId);
      setActiveId(currentLocalId);
    }

    const userMsg = {
      id:        Date.now(),
      sender:    'user',
      text:      text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const data = await sendMessage({
        message:        text.trim(),
        conversationId: conversationId,
        sessionKey:     sessionKey,
      });

      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id);
        setConversations(prev =>
          upsertConversation(prev, { localId: currentLocalId, conversationId: data.conversation_id })
        );
      }

      if (data.intent === 'CLOSED' || data.closed === true) {
        setTicketStatus('closed');
        _injectClosedMessage();
        setQuickReplies([]);
        return;
      }

      if (data.intent === 'STAFF_REDIRECT') {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, sender: 'bot',
          text: data.message, intent: 'STAFF_REDIRECT',
          data: data.data, timestamp: new Date().toISOString(),
        }]);
        setQuickReplies([]);
        return;
      }

      if (data.intent === 'CONVERSATION_CLOSED') {
        setTicketStatus('closed');
        setQuickReplies([]);
        return;
      }

      if (data.user_message_id && data.user_message_id > lastSeenIdRef.current) {
        lastSeenIdRef.current = data.user_message_id;
      }

      if (data.message && data.bot_message_id != null) {
        const botMsg = {
          id:        Date.now() + 1,
          dbId:      data.bot_message_id,
          sender:    'bot',
          text:      data.message,
          intent:    data.intent,
          data:      data.data,
          escalated: data.escalated,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, botMsg]);

        if (data.bot_message_id > lastSeenIdRef.current) {
          lastSeenIdRef.current = data.bot_message_id;
        }
      }

      if (data.escalated) setIsEscalated(true);
      if (data.ticket?.status) setTicketStatus(data.ticket.status);
      setQuickReplies(data.quick_replies || []);

    } catch {
      setError('Something went wrong. Please try again.');
      setQuickReplies(['Try again', 'Talk to support']);
    } finally {
      setLoading(false);
    }
  }, [loading, conversationId, sessionKey, localId, ticketStatus, user, _addBotMessage, _injectClosedMessage]);

  // ── New conversation ───────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (statusPollIntervalRef.current) {
      clearInterval(statusPollIntervalRef.current);
      statusPollIntervalRef.current = null;
    }

    lastSeenIdRef.current = 0;

    const newLocalId = `conv_${Date.now()}`;
    setLocalId(newLocalId);
    setActiveId(newLocalId);
    setConversationId(null);
    setMessages([]);
    setIsEscalated(false);
    setTicketStatus(null);
    setQuickReplies(defaultQuickReplies);
    setError(null);
    setShowHistory(false);
    greetingShown.current = false;

    setTimeout(() => {
      greetingShown.current = true;
      _addBotMessage(
        `Hello${user?.first_name ? `, ${user.first_name}` : ''}! Welcome to **Cebu Mini Hotel**.\n\nI'm CMH Bot, your virtual assistant. How can I help you today?`,
        user ? DEFAULT_QUICK_REPLIES_USER : DEFAULT_QUICK_REPLIES_GUEST
      );
    }, 50);
  }, [user, _addBotMessage, defaultQuickReplies]);

  // ── Resume from history ────────────────────────────────────────────────────
  const resumeConversation = useCallback((record) => {
    _loadRecord(record);
    setShowHistory(false);
  }, []);

  // ── Delete from history ────────────────────────────────────────────────────
  const deleteConversation = useCallback((targetLocalId) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.localId !== targetLocalId);
      saveConversations(updated);
      return updated;
    });
    if (targetLocalId === localId) newChat();
  }, [localId, newChat]);

  // ── Toggle history panel ───────────────────────────────────────────────────
  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev);
  }, []);

  const isClosed = ticketStatus === 'closed';

  return {
    messages,
    loading,
    error,
    isOpen,
    isEscalated,
    isClosed,
    ticketStatus,
    hasUnread,
    quickReplies,
    conversationId,
    localId,
    conversations,
    showHistory,
    bottomRef,
    send,
    openChat,
    closeChat,
    toggleChat,
    newChat,
    resumeConversation,
    deleteConversation,
    toggleHistory,
  };
}