## Fix
Seller no longer needs logout/login to recover live streaming after stale broadcaster sessions.

## What changed
- Added seller control: **Restart Live Connection**
- Restart flow now:
  - closes old RTCPeerConnection
  - removes old socket listeners
  - leaves old room
  - clears reconnect timers
  - keeps same seller auth + same garageSaleId/liveSessionId
  - reacquires camera/mic if needed
  - republishes stream
  - re-emits `stream_ready`
- Backend stale session cleanup:
  - removes old broadcaster session on disconnect/end/restart
  - allows same sellerId to republish immediately
- Duplicate seller session handling:
  - new session replaces old session for same sellerId/liveSessionId
  - old broadcaster socket is ignored/replaced
  - viewers receive reconnect signal
- Reconnect warning loop hardening:
  - warning only on true socket/peer failure
  - warning cleared on successful republish/connected/ontrack
