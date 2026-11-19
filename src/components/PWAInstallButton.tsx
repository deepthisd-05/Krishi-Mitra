import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { Lang } from '../i18n/translations';

export const PWAInstallButton: React.FC<{ lang: Lang }> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/20 bg-emerald-50 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="sm:hidden">{lang === 'kn' ? 'ಇನ್‌ಸ್ಟಾಲ್' : 'Install'}</span>
        <span className="hidden sm:inline">{lang === 'kn' ? 'ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden">{lang === 'kn' ? 'ಇನ್‌ಸ್ಟಾಲ್' : 'Install'}</span>
          <span className="hidden sm:inline">{lang === 'kn' ? 'iPhone ಇನ್‌ಸ್ಟಾಲ್' : 'Install iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {lang === 'kn' ? 'iPhone / iPad ನಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ' : 'Install Krishi Mitra on iPhone / iPad'}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {lang === 'kn'
                  ? '1. Safari ಯಲ್ಲಿ Share ಬಟನ್ ಒತ್ತಿ. 2. ಕೆಳಗೆ ಸ್ಕ್ರಾಲ್ ಮಾಡಿ "Add to Home Screen" ಆಯ್ಕೆಮಾಡಿ.'
                  : '1. Tap the Share button in Safari toolbar. 2. Scroll down and tap "Add to Home Screen".'}
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#155E34] py-2.5 text-sm font-medium text-white hover:bg-[#114B29]"
              >
                {lang === 'kn' ? 'ಮುಚ್ಚಿ' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
