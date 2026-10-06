# Android Google Play Signing

TarlaPusula Android package: `com.tarlapusula.app`

## Current Play requirement

The Android project targets API 36 (Android 16), matching the Google Play requirement for new apps and updates from 31 August 2026.

## Signing model

Use Google Play App Signing with a separate upload key.

Never commit a keystore, private key, password, `.jks`, `.keystore`, `.p12` or provisioning file to Git.

The workflow `.github/workflows/android-play-aab.yml` expects these GitHub Actions repository secrets:

- `ANDROID_UPLOAD_KEYSTORE_B64`
- `ANDROID_UPLOAD_STORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`
- `GOOGLE_SERVICES_JSON_B64` (Firebase `google-services.json`, Base64 encoded; must contain `com.tarlapusula.app`)
- `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`
- `VITE_REVENUECAT_IOS_PUBLIC_KEY`

## One-time upload key creation

Create the upload key outside the repository:

```bash
keytool -genkeypair -v \
  -keystore tarlapusula-upload.jks \
  -alias tarlapusula-upload \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Encode the keystore for GitHub Actions:

Linux:

```bash
base64 -w 0 tarlapusula-upload.jks
```

macOS:

```bash
base64 < tarlapusula-upload.jks | tr -d '\n'
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("tarlapusula-upload.jks"))
```

Store that output only in the `ANDROID_UPLOAD_KEYSTORE_B64` GitHub secret.

## Building the Play artifact

Run the GitHub Actions workflow **Android Play Signed AAB** manually.

Supply:

- `version_code`: integer that increases on every Play upload.
- `version_name`: user-visible release version such as `1.0.0`.

The workflow restores the keystore only inside the ephemeral GitHub runner, builds the signed release AAB, verifies its signature, uploads the AAB as a workflow artifact, then deletes the temporary keystore.

The normal **Android Release AAB Compile** workflow remains an unsigned release-configuration compile gate and does not require signing secrets.


## Firebase push configuration

The signed Play workflow requires `GOOGLE_SERVICES_JSON_B64`.
This is intentional: a Play artifact must not be produced as "ready" while Android FCM push is unconfigured.

Create/download the Firebase Android app configuration for package
`com.tarlapusula.app`, encode the entire `google-services.json` as Base64,
and save it as the GitHub Actions repository secret `GOOGLE_SERVICES_JSON_B64`.

The workflow restores the file only inside the ephemeral runner, verifies that it contains
`com.tarlapusula.app`, builds the AAB, and deletes the file afterward.
