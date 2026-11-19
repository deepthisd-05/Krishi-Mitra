import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  selectSpeechVoice,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';

interface VoiceSummaryCardProps {
  lang: Lang;
  title?: string;
  bullets: string[];
  speechText: string;
  footerNote?: string;
}

export const VoiceSummaryCard: React.FC<VoiceSummaryCardProps> = ({
  lang,
  title,
  bullets,
  speechText,
  footerNote,
}) => {
  const t = useT(lang);
  const [speaking, setSpeaking] = useState(false);
  const [voicesCount, setVoicesCount] = useState(0);
  const [missingNotice, setMissingNotice] = useState<MissingTtsVoiceInfo | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const syncVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setVoicesCount(list.length);
        if (selectSpeechVoice(list, 'kn')) {
          setMissingNotice(null);
        }
      }
    };
    syncVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', syncVoices);
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    setMissingNotice(null);
  }, [lang, speechText]);

  const handleToggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }

    const res = speakTextWithSpeechSynthesis({
      text: speechText,
      lang,
      rate: 0.95,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        if (lang === 'kn') {
          setMissingNotice(describeMissingTtsVoice('kn', voicesCount));
        }
      },
    });

    if ((res.missingTargetVoice && res.locale === 'kn-IN') || (!res.started && lang === 'kn')) {
      setMissingNotice(describeMissingTtsVoice('kn', res.voicesLoadedCount));
    } else {
      setMissingNotice(null);
    }
  };

  const locale = getSpeechLocale(lang);

  return (
    <section className="bg-[#F1F7F3] rounded-2xl border border-emerald-800/15 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#155E34]">
            {t.voiceSummaryTitle}
          </p>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            {title || (lang === 'kn' ? 'ಈ ಪುಟದ ಪ್ರಮುಖ ಅಂಶಗಳು' : 'Key Takeaways at a Glance')}
          </h2>
        </div>

        <button
          type="button"
          onClick={handleToggleSpeak}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#155E34] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap shrink-0"
        >
          {speaking ? (
            <>
              <VolumeX className="w-4 h-4 shrink-0" />
              <span>{t.stopSpeaking}</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>
                {t.listenSummary} ({locale})
              </span>
            </>
          )}
        </button>
      </div>

      <ul className="space-y-1.5 text-sm text-slate-800">
        {bullets.map((line, idx) => (
          <li key={idx} className="flex items-start gap-2 leading-snug">
            <span className="text-[#155E34] font-bold mt-0.5" aria-hidden="true">
              •
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {footerNote && <p className="text-xs text-slate-600 pt-2 border-t border-emerald-800/10">{footerNote}</p>}

      {missingNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
          <p className="font-bold">{missingNotice.title}</p>
          <p>{missingNotice.message}</p>
        </div>
      )}
    </section>
  );
};
