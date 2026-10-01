# Phase 0.2 — App Shell + UI Foundation

## What changed

- Extracted the existing application drawer / Global Pusula band wiring from `App.tsx`
  into `src/app/AppShell.tsx`.
- Added the first real reusable UI primitives under `src/ui`.
- Added a theme-debt map so global CSS retirement is deliberate instead of guesswork.

## What did NOT change

- `src/main.tsx` theme import order is unchanged.
- Existing screens do not yet use the new primitives.
- Home map / NDVI / Pusula protected geometry is untouched.
- No data service, Supabase contract, weather rule, satellite rule or map logic changed.

## Why this is safe

Phase 0.2 creates the destination architecture before migrating any production screen.
The only active application refactor is shell composition extraction; it reuses the same
`AppDrawer` and `GlobalPusulaBand` components with the same values and callbacks.

## Next phase

Phase 0.3 will migrate a low-risk screen first and establish the typography/card/button
visual baseline. Only after that baseline is accepted will high-value screens such as
Weather and Home chrome migrate.
