'use client';

import { useState } from 'react';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_DESCRIPTION_MIN_LENGTH,
  COMPLAINT_STATUS_LABELS,
  FEEDBACK_TEXT_MAX_LENGTH,
  REVIEWABLE_ORDER_STATUSES,
  REVIEW_COMMENT_MIN_LENGTH,
} from '@/lib/order-feedback';

type SellerOption = { id: string; name: string };
type ExistingReview = { sellerId: string; rating: number; comment: string };
type ExistingComplaint = { sellerId: string; category: string; description: string; status: string };
type ReviewFormState = { rating: number; comment: string; loading: boolean; error: string; success: string };
type ComplaintFormState = { category: string; description: string; loading: boolean; error: string; success: string };

export default function OrderFeedbackSection({
  orderId,
  orderStatus,
  sellers,
  existingReviews,
  existingComplaints,
}: {
  orderId: string;
  orderStatus: string;
  sellers: SellerOption[];
  existingReviews: ExistingReview[];
  existingComplaints: ExistingComplaint[];
}) {
  const [reviewState, setReviewState] = useState<Record<string, ReviewFormState>>(() =>
    Object.fromEntries(
      sellers.map((s) => {
        const existing = existingReviews.find((r) => r.sellerId === s.id);
        return [s.id, { rating: existing?.rating ?? 5, comment: existing?.comment ?? '', loading: false, error: '', success: '' }];
      }),
    ),
  );
  const [complaintState, setComplaintState] = useState<Record<string, ComplaintFormState>>(() =>
    Object.fromEntries(
      sellers.map((s) => {
        const existing = existingComplaints.find((c) => c.sellerId === s.id);
        return [s.id, { category: existing?.category ?? '', description: existing?.description ?? '', loading: false, error: '', success: '' }];
      }),
    ),
  );

  const canReview = REVIEWABLE_ORDER_STATUSES.includes(orderStatus as (typeof REVIEWABLE_ORDER_STATUSES)[number]);

  async function submitReview(sellerId: string) {
    const current = reviewState[sellerId];
    if (!current) return;
    setReviewState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: true, error: '', success: '' } }));
    try {
      const res = await fetch(`/api/orders/${orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          rating: current.rating,
          comment: current.comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: data.error || 'Failed to save review.', success: '' } }));
        return;
      }
      setReviewState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: '', success: 'Review saved.' } }));
    } catch {
      setReviewState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: 'Network error. Please try again.', success: '' } }));
    }
  }

  async function submitComplaint(sellerId: string) {
    const current = complaintState[sellerId];
    if (!current) return;
    setComplaintState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: true, error: '', success: '' } }));
    try {
      const res = await fetch(`/api/orders/${orderId}/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          category: current.category,
          description: current.description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComplaintState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: data.error || 'Failed to submit complaint.', success: '' } }));
        return;
      }
      setComplaintState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: '', success: 'Complaint submitted.' } }));
    } catch {
      setComplaintState((prev) => ({ ...prev, [sellerId]: { ...prev[sellerId], loading: false, error: 'Network error. Please try again.', success: '' } }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-bold mb-1">Rate your seller</h2>
        {!canReview && (
          <p className="text-xs text-slate-500 mb-3">
            Reviews are available once the order is delivered or picked up.
          </p>
        )}
        <div className="space-y-4">
          {sellers.map((seller) => {
            const state = reviewState[seller.id];
            return (
              <div key={seller.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold mb-2">{seller.name}</p>
                <div className="grid sm:grid-cols-[140px_1fr] gap-2">
                  <select
                    className="input"
                    value={String(state.rating)}
                    onChange={(e) => setReviewState((prev) => ({ ...prev, [seller.id]: { ...prev[seller.id], rating: Number(e.target.value), success: '', error: '' } }))}
                    disabled={!canReview || state.loading}
                    aria-label={`Rating for ${seller.name}`}
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>{r} {r === 1 ? 'star' : 'stars'}</option>
                    ))}
                  </select>
                  <textarea
                    className="input resize-none"
                    rows={3}
                    maxLength={FEEDBACK_TEXT_MAX_LENGTH}
                    placeholder="Share your experience with this seller..."
                    value={state.comment}
                    onChange={(e) => setReviewState((prev) => ({ ...prev, [seller.id]: { ...prev[seller.id], comment: e.target.value, success: '', error: '' } }))}
                    disabled={!canReview || state.loading}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    onClick={() => submitReview(seller.id)}
                    disabled={!canReview || state.loading || state.comment.trim().length < REVIEW_COMMENT_MIN_LENGTH}
                  >
                    {state.loading ? 'Saving…' : 'Save review'}
                  </button>
                  {state.error && <p className="text-xs text-red-600">{state.error}</p>}
                  {state.success && <p className="text-xs text-green-700">{state.success}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-1">Report a problem</h2>
        <p className="text-xs text-slate-500 mb-3">
          Submit a complaint for this order. Our team can review it.
        </p>
        <div className="space-y-4">
          {sellers.map((seller) => {
            const state = complaintState[seller.id];
            const existing = existingComplaints.find((c) => c.sellerId === seller.id);
            return (
              <div key={seller.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold">{seller.name}</p>
                  {existing?.status && (
                    <span className="badge badge-yellow">
                      {COMPLAINT_STATUS_LABELS[existing.status] ?? existing.status}
                    </span>
                  )}
                </div>
                <div className="grid sm:grid-cols-[220px_1fr] gap-2">
                  <select
                    className="input"
                    value={state.category}
                    onChange={(e) => setComplaintState((prev) => ({ ...prev, [seller.id]: { ...prev[seller.id], category: e.target.value, success: '', error: '' } }))}
                    disabled={state.loading}
                  >
                    <option value="">Select a reason…</option>
                    {COMPLAINT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{COMPLAINT_CATEGORY_LABELS[category]}</option>
                    ))}
                  </select>
                  <textarea
                    className="input resize-none"
                    rows={3}
                    maxLength={FEEDBACK_TEXT_MAX_LENGTH}
                    placeholder="Describe what happened..."
                    value={state.description}
                    onChange={(e) => setComplaintState((prev) => ({ ...prev, [seller.id]: { ...prev[seller.id], description: e.target.value, success: '', error: '' } }))}
                    disabled={state.loading}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn bg-red-600 hover:bg-red-700 text-white text-sm"
                    onClick={() => submitComplaint(seller.id)}
                    disabled={state.loading || !state.category || state.description.trim().length < COMPLAINT_DESCRIPTION_MIN_LENGTH}
                  >
                    {state.loading ? 'Submitting…' : 'Submit complaint'}
                  </button>
                  {state.error && <p className="text-xs text-red-600">{state.error}</p>}
                  {state.success && <p className="text-xs text-green-700">{state.success}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
