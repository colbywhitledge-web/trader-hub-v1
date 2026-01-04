# Trader Hub v1 (Cloudflare Worker + D1 + Pages)

This repo is a complete v1:
- Cloudflare Worker API + Scheduled RSS ingest + Free OHLCV + TA engine
- D1 database migrations
- Cloudflare Pages mobile web UI (Ask / My Tickers / Weekly)

## 1) Prereqs
- Node.js LTS
- Cloudflare account
- Wrangler CLI

Install Wrangler:
```bash
npm i -g wrangler
wrangler login
```

## 2) Create D1 DB
From `api/`:
```bash
cd api
wrangler d1 create trader_hub
```
Copy the `database_id` into `api/wrangler.toml` under `database_id`.

## 3) Apply migrations
```bash
wrangler d1 migrations apply trader_hub --remote
```

## 4) Set APP_SECRET
Edit `api/wrangler.toml`:
- Set `APP_SECRET` to a long random string (20+ chars).
This secret is required for POST endpoints.

## 5) Deploy Worker
```bash
npm install
wrangler deploy
```
Copy the deployed Worker URL:
`https://trader-hub-api.<your-subdomain>.workers.dev`

## 6) Deploy Pages (web UI)
### Option A: GitHub + Cloudflare Pages (recommended)
- Push this repo to GitHub
- Cloudflare Dashboard -> Pages -> Create project -> connect repo
- Build settings:
  - Root: `web`
  - Build command: `npm install && npm run build`
  - Output directory: `dist`
- Add Pages env vars:
  - `VITE_API_BASE` = your Worker URL (no trailing slash)
  - `VITE_APP_SECRET` = same APP_SECRET used in Worker

Deploy.

### Option B: Local build, upload
```bash
cd web
npm install
npm run build
```
Upload `web/dist` to Pages.

## 7) Smoke tests
Open your Pages URL on phone/iPad:
- Ask tab: TSLA + “what will TSLA do tomorrow?”
- My Tickers: create watchlist, add tickers, run
- Weekly: generate picks

RSS ingest runs every 15 minutes after Worker deploy; news sections may be empty initially.

## Notes
- No login: write endpoints are protected by APP_SECRET header (`x-app-secret`).
- OHLCV uses Stooq daily CSV; some symbols may not exist there.
