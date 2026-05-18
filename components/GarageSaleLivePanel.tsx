'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, Radio, AlertTriangle, Eye, RefreshCcw } from 'lucide-react';

interface Props {
  saleId: string;
  initialIsLive: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
const PREVIEW_REQUIRED_MESSAGE = 'Preview your camera before starting your live garage sale.';

type CameraStatus = 'idle' | 'connecting' | 'ready' | 'awaitingInteraction' | 'blocked' | 'unsupported';

export default function GarageSaleLivePanel({ saleId, initialIsLive }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const hasRemoteAnswerRef = useRef(false);
  const autoRequestedRef = useRef(false);
  const liveRef = useRef(initialIsLive);
  const micOnRef = useRef(true);
  const preferredFacingModeRef = useRef<'user' | 'environment'>('user');

  const [isLive, setIsLive] = useState(initialIsLive);
  const [camOn, setCamOn] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [viewerCount, setViewerCount] = useState(0);
  const [preferredFacingMode, setPreferredFacingMode] = useState<'user' | 'environment'>('user');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

  const stopSignalPolling = useCallback(() => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    hasRemoteAnswerRef.current = false;
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const postSignal = useCallback(async (kind: 'OFFER' | 'ICE', payload: Record<string, unknown>) => {
    await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'SELLER', kind, payload }),
    });
  }, [saleId]);

  const pollSignals = useCallback(async () => {
    if (!peerRef.current || !isLive) return;

    try {
      const params = new URLSearchParams({ role: 'SELLER' });
      if (signalCursorRef.current) params.set('since', signalCursorRef.current);
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json() as {
        isLive: boolean;
        viewerCount?: number;
        signals: Array<{ kind: string; payload: unknown; createdAt: string }>;
      };

      if (!data.isLive) {
        setIsLive(false);
        setViewerCount(0);
        stopSignalPolling();
        return;
      }

      setViewerCount(data.viewerCount ?? 0);

      for (const signal of data.signals) {
        signalCursorRef.current = signal.createdAt;

        if (signal.kind === 'ANSWER' && !hasRemoteAnswerRef.current) {
          const payload = signal.payload as { type?: string; sdp?: string } | null;
          if (!payload) continue;
          const type = payload?.type === 'answer' ? payload.type : null;
          if (!type || !payload.sdp || !peerRef.current) continue;

          await peerRef.current.setRemoteDescription({ type, sdp: payload.sdp });
          hasRemoteAnswerRef.current = true;
        }

        if (signal.kind === 'ICE') {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (!payload?.candidate || !peerRef.current) continue;
          await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      }
    } catch {
      // Polling retries automatically
    }
  }, [isLive, saleId, stopSignalPolling]);

  const startSignalPolling = useCallback(() => {
    stopSignalPolling();
    pollSignals();
    signalPollRef.current = setInterval(pollSignals, 2000);
  }, [pollSignals, stopSignalPolling]);

  const createAndSendOffer = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) {
      throw new Error(PREVIEW_REQUIRED_MESSAGE);
    }
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('Live streaming is not supported in this browser.');
    }

    signalCursorRef.current = null;
    closePeerConnection();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postSignal('ICE', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setError('WebRTC connection failed. Try restarting the live session.');
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal('OFFER', { type: offer.type, sdp: offer.sdp });

    startSignalPolling();
  }, [closePeerConnection, postSignal, startSignalPolling]);

  useEffect(() => {
    liveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    preferredFacingModeRef.current = preferredFacingMode;
  }, [preferredFacingMode]);

  const ensurePreviewPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');

    try {
      await video.play();
      setPreviewReady(true);
      setCameraStatus('ready');
      return true;
    } catch {
      setPreviewReady(false);
      setCameraStatus('awaitingInteraction');
      return false;
    }
  }, []);

  const startCamera = useCallback(async (nextFacingMode = preferredFacingModeRef.current) => {
    if (cameraStatus === 'connecting') {
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unsupported');
      setError('Your browser does not support live camera preview.');
      return false;
    }

    setError(null);
    setCameraStatus('connecting');
    setPreviewReady(false);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacingMode } },
          audio: true,
        });
      } catch (err) {
        const errorName = err instanceof DOMException ? err.name : '';
        if (errorName === 'OverconstrainedError' || errorName === 'NotFoundError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else {
          throw err;
        }
      }

      stream.getAudioTracks().forEach((t) => { t.enabled = micOnRef.current; });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamOn(true);
      return await ensurePreviewPlayback();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setCamOn(false);
      streamRef.current = null;
      setPreviewReady(false);
      setCameraStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'idle');
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Please allow camera access to start your live sale.'
          : (err instanceof Error ? err.message : 'Unable to connect to your camera right now.'),
      );
      return false;
    }
  }, [cameraStatus, ensurePreviewPlayback]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
    setPreviewReady(false);
    setCameraStatus('idle');
  }, []);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const newVal = !micOn;
    streamRef.current.getAudioTracks().forEach((t) => { t.enabled = newVal; });
    setMicOn(newVal);
  }, [micOn]);

  const handleSwitchCamera = useCallback(async () => {
    if (cameraStatus === 'connecting') return;
    const nextFacingMode = preferredFacingMode === 'user' ? 'environment' : 'user';
    setPreferredFacingMode(nextFacingMode);
    await startCamera(nextFacingMode);
  }, [cameraStatus, preferredFacingMode, startCamera]);

  const handleGoLiveClick = () => {
    setShowWarning(true);
  };

  const confirmGoLive = async () => {
    setShowWarning(false);
    setLoading(true);
    setError(null);
    try {
      if (!camOn || !previewReady) {
        const previewStarted = await startCamera();
        if (!previewStarted || !streamRef.current) {
          throw new Error(PREVIEW_REQUIRED_MESSAGE);
        }
      }

      const res = await fetch(`/api/garage-sales/${saleId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to start live');
      }
      setIsLive(true);
      await createAndSendOffer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start live session');
    } finally {
      setLoading(false);
    }
  };

  const handleEndLive = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to end live');
      }
      setIsLive(false);
      setViewerCount(0);
      stopSignalPolling();
      closePeerConnection();
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end live session');
    } finally {
      setLoading(false);
    }
  };

  const endLiveOnPageLeave = useCallback(() => {
    if (!liveRef.current) return;

    const payload = JSON.stringify({ action: 'end' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `/api/garage-sales/${saleId}/live`,
        new Blob([payload], { type: 'application/json' }),
      );
      return;
    }

    void fetch(`/api/garage-sales/${saleId}/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [saleId]);

  // Clean up stream and connection on unmount
  useEffect(() => {
    return () => {
      endLiveOnPageLeave();
      stopSignalPolling();
      closePeerConnection();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [closePeerConnection, endLiveOnPageLeave, stopSignalPolling]);

  useEffect(() => {
    if (autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    void startCamera();
  }, [startCamera]);

  useEffect(() => {
    const hasTouchUi = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!navigator.mediaDevices?.enumerateDevices && !hasTouchUi) return;

    let cancelled = false;
    const detectCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          const videoInputs = devices.filter((device) => device.kind === 'videoinput').length;
          setCanSwitchCamera(hasTouchUi || videoInputs > 1);
        }
      } catch {
        if (!cancelled) {
          setCanSwitchCamera(hasTouchUi);
        }
      }
    };

    void detectCameras();
    return () => {
      cancelled = true;
    };
  }, [camOn]);

  useEffect(() => {
    window.addEventListener('pagehide', endLiveOnPageLeave);
    window.addEventListener('beforeunload', endLiveOnPageLeave);

    return () => {
      window.removeEventListener('pagehide', endLiveOnPageLeave);
      window.removeEventListener('beforeunload', endLiveOnPageLeave);
    };
  }, [endLiveOnPageLeave]);

  const cameraStatusLabel = (() => {
    switch (cameraStatus) {
      case 'connecting':
        return 'Connecting camera...';
      case 'ready':
        return 'Camera ready';
      case 'awaitingInteraction':
        return 'Tap to resume preview';
      case 'blocked':
        return 'Please allow camera access to start your live sale.';
      case 'unsupported':
        return 'Camera preview is not supported in this browser.';
      default:
        return PREVIEW_REQUIRED_MESSAGE;
    }
  })();

  return (
    <div className="card space-y-4 p-4 transition-all duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Radio size={13} /> Live Preview
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            cameraStatus === 'ready'
              ? 'bg-emerald-50 text-emerald-700'
              : cameraStatus === 'connecting'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-amber-50 text-amber-700'
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              cameraStatus === 'ready'
                ? 'bg-emerald-500'
                : cameraStatus === 'connecting'
                  ? 'animate-pulse bg-slate-400'
                  : 'bg-amber-500'
            }`} />
            {cameraStatusLabel}
          </span>
          {isLive && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
                🔴 LIVE NOW
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <Eye size={12} /> {viewerCount} watching
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900 sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${camOn ? '' : 'hidden'}`}
        />
        {!camOn && (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-slate-300">
            <VideoOff size={40} />
            <p className="text-sm font-medium">{PREVIEW_REQUIRED_MESSAGE}</p>
          </div>
        )}
        {isLive && (
          <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white animate-pulse shadow-lg">
            🔴 LIVE
          </span>
        )}
        {camOn && cameraStatus === 'awaitingInteraction' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 p-4">
            <button
              type="button"
              onClick={() => void ensurePreviewPlayback()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Tap to resume preview
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 font-medium">{error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!camOn ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={loading || cameraStatus === 'connecting'}
            className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
          >
            <Video size={13} /> {cameraStatus === 'connecting' ? 'Connecting camera...' : 'Preview Camera'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={stopCamera}
              disabled={loading}
              className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
            >
              <VideoOff size={13} /> Stop Camera
            </button>
            <button
              type="button"
              onClick={toggleMic}
              disabled={loading}
              className="btn-outline flex items-center justify-center gap-1.5 px-3 text-xs disabled:opacity-60"
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
              <span className="sm:hidden">{micOn ? 'Mute Mic' : 'Unmute Mic'}</span>
            </button>
            {canSwitchCamera && !isLive && (
              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                disabled={loading || cameraStatus === 'connecting'}
                className="btn-outline flex items-center justify-center gap-1.5 px-3 text-xs disabled:opacity-60"
                title="Switch camera"
              >
                <RefreshCcw size={13} /> <span className="sm:hidden">Switch Camera</span>
              </button>
            )}
          </>
        )}
      </div>

      {!previewReady && !error && (
        <p className="text-center text-sm text-slate-500">
          {PREVIEW_REQUIRED_MESSAGE}
        </p>
      )}

      {!isLive ? (
        <button
          type="button"
          onClick={handleGoLiveClick}
          disabled={loading || !previewReady}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          <Radio size={14} /> {loading ? 'Starting…' : 'Start Live'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEndLive}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          <VideoOff size={14} /> {loading ? 'Ending…' : 'End Live'}
        </button>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Temporary live stream only • recordings are not stored • your stream ends automatically if you leave this page.
      </p>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">Privacy Notice</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong>You are about to broadcast live</strong> — people can see and hear you.
              Your camera and microphone will be active for this temporary stream only.
              Recordings are not stored, and the stream will end automatically if you leave this page.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmGoLive}
                className="btn-brand flex-1"
              >
                Go Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
