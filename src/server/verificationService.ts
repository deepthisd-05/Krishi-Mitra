import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { findUserByIdentifier, normalizeIdentifier } from './auth.ts';
import { db } from './db.ts';
import type { UserRecord } from './types.ts';

export const VERIFICATION_EXPIRY_SECONDS = 600; // 10 minutes

const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('krishi-mitra-karnataka-dev-secret-2026').digest('hex');

const verificationBus = new EventEmitter();
verificationBus.setMaxListeners(200);

export type LiveVerificationState = 'unverified' | 'pending' | 'verified' | 'expired' | 'failed';

export interface VerificationSnapshot {
  identifier: string;
  channel: 'email' | 'phone' | 'google' | 'username';
  status: LiveVerificationState;
  expiresAt: string | null;
  verifiedAt: string | null;
  attempts: number;
  maxAttempts: number;
  attemptsRemaining: number;
  serverTime: string;
  userVerified: boolean;
}

interface VerificationRow {
  id: number;
  user_id: number | null;
  identifier: string;
  channel: 'email' | 'phone' | 'google' | 'username';
  purpose: string;
  code_hash: string;
  status: 'pending' | 'verified' | 'expired' | 'failed';
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

function canonicalKey(rawIdentifier: string): {
  identifier: string;
  channel: 'email' | 'phone' | 'username';
} {
  const norm = normalizeIdentifier(rawIdentifier);
  if (norm) {
    return { identifier: norm.identifier, channel: norm.channel };
  }
  return {
    identifier: rawIdentifier.trim().toLowerCase(),
    channel: 'username',
  };
}

function hashVerificationCode(identifier: string, code: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${identifier}:${code.trim()}`)
    .digest('hex');
}

function expireOutdatedRows(identifier: string, nowMs = Date.now()): boolean {
  const pendingRows = db
    .prepare("SELECT id, expires_at FROM auth_verifications WHERE identifier = ? AND status = 'pending'")
    .all(identifier) as Array<{ id: number; expires_at: string }>;

  let changed = false;
  for (const row of pendingRows) {
    const expMs = Date.parse(row.expires_at);
    if (!Number.isNaN(expMs) && nowMs >= expMs) {
      db.prepare("UPDATE auth_verifications SET status = 'expired' WHERE id = ? AND status = 'pending'").run(row.id);
      changed = true;
    }
  }
  return changed;
}

export function getVerificationStatus(rawIdentifier: string, nowMs = Date.now()): VerificationSnapshot {
  const { identifier, channel } = canonicalKey(rawIdentifier);
  if (!identifier) {
    return {
      identifier: '',
      channel: 'username',
      status: 'unverified',
      expiresAt: null,
      verifiedAt: null,
      attempts: 0,
      maxAttempts: 5,
      attemptsRemaining: 5,
      serverTime: new Date(nowMs).toISOString(),
      userVerified: false,
    };
  }

  expireOutdatedRows(identifier, nowMs);

  const user = findUserByIdentifier(identifier);
  const latest = db
    .prepare('SELECT * FROM auth_verifications WHERE identifier = ? ORDER BY id DESC LIMIT 1')
    .get(identifier) as VerificationRow | undefined;

  if (user && user.verification_status === 'verified') {
    return {
      identifier,
      channel: user.auth_provider === 'google' ? 'google' : channel,
      status: 'verified',
      expiresAt: null,
      verifiedAt: user.verified_at || latest?.verified_at || new Date(nowMs).toISOString(),
      attempts: latest?.attempts ?? 0,
      maxAttempts: latest?.max_attempts ?? 5,
      attemptsRemaining: Math.max(0, (latest?.max_attempts ?? 5) - (latest?.attempts ?? 0)),
      serverTime: new Date(nowMs).toISOString(),
      userVerified: true,
    };
  }

  if (!latest) {
    return {
      identifier,
      channel,
      status: 'unverified',
      expiresAt: null,
      verifiedAt: null,
      attempts: 0,
      maxAttempts: 5,
      attemptsRemaining: 5,
      serverTime: new Date(nowMs).toISOString(),
      userVerified: false,
    };
  }

  return {
    identifier,
    channel: latest.channel || channel,
    status: latest.status,
    expiresAt: latest.status === 'pending' ? latest.expires_at : null,
    verifiedAt: latest.verified_at,
    attempts: latest.attempts,
    maxAttempts: latest.max_attempts,
    attemptsRemaining: Math.max(0, latest.max_attempts - latest.attempts),
    serverTime: new Date(nowMs).toISOString(),
    userVerified: latest.status === 'verified',
  };
}

export function emitVerificationUpdate(rawIdentifier: string): VerificationSnapshot {
  const { identifier } = canonicalKey(rawIdentifier);
  const snapshot = getVerificationStatus(identifier);
  verificationBus.emit(`update:${identifier}`, snapshot);
  return snapshot;
}

export function issueVerificationChallenge(params: {
  identifier: string;
  userId?: number | null;
  purpose?: 'register' | 'login' | 'account_verify';
  expirySeconds?: number;
  nowMs?: number;
}): {
  snapshot: VerificationSnapshot;
  issuedCode: string;
  deliveryMode: 'app_relay';
} {
  const nowMs = params.nowMs ?? Date.now();
  const expirySeconds = params.expirySeconds ?? VERIFICATION_EXPIRY_SECONDS;
  const { identifier, channel } = canonicalKey(params.identifier);

  const existingUser = params.userId
    ? (db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as UserRecord | undefined)
    : findUserByIdentifier(identifier);

  // Supersede previous pending verification challenges for this identifier
  db.prepare("UPDATE auth_verifications SET status = 'expired' WHERE identifier = ? AND status = 'pending'").run(
    identifier
  );

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashVerificationCode(identifier, code);
  const expiresAt = new Date(nowMs + expirySeconds * 1000).toISOString();

  db.prepare(
    `INSERT INTO auth_verifications (user_id, identifier, channel, purpose, code_hash, status, attempts, max_attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, 5, ?)`
  ).run(existingUser?.id ?? null, identifier, channel, params.purpose || 'account_verify', codeHash, expiresAt);

  if (existingUser && existingUser.verification_status !== 'verified') {
    db.prepare(
      "UPDATE users SET verification_status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(existingUser.id);
  }

  const snapshot = emitVerificationUpdate(identifier);
  return {
    snapshot,
    issuedCode: code,
    deliveryMode: 'app_relay',
  };
}

export function verifyChallengeCode(params: {
  identifier: string;
  code: string;
  nowMs?: number;
}): {
  ok: boolean;
  httpStatus: number;
  error?: string;
  snapshot: VerificationSnapshot;
  user?: UserRecord;
} {
  const nowMs = params.nowMs ?? Date.now();
  const { identifier } = canonicalKey(params.identifier);
  const cleanCode = String(params.code || '').replace(/\s+/g, '');

  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      ok: false,
      httpStatus: 400,
      error: 'Please enter the 6-digit verification code.',
      snapshot: getVerificationStatus(identifier, nowMs),
    };
  }

  expireOutdatedRows(identifier, nowMs);

  const latest = db
    .prepare('SELECT * FROM auth_verifications WHERE identifier = ? ORDER BY id DESC LIMIT 1')
    .get(identifier) as VerificationRow | undefined;

  if (!latest) {
    return {
      ok: false,
      httpStatus: 404,
      error: 'No active verification request found. Send a new verification code first.',
      snapshot: getVerificationStatus(identifier, nowMs),
    };
  }

  if (latest.status === 'expired') {
    const snap = emitVerificationUpdate(identifier);
    return {
      ok: false,
      httpStatus: 410,
      error: 'Verification code has expired. Please request a new code.',
      snapshot: snap,
    };
  }

  if (latest.status === 'failed' || latest.attempts >= latest.max_attempts) {
    db.prepare("UPDATE auth_verifications SET status = 'failed' WHERE id = ?").run(latest.id);
    const snap = emitVerificationUpdate(identifier);
    return {
      ok: false,
      httpStatus: 429,
      error: 'Maximum verification attempts reached. Request a new code to continue.',
      snapshot: snap,
    };
  }

  if (latest.status === 'verified') {
    const user =
      (latest.user_id
        ? (db.prepare('SELECT * FROM users WHERE id = ?').get(latest.user_id) as UserRecord | undefined)
        : undefined) ?? findUserByIdentifier(identifier);
    return {
      ok: true,
      httpStatus: 200,
      snapshot: getVerificationStatus(identifier, nowMs),
      user,
    };
  }

  const expectedHash = hashVerificationCode(identifier, cleanCode);
  const matches = crypto.timingSafeEqual(
    Buffer.from(expectedHash, 'hex'),
    Buffer.from(latest.code_hash, 'hex')
  );

  if (!matches) {
    const nextAttempts = latest.attempts + 1;
    const nextStatus = nextAttempts >= latest.max_attempts ? 'failed' : 'pending';
    db.prepare('UPDATE auth_verifications SET attempts = ?, status = ? WHERE id = ?').run(
      nextAttempts,
      nextStatus,
      latest.id
    );
    const snap = emitVerificationUpdate(identifier);
    return {
      ok: false,
      httpStatus: nextStatus === 'failed' ? 429 : 400,
      error:
        nextStatus === 'failed'
          ? 'Too many incorrect codes. Request a new verification code.'
          : `Incorrect verification code. ${Math.max(0, latest.max_attempts - nextAttempts)} attempts remaining.`,
      snapshot: snap,
    };
  }

  const verifiedAt = new Date(nowMs).toISOString();
  db.prepare("UPDATE auth_verifications SET status = 'verified', verified_at = ? WHERE id = ?").run(
    verifiedAt,
    latest.id
  );

  const user =
    (latest.user_id
      ? (db.prepare('SELECT * FROM users WHERE id = ?').get(latest.user_id) as UserRecord | undefined)
      : undefined) ?? findUserByIdentifier(identifier);

  let updatedUser: UserRecord | undefined = user;
  if (user) {
    db.prepare(
      "UPDATE users SET verification_status = 'verified', verified_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(verifiedAt, user.id);
    updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRecord | undefined;
  }

  const snap = emitVerificationUpdate(identifier);
  return {
    ok: true,
    httpStatus: 200,
    snapshot: snap,
    user: updatedUser,
  };
}

export function subscribeVerificationStatus(
  rawIdentifier: string,
  onUpdate: (snapshot: VerificationSnapshot) => void
): () => void {
  const { identifier } = canonicalKey(rawIdentifier);
  const eventKey = `update:${identifier}`;

  const listener = (snapshot: VerificationSnapshot) => {
    onUpdate(snapshot);
  };
  verificationBus.on(eventKey, listener);

  // Also check periodically every 3 seconds while pending so expirations push in real time
  const interval = setInterval(() => {
    const hadExpired = expireOutdatedRows(identifier);
    if (hadExpired) {
      onUpdate(getVerificationStatus(identifier));
    }
  }, 3000);

  return () => {
    clearInterval(interval);
    verificationBus.off(eventKey, listener);
  };
}
