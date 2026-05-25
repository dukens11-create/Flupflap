# Google Play Release Readiness Checklist

Use this document before submitting FlupFlap to Google Play to make sure
all required steps are complete.

---

## 1. In-repo technical setup

- [x] `mobile/android/app/build.gradle` — `signingConfigs.release` reads from `key.properties`
- [ ] `android/key.properties` created locally with correct keystore credentials (not committed)
- [ ] `android/app/upload-keystore.jks` created and backed up securely (not committed)
- [ ] Codemagic `android_release` workflow secrets configured:
  - `CM_KEYSTORE` (base64-encoded keystore)
  - `CM_KEYSTORE_PASSWORD`
  - `CM_KEY_PASSWORD`
  - `CM_KEY_ALIAS`
- [ ] `flutter build appbundle --release` produces a valid `.aab` locally
- [ ] App version code and version name reviewed in `pubspec.yaml`

See `mobile/ANDROID_SIGNING.md` for keystore creation and signing setup.

---

## 2. Play Console — App setup

- [ ] Google Play developer account registered and payment verified
- [ ] New app created in Play Console with package name `com.flupflap.app`
- [ ] App enrolled in **Play App Signing** (recommended — Google manages the distribution key)
- [ ] Upload keystore configured in Play Console if using Play App Signing

---

## 3. Store listing assets (needed outside the repo)

Prepare and upload in Play Console → **Store listing**:

| Asset | Spec |
|---|---|
| App icon | 512 × 512 px PNG, no alpha |
| Feature graphic | 1024 × 500 px JPG or PNG |
| Phone screenshots | At least 2, 16:9 or 9:16, up to 3840 px on longest side |
| Tablet screenshots | Recommended for 7" and 10" tablets |
| Short description | Max 80 characters (see `en-US/short_description.txt`) |
| Full description | Max 4000 characters (see `en-US/full_description.txt`) |
| Privacy policy URL | Required — must be publicly accessible |
| App contact email | Displayed on store listing |
| Website URL | Optional but recommended (e.g. `https://flupflap.com`) |

---

## 4. Play Console declarations

Complete all sections under **Policy → App content**:

- [ ] **Privacy policy** URL entered and accessible
- [ ] **Data safety form** completed — declare which data the app collects
  (e.g. name, email, payment info, device identifiers)
- [ ] **Content rating questionnaire** completed
- [ ] **Target audience** selected (18+ recommended given marketplace / payment flows)
- [ ] **Ads declaration** — declare whether the app shows ads
- [ ] **App access** — provide test account credentials for reviewers if any
  feature requires login (buyer and seller test accounts recommended)
- [ ] **Financial features** declaration — app includes in-app purchases /
  payments via Stripe (physical goods; no Google Play Billing required)

---

## 5. Pre-submission testing

Test the following flows on a real Android device using the signed `.aab`
uploaded to the **internal testing** track before promoting:

- [ ] Account creation (buyer) and email verification
- [ ] Account creation (seller) including phone OTP via Firebase
- [ ] Seller listing creation with images
- [ ] Buyer browsing, search, and product detail views
- [ ] Checkout flow — Stripe payment with a test card
- [ ] Order confirmation and order history
- [ ] Seller order management and payout flow
- [ ] Browser handoff (deep links back to app after Stripe redirect)
- [ ] Account settings and logout
- [ ] Account deletion (required by Play policy)
- [ ] App behaviour on poor network / offline

---

## 6. Play Store tracks — recommended promotion path

1. **Internal testing** — share with 2–5 testers to verify signing and flows
2. **Closed testing (alpha)** — wider group for feedback
3. **Open testing (beta)** — optional public beta
4. **Production** — staged rollout (e.g. 10% → 50% → 100%)

---

## 7. Notes for Play review

- FlupFlap is a **marketplace for physical goods** and uses Stripe for payments.
  Google Play Billing is **not** required for physical goods, but the listing
  and data safety form must accurately describe payment data handling.
- The seller onboarding flow collects identity / payout information via
  Stripe Connect. Ensure the Data Safety form covers this accurately.
- Make sure the privacy policy covers all data collected (email, phone for
  sellers, payment info, shipping address, device identifiers).
- Legal pages (ToS, privacy policy) should be reviewed by an attorney before
  production launch.

---

## 8. Deep-link release checks

- [ ] `flupflap.com` and `www.flupflap.com` host a valid `/.well-known/assetlinks.json` for package `com.flupflap.app`
- [ ] Optional iOS universal-link association (`apple-app-site-association`) is configured for production domains
- [ ] Test these links on a production-signed build:
  - [ ] `https://flupflap.com/products/<id>` opens in-app product route
  - [ ] `https://flupflap.com/seller` opens seller dashboard route
  - [ ] `flupflap://app/seller/subscription` opens seller subscription route
