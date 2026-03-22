/**
 * src/services/chatApi.js
 *
 * API calls for the chatbot system.
 * Uses the shared axios instance from api.js — auth headers handled automatically.
 */

import api from './api';

const BASE = '/chat';

// ─── Guest / User endpoints ───────────────────────────────────────────────────

/**
 * Send a message to the chatbot.
 * Works for both authenticated and unauthenticated users.
 */
export const sendMessage = ({ message, conversationId, sessionKey }) =>
  api.post(`${BASE}/`, {
    message,
    conversation_id: conversationId || null,
    session_key:     sessionKey || '',
  }).then((r) => r.data);

/**
 * Poll for new messages after a given message ID.
 * Used by the widget to receive admin replies in support mode.
 */
export const pollMessages = (conversationId, afterMessageId, sessionKey = '') =>
  api.get(`/chat/poll/${conversationId}/`, {
    params: { after: afterMessageId || 0, session_key: sessionKey },
  }).then((r) => r.data);

// ─── Admin / Manager support endpoints ───────────────────────────────────────

/**
 * List all open support tickets (Admin/Manager only).
 */
export const getSupportTickets = (ticketStatus = '') =>
  api.get(`${BASE}/support/tickets/`, {
    params: ticketStatus ? { status: ticketStatus } : {},
  }).then((r) => r.data);

/**
 * Get a single ticket + full conversation.
 */
export const getSupportTicketDetail = (ticketId) =>
  api.get(`${BASE}/support/${ticketId}/`).then((r) => r.data);

/**
 * Staff sends a reply in a support conversation.
 */
export const replyToTicket = (ticketId, message) =>
  api.post(`${BASE}/support/${ticketId}/reply/`, { message }).then((r) => r.data);

/**
 * Close a support ticket.
 */
export const closeTicket = (ticketId) =>
  api.patch(`${BASE}/support/${ticketId}/close/`).then((r) => r.data);

/**
 * Assign a ticket to a staff member.
 */
export const assignTicket = (ticketId, assignedToUserId) =>
  api.patch(`${BASE}/support/${ticketId}/assign/`, {
    assigned_to: assignedToUserId,
  }).then((r) => r.data);