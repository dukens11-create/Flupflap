'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RatingStars from '@/components/RatingStars';

type ExistingReview = {
  rating: number | null;
  comment: string | null;
  blockedByDispute: boolean;
};

export default function OrderItemReviewForm({
  orderItemId,
  productTitle,
  eligible,
  existingReview,
}: {
  orderItemId: string;
  productTitle: string;
  eligible: boolean;
  existingReview: ExistingReview;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existingReview.rating !== null ? String(existingReview.rating) : '5');
  const [comment, setComment] = useState(existingReview.comment ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasReview = existingReview.rating !== null;
  const previewRating = useMemo(() => Number(rating) || 0, [rating]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch(`/api/order-items/${orderItemId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(rating),
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save review.');
      } else {
        setSuccess(
          data.reviewBlockedByDispute
            ? 'Review saved. It will stay hidden while your dispute is open.'
            : hasReview
              ? 'Review updated.'
              : 'Review submitted.',
        );
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!eligible && !hasReview) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Reviews unlock after a valid paid, shipped, delivered, or pickup-confirmed order status.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{hasReview ? 'Your review' : 'Leave a review'}</p>
          <p className="text-xs text-slate-500">{productTitle}</p>
        </div>
        <span className="badge badge-green">Verified purchase</span>
      </div>

      {existingReview.blockedByDispute && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This review is hidden while your dispute is under review.
        </div>
      )}

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="label">Rating</label>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="input max-w-[140px]"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={loading || !eligible}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} star{value === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <RatingStars rating={previewRating} />
              <span>{previewRating || 0}/5</span>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Review</label>
          <textarea
            className="input min-h-24 resize-y"
            maxLength={1000}
            placeholder="Share a few details to help future buyers."
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={loading || !eligible}
          />
          <p className="mt-1 text-xs text-slate-400">{comment.length}/1000 characters</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}

        {eligible && (
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : hasReview ? 'Update review' : 'Submit review'}
          </button>
        )}
      </form>
    </div>
  );
}
