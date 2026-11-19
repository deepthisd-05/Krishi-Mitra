import React from 'react';
import { Cloud, Database, RefreshCw, WifiOff } from 'lucide-react';
import type { Lang } from '../i18n/translations';

export type DataFreshnessState = 'live' | 'cached' | 'fallback' | 'offline_cached' | 'synced';

interface DataStatusStripProps {
  lang: Lang;
  state: DataFreshnessState;
  sourceLabel?: string;
  timestamp?: string | null;
  offlineHint?: string;
  loading?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
}

export const DataStatusStrip: React.FC<DataStatusStripProps> = ({
  lang,
  state,
  sourceLabel,
  timestamp,
  offlineHint,
  loading = false,
  onRefresh,
  refreshLabel,
}) => {
  const isOffline = state === 'offline_cached';
  const isFallback = state === 'fallback';
  const isCached = state === 'cached';

  const statusText = (() => {
    if (isOffline) {
      return lang === 'kn' ? 'ಆಫ್‌ಲೈನ್ · ಉಳಿಸಿದ ಸಂಗ್ರಹ ಪ್ರತಿ' : 'Offline · Saved Cache Snapshot';
    }
    if (isFallback) {
      return lang === 'kn' ? 'ಸಂಗ್ರಹಿತ ಫಾಲ್‌ಬ್ಯಾಕ್ ಪ್ರತಿ (ಲೈವ್ ಅಲ್ಲ)' : 'Stored Fallback Snapshot (Not Live)';
    }
    if (isCached) {
      return lang === 'kn' ? 'ಸಂಗ್ರಹಿತ (Cached) ಡೇಟಾ' : 'Cached Snapshot';
    }
    if (state === 'synced') {
      return lang === 'kn' ? 'ಆನ್‌ಲೈನ್ · ಖಾತೆಯೊಂದಿಗೆ ಸಿಂಕ್ ಆಗಿದೆ' : 'Online · Synced with Account';
    }
    return lang === 'kn' ? 'ಲೈವ್ ಡೇಟಾ' : 'Live Feed';
  })();

  const statusTone = isOffline || isFallback
    ? 'text-amber-800'
    : isCached
    ? 'text-amber-700'
    : 'text-emerald-700';

  const borderTone = isOffline || isFallback
    ? 'border-amber-200 bg-amber-50/70'
    : 'border-slate-200 bg-white';

  const formattedTime = timestamp ? new Date(timestamp).toLocaleString() : null;

  return (
    <div className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs ${borderTone}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <span className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${statusTone}`}>
          {isOffline ? (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          ) : isFallback || isCached ? (
            <Database className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Cloud className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{statusText}</span>
        </span>

        {sourceLabel && (
          <>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="text-slate-600 truncate max-w-[260px] sm:max-w-none">{sourceLabel}</span>
          </>
        )}

        {formattedTime && (
          <>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="text-slate-600 tabular-nums whitespace-nowrap">
              {lang === 'kn' ? 'ಸಮಯ:' : 'Updated:'} {formattedTime}
            </span>
          </>
        )}

        {offlineHint && (
          <span className="text-amber-900 font-medium block w-full sm:w-auto">{offlineHint}</span>
        )}
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 min-h-[36px] whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{refreshLabel || (lang === 'kn' ? 'ತಾಜಾಗೊಳಿಸಿ' : 'Refresh')}</span>
        </button>
      )}
    </div>
  );
};
