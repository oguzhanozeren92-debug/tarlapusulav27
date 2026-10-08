# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## v61 — Sosyal giriş yayın sertleştirmesi
- Google / Facebook / Apple butonları Supabase Auth provider durumundan canlı keşfedilir.
- Supabase'de kapalı provider kullanıcıya bozuk buton olarak gösterilmez.
- Native OAuth dönüş köprüsü release workflow'larında `https://tarlapusulav27.vercel.app/` olarak sabitlenmiştir.
- Android intent filter, iOS URL scheme ve Sign in with Apple entitlement için otomatik audit eklenmiştir.
- Provider ayar isteği erişilemezse güvenli fallback uygulanır; Apple fallback varsayılan kapalıdır.

## v62 release closure

v62 closes the remaining code-side release hardening work: one-page premium PusulaPDF, centralized decision engine, map layer recovery, live social-provider discovery, market schedulers, content cover-image guard and release readiness auditing. Run `npm run audit:release-closure` for the static release wiring audit.

The only remaining production blockers require external account credentials: Facebook/Apple OAuth provider credentials, RevenueCat backend/webhook credentials, and FCM/APNs server credentials. See `docs/RELEASE_CLOSURE_2026-10-08.md`.
