# Comic Book Reader

A responsive web comic reader for **CBZ/CBR** files from **Google Drive**, **Terabox**, and local uploads. Features Firebase authentication, reading history, and AI page translation via OpenRouter.

## Features

- Responsive layout for desktop, tablet, and mobile
- Hybrid library: shared catalog + personal cloud (Google Drive / Terabox)
- Local CBZ/CBR upload and reading (IndexedDB)
- Reading progress and completed history (Firestore or local fallback)
- Auto-translate speech bubbles with OpenRouter (cached per page)
- PWA support with service worker page cache

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Firebase configured, **demo mode** accepts any email/password.

## Environment Setup

See `.env.example` for all variables. Minimum for full features:

1. **Firebase** – Create a project, enable Auth (Email + Google) and Firestore. Copy client config to `NEXT_PUBLIC_FIREBASE_*` and service account JSON to `FIREBASE_SERVICE_ACCOUNT_JSON`.
2. **Google Drive** – Create OAuth credentials, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_DRIVE_FOLDER_ID` for the shared catalog.
3. **Terabox** – Set `TERABOX_NDUS`, `TERABOX_JS_TOKEN`, `TERABOX_APP_ID` from browser session (see Terabox docs).
4. **OpenRouter** – Set `OPENROUTER_API_KEY` for AI translation.

Deploy Firestore rules from `firestore.rules`.

## Admin

Visit `/admin/catalog` to index comics from Google Drive and Terabox into the shared library.

## Deploy

Recommended: **Vercel** (Next.js) + **Firebase** (Auth/Firestore).

```bash
npm run build
npm start
```

## Project Structure

- `src/app/(main)/` – Library, reader, settings, continue reading
- `src/app/api/` – Comic streaming, translation, cloud proxies
- `src/lib/comics/` – CBZ/CBR extraction
- `src/lib/cloud/` – Google Drive & Terabox adapters
- `src/lib/translate/` – OpenRouter + Firestore cache
