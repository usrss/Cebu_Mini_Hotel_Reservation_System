/**
 * legalRoutes.jsx
 * src/components/legalRoutes.jsx
 *
 * Imports corrected to match actual project structure:
 *   features/legal/        — public legal pages & components
 *   features/adminPanel/legal/ — admin legal management page
 */

import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

import TermsAndConditions from '../features/legal/TermsAndConditions';
import PrivacyPolicy      from '../features/legal/PrivacyPolicy';
import BookingCheckout    from '../features/legal/BookingCheckout';
import AdminLegal         from '../features/adminPanel/legal/AdminLegal';

import AdminLayout from '../features/adminPanel/layout/AdminLayout';

// ── Route array — spread into your <Routes> in App.jsx ───────────────────────
export const legalRoutes = [

  // ── Public (no auth required) ─────────────────────────────────────────────
  <Route
    key="terms"
    path="/terms-and-conditions"
    element={<TermsAndConditions />}
  />,
  <Route
    key="privacy"
    path="/privacy-policy"
    element={<PrivacyPolicy />}
  />,

  // ── Booking checkout integration example ──────────────────────────────────
  // NOTE: Merge LegalCheckbox logic into your existing BookingForm.jsx instead
  // of adding this as a standalone route. Keeping here for reference only.
  <Route
    key="booking-checkout"
    path="/booking/checkout"
    element={<BookingCheckout />}
  />,

  // ── Admin legal management (admin + manager only) ─────────────────────────
  <Route
    key="admin-legal"
    path="/admin/legal"
    element={
      <ProtectedRoute allowedRoles={['admin', 'manager']}>
        <AdminLayout>
          <AdminLegal />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,
];