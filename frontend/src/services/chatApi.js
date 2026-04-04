/**
 * src/services/chatApi.js
 *
 * API calls for the chatbot system with role-based ticket routing.
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
 * Used by the widget to receive staff replies in support mode.
 * Now also returns ticket info (tier, priority) if in support mode.
 */
export const pollMessages = (conversationId, afterMessageId, sessionKey = '') =>
  api.get(`${BASE}/poll/${conversationId}/`, {
    params: { after: afterMessageId || 0, session_key: sessionKey },
  }).then((r) => r.data);

// ─── Staff support endpoints ──────────────────────────────────────────────────

/**
 * List support tickets — role-scoped by backend.
 *
 * @param {Object} filters
 *   status   : 'open' | 'in_progress' | 'escalated' | 'closed' | ''
 *   tier     : 'front_desk' | 'manager' | 'admin' | ''
 *   priority : 'low' | 'normal' | 'high' | 'critical' | ''
 *   category : any TicketCategory value | ''
 */
export const getSupportTickets = (filters = {}) => {
  const params = {};
  if (filters.status)   params.status   = filters.status;
  if (filters.tier)     params.tier     = filters.tier;
  if (filters.priority) params.priority = filters.priority;
  if (filters.category) params.category = filters.category;
  return api.get(`${BASE}/support/tickets/`, { params }).then((r) => r.data);
};

/**
 * Get a single ticket + full conversation.
 */
export const getSupportTicketDetail = (ticketId) =>
  api.get(`${BASE}/support/${ticketId}/`).then((r) => r.data);

/**
 * Staff sends a reply in a support conversation.
 * Only allowed for tickets in the staff member's tier.
 */
export const replyToTicket = (ticketId, message) =>
  api.post(`${BASE}/support/${ticketId}/reply/`, { message }).then((r) => r.data);

/**
 * Close a support ticket.
 */
export const closeTicket = (ticketId) =>
  api.patch(`${BASE}/support/${ticketId}/close/`).then((r) => r.data);

/**
 * Assign a ticket to a staff member (Admin/Manager only).
 */
export const assignTicket = (ticketId, assignedToUserId) =>
  api.patch(`${BASE}/support/${ticketId}/assign/`, {
    assigned_to: assignedToUserId,
  }).then((r) => r.data);

/**
 * Escalate a ticket to the next tier in the routing chain.
 * Front Desk → Manager → Admin
 *
 * @param {number} ticketId
 * @param {string} reason  - Optional reason for escalation
 */
export const escalateTicket = (ticketId, reason = '') =>
  api.post(`${BASE}/support/${ticketId}/escalate/`, { reason }).then((r) => r.data);