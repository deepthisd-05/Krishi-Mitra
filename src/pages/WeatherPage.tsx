import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  ShieldCheck,
  Thermometer,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { DataStatusStrip, type DataFreshnessState } from '../components/DataStatusStrip';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';
import type { WeatherData } from '../types';

interface WeatherPageProps {
  lang: Lang;
  weather: WeatherData | null;
  loading: boolean;
  isOnline: boolean;
  onRefresh: () => void;
}

export const WeatherPage: React.FC<WeatherPageProps> = ({ lang, weather, loading, isOnline, onRefresh }) => {
  const t = useT(lang);
  const [speakingAlerts, setSpeakingAlerts] = useState(false);
  const [missingTts, setMissingTts] = useState<MissingTtsVoiceInfo | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    stopSpeaking();
    setSpeakingAlerts(false);
    setMissingTts(null);
  }, [lang]);

  const weatherFreshness: DataFreshnessState =
    !isOnline || weather?._fromOfflineCache || weather?.api_status === 'unavailable'
      ? 'offline_cached'
      : weather?.api_status === 'cached'
      ? 'cached'
      : 'live';

  const handleSpeakAlerts = () => {
    if (!weather) return;
    if (speakingAlerts) {
      stopSpeaking();
      setSpeakingAlerts(false);
      return;
    }

    const alertsText =
      weather.alerts.length === 0
        ? lang === 'kn'
          ? `${weather.location_label}: ಪ್ರಸ್ತುತ ಯಾವುದೇ ತೀವ್ರ ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ. ${weather.spraying_reason_kn}`
          : `${weather.location_label}: No severe weather alerts right now. ${weather.spraying_reason_en}`
        : lang === 'kn'
        ? `${weather.location_label} ಕೃಷಿ ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳು: ${weather.alerts
            .map((a) => `${a.title_kn}. ${a.message_kn}`)
            .join(' ')}`
        : `${weather.location_label} agricultural weather alerts: ${weather.alerts
            .map((a) => `${a.title_en}. ${a.message_en}`)
            .join(' ')}`;

    const res = speakTextWithSpeechSynthesis({
      text: alertsText,
      lang,
      rate: 0.95,
      onStart: () => setSpeakingAlerts(true),
      onEnd: () => setSpeakingAlerts(false),
      onError: () => {
        setSpeakingAlerts(false);
        if (lang === 'kn') {
          setMissingTts(describeMissingTtsVoice('kn', 0));
        }
      },
    });

    if ((res.missingTargetVoice && res.locale === 'kn-IN') || (!res.started && lang === 'kn')) {
      setMissingTts(describeMissingTtsVoice('kn', res.voicesLoadedCount));
    } else {
      setMissingTts(null);
    }
  };

  const summaryBullets = weather?.current
    ? lang === 'kn'
      ? [
          `${weather.location_label}: ${weather.current.temperature_c.toFixed(1)}°C, ${weather.current.condition_kn}, ತೇವಾಂಶ ${weather.current.humidity_pct}%.`,
          weather.spraying_reason_kn,
          weather.alerts[0]
            ? `ಪ್ರಮುಖ ಎಚ್ಚರಿಕೆ: ${weather.alerts[0].title_kn}`
            : 'ಮುಂದಿನ 5 ದಿನಗಳಲ್ಲಿ ತೀವ್ರ ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ.',
        ]
      : [
          `${weather.location_label}: ${weather.current.temperature_c.toFixed(1)}°C, ${weather.current.condition_en}, humidity ${weather.current.humidity_pct}%.`,
          weather.spraying_reason_en,
          weather.alerts[0]
            ? `Top alert: ${weather.alerts[0].title_en}`
            : 'No severe agricultural weather alerts in the next 5 days.',
        ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.navWeather}</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          {weather
            ? `${weather.location_label} (${weather.latitude.toFixed(3)}, ${weather.longitude.toFixed(3)})`
            : t.requiresInternet}
        </p>
      </div>

      {/* Clear Live / Cached / Offline Status Strip & Manual Refresh */}
      <DataStatusStrip
        lang={lang}
        state={weatherFreshness}
        sourceLabel={weather?.provider}
        timestamp={weather?._cachedAt || weather?.last_updated}
        offlineHint={
          !isOnline || weather?._fromOfflineCache
            ? lang === 'kn'
              ? 'ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ — ಉಳಿಸಿದ ಹವಾಮಾನ ಪ್ರತಿಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.'
              : 'Offline — showing saved cached weather snapshot.'
            : undefined
        }
        loading={loading}
        onRefresh={onRefresh}
        refreshLabel={t.refreshWeather}
      />

      {weather?.error_message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {weather.error_message}
        </div>
      )}

      {!weather || !weather.current ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-600">
          {t.requiresInternet}
        </div>
      ) : (
        <>
          <VoiceSummaryCard
            lang={lang}
            title={lang === 'kn' ? 'ಇಂದಿನ ಹವಾಮಾನ ಮತ್ತು ಸಿಂಪಡಣೆ ಸಾರಾಂಶ' : 'Today’s Field Weather Summary'}
            bullets={summaryBullets}
            speechText={summaryBullets.join(' ')}
          />

          {/* Current Weather Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.temperature}</span>
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 mt-2">
                {weather.current.temperature_c.toFixed(1)}°C
              </p>
              <p className="text-xs text-slate-600 mt-1 truncate">
                {lang === 'kn' ? weather.current.condition_kn : weather.current.condition_en}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Droplets className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.humidity}</span>
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 mt-2">
                {weather.current.humidity_pct}%
              </p>
              <p className="text-xs text-slate-600 mt-1 tabular-nums truncate">
                {weather.daily[0]
                  ? `Min ${weather.daily[0].temp_min_c.toFixed(0)}° / Max ${weather.daily[0].temp_max_c.toFixed(0)}°`
                  : ''}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.rainfall}</span>
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 mt-2">
                {weather.current.rain_mm.toFixed(1)} mm
              </p>
              <p className="text-xs text-slate-600 mt-1 tabular-nums truncate">
                {weather.daily[0]
                  ? `${lang === 'kn' ? 'ಸಂಭವ:' : 'Rain prob:'} ${weather.daily[0].rain_prob_pct}%`
                  : ''}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Wind className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.windSpeed}</span>
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 mt-2">
                {weather.current.wind_kmh.toFixed(1)} <span className="text-sm sm:text-base font-medium">km/h</span>
              </p>
              <p className="text-xs text-slate-600 mt-1 truncate">
                {weather.spraying_suitable
                  ? lang === 'kn' ? 'ಸಿಂಪಡಣೆಗೆ ಸೂಕ್ತ' : 'Calm for spraying'
                  : lang === 'kn' ? 'ಸಿಂಪಡಣೆ ತಪ್ಪಿಸಿ' : 'Avoid spraying'}
              </p>
            </div>
          </div>

          {/* Spraying Suitability & Agricultural Alerts */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#155E34]" />
                {t.sprayingGuide}
              </h2>
              <p
                className={`mt-3 rounded-xl p-3.5 text-sm font-medium ${
                  weather.spraying_suitable
                    ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                    : 'bg-amber-50 text-amber-950 border border-amber-200'
                }`}
              >
                {lang === 'kn' ? weather.spraying_reason_kn : weather.spraying_reason_en}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  {lang === 'kn' ? 'ಕೃಷಿ ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳು' : 'Agricultural Weather Alerts'}
                </h2>
                <button
                  type="button"
                  onClick={handleSpeakAlerts}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 min-h-[38px] whitespace-nowrap"
                >
                  {speakingAlerts ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>
                    {speakingAlerts ? t.stopSpeaking : `${t.speakResponse} (${getSpeechLocale(lang)})`}
                  </span>
                </button>
              </div>

              {missingTts && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-bold">{missingTts.title}</p>
                  <p className="mt-0.5">{missingTts.message}</p>
                </div>
              )}

              {weather.alerts.length === 0 ? (
                <p className="text-sm text-slate-600">
                  {lang === 'kn'
                    ? 'ಪ್ರಸ್ತುತ ಯಾವುದೇ ತೀವ್ರ ಹವಾಮಾನ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ.'
                    : 'No severe agricultural weather alerts for the next 5 days.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {weather.alerts.map((al) => (
                    <div
                      key={al.id}
                      className={`rounded-xl p-3 text-xs border ${
                        al.severity === 'critical'
                          ? 'bg-red-50 border-red-200 text-red-950'
                          : al.severity === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-950'
                          : 'bg-blue-50 border-blue-200 text-blue-950'
                      }`}
                    >
                      <p className="font-bold">{lang === 'kn' ? al.title_kn : al.title_en}</p>
                      <p className="mt-1">{lang === 'kn' ? al.message_kn : al.message_en}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 7-Day Forecast Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">{t.forecast7Day}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">{t.reportedDate}</th>
                    <th className="px-4 py-3">{lang === 'kn' ? 'ಹವಾಮಾನ' : 'Condition'}</th>
                    <th className="px-4 py-3 text-right">{lang === 'kn' ? 'ಕನಿಷ್ಠ / ಗರಿಷ್ಠ' : 'Min / Max'}</th>
                    <th className="px-4 py-3 text-right">{lang === 'kn' ? 'ಮಳೆ (mm)' : 'Rain (mm)'}</th>
                    <th className="px-4 py-3 text-right">{lang === 'kn' ? 'ಮಳೆ %' : 'Rain Prob'}</th>
                    <th className="px-5 py-3 text-right">{t.windSpeed}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weather.daily.map((d) => (
                    <tr key={d.date} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium tabular-nums text-slate-900">{d.date}</td>
                      <td className="px-4 py-3 text-slate-700">{lang === 'kn' ? d.condition_kn : d.condition_en}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                        {d.temp_min_c.toFixed(0)}° / {d.temp_max_c.toFixed(0)}°C
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                        {d.rain_sum_mm.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {d.rain_prob_pct}%
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                        {d.wind_max_kmh.toFixed(0)} km/h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
