import crypto from 'node:crypto';

export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
}

interface GoogleJwk extends crypto.JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface JwksCache {
  keys: GoogleJwk[];
  fetchedAt: number;
}

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache: JwksCache | null = null;

export function getGoogleClientId(): string | null {
  const val = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  return val.length > 0 ? val : null;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

async function fetchGoogleJwks(fetchImpl: typeof fetch, forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < 1000 * 60 * 60) {
    return jwksCache.keys;
  }
  const resp = await fetchImpl(GOOGLE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Google signing keys (${resp.status})`);
  }
  const body = (await resp.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!forceRefresh) {
    jwksCache = { keys, fetchedAt: Date.now() };
  }
  return keys;
}

export interface VerifyGoogleOptions {
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

export async function verifyGoogleIdToken(
  credential: string,
  expectedClientId: string,
  options: VerifyGoogleOptions = {}
): Promise<VerifiedGoogleClaims> {
  const parts = credential.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Google ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Could not decode Google ID token.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Google ID token algorithm or missing key ID.');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();

  let keys = await fetchGoogleJwks(fetchImpl, Boolean(options.fetchImpl));
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchGoogleJwks(fetchImpl, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('Google signing key not found for credential.');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifiedSig = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
    publicKey,
    Buffer.from(signatureB64, 'base64url')
  );
  if (!verifiedSig) {
    throw new Error('Google ID token signature verification failed.');
  }

  const iss = String(payload.iss || '');
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new Error('Invalid Google ID token issuer.');
  }

  const aud = String(payload.aud || '');
  if (aud !== expectedClientId) {
    throw new Error('Google ID token audience does not match configured GOOGLE_CLIENT_ID.');
  }

  const exp = Number(payload.exp || 0);
  if (!exp || exp * 1000 <= nowMs) {
    throw new Error('Google ID token has expired.');
  }

  const sub = String(payload.sub || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

  if (!sub || !email) {
    throw new Error('Google ID token is missing required account identity claims.');
  }
  if (!emailVerified) {
    throw new Error('Google account email must be verified.');
  }

  return {
    sub,
    email,
    name: String(payload.name || email.split('@')[0]).trim(),
    picture: String(payload.picture || '').trim(),
    emailVerified: true,
  };
}
