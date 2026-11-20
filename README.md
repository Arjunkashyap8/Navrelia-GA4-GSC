# Navrelia Search & Analytics Command Center

Unified GA4 + Google Search Console dashboard for navreliafoods.com. Built with Next.js 15 (App Router), TypeScript (strict), Tailwind, ECharts, TanStack Query, and SQLite via Drizzle and better-sqlite3.

## Setup

1. Node 20.9+ (tested on Node 24). Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local` (Git ignores it).
3. Run `npm run dev` and open http://localhost:3000. Sign in with `DASHBOARD_PASSWORD`.
4. Open **Settings → Connection status**. Every check should be green.
5. The first sync backfills 16 months automatically, about 5 seconds after the first page load (takes ~2 minutes). You can also use **Settings → Data sync → Sync now**.

### Google OAuth credentials

There are two OAuth clients, one for GA4 and one for Search Console. For each one:

1. Enable the APIs in Google Cloud:
   - GA4: Google Analytics Data API and Admin API.
   - GSC: Search Console API.
2. Create a Web OAuth client with redirect URI `https://developers.google.com/oauthplayground`.
3. Get a refresh token from the OAuth 2.0 Playground ("Use your own OAuth credentials"). Use scope `analytics.readonly` (GA4) or `webmasters.readonly` (GSC).
4. **Publish the OAuth consent screen.** In "Testing" mode, refresh tokens expire after 7 days. The dashboard warns with a "Reconnect" state when that happens.

### Optional

- `PDF_BROWSER_PATH` points at Chrome/Edge for PDF export. By default it auto-detects the standard install paths.
- `SYNC_SCHEDULER=off` disables the in-process 6-hourly sync. Use this if you call `POST /api/sync` from an external cron instead.
- `DATABASE_PATH` sets the SQLite file location (default `data/navrelia.db`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve. Set `NEXT_DIST_DIR=.next-build` to build while dev is running |
| `npm run typecheck` · `npm run lint` · `npm test` | Strict TS · ESLint · Vitest (46 tests) |
| `npm run check:secrets` | Fails if any secret value appears in build output (run after `build`) |
| `node scripts/screenshot.mjs /overview out.png` | Screenshot any route (dev helper) |

## Architecture

```
Browser ──► Next.js server components / API routes ──► lib/data (cached helpers) ──► lib/google (OAuth, retry, Zod)
                                        │                       │
                                        └──► SQLite: api_cache, daily snapshots, annotations, targets,
                                                     saved views, opportunity status, insight history, inspections
```

- **All Google calls are server-side.** Modules under `lib/google/*` import `server-only`. Secrets are read from env, validated with Zod (`lib/env.ts`), and never sent to the client.
- **Token manager** (`lib/google/auth.ts`): access tokens are cached until 60 s before expiry. Concurrent refreshes are de-duplicated. `invalid_grant` produces the "Testing mode" hint.
- **Response cache** (`lib/cache.ts`): TTL is 60 s for realtime, 15 min for ranges touching the last 3 days, and 24 h for closed ranges. Concurrent identical requests are de-duplicated.
- **Sync** (`lib/sync/sync.ts`):
  - The first run backfills 16 months: GSC property totals per day × search type, GSC query × page × day, and GA4 channel × day.
  - Later runs re-fetch the last 5 days every 6 h (GA4 revises data for up to 72 h, and GSC's freshest days are preliminary).
- **Every module = live, cached GA4/GSC queries + global filters.** The URL state is `range, from, to, cmp, view, channel, state, device, cust, country, brand`. Snapshots power history, decay detection and anomaly detection.
- **Joining GSC with GA4** (`lib/metrics/url.ts`): both sides are reduced to a lowercase path. Host, protocol, query string, fragment and trailing slash are dropped, so http/https and www variants join.
- **Insight engines** are pure and unit-tested:
  - `lib/insights/opportunities.ts`: 8 transparent rules, ranked by estimated value ÷ effort.
  - `lib/insights/anomaly.ts`: rolling 28-day median ± 3·MAD with day-of-week adjustment, plus segment-contribution root cause.
  - `lib/insights/health.ts`: weighted 0–100 health score.
  - `lib/metrics/ctr-curve.ts`: benchmark CTR curve calibrated to this site.
- **Widgets fail independently.** Each loader is wrapped in `safe()`, so one Google error shows an inline error card instead of breaking the page.

## Modules

The sidebar follows the journey from session to sale:

Every GA4 breakdown (visitor type, source, age, gender, state, city, state × source, device, language, technology, entry page) carries the same chain to the end goal: sessions → add to carts → cart rate → checkouts → purchases → cart → purchase → session → purchase (`lib/metrics/goal.ts`, `components/table/goal-columns.ts`).

- **Home:** Executive Overview.
- **Google Analytics 4:**
  - **Sessions & Sources:** sessions, new vs returning, sources, and add to cart → purchase by source.
  - **Audience & Locations:** demography, states, cities, sources × locations, languages and devices.
  - **Engagement:** entry pages with the key events that follow.
  - **Ecommerce Journey:** store funnel, device / channel / new vs returning segments, Razorpay Magic Checkout steps and friction by source, products and key events.
  - Checkout Funnel Lab, Buying Patterns, Realtime.
- **Search Console:**
  - **Search Keywords:** brand / non-brand keywords, keywords × landing pages, core KPIs.
  - Search Value & Topics.
- **Combined:** Content & Pages, Content → Commerce.
- **Deliver:** Reports (PDF builder), Settings.

## Intelligence layer (cross-source logics)

Each view joins several endpoints. The pure engines live in `lib/intel/*` and are unit-tested; the module loaders are in `lib/modules/intel/*`.

| View | Endpoints joined | Logic |
| --- | --- | --- |
| Search Value & Topics | GSC query×page + byPage, GA4 organic landing-page revenue, GA4 item metrics | Revenue split per query by click share (anonymized share held back), ₹ upside at #3, topic clusters (most specific 1–3-word phrase), share of voice, content gaps, product search demand vs sales |
| Checkout Funnel Lab | GA4 `runFunnelReport` (v1alpha) with breakdowns, next actions and landing-page filters | True sequential funnel (core or detailed steps, open/closed), ₹ in abandoned checkouts, device/channel/entry-page segments |
| Buying Patterns | GA4 `batchRunPivotReports` (3 pivots in one call) | Day × hour heatmaps, best converting time window, channel × device, product × state |
| Content → Commerce | GSC blog pages + GA4 landing sessions + GA4 page_view transitions (pageReferrer → pagePath) | Per-post reach → readers → product clicks → sales; Converter / Feeder / Dead end / Hidden |


**Endpoint notes:**
- `runAccessReport` only works on GA4 360 properties, so it's explained in-app rather than used.
- Pivot reports require every filtered field to be a requested dimension. `withFilterDimensions()` adds them automatically.
- Sitemap "indexed" counts are no longer returned by the API.

## Security

- **Password gate** (`middleware.ts`): uses an HMAC-signed, HTTP-only, 7-day session cookie. Production refuses to serve if no password is set. Login is rate-limited and only redirects to relative paths.
- **No secrets in client bundles.** This is verified by `npm run check:secrets`. The Settings page shows only set/not-set for secrets.

## Known limitations

- **Country map:** shown as a ranked table instead, because nearly all traffic comes from India.
- **Exit share:** GA4's Data API has no exits metric, so it isn't reported.
- **Exports:** XLSX export isn't implemented; tables export to CSV.
- **Chart images:** charts render as SVG. Use the browser or the PDF report for images.
- **Search Console permission:** the connected account has *restricted* access. That's enough for all reports and URL inspection. Full access is needed only for sitemap submission, which the dashboard doesn't do.

## Deploying on Vercel (free Hobby plan)

Live at the project `navrelia-dashboard` (`vercel.json` pins the Mumbai region, `bom1`).

- **Deploy:** `npx vercel@latest deploy --prod`. `.vercelignore` keeps `.env*`, the local database and build output out of the upload. Env vars live in the Vercel project (Settings → Environment Variables); secrets are marked sensitive.
- **Storage:** Vercel has no permanent disk, so on Vercel the SQLite file lives in `/tmp` (`lib/db/client.ts`). The cache, settings and snapshot history reset whenever Vercel recycles the server, and the background sync is off (`lib/sync/scheduler.ts`). Snapshot-based views (content decay, search-type breakdown) stay empty there.
- **PDF:** Vercel has no Chrome, so the report builder opens the printable report with the print dialog ("Save as PDF").
- **Time limit:** pages and API routes allow 60 s (`maxDuration`).
- **Access:** the password gate is optional. With `DASHBOARD_PASSWORD` unset (the current setup, locally and on Vercel) the dashboard opens for anyone with the link; set it again to require a password.
