import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { SafeUser, UserRecord } from './types.ts';

const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('krishi-mitra-karnataka-dev-secret-2026').digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface NormalizedIdentifier {
  identifier: string;
  channel: 'email' | 'phone' | 'username';
  email: string | null;
  phone: string | null;
}

export function normalizeIdentifier(raw: string): NormalizedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { identifier: email, channel: 'email', email, phone: null };
  }

  const digits = trimmed.replace(/[\s\-()]/g, '');
  const indianPhoneMatch = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  if (indianPhoneMatch) {
    const tenDigit = indianPhoneMatch[1];
    return { identifier: tenDigit, channel: 'phone', email: null, phone: tenDigit };
  }

  const lower = trimmed.toLowerCase();
  if (lower.length < 4 || !/^[a-z0-9._-]+$/.test(lower)) {
    return null;
  }
  return { identifier: lower, channel: 'username', email: null, phone: null };
}

export function findUserByIdentifier(rawIdentifier: string): UserRecord | undefined {
  const norm = normalizeIdentifier(rawIdentifier);
  const key = norm ? norm.identifier : rawIdentifier.trim().toLowerCase();
  if (!key) return undefined;
  return db
    .prepare(
      'SELECT * FROM users WHERE lower(identifier) = ? OR lower(email) = ? OR phone = ? LIMIT 1'
    )
    .get(key, key, key) as UserRecord | undefined;
}

interface TokenPayload {
  uid: number;
  role: 'farmer' | 'admin';
  exp: number;
}

export function signToken(userId: number, role: 'farmer' | 'admin'): string {
  const payload: TokenPayload = {
    uid: userId,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function recordSession(userId: number, token: string, authMethod: 'password' | 'google' | 'verification_code'): void {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare(
    'INSERT OR IGNORE INTO user_sessions (user_id, token_hash, auth_method, expires_at) VALUES (?, ?, ?, ?)'
  ).run(userId, tokenHash, authMethod, expiresAt);
}

export function revokeSession(token: string | null): void {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL").run(tokenHash);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.uid !== 'number' || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function toSafeUser(row: UserRecord): SafeUser {
  let crops: string[] = [];
  try {
    crops = JSON.parse(row.crops_cultivated || '[]');
  } catch {
    crops = [];
  }
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    preferred_lang: row.preferred_lang === 'kn' ? 'kn' : 'en',
    auth_provider: row.auth_provider || 'password',
    avatar_url: row.avatar_url || '',
    verification_status: row.verification_status || 'unverified',
    verified_at: row.verified_at ?? null,
    district: row.district,
    taluk: row.taluk,
    hobli: row.hobli,
    village: row.village,
    farm_size_acres: row.farm_size_acres,
    soil_type: row.soil_type,
    irrigation_type: row.irrigation_type,
    crops_cultivated: crops,
    latitude: row.latitude,
    longitude: row.longitude,
    onboarding_completed: row.onboarding_completed === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface AuthedRequest extends Request {
  auth?: TokenPayload;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith('km_session=')) {
        return decodeURIComponent(c.slice('km_session='.length));
      }
    }
  }
  return null;
}

interface ResolvedAuth {
  uid: number;
  role: 'farmer' | 'admin';
  exp: number;
}

function resolveSessionAuth(req: Request): { ok: true; auth: ResolvedAuth } | { ok: false; status: 401; error: string } {
  const token = extractToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  const payload = verifyToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessionRow = db
    .prepare('SELECT revoked_at FROM user_sessions WHERE token_hash = ? LIMIT 1')
    .get(tokenHash) as { revoked_at: string | null } | undefined;
  if (sessionRow && sessionRow.revoked_at) {
    return { ok: false, status: 401, error: 'Session has been signed out' };
  }
  const dbUser = db
    .prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1')
    .get(payload.uid) as { id: number; role: 'farmer' | 'admin' } | undefined;
  if (!dbUser) {
    return { ok: false, status: 401, error: 'Account no longer exists' };
  }
  return {
    ok: true,
    auth: {
      uid: dbUser.id,
      role: dbUser.role,
      exp: payload.exp,
    },
  };
}

export function optionalAuth(req: AuthedRequest): ResolvedAuth | undefined {
  const result = resolveSessionAuth(req);
  if (result.ok) {
    req.auth = result.auth;
    return result.auth;
  }
  return undefined;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const result = resolveSessionAuth(req);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  req.auth = result.auth;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const result = resolveSessionAuth(req);
  if (!result.ok || result.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator access required.' });
  }
  req.auth = result.auth;
  next();
}
