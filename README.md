# Tretmax Games

React + TypeScript + Vite frontend for the Tretmax Games free-entry esports platform in Uganda. Supabase Auth, profiles, game IDs, tournament registration, teams, check-in, invitations and Owner publishing are connected where their reviewed RPCs are deployed. Payments and payouts remain disabled. Treat Vercel deployments as staging/mobile-testing releases until real-device and multi-account acceptance checks are complete.

## Prerequisites

- Node.js 20 or newer
- npm

## Install and run

```sh
npm install
npm run dev
```

## Environment setup

Copy `.env.example` to `.env.local` and set:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_REGISTRATION_SUMMARY_RPC_ENABLED=true
```

The registration-summary flag should be enabled only when that reviewed RPC is deployed. Vite embeds `VITE_*` values at build time, so restart the dev server after changes. `.env.local` is ignored by Git. Never add a service-role or secret key to browser code or Vercel frontend variables.

## Routes

- `/` — home
- `/tournaments` and `/tournaments/:id` — published discovery, details, free registration, team registration and check-in where authorized
- `/games` — supported games and artwork
- `/leaderboard` — sample ranking presentation until verified rankings exist
- `/how-it-works` — player guidance and backend boundaries
- `/login` and `/register` — Supabase Auth
- `/profile` — authenticated profile, game IDs, teams and invitations
- `/teams/join#code=...` — private one-use team invitation redemption
- `/admin` — trusted-role operations dashboard

## Vercel staging release

Vercel detects Vite automatically. Use the repository root, `npm install` as Install Command, `npm run build` as Build Command, and `dist` as Output Directory. [vercel.json](./vercel.json) rewrites direct SPA routes such as `/profile`, `/tournaments/...`, `/admin` and `/teams/join` to `index.html` while preserving React Router navigation.

Add these Environment Variables in Vercel Preview (and separately in Production only when ready):

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_REGISTRATION_SUMMARY_RPC_ENABLED=true
```

After changing variables, redeploy. In Supabase Dashboard → Authentication → URL Configuration, add the Vercel HTTPS origin to Site URL/Redirect URLs, for example `https://your-staging-domain.vercel.app/**`, while retaining the local URL for development. Verify email confirmation and sign-out on the deployed domain. Invitation links use URL fragments and remove the code from the visible URL before preview.

The PWA manifest and icons are served from `public/`. The service worker caches only the static shell/assets and skips Supabase Auth, REST, Storage and Functions paths; private profile, team, invitation, registration and attendance responses are not cached.

## Checks and preview

```sh
npm test
npm run lint
npm run build
npm run preview
```

No production deployment or phone testing is claimed by this repository change. Payments remain disabled and admin access continues to depend on Supabase Auth metadata plus database authorization.
