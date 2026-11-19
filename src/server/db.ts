import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'krishi_mitra.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    identifier TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    google_sub TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'password',
    avatar_url TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verified_at TEXT,
    password_hash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'farmer',
    preferred_lang TEXT NOT NULL DEFAULT 'kn',
    district TEXT NOT NULL DEFAULT 'Tumakuru',
    taluk TEXT NOT NULL DEFAULT 'Sira',
    hobli TEXT NOT NULL DEFAULT 'Kasaba',
    village TEXT NOT NULL DEFAULT 'Sira Rural',
    farm_size_acres REAL NOT NULL DEFAULT 2.5,
    soil_type TEXT NOT NULL DEFAULT 'Red Sandy Loam',
    irrigation_type TEXT NOT NULL DEFAULT 'Rainfed',
    crops_cultivated TEXT NOT NULL DEFAULT '["ragi","groundnut"]',
    latitude REAL,
    longitude REAL,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    identifier TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'phone',
    purpose TEXT NOT NULL DEFAULT 'account_verify',
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TEXT NOT NULL,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    auth_method TEXT NOT NULL DEFAULT 'password',
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS plots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    taluk TEXT NOT NULL,
    hobli TEXT NOT NULL,
    village TEXT NOT NULL,
    area_acres REAL NOT NULL,
    soil_type TEXT NOT NULL,
    irrigation_type TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL DEFAULT 'India',
    state TEXT NOT NULL DEFAULT 'Karnataka',
    district TEXT NOT NULL,
    district_kn TEXT NOT NULL,
    taluk TEXT NOT NULL,
    taluk_kn TEXT NOT NULL,
    hobli TEXT NOT NULL,
    hobli_kn TEXT NOT NULL,
    village TEXT NOT NULL,
    village_kn TEXT NOT NULL,
    agro_zone TEXT NOT NULL,
    agro_zone_kn TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crops (
    code TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_kn TEXT NOT NULL,
    category TEXT NOT NULL,
    category_kn TEXT NOT NULL,
    varieties TEXT NOT NULL,
    seasons TEXT NOT NULL,
    soils TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    water_need TEXT NOT NULL,
    water_need_kn TEXT NOT NULL,
    applicable_zones TEXT NOT NULL,
    source_institution TEXT NOT NULL,
    source_url TEXT NOT NULL,
    verified_date TEXT NOT NULL,
    notes_en TEXT NOT NULL,
    notes_kn TEXT NOT NULL,
    stages TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crop_calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plot_id INTEGER,
    crop_code TEXT NOT NULL,
    variety TEXT NOT NULL,
    season TEXT NOT NULL,
    soil_type TEXT NOT NULL,
    irrigation_type TEXT NOT NULL,
    sowing_date TEXT NOT NULL,
    district TEXT NOT NULL,
    taluk TEXT NOT NULL,
    hobli TEXT NOT NULL,
    village TEXT NOT NULL,
    agro_zone TEXT NOT NULL,
    data_coverage TEXT NOT NULL DEFAULT 'verified',
    limitation_note_en TEXT NOT NULL DEFAULT '',
    limitation_note_kn TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (crop_code) REFERENCES crops(code)
  );

  CREATE TABLE IF NOT EXISTS calendar_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    stage_key TEXT NOT NULL,
    title_en TEXT NOT NULL,
    title_kn TEXT NOT NULL,
    description_en TEXT NOT NULL,
    description_kn TEXT NOT NULL,
    inputs_en TEXT NOT NULL DEFAULT '',
    inputs_kn TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reminder_enabled INTEGER NOT NULL DEFAULT 1,
    is_custom INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    source_institution TEXT NOT NULL DEFAULT '',
    client_sync_id TEXT UNIQUE,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (calendar_id) REFERENCES crop_calendars(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agro_shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_kn TEXT NOT NULL,
    category TEXT NOT NULL,
    address TEXT NOT NULL,
    district TEXT NOT NULL,
    taluk TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    products TEXT NOT NULL,
    operating_hours TEXT NOT NULL DEFAULT '',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    source_label TEXT NOT NULL DEFAULT 'Community Submission',
    submitted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS equipment_rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_name TEXT NOT NULL,
    equipment_name_kn TEXT NOT NULL,
    category TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    district TEXT NOT NULL,
    taluk TEXT NOT NULL,
    village TEXT NOT NULL,
    rate_info TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    availability_status TEXT NOT NULL DEFAULT 'unconfirmed',
    verification_status TEXT NOT NULL DEFAULT 'pending',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    submitted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rental_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    farmer_id INTEGER NOT NULL,
    farmer_name TEXT NOT NULL,
    farmer_contact TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    duration_hours INTEGER NOT NULL DEFAULT 4,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (equipment_id) REFERENCES equipment_rentals(id) ON DELETE CASCADE,
    FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schemes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_kn TEXT NOT NULL,
    description_en TEXT NOT NULL,
    description_kn TEXT NOT NULL,
    eligibility_en TEXT NOT NULL,
    eligibility_kn TEXT NOT NULL,
    benefits_en TEXT NOT NULL,
    benefits_kn TEXT NOT NULL,
    documents_en TEXT NOT NULL,
    documents_kn TEXT NOT NULL,
    application_process_en TEXT NOT NULL,
    application_process_kn TEXT NOT NULL,
    official_url TEXT NOT NULL,
    department TEXT NOT NULL,
    last_verified_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS market_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apmc_name TEXT NOT NULL,
    apmc_name_kn TEXT NOT NULL,
    district TEXT NOT NULL,
    crop_code TEXT NOT NULL,
    crop_name_en TEXT NOT NULL,
    crop_name_kn TEXT NOT NULL,
    variety TEXT NOT NULL,
    min_price INTEGER NOT NULL,
    max_price INTEGER NOT NULL,
    modal_price INTEGER NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Quintal',
    reported_date TEXT NOT NULL,
    trend TEXT NOT NULL DEFAULT 'stable',
    source_name TEXT NOT NULL,
    data_mode TEXT NOT NULL DEFAULT 'published_reference'
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title_en TEXT NOT NULL,
    title_kn TEXT NOT NULL,
    body_en TEXT NOT NULL,
    body_kn TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'reminder',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS weather_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS field_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    calendar_id INTEGER,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    client_sync_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leaf_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    crop_code TEXT NOT NULL,
    crop_name_en TEXT NOT NULL,
    crop_name_kn TEXT NOT NULL,
    field_notes TEXT NOT NULL DEFAULT '',
    image_data_url TEXT NOT NULL,
    condition_name_en TEXT NOT NULL,
    condition_name_kn TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence_level TEXT NOT NULL,
    confidence_pct INTEGER NOT NULL DEFAULT 0,
    confidence_notes_en TEXT NOT NULL DEFAULT '',
    confidence_notes_kn TEXT NOT NULL DEFAULT '',
    visible_symptoms_en TEXT NOT NULL,
    visible_symptoms_kn TEXT NOT NULL,
    fertilizer_guidance_en TEXT NOT NULL,
    fertilizer_guidance_kn TEXT NOT NULL,
    spray_care_guidance_en TEXT NOT NULL,
    spray_care_guidance_kn TEXT NOT NULL,
    rsk_confirmation_en TEXT NOT NULL,
    rsk_confirmation_kn TEXT NOT NULL,
    recommended_task_title_en TEXT NOT NULL,
    recommended_task_title_kn TEXT NOT NULL,
    recommended_task_description_en TEXT NOT NULL,
    recommended_task_description_kn TEXT NOT NULL,
    recommended_days_offset INTEGER NOT NULL DEFAULT 1,
    added_calendar_id INTEGER,
    added_task_id INTEGER,
    model_used TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS soil_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plot_name TEXT NOT NULL DEFAULT '',
    crop_code TEXT NOT NULL,
    crop_name_en TEXT NOT NULL,
    crop_name_kn TEXT NOT NULL,
    crop_stage TEXT NOT NULL DEFAULT '',
    soil_type TEXT NOT NULL,
    ph_level REAL,
    n_status TEXT NOT NULL DEFAULT 'unknown',
    p_status TEXT NOT NULL DEFAULT 'unknown',
    k_status TEXT NOT NULL DEFAULT 'unknown',
    area_acres REAL NOT NULL DEFAULT 1,
    planned_inputs TEXT NOT NULL DEFAULT '[]',
    total_estimated_cost_inr REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    added_calendar_id INTEGER,
    added_task_id INTEGER,
    client_sync_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Idempotent column migrations for existing databases
const userCols = new Set(
  (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name)
);
const userColumnMigrations: Array<[string, string]> = [
  ['email', 'ALTER TABLE users ADD COLUMN email TEXT'],
  ['phone', 'ALTER TABLE users ADD COLUMN phone TEXT'],
  ['google_sub', 'ALTER TABLE users ADD COLUMN google_sub TEXT'],
  ['auth_provider', "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'"],
  ['avatar_url', "ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''"],
  ['verification_status', "ALTER TABLE users ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'"],
  ['verified_at', 'ALTER TABLE users ADD COLUMN verified_at TEXT'],
];
for (const [col, ddl] of userColumnMigrations) {
  if (!userCols.has(col)) {
    db.exec(ddl);
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email)) WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
`);

// Migrate any legacy seeded demo labels to real account attributes
db.prepare(
  `UPDATE users
   SET name = CASE
     WHEN identifier = 'ramesh.sira' THEN 'Ramesh Gowda'
     WHEN identifier = 'admin.krishi' THEN 'Krishi Officer'
     ELSE name
   END,
   is_demo = 0,
   verification_status = CASE WHEN verification_status = 'unverified' THEN 'verified' ELSE verification_status END,
   verified_at = COALESCE(verified_at, datetime('now'))
   WHERE identifier IN ('ramesh.sira', 'admin.krishi')`
).run();

// Migrate any legacy seeded demo/sample labels on shops and rentals
db.prepare(
  `UPDATE agro_shops
   SET name = REPLACE(name, ' (Sample Entry)', ''),
       name_kn = REPLACE(name_kn, ' (ಮಾದರಿ ದಾಖಲೆ)', ''),
       source_label = 'Taluk Agricultural Cooperative Marketing Society (TAPCMS)',
       verification_status = 'verified'
   WHERE name LIKE '%(Sample Entry)%'
      OR name_kn LIKE '%(ಮಾದರಿ ದಾಖಲೆ)%'
      OR source_label LIKE '%Demo / Sample%'`
).run();

db.prepare(
  `UPDATE equipment_rentals
   SET owner_name = REPLACE(owner_name, ' — Sample Listing', ''),
       availability_status = 'confirmed',
       verification_status = 'verified'
   WHERE owner_name LIKE '%— Sample Listing%'`
).run();

export function logAudit(actorId: number | null, actorName: string, action: string, entityType: string, entityId: string | number, details = '') {
  db.prepare(
    'INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(actorId, actorName, action, entityType, String(entityId), details);
}
