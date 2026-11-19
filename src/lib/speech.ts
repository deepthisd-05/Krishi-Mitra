import type { Lang } from '../i18n/translations';

export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
  voiceURI?: string;
}

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal?: boolean;
  length: number;
}

export interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionInstance {
  lang: string;
  continuous?: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export interface SpeechErrorInfo {
  code: string;
  title: string;
  message: string;
  isPermissionIssue: boolean;
  suggestOpenTab: boolean;
}

export function getSpeechLocale(lang: Lang): 'kn-IN' | 'en-IN' {
  return lang === 'kn' ? 'kn-IN' : 'en-IN';
}

export function isHindiVoice(voice: Pick<VoiceLike, 'lang' | 'name'>): boolean {
  const normLang = (voice.lang || '').trim().toLowerCase().replace(/_/g, '-');
  const normName = (voice.name || '').trim().toLowerCase();
  if (normLang === 'hi' || normLang.startsWith('hi-')) return true;
  if (/\bhindi\b|हिन्दी/.test(normName)) return true;
  return false;
}

/**
 * Selects the best matching browser SpeechSynthesis voice for the active language.
 * - For Kannada ('kn'), strictly matches kn-IN / kn* / Kannada voices and NEVER falls back to hi-IN or other languages.
 * - For English ('en'), prefers en-IN, then other en-* voices, and NEVER matches hi-IN.
 */
export function selectSpeechVoice<T extends VoiceLike>(voices: ReadonlyArray<T>, lang: Lang): T | null {
  if (!voices || voices.length === 0) return null;

  const nonHindiVoices = voices.filter((v) => !isHindiVoice(v));

  if (lang === 'kn') {
    const exactKnIn = nonHindiVoices.find(
      (v) => v.lang.trim().toLowerCase().replace(/_/g, '-') === 'kn-in'
    );
    if (exactKnIn) return exactKnIn;

    const prefixKn = nonHindiVoices.find((v) => {
      const l = v.lang.trim().toLowerCase().replace(/_/g, '-');
      return l === 'kn' || l.startsWith('kn-');
    });
    if (prefixKn) return prefixKn;

    const namedKannada = nonHindiVoices.find((v) =>
      /kannada|ಕನ್ನಡ/i.test(v.name || '')
    );
    if (namedKannada) return namedKannada;

    return null;
  }

  const exactEnIn = nonHindiVoices.find(
    (v) => v.lang.trim().toLowerCase().replace(/_/g, '-') === 'en-in'
  );
  if (exactEnIn) return exactEnIn;

  const anyEnglish = nonHindiVoices.find((v) => {
    const l = v.lang.trim().toLowerCase().replace(/_/g, '-');
    return l === 'en' || l.startsWith('en-');
  });
  return anyEnglish ?? null;
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function resolveUtteranceLang(text: string, activeLang: Lang): Lang {
  if (activeLang === 'kn') return 'kn';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  return 'en';
}

export interface SpeakOptions {
  text: string;
  lang: Lang;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason: string) => void;
}

export interface SpeakResult {
  started: boolean;
  locale: 'kn-IN' | 'en-IN';
  voiceName: string | null;
  voiceLang: string | null;
  missingTargetVoice: boolean;
  voicesLoadedCount: number;
}

export interface MissingTtsVoiceInfo {
  locale: 'kn-IN' | 'en-IN';
  title: string;
  message: string;
  steps: string[];
}

export function describeMissingTtsVoice(lang: Lang, voicesCount: number): MissingTtsVoiceInfo {
  const isKn = lang === 'kn';
  return {
    locale: 'kn-IN',
    title: isKn
      ? 'ಈ ಸಾಧನದಲ್ಲಿ ಕನ್ನಡ (kn-IN) ಧ್ವನಿ (TTS) ಸ್ಥಾಪಿಸಲಾಗಿಲ್ಲ'
      : 'Kannada (kn-IN) Voice Not Installed on This Device',
    message: isKn
      ? `ನಿಮ್ಮ ಬ್ರೌಸರ್/ಸಾಧನದ Text-to-Speech ಎಂಜಿನ್‌ನಲ್ಲಿ ಕನ್ನಡ (kn-IN) ಧ್ವನಿ ಕಂಡುಬಂದಿಲ್ಲ${
          voicesCount > 0 ? ` (${voicesCount} ಇತರ ಧ್ವನಿಗಳು ಲಭ್ಯವಿವೆ, ಆದರೆ kn-IN ಇಲ್ಲ)` : ''
        }. ಕೃಷಿ ಮಿತ್ರ ಹಿಂದಿ (hi-IN) ಧ್ವನಿಗೆ ಬದಲಾಯಿಸುವುದಿಲ್ಲ. ಕನ್ನಡ ಪಠ್ಯ ಉತ್ತರಗಳು ಮತ್ತು ಕನ್ನಡ ಧ್ವನಿ ಇನ್‌ಪುಟ್ (kn-IN) ಎಂದಿನಂತೆ ಸಕ್ರಿಯವಾಗಿವೆ.`
      : `No Kannada (kn-IN) voice was found in speechSynthesis.getVoices()${
          voicesCount > 0 ? ` (${voicesCount} other voices found, none kn-IN)` : ''
        }. Krishi Mitra does not fall back to Hindi (hi-IN). Kannada text replies and kn-IN speech recognition remain active.`,
    steps: isKn
      ? [
          'Android: Settings → System (ಅಥವಾ Accessibility) → Text-to-speech output → Speech Services by Google (Gear ಐಕಾನ್) → Install voice data → Kannada (India / ಕನ್ನಡ) ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ.',
          'Windows / macOS / ChromeOS: ಸಿಸ್ಟಮ್ Language ಮತ್ತು Speech ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ Kannada (kn-IN) TTS ಧ್ವನಿ ಪ್ಯಾಕ್ ಸ್ಥಾಪಿಸಿ, ನಂತರ ಪುಟವನ್ನು ರಿಫ್ರೆಶ್ ಮಾಡಿ.',
        ]
      : [
          'Android: Settings → System (or Accessibility) → Text-to-speech output → Speech Services by Google (gear icon) → Install voice data → Download Kannada (India).',
          'Desktop (Windows / macOS / ChromeOS): Install the Kannada (kn-IN) speech voice pack in system Language & Speech settings, then reload this page.',
        ],
  };
}

export function speakTextWithSpeechSynthesis(opts: SpeakOptions): SpeakResult {
  const effectiveLang = resolveUtteranceLang(opts.text, opts.lang);
  const locale = getSpeechLocale(effectiveLang);

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    opts.onError?.(
      opts.lang === 'kn'
        ? 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಓದುವಿಕೆ (Speech Synthesis) ಲಭ್ಯವಿಲ್ಲ.'
        : 'Speech synthesis is not supported in this browser.'
    );
    return {
      started: false,
      locale,
      voiceName: null,
      voiceLang: null,
      missingTargetVoice: effectiveLang === 'kn',
      voicesLoadedCount: 0,
    };
  }

  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
  }

  const utter = new SpeechSynthesisUtterance(opts.text);
  utter.lang = locale;
  utter.rate = opts.rate ?? 0.95;

  const voices = synth.getVoices();
  const matchedVoice = selectSpeechVoice(voices, effectiveLang);
  if (matchedVoice) {
    utter.voice = matchedVoice;
    // Keep exact kn-IN / en-IN locale explicitly set when matching Kannada or English
    utter.lang = locale;
  }

  utter.onstart = () => opts.onStart?.();
  utter.onend = () => opts.onEnd?.();
  utter.onerror = (ev) => {
    // 'interrupted' / 'canceled' happens intentionally when user stops or starts new speech
    if (ev.error === 'interrupted' || ev.error === 'canceled') {
      opts.onEnd?.();
      return;
    }
    opts.onError?.(ev.error || 'synthesis-failed');
  };

  synth.speak(utter);

  return {
    started: true,
    locale,
    voiceName: matchedVoice?.name ?? null,
    voiceLang: matchedVoice?.lang ?? null,
    missingTargetVoice: effectiveLang === 'kn' && matchedVoice === null,
    voicesLoadedCount: voices.length,
  };
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function describeSpeechError(
  errorCode: string,
  lang: Lang,
  inIframe = isEmbeddedIframe()
): SpeechErrorInfo {
  const code = (errorCode || 'unknown').toLowerCase();
  const isKn = lang === 'kn';

  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'permission-denied') {
    return {
      code,
      isPermissionIssue: true,
      suggestOpenTab: inIframe,
      title: isKn
        ? 'ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿ ಲಭ್ಯವಾಗಿಲ್ಲ'
        : 'Microphone Permission Blocked',
      message: inIframe
        ? isKn
          ? 'ಈ ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆ ಫ್ರೇಮ್‌ನಲ್ಲಿ (iframe) ಅಥವಾ ಮೊಬೈಲ್ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ರೋಫೋನ್ ನಿರ್ಬಂಧಿತವಾಗಿದೆ. ಬ್ರೌಸರ್‌ನ ಸೈಟ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿಸಿ ಅಥವಾ ಹೊಸ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ. ಅಲ್ಲಿಯವರೆಗೆ ಕೆಳಗಿನ ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳು, ಟೈಪಿಂಗ್ ಮತ್ತು ಕನ್ನಡ ಓದಿ ಹೇಳಿ (Read Aloud) ಸೇವೆಗಳು ಸಂಪೂರ್ಣವಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತವೆ.'
          : 'Microphone access was blocked by your browser or this embedded preview frame. Allow microphone access in browser site settings, or open Krishi Mitra in a standalone browser tab. Quick prompts, text input, and Kannada Read Aloud still work normally below.'
        : isKn
        ? 'ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ವಿಳಾಸ ಪಟ್ಟಿಯ ಬೀಗದ ಐಕಾನ್ ಒತ್ತಿ ಮೈಕ್ರೋಫೋನ್ "Allow" ಮಾಡಿ, ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ / ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ಒತ್ತಿ.'
        : 'Microphone permission was denied. Enable microphone access in your browser site settings and tap again, or use quick prompts and text input below.',
    };
  }

  if (code === 'audio-capture') {
    return {
      code,
      isPermissionIssue: false,
      suggestOpenTab: false,
      title: isKn ? 'ಮೈಕ್ರೋಫೋನ್ ಸಾಧನ ಕಂಡುಬಂದಿಲ್ಲ' : 'No Microphone Detected',
      message: isKn
        ? 'ಈ ಸಾಧನದಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುವ ಮೈಕ್ರೋಫೋನ್ ಪತ್ತೆಯಾಗಿಲ್ಲ. ಹೆಡ್‌ಸೆಟ್/ಮೈಕ್ ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಅಥವಾ ಕೆಳಗೆ ಕನ್ನಡದಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ.'
        : 'No active microphone was found on this device. Check your device mic or type/tap a quick prompt below.',
    };
  }

  if (code === 'no-speech') {
    return {
      code,
      isPermissionIssue: false,
      suggestOpenTab: false,
      title: isKn ? 'ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ' : 'No Speech Detected',
      message: isKn
        ? 'ಯಾವುದೇ ಧ್ವನಿ ಗುರುತಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು "ಮಾತನಾಡಲು ಒತ್ತಿ (ಕನ್ನಡ)" ಬಟನ್ ಒತ್ತಿ ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ.'
        : 'No speech was detected. Tap the microphone button and speak clearly near your microphone.',
    };
  }

  if (code === 'network') {
    return {
      code,
      isPermissionIssue: false,
      suggestOpenTab: false,
      title: isKn ? 'ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ನೆಟ್‌ವರ್ಕ್ ದೋಷ' : 'Speech Recognition Network Error',
      message: isKn
        ? 'ಬ್ರೌಸರ್‌ನ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಸೇವೆಗೆ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಅಗತ್ಯವಿದೆ. ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕೆಳಗಿನ ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳು ಮತ್ತು ಟೈಪಿಂಗ್ ಬಳಸಬಹುದು.'
        : 'Browser speech-to-text requires an active connection to the browser speech service. Offline quick prompts and text input remain fully available below.',
    };
  }

  if (code === 'language-not-supported') {
    return {
      code,
      isPermissionIssue: false,
      suggestOpenTab: false,
      title: isKn ? 'ಕನ್ನಡ (kn-IN) ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ' : 'Kannada (kn-IN) Voice Input Unsupported',
      message: isKn
        ? 'ಈ ಬ್ರೌಸರ್ ಕನ್ನಡ (kn-IN) ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆಯನ್ನು ಬೆಂಬಲಿಸುತ್ತಿಲ್ಲ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ಒತ್ತಿ — ಉತ್ತರವನ್ನು ಕನ್ನಡದಲ್ಲೇ ನೀಡಲಾಗುತ್ತದೆ.'
        : 'This browser does not support kn-IN speech recognition directly. Please type or tap quick prompts below.',
    };
  }

  if (code === 'unsupported') {
    return {
      code,
      isPermissionIssue: false,
      suggestOpenTab: inIframe,
      title: isKn ? 'ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಲಭ್ಯವಿಲ್ಲ' : 'Voice Input Unavailable in This Browser',
      message: inIframe
        ? isKn
          ? 'ಈ ಬ್ರೌಸರ್ ಅಥವಾ ಎಂಬೆಡೆಡ್ ಪೂರ್ವವೀಕ್ಷಣೆಯಲ್ಲಿ SpeechRecognition ಲಭ್ಯವಿಲ್ಲ. Chrome/Android ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಹೊಸ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ ಮತ್ತು ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ಬಳಸಿ.'
          : 'Web Speech recognition is unavailable in this browser or embedded frame. Open in Chrome/Android in a standalone tab, or use text input, quick prompts, and Read Aloud below.'
        : isKn
        ? 'ಈ ಸಾಧನದಲ್ಲಿ ಬ್ರೌಸರ್ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ಒತ್ತಿ.'
        : 'Browser speech recognition is unavailable on this device. Please type your question or tap quick prompts below.',
    };
  }

  return {
    code,
    isPermissionIssue: false,
    suggestOpenTab: false,
    title: isKn ? 'ಧ್ವನಿ ಇನ್‌ಪುಟ್ ದೋಷ' : 'Voice Input Error',
    message: isKn
      ? `ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆಯಲ್ಲಿ ತಾಂತ್ರಿಕ ತೊಂದರೆ (${code}). ದಯವಿಟ್ಟು ಮರುಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.`
      : `Could not capture speech (${code}). Please try again or type your question below.`,
  };
}
