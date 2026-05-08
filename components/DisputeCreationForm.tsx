import { DISPUTE_REASON_OPTIONS, DISPUTE_RESOLUTION_OPTIONS } from '@/lib/disputes';
import DisputeEvidenceUpload from '@/components/DisputeEvidenceUpload';

export default function DisputeCreationForm({
  orderId,
  orderItemId,
  returnWindowCopy,
}: {
  orderId: string;
  orderItemId: string;
  returnWindowCopy: string;
}) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 list-none">
        Open a return, refund, or dispute request
      </summary>
      <form action={`/api/orders/${orderId}/disputes`} method="POST" className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3">
        <input type="hidden" name="orderItemId" value={orderItemId} />
        <div className="rounded-xl bg-white/80 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">How this works</p>
          <p className="mt-1">{returnWindowCopy}</p>
          <p className="mt-1">The seller reviews new requests first. If needed, FlupFlap can step in and make the final refund decision.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Issue</label>
            <select name="reason" className="input" required>
              <option value="">Select...</option>
              {DISPUTE_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Requested outcome</label>
            <select name="requestedResolution" className="input" required>
              {DISPUTE_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">What happened?</label>
          <textarea
            name="description"
            className="input h-28 resize-none"
            minLength={20}
            maxLength={2000}
            placeholder="Include the issue, what you have tried so far, and what resolution you need."
            required
          />
        </div>
        <DisputeEvidenceUpload />
        <button type="submit" className="btn-primary text-sm">
          Submit request
        </button>
      </form>
    </details>
  );
}
