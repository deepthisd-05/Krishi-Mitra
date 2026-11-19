# Krishi Mitra — Setup, Testing & Production Deployment Guide

**Tagline:** Smart Farming. Local Insights. Better Tomorrow.  
**Initial Pilot:** Sira Taluk, Tumakuru District, Karnataka (expandable across all Karnataka districts, taluks, hoblis, and villages).

---

## 1. Architecture Summary

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet (OpenStreetMap), `idb` (IndexedDB offline cache & sync queue), `vite-plugin-pwa` (Workbox service worker + Web App Manifest).
- **Backend:** Express + TypeScript (`server.ts`) running on port `3000`, Node 22 built-in SQLite (`node:sqlite` in WAL mode), scrypt password hashing + HMAC-SHA256 session cookies/tokens.
- **External Integrations:**
  - **Live Weather:** Open-Meteo (`https://api.open-meteo.com/v1/forecast`) — no API key required, server-cached with explicit `api_status` (`live` / `cached` / `unavailable`) and timestamp.
  - **Maps:** OpenStreetMap tiles via Leaflet (`leaflet`) with Haversine distance sorting.
  - **APMC Market Prices:** Serves verified published APMC reference snapshots with exact reporting dates; optional `DATA_GOV_API_KEY` env var enables live Agmarknet integration.
  - **Kannada Voice Assistant:** Web Speech API (`kn-IN` SpeechRecognition + SpeechSynthesis) with full text fallback and rule-based grounding in verified crop/weather/scheme/market data (no local AI model downloads required).

---

## 2. Local Development (Beginner-Friendly Steps)

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Copy environment template (optional for local dev):**
   ```bash
   cp .env.example .env
   ```
3. **Start the full-stack server (API + Frontend on port 3000):**
   ```bash
   npm run dev
   ```
4. **Open in browser:**  
   Visit `http://localhost:3000`

### Demo Accounts (Clearly Labeled on Login Screen)
- **Farmer Pilot Demo (Sira):** `ramesh.sira` / `farmer123`
- **Admin Officer Demo:** `admin.krishi` / `admin123`

---

## 3. Running Automated Tests & Build Checks

- **Typecheck:**
  ```bash
  npm run lint
  ```
- **API, Auth/RBAC, Crop Engine & Offline Sync Tests:**
  ```bash
  npx tsx --test tests/krishiMitra.test.ts
  ```
- **Production Build:**
  ```bash
  npm run build
  ```
- **Start Production Server:**
  ```bash
  NODE_ENV=production npm start
  ```

---

## 4. Production Deployment & Scaling Path

1. **HTTPS Requirement:** Service Workers, PWA installation (`Add to Home Screen`), GPS (`navigator.geolocation`), and Kannada microphone speech recognition require HTTPS in production (localhost is exempt for development).
2. **Environment Variables:**
   - Set a strong `SESSION_SECRET` (at least 32 random bytes).
   - Set `SQLITE_DB_PATH` to a persistent volume path (e.g., `/data/krishi_mitra.db`) or migrate schema to managed PostgreSQL when scaling across multiple server instances.
   - Optionally set `DATA_GOV_API_KEY` for live daily Agmarknet feeds.
3. **Database Backup & Recovery:**
   - Because SQLite runs in WAL mode, take consistent online backups using `sqlite3 krishi_mitra.db ".backup '/backups/krishi_mitra_$(date +%F).db'"` on a daily cron schedule.
4. **Hosting Options (Low-Cost Pilot → Scale):**
   - **Pilot:** Single Node.js container on Cloud Run (with persistent storage/Cloud SQL), Railway, Render, or a small VPS behind Caddy/Nginx with automatic Let's Encrypt HTTPS.
   - **Scaling:** Move `src/server/db.ts` queries to PostgreSQL connection pool and store weather cache in Redis/Postgres.
