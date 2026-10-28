# Tretmax Games

A React + TypeScript + Vite frontend for an esports tournament platform focused on Uganda. Tournament, player, and leaderboard records currently come from local demo data. The frontend is not connected to Supabase and does not process payments or prizes.

## Prerequisites

- Node.js 20 or newer
- npm (included with Node.js)

## Install and run

```sh
npm install
npm run dev
```

Vite prints the local URL, usually `http://localhost:5173`.

## Environment setup

Copy `.env.example` to `.env.local` and replace the placeholders with your Supabase project URL and publishable key. Vite reads the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values on startup; restart the dev server after changing them. `.env.local` is ignored by Git. The app validates that both values are present, and shows a setup notice while they are missing. A reusable lazy client is available in `src/lib/supabase.ts`, but the app does not yet make Supabase requests or authenticate users. Use only a publishable key in browser code; never put a service role or other secret key in frontend configuration.

## Routes

- `/` — home
- `/tournaments` — searchable, filterable tournament listings
- `/tournaments/:id` — tournament details and local demo registration
- `/games` — confirmed game entries from the existing demo data
- `/leaderboard` — searchable sample player rankings
- `/how-it-works` — product flow and backend boundaries
- `/login` and `/register` — local validation demos; no accounts are created
- `/profile` — unsigned-in profile preview
- `/admin` — development-only operations dashboard preview; unavailable in production until Supabase Auth and server-side authorization are implemented
- Unmatched paths display a branded not-found page.

## Admin dashboard preview

Run `npm run dev` and open `/admin`. The role selector changes navigation visibility only in the current page memory; it does not authenticate or grant access. The preview uses existing tournament demo fixtures and empty states for backend-dependent records. Admin actions do not change live data, and the production build blocks the dashboard pending secure authentication and server-side authorization. See [docs/admin-security.md](./docs/admin-security.md) for the first Owner provisioning plan and future security requirements. The core Supabase migration is not modified by this frontend preview.

## Checks and production build

```sh
npm run lint
npm run build
npm run preview
```

`build` runs TypeScript project checks and produces the production bundle in `dist/`. `preview` serves that bundle locally.
