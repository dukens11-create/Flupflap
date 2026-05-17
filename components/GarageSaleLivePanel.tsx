'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, Radio, AlertTriangle } from 'lucide-react';

interface Props {
  saleId: string;
  initialIsLive: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export default function GarageSaleLivePanel({ saleId, initialIsLive }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const hasRemoteAnswerRef = useRef(false);

  const [isLive, setIsLive] = useState(initialIsLive);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        signals: Array<{ kind: string; payload: unknown; createdAt: string }>;
      };

      if (!data.isLive) {
        stopSignalPolling();
        return;
      }

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
      throw new Error('Camera preview is required before going live');
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
        setError('WebRTC connection failed. This may be due to network issues or firewall restrictions. Try ending and restarting the live session.');
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal('OFFER', { type: offer.type, sdp: offer.sdp });

    startSignalPolling();
  }, [closePeerConnection, postSignal, startSignalPolling]);

  // Clean up stream and connection on unmount
  useEffect(() => {
    return () => {
      stopSignalPolling();
      closePeerConnection();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [closePeerConnection, stopSignalPolling]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamOn(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Camera access denied: ${msg}`);
    }
  }, [micOn]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const newVal = !micOn;
    streamRef.current.getAudioTracks().forEach((t) => { t.enabled = newVal; });
    setMicOn(newVal);
  }, [micOn]);

  const handleGoLiveClick = () => {
    setShowWarning(true);
  };

  const confirmGoLive = async () => {
    setShowWarning(false);
    setLoading(true);
    setError(null);
    try {
      if (!camOn) await startCamera();
      if (!streamRef.current) {
        throw new Error('Camera preview is required before going live');
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
      stopSignalPolling();
      closePeerConnection();
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end live session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <Radio size={13} /> Live Preview
        </h2>
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
            🔴 LIVE NOW
          </span>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-900 aspect-video flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${camOn ? '' : 'hidden'}`}
        />
        {!camOn && (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <VideoOff size={40} />
            <p className="text-xs">Camera off</p>
          </div>
        )}
        {isLive && (
          <span className="absolute top-2 left-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white animate-pulse">
            🔴 LIVE
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 font-medium">{error}</p>
      )}

      <div className="flex gap-2">
        {!camOn ? (
          <button
            type="button"
            onClick={startCamera}
            className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs"
          >
            <Video size={13} /> Preview Camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={stopCamera}
              className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs"
            >
              <VideoOff size={13} /> Stop Camera
            </button>
            <button
              type="button"
              onClick={toggleMic}
              className="btn-outline flex items-center justify-center gap-1.5 text-xs px-3"
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
            </button>
          </>
        )}
      </div>

      {!isLive ? (
        <button
          type="button"
          onClick={handleGoLiveClick}
          disabled={loading}
          className="btn-brand w-full flex items-center justify-center gap-2"
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

      <p className="text-[11px] text-slate-400 text-center">
        Video is not recorded or stored — only streamed live.
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
              Your camera and microphone will be active. This stream is not recorded, but
              anyone viewing your listing will see the live video while it is active.
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
