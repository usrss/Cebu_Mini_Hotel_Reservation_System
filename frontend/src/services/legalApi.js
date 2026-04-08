import apiClient from "./axiosInstance";

// ─── Public ───────────────────────────────────────────────────────────────────

/** Fetch the currently active Terms & Conditions document */
export const getActiveTerms = () => apiClient.get("/legal/terms/active/");

/** Fetch the currently active Privacy Policy document */
export const getActivePrivacy = () => apiClient.get("/legal/privacy/active/");

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

/**
 * List all legal documents.
 * @param {string} [type] - Optional filter: "terms" | "privacy"
 */
export const listLegalDocuments = (type) =>
  apiClient.get("/legal/", { params: type ? { type } : {} });

/** Retrieve a single document by ID */
export const getLegalDocument = (id) => apiClient.get(`/legal/${id}/`);

/**
 * Create a new legal document.
 * @param {{ type: string, title: string, content: string, version: string, is_active?: boolean }} data
 */
export const createLegalDocument = (data) => apiClient.post("/legal/", data);

/**
 * Fully update a legal document.
 * @param {number} id
 * @param {{ type: string, title: string, content: string, version: string, is_active?: boolean }} data
 */
export const updateLegalDocument = (id, data) => apiClient.put(`/legal/${id}/`, data);

/**
 * Partially update a legal document.
 * @param {number} id
 * @param {object} data
 */
export const patchLegalDocument = (id, data) => apiClient.patch(`/legal/${id}/`, data);

/** Delete a legal document by ID */
export const deleteLegalDocument = (id) => apiClient.delete(`/legal/${id}/`);

/**
 * Activate a legal document (sets it as the active version for its type).
 * @param {number} id
 */
export const activateDocument = (id) => apiClient.patch(`/legal/${id}/activate/`);

// ─── User Agreement ───────────────────────────────────────────────────────────

/**
 * Submit user acceptance of active legal documents.
 * @param {{ terms_version: string, privacy_version: string }} data
 */
export const acceptLegal = (data) => apiClient.post("/legal/accept/", data);

/** Fetch the current user's agreement history */
export const getMyAgreements = () => apiClient.get("/legal/my-agreements/");
