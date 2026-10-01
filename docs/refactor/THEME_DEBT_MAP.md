# TarlaPusula Theme Debt Map — Phase 0.2

This document records the theme layers that existed before the design-system migration.
It is intentionally descriptive: Phase 0.2 does **not** delete active style files yet.

## Active global imports in `src/main.tsx`

1. `src/index.css`
2. `src/styles/TarlaPusulaTheme.css`
3. `src/styles/MobileAppShell.css`
4. `src/styles/WhiteAppTheme.css`
5. `src/styles/MonochromeUI.css`
6. `src/styles/MapReadabilityFix.css`

The import order currently acts as an implicit cascade contract. Removing or reordering
one of these files can change unrelated screens, so they will be retired only after a
screen has migrated to `src/ui` primitives.

## Migration rule

- Do not add another global theme override.
- New reusable visual work belongs in `src/ui`.
- Existing screens migrate explicitly, one bounded screen/package at a time.
- When a screen is migrated, remove only the legacy selectors proven to belong to it.
- Scientific map/data colours are not UI-theme colours and must remain semantic.

## Protected visual area

Home map / NDVI / Pusula footer remains governed by
`docs/refactor/PROTECTED_UI_ZONES.md`.

## Retirement order

1. screen-local duplicated typography / button / input declarations
2. obsolete white/monochrome overlap selectors
3. obsolete legacy theme selectors
4. old global theme files only after zero active selector ownership remains

`MapReadabilityFix.css` is treated separately because MapLibre/Mapbox controls may
require third-party overrides that are legitimate uses of `!important`.
