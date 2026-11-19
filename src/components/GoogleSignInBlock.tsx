import React, { useEffect, useRef, useState } from 'react';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch, setStoredToken } from '../lib/api';
import type { AuthConfig, UserProfile } from '../types';

interface GoogleAccountsId {
  initialize: (opts: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      width?: number;
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      locale?: string;
    }
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

interface GoogleSignInBlockProps {
  lang: Lang;
  mode: 'login' | 'register';
  authConfig: AuthConfig | null;
  onSuccess: (user: UserProfile) => void;
  onError: (msg: string) => void;
}

let gsiLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In script')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null;
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

export const GoogleSignInBlock: React.FC<GoogleSignInBlockProps> = ({
  lang,
  mode,
  authConfig,
  onSuccess,
  onError,
}) => {
  const t = useT(lang);
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const [gsiLoadError, setGsiLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const clientId = authConfig?.googleConfigured ? authConfig.googleClientId : null;

  useEffect(() => {
    if (!clientId) return;
    let active = true;

    loadGoogleIdentityScript()
      .then(() => {
        if (!active || !window.google?.accounts?.id || !buttonContainerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response.credential) {
              onError(
                lang === 'kn'
                  ? 'Google ದೃಢೀಕರಣ ಟೋಕನ್ ಲಭ್ಯವಾಗಲಿಲ್ಲ.'
                  : 'Google did not return a sign-in credential.'
              );
              return;
            }
            setSubmitting(true);
            onError('');
            try {
              const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/google', {
                method: 'POST',
                body: JSON.stringify({
                  credential: response.credential,
                  preferred_lang: lang,
                }),
              });
              setStoredToken(res.token);
              onSuccess(res.user);
            } catch (err) {
              onError(err instanceof Error ? err.message : 'Google Sign-In failed');
            } finally {
              setSubmitting(false);
            }
          },
        });
        buttonContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          theme: 'outline',
          size: 'large',
          width: 360,
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          locale: lang === 'kn' ? 'kn' : 'en',
        });
        setGsiReady(true);
        setGsiLoadError('');
      })
      .catch(() => {
        if (!active) return;
        setGsiLoadError(
          lang === 'kn'
            ? 'Google ಸೈನ್-ಇನ್ ಸ್ಕ್ರಿಪ್ಟ್ ಲೋಡ್ ಮಾಡಲು ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಅಗತ್ಯವಿದೆ.'
            : 'Unable to load Google Identity Services. Check internet connectivity.'
        );
      });

    return () => {
      active = false;
    };
  }, [clientId, lang, mode, onError, onSuccess]);

  if (!authConfig) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
        {lang === 'kn' ? 'Google ಸೈನ್-ಇನ್ ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...' : 'Checking Google Sign-In configuration...'}
      </div>
    );
  }

  if (!authConfig.googleConfigured) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 space-y-1">
        <p className="font-semibold text-slate-900">{t.googleNotConfiguredTitle}</p>
        <p className="text-slate-600 leading-relaxed">{t.googleNotConfiguredBody}</p>
        <p className="text-[11px] font-mono text-slate-500">
          GOOGLE_CLIENT_ID: {lang === 'kn' ? 'ಹೊಂದಿಸಲಾಗಿಲ್ಲ' : 'Not configured in environment'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={buttonContainerRef}
        className="w-full flex justify-center min-h-[44px]"
        aria-busy={submitting || !gsiReady}
      />
      {submitting && (
        <p className="text-xs text-center text-[#155E34] font-medium">
          {lang === 'kn' ? 'Google ಖಾತೆಯೊಂದಿಗೆ ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ...' : 'Verifying Google account...'}
        </p>
      )}
      {gsiLoadError && <p className="text-xs text-center text-amber-800">{gsiLoadError}</p>}
    </div>
  );
};
