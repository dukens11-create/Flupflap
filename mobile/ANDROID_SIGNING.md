# Android Release Signing – Setup Guide

This document explains how to configure signed release builds for the
FlupFlap Android app so it can be published on Google Play.

---

## Overview

Google Play requires every `.aab` or `.apk` uploaded to the store to be
signed with an **upload keystore**. The keystore and its passwords must
**never** be committed to version control.

`mobile/android/app/build.gradle` reads signing credentials from
`mobile/android/key.properties` at build time. That file is already
excluded from git via `mobile/.gitignore`.

---

## Step 1 — Create an upload keystore

Run the following command once and keep the resulting file safe. Use a
strong password and store it in your team's password manager.

```bash
keytool -genkey -v \
  -keystore mobile/android/app/upload-keystore.jks \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias upload
```

You will be prompted for:
- **Keystore password** – remember this, you will need it every build.
- **Key password** – can be the same as the keystore password.
- **Distinguished name** – your name, organisation, country, etc.

> **Important:** Back up `upload-keystore.jks` and both passwords
> somewhere secure (e.g. a secrets manager or encrypted password vault).
> If you lose the keystore you cannot update the app on Play Store.

---

## Step 2 — Create `key.properties`

Copy the template and fill in your values:

```bash
cp mobile/android/key.properties.example mobile/android/key.properties
```

Edit `mobile/android/key.properties`:

```properties
storePassword=<your-keystore-password>
keyPassword=<your-key-password>
keyAlias=upload
storeFile=app/upload-keystore.jks
```

| Field | Description |
|---|---|
| `storePassword` | Password you chose for the keystore file |
| `keyPassword` | Password for the key entry (often the same) |
| `keyAlias` | Alias used with `-alias` in `keytool` (e.g. `upload`) |
| `storeFile` | Path to the `.jks` file, relative to `mobile/android/` |

> `key.properties` and `upload-keystore.jks` are both gitignored.
> Do **not** remove them from `.gitignore`.

---

## Step 3 — Build a signed App Bundle

```bash
cd mobile
flutter build appbundle --release
```

The output is at:

```
mobile/build/app/outputs/bundle/release/app-release.aab
```

Upload this file to Google Play Console → **Internal testing** (recommended
before promoting to other tracks).

---

## CI / Codemagic

For automated signed builds in Codemagic, store the keystore and
`key.properties` values as **environment secrets** (never plain-text
environment variables). The `android_release` workflow in `codemagic.yaml`
expects the following Codemagic environment group or variables:

| Secret name | Description |
|---|---|
| `CM_KEYSTORE` | Base64-encoded contents of `upload-keystore.jks` |
| `CM_KEYSTORE_PASSWORD` | Keystore password |
| `CM_KEY_PASSWORD` | Key password |
| `CM_KEY_ALIAS` | Key alias (e.g. `upload`) |

The workflow decodes `CM_KEYSTORE` to a file, writes `key.properties`, and
then runs `flutter build appbundle --release`.

---

## Local development without the keystore

If `android/key.properties` is absent, `build.gradle` prints a warning and
falls back to **debug signing**. This allows every developer to run and
build the app locally without needing the production keystore.

> Only use the fallback for local development. **Always** use release
> signing when uploading to Google Play.
