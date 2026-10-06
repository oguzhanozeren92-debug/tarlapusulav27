# iOS App Store / TestFlight Signing

TarlaPusula bundle identifier: `com.tarlapusula.app`

The repository keeps signing material out of source control. The manual workflow
`.github/workflows/ios-app-store-ipa.yml` installs signing assets only inside the
ephemeral GitHub macOS runner.

## Apple-side prerequisites

Create or confirm:

1. An explicit App ID for `com.tarlapusula.app`.
2. Push Notifications capability for that App ID.
3. In-App Purchase capability for that App ID.
4. An Apple Distribution certificate.
5. An App Store Connect provisioning profile for `com.tarlapusula.app`.
6. An App Store Connect app record using the same bundle identifier.

The Release Xcode configuration already sets `aps-environment=production`.

## Required GitHub Actions repository secrets

- `IOS_DISTRIBUTION_P12_B64`
- `IOS_DISTRIBUTION_P12_PASSWORD`
- `IOS_APP_STORE_PROFILE_B64`
- `APPLE_TEAM_ID`
- `VITE_REVENUECAT_IOS_PUBLIC_KEY`
- `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`

Encode the exported `.p12` certificate and `.mobileprovision` profile as Base64
before storing them in GitHub Secrets. Never commit either file.

PowerShell examples:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("TarlaPusula-Distribution.p12"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("TarlaPusula-AppStore.mobileprovision"))
```

## Build

Run **iOS App Store Signed IPA** manually and provide:

- `version_name`, such as `1.0.0`
- `build_number`, an integer/string that increases for every App Store Connect upload

The workflow validates that the provisioning profile belongs to the configured Apple
Team, matches `com.tarlapusula.app`, contains production APNs entitlement, builds a
Release archive, exports a signed App Store Connect IPA, verifies the code signature
and uploads the IPA as a GitHub Actions artifact.

It does not automatically upload to App Store Connect yet. Upload automation can be
added after the App Store Connect API key is created.
