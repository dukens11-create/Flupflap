'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, Radio, AlertTriangle, Eye, RefreshCcw } from 'lucide-react';
import { RTC_CONFIG } from '@/lib/rtc-config';

interface Props {
  saleId: string;
  initialIsLive: boolean;
}

const PREVIEW_REQUIRED_MESSAGE = 'Preview your camera before starting your live garage sale.';
const CAMERA_BLOCKED_MESSAGE = 'Camera access blocked';
const CAMERA_READY_MESSAGE = 'Camera ready';
const CAMERA_CONNECTING_MESSAGE = 'Connecting camera...';
const CAMERA_PREVIEW_PLACEHOLDER = 'Camera preview will appear here.';
const CAMERA_STATUS_UNKNOWN_MESSAGE = 'Camera status unknown.';
const CAMERA_PERMISSION_HELP_MESSAGE = 'Allow camera access in your browser settings, then tap Retry Camera Permission. On Android Chrome, open Site settings → Camera → Allow.';
const INSECURE_CAMERA_CONTEXT_MESSAGE = 'Live camera requires HTTPS (or localhost in development). Reopen this page securely, then retry.';
const MOBILE_CAMERA_LOG_PREFIX = '[GarageSaleLivePanel][mobile-camera]';
const RTC_LOG_PREFIX = '[GarageSaleLivePanel][rtc]';
// Give mobile browsers time to emit initial stream metadata before attempting playback.
const MEDIA_READY_TIMEOUT_MS = 1500;
// Retry once shortly after the first play() rejection for iOS/Safari startup timing quirks.
const PLAYBACK_RETRY_DELAY_MS = 120;
const REMOTE_ANSWER_TIMEOUT_MS = 10000;
const MOBILE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 24, max: 30 },
};

type CameraStatus = 'idle' | 'connecting' | 'ready' | 'awaitingInteraction' | 'blocked' | 'denied' | 'unsupported';

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

function getCameraMessageStyles(cameraStatus: CameraStatus, hasError: boolean) {
  if (cameraStatus === 'ready') return 'bg-emerald-50 text-emerald-700';
  if (cameraStatus === 'blocked' || cameraStatus === 'denied' || hasError) return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function GarageSaleLivePanel({ saleId, initialIsLive }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const hasRemoteAnswerRef = useRef(false);
  const liveRef = useRef(initialIsLive);
  const micOnRef = useRef(true);
  const micPermissionDeniedRef = useRef(false);
  const preferredFacingModeRef = useRef<'user' | 'environment'>('user');

  const reconnectTimeoutRef = useRef<number | null>(null);
  // Always points at the latest createAndSendOffer so connection-state handlers
  // can re-offer without holding a stale closure.
  const createAndSendOfferRef = useRef<(() => Promise<void>) | null>(null);
  // Always points at the latest startSignalPolling so reconnect error paths can
  // restart polling without a stale closure.
  const startSignalPollingRef = useRef<(() => void) | null>(null);
  const startCameraRef = useRef<((nextFacingMode?: 'user' | 'environment') => Promise<boolean>) | null>(null);
  // ICE candidates received before the remote answer is applied are buffered here
  // and drained once setRemoteDescription(answer) completes.
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const offerAnswerTimeoutRef = useRef<number | null>(null);
  const peerStateLogRef = useRef<{
    connectionState: RTCPeerConnectionState | null;
    iceConnectionState: RTCIceConnectionState | null;
    signalingState: RTCSignalingState | null;
  }>({
    connectionState: null,
    iceConnectionState: null,
    signalingState: null,
  });

  const [isLive, setIsLive] = useState(initialIsLive);
  const [camOn, setCamOn] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [viewerCount, setViewerCount] = useState(0);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('front');

  const logMobileCameraIssue = useCallback((issue: string, details?: Record<string, unknown>) => {
    if (details) {
      console.warn(`${MOBILE_CAMERA_LOG_PREFIX} ${issue}`, details);
      return;
    }
    console.warn(`${MOBILE_CAMERA_LOG_PREFIX} ${issue}`);
  }, []);

  const logRtcEvent = useCallback((event: string, details?: Record<string, unknown>) => {
    if (details) {
      console.info(`${RTC_LOG_PREFIX} ${event}`, details);
      return;
    }
    console.info(`${RTC_LOG_PREFIX} ${event}`);
  }, []);

  const clearOfferAnswerTimeout = useCallback(() => {
    if (offerAnswerTimeoutRef.current) {
      window.clearTimeout(offerAnswerTimeoutRef.current);
      offerAnswerTimeoutRef.current = null;
    }
  }, []);

  const stopSignalPolling = useCallback(() => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    clearOfferAnswerTimeout();
    hasRemoteAnswerRef.current = false;
    pendingIceCandidatesRef.current = [];
    peerStateLogRef.current = {
      connectionState: null,
      iceConnectionState: null,
      signalingState: null,
    };
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.onsignalingstatechange = null;
      peerRef.current.close();
    }
    peerRef.current = null;
  }, [clearOfferAnswerTimeout]);

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
          clearOfferAnswerTimeout();
          setError(null);
          logRtcEvent('remote answer received');

          // Drain ICE candidates that arrived before the answer was applied.
          for (const candidate of pendingIceCandidatesRef.current) {
            if (!peerRef.current) break;
            try {
              await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
              // Stale or incompatible candidate — ignore
            }
          }
          pendingIceCandidatesRef.current = [];
        }

        if (signal.kind === 'ICE') {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (!payload?.candidate) continue;
          if (!hasRemoteAnswerRef.current) {
            // Buffer the candidate until setRemoteDescription(answer) completes.
            // Adding a candidate before the remote description is set throws and
            // the candidate would be permanently dropped.
            pendingIceCandidatesRef.current.push(payload.candidate);
            continue;
          }
          if (!peerRef.current) continue;
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // Ignore stale candidates from a previous peer connection
          }
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
    let stream = streamRef.current;
    if (
      !stream
      || !stream.getVideoTracks().some((track) => track.readyState === 'live')
    ) {
      const startCameraHandler = startCameraRef.current;
      if (!startCameraHandler) {
        throw new Error('Camera preview is not ready. Retry your camera preview before going live.');
      }
      const cameraStarted = await startCameraHandler(preferredFacingModeRef.current);
      stream = streamRef.current;
      if (
        !cameraStarted
        || !stream
        || !stream.getVideoTracks().some((track) => track.readyState === 'live')
      ) {
        throw new Error('Camera preview is not ready. Retry your camera preview before going live.');
      }
    }
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('Live streaming is not supported in this browser.');
    }

    signalCursorRef.current = null;
    closePeerConnection();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;
    peerStateLogRef.current = {
      connectionState: null,
      iceConnectionState: null,
      signalingState: null,
    };

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
    logRtcEvent('stream started', {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postSignal('ICE', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (peerStateLogRef.current.connectionState !== pc.connectionState) {
        peerStateLogRef.current.connectionState = pc.connectionState;
        logRtcEvent('connectionState', { state: pc.connectionState });
      }

      if (pc.connectionState === 'connected') {
        setError(null);
        clearOfferAnswerTimeout();
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        logRtcEvent('peer connected');
      }

      if (pc.connectionState === 'disconnected') {
        // Give ICE 5 seconds to self-recover before re-offering
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (!liveRef.current || peerRef.current !== pc) return;
          logRtcEvent('reconnect attempt', { reason: 'connectionState disconnected' });
          void (async () => {
            try {
              await createAndSendOfferRef.current?.();
            } catch {
              // If re-offer fails, restart polling so buyer signals are not lost
              startSignalPollingRef.current?.();
            }
          })();
        }, 5000);
      }

      if (pc.connectionState === 'failed') {
        setError('Connection lost. Attempting to reconnect…');
        clearOfferAnswerTimeout();
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (!liveRef.current || peerRef.current !== pc) return;
          logRtcEvent('reconnect attempt', { reason: 'connectionState failed' });
          void (async () => {
            try {
              await createAndSendOfferRef.current?.();
            } catch {
              // If re-offer fails, restart polling so buyer signals are not lost
              startSignalPollingRef.current?.();
            }
          })();
        }, 2000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (peerStateLogRef.current.iceConnectionState !== pc.iceConnectionState) {
        peerStateLogRef.current.iceConnectionState = pc.iceConnectionState;
        logRtcEvent('iceConnectionState', { state: pc.iceConnectionState });
      }
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        logRtcEvent('ICE connected', { state: pc.iceConnectionState });
      }
      if (pc.iceConnectionState === 'failed') {
        setError('Connection lost. Attempting to reconnect…');
      }
    };

    pc.onsignalingstatechange = () => {
      if (peerStateLogRef.current.signalingState !== pc.signalingState) {
        peerStateLogRef.current.signalingState = pc.signalingState;
        logRtcEvent('signalingState', { state: pc.signalingState });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal('OFFER', { type: offer.type, sdp: offer.sdp });
    logRtcEvent('offer posted');

    clearOfferAnswerTimeout();
    offerAnswerTimeoutRef.current = window.setTimeout(() => {
      offerAnswerTimeoutRef.current = null;
      if (!liveRef.current || peerRef.current !== pc || hasRemoteAnswerRef.current) return;
      setError('Viewer connection is taking longer than expected. Restarting stream connection…');
      logRtcEvent('reconnect attempt', { reason: 'offer answer timeout' });
      void createAndSendOfferRef.current?.();
    }, REMOTE_ANSWER_TIMEOUT_MS);

    startSignalPolling();
  }, [clearOfferAnswerTimeout, closePeerConnection, logRtcEvent, postSignal, startSignalPolling]);

  // Keep the ref current so connection-state handlers can always call the latest version.
  useEffect(() => {
    createAndSendOfferRef.current = createAndSendOffer;
  }, [createAndSendOffer]);

  // Keep the ref current so reconnect error paths can restart polling without a stale closure.
  useEffect(() => {
    startSignalPollingRef.current = startSignalPolling;
  }, [startSignalPolling]);

  // Sync liveRef so connection-state handlers have an up-to-date value without
  // capturing stale closure state.  This prevents zombie re-offer attempts after
  // the seller ends the live session.
  useEffect(() => {
    liveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  const ensurePreviewPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          clearTimeout(timeoutId);
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const onReady = () => {
          finish();
        };

        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });

        timeoutId = setTimeout(() => {
          finish();
        }, MEDIA_READY_TIMEOUT_MS);
      });
    }

    try {
      await video.play();
      setPreviewReady(true);
      setCameraStatus('ready');
      return true;
    } catch {
      try {
        await sleep(PLAYBACK_RETRY_DELAY_MS);
        await video.play();
        setPreviewReady(true);
        setCameraStatus('ready');
        return true;
      } catch {
        setPreviewReady(false);
        setCameraStatus('awaitingInteraction');
        return false;
      }
    }
  }, []);

  const startCamera = useCallback(async (nextFacingMode = preferredFacingModeRef.current) => {
    if (cameraStatus === 'connecting') {
      return false;
    }
    if (!window.isSecureContext) {
      logMobileCameraIssue('insecure context', { protocol: window.location.protocol });
      setCameraStatus('blocked');
      setError(INSECURE_CAMERA_CONTEXT_MESSAGE);
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      logMobileCameraIssue('media device unavailable', { reason: 'getUserMedia unsupported' });
      setCameraStatus('unsupported');
      setError('Your browser does not support live camera preview.');
      return false;
    }

    if (navigator.permissions?.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        if (permissionStatus.state === 'denied') {
          logMobileCameraIssue('permission denied', { source: 'permissions.query' });
          setCameraStatus('denied');
          setError(CAMERA_PERMISSION_HELP_MESSAGE);
          return false;
        }
        if (permissionStatus.state === 'prompt') {
          setCameraStatus('idle');
        }
      } catch {
        // Ignore unsupported camera permission query implementations.
      }
    }

    setError(null);
    setCameraStatus('connecting');
    setPreviewReady(false);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      // Android Chrome/Samsung Internet PWAs reliably trigger permission prompts
      // when getUserMedia(video+audio) is requested before facingMode constraints.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) {
        logMobileCameraIssue('media device unavailable', { reason: 'missing video track' });
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Camera device unavailable.');
      }

      try {
        await videoTrack.applyConstraints({ facingMode: { ideal: nextFacingMode } });
      } catch (constraintError) {
        logMobileCameraIssue('camera constraint fallback', {
          reason: 'facingMode not applied',
          facingMode: nextFacingMode,
          error: constraintError instanceof Error ? constraintError.message : 'unknown',
        });
      }

      try {
        await videoTrack.applyConstraints({
          ...MOBILE_VIDEO_CONSTRAINTS,
        });
      } catch (constraintError) {
        logMobileCameraIssue('camera constraint fallback', {
          reason: 'mobile capture constraints not applied',
          error: constraintError instanceof Error ? constraintError.message : 'unknown',
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamOn(true);
      setCurrentCamera(nextFacingMode === 'user' ? 'front' : 'back');
      const previewStarted = await ensurePreviewPlayback();
      if (!previewStarted) {
        logMobileCameraIssue('stream initialization failure', { reason: 'preview playback blocked' });
      }
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setCamOn(false);
      streamRef.current = null;
      setPreviewReady(false);
      // SecurityError generally indicates camera access is blocked by browser/security policy,
      // while NotAllowedError usually means the user denied permission for this session.
      if (name === 'SecurityError') {
        logMobileCameraIssue('insecure context', { error: name });
        setCameraStatus('blocked');
        setError(INSECURE_CAMERA_CONTEXT_MESSAGE);
      } else if (name === 'NotAllowedError') {
        logMobileCameraIssue('permission denied', { error: name });
        setCameraStatus('denied');
        setError(CAMERA_PERMISSION_HELP_MESSAGE);
      } else if (name === 'NotFoundError') {
        logMobileCameraIssue('media device unavailable', { error: name });
        setCameraStatus('idle');
        setError('Camera or microphone is unavailable on this device.');
      } else if (name === 'NotReadableError') {
        logMobileCameraIssue('stream initialization failure', { error: name });
        setCameraStatus('idle');
        setError('Camera is busy in another app. Close other apps and try again.');
      } else {
        logMobileCameraIssue('stream initialization failure', {
          error: name || (err instanceof Error ? err.message : 'unknown'),
        });
        setCameraStatus('idle');
        setError(err instanceof Error ? err.message : 'Unable to connect to your camera right now.');
      }
      return false;
    }
  }, [cameraStatus, ensurePreviewPlayback, logMobileCameraIssue]);

  useEffect(() => {
    startCameraRef.current = startCamera;
  }, [startCamera]);

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
    const nextCamera = currentCamera === 'front' ? 'back' : 'front';
    const nextFacingMode = nextCamera === 'back' ? 'environment' : 'user';

    setCameraStatus('connecting');
    setError(null);

    // Stop current video tracks only; keep audio tracks alive.
    const existingAudioTracks = streamRef.current?.getAudioTracks() ?? [];
    streamRef.current?.getVideoTracks().forEach((t) => t.stop());

    let newVideoStream: MediaStream | null = null;
    try {
      if (nextCamera === 'back') {
        try {
          // First attempt: exact environment constraint.
          newVideoStream = await navigator.mediaDevices.getUserMedia({
              video: {
                ...MOBILE_VIDEO_CONSTRAINTS,
                facingMode: { exact: 'environment' },
              },
            audio: false,
          });
        } catch {
          // Fallback: non-exact environment constraint.
          try {
            newVideoStream = await navigator.mediaDevices.getUserMedia({
              video: {
                ...MOBILE_VIDEO_CONSTRAINTS,
                facingMode: 'environment',
              },
              audio: false,
            });
          } catch (err) {
            const name = err instanceof DOMException ? err.name : '';
            logMobileCameraIssue('media device unavailable', { reason: 'back camera not found', error: name });
            setError('Back camera is not available on this device.');
            setCameraStatus('ready');
            return;
          }
        }
      } else {
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...MOBILE_VIDEO_CONSTRAINTS,
            facingMode: 'user',
          },
          audio: false,
        });
      }

      const [newVideoTrack] = newVideoStream.getVideoTracks();
      if (!newVideoTrack) {
        newVideoStream.getTracks().forEach((t) => t.stop());
        setError(nextCamera === 'back' ? 'Back camera is not available on this device.' : 'Camera unavailable.');
        setCameraStatus('ready');
        return;
      }

      // Build a unified stream: new video track + existing audio tracks.
      const newStream = new MediaStream([newVideoTrack, ...existingAudioTracks]);
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // If live, replace the video track in the peer connection without renegotiating.
      if (isLive && peerRef.current) {
        const videoSender = peerRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          try {
            await videoSender.replaceTrack(newVideoTrack);
          } catch (replaceErr) {
            logMobileCameraIssue('camera constraint fallback', {
              reason: 'replaceTrack failed during live switch',
              error: replaceErr instanceof Error ? replaceErr.message : 'unknown',
            });
          }
        }
      }

      setCurrentCamera(nextCamera);
      // Keep the ref in sync so startCamera uses the correct default facing mode.
      preferredFacingModeRef.current = nextFacingMode;
      try {
        await ensurePreviewPlayback();
      } catch {
        // ensurePreviewPlayback handles its own state; set a safe fallback if it throws.
        setCameraStatus('ready');
      }
    } catch (err) {
      logMobileCameraIssue('stream initialization failure', {
        reason: 'camera switch failed',
        error: err instanceof Error ? err.message : 'unknown',
      });
      setError(err instanceof Error ? err.message : 'Failed to switch camera.');
      setCameraStatus('ready');
    }
  }, [cameraStatus, currentCamera, ensurePreviewPlayback, isLive, logMobileCameraIssue]);

  const handleGoLiveClick = () => {
    setShowWarning(true);
  };

  const confirmGoLive = async () => {
    setShowWarning(false);
    setLoading(true);
    setError(null);
    try {
      if (!streamRef.current) {
        const cameraStarted = await startCamera();
        if (!cameraStarted || !streamRef.current) {
          throw new Error(PREVIEW_REQUIRED_MESSAGE);
        }
      }
      if (
        micOnRef.current
        && !micPermissionDeniedRef.current
        && streamRef.current
        && streamRef.current.getAudioTracks().length === 0
      ) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const audioTracks = audioStream.getAudioTracks();
          if (audioTracks.length === 0) {
            throw new Error('No microphone track available');
          }
          audioTracks.forEach((audioTrack) => {
            audioTrack.enabled = true;
            streamRef.current?.addTrack(audioTrack);
          });
          micPermissionDeniedRef.current = false;
        } catch (err) {
          const errorName = err instanceof DOMException ? err.name : '';
          if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
            micPermissionDeniedRef.current = true;
          }
          setMicOn(false);
          micOnRef.current = false;
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
      try {
        await createAndSendOffer();
      } catch (offerError) {
        setIsLive(false);
        setViewerCount(0);
        stopSignalPolling();
        closePeerConnection();
        await fetch(`/api/garage-sales/${saleId}/live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end' }),
        }).catch(() => undefined);
        throw offerError;
      }
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      endLiveOnPageLeave();
      stopSignalPolling();
      closePeerConnection();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [closePeerConnection, endLiveOnPageLeave, stopSignalPolling]);

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
        return CAMERA_CONNECTING_MESSAGE;
      case 'ready':
        return CAMERA_READY_MESSAGE;
      case 'awaitingInteraction':
        return 'Tap to resume preview';
      case 'blocked':
        return 'Camera blocked';
      case 'denied':
        return 'Permission needed';
      case 'unsupported':
        return 'Unsupported';
      default:
        return 'Not ready';
    }
  })();

  const cameraMessage = (() => {
    if (error) return error;
    switch (cameraStatus) {
      case 'blocked':
        return CAMERA_BLOCKED_MESSAGE;
      case 'denied':
        return CAMERA_PERMISSION_HELP_MESSAGE;
      case 'unsupported':
        return 'Camera preview is not supported in this browser.';
      case 'ready':
        return CAMERA_READY_MESSAGE;
      case 'connecting':
        return CAMERA_CONNECTING_MESSAGE;
      case 'awaitingInteraction':
        return 'Tap to resume preview playback.';
      case 'idle':
        return PREVIEW_REQUIRED_MESSAGE;
      default:
        return CAMERA_STATUS_UNKNOWN_MESSAGE;
    }
  })();

  const videoPreviewClassName = camOn
    ? `h-full w-full rounded-2xl object-cover transition-opacity duration-500 ${previewReady ? 'opacity-100' : 'opacity-0'}`
    : 'hidden';

  return (
    <div className="card space-y-4 p-4 sm:space-y-5 sm:p-5 transition-all duration-300">
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
                ? 'animate-pulse bg-emerald-500'
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

      <div className="relative flex aspect-[3/4] min-h-[22rem] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900 sm:aspect-video sm:min-h-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={videoPreviewClassName}
        />
        {!camOn && (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-slate-300">
            <VideoOff size={40} />
            <p className="text-sm font-medium">{CAMERA_PREVIEW_PLACEHOLDER}</p>
          </div>
        )}
        {isLive && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white animate-pulse shadow-lg" aria-live="polite">
            <span aria-hidden="true" className="inline-flex items-center gap-1.5">
              <span>🔴</span> LIVE <Eye size={11} /> {viewerCount}
            </span>
            <span className="sr-only">{viewerCount} viewers watching</span>
          </span>
        )}
        {camOn && cameraStatus === 'connecting' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 px-4 transition-opacity duration-300">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow">
              {CAMERA_CONNECTING_MESSAGE}
            </span>
          </div>
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

      {cameraMessage && (
        <p className={cx('rounded-lg px-3 py-2 text-xs font-medium', getCameraMessageStyles(cameraStatus, Boolean(error)))}>
          {cameraMessage}
        </p>
      )}
      {(cameraStatus === 'denied' || cameraStatus === 'blocked') && !camOn && (
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={loading}
          className="btn-outline w-full text-xs disabled:opacity-60"
        >
          Retry Camera Permission
        </button>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!camOn ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={loading || cameraStatus === 'connecting'}
            className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
          >
            <Video size={13} /> {cameraStatus === 'connecting' ? CAMERA_CONNECTING_MESSAGE : 'Preview Camera'}
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
            {canSwitchCamera && (
              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                disabled={loading || cameraStatus === 'connecting'}
                className="btn-outline flex items-center justify-center gap-1.5 px-3 text-xs disabled:opacity-60"
                title="Switch camera"
              >
                <RefreshCcw size={13} />
                <span>{currentCamera === 'front' ? 'Use Back Camera' : 'Use Front Camera'}</span>
              </button>
            )}
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
          </>
        )}
      </div>

      {!isLive ? (
        <button
          type="button"
          onClick={handleGoLiveClick}
          disabled={loading || !camOn}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          <Radio size={14} /> {loading ? 'Starting…' : 'Start Live'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEndLive}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
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
