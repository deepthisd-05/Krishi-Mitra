import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Landmark,
  Minus,
  Search,
  TrendingUp,
} from 'lucide-react';
import { DataStatusStrip, type DataFreshnessState } from '../components/DataStatusStrip';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import type { GovScheme, MarketPrice } from '../types';

export const SchemesPage: React.FC<{ lang: Lang; schemes: GovScheme[] }> = ({ lang, schemes }) => {
  const t = useT(lang);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  const filtered = useMemo(() => {
    return schemes.filter((s) => {
      if (levelFilter !== 'all' && !s.level.toLowerCase().includes(levelFilter.toLowerCase())) return false;
      if (query.trim()) {
        const hay = `${s.name_en} ${s.name_kn} ${s.category} ${s.description_en} ${s.description_kn}`.toLowerCase();
        return hay.includes(query.trim().toLowerCase());
      }
      return true;
    });
  }, [schemes, query, levelFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.navSchemes}</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          {lang === 'kn'
            ? 'ಕೇಂದ್ರ ಮತ್ತು ಕರ್ನಾಟಕ ರಾಜ್ಯ ಸರ್ಕಾರದ ಅಧಿಕೃತ ಕೃಷಿ ಯೋಜನೆಗಳು, ಅರ್ಹತೆ ಮತ್ತು ದಾಖಲೆಗಳು'
            : 'Official Central & Karnataka state agricultural schemes, eligibility, documents, and portal links'}
        </p>
      </div>

      {/* Search & Level Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#155E34]"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start">
          {[
            { key: 'all', label: lang === 'kn' ? 'ಎಲ್ಲಾ' : 'All' },
            { key: 'Karnataka', label: lang === 'kn' ? 'ರಾಜ್ಯ' : 'Karnataka' },
            { key: 'Central', label: lang === 'kn' ? 'ಕೇಂದ್ರ' : 'Central' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setLevelFilter(tab.key)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                levelFilter === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {filtered.map((s) => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{s.level} · {s.category}</span>
                <span className="tabular-nums">
                  {t.lastVerified}: {s.last_verified_date}
                </span>
              </div>

              <h2 className="text-lg font-bold text-slate-900 flex items-start gap-2">
                <Landmark className="w-5 h-5 text-[#155E34] shrink-0 mt-0.5" />
                <span>{lang === 'kn' ? s.name_kn : s.name_en}</span>
              </h2>

              <p className="text-sm text-slate-600 leading-relaxed">
                {lang === 'kn' ? s.description_kn : s.description_en}
              </p>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-700">
                <p>
                  <strong className="text-slate-900">{lang === 'kn' ? 'ಪ್ರಯೋಜನ:' : 'Benefits:'}</strong>{' '}
                  {lang === 'kn' ? s.benefits_kn : s.benefits_en}
                </p>
                <p>
                  <strong className="text-slate-900">{lang === 'kn' ? 'ಅರ್ಹತೆ:' : 'Eligibility:'}</strong>{' '}
                  {lang === 'kn' ? s.eligibility_kn : s.eligibility_en}
                </p>
                <p>
                  <strong className="text-slate-900">{lang === 'kn' ? 'ಅಗತ್ಯ ದಾಖಲೆಗಳು:' : 'Documents:'}</strong>{' '}
                  {lang === 'kn' ? s.documents_kn : s.documents_en}
                </p>
                <p>
                  <strong className="text-slate-900">{lang === 'kn' ? 'ಅರ್ಜಿ ವಿಧಾನ:' : 'How to apply:'}</strong>{' '}
                  {lang === 'kn' ? s.application_process_kn : s.application_process_en}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 truncate max-w-[65%]">{s.department}</span>
              <a
                href={s.official_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#155E34] hover:underline shrink-0"
              >
                <span>{t.officialPortal}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MarketPricesPage: React.FC<{
  lang: Lang;
  prices: MarketPrice[];
  marketData: import('../types').MarketPricesResponse | null;
  loading: boolean;
  isOnline: boolean;
  onRefresh: () => void;
}> = ({ lang, prices, marketData, loading, isOnline, onRefresh }) => {
  const t = useT(lang);
  const [cropFilter, setCropFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'live' | 'fallback'>('all');

  const districts = useMemo(
    () => Array.from(new Set(prices.map((p) => p.district))).sort(),
    [prices]
  );
  const crops = useMemo(
    () => Array.from(new Set(prices.map((p) => p.crop_code))).sort(),
    [prices]
  );

  const filtered = useMemo(() => {
    return prices.filter((p) => {
      if (cropFilter !== 'all' && p.crop_code !== cropFilter) return false;
      if (districtFilter !== 'all' && p.district !== districtFilter) return false;
      if (originFilter === 'live' && p.data_mode !== 'live' && p.data_mode !== 'cached' && p.data_mode !== 'admin_verified') {
        return false;
      }
      if (originFilter === 'fallback' && p.data_mode !== 'fallback') {
        return false;
      }
      return true;
    });
  }, [prices, cropFilter, districtFilter, originFilter]);

  const isOfflineCache = !isOnline || Boolean(marketData?._fromOfflineCache);
  const feedStatus = marketData?.feed_status ?? 'fallback';
  const marketFreshness: DataFreshnessState = isOfflineCache
    ? 'offline_cached'
    : feedStatus === 'live'
    ? 'live'
    : feedStatus === 'cached'
    ? 'cached'
    : 'fallback';

  const formatOriginLabel = (mode: string) => {
    if (mode === 'live') return t.dataOriginLive;
    if (mode === 'cached') return t.dataOriginCached;
    if (mode === 'admin_verified') return t.dataOriginAdmin;
    return t.dataOriginFallback;
  };

  const originColorClass = (mode: string) => {
    if (mode === 'live') return 'text-emerald-700 font-semibold';
    if (mode === 'cached') return 'text-amber-700 font-semibold';
    if (mode === 'admin_verified') return 'text-[#155E34] font-semibold';
    return 'text-amber-800 font-semibold';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.navMarket}</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          {marketData
            ? lang === 'kn'
              ? marketData.source_note_kn
              : marketData.source_note_en
            : lang === 'kn'
            ? 'ಕರ್ನಾಟಕ ಎಪಿಎಂಸಿ ಮಾರುಕಟ್ಟೆ ದರಗಳು'
            : 'Karnataka APMC wholesale market rates'}
        </p>
      </div>

      {/* Clear Offline / Fallback / Cached / Live Status Strip & Manual Refresh */}
      <DataStatusStrip
        lang={lang}
        state={marketFreshness}
        sourceLabel={
          marketData
            ? lang === 'kn'
              ? `${marketData.provider} · ಲೈವ್/ಕ್ಯಾಶ್: ${marketData.live_count + marketData.cached_count} · ಫಾಲ್‌ಬ್ಯಾಕ್: ${marketData.fallback_count}`
              : `${marketData.provider} · Live/Cached: ${marketData.live_count + marketData.cached_count} · Fallback: ${marketData.fallback_count}`
            : undefined
        }
        timestamp={marketData?._cachedAt || marketData?.last_updated}
        offlineHint={
          isOfflineCache
            ? lang === 'kn'
              ? 'ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕವಿಲ್ಲ — ಉಳಿಸಿದ APMC ದರಗಳ ಪ್ರತಿಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.'
              : 'Offline — displaying saved APMC market snapshot from device cache.'
            : undefined
        }
        loading={loading}
        onRefresh={onRefresh}
        refreshLabel={t.refreshMarket}
      />

      {filtered.length > 0 && (() => {
        const topRows = filtered.slice(0, 3);
        const bullets = topRows.map((r) =>
          lang === 'kn'
            ? `${r.apmc_name_kn}: ${r.crop_name_kn} ಮಾದರಿ ದರ ₹${r.modal_price}/ಕ್ವಿಂಟಾಲ್ (${r.reported_date})`
            : `${r.apmc_name}: ${r.crop_name_en} modal ₹${r.modal_price}/qtl (${r.reported_date})`
        );
        return (
          <VoiceSummaryCard
            lang={lang}
            title={lang === 'kn' ? 'ಪ್ರಮುಖ ಎಪಿಎಂಸಿ ದರ ಸಾರಾಂಶ' : 'Key APMC Rate Highlights'}
            bullets={bullets}
            speechText={bullets.join(' ')}
          />
        );
      })()}

      {/* Honest Fallback / Unreachable Feed Warning Banner */}
      {(isOfflineCache || feedStatus !== 'live' || (marketData?.fallback_count ?? 0) > 0 || marketData?.error_message) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 space-y-1">
          {!isOfflineCache && feedStatus === 'fallback' && (
            <p className="font-semibold">
              {lang === 'kn'
                ? 'ಎಚ್ಚರಿಕೆ: ಹೊರಗಿನ ಲೈವ್ ಮಾರುಕಟ್ಟೆ ಫೀಡ್ ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗಲಿಲ್ಲ — ಸಂಗ್ರಹಿತ ಫಾಲ್‌ಬ್ಯಾಕ್ ದರಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ (ಲೈವ್ ದರಗಳಲ್ಲ).'
                : 'External live market feed unreachable — displaying stored fallback snapshots (NOT live prices).'}
            </p>
          )}
          {!isOfflineCache && feedStatus === 'cached' && (
            <p className="font-semibold">
              {lang === 'kn'
                ? 'ಸಂಗ್ರಹಿತ (Cached) ಫೀಡ್ ತೋರಿಸಲಾಗುತ್ತಿದೆ — ಹೊಸ ದರಗಳಿಗಾಗಿ "ಲೈವ್ ದರ ತಾಜಾಗೊಳಿಸಿ" ಒತ್ತಿರಿ.'
                : 'Showing cached external feed snapshot — click Refresh Live Prices to fetch fresh daily updates.'}
            </p>
          )}
          {marketData?.missing_live_targets && marketData.missing_live_targets.length > 0 && feedStatus !== 'fallback' && (
            <p className="text-amber-900">
              {lang === 'kn'
                ? `ಇಂದಿನ ಸಾರ್ವಜನಿಕ ಫೀಡ್‌ನಲ್ಲಿ ವರದಿ ಲಭ್ಯವಿಲ್ಲದ ಗುರಿ ಮಾರುಕಟ್ಟೆಗಳು: ${marketData.missing_live_targets.join(', ')} (ಇವುಗಳಿಗೆ ಹಳೆಯ ದಿನಾಂಕದ "ಫಾಲ್‌ಬ್ಯಾಕ್" ಉಲ್ಲೇಖ ದರ ತೋರಿಸಲಾಗಿದೆ).`
                : `Target yards without a reported trade in today's public feed (${marketData.missing_live_targets.join(', ')}) show clearly marked "Stored Fallback (Not Live)" reference rows with their original dates.`}
            </p>
          )}
          {marketData?.error_message && (
            <p className="text-amber-800 font-mono text-[11px]">{marketData.error_message}</p>
          )}
          {marketData?.source_url && (
            <p>
              <a
                href={marketData.source_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#155E34] hover:underline inline-flex items-center gap-1"
              >
                <span>{marketData.provider}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[42px]"
          >
            <option value="all">{lang === 'kn' ? 'ಎಲ್ಲಾ ಜಿಲ್ಲೆಗಳು' : 'All Districts'}</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[42px]"
          >
            <option value="all">{lang === 'kn' ? 'ಎಲ್ಲಾ ಬೆಳೆಗಳು' : 'All Commodities'}</option>
            {crops.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ').toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          {[
            { key: 'all' as const, label: lang === 'kn' ? 'ಎಲ್ಲಾ' : 'All Rows' },
            { key: 'live' as const, label: lang === 'kn' ? 'ಲೈವ್ / ಕ್ಯಾಶ್' : 'Live / Cached' },
            { key: 'fallback' as const, label: lang === 'kn' ? 'ಫಾಲ್‌ಬ್ಯಾಕ್' : 'Fallback Only' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setOriginFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                originFilter === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">{lang === 'kn' ? 'ಬೆಳೆ ಮತ್ತು ತಳಿ' : 'Commodity & Variety'}</th>
                <th className="px-4 py-3.5">{lang === 'kn' ? 'ಮಾರುಕಟ್ಟೆ (APMC)' : 'APMC Market'}</th>
                <th className="px-4 py-3.5 text-right">{t.minPrice}</th>
                <th className="px-4 py-3.5 text-right">{t.maxPrice}</th>
                <th className="px-4 py-3.5 text-right">{t.modalPrice}</th>
                <th className="px-4 py-3.5">{lang === 'kn' ? 'ದಿನಾಂಕ ಮತ್ತು ಮೂಲ' : 'Reported Date & Source'}</th>
                <th className="px-5 py-3.5 text-right">{lang === 'kn' ? 'ಪ್ರವೃತ್ತಿ' : 'Trend'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    {lang === 'kn'
                      ? 'ಆಯ್ದ ಫಿಲ್ಟರ್‌ಗಳಿಗೆ ಯಾವುದೇ ದರಗಳು ಕಂಡುಬಂದಿಲ್ಲ.'
                      : 'No APMC price rows match your current filter selection.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const spread = Math.max(1, p.max_price - p.min_price);
                  const modalPct = Math.min(100, Math.max(0, ((p.modal_price - p.min_price) / spread) * 100));
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{lang === 'kn' ? p.crop_name_kn : p.crop_name_en}</p>
                        <p className="text-xs text-slate-500">{p.variety}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-800">{lang === 'kn' ? p.apmc_name_kn : p.apmc_name}</p>
                        <p className="text-xs text-slate-500">{p.district}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600">
                        ₹{p.min_price.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600">
                        ₹{p.max_price.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-mono font-bold tabular-nums text-slate-900">
                          ₹{p.modal_price.toLocaleString('en-IN')}
                        </span>
                        <div className="w-20 h-1.5 bg-slate-200 rounded-full ml-auto mt-1 overflow-hidden">
                          <div className="h-full bg-[#155E34] rounded-full" style={{ width: `${modalPct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono tabular-nums text-slate-900 font-medium">{p.reported_date}</span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className={originColorClass(p.data_mode)}>
                            {formatOriginLabel(p.data_mode)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 max-w-[240px] truncate mt-0.5" title={p.source_name}>
                          {p.source_url ? (
                            <a href={p.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                              {p.source_name}
                            </a>
                          ) : (
                            p.source_name
                          )}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            p.trend === 'up'
                              ? 'text-emerald-700'
                              : p.trend === 'down'
                              ? 'text-red-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {p.trend === 'up' ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : p.trend === 'down' ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : (
                            <Minus className="w-3.5 h-3.5" />
                          )}
                          <span>{p.trend}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[#155E34] shrink-0" />
        <span>
          {lang === 'kn'
            ? 'ಗಮನಿಸಿ: ಬೆಲೆಗಳು ಪ್ರತಿ ಕ್ವಿಂಟಲ್‌ಗೆ (100 ಕೆ.ಜಿ). ಪ್ರತಿ ಸಾಲಿನ ಮೂಲ (ಲೈವ್ / ಕ್ಯಾಶ್ / ಫಾಲ್‌ಬ್ಯಾಕ್) ಮತ್ತು ವರದಿ ದಿನಾಂಕವನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತೋರಿಸಲಾಗಿದೆ; ಮಾರಾಟಕ್ಕೆ ಮುನ್ನ ಸ್ಥಳೀಯ APMC ಟೆಂಡರ್ ದರ ದೃಢಪಡಿಸಿಕೊಳ್ಳಿ.'
            : 'Prices are per Quintal (100 kg). Exact source, origin (Live / Cached / Fallback), and reporting dates are shown per row; verify daily lot tenders at your local APMC yard before transport.'}
        </span>
      </div>
    </div>
  );
};
