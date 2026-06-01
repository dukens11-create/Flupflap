# Driver dashboard Firebase setup

The driver dashboard now lives at `/driver-dashboard` (and `/driver-dashboard.html`) and uses Firebase Realtime Database plus Firebase Auth.

## Required environment variables

Copy the Firebase web app values into `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)
- `FIREBASE_API_KEY` for server-side Firebase token verification

## Realtime Database structure

The dashboard reads and writes these paths:

- `drivers/{driverId}`
- `rides/{driverId}/{rideId}`
- `locations/{driverId}/{locationId}`
- `earnings/{driverId}/{earningsId}`
- `payments/{driverId}/{paymentId}`
- `chatMessages/{driverId}/{messageId}`

Each record stores its own ID field (`ride_id`, `payment_id`, etc.) plus `driver_id`.

## Security rules

Apply `docs/firebase-driver-dashboard.rules.json` in the Firebase console. The rules:

- restrict every branch to the authenticated driver ID
- validate required fields before data is stored
- add `indexOn` entries for status/date/timestamp fields used by realtime listeners

## Runtime behavior

- email/password login uses Firebase Auth
- token refresh is handled by the Firebase SDK and mirrored with `onIdTokenChanged`
- rides, earnings, payments, locations, and chat are subscribed live
- location updates are written every 5 seconds while online/busy/on-trip
- the latest dashboard snapshot is cached locally
- failed writes are queued locally and replayed when connectivity returns
- cache and queued writes are cleared on logout
