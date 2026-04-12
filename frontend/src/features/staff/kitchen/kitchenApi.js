/**
 * kitchenApi.js
 * Thin API layer for kitchen staff — wraps food order endpoints.
 */
import api from '../../../services/api';

export const kitchenApi = {
  /** Pending orders — all rooms, newest first */
  getPending: async () => {
    const res = await api.get('/food/orders/kitchen/?status=pending');
    return res.data.results ?? res.data;
  },

  /** Completed orders for today */
  getCompleted: async () => {
    const res = await api.get('/food/orders/kitchen/?status=completed');
    return res.data.results ?? res.data;
  },

  /** Mark a single order as completed */
  markCompleted: async (orderId) => {
    const res = await api.patch(`/food/orders/${orderId}/complete/`);
    return res.data;
  },
};