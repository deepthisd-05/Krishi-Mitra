import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../server.ts';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../src/server/auth.ts';
import { generateHyperlocalSchedule, type CropRow } from '../src/server/cropEngine.ts';
import { db } from '../src/server/db.ts';
import { verifyGoogleIdToken } from '../src/server/googleAuth.ts';
import {
  getKarnatakaMarketPrices,
  invalidateMarketCache,
  parseMaiKisaanHtml,
} from '../src/server/marketService.ts';
import { buildAgriculturalAlerts } from '../src/server/weatherService.ts';
import { getStageFertilizerSuggestions } from '../src/server/soilGuidance.ts';
import {
  describeCameraError,
  stopMediaStream,
} from '../src/lib/camera.ts';
import { scaleDimensions } from '../src/lib/imageUtils.ts';
import {
  buildGoogleMapsSearchUrl,
  buildMapPopupHtml,
  describeGeolocationError,
  formatShopCopyText,
  haversineDistanceKm,
} from '../src/lib/geolocation.ts';
import {
  describeMissingTtsVoice,
  describeSpeechError,
  getSpeechLocale,
  resolveUtteranceLang,
  selectSpeechVoice,
  speakTextWithSpeechSynthesis,
} from '../src/lib/speech.ts';

const app = createApp();
let server: http.Server;
let baseUrl = '';

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Password hashing and signed session tokens verify correctly', () => {
  const hash = hashPassword('sira2026');
  assert.equal(verifyPassword('sira2026', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);

  const token = signToken(42, 'farmer');
  const decoded = verifyToken(token);
  assert.ok(decoded);
  assert.equal(decoded.uid, 42);
  assert.equal(decoded.role, 'farmer');
});

test('Karnataka location hierarchy and Sira pilot villages are seeded', async () => {
  const resp = await fetch(`${baseUrl}/api/locations`);
  assert.equal(resp.status, 200);
  const body = (await resp.json()) as { locations: Array<{ district: string; taluk: string; hobli: string; village: string }> };
  assert.ok(body.locations.length >= 15);
  const siraVillages = body.locations.filter((l) => l.district === 'Tumakuru' && l.taluk === 'Sira');
  assert.ok(siraVillages.length >= 5);
  assert.ok(siraVillages.some((l) => l.hobli === 'Kallambella'));
});

test('12 Karnataka crops each have 12 verified stages and source attribution', async () => {
  const resp = await fetch(`${baseUrl}/api/crops`);
  assert.equal(resp.status, 200);
  const body = (await resp.json()) as { crops: Array<{ code: string; stages: unknown[]; source_institution: string }> };
  assert.equal(body.crops.length, 12);
  for (const c of body.crops) {
    assert.equal(c.stages.length, 12, `Expected 12 stages for ${c.code}`);
    assert.ok(c.source_institution.length > 5);
  }
});

test('Crop calendar engine adapts schedules and flags rainfed paddy limitation', () => {
  const paddy = db.prepare('SELECT * FROM crops WHERE code = ?').get('paddy') as unknown as CropRow;
  const result = generateHyperlocalSchedule({
    crop: paddy,
    variety: 'Sona Masuri (BPT-5204)',
    season: 'Kharif (Mungaru)',
    soilType: 'Red Sandy Loam',
    irrigationType: 'Rainfed',
    sowingDate: '2026-07-01',
    district: 'Tumakuru',
    taluk: 'Sira',
    agroZone: 'Central Dry Zone',
  });
  assert.equal(result.tasks.length, 12);
  assert.equal(result.data_coverage, 'partial_adaptation');
  assert.match(result.limitation_note_en, /NOT recommended under purely rainfed/i);
});

test('Auth registration, login, calendar creation, and offline sync deduplication work end-to-end', async () => {
  const uniqueUser = `farmer_${Date.now()}`;
  const regResp = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Sira Farmer',
      identifier: uniqueUser,
      password: 'password123',
      preferred_lang: 'kn',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(regResp.status, 201);
  const regData = (await regResp.json()) as { token: string; user: { id: number; role: string } };
  assert.ok(regData.token);
  assert.equal(regData.user.role, 'farmer');

  // Create calendar
  const calResp = await fetch(`${baseUrl}/api/calendars`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regData.token}`,
    },
    body: JSON.stringify({
      crop_code: 'groundnut',
      variety: 'TMV-2',
      season: 'Kharif (Mungaru)',
      soil_type: 'Red Sandy Loam',
      irrigation_type: 'Rainfed',
      sowing_date: '2026-07-10',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(calResp.status, 201);
  const calData = (await calResp.json()) as { calendar: { id: number; tasks: Array<{ id: number }> } };
  assert.equal(calData.calendar.tasks.length, 12);

  // Offline sync queue idempotency test
  const syncId = `sync-test-${Date.now()}`;
  const syncPayload = {
    actions: [
      {
        id: syncId,
        type: 'FIELD_NOTE',
        createdAt: Date.now(),
        payload: { title: 'Rain check', content: '25mm rain in Kallambella' },
      },
    ],
  };
  const sync1 = await fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
    body: JSON.stringify(syncPayload),
  });
  const s1Body = (await sync1.json()) as { results: Array<{ status: string }> };
  assert.equal(s1Body.results[0].status, 'applied');

  // Re-sending same offline sync action must not fail or duplicate
  const sync2 = await fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
    body: JSON.stringify(syncPayload),
  });
  const s2Body = (await sync2.json()) as { results: Array<{ status: string }> };
  assert.equal(s2Body.results[0].status, 'applied');

  const notesResp = await fetch(`${baseUrl}/api/notes`, {
    headers: { Authorization: `Bearer ${regData.token}` },
  });
  const notesBody = (await notesResp.json()) as { notes: Array<{ title: string }> };
  assert.equal(notesBody.notes.filter((n) => n.title === 'Rain check').length, 1);
});

test('Unauthenticated and non-admin callers receive 403 Forbidden on all /api/admin/* routes while authenticated admin succeeds', async () => {
  const adminRequests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [
    { method: 'GET', path: '/api/admin/overview' },
    { method: 'PATCH', path: '/api/admin/shops/1', body: { verification_status: 'verified' } },
    { method: 'PATCH', path: '/api/admin/rentals/1', body: { verification_status: 'verified' } },
    { method: 'POST', path: '/api/admin/market-prices', body: { apmc_name: 'Sira APMC', crop_code: 'ragi', modal_price: 3800, reported_date: '2026-11-18' } },
    { method: 'POST', path: '/api/admin/schemes', body: { code: 'test', name_en: 'Test', name_kn: 'ಟೆಸ್ಟ್', official_url: 'https://example.gov.in' } },
    { method: 'POST', path: '/api/admin/locations', body: { district: 'Tumakuru', taluk: 'Sira', hobli: 'Kasaba', village: 'Test' } },
    { method: 'GET', path: '/api/admin/nonexistent' },
  ];

  // 1. Unauthenticated requests must receive 403 Forbidden
  for (const r of adminRequests) {
    const resp = await fetch(`${baseUrl}${r.path}`, {
      method: r.method,
      headers: r.body ? { 'Content-Type': 'application/json' } : undefined,
      body: r.body ? JSON.stringify(r.body) : undefined,
    });
    assert.equal(resp.status, 403, `Expected 403 for unauthenticated ${r.method} ${r.path}`);
  }

  // 2. Authenticated farmer must receive 403 Forbidden on all /api/admin/* routes
  const farmerLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'ramesh.sira', password: 'farmer123' }),
  });
  const { token: farmerToken, user: farmerUser } = (await farmerLogin.json()) as { token: string; user: { id: number; role: string } };
  assert.equal(farmerUser.role, 'farmer');

  for (const r of adminRequests) {
    const resp = await fetch(`${baseUrl}${r.path}`, {
      method: r.method,
      headers: {
        Authorization: `Bearer ${farmerToken}`,
        ...(r.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: r.body ? JSON.stringify(r.body) : undefined,
    });
    assert.equal(resp.status, 403, `Expected 403 for farmer ${r.method} ${r.path}`);
  }

  // 3. Even if a token payload claims role='admin', SQLite users.role must be checked and reject with 403
  const mismatchedToken = signToken(farmerUser.id, 'admin');
  const mismatchResp = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${mismatchedToken}` },
  });
  assert.equal(mismatchResp.status, 403);

  // 4. Authenticated admin succeeds
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin.krishi', password: 'admin123' }),
  });
  assert.equal(adminLogin.status, 200);
  const { token: adminToken, user: adminUser } = (await adminLogin.json()) as { token: string; user: { role: string } };
  assert.equal(adminUser.role, 'admin');

  const adminOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminOverview.status, 200);
});

test('Farmer shop and rental directories exclude sample/demo moderation labels and isolate unapproved submissions', async () => {
  // Public directory has no Sample/Demo labels
  const pubShopsResp = await fetch(`${baseUrl}/api/shops?include_pending=1`);
  assert.equal(pubShopsResp.status, 200);
  const pubShops = (await pubShopsResp.json()) as {
    shops: Array<{ name: string; name_kn: string; source_label: string; verification_status: string }>;
  };
  assert.ok(pubShops.shops.length >= 3);
  for (const s of pubShops.shops) {
    assert.equal(s.verification_status, 'verified');
    assert.doesNotMatch(`${s.name} ${s.name_kn} ${s.source_label}`, /sample|demo|ಮಾದರಿ|unverified/i);
  }

  const pubRentalsResp = await fetch(`${baseUrl}/api/rentals`);
  assert.equal(pubRentalsResp.status, 200);
  const pubRentals = (await pubRentalsResp.json()) as {
    rentals: Array<{ owner_name: string; verification_status: string }>;
  };
  assert.ok(pubRentals.rentals.length >= 3);
  for (const r of pubRentals.rentals) {
    assert.equal(r.verification_status, 'verified');
    assert.doesNotMatch(r.owner_name, /sample|demo/i);
  }

  // A pending shop submitted by farmer A is NOT leaked to other farmers/public views
  const farmerALogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'ramesh.sira', password: 'farmer123' }),
  });
  const { token: farmerAToken } = (await farmerALogin.json()) as { token: string };
  const secretShopName = `Hidden Pending Shop ${Date.now()}`;
  const submitResp = await fetch(`${baseUrl}/api/shops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${farmerAToken}`,
    },
    body: JSON.stringify({
      name: secretShopName,
      address: 'Sira Road',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(submitResp.status, 201);
  const createdShop = (await submitResp.json()) as { shop: { id: number } };

  try {
    const publicCheck = await fetch(`${baseUrl}/api/shops?include_pending=1`);
    const publicList = (await publicCheck.json()) as { shops: Array<{ name: string }> };
    assert.equal(publicList.shops.some((s) => s.name === secretShopName), false);
  } finally {
    db.prepare('DELETE FROM agro_shops WHERE id = ?').run(createdShop.shop.id);
  }
});

test('Market feed parser extracts live Karnataka APMC prices, source, and exact reporting date', () => {
  const sampleHtml = `
    <h1>Ragi Mandi Bhav Karnataka</h1>
    <div>vs 7-day avg +4.5%</div>
    <table class="k-tbl">
      <tbody>
        <tr>
          <td class="k-l"><span class="k-mkt">Tumakuru APMC</span><span class="k-small">Tumakuru, Karnataka · GPU-28</span></td>
          <td class="k-hide-sm">GPU-28</td>
          <td class="k-hide-sm">FAQ</td>
          <td class="k-hide-sm">₹3,400</td>
          <td class="k-hide-sm">₹3,950</td>
          <td class="k-b">₹3,720</td>
          <td class="k-k">₹37.2</td>
        </tr>
      </tbody>
    </table>
    <p>All prices are for 18 Nov 2026.</p>
  `;
  const parsed = parseMaiKisaanHtml(sampleHtml, {
    url: 'https://www.maikisaan.com/mandi-bhav/ragi/karnataka/',
    kind: 'commodity',
    cropCode: 'ragi',
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].apmc_name, 'Tumakuru APMC');
  assert.equal(parsed[0].district, 'Tumakuru');
  assert.equal(parsed[0].modal_price, 3720);
  assert.equal(parsed[0].reported_date, '2026-11-18');
  assert.equal(parsed[0].trend, 'up');
  assert.equal(parsed[0].data_mode, 'live');
  assert.match(parsed[0].source_name, /Mai Kisaan/i);
});

test('Market service transparently labels stored rows as fallback when external feed is unreachable', async () => {
  invalidateMarketCache();
  const failingFetch = (async () => {
    throw new Error('Network unreachable');
  }) as unknown as typeof fetch;

  const res = await getKarnatakaMarketPrices({ forceRefresh: true, fetchImpl: failingFetch });
  assert.equal(res.feed_status, 'fallback');
  assert.ok(res.error_message);
  assert.ok(res.prices.length > 0);
  for (const row of res.prices) {
    assert.notEqual(row.data_mode, 'live');
    assert.ok(row.reported_date.length >= 8);
    assert.ok(row.source_name.length > 5);
  }
  assert.ok(res.prices.some((p) => p.data_mode === 'fallback'));
});

test('GET /api/market-prices returns live/cached Karnataka prices with source and reporting dates without requiring data.gov.in key', async () => {
  invalidateMarketCache();
  const resp = await fetch(`${baseUrl}/api/market-prices`);
  assert.equal(resp.status, 200);
  const body = (await resp.json()) as {
    feed_status: string;
    provider: string;
    last_updated: string;
    prices: Array<{ apmc_name: string; reported_date: string; source_name: string; data_mode: string; modal_price: number }>;
  };
  assert.ok(['live', 'cached', 'fallback'].includes(body.feed_status));
  assert.ok(body.provider.length > 5);
  assert.ok(body.last_updated);
  assert.ok(body.prices.length > 0);
  for (const p of body.prices) {
    assert.ok(p.reported_date);
    assert.ok(p.source_name);
    assert.ok(p.modal_price > 0);
  }
});

test('Speech utilities enforce kn-IN for Kannada and never fall back to hi-IN', () => {
  assert.equal(getSpeechLocale('kn'), 'kn-IN');
  assert.equal(getSpeechLocale('en'), 'en-IN');

  const voicesWithHindiFirst = [
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Microsoft Ravi - English (India)', lang: 'en-IN' },
    { name: 'Google ಕನ್ನಡ', lang: 'kn-IN' },
  ];
  const knPicked = selectSpeechVoice(voicesWithHindiFirst, 'kn');
  assert.ok(knPicked);
  assert.equal(knPicked.lang, 'kn-IN');

  const enPicked = selectSpeechVoice(voicesWithHindiFirst, 'en');
  assert.ok(enPicked);
  assert.equal(enPicked.lang, 'en-IN');

  // When Kannada voice is unavailable, must return null rather than picking hi-IN or en-IN
  const voicesWithoutKannada = [
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Microsoft Ravi - English (India)', lang: 'en-IN' },
    { name: 'Google US English', lang: 'en-US' },
  ];
  assert.equal(selectSpeechVoice(voicesWithoutKannada, 'kn'), null);

  // Utterance language resolution forces Kannada in kn mode or for Kannada script
  assert.equal(resolveUtteranceLang('Ragi price', 'kn'), 'kn');
  assert.equal(resolveUtteranceLang('ರಾಗಿ ಬೆಲೆ', 'en'), 'kn');
  assert.equal(resolveUtteranceLang('Ragi price', 'en'), 'en');
});

test('Read Aloud speechSynthesis sets kn-IN in Kannada mode and handles missing kn-IN voice without hi-IN', () => {
  const spokenUtterances: Array<{ text: string; lang: string; voice: { lang: string; name: string } | null }> = [];
  let mockVoices: Array<{ name: string; lang: string }> = [
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Google ಕನ್ನಡ', lang: 'kn-IN' },
  ];

  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevUtterance = (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;

  class MockUtterance {
    text: string;
    lang = '';
    rate = 1;
    voice: { lang: string; name: string } | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((ev: { error: string }) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }

  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = MockUtterance;
  (globalThis as Record<string, unknown>).window = {
    speechSynthesis: {
      speaking: false,
      pending: false,
      cancel: () => {},
      getVoices: () => mockVoices,
      speak: (u: MockUtterance) => {
        spokenUtterances.push({ text: u.text, lang: u.lang, voice: u.voice });
      },
    },
  };

  try {
    const resWithKn = speakTextWithSpeechSynthesis({ text: 'ನಮಸ್ಕಾರ ರೈತರೇ', lang: 'kn' });
    assert.equal(resWithKn.started, true);
    assert.equal(resWithKn.locale, 'kn-IN');
    assert.equal(resWithKn.voiceLang, 'kn-IN');
    assert.equal(resWithKn.missingTargetVoice, false);
    assert.equal(spokenUtterances[0].lang, 'kn-IN');
    assert.equal(spokenUtterances[0].voice?.lang, 'kn-IN');

    // Now test without any Kannada voice installed — must still use kn-IN, never hi-IN, and flag missingTargetVoice
    mockVoices = [
      { name: 'Google हिन्दी', lang: 'hi-IN' },
      { name: 'Google English (India)', lang: 'en-IN' },
    ];
    const resWithoutKn = speakTextWithSpeechSynthesis({ text: 'ನಮಸ್ಕಾರ ರೈತರೇ', lang: 'kn' });
    assert.equal(resWithoutKn.started, true);
    assert.equal(resWithoutKn.locale, 'kn-IN');
    assert.equal(resWithoutKn.voiceLang, null);
    assert.equal(resWithoutKn.missingTargetVoice, true);
    assert.equal(resWithoutKn.voicesLoadedCount, 2);
    assert.equal(spokenUtterances[1].lang, 'kn-IN');
    assert.equal(spokenUtterances[1].voice, null);

    const missingKnInfo = describeMissingTtsVoice('kn', resWithoutKn.voicesLoadedCount);
    assert.equal(missingKnInfo.locale, 'kn-IN');
    assert.match(missingKnInfo.message, /hi-IN/);
    assert.ok(missingKnInfo.steps.some((s) => /Android/i.test(s) && /Kannada/i.test(s)));
  } finally {
    if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWindow;
    if (prevUtterance === undefined) delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
    else (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = prevUtterance;
  }
});

test('Speech error mapper provides actionable iframe/mobile permission guidance', () => {
  const iframeBlockedKn = describeSpeechError('not-allowed', 'kn', true);
  assert.equal(iframeBlockedKn.isPermissionIssue, true);
  assert.equal(iframeBlockedKn.suggestOpenTab, true);
  assert.match(iframeBlockedKn.message, /iframe|ಮೈಕ್ರೋಫೋನ್/);

  const unsupportedEn = describeSpeechError('unsupported', 'en', true);
  assert.equal(unsupportedEn.suggestOpenTab, true);
  assert.match(unsupportedEn.message, /text input|quick prompts/i);
});

test('Auth config reports Google setup status when GOOGLE_CLIENT_ID is unset and rejects /api/auth/google cleanly', async () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevViteId = process.env.VITE_GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.VITE_GOOGLE_CLIENT_ID;

  try {
    const cfgResp = await fetch(`${baseUrl}/api/auth/config`);
    assert.equal(cfgResp.status, 200);
    const cfg = (await cfgResp.json()) as { googleConfigured: boolean; googleClientId: string | null };
    assert.equal(cfg.googleConfigured, false);
    assert.equal(cfg.googleClientId, null);

    const gResp = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'dummy.jwt.token' }),
    });
    assert.equal(gResp.status, 503);
    const errBody = (await gResp.json()) as { code: string; error: string };
    assert.equal(errBody.code, 'GOOGLE_NOT_CONFIGURED');
    assert.match(errBody.error, /GOOGLE_CLIENT_ID/);
  } finally {
    if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevViteId !== undefined) process.env.VITE_GOOGLE_CLIENT_ID = prevViteId;
  }
});

test('Google RS256 ID token verifier and POST /api/auth/google persist real verified SQLite user accounts', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  jwk.kid = 'test-google-kid-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const clientId = '1234567890-test.apps.googleusercontent.com';
  const email = `google_farmer_${Date.now()}@example.com`;
  const sub = `google-sub-${Date.now()}`;

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-google-kid-1', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub,
      email,
      email_verified: true,
      name: 'Siddharth Kulkarni',
      picture: 'https://lh3.googleusercontent.com/test-avatar',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const sigB64 = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), privateKey).toString('base64url');
  const idToken = `${headerB64}.${payloadB64}.${sigB64}`;

  const mockJwksFetch = (async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

  const claims = await verifyGoogleIdToken(idToken, clientId, { fetchImpl: mockJwksFetch });
  assert.equal(claims.email, email);
  assert.equal(claims.sub, sub);
  assert.equal(claims.emailVerified, true);

  // Also reject wrong audience
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, 'wrong-client-id', { fetchImpl: mockJwksFetch }),
    /audience/i
  );

  const prevClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = clientId;
  const gApp = createApp({
    googleVerifier: (cred, expAud) => verifyGoogleIdToken(cred, expAud, { fetchImpl: mockJwksFetch }),
  });
  let gServer: http.Server | null = null;

  try {
    const gUrl = await new Promise<string>((resolve) => {
      gServer = gApp.listen(0, '127.0.0.1', () => {
        const addr = gServer!.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    const cfgResp = await fetch(`${gUrl}/api/auth/config`);
    const cfg = (await cfgResp.json()) as { googleConfigured: boolean; googleClientId: string };
    assert.equal(cfg.googleConfigured, true);
    assert.equal(cfg.googleClientId, clientId);

    const authResp = await fetch(`${gUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: idToken, preferred_lang: 'kn' }),
    });
    assert.equal(authResp.status, 200);
    const authData = (await authResp.json()) as {
      token: string;
      auth_method: string;
      user: { id: number; email: string; auth_provider: string; verification_status: string; name: string };
    };
    assert.equal(authData.auth_method, 'google');
    assert.equal(authData.user.email, email);
    assert.equal(authData.user.auth_provider, 'google');
    assert.equal(authData.user.verification_status, 'verified');
    assert.equal(authData.user.name, 'Siddharth Kulkarni');

    // Check /api/auth/me returns same SQLite user
    const meResp = await fetch(`${gUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authData.token}` },
    });
    assert.equal(meResp.status, 200);
    const meBody = (await meResp.json()) as { user: { id: number; email: string } };
    assert.equal(meBody.user.id, authData.user.id);
    assert.equal(meBody.user.email, email);
  } finally {
    if (prevClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevClientId;
    if (gServer) {
      await new Promise<void>((resolve) => gServer!.close(() => resolve()));
    }
  }
});

test('Real-time verification state validates codes server-side with expiry, attempt limits, SSE stream, and session revocation', async () => {
  const phone = `98${String(Date.now()).slice(-8)}`;
  const regResp = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Basavaraj S.',
      identifier: phone,
      password: 'fieldpass2026',
      preferred_lang: 'kn',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(regResp.status, 201);
  const regBody = (await regResp.json()) as {
    token: string;
    user: { id: number; phone: string; verification_status: string };
    verification: { status: string; attemptsRemaining: number };
    issuedCode: string;
  };
  assert.equal(regBody.user.phone, phone);
  assert.equal(regBody.user.verification_status, 'pending');
  assert.equal(regBody.verification.status, 'pending');
  assert.match(regBody.issuedCode, /^\d{6}$/);

  // Connect to SSE real-time stream and collect live status frames
  const controller = new AbortController();
  const sseResp = await fetch(`${baseUrl}/api/auth/verification/stream?identifier=${encodeURIComponent(phone)}`, {
    signal: controller.signal,
  });
  assert.equal(sseResp.status, 200);
  const reader = sseResp.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';

  const readUntilMatch = async (pattern: RegExp) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (pattern.test(sseBuffer)) return;
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
    }
    assert.match(sseBuffer, pattern);
  };

  await readUntilMatch(/"status":"pending"/);

  // Wrong code decrements attemptsRemaining
  const wrongCode = regBody.issuedCode === '000000' ? '111111' : '000000';
  const badVerify = await fetch(`${baseUrl}/api/auth/verification/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: phone, code: wrongCode }),
  });
  assert.equal(badVerify.status, 400);
  const badBody = (await badVerify.json()) as { verification: { attemptsRemaining: number } };
  assert.equal(badBody.verification.attemptsRemaining, 4);

  // Valid code verifies account in SQLite and broadcasts verified state over SSE
  const goodVerify = await fetch(`${baseUrl}/api/auth/verification/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: phone, code: regBody.issuedCode }),
  });
  assert.equal(goodVerify.status, 200);
  const goodBody = (await goodVerify.json()) as {
    verified: boolean;
    user: { verification_status: string };
    verification: { status: string };
  };
  assert.equal(goodBody.verified, true);
  assert.equal(goodBody.user.verification_status, 'verified');
  assert.equal(goodBody.verification.status, 'verified');

  await readUntilMatch(/"status":"verified"/);
  controller.abort();

  // Expired challenge returns 410 Gone
  const expirePhone = `97${String(Date.now()).slice(-8)}`;
  const expSend = await fetch(`${baseUrl}/api/auth/verification/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: expirePhone, expirySeconds: 1 }),
  });
  const expData = (await expSend.json()) as { issuedCode: string };
  await new Promise((r) => setTimeout(r, 1100));
  const expVerify = await fetch(`${baseUrl}/api/auth/verification/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: expirePhone, code: expData.issuedCode }),
  });
  assert.equal(expVerify.status, 410);

  // Logout revokes session token cleanly
  const logoutResp = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${regBody.token}` },
  });
  assert.equal(logoutResp.status, 200);

  const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${regBody.token}` },
  });
  assert.equal(meAfterLogout.status, 401);
});

test('Leaf Disease Detection requires auth, reports 503 GEMINI_NOT_CONFIGURED when key missing, persists scans per user, and adds care step to Crop Calendar', async () => {
  const sampleDataUrl =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof';

  // 1. Unauthenticated callers cannot access leaf scan endpoints
  const unauthGet = await fetch(`${baseUrl}/api/leaf-scans`);
  assert.equal(unauthGet.status, 401);

  const unauthPost = await fetch(`${baseUrl}/api/leaf-scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crop_code: 'tomato', image_data_url: sampleDataUrl }),
  });
  assert.equal(unauthPost.status, 401);

  // 2. When GEMINI_API_KEY is unset, real analyzer returns 503 GEMINI_NOT_CONFIGURED (never fabricates fake result)
  const farmerA = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Leaf Farmer A',
      identifier: `leaf_a_${Date.now()}`,
      password: 'password123',
      preferred_lang: 'kn',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(farmerA.status, 201);
  const { token: tokenA, user: userA } = (await farmerA.json()) as { token: string; user: { id: number } };

  const farmerB = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Leaf Farmer B',
      identifier: `leaf_b_${Date.now()}`,
      password: 'password123',
      preferred_lang: 'en',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(farmerB.status, 201);
  const { token: tokenB } = (await farmerB.json()) as { token: string };

  const prevGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const missingKeyResp = await fetch(`${baseUrl}/api/leaf-scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ crop_code: 'tomato', image_data_url: sampleDataUrl }),
    });
    assert.equal(missingKeyResp.status, 503);
    const missingBody = (await missingKeyResp.json()) as { code: string; error: string };
    assert.equal(missingBody.code, 'GEMINI_NOT_CONFIGURED');
    assert.match(missingBody.error, /GEMINI_API_KEY/);
  } finally {
    if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
  }

  // 3. With injected leafAnalyzer, analyze + save + isolate + add-to-calendar + delete
  const mockApp = createApp({
    leafAnalyzer: async (input) => {
      assert.equal(input.cropCode, 'groundnut');
      assert.equal(input.fieldNotes, 'Yellowing on lower leaves after rain');
      return {
        condition_name_en: 'Early Leaf Spot (Tikka) & Mild Nitrogen Deficiency',
        condition_name_kn: 'ಎಲೆ ಚುಕ್ಕೆ ರೋಗ (ಟಿಕ್ಕಾ) ಮತ್ತು ಲಘು ಸಾರಜನಕ ಕೊರತೆ',
        category: 'fungal',
        severity: 'moderate',
        confidence_level: 'medium',
        confidence_pct: 76,
        confidence_notes_en: 'Concentric dark spots indicate early Tikka; slight chlorosis may overlap with leached nitrogen.',
        confidence_notes_kn: 'ಕಂದು ಚುಕ್ಕೆಗಳು ಆರಂಭಿಕ ಟಿಕ್ಕಾ ರೋಗವನ್ನು ಸೂಚಿಸುತ್ತವೆ; ಮಳೆಯಿಂದ ಸಾರಜನಕ ಕೊರತೆಯೂ ಇರಬಹುದು.',
        visible_symptoms_en: 'Dark brown circular lesions surrounded by a yellow halo on lower leaflets.',
        visible_symptoms_kn: 'ಕೆಳಗಿನ ಎಲೆಗಳ ಮೇಲೆ ಹಳದಿ ಅಂಚಿನ ಕಡು ಕಂದು ಬಣ್ಣದ ವೃತ್ತಾಕಾರದ ಚುಕ್ಕೆಗಳು.',
        fertilizer_guidance_en: 'Apply 10 kg/acre MOP and foliar 1% Urea or 19:19:19 (5 g/L water) after leaf spot settles.',
        fertilizer_guidance_kn: 'ಎಕರೆಗೆ 10 ಕೆಜಿ ಎಂಒಪಿ ಹಾಗೂ ಎಲೆ ಚುಕ್ಕೆ ನಿಯಂತ್ರಣವಾದ ನಂತರ 19:19:19 (ಲೀಟರ್‌ಗೆ 5 ಗ್ರಾಂ) ಸಿಂಪಡಿಸಿ.',
        spray_care_guidance_en: 'Remove badly spotted lower leaves; spray in calm morning hours and avoid overhead sprinkling.',
        spray_care_guidance_kn: 'ತೀವ್ರ ಸೋಂಕಿತ ಕೆಳ ಎಲೆಗಳನ್ನು ತೆಗೆಯಿರಿ; ಬೆಳಿಗ್ಗೆ ತಂಪಾದ ಸಮಯದಲ್ಲಿ ಸಿಂಪಡಿಸಿ.',
        rsk_confirmation_en: 'Confirm exact fungicide molecule and per-litre dosage with your Sira Raitha Samparka Kendra before spraying.',
        rsk_confirmation_kn: 'ಸಿಂಪಡಿಸುವ ಮೊದಲು ಸಿರಾ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರದ ಕೃಷಿ ಅಧಿಕಾರಿಗಳಿಂದ ನಿಖರ ಪ್ರಮಾಣವನ್ನು ದೃಢಪಡಿಸಿ.',
        recommended_task_title_en: 'Groundnut Tikka check & RSK-verified foliar nutrition',
        recommended_task_title_kn: 'ಶೇಂಗಾ ಎಲೆ ಚುಕ್ಕೆ ಪರಿಶೀಲನೆ ಮತ್ತು ಆರ್‌ಎಸ್‌ಕೆ ದೃಢೀಕೃತ ಪೋಷಕಾಂಶ',
        recommended_task_description_en: 'Remove infected lower leaves, consult RSK before spraying, and support crop with balanced potash.',
        recommended_task_description_kn: 'ಸೋಂಕಿತ ಎಲೆಗಳನ್ನು ತೆಗೆದು, ಆರ್‌ಎಸ್‌ಕೆ ಸಲಹೆಯಂತೆ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ.',
        recommended_days_offset: 2,
        model_used: 'gemini-4-hydrogen',
      };
    },
  });

  let mServer: http.Server | null = null;
  try {
    const mUrl = await new Promise<string>((resolve) => {
      mServer = mockApp.listen(0, '127.0.0.1', () => {
        const addr = mServer!.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    // Invalid image fails with 400
    const badImg = await fetch(`${mUrl}/api/leaf-scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ crop_code: 'groundnut', image_data_url: 'not-an-image' }),
    });
    assert.equal(badImg.status, 400);

    // Valid scan persists to SQLite
    const createResp = await fetch(`${mUrl}/api/leaf-scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        crop_code: 'groundnut',
        image_data_url: sampleDataUrl,
        field_notes: 'Yellowing on lower leaves after rain',
      }),
    });
    assert.equal(createResp.status, 201);
    const createdBody = (await createResp.json()) as {
      scan: { id: number; user_id: number; crop_code: string; condition_name_en: string; confidence_pct: number };
    };
    assert.equal(createdBody.scan.user_id, userA.id);
    assert.equal(createdBody.scan.crop_code, 'groundnut');
    assert.equal(createdBody.scan.confidence_pct, 76);

    const scanId = createdBody.scan.id;

    // User A sees the scan, User B does NOT
    const listA = await fetch(`${mUrl}/api/leaf-scans`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const listABody = (await listA.json()) as { scans: Array<{ id: number }> };
    assert.equal(listABody.scans.some((s) => s.id === scanId), true);

    const listB = await fetch(`${mUrl}/api/leaf-scans`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const listBBody = (await listB.json()) as { scans: Array<{ id: number }> };
    assert.equal(listBBody.scans.some((s) => s.id === scanId), false);

    // User B cannot add User A's scan to calendar or delete it
    const bCalAttempt = await fetch(`${mUrl}/api/leaf-scans/${scanId}/add-to-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ due_date: '2026-11-22' }),
    });
    assert.equal(bCalAttempt.status, 404);

    const bDelAttempt = await fetch(`${mUrl}/api/leaf-scans/${scanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(bDelAttempt.status, 404);

    // User A adds the recommended care/fertilizer step to Crop Calendar (auto-creates groundnut calendar + task)
    const addCalResp = await fetch(`${mUrl}/api/leaf-scans/${scanId}/add-to-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ due_date: '2026-11-22', auto_create_calendar: true }),
    });
    assert.equal(addCalResp.status, 201);
    const addCalBody = (await addCalResp.json()) as {
      calendar_id: number;
      task: { id: number; due_date: string; stage_key: string; title_en: string };
      scan: { added_calendar_id: number; added_task_id: number };
    };
    assert.ok(addCalBody.calendar_id > 0);
    assert.equal(addCalBody.task.due_date, '2026-11-22');
    assert.equal(addCalBody.task.stage_key, 'leaf_scan_care');
    assert.equal(addCalBody.scan.added_calendar_id, addCalBody.calendar_id);
    assert.equal(addCalBody.scan.added_task_id, addCalBody.task.id);

    // Confirm task exists on /api/calendars for User A
    const calsResp = await fetch(`${mUrl}/api/calendars`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const calsBody = (await calsResp.json()) as {
      calendars: Array<{ id: number; crop_code: string; tasks: Array<{ id: number; stage_key: string }> }>;
    };
    const matchedCal = calsBody.calendars.find((c) => c.id === addCalBody.calendar_id);
    assert.ok(matchedCal);
    assert.equal(matchedCal.crop_code, 'groundnut');
    assert.equal(matchedCal.tasks.some((tk) => tk.id === addCalBody.task.id && tk.stage_key === 'leaf_scan_care'), true);

    // Clean up scan via DELETE endpoint
    const delResp = await fetch(`${mUrl}/api/leaf-scans/${scanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(delResp.status, 200);
  } finally {
    if (mServer) {
      await new Promise<void>((resolve) => mServer!.close(() => resolve()));
    }
  }
});

test('Live camera helpers handle permission/iframe errors bilingually, stop media tracks, and scale frames cleanly', () => {
  // 1. NotAllowedError in embedded iframe (English & Kannada)
  const notAllowedErr = new Error('Permission denied');
  notAllowedErr.name = 'NotAllowedError';
  const iframeEn = describeCameraError(notAllowedErr, 'en', true);
  assert.equal(iframeEn.code, 'permission_denied');
  assert.equal(iframeEn.suggestUpload, true);
  assert.equal(iframeEn.suggestOpenTab, true);
  assert.match(iframeEn.message, /embedded preview iframe|Upload Photo/i);

  const iframeKn = describeCameraError(notAllowedErr, 'kn', true);
  assert.equal(iframeKn.code, 'permission_denied');
  assert.equal(iframeKn.suggestUpload, true);
  assert.equal(iframeKn.suggestOpenTab, true);
  assert.match(iframeKn.message, /ಎಂಬೆಡೆಡ್|ಫೋಟೋ ಅಪ್‌ಲೋಡ್/);

  // 2. PermissionDeniedError in standalone tab
  const permDenied = new Error('User denied camera');
  permDenied.name = 'PermissionDeniedError';
  const standaloneKn = describeCameraError(permDenied, 'kn', false);
  assert.equal(standaloneKn.code, 'permission_denied');
  assert.equal(standaloneKn.suggestUpload, true);
  assert.match(standaloneKn.title, /ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ/);

  // 3. Unsupported getUserMedia in embedded preview vs standalone
  const unsupportedIframe = describeCameraError('unsupported', 'en', true);
  assert.equal(unsupportedIframe.code, 'unsupported');
  assert.equal(unsupportedIframe.suggestUpload, true);
  assert.equal(unsupportedIframe.suggestOpenTab, true);

  // 4. MediaStream track cleanup stops every track safely
  let stopped = 0;
  stopMediaStream({
    getTracks: () => [
      { stop: () => { stopped += 1; } },
      { stop: () => { stopped += 1; } },
    ],
  });
  assert.equal(stopped, 2);
  stopMediaStream(null);

  // 5. Video frame & upload resizing keeps aspect ratio under maxDimension (1024px)
  assert.deepEqual(scaleDimensions(1920, 1080, 1024), { width: 1024, height: 576 });
  assert.deepEqual(scaleDimensions(1080, 1920, 1024), { width: 576, height: 1024 });
  assert.deepEqual(scaleDimensions(640, 480, 1024), { width: 640, height: 480 });
});

test('Mobile bottom navigation labels and Leaf Scan Live Camera labels are concise in EN and KN', async () => {
  const { TRANSLATIONS } = await import('../src/i18n/translations.ts');
  assert.deepEqual(
    [
      TRANSLATIONS.en.navShortDashboard,
      TRANSLATIONS.en.navShortCalendar,
      TRANSLATIONS.en.navShortWeather,
      TRANSLATIONS.en.navShortVoice,
      TRANSLATIONS.en.navShortMore,
    ],
    ['Home', 'Calendar', 'Weather', 'Voice', 'More']
  );
  assert.deepEqual(
    [
      TRANSLATIONS.kn.navShortDashboard,
      TRANSLATIONS.kn.navShortCalendar,
      TRANSLATIONS.kn.navShortWeather,
      TRANSLATIONS.kn.navShortVoice,
      TRANSLATIONS.kn.navShortMore,
    ],
    ['ಮುಖಪುಟ', 'ವೇಳಾಪಟ್ಟಿ', 'ಹವಾಮಾನ', 'ಧ್ವನಿ', 'ಇನ್ನಷ್ಟು']
  );
  assert.equal(TRANSLATIONS.en.liveCamera, 'Live Camera');
  assert.equal(TRANSLATIONS.kn.liveCamera, 'ಲೈವ್ ಕ್ಯಾಮೆರಾ');
  assert.equal(TRANSLATIONS.en.captureFrame, 'Capture Frame');
  assert.equal(TRANSLATIONS.en.closeCamera, 'Close Camera');
  assert.equal(TRANSLATIONS.en.navSoilHealth, 'Soil & Fertilizer');
  assert.equal(TRANSLATIONS.kn.navSoilHealth, 'ಮಣ್ಣು ಮತ್ತು ಗೊಬ್ಬರ');
});

test('Weather advisories warn farmers to pause foliar sprays before heavy rain, wind, heat, and dry spells in EN and KN', () => {
  const heavyRainScenario = buildAgriculturalAlerts(
    {
      temperature_c: 29,
      humidity_pct: 84,
      rain_mm: 2.1,
      wind_kmh: 22,
      weather_code: 63,
      condition_en: 'Rain',
      condition_kn: 'ಮಳೆ',
    },
    [
      {
        date: '2026-11-20',
        temp_min_c: 21,
        temp_max_c: 30,
        rain_sum_mm: 32,
        rain_prob_pct: 85,
        wind_max_kmh: 24,
        weather_code: 63,
        condition_en: 'Rain',
        condition_kn: 'ಮಳೆ',
      },
      {
        date: '2026-11-21',
        temp_min_c: 20,
        temp_max_c: 29,
        rain_sum_mm: 10,
        rain_prob_pct: 60,
        wind_max_kmh: 16,
        weather_code: 61,
        condition_en: 'Rain',
        condition_kn: 'ಮಳೆ',
      },
      {
        date: '2026-11-22',
        temp_min_c: 20,
        temp_max_c: 31,
        rain_sum_mm: 0,
        rain_prob_pct: 10,
        wind_max_kmh: 12,
        weather_code: 1,
        condition_en: 'Partly cloudy',
        condition_kn: 'ಭಾಗಶಃ ಮೋಡ',
      },
    ]
  );
  assert.equal(heavyRainScenario.spraying_suitable, false);
  assert.match(heavyRainScenario.spraying_reason_en, /Pause foliar sprays/i);
  assert.match(heavyRainScenario.spraying_reason_kn, /ಎಲೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ/);
  const heavyAlert = heavyRainScenario.alerts.find((a) => a.type === 'heavy_rain');
  assert.ok(heavyAlert);
  assert.equal(heavyAlert.severity, 'critical');
  assert.match(heavyAlert.message_en, /Pause foliar sprays/i);
  assert.match(heavyAlert.message_kn, /ಎಲೆ ಸಿಂಪಡಣೆ/);

  const heatDryScenario = buildAgriculturalAlerts(
    {
      temperature_c: 36,
      humidity_pct: 38,
      rain_mm: 0,
      wind_kmh: 8,
      weather_code: 0,
      condition_en: 'Clear sky',
      condition_kn: 'ಸ್ವಚ್ಛ ಆಕಾಶ',
    },
    [
      {
        date: '2026-11-20',
        temp_min_c: 22,
        temp_max_c: 36.5,
        rain_sum_mm: 0,
        rain_prob_pct: 0,
        wind_max_kmh: 10,
        weather_code: 0,
        condition_en: 'Clear sky',
        condition_kn: 'ಸ್ವಚ್ಛ ಆಕಾಶ',
      },
    ]
  );
  assert.equal(heatDryScenario.spraying_suitable, true);
  assert.ok(heatDryScenario.alerts.some((a) => a.type === 'dry_spell'));
  assert.ok(heatDryScenario.alerts.some((a) => a.type === 'heat'));
});

test('Crop task snooze/reschedule, Soil Health & Fertilizer CRUD, Add-to-Calendar, and offline sync work end-to-end in SQLite', async () => {
  // Register two isolated farmers
  const regA = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Soil Farmer A',
      identifier: `soil_a_${Date.now()}`,
      password: 'password123',
      preferred_lang: 'kn',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(regA.status, 201);
  const { token: tokenA } = (await regA.json()) as { token: string };

  const regB = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Soil Farmer B',
      identifier: `soil_b_${Date.now()}`,
      password: 'password123',
      preferred_lang: 'en',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(regB.status, 201);
  const { token: tokenB } = (await regB.json()) as { token: string };

  // Unauthenticated access to /api/soil-plans returns 401
  const unauthSoil = await fetch(`${baseUrl}/api/soil-plans`);
  assert.equal(unauthSoil.status, 401);

  // Create a Ragi crop calendar for Farmer A
  const calResp = await fetch(`${baseUrl}/api/calendars`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      crop_code: 'ragi',
      variety: 'GPU-28',
      season: 'Kharif (Mungaru)',
      soil_type: 'Red Sandy Loam',
      irrigation_type: 'Rainfed',
      sowing_date: '2026-11-01',
      district: 'Tumakuru',
      taluk: 'Sira',
    }),
  });
  assert.equal(calResp.status, 201);
  const calBody = (await calResp.json()) as {
    calendar: { id: number; tasks: Array<{ id: number; due_date: string; end_date: string; status: string }> };
  };
  const firstTask = calBody.calendar.tasks[0];
  assert.ok(firstTask);

  // 1. Reschedule / snooze first task via PATCH /api/tasks/:id
  const patchResp = await fetch(`${baseUrl}/api/tasks/${firstTask.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ due_date: '2026-11-12' }),
  });
  assert.equal(patchResp.status, 200);
  const patched = (await patchResp.json()) as { task: { id: number; due_date: string; end_date: string } };
  assert.equal(patched.task.due_date, '2026-11-12');
  assert.ok(patched.task.end_date >= '2026-11-12');

  // 2. Create a Soil Health & Fertilizer input plan
  const createPlanResp = await fetch(`${baseUrl}/api/soil-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      plot_name: 'Kallambella East Plot',
      crop_code: 'ragi',
      crop_stage: 'Basal / Land Preparation',
      soil_type: 'Red Sandy Loam',
      ph_level: 6.4,
      n_status: 'low',
      p_status: 'medium',
      k_status: 'medium',
      area_acres: 2,
      planned_inputs: [
        { name: 'Ragi GPU-28 Seed', category: 'seed', qty_label: '8 kg', estimated_cost_inr: 640 },
        { name: 'FYM + Trichoderma', category: 'bio_input', qty_label: '4 loads', estimated_cost_inr: 3000 },
      ],
      notes: 'Confirm Zinc check at Sira RSK',
    }),
  });
  assert.equal(createPlanResp.status, 201);
  const createdPlanBody = (await createPlanResp.json()) as {
    plan: {
      id: number;
      plot_name: string;
      total_estimated_cost_inr: number;
      ph_level: number;
      planned_inputs: Array<{ name: string }>;
    };
  };
  assert.equal(createdPlanBody.plan.plot_name, 'Kallambella East Plot');
  assert.equal(createdPlanBody.plan.total_estimated_cost_inr, 3640);
  assert.equal(createdPlanBody.plan.ph_level, 6.4);
  assert.equal(createdPlanBody.plan.planned_inputs.length, 2);

  const planId = createdPlanBody.plan.id;

  // User B cannot see or delete User A's soil plan
  const listBResp = await fetch(`${baseUrl}/api/soil-plans`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const listBBody = (await listBResp.json()) as { plans: Array<{ id: number }> };
  assert.equal(listBBody.plans.some((p) => p.id === planId), false);

  const delBResp = await fetch(`${baseUrl}/api/soil-plans/${planId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(delBResp.status, 404);

  // 3. Add soil plan task to Crop Calendar
  const addPlanCal = await fetch(`${baseUrl}/api/soil-plans/${planId}/add-to-calendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ calendar_id: calBody.calendar.id, due_date: '2026-11-25' }),
  });
  assert.equal(addPlanCal.status, 201);
  const addPlanCalBody = (await addPlanCal.json()) as {
    task: { id: number; stage_key: string; due_date: string; description_en: string };
    plan: { added_task_id: number };
  };
  assert.equal(addPlanCalBody.task.stage_key, 'soil_input_plan');
  assert.equal(addPlanCalBody.task.due_date, '2026-11-25');
  assert.match(addPlanCalBody.task.description_en, /General planning reference only/i);
  assert.equal(addPlanCalBody.plan.added_task_id, addPlanCalBody.task.id);

  // 4. Offline Sync: TASK_UPDATE reschedule + SOIL_PLAN (with idempotency check)
  const syncResp = await fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      actions: [
        {
          id: `sync-task-resched-${Date.now()}`,
          type: 'TASK_UPDATE',
          createdAt: Date.now() + 60_000,
          payload: {
            taskId: firstTask.id,
            status: 'pending',
            dueDate: '2026-11-18',
            endDate: '2026-11-18',
          },
        },
        {
          id: `sync-soil-offline-${Date.now()}`,
          type: 'SOIL_PLAN',
          createdAt: Date.now() + 60_000,
          payload: {
            plot_name: 'Offline Queued Borewell Plot',
            crop_code: 'groundnut',
            crop_stage: 'Flowering / Pod Filling',
            soil_type: 'Red Clay Loam',
            ph_level: 6.8,
            n_status: 'medium',
            p_status: 'low',
            k_status: 'medium',
            area_acres: 1.5,
            planned_inputs: [{ name: 'Agricultural Gypsum', category: 'soil_amendment', qty_label: '300 kg', estimated_cost_inr: 1350 }],
            notes: 'Queued offline in field',
          },
        },
      ],
    }),
  });
  assert.equal(syncResp.status, 200);
  const syncBody = (await syncResp.json()) as { results: Array<{ status: string }> };
  assert.equal(syncBody.results.length, 2);
  assert.equal(syncBody.results[0].status, 'applied');
  assert.equal(syncBody.results[1].status, 'applied');

  const plansAfterSync = await fetch(`${baseUrl}/api/soil-plans`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const plansAfterBody = (await plansAfterSync.json()) as { plans: Array<{ plot_name: string; total_estimated_cost_inr: number }> };
  assert.equal(plansAfterBody.plans.some((p) => p.plot_name === 'Offline Queued Borewell Plot' && p.total_estimated_cost_inr === 1350), true);

  // Clean up created plan
  const delAResp = await fetch(`${baseUrl}/api/soil-plans/${planId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(delAResp.status, 200);
});

test('Stage-aware fertilizer suggestions adapt by crop, growth stage, NPK/pH status, and acreage with SHC/RSK guidance', async () => {
  // 1. Basal stage scales cost by acreage and reacts to low K + acidic pH
  const ragiBasalAcidic = getStageFertilizerSuggestions({
    cropCode: 'ragi',
    cropStage: 'Basal / Land Preparation',
    phLevel: 5.1,
    nStatus: 'medium',
    pStatus: 'medium',
    kStatus: 'low',
    areaAcres: 2,
  });
  assert.ok(ragiBasalAcidic.suggestions.some((s) => s.id === 'ragi-low-k-basal'));
  assert.ok(ragiBasalAcidic.suggestions.some((s) => s.id === 'ragi-acidic-lime'));
  const seedItem = ragiBasalAcidic.suggestions.find((s) => s.category === 'seed');
  assert.ok(seedItem);
  assert.equal(seedItem.estimated_cost_total_inr, seedItem.estimated_cost_per_acre_inr * 2);
  assert.match(ragiBasalAcidic.summary_en, /Soil Health Card|RSK/i);
  assert.match(ragiBasalAcidic.summary_kn, /SHC|ಆರ್‌ಎಸ್‌ಕೆ/);

  // 2. Vegetative stage includes Zinc Sulphate for maize and PSB check when P is low
  const maizeVeg = getStageFertilizerSuggestions({
    cropCode: 'maize',
    cropStage: 'Vegetative / Top-Dressing',
    phLevel: 6.8,
    nStatus: 'low',
    pStatus: 'low',
    kStatus: 'medium',
    areaAcres: 1,
  });
  assert.ok(maizeVeg.suggestions.some((s) => s.id === 'maize-veg-n' && /Urea/i.test(s.name_en)));
  assert.ok(maizeVeg.suggestions.some((s) => s.id === 'maize-veg-micro' && /Zinc/i.test(s.name_en)));
  assert.ok(maizeVeg.suggestions.some((s) => s.id === 'maize-low-p'));

  // 3. Flowering stage for groundnut recommends Gypsum + Potash and alkaline pH triggers alkalinity buffer
  const groundnutFloweringAlkaline = getStageFertilizerSuggestions({
    cropCode: 'groundnut',
    cropStage: 'Flowering / Pod Filling',
    phLevel: 8.4,
    nStatus: 'medium',
    pStatus: 'medium',
    kStatus: 'low',
    areaAcres: 1.5,
  });
  assert.ok(groundnutFloweringAlkaline.suggestions.some((s) => s.id === 'groundnut-flower-gypsum'));
  assert.ok(groundnutFloweringAlkaline.suggestions.some((s) => s.id === 'groundnut-flower-k'));
  assert.ok(groundnutFloweringAlkaline.suggestions.some((s) => s.id === 'groundnut-alkaline-gypsum'));

  // 4. Verify bilingual translation keys and Sira/Tumakuru nearby shop data
  const { TRANSLATIONS } = await import('../src/i18n/translations.ts');
  const requiredKeys = [
    'suggestedFertilizersTitle',
    'suggestedFertilizersSub',
    'applyToInputsBtn',
    'appliedToInputsMsg',
    'nearbyInputShopsTitle',
    'nearbyInputShopsSub',
    'openInMapsBtn',
    'copyDetailsBtn',
    'copiedDetailsMsg',
    'shopAvailabilityReminder',
    'viewAllShopsBtn',
  ] as const;

  for (const key of requiredKeys) {
    assert.ok(TRANSLATIONS.en[key]?.length > 2, `Missing en translation for ${key}`);
    assert.ok(TRANSLATIONS.kn[key]?.length > 2, `Missing kn translation for ${key}`);
  }

  const shopsResp = await fetch(`${baseUrl}/api/shops?lat=13.7412&lng=76.9044`);
  assert.equal(shopsResp.status, 200);
  const shopsBody = (await shopsResp.json()) as {
    shops: Array<{ name: string; address: string; operating_hours: string; taluk: string; district: string; latitude: number; longitude: number }>;
  };
  assert.ok(shopsBody.shops.some((s) => s.taluk === 'Sira' && s.address.length > 5 && s.operating_hours.length > 3));
});

test('ServicesPage interactive map helpers handle My Location errors, shop popups with tel:/Google Maps links, and live distance in EN & KN', async () => {
  // 1. Google Maps URL builder
  const mapsUrl = buildGoogleMapsSearchUrl(13.7412, 76.9044, 'RSK Sira');
  assert.equal(mapsUrl, 'https://www.google.com/maps/search/?api=1&query=13.7412%2C76.9044');

  const fallbackMapsUrl = buildGoogleMapsSearchUrl(null, null, 'Sira, Tumakuru');
  assert.equal(fallbackMapsUrl, 'https://www.google.com/maps/search/?api=1&query=Sira%2C%20Tumakuru');

  // 2. Haversine distance calculation (Sira to Kallambella ~16-18 km)
  const distKm = haversineDistanceKm(13.7412, 76.9044, 13.6061, 76.9245);
  assert.ok(distKm > 10 && distKm < 25, `Expected realistic km distance, got ${distKm}`);

  // 3. Bilingual geolocation error feedback (permission denied in iframe falls back to Sira)
  const deniedEn = describeGeolocationError({ code: 1, message: 'User denied Geolocation' }, 'en', 'Sira, Tumakuru', true);
  assert.equal(deniedEn.code, 'permission_denied');
  assert.equal(deniedEn.suggestOpenTab, true);
  assert.match(deniedEn.message, /Sira, Tumakuru/);
  assert.match(deniedEn.message, /iframe|embedded preview/i);

  const deniedKn = describeGeolocationError({ code: 1, message: 'User denied Geolocation' }, 'kn', 'Sira, Tumakuru', true);
  assert.equal(deniedKn.code, 'permission_denied');
  assert.equal(deniedKn.suggestOpenTab, true);
  assert.match(deniedKn.message, /Sira, Tumakuru/);
  assert.match(deniedKn.message, /ಎಂಬೆಡೆಡ್/);

  const timeoutEn = describeGeolocationError({ code: 3, message: 'Timeout expired' }, 'en', 'Sira, Tumakuru', false);
  assert.equal(timeoutEn.code, 'timeout');
  assert.equal(timeoutEn.suggestOpenTab, false);

  // 4. Shop popup HTML includes shop name, address, tel: link, hours, distance, and Google Maps link cleanly escaped
  const popupEn = buildMapPopupHtml(
    {
      id: 1,
      lat: 13.7412,
      lng: 76.9044,
      title: 'Raitha Samparka Kendra <Sira>',
      address: 'Near APMC Yard, NH-48, Sira',
      phone: '08135-275123',
      hours: '10:00 AM - 5:30 PM',
      distanceKm: 1.4,
      mapsUrl,
    },
    'en'
  );
  assert.match(popupEn, /Raitha Samparka Kendra &lt;Sira&gt;/);
  assert.match(popupEn, /Near APMC Yard, NH-48, Sira/);
  assert.match(popupEn, /href="tel:08135275123"/);
  assert.match(popupEn, /10:00 AM - 5:30 PM/);
  assert.match(popupEn, /1\.4 km away/);
  assert.match(popupEn, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=13\.7412%2C76\.9044/);
  assert.match(popupEn, /Open in Google Maps/);

  const popupKn = buildMapPopupHtml(
    {
      id: 2,
      lat: 13.7412,
      lng: 76.9044,
      title: 'ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ ಸಿರಾ',
      address: 'ಎಪಿಎಂಸಿ ಹತ್ತಿರ, ಸಿರಾ',
      hours: 'ಬೆಳಿಗ್ಗೆ 10 - ಸಂಜೆ 5:30',
      distanceKm: 2.1,
    },
    'kn'
  );
  assert.match(popupKn, /ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ ಸಿರಾ/);
  assert.match(popupKn, /2\.1 km ದೂರ/);
  assert.match(popupKn, /Google Maps ನಲ್ಲಿ ತೆರೆಯಿರಿ/);
  assert.doesNotMatch(popupKn, /href="tel:/);

  // 5. Bilingual My Location, Call, Copy & map button translations present in both EN and KN
  const { TRANSLATIONS } = await import('../src/i18n/translations.ts');
  for (const key of [
    'myLocationBtn',
    'locatingBtn',
    'openInGoogleMaps',
    'showOnMap',
    'currentLocationLabel',
    'callShopBtn',
    'copyShopBtn',
    'copiedShopMsg',
  ] as const) {
    assert.ok(TRANSLATIONS.en[key]?.length > 2, `Missing EN translation for ${key}`);
    assert.ok(TRANSLATIONS.kn[key]?.length > 2, `Missing KN translation for ${key}`);
  }
  assert.equal(TRANSLATIONS.en.myLocationBtn, 'My Location');
  assert.equal(TRANSLATIONS.kn.myLocationBtn, 'ನನ್ನ ಸ್ಥಳ');

  // 6. Shop Copy text formatter includes phone, Sira/Tumakuru address, hours, and Google Maps link
  const copiedEn = formatShopCopyText(
    {
      name: 'Raitha Samparka Kendra (RSK) — Sira Kasaba',
      name_kn: 'ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ (RSK) — ಸಿರಾ ಕಸಬಾ',
      address: 'Taluk Agriculture Office Premises, Sira, Tumakuru 572137',
      taluk: 'Sira',
      district: 'Tumakuru',
      phone: '08135-275120',
      operating_hours: 'Mon–Sat 10:00 AM – 5:30 PM',
      products: 'Subsidized Seeds, Gypsum',
      latitude: 13.7425,
      longitude: 76.9068,
    },
    'en'
  );
  assert.match(copiedEn, /Raitha Samparka Kendra/);
  assert.match(copiedEn, /Sira, Tumakuru/);
  assert.match(copiedEn, /08135-275120/);
  assert.match(copiedEn, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=13\.7425%2C76\.9068/);

  const copiedKn = formatShopCopyText(
    {
      name: 'Raitha Samparka Kendra (RSK) — Sira Kasaba',
      name_kn: 'ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ (RSK) — ಸಿರಾ ಕಸಬಾ',
      address: 'Taluk Agriculture Office Premises, Sira, Tumakuru 572137',
      taluk: 'Sira',
      district: 'Tumakuru',
      phone: '08135-275120',
      latitude: 13.7425,
      longitude: 76.9068,
    },
    'kn'
  );
  assert.match(copiedKn, /ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ/);
  assert.match(copiedKn, /ದೂರವಾಣಿ: 08135-275120/);
});






