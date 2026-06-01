import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import AdminDriverVerificationReview from '@/components/AdminDriverVerificationReview';

export const metadata: Metadata = { title: 'Driver Verifications — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminDriverVerificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/login?callbackUrl=/admin/driver-verifications');
  }

  const sp = (await searchParams) ?? {};
  const selectedUserId = typeof sp.userId === 'string' ? sp.userId : null;

  const [verifications, selected] = await Promise.all([
    prisma.driverVerification.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        latestAttempt: {
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            validationResults: true,
            submittedAt: true,
          },
        },
      },
    }),
    selectedUserId
      ? prisma.driverVerification.findUnique({
          where: { userId: selectedUserId },
          include: {
            user: { select: { id: true, name: true, email: true } },
            attempts: {
              orderBy: { submittedAt: 'desc' },
              take: 5,
            },
            latestAttempt: true,
            reviewedBy: { select: { id: true, name: true, email: true } },
          },
        })
      : null,
  ]);

  const pendingCount = verifications.filter((item) => item.status === 'PENDING' || item.status === 'REVIEW').length;
  const approvedCount = verifications.filter((item) => item.status === 'APPROVED').length;
  const rejectedCount = verifications.filter((item) => item.status === 'REJECTED').length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Driver verification queue</h1>
          <p className="text-sm text-slate-500">Review pending submissions, compare selfie and license images, and approve or reject drivers.</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin dashboard</Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4 text-center"><p className="text-3xl font-black text-amber-600">{pendingCount}</p><p className="text-sm text-slate-500">Pending / review</p></div>
        <div className="card p-4 text-center"><p className="text-3xl font-black text-green-600">{approvedCount}</p><p className="text-sm text-slate-500">Approved</p></div>
        <div className="card p-4 text-center"><p className="text-3xl font-black text-red-600">{rejectedCount}</p><p className="text-sm text-slate-500">Rejected</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]">
        <section className="card p-4">
          <h2 className="text-lg font-bold text-slate-900">Pending verifications</h2>
          <div className="mt-4 space-y-3">
            {verifications.length === 0 ? (
              <p className="text-sm text-slate-500">No driver verifications have been submitted yet.</p>
            ) : (
              verifications.map((verification) => {
                const params = new URLSearchParams({ userId: verification.userId });
                return (
                  <Link
                    key={verification.id}
                    href={`/admin/driver-verifications?${params.toString()}`}
                    className={`block rounded-2xl border p-4 transition ${selectedUserId === verification.userId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{verification.user.name}</p>
                        <p className="text-xs text-slate-500">{verification.user.email}</p>
                      </div>
                      <span className={`badge ${verification.status === 'APPROVED' ? 'badge-green' : verification.status === 'REJECTED' ? 'badge-red' : 'badge-yellow'}`}>
                        {verification.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Latest attempt #{verification.latestAttempt?.attemptNumber ?? 0} · {verification.latestAttempt ? new Date(verification.latestAttempt.submittedAt).toLocaleString() : 'No attempt'}</p>
                    {verification.licenseNumber ? <p className="mt-2 text-sm text-slate-700">License: {verification.licenseNumber}</p> : null}
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="card p-6">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Select a driver verification from the queue to review extracted data, documents, and approval controls.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{selected.user.name}</h2>
                  <p className="text-sm text-slate-500">{selected.user.email}</p>
                  <p className="mt-2 text-sm text-slate-600">Submitted {selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : '—'} · Deadline {selected.approvalDeadline ? new Date(selected.approvalDeadline).toLocaleString() : 'Not set'}</p>
                </div>
                <span className={`badge ${selected.status === 'APPROVED' ? 'badge-green' : selected.status === 'REJECTED' ? 'badge-red' : 'badge-yellow'}`}>{selected.status}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Extracted data</p>
                  <p className="mt-2">Name: {selected.driverName ?? '—'}</p>
                  <p>License #: {selected.licenseNumber ?? '—'}</p>
                  <p>DOB: {selected.dateOfBirth ?? '—'}</p>
                  <p>Expires: {selected.expirationDate ?? '—'}</p>
                  <p>Jurisdiction: {selected.issuingRegion ?? '—'}</p>
                  <p>Vehicle class: {selected.vehicleClass ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Current review</p>
                  <p className="mt-2">Reason: {selected.rejectionReason ?? '—'}</p>
                  <p>Notes: {selected.adminNotes ?? '—'}</p>
                  <p>Reviewed by: {selected.reviewedBy?.name ?? '—'}</p>
                  <p>Reviewed at: {selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : '—'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Latest attempt</p>
                  <p className="mt-2">Attempt #{selected.latestAttempt?.attemptNumber ?? 0}</p>
                  <p>Confidence: {typeof (selected.latestAttempt?.validationResults as { confidenceAverage?: number } | null)?.confidenceAverage === 'number' ? `${Math.round((((selected.latestAttempt?.validationResults as { confidenceAverage?: number } | null)?.confidenceAverage ?? 0) * 100))}%` : '—'}</p>
                  <p>Request more docs: {selected.requestAdditionalDocuments ? 'Yes' : 'No'}</p>
                  <p>License expiry: {selected.verificationExpiresAt ? new Date(selected.verificationExpiresAt).toLocaleDateString() : '—'}</p>
                </div>
              </div>

              {selected.latestAttempt ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <a href={`/api/account/driver-verification/documents/selfie?attemptId=${selected.latestAttempt.id}&userId=${selected.userId}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 p-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">View selfie</a>
                  <a href={`/api/account/driver-verification/documents/front?attemptId=${selected.latestAttempt.id}&userId=${selected.userId}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 p-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">View license front</a>
                  <a href={`/api/account/driver-verification/documents/back?attemptId=${selected.latestAttempt.id}&userId=${selected.userId}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 p-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">View license back</a>
                </div>
              ) : null}

              {selected.latestAttempt?.validationResults ? (
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Validation findings</p>
                  {Array.isArray((selected.latestAttempt.validationResults as { issues?: string[] }).issues) && (selected.latestAttempt.validationResults as { issues?: string[] }).issues!.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-red-700">
                      {(selected.latestAttempt.validationResults as { issues?: string[] }).issues!.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  ) : null}
                  {Array.isArray((selected.latestAttempt.validationResults as { suspiciousFlags?: string[] }).suspiciousFlags) && (selected.latestAttempt.validationResults as { suspiciousFlags?: string[] }).suspiciousFlags!.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-amber-700">
                      {(selected.latestAttempt.validationResults as { suspiciousFlags?: string[] }).suspiciousFlags!.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <AdminDriverVerificationReview
                userId={selected.userId}
                currentStatus={selected.status}
                currentReason={selected.rejectionReason}
                currentNotes={selected.adminNotes}
                currentDeadline={selected.approvalDeadline?.toISOString() ?? null}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
