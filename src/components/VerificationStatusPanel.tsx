import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, ShieldAlert } from 'lucide-react';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import type { UserProfile, VerificationStatusSnapshot } from '../types';

interface VerificationStatusPanelProps {
  lang: Lang;
  identifier: string;
  purpose: 'register' | 'login' | 'account_verify';
  initialSnapshot?: VerificationStatusSnapshot | null;
  initialIssuedCode?: string | null;
  issueSession?: boolean;
  onVerified?: (payload: { user: UserProfile | null; token?: string; verification: VerificationStatusSnapshot }) => void;
}

function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const VerificationStatusPanel: React.FC<VerificationStatusPanelProps> = ({
  lang,
  identifier,
  purpose,
  initialSnapshot = null,
  initialIssuedCode = null,
  issueSession = true,
  onVerified,
}) => {
  const t = useT(lang);
  const [snapshot, setSnapshot] = useState<VerificationStatusSnapshot | null>(initialSnapshot);
  const [issuedCodeNotice, setIssuedCodeNotice] = useState<string | null>(initialIssuedCode);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [streamConnected, setStreamConnected] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const cleanIdentifier = identifier.trim();

  useEffect(() => {
    if (initialSnapshot) setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    if (initialIssuedCode) setIssuedCodeNotice(initialIssuedCode);
  }, [initialIssuedCode]);

  // Real-time SSE stream subscription for live server-side verification state
  useEffect(() => {
    if (!cleanIdentifier || typeof EventSource === 'undefined') return;
    const url = `/api/auth/verification/stream?identifier=${encodeURIComponent(cleanIdentifier)}`;
    const es = new EventSource(url);

    es.onopen = () => setStreamConnected(true);
    es.addEventListener('status', (ev) => {
      try {
        const next = JSON.parse((ev as MessageEvent).data) as VerificationStatusSnapshot;
        setSnapshot(next);
      } catch {
        // ignore malformed frame
      }
    });
    es.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [cleanIdentifier]);

  // Live expiry countdown synchronized to serverTime
  useEffect(() => {
    if (!snapshot?.expiresAt || snapshot.status !== 'pending') {
      setSecondsLeft(0);
      return;
    }
    const serverOffsetMs = Date.parse(snapshot.serverTime) - Date.now();
    const updateTick = () => {
      const expMs = Date.parse(snapshot.expiresAt!);
      const approxServerNow = Date.now() + (Number.isNaN(serverOffsetMs) ? 0 : serverOffsetMs);
      const diffSec = Math.max(0, Math.ceil((expMs - approxServerNow) / 1000));
      setSecondsLeft(diffSec);
    };
    updateTick();
    const timer = setInterval(updateTick, 1000);
    return () => clearInterval(timer);
  }, [snapshot?.expiresAt, snapshot?.serverTime, snapshot?.status]);

  const handleRefreshStatus = async () => {
    if (!cleanIdentifier) return;
    setError('');
    try {
      const res = await apiFetch<{ verification: VerificationStatusSnapshot }>(
        `/api/auth/verification/status?identifier=${encodeURIComponent(cleanIdentifier)}`
      );
      setSnapshot(res.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status check failed');
    }
  };

  const handleSendCode = async () => {
    if (!cleanIdentifier) {
      setError(lang === 'kn' ? 'ದಯವಿಟ್ಟು ಇಮೇಲ್ ಅಥವಾ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.' : 'Please enter an email or mobile number first.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        verification: VerificationStatusSnapshot;
        issuedCode: string;
        deliveryMode: string;
      }>('/api/auth/verification/send', {
        method: 'POST',
        body: JSON.stringify({ identifier: cleanIdentifier, purpose }),
      });
      setSnapshot(res.verification);
      setIssuedCodeNotice(res.issuedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanIdentifier) return;
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        verified: boolean;
        verification: VerificationStatusSnapshot;
        user: UserProfile | null;
        token?: string;
      }>('/api/auth/verification/verify', {
        method: 'POST',
        body: JSON.stringify({
          identifier: cleanIdentifier,
          code: codeInput,
          issueSession,
        }),
      });
      setSnapshot(res.verification);
      setIssuedCodeNotice(null);
      setCodeInput('');
      onVerified?.({ user: res.user, token: res.token, verification: res.verification });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      await handleRefreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const status = snapshot?.status ?? 'unverified';

  const statusLabel =
    status === 'verified'
      ? lang === 'kn'
        ? 'ದೃಢೀಕರಿಸಲಾಗಿದೆ'
        : 'Verified'
      : status === 'pending'
      ? lang === 'kn'
        ? 'ಕೋಡ್ ದೃಢೀಕರಣ ಬಾಕಿ ಇದೆ'
        : 'Pending Verification'
      : status === 'expired'
      ? lang === 'kn'
        ? 'ಕೋಡ್ ಅವಧಿ ಮುಗಿದಿದೆ'
        : 'Code Expired'
      : status === 'failed'
      ? lang === 'kn'
        ? 'ಪ್ರಯತ್ನ ಮಿತಿ ಮುಗಿದಿದೆ'
        : 'Max Attempts Reached'
      : lang === 'kn'
      ? 'ಇನ್ನೂ ದೃಢೀಕರಿಸಿಲ್ಲ'
      : 'Not Yet Verified';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            {status === 'verified' ? (
              <CheckCircle2 className="w-4 h-4 text-[#155E34]" />
            ) : status === 'expired' || status === 'failed' ? (
              <ShieldAlert className="w-4 h-4 text-amber-700" />
            ) : (
              <Clock className="w-4 h-4 text-amber-700" />
            )}
            <span>{t.verificationTitle}</span>
          </p>
          <p className="text-xs text-slate-600 mt-1 tabular-nums">
            {t.verificationStatusLabel}:{' '}
            <strong className={status === 'verified' ? 'text-[#155E34]' : 'text-slate-900'}>
              {statusLabel}
            </strong>
            {snapshot?.status === 'pending' && secondsLeft > 0 && (
              <>
                {' · '}
                <span>
                  {lang === 'kn' ? `ಅವಧಿ: ${formatRemaining(secondsLeft)}` : `Expires in ${formatRemaining(secondsLeft)}`}
                </span>
                {' · '}
                <span>
                  {lang === 'kn'
                    ? `${snapshot.attemptsRemaining} ಪ್ರಯತ್ನಗಳು ಬಾಕಿ`
                    : `${snapshot.attemptsRemaining} attempts left`}
                </span>
              </>
            )}
            {streamConnected && (
              <>
                {' · '}
                <span className="text-emerald-800">{lang === 'kn' ? 'ಲೈವ್ ಸಿಂಕ್' : 'Live stream'}</span>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshStatus}
          aria-label={lang === 'kn' ? 'ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಿ' : 'Refresh verification status'}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shrink-0 whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3" />
          <span>{lang === 'kn' ? 'ಪರಿಶೀಲಿಸಿ' : 'Check'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {issuedCodeNotice && status === 'pending' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-950 space-y-1">
          <p className="font-semibold">
            {lang === 'kn'
              ? 'ಸರ್ವರ್ ದೃಢೀಕರಣ ಕೋಡ್ (SMS/SMTP ಗೇಟ್‌ವೇ ಹೊರತಾಗಿ ಅಪ್ಲಿಕೇಶನ್‌ನಲ್ಲಿ ವಿತರಿಸಲಾಗಿದೆ):'
              : 'Server-issued verification code (SMS/email relay not configured; delivered in-app):'}
          </p>
          <p className="font-mono text-base font-bold tracking-widest tabular-nums text-[#155E34]">
            {issuedCodeNotice}
          </p>
        </div>
      )}

      {status === 'verified' ? (
        <p className="text-xs text-[#155E34] font-medium">
          {lang === 'kn'
            ? `ಖಾತೆ (${snapshot?.identifier || cleanIdentifier}) SQLite ನಲ್ಲಿ ದೃಢೀಕರಿಸಲ್ಪಟ್ಟಿದೆ.`
            : `Account (${snapshot?.identifier || cleanIdentifier}) verified and stored in SQLite.`}
          {snapshot?.verifiedAt ? ` · ${new Date(snapshot.verifiedAt).toLocaleString()}` : ''}
        </p>
      ) : (
        <div className="space-y-2.5">
          {status === 'pending' && (
            <form onSubmit={handleVerifyCode} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t.enterCodeLabel}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tracking-widest tabular-nums focus:outline-none focus:ring-2 focus:ring-[#155E34]"
              />
              <button
                type="submit"
                disabled={busy || codeInput.length < 6}
                className="rounded-xl bg-[#155E34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[40px] whitespace-nowrap"
              >
                {busy ? '...' : t.verifyCodeBtn}
              </button>
            </form>
          )}

          <button
            type="button"
            disabled={busy || !cleanIdentifier}
            onClick={handleSendCode}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 min-h-[38px] whitespace-nowrap"
          >
            {status === 'pending' ? t.resendCodeBtn : t.sendCodeBtn}
          </button>
        </div>
      )}
    </div>
  );
};
