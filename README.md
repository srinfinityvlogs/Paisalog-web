# PaisaLog Web — Week 1

A PWA that logs expenses straight into each signed-in user's own Google Sheet.
No database, no service account — each person signs in with their own Google
account, and the app talks to Sheets on their behalf using their own OAuth
token.

**This is the Week 1 slice of the 4-week plan**: sign-in, automatic Sheet
creation, and basic text-expense logging, working end to end. Receipt-photo
OCR (Week 3) reuses the bot's `lib/ocr.js` almost unchanged, but isn't wired
in yet — this milestone is about proving the auth + Sheets-API pipeline
works, since that's the one genuinely new, higher-risk piece.

---

## Setup

### 1. Install
```bash
npm install
cp .env.example .env
```

### 2. Google Cloud Console — OAuth credentials
1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (or reuse one).
2. **APIs & Services → Library** → enable the **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Add the `https://www.googleapis.com/auth/spreadsheets` scope.
   - Under **Test users**, add your own Google account (and anyone else testing this) — while the app is unverified, only listed test users can sign in. You can add up to 100 without needing Google's formal verification process.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (local dev)
     - `https://your-app.vercel.app/api/auth/callback/google` (add once deployed)
5. Copy the **Client ID** and **Client Secret** into `.env` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### 3. Generate an auth secret
```bash
openssl rand -base64 32
```
Put it in `.env` as `AUTH_SECRET`.

### 4. Run locally
```bash
npm run dev
```
Open `http://localhost:3000`, sign in, confirm a Sheet gets created in your Drive (titled "PaisaLog Expenses"), and that logging a text expense (e.g. `Grocery 250`) actually appears in it.

### 5. Deploy to Vercel
1. Push this to its own GitHub repo (separate from the bot's repo).
2. Import into Vercel. Add all four `.env` variables in **Settings → Environment Variables**, with `AUTH_URL` set to your production URL.
3. Add the production redirect URI to the Google Cloud OAuth client (step 2.4 above).
4. Connect the repo under **Settings → Git** so future pushes auto-deploy.

---

## A note on testing

This was hand-written against current Auth.js v5 (`next-auth@beta`) and Next.js App Router conventions, but hasn't been run through an actual `npm install && npm run build` yet — do that first locally and fix anything that surfaces before assuming it's deploy-ready. Auth.js v5 is still in beta and its exact API can shift between beta releases; if `npm install` pulls a newer beta than the one pinned in `package.json` and something looks different from this code, check the version-specific docs at [authjs.dev](https://authjs.dev).

---

## What's next (Weeks 2-4)

- **Week 2**: port month-tab date-routing and date-ordered inserts from the bot's `Code.gs` into real Sheets API calls (`batchUpdate`/`insertDimension`); nicer dashboard.
- **Week 3**: camera capture → `/api/receipts/parse` (wraps `lib/ocr.js`, unchanged) → editable confirm screen → save.
- **Week 4**: PWA installability polish (real app icons — `public/icons/` currently has none, needed for a proper install prompt), edit/delete UI, real-device testing on iOS Safari and Android Chrome, soft launch.

## Known gaps in this slice

- No app icons yet (`public/manifest.json` references `icons/icon-192.png` and `icon-512.png` that don't exist) — install will still work but with a default/missing icon.
- Only one month tab (the current month) is ever created — date-based routing to past/future months isn't ported yet.
- No receipt/OCR logging yet.
- No edit/delete UI for existing entries.
