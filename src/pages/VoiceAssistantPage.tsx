import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  describeSpeechError,
  getSpeechLocale,
  getSpeechRecognitionConstructor,
  isEmbeddedIframe,
  selectSpeechVoice,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
  type SpeechErrorInfo,
  type SpeechRecognitionInstance,
} from '../lib/speech';
import type { CropCalendar, GovScheme, MarketPrice, UserProfile, WeatherData } from '../types';

interface VoicePageProps {
  lang: Lang;
  user: UserProfile;
  weather: WeatherData | null;
  calendars: CropCalendar[];
  prices: MarketPrice[];
  schemes: GovScheme[];
}

interface ChatMsg {
  id: string;
  sender: 'farmer' | 'assistant';
  text: string;
  source?: string;
}

export const VoiceAssistantPage: React.FC<VoicePageProps> = ({
  lang,
  user,
  weather,
  calendars,
  prices,
  schemes,
}) => {
  const t = useT(lang);
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [speechError, setSpeechError] = useState<SpeechErrorInfo | null>(null);
  const [missingTtsNotice, setMissingTtsNotice] = useState<MissingTtsVoiceInfo | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [inIframe, setInIframe] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const welcomeMessage = useMemo<ChatMsg>(
    () => ({
      id: 'welcome',
      sender: 'assistant',
      text:
        lang === 'kn'
          ? `ನಮಸ್ಕಾರ ${user.name}! ನಾನು ಕೃಷಿ ಮಿತ್ರ ಧ್ವನಿ ಸಹಾಯಕ. ನಿಮ್ಮ ${user.taluk} ತಾಲ್ಲೂಕಿನ ಹವಾಮಾನ, ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ, ಎಪಿಎಂಸಿ ದರ ಅಥವಾ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳ ಬಗ್ಗೆ ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ.`
          : `Hello ${user.name}! Ask me about your active crop calendar, ${user.taluk} weather & spraying suitability, APMC prices, or government schemes.`,
      source: 'Verified Krishi Mitra Knowledge Base',
    }),
    [lang, user.name, user.taluk]
  );

  const [messages, setMessages] = useState<ChatMsg[]>([welcomeMessage]);

  // Keep initial welcome message synced when user switches Kannada <-> English before asking a question
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [welcomeMessage];
      }
      return prev;
    });
  }, [welcomeMessage]);

  // Initialize SpeechRecognition support, iframe context, mic permission state, and SpeechSynthesis voices
  useEffect(() => {
    const embedded = isEmbeddedIframe();
    setInIframe(embedded);

    const Rec = getSpeechRecognitionConstructor();
    setSpeechSupported(Boolean(Rec));

    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permStatus) => {
          setMicPermissionState(permStatus.state);
          permStatus.onchange = () => {
            setMicPermissionState(permStatus.state);
            if (permStatus.state === 'granted') {
              setSpeechError(null);
            }
          };
        })
        .catch(() => {
          setMicPermissionState('unknown');
        });
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const list = window.speechSynthesis.getVoices();
        if (list.length > 0) {
          setAvailableVoices(list);
          if (selectSpeechVoice(list, 'kn')) {
            setMissingTtsNotice(null);
          }
        }
      };
      loadVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
        stopSpeaking();
        try {
          recognitionRef.current?.abort?.();
        } catch {
          // ignore
        }
      };
    }

    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // Cancel active recognition or stale errors when toggling language
  useEffect(() => {
    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
    }
    stopSpeaking();
    setSpeakingMsgId(null);
    setSpeechError(null);
    setMissingTtsNotice(null);
  }, [lang]);

  const activeLocale = getSpeechLocale(lang);
  const matchedVoice = useMemo(() => selectSpeechVoice(availableVoices, lang), [availableVoices, lang]);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speakMessage = (text: string, msgId: string, showMissingVoiceNotice = true) => {
    if (speakingMsgId === msgId) {
      stopSpeaking();
      setSpeakingMsgId(null);
      return;
    }

    const res = speakTextWithSpeechSynthesis({
      text,
      lang,
      rate: 0.95,
      onStart: () => setSpeakingMsgId(msgId),
      onEnd: () => setSpeakingMsgId((cur) => (cur === msgId ? null : cur)),
      onError: () => {
        setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
        if (lang === 'kn') {
          setMissingTtsNotice(describeMissingTtsVoice(lang, availableVoices.length));
        }
      },
    });

    if (showMissingVoiceNotice && res.missingTargetVoice && res.locale === 'kn-IN') {
      setMissingTtsNotice(describeMissingTtsVoice(lang, res.voicesLoadedCount));
    } else if (!res.missingTargetVoice) {
      setMissingTtsNotice(null);
    }
  };

  const answerAgricultureQuery = (qRaw: string): { text: string; source: string } => {
    const q = qRaw.toLowerCase();
    const isKn = lang === 'kn' || /[\u0C80-\u0CFF]/.test(qRaw);

    // 1. Weather / Spraying / Rain
    if (
      q.includes('weather') ||
      q.includes('rain') ||
      q.includes('spray') ||
      q.includes('temp') ||
      q.includes('ಹವಾಮಾನ') ||
      q.includes('ಮಳೆ') ||
      q.includes('ಸಿಂಪಡಣೆ') ||
      q.includes('ಔಷಧಿ') ||
      q.includes('ಬಿಸಿಲು')
    ) {
      if (!weather?.current) {
        return {
          text: isKn
            ? 'ಪ್ರಸ್ತುತ ಹವಾಮಾನ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಹವಾಮಾನ ವಿಭಾಗವನ್ನು ತಾಜಾಗೊಳಿಸಿ.'
            : 'Live weather data is currently unavailable. Please connect to the internet and refresh the Weather screen.',
          source: 'Weather Status Check',
        };
      }
      const c = weather.current;
      const d0 = weather.daily[0];
      return {
        text: isKn
          ? `${user.taluk} ತಾಲ್ಲೂಕಿನ ಪ್ರಸ್ತುತ ತಾಪಮಾನ ${c.temperature_c.toFixed(1)}°C (${c.condition_kn}), ತೇವಾಂಶ ${c.humidity_pct}%, ಗಾಳಿ ${c.wind_kmh.toFixed(0)} ಕಿ.ಮೀ/ಗಂ. ಇಂದಿನ ಮಳೆ ಸಂಭವ ${d0?.rain_prob_pct ?? 0}%. ${weather.spraying_reason_kn}`
          : `Current weather in ${user.taluk}: ${c.temperature_c.toFixed(1)}°C (${c.condition_en}), humidity ${c.humidity_pct}%, wind ${c.wind_kmh.toFixed(0)} km/h. Rain chance today: ${d0?.rain_prob_pct ?? 0}%. ${weather.spraying_reason_en}`,
        source: `${weather.provider} (${weather.api_status})`,
      };
    }

    // 2. Crop Calendar / Next Task / Irrigation
    if (
      q.includes('crop') ||
      q.includes('task') ||
      q.includes('schedule') ||
      q.includes('irrigat') ||
      q.includes('sow') ||
      q.includes('ragi') ||
      q.includes('groundnut') ||
      q.includes('ಬೆಳೆ') ||
      q.includes('ಕೆಲಸ') ||
      q.includes('ವೇಳಾಪಟ್ಟಿ') ||
      q.includes('ನೀರಾವರಿ') ||
      q.includes('ಬಿತ್ತನೆ') ||
      q.includes('ರಾಗಿ') ||
      q.includes('ಶೇಂಗಾ')
    ) {
      if (calendars.length === 0) {
        return {
          text: isKn
            ? 'ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಇನ್ನೂ ಸಕ್ರಿಯ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ ಇಲ್ಲ. "ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ" ವಿಭಾಗದಲ್ಲಿ ಹೊಸ ವೇಳಾಪಟ್ಟಿ ರಚಿಸಿ.'
            : 'You do not have an active crop calendar yet. Open the Crop Calendar tab to generate a 12-stage schedule.',
          source: 'Krishi Mitra Calendar',
        };
      }
      const cal = calendars[0];
      const nextTask = cal.tasks.find((tk) => tk.status === 'pending') || cal.tasks[cal.tasks.length - 1];
      return {
        text: isKn
          ? `ನಿಮ್ಮ ಸಕ್ರಿಯ ಬೆಳೆ ${cal.crop_name_kn} (${cal.variety}). ಮುಂದಿನ ಹಂತ: ${nextTask.title_kn} (ದಿನಾಂಕ: ${nextTask.due_date}). ಸಲಹೆ: ${nextTask.description_kn}`
          : `Your active crop is ${cal.crop_name_en} (${cal.variety}). Next stage: ${nextTask.title_en} (due ${nextTask.due_date}). Guidance: ${nextTask.description_en}`,
        source: cal.source_institution,
      };
    }

    // 3. APMC Market Prices
    if (
      q.includes('price') ||
      q.includes('market') ||
      q.includes('apmc') ||
      q.includes('mandi') ||
      q.includes('rate') ||
      q.includes('tomato') ||
      q.includes('onion') ||
      q.includes('copra') ||
      q.includes('ಬೆಲೆ') ||
      q.includes('ದರ') ||
      q.includes('ಮಾರುಕಟ್ಟೆ') ||
      q.includes('ಎಪಿಎಂಸಿ') ||
      q.includes('ಮಂಡಿ') ||
      q.includes('ಟೊಮೆಟೊ') ||
      q.includes('ಈರುಳ್ಳಿ') ||
      q.includes('ಕೊಬ್ಬರಿ')
    ) {
      const top = prices.slice(0, 3);
      if (top.length === 0) {
        return {
          text: isKn ? 'ಎಪಿಎಂಸಿ ಬೆಲೆ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ.' : 'No APMC price records cached yet.',
          source: 'APMC Directory',
        };
      }
      const summary = top
        .map((p) => {
          const modeKn =
            p.data_mode === 'live'
              ? 'ಲೈವ್'
              : p.data_mode === 'cached'
              ? 'ಕ್ಯಾಶ್'
              : 'ಫಾಲ್‌ಬ್ಯಾಕ್ ಉಲ್ಲೇಖ';
          const modeEn =
            p.data_mode === 'live'
              ? 'live'
              : p.data_mode === 'cached'
              ? 'cached'
              : 'fallback reference';
          return isKn
            ? `${p.apmc_name_kn}: ${p.crop_name_kn} ಮಾದರಿ ದರ ₹${p.modal_price}/ಕ್ವಿಂಟಲ್ (${p.reported_date}, ${modeKn})`
            : `${p.apmc_name}: ${p.crop_name_en} modal ₹${p.modal_price}/qtl (${p.reported_date}, ${modeEn})`;
        })
        .join(' · ');
      return {
        text: summary,
        source: top[0].source_name,
      };
    }

    // 4. Schemes
    if (
      q.includes('scheme') ||
      q.includes('subsidy') ||
      q.includes('insurance') ||
      q.includes('kisan') ||
      q.includes('ಯೋಜನೆ') ||
      q.includes('ಸಹಾಯಧನ') ||
      q.includes('ವಿಮೆ') ||
      q.includes('ಕಿಸಾನ್')
    ) {
      const list = schemes
        .slice(0, 3)
        .map((s) => (isKn ? `${s.name_kn} (${s.benefits_kn})` : `${s.name_en} (${s.benefits_en})`))
        .join(' · ');
      return {
        text: isKn
          ? `ಪ್ರಮುಖ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು: ${list}. ವಿವರವಾದ ದಾಖಲೆಗಳಿಗಾಗಿ "ಯೋಜನೆಗಳು" ವಿಭಾಗ ನೋಡಿ.`
          : `Key verified schemes: ${list}. Visit the Schemes tab for eligibility and official portals.`,
        source: 'Karnataka Dept. of Agriculture / Govt. Portals',
      };
    }

    // Default helpful fallback
    return {
      text: isKn
        ? 'ನಾನು ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ, ಇಂದಿನ ಹವಾಮಾನ ಮತ್ತು ಸಿಂಪಡಣೆ, ಎಪಿಎಂಸಿ ಬೆಲೆ ಹಾಗೂ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳ ಬಗ್ಗೆ ಉತ್ತರಿಸಬಲ್ಲೆ. ದಯವಿಟ್ಟು ಕೆಳಗಿನ ಉದಾಹರಣೆ ಪ್ರಶ್ನೆಗಳಲ್ಲಿ ಒಂದನ್ನು ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿ.'
        : 'I can answer questions on your active crop calendar tasks, live weather and spraying advice, APMC market prices, and government schemes. Try asking about any of those topics.',
      source: 'Verified Rule-Based Assistant (Consultation with local RSK/KVK recommended for field diagnostics)',
    };
  };

  const submitQuery = (textToAsk: string) => {
    const clean = textToAsk.trim();
    if (!clean) return;
    const reply = answerAgricultureQuery(clean);
    const assistantMsgId = `a-${Date.now() + 1}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'farmer', text: clean },
      { id: assistantMsgId, sender: 'assistant', text: reply.text, source: reply.source },
    ]);
    setQuery('');
    speakMessage(reply.text, assistantMsgId);
  };

  const toggleListening = () => {
    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    setSpeechError(null);

    const Rec = getSpeechRecognitionConstructor();
    if (!Rec) {
      setSpeechError(describeSpeechError('unsupported', lang, inIframe));
      inputRef.current?.focus();
      return;
    }

    if (micPermissionState === 'denied') {
      setSpeechError(describeSpeechError('not-allowed', lang, inIframe));
      inputRef.current?.focus();
      return;
    }

    // Stop TTS before listening so microphone doesn't capture browser speech output
    stopSpeaking();
    setSpeakingMsgId(null);

    const recognition = new Rec();
    // Explicitly bind kn-IN for Kannada and en-IN for English; never hi-IN
    recognition.lang = getSpeechLocale(lang);
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setListening(false);
      if (transcript.trim()) {
        setSpeechError(null);
        submitQuery(transcript);
      } else {
        setSpeechError(describeSpeechError('no-speech', lang, inIframe));
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicPermissionState('denied');
      }
      setSpeechError(describeSpeechError(event.error, lang, inIframe));
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      setListening(true);
      recognition.start();
    } catch (err) {
      setListening(false);
      const errName = err instanceof Error ? err.name : 'not-allowed';
      const code = /notallowed|security|permission/i.test(errName) ? 'not-allowed' : errName;
      if (code === 'not-allowed') setMicPermissionState('denied');
      setSpeechError(describeSpeechError(code, lang, inIframe));
      inputRef.current?.focus();
    }
  };

  const quickPrompts =
    lang === 'kn'
      ? [
          'ನನ್ನ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಯ ಮುಂದಿನ ಕೆಲಸ ಏನು?',
          'ಇಂದು ಹವಾಮಾನ ಹೇಗಿದೆ ಮತ್ತು ಔಷಧಿ ಸಿಂಪಡಣೆ ಮಾಡಬಹುದೇ?',
          'ಎಪಿಎಂಸಿ ಬೆಲೆ ಮಾಹಿತಿ ತಿಳಿಸಿ',
          'ರೈತರಿಗಾಗಿ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು ಯಾವುವು?',
        ]
      : [
          'What is my next crop calendar task?',
          'How is the weather and can I spray today?',
          'Show latest APMC crop prices',
          'Which government schemes can I check?',
        ];

  const activeError = speechError || (!speechSupported ? describeSpeechError('unsupported', lang, inIframe) : null);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.voiceTitle}</h1>
        <p className="text-sm text-slate-600 mt-1">{t.voiceSubtitle}</p>
      </div>

      {activeError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs text-amber-950 space-y-2">
          <p className="font-semibold">{activeError.title}</p>
          <p className="leading-relaxed text-amber-900">{activeError.message}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {activeError.suggestOpenTab && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-[#155E34] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t.openStandaloneTab}</span>
              </a>
            )}
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className="font-semibold text-amber-950 underline hover:no-underline"
              >
                {lang === 'kn' ? 'ಮೈಕ್ರೋಫೋನ್ ಮರುಪ್ರಯತ್ನಿಸಿ' : 'Retry Microphone'}
              </button>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="font-semibold text-slate-800 underline hover:no-underline"
            >
              {lang === 'kn' ? 'ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ' : 'Type Question Below'}
            </button>
          </div>
        </div>
      )}

      {/* Missing Kannada (kn-IN) TTS Voice Notice */}
      {missingTtsNotice && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs text-amber-950 space-y-2"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{missingTtsNotice.title}</p>
            <button
              type="button"
              onClick={() => setMissingTtsNotice(null)}
              aria-label={lang === 'kn' ? 'ಸೂಚನೆ ಮುಚ್ಚಿ' : 'Dismiss notice'}
              className="p-1 text-amber-800 hover:text-amber-950 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="leading-relaxed text-amber-900">{missingTtsNotice.message}</p>
          <ul className="list-disc pl-4 space-y-1 text-amber-900">
            {missingTtsNotice.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Voice Trigger & Quick Prompts */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors min-h-[48px] whitespace-nowrap ${
                  listening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-[#155E34] text-white hover:bg-[#114B29]'
                }`}
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                <span>{listening ? t.listening : t.tapToSpeak}</span>
              </button>
            )}
            {ttsSupported && (
              <button
                type="button"
                onClick={() => speakMessage(welcomeMessage.text, 'test-voice')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
              >
                {speakingMsgId === 'test-voice' ? (
                  <VolumeX className="w-4 h-4 text-[#155E34]" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#155E34]" />
                )}
                <span>
                  {speakingMsgId === 'test-voice'
                    ? t.stopSpeaking
                    : lang === 'kn'
                    ? 'ಕನ್ನಡ ಧ್ವನಿ ಪರೀಕ್ಷಿಸಿ (kn-IN)'
                    : 'Test Voice (en-IN)'}
                </span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
            <span>
              {lang === 'kn' ? `ಭಾಷೆ: ಕನ್ನಡ (${activeLocale})` : `Locale: ${activeLocale}`}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {matchedVoice
                ? `${matchedVoice.name} (${matchedVoice.lang})`
                : lang === 'kn'
                ? 'ಸಿಸ್ಟಮ್ kn-IN ಧ್ವನಿ (ಹಿಂದಿ ಫಾಲ್‌ಬ್ಯಾಕ್ ಇಲ್ಲ)'
                : 'System en-IN speech'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submitQuery(p)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-emerald-50 hover:border-emerald-700/30 transition-colors text-left min-h-[38px]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation History */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
          {messages.map((m) => {
            const isSpeakingThis = speakingMsgId === m.id;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'farmer' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.sender === 'farmer'
                      ? 'bg-[#155E34] text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.sender === 'assistant' && (
                    <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>{m.source}</span>
                      <button
                        type="button"
                        onClick={() => speakMessage(m.text, m.id)}
                        className="inline-flex items-center gap-1 font-semibold text-[#155E34] hover:underline shrink-0 whitespace-nowrap"
                      >
                        {isSpeakingThis ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isSpeakingThis ? t.stopSpeaking : t.speakResponse}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(query);
          }}
          className="flex items-center gap-2 pt-3 border-t border-slate-200"
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === 'kn'
                ? 'ನಿಮ್ಮ ಕೃಷಿ ಪ್ರಶ್ನೆಯನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ...'
                : 'Type your farming question in Kannada or English...'
            }
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#155E34]"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#155E34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[42px] whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{t.sendQuery}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
