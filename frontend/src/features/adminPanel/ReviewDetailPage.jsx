/**
 * ReviewDetailPage.jsx
 * Full review record with visibility toggle.
 * Accessible by: admin, manager
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, ShieldCheck, Eye, EyeOff, ArrowLeft, CalendarDays, User, Mail, Hash, BedDouble, Star as StarIcon } from 'lucide-react';
import { reviewApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './ReviewDetailPage.module.css';

function Stars({ rating }) {
  return (
    <span className={styles.stars}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

function Field({ label, value }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value ?? '—'}</span>
    </div>
  );
}

export default function ReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // FIX: destructure `loading` so we don't flash "Access denied" while role resolves.
  const { canManageReviews, loading: roleLoading } = useAdminRole();

  const [review, setReview]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    reviewApi.detail(id)
      .then(setReview)
      .catch((err) => setError(err.response?.data?.detail ?? 'Review not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleVisibility = async () => {
    const newVisible = !review.is_visible;
    const reason     = newVisible ? '' : (prompt('Reason for hiding (optional):') ?? '');
    setToggling(true);
    try {
      const res = await reviewApi.setVisibility(id, { is_visible: newVisible, reason });
      setReview(res.review);
    } catch {
      alert('Failed to update visibility.');
    } finally {
      setToggling(false);
    }
  };

  // FIX: wait for role to resolve before showing access denied.
  if (roleLoading)           return <div className={styles.state}>Loading…</div>;
  if (!canManageReviews)     return <div className={styles.stateError}>Access denied.</div>;
  if (loading)               return <div className={styles.state}>Loading…</div>;
  if (error)                 return <div className={styles.stateError}>{error}</div>;
  if (!review)               return null;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/admin/reviews')}>
        <ArrowLeft size={15} /> Back to Reviews
      </button>

      {/* Header bar */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <Stars rating={review.rating} />
          <div className={styles.badges}>
            {review.is_verified && (
              <span className={styles.verified}>
                <ShieldCheck size={12} /> Verified
              </span>
            )}
            <span className={review.is_visible ? styles.visibleBadge : styles.hiddenBadge}>
              {review.is_visible ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Hidden</>}
            </span>
          </div>
        </div>
        <button
          className={review.is_visible ? styles.hideBtn : styles.showBtn}
          onClick={toggleVisibility}
          disabled={toggling}
        >
          {review.is_visible ? <><EyeOff size={14} /> Hide Review</> : <><Eye size={14} /> Show Review</>}
        </button>
      </div>

      {/* Review content card */}
      <div className={styles.reviewCard}>
        <p className={styles.reviewText}>{review.review_text}</p>
        <div className={styles.helpful}>
          <span className={styles.voteBadge + ' ' + styles.voteBadgeUp}>
            <ThumbsUp size={14} /> {review.helpful_count} helpful
          </span>
          <span className={styles.voteBadge + ' ' + styles.voteBadgeDown}>
            <ThumbsDown size={14} /> {review.not_helpful_count} not helpful
          </span>
        </div>
      </div>

      {/* Detail sections */}
      <div className={styles.sections}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <User size={15} /> Guest & Booking
          </h2>
          <div className={styles.grid}>
            <Field label="Guest Name" value={review.guest_name} />
            <Field label="Guest Email" value={review.guest_email} />
            <Field label="Booking Ref" value={review.booking_reference} />
            <Field label="Room" value={`${review.room_number} · ${review.room_type}`} />
          </div>
        </div>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <CalendarDays size={15} /> Review Info
          </h2>
          <div className={styles.grid}>
            <Field label="Rating" value={`${review.rating} / 5`} />
            <Field label="Stars" value={review.star_display} />
            <Field label="Created" value={new Date(review.created_at).toLocaleString()} />
            <Field label="Updated" value={new Date(review.updated_at).toLocaleString()} />
          </div>
        </div>
      </div>
    </div>
  );
}