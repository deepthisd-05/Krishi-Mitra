import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CloudRain,
  Droplets,
  FlaskConical,
  Landmark,
  Leaf,
  MapPin,
  Mic,
  Store,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { UpcomingRemindersCard } from '../components/UpcomingRemindersCard';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';
import type {
  AgroShop,
  CalendarTask,
  CropCalendar,
  GovScheme,
  MarketPrice,
  UserProfile,
  WeatherData,
} from '../types';

export type NavTab =
  | 'dashboard'
  | 'calendar'
  | 'weather'
  | 'leaf_scan'
  | 'soil_health'
  | 'shops'
  | 'rentals'
  | 'schemes'
  | 'market'
  | 'voice'
  | 'location'
  | 'profile'
  | 'notifications'
  | 'admin';

interface DashboardProps {
  lang: Lang;
  user: UserProfile;
  weather: WeatherData | null;
  calendars: CropCalendar[];
  shops: AgroShop[];
  prices: MarketPrice[];
  marketFeedStatus?: 'live' | 'cached' | 'fallback';
  schemes: GovScheme[];
  isOnline?: boolean;
  pendingCount?: number;
  onNavigate: (tab: NavTab) => void;
  onToggleTask: (task: CalendarTask) => void;
  onRescheduleTask: (task: CalendarTask, newDueDate: string) => Promise<void> | void;
}

export const DashboardPage: React.FC<DashboardProps> = ({
  lang,
  user,
  weather,
  calendars,
  shops,
  prices,
  marketFeedStatus,
  schemes,
  isOnline = true,
  pendingCount = 0,
  onNavigate,
  onToggleTask,
  onRescheduleTask,
}) => {
  const t = useT(lang);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.greetingMorning : hour < 17 ? t.greetingAfternoon : t.greetingEvening;
  const [speakingAlert, setSpeakingAlert] = useState(false);
  const [missingTts, setMissingTts] = useState<MissingTtsVoiceInfo | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    stopSpeaking();
    setSpeakingAlert(false);
    setMissingTts(null);
  }, [lang]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const allTasks = calendars.flatMap((c) =>
    c.tasks.map((task) => ({
      ...task,
      crop_name_en: c.crop_name_en,
      crop_name_kn: c.crop_name_kn,
    }))
  );
  const upcomingTasks = allTasks
    .filter((task) => task.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  const firstUpcoming = upcomingTasks[0];
  const topWeatherAlert = weather?.alerts[0];
  const summaryBullets =
    lang === 'kn'
      ? [
          weather?.current
            ? `${user.taluk}: ${weather.current.temperature_c.toFixed(1)}°C (${weather.current.condition_kn}) · ${weather.spraying_reason_kn}`
            : `${user.taluk}, ${user.district}: ಹವಾಮಾನ ಮಾಹಿತಿಗಾಗಿ ಸಂಪರ್ಕಿಸಿ.`,
          firstUpcoming
            ? `ಮುಂದಿನ ಜ್ಞಾಪನೆ (${firstUpcoming.due_date}): ${firstUpcoming.crop_name_kn} — ${firstUpcoming.title_kn}`
            : 'ಇಂದಿಗೆ ಬಾಕಿ ಇರುವ ಬೆಳೆ ಜ್ಞಾಪನೆಗಳಿಲ್ಲ.',
          pendingCount > 0
            ? `${pendingCount} ಆಫ್‌ಲೈನ್ ಕಾರ್ಯಗಳು ಸಿಂಕ್ ಆಗಲು ಕಾಯುತ್ತಿವೆ.`
            : topWeatherAlert
            ? `ಎಚ್ಚರಿಕೆ: ${topWeatherAlert.title_kn}`
            : `ಸಕ್ರಿಯ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಗಳು: ${calendars.length}`,
        ]
      : [
          weather?.current
            ? `${user.taluk}: ${weather.current.temperature_c.toFixed(1)}°C (${weather.current.condition_en}) · ${weather.spraying_reason_en}`
            : `${user.taluk}, ${user.district}: Connect to refresh weather.`,
          firstUpcoming
            ? `Next reminder (${firstUpcoming.due_date}): ${firstUpcoming.crop_name_en} — ${firstUpcoming.title_en}`
            : 'No pending crop reminders right now.',
          pendingCount > 0
            ? `${pendingCount} offline actions queued to sync automatically.`
            : topWeatherAlert
            ? `Alert: ${topWeatherAlert.title_en}`
            : `Active crop calendars: ${calendars.length}`,
        ];

  const handleSpeakWeatherAlert = () => {
    if (!weather || weather.alerts.length === 0) return;
    if (speakingAlert) {
      stopSpeaking();
      setSpeakingAlert(false);
      return;
    }
    const text =
      lang === 'kn'
        ? weather.alerts.map((a) => `${a.title_kn}. ${a.message_kn}`).join(' ')
        : weather.alerts.map((a) => `${a.title_en}. ${a.message_en}`).join(' ');
    const res = speakTextWithSpeechSynthesis({
      text,
      lang,
      rate: 0.95,
      onStart: () => setSpeakingAlert(true),
      onEnd: () => setSpeakingAlert(false),
      onError: () => {
        setSpeakingAlert(false);
        if (lang === 'kn') setMissingTts(describeMissingTtsVoice('kn', 0));
      },
    });
    if ((res.missingTargetVoice && res.locale === 'kn-IN') || (!res.started && lang === 'kn')) {
      setMissingTts(describeMissingTtsVoice('kn', res.voicesLoadedCount));
    } else {
      setMissingTts(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Personalized Greeting & Quick Action Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#155E34]" />
            <span>
              {user.village}, {user.hobli}, {user.taluk}, {user.district} · {user.farm_size_acres} {lang === 'kn' ? 'ಎಕರೆ' : 'acres'}
            </span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            {greeting}, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {`${user.soil_type} · ${user.irrigation_type}`}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('voice')}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#155E34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>{t.openVoice}</span>
          </button>
          <button
            onClick={() => onNavigate('leaf_scan')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
          >
            <Leaf className="w-4 h-4 text-[#155E34] shrink-0" />
            <span className="truncate">{t.navLeafScan}</span>
          </button>
          <button
            onClick={() => onNavigate('soil_health')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
          >
            <FlaskConical className="w-4 h-4 text-[#155E34] shrink-0" />
            <span className="truncate">{t.navSoilHealth}</span>
          </button>
          <button
            onClick={() => onNavigate('calendar')}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
          >
            <CalendarDays className="w-4 h-4 text-[#155E34] shrink-0" />
            <span className="truncate">{t.navCalendar}</span>
          </button>
        </div>
      </div>

      {/* Concise Voice-Ready Mobile Field Summary */}
      <VoiceSummaryCard
        lang={lang}
        title={lang === 'kn' ? 'ಇಂದಿನ ಜಮೀನಿನ ತ್ವರಿತ ಸಾರಾಂಶ' : 'Today’s Farm Summary'}
        bullets={summaryBullets}
        speechText={summaryBullets.join(' ')}
      />

      {/* Weather + Irrigation + Active Crops 3-column summary */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Weather Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-[#155E34]" />
                {t.navWeather}
              </span>
              <span className="tabular-nums">
                {!isOnline || weather?._fromOfflineCache
                  ? lang === 'kn' ? 'ಆಫ್‌ಲೈನ್' : 'Offline'
                  : weather?.api_status === 'live'
                  ? 'Live'
                  : weather?.api_status === 'cached'
                  ? 'Cached'
                  : 'Offline'}
              </span>
            </div>

            {weather?.current ? (
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-slate-900">
                    {weather.current.temperature_c.toFixed(1)}°C
                  </span>
                  <span className="text-sm text-slate-600">
                    {lang === 'kn' ? weather.current.condition_kn : weather.current.condition_en}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 tabular-nums">
                  {t.humidity}: {weather.current.humidity_pct}% · {t.windSpeed}: {weather.current.wind_kmh.toFixed(0)} km/h
                </p>
                <p
                  className={`mt-3 text-xs font-medium rounded-lg px-2.5 py-2 ${
                    weather.spraying_suitable
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {lang === 'kn' ? weather.spraying_reason_kn : weather.spraying_reason_en}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {weather?.error_message || t.requiresInternet}
              </p>
            )}
          </div>
          <button
            onClick={() => onNavigate('weather')}
            className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left inline-flex items-center gap-1"
          >
            <span>{t.forecast7Day}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Irrigation Advisory */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-[#155E34]" />
              {t.nextIrrigation}
            </p>
            {weather?.alerts.find((a) => a.type === 'rain' || a.type === 'heavy_rain' || a.type === 'dry_spell') ? (
              (() => {
                const irrigationAlert = weather.alerts.find(
                  (a) => a.type === 'rain' || a.type === 'heavy_rain' || a.type === 'dry_spell'
                )!;
                return (
                  <div className="mt-3">
                    <p className="text-sm font-bold text-slate-900">
                      {lang === 'kn' ? irrigationAlert.title_kn : irrigationAlert.title_en}
                    </p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {lang === 'kn' ? irrigationAlert.message_kn : irrigationAlert.message_en}
                    </p>
                  </div>
                );
              })()
            ) : (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-900">
                  {lang === 'kn'
                    ? 'ಬೇರು ವಲಯದ ತೇವಾಂಶ ಪರಿಶೀಲಿಸಿ ನೀರು ಕೊಡಿ'
                    : 'Check root-zone moisture before irrigating'}
                </p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {lang === 'kn'
                    ? `ನಿಮ್ಮ ಜಮೀನಿನ ವಿಧ: ${user.irrigation_type}. ಬೆಳಿಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನೀರಾವರಿ ಸೂಕ್ತ.`
                    : `Profile mode: ${user.irrigation_type}. Early morning or evening irrigation minimizes evaporation loss.`}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => onNavigate('calendar')}
            className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left inline-flex items-center gap-1"
          >
            <span>{t.navCalendar}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Active Crops Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-[#155E34]" />
              {t.activeCrops}
            </p>
            {calendars.length > 0 ? (
              <div className="mt-3 space-y-2.5">
                {calendars.slice(0, 2).map((cal) => {
                  const done = cal.tasks.filter((tk) => tk.status === 'completed').length;
                  const pct = cal.tasks.length ? Math.round((done / cal.tasks.length) * 100) : 0;
                  return (
                    <div key={cal.id} className="pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                        <span>{lang === 'kn' ? cal.crop_name_kn : cal.crop_name_en}</span>
                        <span className="tabular-nums text-xs text-[#155E34]">{pct}%</span>
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                        {cal.variety} · {cal.sowing_date}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t.noActiveCalendars}</p>
            )}
          </div>
          <button
            onClick={() => onNavigate('calendar')}
            className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left inline-flex items-center gap-1"
          >
            <span>{t.createCalendarCta}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weather Alerts Banner with Read Aloud */}
      {weather && weather.alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950 space-y-1">
                <p className="font-semibold">
                  {lang === 'kn' ? weather.alerts[0].title_kn : weather.alerts[0].title_en}
                </p>
                <p className="text-xs text-amber-900">
                  {lang === 'kn' ? weather.alerts[0].message_kn : weather.alerts[0].message_en}
                </p>
                {weather.alerts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('weather')}
                    className="text-xs font-semibold text-amber-950 underline"
                  >
                    {lang === 'kn'
                      ? `ಎಲ್ಲಾ ${weather.alerts.length} ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳನ್ನು ನೋಡಿ →`
                      : `View all ${weather.alerts.length} weather advisories →`}
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSpeakWeatherAlert}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-700/25 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 min-h-[44px] whitespace-nowrap shrink-0"
            >
              {speakingAlert ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}
              <span>{speakingAlert ? t.stopSpeaking : `${t.speakResponse} (${getSpeechLocale(lang)})`}</span>
            </button>
          </div>
          {missingTts && (
            <div className="rounded-xl border border-amber-300 bg-white p-2.5 text-xs text-amber-950">
              <p className="font-bold">{missingTts.title}</p>
              <p>{missingTts.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Upcoming Crop Reminders with Mark Done, Snooze & Reschedule */}
      {calendars.length === 0 ? (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <p className="text-sm text-slate-600">{t.noActiveCalendars}</p>
          <button
            onClick={() => onNavigate('calendar')}
            className="mt-3 rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#114B29]"
          >
            {t.createCalendarCta}
          </button>
        </section>
      ) : (
        <UpcomingRemindersCard
          lang={lang}
          calendars={calendars}
          maxItems={5}
          onUpdateTaskStatus={(task) => onToggleTask(task)}
          onRescheduleTask={onRescheduleTask}
          onNavigateToCalendar={() => onNavigate('calendar')}
        />
      )}

      {/* Bottom 3-Card Discovery Row: Nearby Services, APMC Market, Schemes */}
      <div className="grid md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
              <Store className="w-4 h-4 text-[#155E34]" />
              {t.nearbyServices}
            </p>
            <div className="space-y-2.5">
              {shops.slice(0, 2).map((sh) => (
                <div key={sh.id} className="text-xs pb-2 border-b border-slate-100 last:border-0">
                  <p className="font-semibold text-slate-900">{lang === 'kn' ? sh.name_kn : sh.name}</p>
                  <p className="text-slate-500 mt-0.5 tabular-nums">
                    {sh.taluk} · {sh.distance_km ?? '–'} km · {sh.verification_status === 'verified' ? t.verifiedBadge : sh.category}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => onNavigate('shops')} className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left">
            {lang === 'kn' ? 'ನಕ್ಷೆಯಲ್ಲಿ ಅಂಗಡಿಗಳನ್ನು ನೋಡಿ →' : 'View Shops & Rentals →'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#155E34]" />
                {t.latestMarket}
              </span>
              <span
                className={
                  marketFeedStatus === 'live'
                    ? 'font-semibold text-emerald-700'
                    : 'font-semibold text-amber-700'
                }
              >
                {marketFeedStatus === 'live'
                  ? 'Live'
                  : marketFeedStatus === 'cached'
                  ? 'Cached'
                  : 'Fallback'}
              </span>
            </div>
            <div className="space-y-2.5">
              {prices.slice(0, 2).map((p) => (
                <div key={p.id} className="text-xs pb-2 border-b border-slate-100 last:border-0 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{lang === 'kn' ? p.crop_name_kn : p.crop_name_en}</p>
                    <p className="text-slate-500">
                      {lang === 'kn' ? p.apmc_name_kn : p.apmc_name} · {p.reported_date} ·{' '}
                      <span className={p.data_mode === 'live' ? 'text-emerald-700' : 'text-amber-700'}>
                        {p.data_mode === 'live'
                          ? t.dataOriginLive
                          : p.data_mode === 'cached'
                          ? t.dataOriginCached
                          : p.data_mode === 'admin_verified'
                          ? t.dataOriginAdmin
                          : lang === 'kn'
                          ? 'ಫಾಲ್‌ಬ್ಯಾಕ್'
                          : 'Fallback'}
                      </span>
                    </p>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">₹{p.modal_price}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => onNavigate('market')} className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left">
            {lang === 'kn' ? 'ಎಲ್ಲಾ ಎಪಿಎಂಸಿ ದರಗಳು →' : 'View APMC Prices →'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
              <Landmark className="w-4 h-4 text-[#155E34]" />
              {t.schemeHighlights}
            </p>
            <div className="space-y-2.5">
              {schemes.slice(0, 2).map((s) => (
                <div key={s.id} className="text-xs pb-2 border-b border-slate-100 last:border-0">
                  <p className="font-semibold text-slate-900">{lang === 'kn' ? s.name_kn : s.name_en}</p>
                  <p className="text-slate-500 mt-0.5">{s.level} · {t.lastVerified}: {s.last_verified_date}</p>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => onNavigate('schemes')} className="mt-4 text-xs font-semibold text-[#155E34] hover:underline text-left">
            {lang === 'kn' ? 'ಸರ್ಕಾರಿ ಯೋಜನೆಗಳನ್ನು ನೋಡಿ →' : 'Explore Schemes →'}
          </button>
        </div>
      </div>
    </div>
  );
};
