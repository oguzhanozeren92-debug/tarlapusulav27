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

TestFlight'a doğrudan yükleme seçeneği kullanılacaksa ayrıca:

- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_API_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8_B64`

App Store Connect API private key (`.p8`) dosyasını Base64 olarak GitHub Secret'a koyun.
Dosyayı repoya commit etmeyin; `*.p8` gitignore kapsamındadır.

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

The workflow also has an `upload_to_testflight` boolean input. When enabled, it
requires the three App Store Connect API secrets above, writes the `.p8` key only to
the ephemeral macOS runner, uploads the verified IPA to App Store Connect/TestFlight
with Apple's command-line uploader, then removes the private key.

For the first signed run, keep `upload_to_testflight=false` if you only want to
validate signing. After the App Store Connect app record and API key are ready, run
again with a higher `build_number` and set `upload_to_testflight=true`.
