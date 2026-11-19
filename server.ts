import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  extractToken,
  findUserByIdentifier,
  hashPassword,
  normalizeIdentifier,
  optionalAuth,
  recordSession,
  requireAdmin,
  requireAuth,
  revokeSession,
  signToken,
  toSafeUser,
  verifyPassword,
  type AuthedRequest,
} from './src/server/auth.ts';
import { generateHyperlocalSchedule, type CropRow } from './src/server/cropEngine.ts';
import { db, logAudit } from './src/server/db.ts';
import { getGoogleClientId, isGoogleAuthConfigured, verifyGoogleIdToken } from './src/server/googleAuth.ts';
import {
  analyzeLeafImage,
  isLeafAiConfigured,
  LeafServiceError,
  parseImageDataUrl,
} from './src/server/leafService.ts';
import { seedDatabase } from './src/server/seedData.ts';
import { getKarnatakaMarketPrices, invalidateMarketCache } from './src/server/marketService.ts';
import type { UserRecord } from './src/server/types.ts';
import {
  emitVerificationUpdate,
  getVerificationStatus,
  issueVerificationChallenge,
  subscribeVerificationStatus,
  VERIFICATION_EXPIRY_SECONDS,
  verifyChallengeCode,
} from './src/server/verificationService.ts';
import { getWeatherForCoordinates } from './src/server/weatherService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ensureSeededFarmerCalendar() {
  const seededUser = db.prepare('SELECT * FROM users WHERE identifier = ?').get('ramesh.sira') as UserRecord | undefined;
  if (!seededUser) return;
  const calCount = db.prepare('SELECT COUNT(*) as c FROM crop_calendars WHERE user_id = ?').get(seededUser.id) as { c: number };
  if (calCount.c > 0) return;

  const ragi = db.prepare('SELECT * FROM crops WHERE code = ?').get('ragi') as CropRow | undefined;
  if (!ragi) return;

  // Set sowing date 22 days ago so farmer immediately sees Germination, Vegetative, Fertilizer, Weed tasks across states
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 22);
  const sowingDate = d.toISOString().slice(0, 10);

  const generated = generateHyperlocalSchedule({
    crop: ragi,
    variety: 'GPU-28',
    season: 'Kharif (Mungaru)',
    soilType: seededUser.soil_type,
    irrigationType: seededUser.irrigation_type,
    sowingDate,
    district: seededUser.district,
    taluk: seededUser.taluk,
    agroZone: 'Central Dry Zone',
  });

  const calRes = db
    .prepare(
      `INSERT INTO crop_calendars (user_id, crop_code, variety, season, soil_type, irrigation_type, sowing_date, district, taluk, hobli, village, agro_zone, data_coverage, limitation_note_en, limitation_note_kn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      seededUser.id,
      'ragi',
      'GPU-28',
      'Kharif (Mungaru)',
      seededUser.soil_type,
      seededUser.irrigation_type,
      sowingDate,
      seededUser.district,
      seededUser.taluk,
      seededUser.hobli,
      seededUser.village,
      'Central Dry Zone',
      generated.data_coverage,
      generated.limitation_note_en,
      generated.limitation_note_kn
    );
  const calendarId = Number(calRes.lastInsertRowid);

  const insTask = db.prepare(
    `INSERT INTO calendar_tasks (calendar_id, user_id, stage_number, stage_key, title_en, title_kn, description_en, description_kn, inputs_en, inputs_kn, due_date, end_date, status, source_institution)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const t of generated.tasks) {
    const status = t.stage_number <= 4 ? 'completed' : 'pending';
    insTask.run(
      calendarId,
      seededUser.id,
      t.stage_number,
      t.stage_key,
      t.title_en,
      t.title_kn,
      t.description_en,
      t.description_kn,
      t.inputs_en,
      t.inputs_kn,
      t.due_date,
      t.end_date,
      status,
      t.source_institution
    );
  }

  db.prepare(
    `INSERT INTO notifications (user_id, title_en, title_kn, body_en, body_kn, kind)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    seededUser.id,
    'Ragi GPU-28 Top-Dressing Reminder',
    'ರಾಗಿ GPU-28 ಮೇಲುಗೊಬ್ಬರ ಜ್ಞಾಪನೆ',
    'Your Sira Ragi plot is entering the 25–35 day vegetative window. Check soil moisture before Urea top-dressing.',
    'ನಿಮ್ಮ ಸಿರಾ ರಾಗಿ ತಾಕು 25–35 ದಿನಗಳ ಸಸ್ಯಕ ಬೆಳವಣಿಗೆ ಹಂತಕ್ಕೆ ಬರುತ್ತಿದೆ. ಯೂರಿಯಾ ಹಾಕುವ ಮುನ್ನ ತೇವಾಂಶ ಪರಿಶೀಲಿಸಿ.',
    'reminder'
  );
}

export interface AppOptions {
  googleVerifier?: typeof verifyGoogleIdToken;
  leafAnalyzer?: typeof analyzeLeafImage;
}

export function createApp(appOptions: AppOptions = {}) {
  seedDatabase();
  ensureSeededFarmerCalendar();
  const verifyGoogleToken = appOptions.googleVerifier ?? verifyGoogleIdToken;
  const runLeafAnalysis = appOptions.leafAnalyzer ?? analyzeLeafImage;

  const app = express();
  app.use(express.json({ limit: '6mb' }));

  // Health & API Diagnostics
  app.get('/api/health', (_req, res) => {
    const counts = {
      users: (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c,
      crops: (db.prepare('SELECT COUNT(*) as c FROM crops').get() as { c: number }).c,
      locations: (db.prepare('SELECT COUNT(*) as c FROM locations').get() as { c: number }).c,
      schemes: (db.prepare('SELECT COUNT(*) as c FROM schemes').get() as { c: number }).c,
      shops: (db.prepare('SELECT COUNT(*) as c FROM agro_shops').get() as { c: number }).c,
    };
    res.json({
      status: 'ok',
      service: 'Krishi Mitra API',
      database: 'SQLite (WAL)',
      timestamp: new Date().toISOString(),
      counts,
    });
  });

  // ---------------- AUTHENTICATION & REAL-TIME VERIFICATION ----------------
  app.get('/api/auth/config', (_req, res) => {
    const clientId = getGoogleClientId();
    res.json({
      googleClientId: clientId,
      googleConfigured: Boolean(clientId),
      verificationExpirySeconds: VERIFICATION_EXPIRY_SECONDS,
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, identifier, password, preferred_lang, district, taluk, hobli, village } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter a valid full name (at least 2 characters).' });
    }
    const norm = typeof identifier === 'string' ? normalizeIdentifier(identifier) : null;
    if (!norm) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number or email address.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = findUserByIdentifier(norm.identifier);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email or mobile number already exists.' });
    }

    const loc = db
      .prepare('SELECT latitude, longitude FROM locations WHERE district = ? AND taluk = ? LIMIT 1')
      .get(district || 'Tumakuru', taluk || 'Sira') as { latitude: number; longitude: number } | undefined;

    const info = db
      .prepare(
        `INSERT INTO users (name, identifier, email, phone, auth_provider, verification_status, password_hash, role, preferred_lang, district, taluk, hobli, village, latitude, longitude, onboarding_completed, is_demo)
         VALUES (?, ?, ?, ?, 'password', 'pending', ?, 'farmer', ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      )
      .run(
        name.trim(),
        norm.identifier,
        norm.email,
        norm.phone,
        hashPassword(password),
        preferred_lang === 'en' ? 'en' : 'kn',
        district || 'Tumakuru',
        taluk || 'Sira',
        hobli || 'Kasaba',
        village || 'Sira Rural',
        loc?.latitude ?? 13.741,
        loc?.longitude ?? 76.904
      );

    const userId = Number(info.lastInsertRowid);
    const challenge = issueVerificationChallenge({
      identifier: norm.identifier,
      userId,
      purpose: 'register',
    });

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRecord;
    const token = signToken(userId, 'farmer');
    recordSession(userId, token, 'password');
    logAudit(userId, userRow.name, 'USER_REGISTERED', 'users', userId, `channel=${norm.channel}`);

    res.cookie('km_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({
      token,
      user: toSafeUser(userRow),
      verification: challenge.snapshot,
      issuedCode: challenge.issuedCode,
      deliveryMode: challenge.deliveryMode,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email / mobile number and password are required.' });
    }
    const userRow = findUserByIdentifier(String(identifier));
    if (!userRow) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your email/mobile and password.' });
    }
    if (!userRow.password_hash && userRow.auth_provider === 'google') {
      return res.status(400).json({
        error: 'This account uses Sign in with Google. Please sign in with Google or verify via one-time code.',
      });
    }
    if (!verifyPassword(String(password), userRow.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your email/mobile and password.' });
    }

    const token = signToken(userRow.id, userRow.role);
    recordSession(userRow.id, token, 'password');
    const verification = getVerificationStatus(userRow.identifier);

    res.cookie('km_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
    res.json({ token, user: toSafeUser(userRow), verification });
  });

  app.post('/api/auth/google', async (req, res) => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      return res.status(503).json({
        code: 'GOOGLE_NOT_CONFIGURED',
        error: 'Google Sign-In is not configured on the server. Set GOOGLE_CLIENT_ID in environment variables.',
      });
    }

    const { credential, preferred_lang } = req.body ?? {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google ID credential token is required.' });
    }

    let claims;
    try {
      claims = await verifyGoogleToken(credential, clientId);
    } catch (err) {
      return res.status(401).json({
        error: err instanceof Error ? err.message : 'Google token verification failed.',
      });
    }

    let userRow = db
      .prepare('SELECT * FROM users WHERE google_sub = ? OR lower(email) = ? OR lower(identifier) = ? LIMIT 1')
      .get(claims.sub, claims.email, claims.email) as UserRecord | undefined;

    if (userRow) {
      const nextProvider =
        userRow.password_hash && userRow.auth_provider === 'password'
          ? 'password+google'
          : userRow.auth_provider === 'password+google'
          ? 'password+google'
          : 'google';

      db.prepare(
        `UPDATE users
         SET google_sub = ?,
             email = COALESCE(email, ?),
             avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
             auth_provider = ?,
             verification_status = 'verified',
             verified_at = COALESCE(verified_at, datetime('now')),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(claims.sub, claims.email, claims.picture, claims.picture, nextProvider, userRow.id);
      userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id) as unknown as UserRecord;
    } else {
      const info = db
        .prepare(
          `INSERT INTO users (name, identifier, email, google_sub, auth_provider, avatar_url, verification_status, verified_at, password_hash, role, preferred_lang, district, taluk, hobli, village, latitude, longitude, onboarding_completed, is_demo)
           VALUES (?, ?, ?, ?, 'google', ?, 'verified', datetime('now'), '', 'farmer', ?, 'Tumakuru', 'Sira', 'Kasaba', 'Sira Rural', 13.741, 76.904, 0, 0)`
        )
        .run(
          claims.name || claims.email.split('@')[0],
          claims.email,
          claims.email,
          claims.sub,
          claims.picture || '',
          preferred_lang === 'en' ? 'en' : 'kn'
        );
      const userId = Number(info.lastInsertRowid);
      userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRecord;
      logAudit(userId, userRow.name, 'USER_REGISTERED_GOOGLE', 'users', userId, claims.email);
    }

    emitVerificationUpdate(userRow.identifier);
    const token = signToken(userRow.id, userRow.role);
    recordSession(userRow.id, token, 'google');

    res.cookie('km_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
    res.json({
      token,
      user: toSafeUser(userRow),
      auth_method: 'google',
      verification: getVerificationStatus(userRow.identifier),
    });
  });

  app.post('/api/auth/verification/send', (req: AuthedRequest, res) => {
    const rawId = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    const norm = rawId ? normalizeIdentifier(rawId) : null;
    if (!norm) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number, email, or username.' });
    }

    const purpose =
      req.body?.purpose === 'login' || req.body?.purpose === 'register' ? req.body.purpose : 'account_verify';
    const userRow = findUserByIdentifier(norm.identifier);
    if (purpose === 'login' && !userRow) {
      return res.status(404).json({ error: 'No account found for that email or mobile number. Create an account first.' });
    }

    const expirySeconds =
      typeof req.body?.expirySeconds === 'number' && req.body.expirySeconds >= 1 && req.body.expirySeconds <= 1800
        ? req.body.expirySeconds
        : VERIFICATION_EXPIRY_SECONDS;

    const challenge = issueVerificationChallenge({
      identifier: norm.identifier,
      userId: userRow?.id ?? null,
      purpose,
      expirySeconds,
    });

    res.json({
      verification: challenge.snapshot,
      issuedCode: challenge.issuedCode,
      deliveryMode: challenge.deliveryMode,
    });
  });

  app.post('/api/auth/verification/verify', (req, res) => {
    const { identifier, code, issueSession } = req.body ?? {};
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: 'Account identifier (email or mobile) is required.' });
    }
    const result = verifyChallengeCode({
      identifier,
      code: String(code || ''),
    });

    if (!result.ok) {
      return res.status(result.httpStatus).json({
        error: result.error,
        verification: result.snapshot,
      });
    }

    if (result.user) {
      logAudit(result.user.id, result.user.name, 'ACCOUNT_VERIFIED', 'users', result.user.id, result.snapshot.channel);
    }

    let token: string | undefined;
    if (result.user && issueSession !== false) {
      token = signToken(result.user.id, result.user.role);
      recordSession(result.user.id, token, 'verification_code');
      res.cookie('km_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000,
      });
    }

    res.json({
      verified: true,
      verification: result.snapshot,
      user: result.user ? toSafeUser(result.user) : null,
      token,
    });
  });

  app.get('/api/auth/verification/status', (req, res) => {
    const identifier = String(req.query.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'identifier query parameter is required.' });
    }
    const snapshot = getVerificationStatus(identifier);
    res.json({ verification: snapshot });
  });

  app.get('/api/auth/verification/stream', (req, res) => {
    const identifier = String(req.query.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'identifier query parameter is required.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (snapshot: ReturnType<typeof getVerificationStatus>) => {
      res.write(`event: status\ndata: ${JSON.stringify(snapshot)}\n\n`);
    };

    sendEvent(getVerificationStatus(identifier));

    const unsubscribe = subscribeVerificationStatus(identifier, sendEvent);
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSession(extractToken(req));
    res.clearCookie('km_session');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth!.uid) as UserRecord | undefined;
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: toSafeUser(userRow) });
  });

  app.put('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth!.uid) as UserRecord | undefined;
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : existing.name;
    const preferred_lang = b.preferred_lang === 'en' || b.preferred_lang === 'kn' ? b.preferred_lang : existing.preferred_lang;
    const district = typeof b.district === 'string' ? b.district : existing.district;
    const taluk = typeof b.taluk === 'string' ? b.taluk : existing.taluk;
    const hobli = typeof b.hobli === 'string' ? b.hobli : existing.hobli;
    const village = typeof b.village === 'string' ? b.village : existing.village;
    const farm_size_acres = typeof b.farm_size_acres === 'number' && b.farm_size_acres >= 0 ? b.farm_size_acres : existing.farm_size_acres;
    const soil_type = typeof b.soil_type === 'string' ? b.soil_type : existing.soil_type;
    const irrigation_type = typeof b.irrigation_type === 'string' ? b.irrigation_type : existing.irrigation_type;
    const crops_cultivated = Array.isArray(b.crops_cultivated)
      ? JSON.stringify(b.crops_cultivated)
      : existing.crops_cultivated;
    const latitude = typeof b.latitude === 'number' ? b.latitude : existing.latitude;
    const longitude = typeof b.longitude === 'number' ? b.longitude : existing.longitude;
    const onboarding_completed = typeof b.onboarding_completed === 'boolean' ? (b.onboarding_completed ? 1 : 0) : existing.onboarding_completed;

    db.prepare(
      `UPDATE users SET name=?, preferred_lang=?, district=?, taluk=?, hobli=?, village=?, farm_size_acres=?, soil_type=?, irrigation_type=?, crops_cultivated=?, latitude=?, longitude=?, onboarding_completed=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      name,
      preferred_lang,
      district,
      taluk,
      hobli,
      village,
      farm_size_acres,
      soil_type,
      irrigation_type,
      crops_cultivated,
      latitude,
      longitude,
      onboarding_completed,
      req.auth!.uid
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth!.uid) as unknown as UserRecord;
    res.json({ user: toSafeUser(updated) });
  });

  // ---------------- PLOTS ----------------
  app.get('/api/plots', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare('SELECT * FROM plots WHERE user_id = ? ORDER BY created_at DESC').all(req.auth!.uid);
    res.json({ plots: rows });
  });

  app.post('/api/plots', requireAuth, (req: AuthedRequest, res) => {
    const { name, district, taluk, hobli, village, area_acres, soil_type, irrigation_type, latitude, longitude } = req.body ?? {};
    if (!name || !district || !taluk) {
      return res.status(400).json({ error: 'Plot name, district, and taluk are required.' });
    }
    const info = db
      .prepare(
        `INSERT INTO plots (user_id, name, district, taluk, hobli, village, area_acres, soil_type, irrigation_type, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.auth!.uid,
        String(name).trim(),
        String(district),
        String(taluk),
        String(hobli || 'Kasaba'),
        String(village || taluk),
        Number(area_acres) || 1,
        String(soil_type || 'Red Sandy Loam'),
        String(irrigation_type || 'Rainfed'),
        typeof latitude === 'number' ? latitude : null,
        typeof longitude === 'number' ? longitude : null
      );
    const created = db.prepare('SELECT * FROM plots WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ plot: created });
  });

  app.delete('/api/plots/:id', requireAuth, (req: AuthedRequest, res) => {
    const result = db.prepare('DELETE FROM plots WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    if (result.changes === 0) return res.status(404).json({ error: 'Plot not found' });
    res.json({ ok: true });
  });

  // ---------------- LOCATIONS ----------------
  app.get('/api/locations', (_req, res) => {
    const rows = db.prepare('SELECT * FROM locations ORDER BY district, taluk, hobli, village').all();
    res.json({ locations: rows });
  });

  // ---------------- CROPS & HYPERLOCAL CALENDARS ----------------
  app.get('/api/crops', (_req, res) => {
    const rows = db.prepare('SELECT * FROM crops ORDER BY name_en').all() as unknown as CropRow[];
    const crops = rows.map((r) => ({
      ...r,
      varieties: JSON.parse(r.varieties),
      seasons: JSON.parse(r.seasons),
      soils: JSON.parse(r.soils),
      applicable_zones: JSON.parse(r.applicable_zones),
      stages: JSON.parse(r.stages),
    }));
    res.json({ crops });
  });

  app.get('/api/calendars', requireAuth, (req: AuthedRequest, res) => {
    const calendars = db
      .prepare(
        `SELECT cc.*, c.name_en as crop_name_en, c.name_kn as crop_name_kn, c.duration_days, c.source_institution, c.source_url, c.verified_date
         FROM crop_calendars cc
         JOIN crops c ON c.code = cc.crop_code
         WHERE cc.user_id = ?
         ORDER BY cc.created_at DESC`
      )
      .all(req.auth!.uid) as Array<Record<string, unknown>>;

    const getTasks = db.prepare('SELECT * FROM calendar_tasks WHERE calendar_id = ? AND user_id = ? ORDER BY due_date ASC, stage_number ASC');
    const enriched = calendars.map((cal) => ({
      ...cal,
      tasks: getTasks.all(Number(cal.id), req.auth!.uid),
    }));
    res.json({ calendars: enriched });
  });

  app.post('/api/calendars', requireAuth, (req: AuthedRequest, res) => {
    const { crop_code, variety, season, soil_type, irrigation_type, sowing_date, district, taluk, hobli, village, plot_id } = req.body ?? {};
    if (!crop_code || !sowing_date || !district || !taluk) {
      return res.status(400).json({ error: 'Crop, sowing date, district, and taluk are required.' });
    }
    const crop = db.prepare('SELECT * FROM crops WHERE code = ?').get(String(crop_code)) as CropRow | undefined;
    if (!crop) return res.status(404).json({ error: 'Crop not found in knowledge base.' });

    const locRow = db
      .prepare('SELECT agro_zone FROM locations WHERE district = ? AND taluk = ? LIMIT 1')
      .get(String(district), String(taluk)) as { agro_zone: string } | undefined;
    const agroZone = locRow?.agro_zone || 'Central Dry Zone';

    const varieties = JSON.parse(crop.varieties) as string[];
    const chosenVariety = variety && typeof variety === 'string' ? variety : varieties[0];
    const chosenSeason = season || 'Kharif (Mungaru)';
    const chosenSoil = soil_type || 'Red Sandy Loam';
    const chosenIrrigation = irrigation_type || 'Rainfed';

    const generated = generateHyperlocalSchedule({
      crop,
      variety: chosenVariety,
      season: chosenSeason,
      soilType: chosenSoil,
      irrigationType: chosenIrrigation,
      sowingDate: String(sowing_date),
      district: String(district),
      taluk: String(taluk),
      agroZone,
    });

    const calInfo = db
      .prepare(
        `INSERT INTO crop_calendars (user_id, plot_id, crop_code, variety, season, soil_type, irrigation_type, sowing_date, district, taluk, hobli, village, agro_zone, data_coverage, limitation_note_en, limitation_note_kn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.auth!.uid,
        plot_id ? Number(plot_id) : null,
        crop.code,
        chosenVariety,
        chosenSeason,
        chosenSoil,
        chosenIrrigation,
        String(sowing_date),
        String(district),
        String(taluk),
        String(hobli || 'Kasaba'),
        String(village || taluk),
        agroZone,
        generated.data_coverage,
        generated.limitation_note_en,
        generated.limitation_note_kn
      );

    const calendarId = Number(calInfo.lastInsertRowid);
    const insTask = db.prepare(
      `INSERT INTO calendar_tasks (calendar_id, user_id, stage_number, stage_key, title_en, title_kn, description_en, description_kn, inputs_en, inputs_kn, due_date, end_date, status, source_institution)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    );
    for (const t of generated.tasks) {
      insTask.run(
        calendarId,
        req.auth!.uid,
        t.stage_number,
        t.stage_key,
        t.title_en,
        t.title_kn,
        t.description_en,
        t.description_kn,
        t.inputs_en,
        t.inputs_kn,
        t.due_date,
        t.end_date,
        t.source_institution
      );
    }

    db.prepare(
      `INSERT INTO notifications (user_id, title_en, title_kn, body_en, body_kn, kind)
       VALUES (?, ?, ?, ?, ?, 'calendar')`
    ).run(
      req.auth!.uid,
      `New Crop Calendar: ${crop.name_en} (${chosenVariety})`,
      `ಹೊಸ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ: ${crop.name_kn} (${chosenVariety})`,
      `12-stage schedule created for ${taluk}, ${district} starting ${sowing_date}.`,
      `${district} ಜಿಲ್ಲೆಯ ${taluk} ತಾಲ್ಲೂಕಿಗೆ ${sowing_date} ರಿಂದ 12 ಹಂತದ ವೇಳಾಪಟ್ಟಿ ಸಿದ್ಧವಾಗಿದೆ.`
    );

    const createdCal = db
      .prepare(
        `SELECT cc.*, c.name_en as crop_name_en, c.name_kn as crop_name_kn, c.duration_days, c.source_institution, c.source_url, c.verified_date
         FROM crop_calendars cc JOIN crops c ON c.code = cc.crop_code WHERE cc.id = ?`
      )
      .get(calendarId);
    const tasks = db.prepare('SELECT * FROM calendar_tasks WHERE calendar_id = ? ORDER BY due_date ASC, stage_number ASC').all(calendarId);

    res.status(201).json({ calendar: { ...(createdCal as object), tasks } });
  });

  app.delete('/api/calendars/:id', requireAuth, (req: AuthedRequest, res) => {
    const result = db.prepare('DELETE FROM crop_calendars WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    if (result.changes === 0) return res.status(404).json({ error: 'Calendar not found' });
    res.json({ ok: true });
  });

  app.patch('/api/tasks/:id', requireAuth, (req: AuthedRequest, res) => {
    const taskId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM calendar_tasks WHERE id = ? AND user_id = ?').get(taskId, req.auth!.uid) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const b = req.body ?? {};
    const status = ['pending', 'completed', 'missed'].includes(b.status) ? String(b.status) : String(existing.status);
    const reminder_enabled = typeof b.reminder_enabled === 'boolean' ? (b.reminder_enabled ? 1 : 0) : Number(existing.reminder_enabled);
    const notes = typeof b.notes === 'string' ? b.notes : String(existing.notes || '');

    let due_date = String(existing.due_date);
    let end_date = String(existing.end_date || existing.due_date);
    if (typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) {
      const oldDueMs = Date.parse(`${due_date}T00:00:00Z`);
      const oldEndMs = Date.parse(`${end_date}T00:00:00Z`);
      const newDueMs = Date.parse(`${b.due_date}T00:00:00Z`);
      const spanDays = !Number.isNaN(oldDueMs) && !Number.isNaN(oldEndMs) ? Math.max(0, Math.round((oldEndMs - oldDueMs) / 86400000)) : 0;
      due_date = b.due_date;
      if (typeof b.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.end_date)) {
        end_date = b.end_date < due_date ? due_date : b.end_date;
      } else if (!Number.isNaN(newDueMs)) {
        const shifted = new Date(newDueMs + spanDays * 86400000);
        end_date = shifted.toISOString().slice(0, 10);
      } else {
        end_date = due_date;
      }
    } else if (typeof b.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.end_date)) {
      end_date = b.end_date < due_date ? due_date : b.end_date;
    }

    db.prepare(
      `UPDATE calendar_tasks
       SET status = ?, reminder_enabled = ?, notes = ?, due_date = ?, end_date = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(status, reminder_enabled, notes, due_date, end_date, taskId, req.auth!.uid);
    const updated = db.prepare('SELECT * FROM calendar_tasks WHERE id = ?').get(taskId);
    res.json({ task: updated });
  });

  app.post('/api/tasks', requireAuth, (req: AuthedRequest, res) => {
    const { calendar_id, title_en, title_kn, description_en, description_kn, due_date, client_sync_id } = req.body ?? {};
    if (!calendar_id || !title_en || !due_date) {
      return res.status(400).json({ error: 'Calendar ID, task title, and due date are required.' });
    }
    const cal = db.prepare('SELECT id FROM crop_calendars WHERE id = ? AND user_id = ?').get(Number(calendar_id), req.auth!.uid);
    if (!cal) return res.status(404).json({ error: 'Calendar not found.' });

    if (client_sync_id) {
      const dup = db.prepare('SELECT * FROM calendar_tasks WHERE client_sync_id = ?').get(String(client_sync_id));
      if (dup) return res.json({ task: dup, deduplicated: true });
    }

    const info = db
      .prepare(
        `INSERT INTO calendar_tasks (calendar_id, user_id, stage_number, stage_key, title_en, title_kn, description_en, description_kn, due_date, end_date, status, reminder_enabled, is_custom, source_institution, client_sync_id)
         VALUES (?, ?, 99, 'custom_reminder', ?, ?, ?, ?, ?, ?, 'pending', 1, 1, 'Farmer Custom Reminder', ?)`
      )
      .run(
        Number(calendar_id),
        req.auth!.uid,
        String(title_en),
        String(title_kn || title_en),
        String(description_en || ''),
        String(description_kn || description_en || ''),
        String(due_date),
        String(due_date),
        client_sync_id ? String(client_sync_id) : null
      );

    const created = db.prepare('SELECT * FROM calendar_tasks WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ task: created });
  });

  // ---------------- LIVE WEATHER ----------------
  app.get('/api/weather', async (req, res) => {
    const lat = Number(req.query.lat ?? 13.741);
    const lng = Number(req.query.lng ?? 76.904);
    const label = String(req.query.label || 'Sira, Tumakuru');
    const force = req.query.refresh === '1';

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const weather = await getWeatherForCoordinates(lat, lng, label, force);
    res.json(weather);
  });

  // ---------------- NEARBY AGRO SHOPS ----------------
  app.get('/api/shops', (req: AuthedRequest, res) => {
    const lat = Number(req.query.lat ?? 13.741);
    const lng = Number(req.query.lng ?? 76.904);
    const caller = optionalAuth(req);
    const isAdmin = caller?.role === 'admin';
    const includePending = isAdmin && req.query.include_pending === '1';

    const rows = (
      includePending
        ? db.prepare('SELECT * FROM agro_shops ORDER BY verification_status DESC, id ASC').all()
        : caller
        ? db
            .prepare(
              `SELECT * FROM agro_shops
               WHERE verification_status = 'verified'
                  OR (submitted_by = ? AND verification_status != 'rejected')
               ORDER BY CASE verification_status WHEN 'verified' THEN 0 ELSE 1 END, id ASC`
            )
            .all(caller.uid)
        : db.prepare("SELECT * FROM agro_shops WHERE verification_status = 'verified' ORDER BY id ASC").all()
    ) as Array<Record<string, unknown>>;

    const shops = rows
      .map((r) => ({
        ...r,
        distance_km: Number(haversineKm(lat, lng, Number(r.latitude), Number(r.longitude)).toFixed(1)),
      }))
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json({ shops });
  });

  app.post('/api/shops', requireAuth, (req: AuthedRequest, res) => {
    const { name, name_kn, category, address, district, taluk, phone, products, operating_hours, latitude, longitude } = req.body ?? {};
    if (!name || !address || !district || !taluk) {
      return res.status(400).json({ error: 'Shop name, address, district, and taluk are required.' });
    }
    const loc = db
      .prepare('SELECT latitude, longitude FROM locations WHERE district = ? AND taluk = ? LIMIT 1')
      .get(String(district), String(taluk)) as { latitude: number; longitude: number } | undefined;

    const info = db
      .prepare(
        `INSERT INTO agro_shops (name, name_kn, category, address, district, taluk, phone, products, operating_hours, latitude, longitude, verification_status, source_label, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'Farmer Directory Submission', ?)`
      )
      .run(
        String(name).trim(),
        String(name_kn || name).trim(),
        String(category || 'Fertilizer & Seed Shop'),
        String(address).trim(),
        String(district),
        String(taluk),
        String(phone || '').trim(),
        String(products || 'Seeds, Fertilizers'),
        String(operating_hours || 'Confirm hours by phone'),
        typeof latitude === 'number' ? latitude : loc?.latitude ?? 13.741,
        typeof longitude === 'number' ? longitude : loc?.longitude ?? 76.904,
        req.auth!.uid
      );

    const created = db.prepare('SELECT * FROM agro_shops WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ shop: created });
  });

  // ---------------- TRACTOR & EQUIPMENT RENTALS ----------------
  app.get('/api/rentals', (req: AuthedRequest, res) => {
    const lat = Number(req.query.lat ?? 13.741);
    const lng = Number(req.query.lng ?? 76.904);
    const caller = optionalAuth(req);
    const isAdmin = caller?.role === 'admin';

    const rows = (
      isAdmin
        ? db
            .prepare(
              "SELECT * FROM equipment_rentals WHERE verification_status != 'rejected' ORDER BY CASE verification_status WHEN 'verified' THEN 0 ELSE 1 END, id ASC"
            )
            .all()
        : caller
        ? db
            .prepare(
              `SELECT * FROM equipment_rentals
               WHERE verification_status = 'verified'
                  OR (submitted_by = ? AND verification_status != 'rejected')
               ORDER BY CASE verification_status WHEN 'verified' THEN 0 ELSE 1 END, id ASC`
            )
            .all(caller.uid)
        : db.prepare("SELECT * FROM equipment_rentals WHERE verification_status = 'verified' ORDER BY id ASC").all()
    ) as Array<Record<string, unknown>>;

    const rentals = rows
      .map((r) => ({
        ...r,
        distance_km: Number(haversineKm(lat, lng, Number(r.latitude), Number(r.longitude)).toFixed(1)),
      }))
      .sort((a, b) => a.distance_km - b.distance_km);
    res.json({ rentals });
  });

  app.post('/api/rentals', requireAuth, (req: AuthedRequest, res) => {
    const { equipment_name, equipment_name_kn, category, owner_name, district, taluk, village, rate_info, phone, availability_confirmed } = req.body ?? {};
    if (!equipment_name || !owner_name || !district || !taluk) {
      return res.status(400).json({ error: 'Equipment name, owner name, district, and taluk are required.' });
    }
    const loc = db
      .prepare('SELECT latitude, longitude FROM locations WHERE district = ? AND taluk = ? LIMIT 1')
      .get(String(district), String(taluk)) as { latitude: number; longitude: number } | undefined;

    const info = db
      .prepare(
        `INSERT INTO equipment_rentals (equipment_name, equipment_name_kn, category, owner_name, district, taluk, village, rate_info, phone, availability_status, verification_status, latitude, longitude, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(
        String(equipment_name).trim(),
        String(equipment_name_kn || equipment_name).trim(),
        String(category || 'Tractor & Tillage'),
        String(owner_name).trim(),
        String(district),
        String(taluk),
        String(village || taluk),
        String(rate_info || 'Confirm rate directly with owner'),
        String(phone || '').trim(),
        availability_confirmed ? 'confirmed' : 'unconfirmed',
        loc?.latitude ?? 13.741,
        loc?.longitude ?? 76.904,
        req.auth!.uid
      );

    const created = db.prepare('SELECT * FROM equipment_rentals WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ rental: created });
  });

  app.post('/api/rentals/:id/enquire', requireAuth, (req: AuthedRequest, res) => {
    const equipmentId = Number(req.params.id);
    const rental = db.prepare('SELECT * FROM equipment_rentals WHERE id = ?').get(equipmentId) as Record<string, unknown> | undefined;
    if (!rental) return res.status(404).json({ error: 'Equipment listing not found' });

    const { requested_date, duration_hours, farmer_contact, notes } = req.body ?? {};
    if (!requested_date || !farmer_contact) {
      return res.status(400).json({ error: 'Preferred date and contact number are required.' });
    }
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    const info = db
      .prepare(
        `INSERT INTO rental_enquiries (equipment_id, farmer_id, farmer_name, farmer_contact, requested_date, duration_hours, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(equipmentId, req.auth!.uid, user.name, String(farmer_contact), String(requested_date), Number(duration_hours) || 4, String(notes || ''));

    const created = db.prepare('SELECT * FROM rental_enquiries WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ enquiry: created });
  });

  app.get('/api/rental-enquiries', requireAuth, (req: AuthedRequest, res) => {
    const rows =
      req.auth!.role === 'admin'
        ? db
            .prepare(
              `SELECT re.*, er.equipment_name, er.owner_name, er.taluk
               FROM rental_enquiries re JOIN equipment_rentals er ON er.id = re.equipment_id
               ORDER BY re.created_at DESC`
            )
            .all()
        : db
            .prepare(
              `SELECT re.*, er.equipment_name, er.owner_name, er.taluk
               FROM rental_enquiries re JOIN equipment_rentals er ON er.id = re.equipment_id
               WHERE re.farmer_id = ?
               ORDER BY re.created_at DESC`
            )
            .all(req.auth!.uid);
    res.json({ enquiries: rows });
  });

  // ---------------- GOVERNMENT SCHEMES ----------------
  app.get('/api/schemes', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const level = String(req.query.level || '').trim();
    const rows = db.prepare('SELECT * FROM schemes ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    const filtered = rows.filter((s) => {
      if (level && level !== 'all' && !String(s.level).toLowerCase().includes(level.toLowerCase())) return false;
      if (q) {
        const hay = `${s.name_en} ${s.name_kn} ${s.category} ${s.description_en} ${s.description_kn}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
    res.json({ schemes: filtered });
  });

  // ---------------- APMC MARKET PRICES ----------------
  app.get('/api/market-prices', async (req, res) => {
    const crop = String(req.query.crop || '').trim();
    const district = String(req.query.district || '').trim();
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

    const payload = await getKarnatakaMarketPrices({ forceRefresh });
    let rows = payload.prices;
    if (crop && crop !== 'all') {
      rows = rows.filter((r) => r.crop_code === crop);
    }
    if (district && district !== 'all') {
      rows = rows.filter((r) => r.district.toLowerCase() === district.toLowerCase());
    }

    res.json({
      ...payload,
      prices: rows,
    });
  });

  // ---------------- NOTIFICATIONS & FIELD NOTES ----------------
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.auth!.uid);
    res.json({ notifications: rows });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    res.json({ ok: true });
  });

  app.get('/api/notes', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare('SELECT * FROM field_notes WHERE user_id = ? ORDER BY updated_at DESC').all(req.auth!.uid);
    res.json({ notes: rows });
  });

  app.post('/api/notes', requireAuth, (req: AuthedRequest, res) => {
    const { title, content, calendar_id, client_sync_id } = req.body ?? {};
    if (!title || !content) return res.status(400).json({ error: 'Title and note content required.' });

    if (client_sync_id) {
      const dup = db.prepare('SELECT * FROM field_notes WHERE client_sync_id = ?').get(String(client_sync_id));
      if (dup) return res.json({ note: dup, deduplicated: true });
    }

    const info = db
      .prepare('INSERT INTO field_notes (user_id, calendar_id, title, content, client_sync_id) VALUES (?, ?, ?, ?, ?)')
      .run(req.auth!.uid, calendar_id ? Number(calendar_id) : null, String(title).trim(), String(content).trim(), client_sync_id ? String(client_sync_id) : null);

    const created = db.prepare('SELECT * FROM field_notes WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ note: created });
  });

  app.delete('/api/notes/:id', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM field_notes WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    res.json({ ok: true });
  });

  // ---------------- LEAF DISEASE DETECTION & FERTILIZER GUIDANCE ----------------
  app.get('/api/leaf-scans', requireAuth, (req: AuthedRequest, res) => {
    const scans = db
      .prepare('SELECT * FROM leaf_scans WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40')
      .all(req.auth!.uid);
    res.json({
      scans,
      aiConfigured: isLeafAiConfigured(),
      fetched_at: new Date().toISOString(),
    });
  });

  app.post('/api/leaf-scans', requireAuth, async (req: AuthedRequest, res) => {
    const { crop_code, image_data_url, field_notes } = req.body ?? {};
    if (!crop_code || typeof crop_code !== 'string') {
      return res.status(400).json({ error: 'Please select the crop before analyzing the leaf photo.' });
    }
    if (!image_data_url || typeof image_data_url !== 'string') {
      return res.status(400).json({ error: 'Please upload or capture a leaf photo.' });
    }
    try {
      parseImageDataUrl(image_data_url);
    } catch (err) {
      if (err instanceof LeafServiceError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      return res.status(400).json({ error: 'Invalid leaf image format.', code: 'INVALID_IMAGE_DATA' });
    }

    const cropRow = db.prepare('SELECT code, name_en, name_kn FROM crops WHERE code = ?').get(crop_code.trim()) as
      | { code: string; name_en: string; name_kn: string }
      | undefined;

    const cropNameEn = cropRow?.name_en ?? crop_code.trim();
    const cropNameKn = cropRow?.name_kn ?? crop_code.trim();

    const userRow = db
      .prepare('SELECT district, taluk, soil_type, irrigation_type FROM users WHERE id = ?')
      .get(req.auth!.uid) as
      | { district: string; taluk: string; soil_type: string; irrigation_type: string }
      | undefined;

    try {
      const result = await runLeafAnalysis({
        cropCode: cropRow?.code ?? crop_code.trim(),
        cropNameEn,
        cropNameKn,
        imageDataUrl: image_data_url,
        fieldNotes: typeof field_notes === 'string' ? field_notes : '',
        district: userRow?.district,
        taluk: userRow?.taluk,
        soilType: userRow?.soil_type,
        irrigationType: userRow?.irrigation_type,
      });

      const info = db
        .prepare(
          `INSERT INTO leaf_scans (
            user_id, crop_code, crop_name_en, crop_name_kn, field_notes, image_data_url,
            condition_name_en, condition_name_kn, category, severity, confidence_level, confidence_pct,
            confidence_notes_en, confidence_notes_kn, visible_symptoms_en, visible_symptoms_kn,
            fertilizer_guidance_en, fertilizer_guidance_kn, spray_care_guidance_en, spray_care_guidance_kn,
            rsk_confirmation_en, rsk_confirmation_kn,
            recommended_task_title_en, recommended_task_title_kn,
            recommended_task_description_en, recommended_task_description_kn,
            recommended_days_offset, model_used
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.auth!.uid,
          cropRow?.code ?? crop_code.trim(),
          cropNameEn,
          cropNameKn,
          typeof field_notes === 'string' ? field_notes.trim() : '',
          image_data_url.trim(),
          result.condition_name_en,
          result.condition_name_kn,
          result.category,
          result.severity,
          result.confidence_level,
          result.confidence_pct,
          result.confidence_notes_en,
          result.confidence_notes_kn,
          result.visible_symptoms_en,
          result.visible_symptoms_kn,
          result.fertilizer_guidance_en,
          result.fertilizer_guidance_kn,
          result.spray_care_guidance_en,
          result.spray_care_guidance_kn,
          result.rsk_confirmation_en,
          result.rsk_confirmation_kn,
          result.recommended_task_title_en,
          result.recommended_task_title_kn,
          result.recommended_task_description_en,
          result.recommended_task_description_kn,
          result.recommended_days_offset,
          result.model_used
        );

      const scan = db.prepare('SELECT * FROM leaf_scans WHERE id = ?').get(Number(info.lastInsertRowid));
      res.status(201).json({ scan });
    } catch (err) {
      if (err instanceof LeafServiceError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      const message = err instanceof Error ? err.message : 'Leaf analysis failed.';
      res.status(502).json({ error: message, code: 'LEAF_ANALYSIS_ERROR' });
    }
  });

  const resolveOrCreateUserCalendar = (
    uid: number,
    cropCode: string,
    preferredCalendarId?: number | null,
    autoCreate = true
  ): number | null => {
    if (preferredCalendarId) {
      const cal = db
        .prepare('SELECT id FROM crop_calendars WHERE id = ? AND user_id = ?')
        .get(Number(preferredCalendarId), uid) as { id: number } | undefined;
      if (!cal) return null;
      return cal.id;
    }

    const matchingCal = db
      .prepare('SELECT id FROM crop_calendars WHERE user_id = ? AND crop_code = ? ORDER BY created_at DESC LIMIT 1')
      .get(uid, cropCode) as { id: number } | undefined;
    if (matchingCal) return matchingCal.id;

    if (!autoCreate) return null;

    const crop = db.prepare('SELECT * FROM crops WHERE code = ?').get(cropCode) as CropRow | undefined;
    const userRow = db
      .prepare('SELECT district, taluk, hobli, village, soil_type, irrigation_type FROM users WHERE id = ?')
      .get(uid) as
      | { district: string; taluk: string; hobli: string; village: string; soil_type: string; irrigation_type: string }
      | undefined;

    if (!crop || !userRow) return null;

    const locRow = db
      .prepare('SELECT agro_zone FROM locations WHERE district = ? AND taluk = ? LIMIT 1')
      .get(userRow.district, userRow.taluk) as { agro_zone: string } | undefined;
    const agroZone = locRow?.agro_zone || 'Central Dry Zone';
    const varieties = JSON.parse(crop.varieties) as string[];
    const seasons = JSON.parse(crop.seasons) as string[];
    const todayIso = new Date().toISOString().slice(0, 10);
    const generated = generateHyperlocalSchedule({
      crop,
      variety: varieties[0] || 'Recommended Local Variety',
      season: seasons[0] || 'Kharif (Mungaru)',
      soilType: userRow.soil_type,
      irrigationType: userRow.irrigation_type,
      sowingDate: todayIso,
      district: userRow.district,
      taluk: userRow.taluk,
      agroZone,
    });
    const calInfo = db
      .prepare(
        `INSERT INTO crop_calendars (user_id, crop_code, variety, season, soil_type, irrigation_type, sowing_date, district, taluk, hobli, village, agro_zone, data_coverage, limitation_note_en, limitation_note_kn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uid,
        crop.code,
        varieties[0] || 'Recommended Local Variety',
        seasons[0] || 'Kharif (Mungaru)',
        userRow.soil_type,
        userRow.irrigation_type,
        todayIso,
        userRow.district,
        userRow.taluk,
        userRow.hobli,
        userRow.village,
        agroZone,
        generated.data_coverage,
        generated.limitation_note_en,
        generated.limitation_note_kn
      );
    const createdCalendarId = Number(calInfo.lastInsertRowid);
    const insTask = db.prepare(
      `INSERT INTO calendar_tasks (calendar_id, user_id, stage_number, stage_key, title_en, title_kn, description_en, description_kn, inputs_en, inputs_kn, due_date, end_date, status, source_institution)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    );
    for (const st of generated.tasks) {
      insTask.run(
        createdCalendarId,
        uid,
        st.stage_number,
        st.stage_key,
        st.title_en,
        st.title_kn,
        st.description_en,
        st.description_kn,
        st.inputs_en,
        st.inputs_kn,
        st.due_date,
        st.end_date,
        st.source_institution
      );
    }
    return createdCalendarId;
  };

  const parseSoilPlanRow = (row: Record<string, unknown> | undefined) => {
    if (!row) return null;
    let parsedInputs: unknown[] = [];
    try {
      parsedInputs = typeof row.planned_inputs === 'string' ? JSON.parse(row.planned_inputs) : [];
    } catch {
      parsedInputs = [];
    }
    return {
      ...row,
      planned_inputs: Array.isArray(parsedInputs) ? parsedInputs : [],
    };
  };

  app.post('/api/leaf-scans/:id/add-to-calendar', requireAuth, (req: AuthedRequest, res) => {
    const scanId = Number(req.params.id);
    const scan = db
      .prepare('SELECT * FROM leaf_scans WHERE id = ? AND user_id = ?')
      .get(scanId, req.auth!.uid) as Record<string, unknown> | undefined;
    if (!scan) {
      return res.status(404).json({ error: 'Saved leaf scan not found.' });
    }

    const { calendar_id, due_date, auto_create_calendar } = req.body ?? {};
    const targetCalendarId = resolveOrCreateUserCalendar(
      req.auth!.uid,
      String(scan.crop_code),
      calendar_id ? Number(calendar_id) : null,
      auto_create_calendar !== false
    );

    if (!targetCalendarId) {
      return res.status(calendar_id ? 404 : 400).json({
        error: calendar_id ? 'Selected crop calendar was not found.' : 'Please create or select a crop calendar first.',
      });
    }

    const offsetDays = Math.max(0, Math.min(14, Number(scan.recommended_days_offset) || 1));
    const defaultDate = new Date();
    defaultDate.setUTCDate(defaultDate.getUTCDate() + offsetDays);
    const chosenDate =
      typeof due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due_date)
        ? due_date
        : defaultDate.toISOString().slice(0, 10);

    const taskInfo = db
      .prepare(
        `INSERT INTO calendar_tasks (
          calendar_id, user_id, stage_number, stage_key,
          title_en, title_kn, description_en, description_kn,
          inputs_en, inputs_kn, due_date, end_date,
          status, reminder_enabled, is_custom, source_institution
        ) VALUES (?, ?, 98, 'leaf_scan_care', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1, 'Krishi Mitra Leaf Diagnosis (Confirm at RSK)')`
      )
      .run(
        targetCalendarId,
        req.auth!.uid,
        String(scan.recommended_task_title_en),
        String(scan.recommended_task_title_kn),
        `${String(scan.recommended_task_description_en)} (${String(scan.rsk_confirmation_en)})`,
        `${String(scan.recommended_task_description_kn)} (${String(scan.rsk_confirmation_kn)})`,
        String(scan.fertilizer_guidance_en),
        String(scan.fertilizer_guidance_kn),
        chosenDate,
        chosenDate
      );

    const taskId = Number(taskInfo.lastInsertRowid);
    db.prepare('UPDATE leaf_scans SET added_calendar_id = ?, added_task_id = ? WHERE id = ? AND user_id = ?').run(
      targetCalendarId,
      taskId,
      scanId,
      req.auth!.uid
    );

    const task = db.prepare('SELECT * FROM calendar_tasks WHERE id = ?').get(taskId);
    const updatedScan = db.prepare('SELECT * FROM leaf_scans WHERE id = ?').get(scanId);
    res.status(201).json({ task, calendar_id: targetCalendarId, scan: updatedScan });
  });

  app.delete('/api/leaf-scans/:id', requireAuth, (req: AuthedRequest, res) => {
    const result = db.prepare('DELETE FROM leaf_scans WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Saved leaf scan not found.' });
    }
    res.json({ ok: true });
  });

  // ---------------- SOIL HEALTH & FERTILIZER INPUT PLANS ----------------
  app.get('/api/soil-plans', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM soil_plans WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 40')
      .all(req.auth!.uid) as Array<Record<string, unknown>>;
    res.json({
      plans: rows.map((r) => parseSoilPlanRow(r)),
      fetched_at: new Date().toISOString(),
    });
  });

  app.post('/api/soil-plans', requireAuth, (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const cropCode = typeof b.crop_code === 'string' && b.crop_code.trim() ? b.crop_code.trim() : '';
    const plotName = typeof b.plot_name === 'string' && b.plot_name.trim() ? b.plot_name.trim() : '';
    if (!cropCode || !plotName) {
      return res.status(400).json({ error: 'Plot name and crop are required to save a soil & input plan.' });
    }

    if (b.client_sync_id) {
      const dup = db
        .prepare('SELECT * FROM soil_plans WHERE client_sync_id = ? AND user_id = ?')
        .get(String(b.client_sync_id), req.auth!.uid) as Record<string, unknown> | undefined;
      if (dup) return res.json({ plan: parseSoilPlanRow(dup), deduplicated: true });
    }

    const cropRow = db.prepare('SELECT code, name_en, name_kn FROM crops WHERE code = ?').get(cropCode) as
      | { code: string; name_en: string; name_kn: string }
      | undefined;

    const cropNameEn = cropRow?.name_en ?? (typeof b.crop_name_en === 'string' && b.crop_name_en.trim() ? b.crop_name_en.trim() : cropCode);
    const cropNameKn = cropRow?.name_kn ?? (typeof b.crop_name_kn === 'string' && b.crop_name_kn.trim() ? b.crop_name_kn.trim() : cropNameEn);
    const validStatus = (val: unknown) => (['low', 'medium', 'high', 'unknown'].includes(String(val)) ? String(val) : 'unknown');
    const phRaw = b.ph_level === '' || b.ph_level === null || b.ph_level === undefined ? null : Number(b.ph_level);
    const phLevel = phRaw !== null && !Number.isNaN(phRaw) && phRaw >= 0 && phRaw <= 14 ? Number(phRaw.toFixed(1)) : null;
    const areaAcres = Math.max(0.1, Number(b.area_acres) || 1);

    const rawInputs = Array.isArray(b.planned_inputs) ? b.planned_inputs : [];
    const normalizedInputs: Array<{ name: string; category: string; qty_label: string; estimated_cost_inr: number }> = rawInputs
      .filter((item: unknown) => item && typeof item === 'object' && String((item as Record<string, unknown>).name || '').trim())
      .map((item: unknown) => {
        const rec = item as Record<string, unknown>;
        const cat = ['seed', 'fertilizer', 'soil_amendment', 'bio_input'].includes(String(rec.category))
          ? String(rec.category)
          : 'fertilizer';
        const estCost = Math.max(0, Number(rec.estimated_cost_inr) || 0);
        return {
          name: String(rec.name).trim(),
          category: cat,
          qty_label: String(rec.qty_label || '').trim(),
          estimated_cost_inr: Math.round(estCost),
        };
      });

    const totalCost = normalizedInputs.reduce((acc, item) => acc + item.estimated_cost_inr, 0);

    const info = db
      .prepare(
        `INSERT INTO soil_plans (
          user_id, plot_name, crop_code, crop_name_en, crop_name_kn, crop_stage, soil_type,
          ph_level, n_status, p_status, k_status, area_acres, planned_inputs, total_estimated_cost_inr, notes, client_sync_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.auth!.uid,
        plotName,
        cropCode,
        cropNameEn,
        cropNameKn,
        String(b.crop_stage || 'Basal / Land Preparation').trim(),
        String(b.soil_type || 'Red Sandy Loam').trim(),
        phLevel,
        validStatus(b.n_status),
        validStatus(b.p_status),
        validStatus(b.k_status),
        areaAcres,
        JSON.stringify(normalizedInputs),
        totalCost,
        typeof b.notes === 'string' ? b.notes.trim() : '',
        b.client_sync_id ? String(b.client_sync_id) : null
      );

    const created = db.prepare('SELECT * FROM soil_plans WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({ plan: parseSoilPlanRow(created) });
  });

  app.post('/api/soil-plans/:id/add-to-calendar', requireAuth, (req: AuthedRequest, res) => {
    const planId = Number(req.params.id);
    const planRow = db
      .prepare('SELECT * FROM soil_plans WHERE id = ? AND user_id = ?')
      .get(planId, req.auth!.uid) as Record<string, unknown> | undefined;
    if (!planRow) {
      return res.status(404).json({ error: 'Saved soil plan not found.' });
    }
    const plan = parseSoilPlanRow(planRow)!;

    const { calendar_id, due_date, auto_create_calendar } = req.body ?? {};
    const targetCalendarId = resolveOrCreateUserCalendar(
      req.auth!.uid,
      String(planRow.crop_code),
      calendar_id ? Number(calendar_id) : null,
      auto_create_calendar !== false
    );

    if (!targetCalendarId) {
      return res.status(calendar_id ? 404 : 400).json({
        error: calendar_id ? 'Selected crop calendar was not found.' : 'Please create or select a crop calendar first.',
      });
    }

    const chosenDate =
      typeof due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due_date)
        ? due_date
        : new Date().toISOString().slice(0, 10);

    const inputsSummary = (plan.planned_inputs as Array<{ name: string; qty_label: string; estimated_cost_inr: number }>)
      .map((item) => `${item.name}${item.qty_label ? ` (${item.qty_label})` : ''} - ₹${item.estimated_cost_inr}`)
      .join('; ');

    const phPart = planRow.ph_level !== null && planRow.ph_level !== undefined ? `pH ${planRow.ph_level}, ` : '';
    const npkPart = `N:${planRow.n_status} P:${planRow.p_status} K:${planRow.k_status}`;
    const descEn = `${planRow.plot_name} (${planRow.area_acres} ac, ${planRow.soil_type}, ${phPart}${npkPart}). Planned budget: ₹${planRow.total_estimated_cost_inr}. General planning reference only — confirm exact dosage at local RSK.`;
    const descKn = `${planRow.plot_name} (${planRow.area_acres} ಎಕರೆ, ${planRow.soil_type}, ${phPart}${npkPart}). ಅಂದಾಜು ವೆಚ್ಚ: ₹${planRow.total_estimated_cost_inr}. ಇದು ಸಾಮಾನ್ಯ ಯೋಜನಾ ಮಾರ್ಗದರ್ಶಿ ಮಾತ್ರ — ನಿಖರ ಪ್ರಮಾಣವನ್ನು ಆರ್‌ಎಸ್‌ಕೆಯಲ್ಲಿ ದೃಢಪಡಿಸಿ.`;

    const taskInfo = db
      .prepare(
        `INSERT INTO calendar_tasks (
          calendar_id, user_id, stage_number, stage_key,
          title_en, title_kn, description_en, description_kn,
          inputs_en, inputs_kn, due_date, end_date,
          status, reminder_enabled, is_custom, source_institution
        ) VALUES (?, ?, 97, 'soil_input_plan', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1, 'Soil & Fertilizer Plan (Confirm at RSK)')`
      )
      .run(
        targetCalendarId,
        req.auth!.uid,
        `${planRow.crop_name_en}: ${planRow.crop_stage} (${planRow.plot_name})`,
        `${planRow.crop_name_kn}: ${planRow.crop_stage} (${planRow.plot_name})`,
        descEn,
        descKn,
        inputsSummary || String(planRow.notes || ''),
        inputsSummary || String(planRow.notes || ''),
        chosenDate,
        chosenDate
      );

    const taskId = Number(taskInfo.lastInsertRowid);
    db.prepare(
      `UPDATE soil_plans SET added_calendar_id = ?, added_task_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(targetCalendarId, taskId, planId, req.auth!.uid);

    const task = db.prepare('SELECT * FROM calendar_tasks WHERE id = ?').get(taskId);
    const updatedPlan = parseSoilPlanRow(
      db.prepare('SELECT * FROM soil_plans WHERE id = ?').get(planId) as Record<string, unknown>
    );
    res.status(201).json({ task, calendar_id: targetCalendarId, plan: updatedPlan });
  });

  app.delete('/api/soil-plans/:id', requireAuth, (req: AuthedRequest, res) => {
    const result = db.prepare('DELETE FROM soil_plans WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth!.uid);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Saved soil plan not found.' });
    }
    res.json({ ok: true });
  });

  // ---------------- OFFLINE QUEUE SYNCHRONIZATION ----------------
  app.post('/api/sync', requireAuth, (req: AuthedRequest, res) => {
    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    const results: Array<{ id: string; status: 'applied' | 'skipped_conflict' | 'error'; reason?: string }> = [];

    for (const act of actions) {
      try {
        if (act.type === 'TASK_UPDATE') {
          const existing = db.prepare('SELECT id, updated_at FROM calendar_tasks WHERE id = ? AND user_id = ?').get(Number(act.payload.taskId), req.auth!.uid) as
            | { id: number; updated_at: string }
            | undefined;
          if (!existing) {
            results.push({ id: act.id, status: 'error', reason: 'Task not found' });
            continue;
          }
          const serverTime = new Date(existing.updated_at.replace(' ', 'T') + 'Z').getTime();
          const clientTime = Number(act.createdAt || 0);
          if (!Number.isNaN(serverTime) && serverTime > clientTime) {
            results.push({ id: act.id, status: 'skipped_conflict', reason: 'Newer server edit preserved' });
            continue;
          }
          const nextStatus =
            act.payload.status && ['pending', 'completed', 'missed'].includes(String(act.payload.status))
              ? String(act.payload.status)
              : null;
          const nextDue =
            typeof act.payload.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(act.payload.dueDate)
              ? act.payload.dueDate
              : null;
          const nextEnd =
            typeof act.payload.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(act.payload.endDate)
              ? act.payload.endDate
              : nextDue;

          db.prepare(
            `UPDATE calendar_tasks
             SET status = COALESCE(?, status),
                 notes = COALESCE(?, notes),
                 due_date = COALESCE(?, due_date),
                 end_date = COALESCE(?, end_date),
                 updated_at = datetime('now')
             WHERE id = ? AND user_id = ?`
          ).run(
            nextStatus,
            act.payload.notes ?? null,
            nextDue,
            nextEnd,
            Number(act.payload.taskId),
            req.auth!.uid
          );
          results.push({ id: act.id, status: 'applied' });
        } else if (act.type === 'CUSTOM_TASK') {
          const dup = db.prepare('SELECT id FROM calendar_tasks WHERE client_sync_id = ?').get(String(act.id));
          if (dup) {
            results.push({ id: act.id, status: 'applied' });
            continue;
          }
          db.prepare(
            `INSERT INTO calendar_tasks (calendar_id, user_id, stage_number, stage_key, title_en, title_kn, description_en, description_kn, due_date, end_date, status, reminder_enabled, is_custom, source_institution, client_sync_id)
             VALUES (?, ?, 99, 'custom_reminder', ?, ?, ?, ?, ?, ?, 'pending', 1, 1, 'Offline Synced Reminder', ?)`
          ).run(
            Number(act.payload.calendarId),
            req.auth!.uid,
            String(act.payload.title),
            String(act.payload.title),
            String(act.payload.description || ''),
            String(act.payload.description || ''),
            String(act.payload.dueDate),
            String(act.payload.dueDate),
            String(act.id)
          );
          results.push({ id: act.id, status: 'applied' });
        } else if (act.type === 'FIELD_NOTE') {
          const dup = db.prepare('SELECT id FROM field_notes WHERE client_sync_id = ?').get(String(act.id));
          if (dup) {
            results.push({ id: act.id, status: 'applied' });
            continue;
          }
          db.prepare('INSERT INTO field_notes (user_id, title, content, client_sync_id) VALUES (?, ?, ?, ?)').run(
            req.auth!.uid,
            String(act.payload.title),
            String(act.payload.content),
            String(act.id)
          );
          results.push({ id: act.id, status: 'applied' });
        } else if (act.type === 'SOIL_PLAN') {
          const dup = db.prepare('SELECT id FROM soil_plans WHERE client_sync_id = ?').get(String(act.id));
          if (dup) {
            results.push({ id: act.id, status: 'applied' });
            continue;
          }
          const cropCode = String(act.payload.crop_code || 'ragi').trim();
          const cropRow = db.prepare('SELECT name_en, name_kn FROM crops WHERE code = ?').get(cropCode) as
            | { name_en: string; name_kn: string }
            | undefined;
          const inputsArr = Array.isArray(act.payload.planned_inputs) ? act.payload.planned_inputs : [];
          const totalCost = inputsArr.reduce(
            (sum: number, it: Record<string, unknown>) => sum + Math.max(0, Number(it?.estimated_cost_inr) || 0),
            0
          );
          db.prepare(
            `INSERT INTO soil_plans (
              user_id, plot_name, crop_code, crop_name_en, crop_name_kn, crop_stage, soil_type,
              ph_level, n_status, p_status, k_status, area_acres, planned_inputs, total_estimated_cost_inr, notes, client_sync_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            req.auth!.uid,
            String(act.payload.plot_name || 'Main Plot'),
            cropCode,
            cropRow?.name_en ?? String(act.payload.crop_name_en || cropCode),
            cropRow?.name_kn ?? String(act.payload.crop_name_kn || cropCode),
            String(act.payload.crop_stage || 'Basal / Land Preparation'),
            String(act.payload.soil_type || 'Red Sandy Loam'),
            act.payload.ph_level === null || act.payload.ph_level === undefined || act.payload.ph_level === ''
              ? null
              : Number(act.payload.ph_level),
            String(act.payload.n_status || 'unknown'),
            String(act.payload.p_status || 'unknown'),
            String(act.payload.k_status || 'unknown'),
            Math.max(0.1, Number(act.payload.area_acres) || 1),
            JSON.stringify(inputsArr),
            Math.round(totalCost),
            String(act.payload.notes || ''),
            String(act.id)
          );
          results.push({ id: act.id, status: 'applied' });
        } else if (act.type === 'LEAF_ADD_TO_CALENDAR') {
          const dup = db.prepare('SELECT id FROM calendar_tasks WHERE client_sync_id = ?').get(String(act.id));
          if (dup) {
            results.push({ id: act.id, status: 'applied' });
            continue;
          }
          const scanId = Number(act.payload.scanId);
          const scan = db
            .prepare('SELECT * FROM leaf_scans WHERE id = ? AND user_id = ?')
            .get(scanId, req.auth!.uid) as Record<string, unknown> | undefined;
          if (!scan) {
            results.push({ id: act.id, status: 'error', reason: 'Saved leaf scan not found' });
            continue;
          }
          const targetCalendarId = resolveOrCreateUserCalendar(
            req.auth!.uid,
            String(scan.crop_code),
            act.payload.calendarId ? Number(act.payload.calendarId) : null,
            true
          );
          if (!targetCalendarId) {
            results.push({ id: act.id, status: 'error', reason: 'Could not resolve target calendar' });
            continue;
          }
          const dueDate =
            typeof act.payload.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(act.payload.dueDate)
              ? act.payload.dueDate
              : new Date().toISOString().slice(0, 10);
          const taskRes = db
            .prepare(
              `INSERT INTO calendar_tasks (
                calendar_id, user_id, stage_number, stage_key,
                title_en, title_kn, description_en, description_kn,
                inputs_en, inputs_kn, due_date, end_date,
                status, reminder_enabled, is_custom, source_institution, client_sync_id
              ) VALUES (?, ?, 98, 'leaf_scan_care', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1, 'Krishi Mitra Leaf Diagnosis (Offline Synced)', ?)`
            )
            .run(
              targetCalendarId,
              req.auth!.uid,
              String(scan.recommended_task_title_en),
              String(scan.recommended_task_title_kn),
              `${String(scan.recommended_task_description_en)} (${String(scan.rsk_confirmation_en)})`,
              `${String(scan.recommended_task_description_kn)} (${String(scan.rsk_confirmation_kn)})`,
              String(scan.fertilizer_guidance_en),
              String(scan.fertilizer_guidance_kn),
              dueDate,
              dueDate,
              String(act.id)
            );
          db.prepare('UPDATE leaf_scans SET added_calendar_id = ?, added_task_id = ? WHERE id = ? AND user_id = ?').run(
            targetCalendarId,
            Number(taskRes.lastInsertRowid),
            scanId,
            req.auth!.uid
          );
          results.push({ id: act.id, status: 'applied' });
        }
      } catch (err) {
        results.push({ id: act.id, status: 'error', reason: err instanceof Error ? err.message : 'Sync error' });
      }
    }

    res.json({ synced_at: new Date().toISOString(), results });
  });

  // ---------------- ADMIN CONSOLE ----------------
  app.use('/api/admin', requireAdmin);

  app.get('/api/admin/overview', requireAdmin, (_req: AuthedRequest, res) => {
    const farmers = db
      .prepare('SELECT id, name, identifier, email, phone, auth_provider, verification_status, role, district, taluk, village, farm_size_acres, soil_type, irrigation_type, created_at FROM users ORDER BY created_at DESC')
      .all();
    const shops = db.prepare('SELECT * FROM agro_shops ORDER BY CASE verification_status WHEN \'pending\' THEN 0 ELSE 1 END, id DESC').all();
    const rentals = db.prepare('SELECT * FROM equipment_rentals ORDER BY CASE verification_status WHEN \'pending\' THEN 0 ELSE 1 END, id DESC').all();
    const enquiries = db
      .prepare(
        `SELECT re.*, er.equipment_name FROM rental_enquiries re JOIN equipment_rentals er ON er.id = re.equipment_id ORDER BY re.created_at DESC LIMIT 30`
      )
      .all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 40').all();
    const weatherCacheCount = (db.prepare('SELECT COUNT(*) as c FROM weather_cache').get() as { c: number }).c;

    res.json({
      farmers,
      shops,
      rentals,
      enquiries,
      auditLogs,
      system: {
        weatherCacheCount,
        agmarknetApiKeyConfigured: Boolean(process.env.DATA_GOV_API_KEY),
        googleAuthConfigured: isGoogleAuthConfigured(),
        serverTime: new Date().toISOString(),
      },
    });
  });

  app.patch('/api/admin/shops/:id', requireAdmin, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { verification_status } = req.body ?? {};
    if (!['verified', 'pending', 'rejected'].includes(verification_status)) {
      return res.status(400).json({ error: 'Invalid verification status' });
    }
    const admin = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    const sourceLabel = verification_status === 'verified' ? 'Verified by Krishi Mitra Admin' : verification_status === 'rejected' ? 'Rejected by Admin' : 'Pending Review';
    db.prepare('UPDATE agro_shops SET verification_status = ?, source_label = ? WHERE id = ?').run(verification_status, sourceLabel, id);
    logAudit(req.auth!.uid, admin.name, `SHOP_${verification_status.toUpperCase()}`, 'agro_shops', id);
    res.json({ ok: true });
  });

  app.patch('/api/admin/rentals/:id', requireAdmin, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { verification_status, availability_status } = req.body ?? {};
    const admin = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    if (verification_status && ['verified', 'pending', 'rejected'].includes(verification_status)) {
      db.prepare('UPDATE equipment_rentals SET verification_status = ? WHERE id = ?').run(verification_status, id);
    }
    if (availability_status && ['confirmed', 'unconfirmed', 'booked'].includes(availability_status)) {
      db.prepare('UPDATE equipment_rentals SET availability_status = ? WHERE id = ?').run(availability_status, id);
    }
    logAudit(req.auth!.uid, admin.name, 'RENTAL_UPDATED', 'equipment_rentals', id, JSON.stringify({ verification_status, availability_status }));
    res.json({ ok: true });
  });

  app.post('/api/admin/market-prices', requireAdmin, (req: AuthedRequest, res) => {
    const { apmc_name, apmc_name_kn, district, crop_code, crop_name_en, crop_name_kn, variety, min_price, max_price, modal_price, reported_date, trend } = req.body ?? {};
    if (!apmc_name || !crop_code || !modal_price || !reported_date) {
      return res.status(400).json({ error: 'APMC name, crop code, modal price, and reporting date are required.' });
    }
    const admin = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    const info = db
      .prepare(
        `INSERT INTO market_prices (apmc_name, apmc_name_kn, district, crop_code, crop_name_en, crop_name_kn, variety, min_price, max_price, modal_price, reported_date, trend, source_name, data_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin Verified APMC Entry', 'admin_verified')`
      )
      .run(
        String(apmc_name),
        String(apmc_name_kn || apmc_name),
        String(district || 'Tumakuru'),
        String(crop_code),
        String(crop_name_en || crop_code),
        String(crop_name_kn || crop_code),
        String(variety || 'FAQ'),
        Number(min_price || modal_price),
        Number(max_price || modal_price),
        Number(modal_price),
        String(reported_date),
        String(trend || 'stable')
      );
    invalidateMarketCache();
    logAudit(req.auth!.uid, admin.name, 'MARKET_PRICE_ADDED', 'market_prices', Number(info.lastInsertRowid), `${apmc_name} ${crop_code} ₹${modal_price}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.post('/api/admin/schemes', requireAdmin, (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.code || !b.name_en || !b.name_kn || !b.official_url) {
      return res.status(400).json({ error: 'Scheme code, English/Kannada titles, and official URL are required.' });
    }
    const admin = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    const info = db
      .prepare(
        `INSERT INTO schemes (code, level, category, name_en, name_kn, description_en, description_kn, eligibility_en, eligibility_kn, benefits_en, benefits_kn, documents_en, documents_kn, application_process_en, application_process_kn, official_url, department, last_verified_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(b.code),
        String(b.level || 'Karnataka State'),
        String(b.category || 'Farmer Welfare'),
        String(b.name_en),
        String(b.name_kn),
        String(b.description_en || ''),
        String(b.description_kn || ''),
        String(b.eligibility_en || 'Verify eligibility on official portal'),
        String(b.eligibility_kn || 'ಅಧಿಕೃತ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಅರ್ಹತೆ ಪರಿಶೀಲಿಸಿ'),
        String(b.benefits_en || ''),
        String(b.benefits_kn || ''),
        String(b.documents_en || 'FRUITS ID, Aadhaar, RTC'),
        String(b.documents_kn || 'FRUITS ID, ಆಧಾರ್, ಪಹಣಿ'),
        String(b.application_process_en || 'Apply via official portal / RSK'),
        String(b.application_process_kn || 'ಅಧಿಕೃತ ಪೋರ್ಟಲ್ / RSK ಮೂಲಕ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ'),
        String(b.official_url),
        String(b.department || 'Department of Agriculture, Karnataka'),
        String(b.last_verified_date || new Date().toISOString().slice(0, 10)),
        String(b.status || 'active')
      );
    logAudit(req.auth!.uid, admin.name, 'SCHEME_ADDED', 'schemes', Number(info.lastInsertRowid), String(b.name_en));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.post('/api/admin/locations', requireAdmin, (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.district || !b.taluk || !b.hobli || !b.village) {
      return res.status(400).json({ error: 'District, taluk, hobli, and village are required.' });
    }
    const admin = db.prepare('SELECT name FROM users WHERE id = ?').get(req.auth!.uid) as { name: string };
    const info = db
      .prepare(
        `INSERT INTO locations (district, district_kn, taluk, taluk_kn, hobli, hobli_kn, village, village_kn, agro_zone, agro_zone_kn, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(b.district),
        String(b.district_kn || b.district),
        String(b.taluk),
        String(b.taluk_kn || b.taluk),
        String(b.hobli),
        String(b.hobli_kn || b.hobli),
        String(b.village),
        String(b.village_kn || b.village),
        String(b.agro_zone || 'Central Dry Zone'),
        String(b.agro_zone_kn || 'ಮಧ್ಯ ಒಣ ವಲಯ'),
        Number(b.latitude ?? 13.741),
        Number(b.longitude ?? 76.904)
      );
    logAudit(req.auth!.uid, admin.name, 'LOCATION_ADDED', 'locations', Number(info.lastInsertRowid), `${b.district} > ${b.taluk} > ${b.village}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Krishi Mitra server running on http://0.0.0.0:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
