/**
 * src/features/chatbot/useChatbot.js
 *
 * Central state hook for the chatbot widget.
 *
 * History feature:
 *   - Every conversation (id + messages + status + escalated) is saved to
 *     localStorage under `cmh_conversations` as an array.
 *   - Guest can open the History panel to see past conversations.
 *   - Clicking a past conversation loads it back — they can keep messaging
 *     as long as the ticket is not closed (status !== 'closed').
 *   - "New Chat" always creates a brand new conversation.
 *   - On mount the most recent non-closed conversation is auto-resumed if one exists.
 *
 * FIX (staff reply polling):
 *   The polling useEffect was closing over the `messages` state array, which
 *   was always stale inside the interval callback. Every doPoll() call computed
 *   lastId from the snapshot captured when the effect was created (usually 0),
 *   so the backend returned ALL messages on every tick. The deduplication set
 *   then silently dropped them because their ids were already in `prev`.
 *   Staff replies were therefore never rendered.
 *
 *   Fix: track the highest seen message id in a `lastSeenIdRef` (a plain ref,
 *   not state). The closure always reads `.current` which is always up-to-date,
 *   regardless of when the effect was created. The dependency array also no
 *   longer includes `ticketStatus`, which was needlessly restarting the interval
 *   (and losing the cursor) every time the ticket status changed mid-conversation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMessage, pollMessages } from '../../services/chatApi';
import { getStoredUser } from '../../services/api';

const SESSION_KEY_STORE = 'cmh_chat_session';
const CONVERSATIONS_KEY = 'cmh_conversations';    // array of conversation records
const ACTIVE_CONV_KEY   = 'cmh_active_conv_id';   // currently active conversation id

const DEFAULT_QUICK_REPLIES = [
  'Check room availability',
  'View room prices',
  'Hotel information',
  'Talk to support',
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
// Each record: { id, conversationId, messages, isEscalated, ticketStatus, subject, updatedAt }

function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
  } catch { return []; }
}

function saveConversations(convs) {
  try {
    // Keep last 20 conversations
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

/**
 * Upsert a conversation record in the store.
 * Returns the updated list.
 */
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

  // All saved conversations
  const [conversations,  setConversations]  = useState(loadConversations);

  // Active conversation state
  const [localId,        setLocalId]        = useState(null);       // localStorage record key
  const [conversationId, setConversationId] = useState(null);       // backend conversation id
  const [messages,       setMessages]       = useState([]);
  const [isEscalated,    setIsEscalated]    = useState(false);
  const [ticketStatus,   setTicketStatus]   = useState(null);       // null | 'open' | 'in_progress' | 'escalated' | 'closed'
  const [quickReplies,   setQuickReplies]   = useState(DEFAULT_QUICK_REPLIES);

  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [isOpen,    setIsOpen]    = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const pollIntervalRef = useRef(null);
  const bottomRef       = useRef(null);
  const greetingShown   = useRef(false);

  // FIX: tracks the highest message id the poll cursor has advanced to.
  // Using a ref (not state) so the doPoll closure always reads the live value
  // without the effect needing to re-run (and restart the interval) on each
  // new message. Reset to 0 whenever a new/resumed conversation is loaded.
  const lastSeenIdRef = useRef(0);

  // ── Persist conversations on every change ──────────────────────────────────
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // ── Auto-resume most recent non-closed conversation on mount ───────────────
  useEffect(() => {
    const savedId = getActiveId();
    const convs   = loadConversations();
    if (savedId && convs.length > 0) {
      const record = convs.find(c => c.localId === savedId) || convs[convs.length - 1];
      if (record) {
        _loadRecord(record);
        return;
      }
    }
    if (convs.length > 0) {
      // Resume latest conversation that isn't closed
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

  // ── Unread dot when closed ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.sender !== 'user') setHasUnread(true);
    }
  }, [messages]);

  // ── Sync active conversation into store whenever messages/status change ────
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
  // Only sync when these specific values change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isEscalated, ticketStatus]);

  // ── Support polling ────────────────────────────────────────────────────────
  useEffect(() => {
    // Stop polling if not yet escalated or no backend conversation id
    if (!isEscalated || !conversationId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Stop polling once the ticket is closed — read ticketStatus via a local
    // snapshot at effect-creation time. If it closes mid-interval the next
    // tick will call setTicketStatus('closed') and the effect will re-run,
    // cleaning up cleanly.
    if (ticketStatus === 'closed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const doPoll = async () => {
      try {
        // FIX: read from lastSeenIdRef — always the current value, never stale.
        // Previously this read `messages` from the closure, which was the snapshot
        // at effect-creation time and never advanced, so every poll sent after=0
        // and the backend returned every old message. The dedup set swallowed them.
        const data = await pollMessages(conversationId, lastSeenIdRef.current, sessionKey);

        if (data.messages && data.messages.length > 0) {
          setMessages(prev => {
            const existing = new Set(prev.map(m => m.id));
            const newMsgs  = data.messages
              .filter(m => !existing.has(m.id))
              .map(m => ({
                id:        m.id,    // real DB id — safe to use as React key here
                dbId:      m.id,    // explicit alias for cursor restoration clarity
                sender:    m.sender,
                text:      m.message_text,
                timestamp: m.timestamp,
                data:      null,
              }));

            if (newMsgs.length) {
              // Advance the ref cursor so the next poll only fetches messages
              // that arrived after this batch.
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

        // Sync ticket status from poll response.
        // When staff resolves the ticket, status transitions to 'closed' here.
        if (data.ticket?.status && data.ticket.status !== ticketStatus) {
          setTicketStatus(data.ticket.status);

          // When the ticket just became closed, inject a system message so the
          // guest sees a clear resolution notice inline without refreshing.
          if (data.ticket.status === 'closed') {
            setMessages(prev => [
              ...prev,
              {
                id:        Date.now(),
                sender:    'bot',
                text:      '✅ **Your support request has been resolved.**\n\nThis conversation is now closed. If you need further help, please start a new chat.',
                timestamp: new Date().toISOString(),
                data:      null,
              },
            ]);
          }
        }

      } catch { /* silent — network hiccups should not break the widget */ }
    };

    pollIntervalRef.current = setInterval(doPoll, 5000);
    doPoll(); // immediate first tick

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

  // `messages` is intentionally excluded — we use lastSeenIdRef instead.
  // `ticketStatus` is included only so a 'closed' transition stops the poll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEscalated, conversationId, ticketStatus, sessionKey, isOpen]);

  // ── Internal: load a conversation record into active state ─────────────────
  function _loadRecord(record) {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Reset the poll cursor to the highest REAL DB id already in the restored
    // messages. Messages have two ids: `id` (a Date.now() timestamp used as
    // React key) and `dbId` (the actual database primary key). We must use
    // dbId here — using `id` would set the cursor to a ~trillion number,
    // causing every subsequent poll to return nothing.
    const msgs = record.messages || [];
    lastSeenIdRef.current = msgs.length > 0
      ? Math.max(0, ...msgs.map(m => m.dbId || 0))
      : 0;

    setLocalId(record.localId);
    setConversationId(record.conversationId || null);
    setMessages(msgs);
    setIsEscalated(record.isEscalated || false);
    setTicketStatus(record.ticketStatus || null);
    setQuickReplies(record.quickReplies || DEFAULT_QUICK_REPLIES);
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
        [
          'Check room availability',
          'View room prices',
          user ? 'My bookings' : 'Hotel information',
          'Talk to support',
        ]
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
    if (ticketStatus === 'closed') return; // guard — closed tickets can't receive messages

    setError(null);
    setQuickReplies([]);
    setShowHistory(false);

    // Ensure we have a localId for this conversation
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
        // Patch the local record with backend id
        setConversations(prev =>
          upsertConversation(prev, { localId: currentLocalId, conversationId: data.conversation_id })
        );
      }

      // Backend returned a CLOSED signal — the staff already resolved this
      // conversation. Lock the UI immediately without waiting for the next poll.
      if (data.intent === 'CLOSED' || data.closed === true) {
        setTicketStatus('closed');
        setMessages(prev => [
          ...prev,
          {
            id:        Date.now() + 1,
            sender:    'bot',
            text:      '✅ **Your support request has been resolved.**\n\nThis conversation is now closed. If you need further help, please start a new chat.',
            timestamp: new Date().toISOString(),
            data:      null,
          },
        ]);
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

      // Backend rejected the message because the conversation was already closed
      // by staff. Lock the UI immediately — don't wait for the next poll cycle.
      if (data.intent === 'CONVERSATION_CLOSED') {
        setTicketStatus('closed');
        setQuickReplies([]);
        return;
      }

      // Advance the poll cursor using real DB ids from the server response.
      // IMPORTANT: local message ids are Date.now() timestamps (~1.7 trillion)
      // which are astronomically larger than real DB ids (~100s or ~1000s).
      // If lastSeenIdRef gets set to a timestamp, every subsequent poll sends
      // after=1710000000000 and the backend returns nothing because no DB row
      // has an id that large. We must ONLY advance the cursor from server ids.
      if (data.user_message_id && data.user_message_id > lastSeenIdRef.current) {
        lastSeenIdRef.current = data.user_message_id;
      }

      if (data.message && data.bot_message_id != null) {
        const botMsg = {
          // Use a local timestamp as the React key — never feed this back
          // into lastSeenIdRef because it would corrupt the poll cursor.
          id:        Date.now() + 1,
          dbId:      data.bot_message_id,   // real DB id — used only for cursor
          sender:    'bot',
          text:      data.message,
          intent:    data.intent,
          data:      data.data,
          escalated: data.escalated,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, botMsg]);

        // Advance cursor from the real DB id, not from the local timestamp id.
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
  }, [loading, conversationId, sessionKey, localId, ticketStatus]);

  // ── Start a brand new conversation ─────────────────────────────────────────
  const newChat = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    lastSeenIdRef.current = 0; // reset cursor for fresh conversation

    const newLocalId = `conv_${Date.now()}`;
    setLocalId(newLocalId);
    setActiveId(newLocalId);
    setConversationId(null);
    setMessages([]);
    setIsEscalated(false);
    setTicketStatus(null);
    setQuickReplies(DEFAULT_QUICK_REPLIES);
    setError(null);
    setShowHistory(false);
    greetingShown.current = false;

    // Show greeting immediately
    setTimeout(() => {
      greetingShown.current = true;
      _addBotMessage(
        `Hello${user?.first_name ? `, ${user.first_name}` : ''}! Welcome to **Cebu Mini Hotel**.\n\nI'm CMH Bot, your virtual assistant. How can I help you today?`,
        [
          'Check room availability',
          'View room prices',
          user ? 'My bookings' : 'Hotel information',
          'Talk to support',
        ]
      );
    }, 50);
  }, [user, _addBotMessage]);

  // ── Resume a past conversation from history ─────────────────────────────────
  const resumeConversation = useCallback((record) => {
    _loadRecord(record);
    setShowHistory(false);
  }, []);

  // ── Delete a conversation from history ─────────────────────────────────────
  const deleteConversation = useCallback((targetLocalId) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.localId !== targetLocalId);
      saveConversations(updated);
      return updated;
    });
    // If deleting the active one, start fresh
    if (targetLocalId === localId) {
      newChat();
    }
  }, [localId, newChat]);

  // ── Toggle history panel ────────────────────────────────────────────────────
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