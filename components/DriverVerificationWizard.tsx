'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  buildDriverVerificationSummary,
  DRIVER_REJECTION_REASONS,
  type DriverLicenseData,
} from '@/lib/driver-verification-shared';

type VerificationAttempt = {
  id: string;
  attemptNumber: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEW';
  submittedAt: string;
  validationResults?: {
    issues?: string[];
    suspiciousFlags?: string[];
    confidenceAverage?: number;
  } | null;
  documentUrls: {
    selfie: string;
    front: string;
    back: string;
  };
};

type VerificationRecord = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEW';
  driverName?: string | null;
  licenseNumber?: string | null;
  expirationDate?: string | null;
  rejectionReason?: string | null;
  adminNotes?: string | null;
  approvalDeadline?: string | null;
  verifiedAt?: string | null;
  submittedAt?: string | null;
  attempts: VerificationAttempt[];
};

type ApiState = {
  verificationStatus: VerificationRecord['status'] | null;
  verification: VerificationRecord | null;
  storageConfigured: boolean;
};

type ImageAnalysis = {
  brightness: number;
  sharpness: number;
  faceDetected?: boolean | null;
  warnings: string[];
};

type UploadState = {
  file: File | null;
  previewUrl: string | null;
  analysis: ImageAnalysis | null;
};

const emptyCorrectionState: DriverLicenseData = {
  licenseNumber: '',
  driverName: '',
  dateOfBirth: '',
  expirationDate: '',
  issuingRegion: '',
  vehicleClass: '',
};

const steps = [
  'Requirements',
  'Selfie',
  'License front',
  'License back',
  'OCR review',
  'Submit',
];

function badgeClass(status: VerificationRecord['status'] | null) {
  if (status === 'APPROVED') return 'badge badge-green';
  if (status === 'REJECTED') return 'badge badge-red';
  if (status === 'REVIEW') return 'badge badge-yellow';
  if (status === 'PENDING') return 'badge badge-blue';
  return 'badge badge-slate';
}

async function analyzeImage(file: File, requireFace = false): Promise<ImageAnalysis> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Unable to read selected image.'));
      nextImage.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    const width = Math.min(800, img.width || 800);
    const height = Math.max(1, Math.round((img.height / Math.max(img.width, 1)) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return { brightness: 0, sharpness: 0, faceDetected: null, warnings: ['Image analysis is not available in this browser.'] };
    }

    context.drawImage(img, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    let brightnessTotal = 0;
    let sharpnessTotal = 0;
    let pixelCount = 0;

    for (let index = 0; index < data.length; index += 4) {
      const current = (data[index] + data[index + 1] + data[index + 2]) / 3;
      brightnessTotal += current;
      pixelCount += 1;
      if (index >= 4) {
        const previous = (data[index - 4] + data[index - 3] + data[index - 2]) / 3;
        sharpnessTotal += Math.abs(current - previous);
      }
    }

    const brightness = Number((brightnessTotal / Math.max(pixelCount, 1)).toFixed(1));
    const sharpness = Number((sharpnessTotal / Math.max(pixelCount, 1)).toFixed(1));
    let faceDetected: boolean | null = null;
    const warnings: string[] = [];

    if (brightness < 60) warnings.push('Lighting looks low. Move to a brighter area and retake the image.');
    if (sharpness < 12) warnings.push('Image may be blurry. Hold the camera steady and retake the image.');

    if (requireFace) {
      const FaceDetectorCtor = (globalThis as typeof globalThis & {
        FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
          detect: (input: CanvasImageSource) => Promise<unknown[]>;
        };
      }).FaceDetector;
      if (FaceDetectorCtor) {
        try {
          const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
          const faces = await detector.detect(canvas);
          faceDetected = faces.length > 0;
          if (!faceDetected) {
            warnings.push('No face was detected automatically. Make sure your face is centered and uncovered.');
          }
        } catch {
          faceDetected = null;
        }
      }
    }

    return { brightness, sharpness, faceDetected, warnings };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function runOcrOnImage(file: File) {
  const { recognize } = await import('tesseract.js');
  const result = await recognize(file, 'eng', {
    logger: () => undefined,
  });
  return result.data.text ?? '';
}

export default function DriverVerificationWizard() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState>({
    verificationStatus: null,
    verification: null,
    storageConfigured: true,
  });
  const [selfie, setSelfie] = useState<UploadState>({ file: null, previewUrl: null, analysis: null });
  const [front, setFront] = useState<UploadState>({ file: null, previewUrl: null, analysis: null });
  const [back, setBack] = useState<UploadState>({ file: null, previewUrl: null, analysis: null });
  const [ocrText, setOcrText] = useState('');
  const [corrections, setCorrections] = useState<DriverLicenseData>(emptyCorrectionState);
  const [selfieChecks, setSelfieChecks] = useState({ faceVisible: false, noCovering: false, lightingConfirmed: false });
  const [documentChecks, setDocumentChecks] = useState({ frontInFrame: false, backInFrame: false, frontReadable: false, backReadable: false });
  const [livenessChecks, setLivenessChecks] = useState({ blinked: false, nodded: false });

  async function refreshState() {
    setLoading(true);
    const response = await fetch('/api/account/driver-verification', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error ?? 'Failed to load driver verification status.');
    }
    setApiState(data);
    setLoading(false);
  }

  useEffect(() => {
    refreshState().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load driver verification.');
      setLoading(false);
    });
  }, []);

  const summary = useMemo(
    () =>
      buildDriverVerificationSummary({
        rawText: ocrText,
        correctedData: corrections,
      }),
    [ocrText, corrections],
  );

  async function handleFileSelection(
    file: File | null,
    setState: Dispatch<SetStateAction<UploadState>>,
    requireFace = false,
  ) {
    if (!file) {
      setState((current) => {
        if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return { file: null, previewUrl: null, analysis: null };
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setState((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl, analysis: null };
    });

    try {
      const analysis = await analyzeImage(file, requireFace);
      setState({ file, previewUrl, analysis });
    } catch (analysisError) {
      setState({
        file,
        previewUrl,
        analysis: {
          brightness: 0,
          sharpness: 0,
          faceDetected: requireFace ? null : undefined,
          warnings: [analysisError instanceof Error ? analysisError.message : 'Unable to analyze the image.'],
        },
      });
    }
  }

  async function handleRunOcr() {
    if (!front.file && !back.file) {
      setError('Upload license images before running OCR.');
      return;
    }

    setRunningOcr(true);
    setError(null);
    try {
      const textParts = await Promise.all([
        front.file ? runOcrOnImage(front.file) : Promise.resolve(''),
        back.file ? runOcrOnImage(back.file) : Promise.resolve(''),
      ]);
      const combined = textParts.filter(Boolean).join('\n\n');
      const extracted = buildDriverVerificationSummary({ rawText: combined });
      setOcrText(combined);
      setCorrections((current) => ({
        ...current,
        licenseNumber: current.licenseNumber || extracted.extractedData.licenseNumber || '',
        driverName: current.driverName || extracted.extractedData.driverName || '',
        dateOfBirth: current.dateOfBirth || extracted.extractedData.dateOfBirth || '',
        expirationDate: current.expirationDate || extracted.extractedData.expirationDate || '',
        issuingRegion: current.issuingRegion || extracted.extractedData.issuingRegion || '',
        vehicleClass: current.vehicleClass || extracted.extractedData.vehicleClass || '',
      }));
      setStatusMessage('OCR completed. Review the extracted fields below before submitting.');
    } catch (ocrError) {
      setError(
        ocrError instanceof Error
          ? `OCR failed: ${ocrError.message}. You can still type the details manually.`
          : 'OCR failed. You can still type the details manually.',
      );
    } finally {
      setRunningOcr(false);
    }
  }

  async function handleSubmit() {
    if (!selfie.file || !front.file || !back.file) {
      setError('Upload the selfie and both sides of the license before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const payload = new FormData();
      payload.set('selfieImage', selfie.file);
      payload.set('licenseFrontImage', front.file);
      payload.set('licenseBackImage', back.file);
      payload.set(
        'metadata',
        JSON.stringify({
          rawText: ocrText,
          correctedData: corrections,
          selfieChecks: {
            ...selfieChecks,
            brightness: selfie.analysis?.brightness ?? null,
            sharpness: selfie.analysis?.sharpness ?? null,
            faceDetected: selfie.analysis?.faceDetected ?? null,
            warnings: selfie.analysis?.warnings ?? [],
          },
          documentChecks: {
            ...documentChecks,
            frontBrightness: front.analysis?.brightness ?? null,
            frontSharpness: front.analysis?.sharpness ?? null,
            frontWarnings: front.analysis?.warnings ?? [],
            backBrightness: back.analysis?.brightness ?? null,
            backSharpness: back.analysis?.sharpness ?? null,
            backWarnings: back.analysis?.warnings ?? [],
          },
          livenessChecks,
        }),
      );

      const response = await fetch('/api/account/driver-verification', {
        method: 'POST',
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to submit driver verification.');
      }

      setStatusMessage(data.message ?? 'Verification submitted.');
      setActiveStep(6);
      await refreshState();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit verification.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="card p-6 text-sm text-slate-500">Loading driver verification…</div>;
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Driver verification</h1>
            <p className="mt-2 text-sm text-slate-600">
              Upload a live selfie and both sides of your driver&apos;s license, review OCR results, and submit the verification package for approval.
            </p>
          </div>
          <span className={badgeClass(apiState.verificationStatus)}>
            {apiState.verificationStatus ?? 'NOT STARTED'}
          </span>
        </div>

        {apiState.verification?.verifiedAt && (
          <p className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            ✓ Verified on {new Date(apiState.verification.verifiedAt).toLocaleString()}.
          </p>
        )}
        {apiState.verification?.rejectionReason && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {apiState.verification.rejectionReason}
            {apiState.verification.adminNotes ? ` — ${apiState.verification.adminNotes}` : ''}
          </p>
        )}
        {!apiState.storageConfigured && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Secure document storage is not configured yet, so new submissions are temporarily disabled.
          </p>
        )}
        {statusMessage && (
          <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{statusMessage}</p>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap gap-2">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === activeStep;
            return (
              <button
                key={step}
                type="button"
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                onClick={() => setActiveStep(stepNumber)}
              >
                {stepNumber}. {step}
              </button>
            );
          })}
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${(activeStep / steps.length) * 100}%` }} />
        </div>
      </section>

      {activeStep === 1 && (
        <section className="card p-6 space-y-3">
          <h2 className="text-xl font-bold">Step 1: Instructions</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Use a well-lit space and make sure your full face is visible with no hat, sunglasses, or mask.</li>
            <li>Capture the front and back of your license with all corners inside the frame and readable text.</li>
            <li>OCR extracts text automatically, but you can correct any field before submitting.</li>
            <li>Manual review is triggered for suspicious documents, low-confidence OCR, expired licenses, or name mismatches.</li>
          </ul>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-primary" onClick={() => setActiveStep(2)}>Start verification</button>
            <button type="button" className="btn-outline" onClick={() => setActiveStep(6)}>Skip to status</button>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-xl font-bold">Step 2: Capture a selfie</h2>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null, setSelfie, true)}
          />
          {selfie.previewUrl && <img src={selfie.previewUrl} alt="Selfie preview" className="max-h-72 rounded-2xl border border-slate-200 object-contain bg-slate-50" />}
          {selfie.analysis && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>Brightness: {selfie.analysis.brightness}</p>
              <p>Sharpness: {selfie.analysis.sharpness}</p>
              <p>Face detection: {selfie.analysis.faceDetected === null ? 'Unavailable in this browser' : selfie.analysis.faceDetected ? 'Detected' : 'Not detected'}</p>
              {selfie.analysis.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-700">
                  {selfie.analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={selfieChecks.faceVisible} onChange={(event) => setSelfieChecks((current) => ({ ...current, faceVisible: event.target.checked }))} /> Face is clearly visible</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={selfieChecks.noCovering} onChange={(event) => setSelfieChecks((current) => ({ ...current, noCovering: event.target.checked }))} /> No mask or covering</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={selfieChecks.lightingConfirmed} onChange={(event) => setSelfieChecks((current) => ({ ...current, lightingConfirmed: event.target.checked }))} /> Lighting is acceptable</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={livenessChecks.blinked} onChange={(event) => setLivenessChecks((current) => ({ ...current, blinked: event.target.checked }))} /> I completed a blink check</label>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-xl font-bold">Step 3: Capture license front</h2>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null, setFront)}
          />
          {front.previewUrl && <img src={front.previewUrl} alt="License front preview" className="max-h-72 rounded-2xl border border-slate-200 object-contain bg-slate-50" />}
          {front.analysis && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>Brightness: {front.analysis.brightness}</p>
              <p>Sharpness: {front.analysis.sharpness}</p>
              {front.analysis.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-700">
                  {front.analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={documentChecks.frontInFrame} onChange={(event) => setDocumentChecks((current) => ({ ...current, frontInFrame: event.target.checked }))} /> Document is fully in frame</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={documentChecks.frontReadable} onChange={(event) => setDocumentChecks((current) => ({ ...current, frontReadable: event.target.checked }))} /> Text is readable and not blurry</label>
        </section>
      )}

      {activeStep === 4 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-xl font-bold">Step 4: Capture license back</h2>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null, setBack)}
          />
          {back.previewUrl && <img src={back.previewUrl} alt="License back preview" className="max-h-72 rounded-2xl border border-slate-200 object-contain bg-slate-50" />}
          {back.analysis && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>Brightness: {back.analysis.brightness}</p>
              <p>Sharpness: {back.analysis.sharpness}</p>
              {back.analysis.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-700">
                  {back.analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={documentChecks.backInFrame} onChange={(event) => setDocumentChecks((current) => ({ ...current, backInFrame: event.target.checked }))} /> Document is fully in frame</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={documentChecks.backReadable} onChange={(event) => setDocumentChecks((current) => ({ ...current, backReadable: event.target.checked }))} /> Text is readable and not blurry</label>
        </section>
      )}

      {activeStep === 5 && (
        <section className="card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Step 5: OCR review and correction</h2>
              <p className="text-sm text-slate-600">Run OCR, review the extracted text, and correct any mistakes before submitting.</p>
            </div>
            <button type="button" className="btn-outline" onClick={handleRunOcr} disabled={runningOcr}>
              {runningOcr ? 'Running OCR…' : 'Run OCR extraction'}
            </button>
          </div>

          <label className="label">Raw OCR text</label>
          <textarea className="input min-h-40" value={ocrText} onChange={(event) => setOcrText(event.target.value)} placeholder="OCR text will appear here. You can also paste text from another scanner if needed." />

          <div className="grid gap-4 md:grid-cols-2">
            {([
              ['licenseNumber', 'License number'],
              ['driverName', 'Driver name'],
              ['dateOfBirth', 'Date of birth'],
              ['expirationDate', 'Expiration date'],
              ['issuingRegion', 'Issuing country/state'],
              ['vehicleClass', 'Vehicle class'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block text-sm text-slate-700">
                <span className="label">{label}</span>
                <input
                  className="input"
                  value={(corrections[key] as string) || ''}
                  onChange={(event) => setCorrections((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={(summary.extractedData[key] as string) || 'Enter manually'}
                />
                <span className="mt-1 block text-xs text-slate-500">Confidence: {Math.round((summary.confidence[key] ?? 0) * 100)}%</span>
              </label>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Validation preview</p>
            <p className="mt-1">Average confidence: {Math.round(summary.validation.confidenceAverage * 100)}%</p>
            <p>Status: {summary.validation.requiresManualReview ? 'Manual review required' : 'Ready for approval queue'}</p>
            {summary.validation.issues.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-red-700">
                {summary.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
            {summary.validation.suspiciousFlags.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-amber-700">
                {summary.validation.suspiciousFlags.map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      {activeStep === 6 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-xl font-bold">Step 6: Final submission</h2>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>Selfie uploaded: {selfie.file ? 'Yes' : 'No'}</p>
            <p>License front uploaded: {front.file ? 'Yes' : 'No'}</p>
            <p>License back uploaded: {back.file ? 'Yes' : 'No'}</p>
            <p>OCR/manual data complete: {summary.validation.completenessValid ? 'Yes' : 'Needs attention'}</p>
            <p>Manual review likely: {summary.validation.requiresManualReview ? 'Yes' : 'No'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={submitting || !apiState.storageConfigured} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit verification'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setActiveStep(5)}>Go back</button>
          </div>
          <p className="text-xs text-slate-500">Common rejection reasons: {DRIVER_REJECTION_REASONS.join(', ')}.</p>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-outline" onClick={() => setActiveStep((current) => Math.max(1, current - 1))} disabled={activeStep === 1}>
          Back
        </button>
        <button type="button" className="btn-outline" onClick={() => setActiveStep((current) => Math.min(6, current + 1))} disabled={activeStep === 6}>
          Next
        </button>
      </div>

      {apiState.verification?.attempts?.length ? (
        <section className="card p-6">
          <h2 className="text-xl font-bold">Verification timeline</h2>
          <div className="mt-4 space-y-4">
            {apiState.verification.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">Attempt #{attempt.attemptNumber}</p>
                  <span className={badgeClass(attempt.status)}>{attempt.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">Submitted {new Date(attempt.submittedAt).toLocaleString()}</p>
                {attempt.validationResults?.issues?.length ? (
                  <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
                    {attempt.validationResults.issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                ) : null}
                {attempt.validationResults?.suspiciousFlags?.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-700">
                    {attempt.validationResults.suspiciousFlags.map((flag) => <li key={flag}>{flag}</li>)}
                  </ul>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <a className="btn-outline" href={attempt.documentUrls.selfie} target="_blank" rel="noreferrer">View selfie</a>
                  <a className="btn-outline" href={attempt.documentUrls.front} target="_blank" rel="noreferrer">View front</a>
                  <a className="btn-outline" href={attempt.documentUrls.back} target="_blank" rel="noreferrer">View back</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
