import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CloudRain,
  Languages,
  MapPin,
  Mic,
  ShieldCheck,
  Sprout,
  Tractor,
  WifiOff,
} from 'lucide-react';
import { GoogleSignInBlock } from '../components/GoogleSignInBlock';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { VerificationStatusPanel } from '../components/VerificationStatusPanel';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch, setStoredToken } from '../lib/api';
import type { AuthConfig, KarnatakaLocation, UserProfile, VerificationStatusSnapshot } from '../types';

interface LandingProps {
  lang: Lang;
  onToggleLang: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  onExplorePublic: (tab: 'weather' | 'schemes' | 'market') => void;
}

export const LandingAndAuth: React.FC<LandingProps> = ({
  lang,
  onToggleLang,
  onAuthSuccess,
  onExplorePublic,
}) => {
  const t = useT(lang);
  const [authMode, setAuthMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [loginMethod, setLoginMethod] = useState<'password' | 'code'>('password');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [district, setDistrict] = useState('Tumakuru');
  const [taluk, setTaluk] = useState('Sira');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingVerification, setPendingVerification] = useState<{
    user: UserProfile;
    snapshot: VerificationStatusSnapshot;
    issuedCode: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<AuthConfig>('/api/auth/config')
      .then((cfg) => {
        if (mounted) setAuthConfig(cfg);
      })
      .catch(() => {
        if (mounted) {
          setAuthConfig({
            googleClientId: null,
            googleConfigured: false,
            verificationExpirySeconds: 600,
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        token: string;
        user: UserProfile;
        verification: VerificationStatusSnapshot;
        issuedCode: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          identifier,
          password,
          preferred_lang: lang,
          district,
          taluk,
          hobli: 'Kasaba',
          village: taluk === 'Sira' ? 'Sira Rural' : taluk,
        }),
      });
      setStoredToken(res.token);
      setPendingVerification({
        user: res.user,
        snapshot: res.verification,
        issuedCode: res.issuedCode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed');
    } finally {
      setLoading(false);
    }
  };

  if (authMode !== 'landing') {
    return (
      <div className="min-h-screen bg-[#F8FAF8] flex flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between gap-8">
          <button
            onClick={() => {
              setPendingVerification(null);
              setAuthMode('landing');
            }}
            className="text-lg font-bold tracking-tight text-[#155E34] whitespace-nowrap shrink-0"
          >
            {t.brandName}
          </button>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onToggleLang}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Languages className="w-4 h-4 text-[#155E34]" />
              <span>{lang === 'kn' ? 'English' : 'ಕನ್ನಡ'}</span>
            </button>
            <button
              onClick={() => {
                setPendingVerification(null);
                setAuthMode('landing');
              }}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0 min-h-[40px] px-2"
            >
              {lang === 'kn' ? 'ಹಿಂದಕ್ಕೆ' : 'Back'}
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            {pendingVerification ? (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    {lang === 'kn' ? 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ದೃಢೀಕರಿಸಿ' : 'Verify Your New Account'}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    {lang === 'kn'
                      ? `${pendingVerification.user.name} ಅವರ ಖಾತೆ SQLite ನಲ್ಲಿ ರಚನೆಯಾಗಿದೆ. ಲೈವ್ ಕೋಡ್ ದೃಢೀಕರಿಸಿ ಅಥವಾ ನೇರವಾಗಿ ಮುಂದುವರಿಯಿರಿ.`
                      : `Account created for ${pendingVerification.user.name} in SQLite. Verify your 6-digit code in real time or continue to farm setup.`}
                  </p>
                </div>

                <VerificationStatusPanel
                  lang={lang}
                  identifier={pendingVerification.user.identifier}
                  purpose="register"
                  initialSnapshot={pendingVerification.snapshot}
                  initialIssuedCode={pendingVerification.issuedCode}
                  issueSession={true}
                  onVerified={({ user: verifiedUser, token }) => {
                    if (token) setStoredToken(token);
                    if (verifiedUser) {
                      onAuthSuccess(verifiedUser);
                    } else {
                      onAuthSuccess({
                        ...pendingVerification.user,
                        verification_status: 'verified',
                      });
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => onAuthSuccess(pendingVerification.user)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px]"
                >
                  {t.continueToApp}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setError('');
                    }}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setError('');
                    }}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.register}
                  </button>
                </div>

                <h1 className="text-xl font-bold text-slate-900 mb-1">
                  {authMode === 'login' ? t.loginTitle : t.registerTitle}
                </h1>
                <p className="text-sm text-slate-600 mb-6">{t.tagline}</p>

                {error && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {authMode === 'login' ? (
                  <div className="space-y-5">
                    <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMethod('password');
                          setError('');
                        }}
                        className={`flex-1 py-2 font-semibold rounded-md transition-colors whitespace-nowrap ${
                          loginMethod === 'password' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        {t.signInWithPassword}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMethod('code');
                          setError('');
                        }}
                        className={`flex-1 py-2 font-semibold rounded-md transition-colors whitespace-nowrap ${
                          loginMethod === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        {t.signInWithCode}
                      </button>
                    </div>

                    {loginMethod === 'password' ? (
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.identifierLabel}</label>
                          <input
                            type="text"
                            required
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={lang === 'kn' ? 'ಉದಾ: farmer@example.com ಅಥವಾ 9876543210' : 'farmer@example.com or 9876543210'}
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.passwordLabel}</label>
                          <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full rounded-xl bg-[#155E34] py-3 text-base font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 transition-colors min-h-[48px]"
                        >
                          {loading ? '...' : t.signIn}
                        </button>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.identifierLabel}</label>
                          <input
                            type="text"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={lang === 'kn' ? 'ಉದಾ: farmer@example.com ಅಥವಾ 9876543210' : 'farmer@example.com or 9876543210'}
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                          />
                        </div>
                        <VerificationStatusPanel
                          lang={lang}
                          identifier={identifier}
                          purpose="login"
                          issueSession={true}
                          onVerified={({ user: verifiedUser, token }) => {
                            if (token) setStoredToken(token);
                            if (verifiedUser) {
                              onAuthSuccess(verifiedUser);
                            } else {
                              setError(
                                lang === 'kn'
                                  ? 'ಕೋಡ್ ದೃಢೀಕರಿಸಲಾಗಿದೆ, ಆದರೆ ಈ ಐಡಿಗಾಗಿ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ. ಮೊದಲು ಖಾತೆ ತೆರೆಯಿರಿ.'
                                  : 'Code verified, but no registered account was found for this identifier. Create an account first.'
                              );
                            }
                          }}
                        />
                      </div>
                    )}

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-2.5 text-slate-500">{t.orDivider}</span>
                      </div>
                    </div>

                    <GoogleSignInBlock
                      lang={lang}
                      mode="login"
                      authConfig={authConfig}
                      onSuccess={onAuthSuccess}
                      onError={setError}
                    />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.nameLabel}</label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={lang === 'kn' ? 'ಉದಾ: ಮಂಜುನಾಥ್ ಕೆ.' : 'Full Name'}
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.identifierLabel}</label>
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder={lang === 'kn' ? 'farmer@example.com ಅಥವಾ 9876543210' : 'farmer@example.com or 9876543210'}
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.districtLabel}</label>
                          <select
                            value={district}
                            onChange={(e) => {
                              setDistrict(e.target.value);
                              if (e.target.value === 'Tumakuru') setTaluk('Sira');
                            }}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                          >
                            <option value="Tumakuru">Tumakuru (ತುಮಕೂರು)</option>
                            <option value="Chitradurga">Chitradurga (ಚಿತ್ರದುರ್ಗ)</option>
                            <option value="Mandya">Mandya (ಮಂಡ್ಯ)</option>
                            <option value="Bengaluru Rural">Bengaluru Rural</option>
                            <option value="Davanagere">Davanagere (ದಾವಣಗೆರೆ)</option>
                            <option value="Hassan">Hassan (ಹಾಸನ)</option>
                            <option value="Mysuru">Mysuru (ಮೈಸೂರು)</option>
                            <option value="Dharwad">Dharwad (ಧಾರವಾಡ)</option>
                            <option value="Belagavi">Belagavi (ಬೆಳಗಾವಿ)</option>
                            <option value="Kolar">Kolar (ಕೋಲಾರ)</option>
                            <option value="Shivamogga">Shivamogga (ಶಿವಮೊಗ್ಗ)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.talukLabel}</label>
                          <input
                            type="text"
                            value={taluk}
                            onChange={(e) => setTaluk(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.passwordLabel}</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={lang === 'kn' ? 'ಕನಿಷ್ಠ 6 ಅಕ್ಷರಗಳು' : 'Minimum 6 characters'}
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#155E34]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-[#155E34] py-3 text-base font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 transition-colors min-h-[48px]"
                      >
                        {loading ? '...' : t.register}
                      </button>
                    </form>

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-2.5 text-slate-500">{t.orDivider}</span>
                      </div>
                    </div>

                    <GoogleSignInBlock
                      lang={lang}
                      mode="register"
                      authConfig={authConfig}
                      onSuccess={onAuthSuccess}
                      onError={setError}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAF8] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">
          <a href="/" className="text-base sm:text-xl font-bold tracking-tight text-[#155E34] truncate min-w-0">
            {t.brandName}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button onClick={() => onExplorePublic('weather')} className="hover:text-[#155E34] transition-colors whitespace-nowrap shrink-0">
              {t.navWeather}
            </button>
            <button onClick={() => onExplorePublic('schemes')} className="hover:text-[#155E34] transition-colors whitespace-nowrap shrink-0">
              {t.navSchemes}
            </button>
            <button onClick={() => onExplorePublic('market')} className="hover:text-[#155E34] transition-colors whitespace-nowrap shrink-0">
              {t.navMarket}
            </button>
            <button onClick={onToggleLang} className="hover:text-[#155E34] transition-colors whitespace-nowrap shrink-0">
              {lang === 'kn' ? 'English' : 'ಕನ್ನಡ'}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              onClick={onToggleLang}
              className="md:hidden inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 min-h-[38px]"
            >
              <Languages className="w-4 h-4 text-[#155E34] shrink-0" />
              <span>{lang === 'kn' ? 'EN' : 'ಕನ್ನಡ'}</span>
            </button>
            <PWAInstallButton lang={lang} />
            <button
              onClick={() => setAuthMode('login')}
              className="rounded-xl bg-[#155E34] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#114B29] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
            >
              {t.signIn}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12 lg:pt-12 lg:pb-16">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs font-semibold text-[#155E34] tracking-wide mb-3">
              {t.heroBadge}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.15] [text-wrap:balance]">
              {t.heroTitle}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              {t.heroSub}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setAuthMode('register')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#155E34] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#114B29] transition-colors min-h-[48px] whitespace-nowrap"
              >
                <span>{t.getStarted}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-base font-semibold text-slate-800 hover:bg-slate-50 transition-colors min-h-[48px] whitespace-nowrap"
              >
                <span>{t.signIn}</span>
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <span>{lang === 'kn' ? 'ಸಿರಾ ಪ್ರಾಯೋಗಿಕ ಕೇಂದ್ರ' : 'Sira Pilot Active'}</span>
              <span aria-hidden="true">·</span>
              <span>{lang === 'kn' ? 'UAS ಬೆಂಗಳೂರು & KVK ಮಾಹಿತಿ' : 'UAS Bengaluru & KVK Sources'}</span>
              <span aria-hidden="true">·</span>
              <span>{lang === 'kn' ? 'ಆಫ್‌ಲೈನ್ PWA ಸಿದ್ಧ' : 'Offline-First PWA'}</span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-200 bg-emerald-950">
              <img
                src="/src/assets/images/hero_karnataka_farm_1795062262783.jpg"
                alt="Karnataka farmland in Tumakuru district"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-5 text-white">
                <p className="text-xs font-medium text-emerald-200">
                  {lang === 'kn' ? 'ತುಮಕೂರು ಜಿಲ್ಲೆ · ಸಿರಾ ತಾಲ್ಲೂಕು' : 'Tumakuru District · Sira Taluk'}
                </p>
                <p className="text-base font-semibold mt-0.5">
                  {t.tagline}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Platform Capabilities Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#155E34] flex items-center justify-center mb-4">
                <CalendarDays className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {lang === 'kn' ? '12 ಹಂತದ ಹೈಪರ್‌ಲೋಕಲ್ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ' : '12-Stage Hyperlocal Crop Calendar'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {lang === 'kn'
                  ? 'ರಾಗಿ, ಶೇಂಗಾ, ಭತ್ತ, ತೊಗರಿ, ಮೆಕ್ಕೆಜೋಳ ಮತ್ತು ತೆಂಗು ಸೇರಿದಂತೆ 12 ಕರ್ನಾಟಕ ಬೆಳೆಗಳಿಗೆ ಮಣ್ಣು ಮತ್ತು ನೀರಾವರಿ ಆಧಾರಿತ ವೇಳಾಪಟ್ಟಿ.'
                  : 'Tailored schedules for Ragi, Groundnut, Paddy, Red Gram, Maize, Coconut, Tomato, and Onion adapted to your soil, irrigation, and sowing date.'}
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
              {lang === 'kn' ? 'UAS ಬೆಂಗಳೂರು · ICAR · KVK ಹಿರೇಹಳ್ಳಿ' : 'UAS Bengaluru · ICAR · KVK Hirehalli'}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#155E34] flex items-center justify-center mb-4">
                <CloudRain className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {lang === 'kn' ? 'ನೈಜ ಹವಾಮಾನ ಮತ್ತು ಸಿಂಪಡಣೆ ಎಚ್ಚರಿಕೆ' : 'Live Weather & Spraying Advisory'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {lang === 'kn'
                  ? 'Open-Meteo ನೇರ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ, ಭಾರೀ ಮಳೆ ಎಚ್ಚರಿಕೆ, ನೀರಾವರಿ ತಡೆ ಸಲಹೆ ಮತ್ತು ಗಾಳಿ ಆಧಾರಿತ ಔಷಧಿ ಸಿಂಪಡಣೆ ಮಾರ್ಗದರ್ಶನ.'
                  : 'Real Open-Meteo 7-day forecasts for your exact taluk coordinates, with heavy rain warnings, irrigation pause alerts, and spray drift checks.'}
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button onClick={() => onExplorePublic('weather')} className="text-xs font-semibold text-[#155E34] hover:underline">
                {lang === 'kn' ? 'ಸಿರಾ ಹವಾಮಾನ ಪರಿಶೀಲಿಸಿ →' : 'Check Live Sira Weather →'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#155E34] flex items-center justify-center mb-4">
                <Mic className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {lang === 'kn' ? 'ಕನ್ನಡ ಧ್ವನಿ ಸಹಾಯ ಮತ್ತು ಆಫ್‌ಲೈನ್ ಮೋಡ್' : 'Kannada Voice & Offline-First PWA'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {lang === 'kn'
                  ? 'ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಿ ಬೆಳೆ, ನೀರಾವರಿ ಮತ್ತು ಯೋಜನೆಗಳ ಮಾಹಿತಿ ಪಡೆಯಿರಿ. ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದಿದ್ದಾಗಲೂ ವೇಳಾಪಟ್ಟಿ ಮತ್ತು ಟಿಪ್ಪಣಿಗಳು ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತವೆ.'
                  : 'Speak farming questions in Kannada, view saved schedules offline via IndexedDB, and sync queued task updates automatically when signal returns.'}
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" /> IndexedDB</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {lang === 'kn' ? 'ಸುರಕ್ಷಿತ' : 'Verified Sources'}</span>
            </div>
          </div>
        </div>

        {/* Visual Showcase Row */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden grid sm:grid-cols-5 items-stretch">
            <div className="sm:col-span-2 h-48 sm:h-auto bg-emerald-900">
              <img
                src="/src/assets/images/crop_ragi_harvest_1795062262493.jpg"
                alt="Finger millet ragi crop in Karnataka"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="sm:col-span-3 p-6 flex flex-col justify-center">
              <p className="text-xs font-semibold text-[#155E34] flex items-center gap-1.5">
                <Sprout className="w-4 h-4" />
                <span>{lang === 'kn' ? 'ದೃಢೀಕೃತ ಬೆಳೆ ಜ್ಞಾನ' : 'Verified Agronomy'}</span>
              </p>
              <h3 className="text-lg font-bold text-slate-900 mt-1.5">
                {lang === 'kn' ? 'ಪ್ರತಿ ಶಿಫಾರಸಿಗೆ ಸ್ಪಷ್ಟ ಕೃಷಿ ಮೂಲ' : 'Source-Attributed Crop Guidance'}
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                {lang === 'kn'
                  ? 'ಪ್ರತಿ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಯಲ್ಲೂ ಸಂಶೋಧನಾ ಸಂಸ್ಥೆ, ಪರಿಶೀಲನಾ ದಿನಾಂಕ ಮತ್ತು ಪ್ರಾದೇಶಿಕ ಮಿತಿಗಳನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತೋರಿಸಲಾಗುತ್ತದೆ.'
                  : 'Every calendar displays its research institution, verification date, and regional coverage limitations—never fabricated guidance.'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden grid sm:grid-cols-5 items-stretch">
            <div className="sm:col-span-2 h-48 sm:h-auto bg-amber-900">
              <img
                src="/src/assets/images/equipment_tractor_field_1795062263413.jpg"
                alt="Tractor tilling red soil farmland"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="sm:col-span-3 p-6 flex flex-col justify-center">
              <p className="text-xs font-semibold text-[#155E34] flex items-center gap-1.5">
                <Tractor className="w-4 h-4" />
                <span>{lang === 'kn' ? 'ಸ್ಥಳೀಯ ಸೇವೆಗಳು' : 'Local Services & Markets'}</span>
              </p>
              <h3 className="text-lg font-bold text-slate-900 mt-1.5">
                {lang === 'kn' ? 'ಅಂಗಡಿಗಳು, ಟ್ರ್ಯಾಕ್ಟರ್ ಬಾಡಿಗೆ ಮತ್ತು ಎಪಿಎಂಸಿ' : 'Input Shops, Rentals & APMC'}
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                {lang === 'kn'
                  ? 'OpenStreetMap ನಕ್ಷೆಯಲ್ಲಿ ಹತ್ತಿರದ RSK ಕೇಂದ್ರಗಳು, ಬೀಜ ಅಂಗಡಿಗಳು, ಯಂತ್ರ ಬಾಡಿಗೆ ಮತ್ತು ಸಿರಾ/ತುಮಕೂರು APMC ದರಗಳನ್ನು ನೋಡಿ.'
                  : 'Discover nearby RSKs, seed/fertilizer shops on OpenStreetMap, send tractor enquiries, and review dated APMC prices.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {t.brandName} · {lang === 'kn' ? 'ಸಿರಾ, ತುಮಕೂರು ಪ್ರಾಯೋಗಿಕ ವೇದಿಕೆ' : 'Karnataka Agricultural Platform · Pilot: Sira, Tumakuru'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#155E34]" />
            <span>{lang === 'kn' ? 'ಸ್ಥಳೀಯ ಕೃಷಿ ತಜ್ಞರು / RSK ಸಲಹೆಯನ್ನು ಸಹ ಪಡೆಯಿರಿ' : 'Always consult local KVK / Raitha Samparka Kendra for field-specific emergencies'}</span>
          </span>
        </div>
      </footer>
    </div>
  );
};

interface OnboardingProps {
  lang: Lang;
  user: UserProfile;
  locations: KarnatakaLocation[];
  onComplete: (updated: UserProfile) => void;
}

export const OnboardingWizard: React.FC<OnboardingProps> = ({ lang, user, locations, onComplete }) => {
  const t = useT(lang);
  const [name, setName] = useState(user.name);
  const [district, setDistrict] = useState(user.district || 'Tumakuru');
  const [taluk, setTaluk] = useState(user.taluk || 'Sira');
  const [hobli, setHobli] = useState(user.hobli || 'Kasaba');
  const [village, setVillage] = useState(user.village || 'Sira Rural');
  const [farmSize, setFarmSize] = useState(String(user.farm_size_acres || 2.5));
  const [soilType, setSoilType] = useState(user.soil_type || 'Red Sandy Loam');
  const [irrigationType, setIrrigationType] = useState(user.irrigation_type || 'Rainfed');
  const [crops, setCrops] = useState<string[]>(user.crops_cultivated.length ? user.crops_cultivated : ['ragi', 'groundnut']);
  const [saving, setSaving] = useState(false);

  const districts = Array.from(new Set(locations.map((l) => l.district)));
  const taluks = Array.from(new Set(locations.filter((l) => l.district === district).map((l) => l.taluk)));
  const hoblis = Array.from(new Set(locations.filter((l) => l.district === district && l.taluk === taluk).map((l) => l.hobli)));
  const villages = locations.filter((l) => l.district === district && l.taluk === taluk && l.hobli === hobli);

  const cropChoices = [
    { code: 'ragi', en: 'Ragi', kn: 'ರಾಗಿ' },
    { code: 'groundnut', en: 'Groundnut', kn: 'ಶೇಂಗಾ' },
    { code: 'red_gram', en: 'Red Gram (Tur)', kn: 'ತೊಗರಿ' },
    { code: 'maize', en: 'Maize', kn: 'ಮೆಕ್ಕೆಜೋಳ' },
    { code: 'paddy', en: 'Paddy', kn: 'ಭತ್ತ' },
    { code: 'coconut', en: 'Coconut', kn: 'ತೆಂಗು' },
    { code: 'tomato', en: 'Tomato', kn: 'ಟೊಮೆಟೊ' },
    { code: 'onion', en: 'Onion', kn: 'ಈರುಳ್ಳಿ' },
  ];

  const toggleCrop = (code: string) => {
    setCrops((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const matched = locations.find(
        (l) => l.district === district && l.taluk === taluk && l.hobli === hobli && l.village === village
      ) || locations.find((l) => l.district === district && l.taluk === taluk);

      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          district,
          taluk,
          hobli,
          village,
          farm_size_acres: Number(farmSize) || 1,
          soil_type: soilType,
          irrigation_type: irrigationType,
          crops_cultivated: crops,
          latitude: matched?.latitude ?? 13.741,
          longitude: matched?.longitude ?? 76.904,
          onboarding_completed: true,
        }),
      });
      onComplete(res.user);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF8] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <p className="text-xs font-semibold text-[#155E34] mb-1">{t.brandName}</p>
        <h1 className="text-2xl font-bold text-slate-900">{t.onboardingTitle}</h1>
        <p className="text-sm text-slate-600 mt-1 mb-6">{t.onboardingSub}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameLabel}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.farmSizeLabel}</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={farmSize}
                onChange={(e) => setFarmSize(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.districtLabel}</label>
              <select
                value={district}
                onChange={(e) => {
                  const d = e.target.value;
                  setDistrict(d);
                  const first = locations.find((l) => l.district === d);
                  if (first) {
                    setTaluk(first.taluk);
                    setHobli(first.hobli);
                    setVillage(first.village);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.talukLabel}</label>
              <select
                value={taluk}
                onChange={(e) => {
                  const tk = e.target.value;
                  setTaluk(tk);
                  const first = locations.find((l) => l.district === district && l.taluk === tk);
                  if (first) {
                    setHobli(first.hobli);
                    setVillage(first.village);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {taluks.map((tk) => (
                  <option key={tk} value={tk}>{tk}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.hobliLabel}</label>
              <select
                value={hobli}
                onChange={(e) => {
                  const hb = e.target.value;
                  setHobli(hb);
                  const first = locations.find((l) => l.district === district && l.taluk === taluk && l.hobli === hb);
                  if (first) setVillage(first.village);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {hoblis.map((hb) => (
                  <option key={hb} value={hb}>{hb}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t.villageLabel}</label>
              <select
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {villages.map((v) => (
                  <option key={v.id} value={v.village}>{lang === 'kn' ? v.village_kn : v.village}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.soilTypeLabel}</label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="Red Sandy Loam">Red Sandy Loam (ಕೆಂಪು ಮರಳು ಮಿಶ್ರಿತ ಮಣ್ಣು)</option>
                <option value="Red Clay Loam">Red Clay Loam (ಕೆಂಪು ಜೇಡಿ ಮಣ್ಣು)</option>
                <option value="Black Cotton Soil">Black Cotton Soil (ಕಪ್ಪು ಎರೆ ಮಣ್ಣು)</option>
                <option value="Alluvial Loam">Alluvial Loam (ಮೆಕ್ಕಲು ಮಣ್ಣು)</option>
                <option value="Unknown">Not Sure / Unknown (ತಿಳಿದಿಲ್ಲ)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.irrigationLabel}</label>
              <select
                value={irrigationType}
                onChange={(e) => setIrrigationType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="Rainfed">Rainfed Only (ಮಳೆಯಾಶ್ರಿತ)</option>
                <option value="Borewell + Rainfed">Borewell + Rainfed (ಬೋರ್‌ವೆಲ್ + ಮಳೆ)</option>
                <option value="Drip / Borewell">Drip Irrigation (ಹನಿ ನೀರಾವರಿ)</option>
                <option value="Canal / Tank">Canal / Tank Irrigation (ನಾಲೆ / ಕೆರೆ)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t.cropsCultivatedLabel}</label>
            <div className="flex flex-wrap gap-2">
              {cropChoices.map((c) => {
                const active = crops.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCrop(c.code)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium border transition-colors min-h-[40px] ${
                      active
                        ? 'bg-[#155E34] text-white border-[#155E34]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {lang === 'kn' ? c.kn : c.en}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#155E34] py-3.5 text-base font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[48px]"
          >
            {saving ? '...' : t.saveProfile}
          </button>
        </form>
      </div>
    </div>
  );
};
