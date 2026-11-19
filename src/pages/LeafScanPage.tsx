import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  Camera,
  CheckCircle2,
  ExternalLink,
  Leaf,
  Loader2,
  ShieldAlert,
  Sprout,
  Trash2,
  Upload,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { DataStatusStrip } from '../components/DataStatusStrip';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import {
  describeCameraError,
  isEmbeddedIframe,
  isLiveCameraSupported,
  stopMediaStream,
  type CameraErrorInfo,
} from '../lib/camera';
import { captureVideoFrameToDataUrl, compressLeafImageFile, estimateDataUrlKb } from '../lib/imageUtils';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  selectSpeechVoice,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';
import type { CropCalendar, CropInfo, LeafScan, LeafScansResponse, UserProfile } from '../types';

interface LeafScanPageProps {
  lang: Lang;
  user: UserProfile;
  crops: CropInfo[];
  calendars: CropCalendar[];
  scans: LeafScan[];
  scansMeta: Pick<LeafScansResponse, 'aiConfigured' | 'fetched_at' | '_fromOfflineCache' | '_cachedAt'> | null;
  scansLoading: boolean;
  isOnline: boolean;
  onRefreshScans: () => void;
  onScansChanged: (nextScans: LeafScan[]) => void;
  onCalendarUpdated: () => Promise<void>;
  onQueueAddToCalendar?: (scan: LeafScan, dueDate: string, calendarId: number | null) => Promise<void>;
  onNavigateToCalendar: () => void;
}

const PRIORITY_CROP_ORDER = ['tomato', 'groundnut', 'ragi', 'red_gram', 'maize', 'coconut', 'black_gram'];

export const LeafScanPage: React.FC<LeafScanPageProps> = ({
  lang,
  user,
  crops,
  calendars,
  scans,
  scansMeta,
  scansLoading,
  isOnline,
  onRefreshScans,
  onScansChanged,
  onCalendarUpdated,
  onQueueAddToCalendar,
  onNavigateToCalendar,
}) => {
  const t = useT(lang);

  const orderedCrops = useMemo(() => {
    const fallbackList: Array<{ code: string; name_en: string; name_kn: string }> = [
      { code: 'tomato', name_en: 'Tomato', name_kn: 'ಟೊಮೆಟೊ' },
      { code: 'groundnut', name_en: 'Groundnut (Peanut)', name_kn: 'ಶೇಂಗಾ (ಕಡಲೆಕಾಯಿ)' },
      { code: 'ragi', name_en: 'Ragi (Finger Millet)', name_kn: 'ರಾಗಿ' },
      { code: 'red_gram', name_en: 'Red Gram (Tur / Arhar)', name_kn: 'ತೊಗರಿ' },
      { code: 'maize', name_en: 'Maize (Corn)', name_kn: 'ಮೆಕ್ಕೆಜೋಳ' },
      { code: 'coconut', name_en: 'Coconut', name_kn: 'ತೆಂಗು' },
      { code: 'black_gram', name_en: 'Black Gram (Urad)', name_kn: 'ಉದ್ದು' },
    ];
    const source = crops.length > 0 ? crops : fallbackList;
    return [...source].sort((a, b) => {
      const ia = PRIORITY_CROP_ORDER.indexOf(a.code);
      const ib = PRIORITY_CROP_ORDER.indexOf(b.code);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name_en.localeCompare(b.name_en);
    });
  }, [crops]);

  const [selectedCrop, setSelectedCrop] = useState('tomato');
  const [fieldNotes, setFieldNotes] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [imageKb, setImageKb] = useState<number>(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const [selectedScanId, setSelectedScanId] = useState<number | null>(scans[0]?.id ?? null);
  const [targetCalendarId, setTargetCalendarId] = useState<string>(calendars[0] ? String(calendars[0].id) : 'auto');
  const [taskDueDate, setTaskDueDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  // Live camera viewfinder state & refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const cameraIntentRef = useRef(false);
  const lastCameraErrRef = useRef<unknown>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);

  // Read Aloud state
  const [speakingScanId, setSpeakingScanId] = useState<number | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [missingTtsNotice, setMissingTtsNotice] = useState<MissingTtsVoiceInfo | null>(null);

  useEffect(() => {
    if (!selectedScanId && scans.length > 0) {
      setSelectedScanId(scans[0].id);
    } else if (selectedScanId && !scans.some((s) => s.id === selectedScanId)) {
      setSelectedScanId(scans[0]?.id ?? null);
    }
  }, [scans, selectedScanId]);

  const activeScan = useMemo(
    () => scans.find((s) => s.id === selectedScanId) ?? scans[0] ?? null,
    [scans, selectedScanId]
  );

  // Sync default calendar dropdown when active scan changes
  useEffect(() => {
    if (!activeScan) return;
    const match = calendars.find((c) => c.crop_code === activeScan.crop_code);
    if (match) {
      setTargetCalendarId(String(match.id));
    } else if (calendars.length > 0) {
      setTargetCalendarId(String(calendars[0].id));
    } else {
      setTargetCalendarId('auto');
    }
    const offset = Math.max(0, Math.min(14, activeScan.recommended_days_offset || 1));
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    setTaskDueDate(d.toISOString().slice(0, 10));
  }, [activeScan?.id, calendars]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
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
    };
  }, []);

  const stopLiveCamera = useCallback(() => {
    cameraIntentRef.current = false;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraStream(null);
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cameraIntentRef.current = false;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!cameraOpen || !cameraStream || !videoEl) return;
    if (videoEl.srcObject !== cameraStream) {
      videoEl.srcObject = cameraStream;
    }
    videoEl.play().catch(() => {
      // AutoPlay muted playsInline normally begins automatically
    });
  }, [cameraOpen, cameraStream]);

  useEffect(() => {
    stopSpeaking();
    setSpeakingScanId(null);
    setMissingTtsNotice(null);
    if (lastCameraErrRef.current !== null) {
      setCameraError(describeCameraError(lastCameraErrRef.current, lang, isEmbeddedIframe()));
    }
  }, [lang]);

  const handleToggleLiveCamera = async () => {
    if (cameraOpen || cameraStarting) {
      stopLiveCamera();
      return;
    }

    setErrorMsg('');
    setFeedbackMsg('');
    setCameraError(null);
    lastCameraErrRef.current = null;

    const inIframe = isEmbeddedIframe();
    if (!isLiveCameraSupported()) {
      const errObj = 'unsupported';
      lastCameraErrRef.current = errObj;
      setCameraError(describeCameraError(errObj, lang, inIframe));
      return;
    }

    cameraIntentRef.current = true;
    setCameraStarting(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch (err) {
        const errName =
          err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
        if (errName === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }

      if (!mountedRef.current || !cameraIntentRef.current) {
        stopMediaStream(stream);
        return;
      }

      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
      setCameraStarting(false);
    } catch (err) {
      if (!mountedRef.current) return;
      cameraIntentRef.current = false;
      setCameraStarting(false);
      setCameraOpen(false);
      lastCameraErrRef.current = err;
      setCameraError(describeCameraError(err, lang, inIframe));
    }
  };

  const handleCaptureFrame = () => {
    setErrorMsg('');
    setFeedbackMsg('');
    if (!videoRef.current) return;
    try {
      const captured = captureVideoFrameToDataUrl(videoRef.current, 1024, 0.82);
      setPreviewDataUrl(captured);
      setImageKb(estimateDataUrlKb(captured));
      stopLiveCamera();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : lang === 'kn'
          ? 'ಕ್ಯಾಮೆರಾ ಚಿತ್ರ ಸೆರೆಹಿಡಿಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
          : 'Unable to capture frame from live camera.'
      );
    }
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setFeedbackMsg('');
    setCameraError(null);
    lastCameraErrRef.current = null;
    stopLiveCamera();
    try {
      const compressed = await compressLeafImageFile(file, 1024, 0.82);
      setPreviewDataUrl(compressed);
      setImageKb(estimateDataUrlKb(compressed));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read leaf photo.');
    }
  };

  const handleAnalyzeLeaf = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedbackMsg('');

    if (!previewDataUrl) {
      setErrorMsg(
        lang === 'kn'
          ? 'ದಯವಿಟ್ಟು ಮೊದಲು ಎಲೆಯ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ಕ್ಯಾಮೆರಾದಿಂದ ಸೆರೆಹಿಡಿಯಿರಿ.'
          : 'Please upload or capture a leaf photo first.'
      );
      return;
    }

    if (!isOnline) {
      setErrorMsg(
        lang === 'kn'
          ? 'ಹೊಸ ಎಲೆ ಚಿತ್ರ ವಿಶ್ಲೇಷಣೆಗೆ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಅಗತ್ಯವಿದೆ. ಕೆಳಗೆ ನಿಮ್ಮ ಹಿಂದಿನ ಉಳಿಸಿದ ಸ್ಕ್ಯಾನ್‌ಗಳನ್ನು ನೋಡಬಹುದು.'
          : 'Internet connection is required to analyze a new leaf photo. Your saved scans remain available below.'
      );
      return;
    }

    setAnalyzing(true);
    try {
      const res = await apiFetch<{ scan: LeafScan }>('/api/leaf-scans', {
        method: 'POST',
        body: JSON.stringify({
          crop_code: selectedCrop,
          image_data_url: previewDataUrl,
          field_notes: fieldNotes,
        }),
      });
      const updated = [res.scan, ...scans];
      onScansChanged(updated);
      setSelectedScanId(res.scan.id);
      setPreviewDataUrl('');
      setImageKb(0);
      setFieldNotes('');
      setFeedbackMsg(
        lang === 'kn'
          ? 'ಎಲೆ ಪರೀಕ್ಷೆ ಪೂರ್ಣಗೊಂಡಿದೆ ಮತ್ತು ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.'
          : 'Leaf analysis completed and saved to your scan history.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Leaf diagnosis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReadAloud = (scan: LeafScan) => {
    if (speakingScanId === scan.id) {
      stopSpeaking();
      setSpeakingScanId(null);
      return;
    }

    const text =
      lang === 'kn'
        ? [
            `${scan.crop_name_kn}: ${scan.condition_name_kn}.`,
            `ಕಂಡುಬಂದ ಲಕ್ಷಣಗಳು: ${scan.visible_symptoms_kn}.`,
            `ಗೊಬ್ಬರ ಮತ್ತು ಮಣ್ಣಿನ ಸಲಹೆ: ${scan.fertilizer_guidance_kn}.`,
            `ಸಿಂಪಡಣೆ ಮತ್ತು ಆರೈಕೆ: ${scan.spray_care_guidance_kn}.`,
            `ಮುಖ್ಯ ಸೂಚನೆ: ${scan.rsk_confirmation_kn}`,
          ].join(' ')
        : [
            `${scan.crop_name_en}: ${scan.condition_name_en}.`,
            `Visible symptoms: ${scan.visible_symptoms_en}.`,
            `Fertilizer and soil guidance: ${scan.fertilizer_guidance_en}.`,
            `Spray and care guidance: ${scan.spray_care_guidance_en}.`,
            `Important reminder: ${scan.rsk_confirmation_en}`,
          ].join(' ');

    const res = speakTextWithSpeechSynthesis({
      text,
      lang,
      rate: 0.95,
      onStart: () => setSpeakingScanId(scan.id),
      onEnd: () => setSpeakingScanId((cur) => (cur === scan.id ? null : cur)),
      onError: () => {
        setSpeakingScanId((cur) => (cur === scan.id ? null : cur));
        if (lang === 'kn') {
          setMissingTtsNotice(describeMissingTtsVoice('kn', availableVoices.length));
        }
      },
    });

    if (res.missingTargetVoice && res.locale === 'kn-IN') {
      setMissingTtsNotice(describeMissingTtsVoice('kn', res.voicesLoadedCount));
    } else if (!res.started && lang === 'kn') {
      setMissingTtsNotice(describeMissingTtsVoice('kn', res.voicesLoadedCount));
    } else {
      setMissingTtsNotice(null);
    }
  };

  const handleAddToCalendar = async (scan: LeafScan) => {
    setErrorMsg('');
    setFeedbackMsg('');
    const chosenCalendarId = targetCalendarId !== 'auto' ? Number(targetCalendarId) : null;

    if (!isOnline) {
      if (onQueueAddToCalendar) {
        setAddingToCalendar(true);
        try {
          await onQueueAddToCalendar(scan, taskDueDate, chosenCalendarId);
          setFeedbackMsg(
            lang === 'kn'
              ? 'ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ — ಇಂಟರ್ನೆಟ್ ಬಂದಾಗ ಈ ಆರೈಕೆ ಹಂತ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಗೆ ಸ್ವಯಂ ಸಿಂಕ್ ಆಗುತ್ತದೆ.'
              : 'Care step queued offline — it will sync to your Crop Calendar automatically when back online.'
          );
        } finally {
          setAddingToCalendar(false);
        }
        return;
      }
      setErrorMsg(t.requiresInternet);
      return;
    }

    setAddingToCalendar(true);
    try {
      const payload: Record<string, unknown> = {
        due_date: taskDueDate,
        auto_create_calendar: true,
      };
      if (chosenCalendarId !== null) {
        payload.calendar_id = chosenCalendarId;
      }

      const res = await apiFetch<{ scan: LeafScan; calendar_id: number }>(`/api/leaf-scans/${scan.id}/add-to-calendar`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const updated = scans.map((s) => (s.id === scan.id ? res.scan : s));
      onScansChanged(updated);
      await onCalendarUpdated();
      setFeedbackMsg(
        lang === 'kn'
          ? 'ಆರೈಕೆ / ಗೊಬ್ಬರ ಹಂತವನ್ನು ನಿಮ್ಮ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ.'
          : 'Care & fertilizer task added directly to your Crop Calendar.'
      );
    } catch (err) {
      if (onQueueAddToCalendar) {
        await onQueueAddToCalendar(scan, taskDueDate, chosenCalendarId);
        setFeedbackMsg(
          lang === 'kn'
            ? 'ಸರ್ವರ್ ಸಂಪರ್ಕ ಲಭ್ಯವಿಲ್ಲ — ಆರೈಕೆ ಹಂತವನ್ನು ಆಫ್‌ಲೈನ್ ಸಿಂಕ್ ಕ್ಯೂನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.'
            : 'Saved in offline sync queue — will sync to your Crop Calendar automatically.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Could not add task to Crop Calendar.');
      }
    } finally {
      setAddingToCalendar(false);
    }
  };

  const handleDeleteScan = async (scanId: number) => {
    if (!isOnline) {
      setErrorMsg(t.requiresInternet);
      return;
    }
    try {
      await apiFetch(`/api/leaf-scans/${scanId}`, { method: 'DELETE' });
      const next = scans.filter((s) => s.id !== scanId);
      onScansChanged(next);
      if (speakingScanId === scanId) {
        stopSpeaking();
        setSpeakingScanId(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete saved scan.');
    }
  };

  const freshnessState = !isOnline || scansMeta?._fromOfflineCache ? 'offline_cached' : 'synced';
  const statusTimestamp = scansMeta?._cachedAt || scansMeta?.fetched_at || null;
  const activeLocale = getSpeechLocale(lang);

  const formatCategory = (cat: string) => {
    const map: Record<string, { en: string; kn: string }> = {
      fungal: { en: 'Fungal Disease', kn: 'ಶಿಲೀಂಧ್ರ ರೋಗ' },
      bacterial: { en: 'Bacterial Disease', kn: 'ಬ್ಯಾಕ್ಟೀರಿಯಾ ರೋಗ' },
      viral: { en: 'Viral Disease', kn: 'ವೈರಸ್ ರೋಗ' },
      pest: { en: 'Pest Damage', kn: 'ಕೀಟ ಹಾನಿ' },
      nutrient_deficiency: { en: 'Nutrient Deficiency', kn: 'ಪೋಷಕಾಂಶ ಕೊರತೆ' },
      abiotic_stress: { en: 'Moisture / Weather Stress', kn: 'ತೇವಾಂಶ / ಹವಾಮಾನ ಒತ್ತಡ' },
      healthy: { en: 'Healthy Leaf', kn: 'ಆರೋಗ್ಯಕರ ಎಲೆ' },
      uncertain: { en: 'Needs Closer Check', kn: 'ಹೆಚ್ಚಿನ ಪರಿಶೀಲನೆ ಅಗತ್ಯ' },
    };
    const hit = map[cat] || { en: cat, kn: cat };
    return lang === 'kn' ? hit.kn : hit.en;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.leafScanTitle}</h1>
          <p className="text-sm text-slate-600 mt-0.5">{t.leafScanSubtitle}</p>
        </div>
      </div>

      {/* Offline / Synced Status Bar with Manual Refresh */}
      <DataStatusStrip
        lang={lang}
        state={freshnessState}
        sourceLabel={
          lang === 'kn'
            ? `ಉಳಿಸಿದ ಸ್ಕ್ಯಾನ್‌ಗಳು: ${scans.length}`
            : `Saved Scans: ${scans.length}`
        }
        timestamp={statusTimestamp}
        offlineHint={
          !isOnline
            ? lang === 'kn'
              ? 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದಿದ್ದರೂ ನಿಮ್ಮ ಉಳಿಸಿದ ಸ್ಕ್ಯಾನ್‌ಗಳನ್ನು ನೋಡಬಹುದು. ಹೊಸ ಫೋಟೋ ವಿಶ್ಲೇಷಣೆಗೆ ಇಂಟರ್ನೆಟ್ ಅಗತ್ಯವಿದೆ.'
              : 'Saved scan history is available offline. Connect to the internet to analyze a new leaf photo.'
            : undefined
        }
        loading={scansLoading}
        onRefresh={onRefreshScans}
        refreshLabel={t.refreshScans}
      />

      {scansMeta && !scansMeta.aiConfigured && isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            {lang === 'kn'
              ? 'ಸರ್ವರ್‌ನಲ್ಲಿ GEMINI_API_KEY ಹೊಂದಿಸಿಲ್ಲ. ಎಲೆ ಚಿತ್ರ ವಿಶ್ಲೇಷಣೆ ಸಕ್ರಿಯಗೊಳಿಸಲು Settings > Secrets ನಲ್ಲಿ GEMINI_API_KEY ಸೇರಿಸಿ.'
              : 'GEMINI_API_KEY is not configured on the server yet. Add GEMINI_API_KEY in Settings > Secrets to analyze new leaf photos.'}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {feedbackMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Main 2-Column Workspace on Desktop, Stacked on Mobile */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Upload / Capture & Crop Selection Form */}
        <form
          onSubmit={handleAnalyzeLeaf}
          className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[#155E34]" />
              <span>{lang === 'kn' ? 'ಹೊಸ ಎಲೆ ಪರೀಕ್ಷೆ' : 'New Leaf Scan'}</span>
            </h2>
            <span className="text-xs text-slate-500 truncate">{user.taluk}, {user.district}</span>
          </div>

          {/* Crop Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.selectCrop}
            </label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#155E34]"
            >
              {orderedCrops.map((c) => (
                <option key={c.code} value={c.code}>
                  {lang === 'kn' ? `${c.name_kn} (${c.name_en})` : `${c.name_en} (${c.name_kn})`}
                </option>
              ))}
            </select>
          </div>

          {/* Photo Capture / Upload / Live Camera Viewfinder Controls */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              {lang === 'kn' ? 'ಎಲೆಯ ಫೋಟೋ (ಸ್ಪಷ್ಟ ಬೆಳಕಿನಲ್ಲಿ)' : 'Leaf Photo (Clear Daylight Preferred)'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-2.5 sm:px-3 py-2.5 text-xs font-semibold text-slate-800 cursor-pointer min-h-[44px] min-w-0 text-center">
                <Camera className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.capturePhoto}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelected}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-2.5 sm:px-3 py-2.5 text-xs font-semibold text-slate-800 cursor-pointer min-h-[44px] min-w-0 text-center">
                <Upload className="w-4 h-4 text-[#155E34] shrink-0" />
                <span className="truncate">{t.uploadPhoto}</span>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelected}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleToggleLiveCamera}
                className={`col-span-2 w-full flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold min-h-[44px] transition-colors ${
                  cameraOpen || cameraStarting
                    ? 'border-[#155E34] bg-emerald-50 text-[#155E34]'
                    : 'border-emerald-700/25 bg-emerald-50/60 hover:bg-emerald-50 text-[#155E34]'
                }`}
              >
                {cameraStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{t.startingCamera}</span>
                  </>
                ) : cameraOpen ? (
                  <>
                    <VideoOff className="w-4 h-4 shrink-0" />
                    <span>{t.closeCamera}</span>
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4 shrink-0" />
                    <span>{t.liveCamera}</span>
                  </>
                )}
              </button>
            </div>

            {cameraError && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 space-y-2"
              >
                <p className="font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{cameraError.title}</span>
                </p>
                <p className="leading-relaxed text-amber-900">{cameraError.message}</p>
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  {cameraError.suggestUpload && (
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#155E34] hover:underline min-h-[32px]"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t.uploadPhoto}</span>
                    </button>
                  )}
                  {cameraError.suggestOpenTab && typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-amber-950 underline hover:no-underline min-h-[32px]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{t.openStandaloneTab}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {cameraOpen && (
              <div className="rounded-xl border border-emerald-700/25 bg-[#F8FAF8] p-3 space-y-2.5">
                <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-950 aspect-[4/3] max-h-72 w-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-[11px] text-slate-600">
                  {lang === 'kn'
                    ? 'ರೋಗ ಅಥವಾ ಬಣ್ಣ ಬದಲಾದ ಎಲೆಯನ್ನು ಚೌಕಟ್ಟಿನ ಮಧ್ಯದಲ್ಲಿ ಹಿಡಿದು "ಚಿತ್ರ ಸೆರೆಹಿಡಿಯಿರಿ" ಒತ್ತಿ.'
                    : 'Hold the affected leaf clearly in natural light and tap Capture Frame.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#155E34] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#114B29] min-h-[44px] whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>{t.captureFrame}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveCamera}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap shrink-0"
                  >
                    <X className="w-4 h-4 shrink-0" />
                    <span>{t.closeCamera}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Image Preview */}
          {previewDataUrl && !cameraOpen ? (
            <div className="space-y-1.5">
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3] max-h-60 w-full">
                <img
                  src={previewDataUrl}
                  alt={lang === 'kn' ? 'ಆಯ್ದ ಎಲೆಯ ಫೋಟೋ' : 'Selected crop leaf preview'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="tabular-nums">{imageKb} KB · JPEG</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDataUrl('');
                    setImageKb(0);
                  }}
                  className="text-red-700 hover:underline font-medium"
                >
                  {lang === 'kn' ? 'ಫೋಟೋ ತೆಗೆಯಿರಿ' : 'Remove photo'}
                </button>
              </div>
            </div>
          ) : !cameraOpen ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-[#F8FAF8] p-6 text-center text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">
                {lang === 'kn'
                  ? 'ರೋಗ ಅಥವಾ ಬಣ್ಣ ಬದಲಾವಣೆ ಕಾಣಿಸುವ ಎಲೆಯ ಹತ್ತಿರದ ಫೋಟೋ ತೆಗೆಯಿರಿ'
                  : 'Take or upload a close-up photo of the affected leaf in natural light'}
              </p>
              <p>
                {lang === 'kn'
                  ? 'ಚಿತ್ರವನ್ನು ಮೊಬೈಲ್ ಡೇಟಾ ಉಳಿಸಲು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಡಿಮೆ ಗಾತ್ರಕ್ಕೆ ಹೊಂದಿಸಲಾಗುತ್ತದೆ.'
                  : 'Photos are automatically resized on your phone for low-bandwidth rural uploads.'}
              </p>
            </div>
          ) : null}

          {/* Optional Field Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.fieldNotesOptional}
            </label>
            <textarea
              rows={2}
              value={fieldNotes}
              onChange={(e) => setFieldNotes(e.target.value)}
              placeholder={
                lang === 'kn'
                  ? 'ಉದಾ: ಕೆಳಗಿನ ಎಲೆಗಳು ಹಳದಿಯಾಗಿವೆ, ಕಳೆದ 3 ದಿನಗಳಿಂದ ಮಳೆಯಾಗಿದೆ...'
                  : 'e.g. Lower leaves yellowing after 3 days of rain, spots spreading fast...'
              }
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#155E34]"
            />
          </div>

          <button
            type="submit"
            disabled={analyzing || !previewDataUrl || !isOnline}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#155E34] px-4 py-3 text-sm font-semibold text-white hover:bg-[#114B29] disabled:opacity-50 min-h-[46px] whitespace-nowrap"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.analyzingLeaf}</span>
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-4 h-4" />
                <span>{lang === 'kn' ? 'ವಿಶ್ಲೇಷಣೆಗೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು' : 'Connect Online to Analyze'}</span>
              </>
            ) : (
              <>
                <Sprout className="w-4 h-4" />
                <span>{t.analyzeLeafBtn}</span>
              </>
            )}
          </button>
        </form>

        {/* Active Diagnosis Result */}
        <div className="lg:col-span-7 space-y-5">
          {!activeScan ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
              <Leaf className="w-8 h-8 text-[#155E34] mx-auto" />
              <p className="text-base font-bold text-slate-900">
                {lang === 'kn' ? 'ಇನ್ನೂ ಯಾವುದೇ ಎಲೆ ಪರೀಕ್ಷೆ ದಾಖಲಾಗಿಲ್ಲ' : 'No saved leaf scans yet'}
              </p>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {lang === 'kn'
                  ? 'ಬೆಳೆ ಆಯ್ಕೆ ಮಾಡಿ ಎಲೆಯ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ. ರೋಗ ಪತ್ತೆ, ಗೊಬ್ಬರ/ಸಿಂಪಡಣೆ ಸಲಹೆ ಮತ್ತು ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ ಜ್ಞಾಪನೆಯನ್ನು ಇಲ್ಲಿ ಪಡೆಯಿರಿ.'
                  : 'Select your crop and upload a leaf photo to get disease or deficiency identification, fertilizer & care guidance, Read Aloud audio, and a 1-tap Crop Calendar reminder.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
              {/* Header + Read Aloud */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <img
                    src={activeScan.image_data_url}
                    alt={lang === 'kn' ? activeScan.condition_name_kn : activeScan.condition_name_en}
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-semibold text-[#155E34]">
                        {lang === 'kn' ? activeScan.crop_name_kn : activeScan.crop_name_en}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatCategory(activeScan.category)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {lang === 'kn' ? 'ವಿಶ್ವಾಸಾರ್ಹತೆ:' : 'Confidence:'}{' '}
                        <strong className="text-slate-900">{activeScan.confidence_pct}%</strong>
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      {lang === 'kn' ? activeScan.condition_name_kn : activeScan.condition_name_en}
                    </h2>

                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {new Date(activeScan.created_at.replace(' ', 'T') + (activeScan.created_at.includes('T') ? '' : 'Z')).toLocaleString()}
                      {activeScan.field_notes ? ` · ${activeScan.field_notes}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleReadAloud(activeScan)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 min-h-[42px] whitespace-nowrap shrink-0 self-start"
                >
                  {speakingScanId === activeScan.id ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      <span>{t.stopSpeaking}</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>{t.speakResponse} ({activeLocale})</span>
                    </>
                  )}
                </button>
              </div>

              {missingTtsNotice && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-1.5">
                  <p className="font-bold">{missingTtsNotice.title}</p>
                  <p>{missingTtsNotice.message}</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {missingTtsNotice.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <VoiceSummaryCard
                lang={lang}
                title={
                  lang === 'kn'
                    ? `${activeScan.crop_name_kn} — ತ್ವರಿತ ಸಾರಾಂಶ`
                    : `${activeScan.crop_name_en} — Quick Field Takeaway`
                }
                bullets={
                  lang === 'kn'
                    ? [
                        `${activeScan.condition_name_kn} (${activeScan.confidence_pct}% ವಿಶ್ವಾಸಾರ್ಹತೆ).`,
                        activeScan.fertilizer_guidance_kn,
                        activeScan.rsk_confirmation_kn,
                      ]
                    : [
                        `${activeScan.condition_name_en} (${activeScan.confidence_pct}% confidence).`,
                        activeScan.fertilizer_guidance_en,
                        activeScan.rsk_confirmation_en,
                      ]
                }
                speechText={
                  lang === 'kn'
                    ? `${activeScan.crop_name_kn}: ${activeScan.condition_name_kn}. ${activeScan.fertilizer_guidance_kn} ${activeScan.rsk_confirmation_kn}`
                    : `${activeScan.crop_name_en}: ${activeScan.condition_name_en}. ${activeScan.fertilizer_guidance_en} ${activeScan.rsk_confirmation_en}`
                }
              />

              {/* Visible Symptom Match */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  {lang === 'kn' ? 'ಕಂಡುಬಂದ ಎಲೆಯ ಲಕ್ಷಣಗಳು' : 'Visible Symptom Match'}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {lang === 'kn' ? activeScan.visible_symptoms_kn : activeScan.visible_symptoms_en}
                </p>
              </div>

              {/* Practical Fertilizer & Spray Care Guidance */}
              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <div className="rounded-xl bg-[#F8FAF8] p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-[#155E34]">
                    {lang === 'kn' ? 'ಗೊಬ್ಬರ ಮತ್ತು ಮಣ್ಣಿನ ಪೋಷಣೆ ಸಲಹೆ' : 'Fertilizer & Soil Nutrition Guidance'}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {lang === 'kn' ? activeScan.fertilizer_guidance_kn : activeScan.fertilizer_guidance_en}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F8FAF8] p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-[#155E34]">
                    {lang === 'kn' ? 'ಸಿಂಪಡಣೆ ಮತ್ತು ಕ್ಷೇತ್ರ ಆರೈಕೆ' : 'Spray & Field Care Guidance'}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {lang === 'kn' ? activeScan.spray_care_guidance_kn : activeScan.spray_care_guidance_en}
                  </p>
                </div>
              </div>

              {/* Confidence / Uncertainty Notes */}
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900">
                  {lang === 'kn' ? 'ವಿಶ್ವಾಸಾರ್ಹತೆ ಮತ್ತು ಅನಿಶ್ಚಿತತೆ ಟಿಪ್ಪಣಿ:' : 'Confidence & Uncertainty Notes:'}{' '}
                  <span className="capitalize">({activeScan.confidence_level}, {activeScan.confidence_pct}%)</span>
                </p>
                <p>{lang === 'kn' ? activeScan.confidence_notes_kn : activeScan.confidence_notes_en}</p>
              </div>

              {/* Mandatory RSK / Agriculture Officer Confirmation Notice */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    {lang === 'kn'
                      ? 'ಸಿಂಪಡಣೆಗೆ ಮುನ್ನ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರ (RSK) ದೃಢೀಕರಣ'
                      : 'Confirm at Raitha Samparka Kendra (RSK) Before Spraying'}
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    {lang === 'kn' ? activeScan.rsk_confirmation_kn : activeScan.rsk_confirmation_en}
                  </p>
                </div>
              </div>

              {/* Add Recommended Care / Fertilizer Step to Crop Calendar */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {lang === 'kn'
                        ? 'ಈ ಆರೈಕೆ ಹಂತವನ್ನು ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿಸಿ'
                        : 'Add Recommended Care Step to Crop Calendar'}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {lang === 'kn'
                        ? activeScan.recommended_task_title_kn
                        : activeScan.recommended_task_title_en}
                    </p>
                  </div>

                  {activeScan.added_task_id && (
                    <button
                      type="button"
                      onClick={onNavigateToCalendar}
                      className="text-xs font-semibold text-[#155E34] hover:underline whitespace-nowrap"
                    >
                      {lang === 'kn' ? 'ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ → ನೋಡಿ' : 'Added to Calendar → View'}
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                  <select
                    value={targetCalendarId}
                    onChange={(e) => setTargetCalendarId(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs min-h-[42px]"
                  >
                    {calendars.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {lang === 'kn' ? c.crop_name_kn : c.crop_name_en} — {c.variety} ({c.taluk})
                      </option>
                    ))}
                    <option value="auto">
                      {lang === 'kn'
                        ? `ಹೊಸ ${activeScan.crop_name_kn} ವೇಳಾಪಟ್ಟಿ ರಚಿಸಿ ಸೇರಿಸಿ`
                        : `Auto-create new ${activeScan.crop_name_en} calendar`}
                    </option>
                  </select>

                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums min-h-[42px]"
                  />

                  <button
                    type="button"
                    disabled={addingToCalendar || (!isOnline && !onQueueAddToCalendar)}
                    onClick={() => handleAddToCalendar(activeScan)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#155E34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114B29] disabled:opacity-50 min-h-[42px] whitespace-nowrap shrink-0"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>
                      {addingToCalendar
                        ? lang === 'kn' ? 'ಸೇರಿಸಲಾಗುತ್ತಿದೆ...' : 'Adding...'
                        : !isOnline && onQueueAddToCalendar
                        ? lang === 'kn' ? 'ಆಫ್‌ಲೈನ್ ಕ್ಯೂಗೆ ಸೇರಿಸಿ' : 'Queue Care Step'
                        : t.addToCalendarBtn}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Saved Scan History */}
          {scans.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {lang === 'kn' ? 'ಉಳಿಸಿದ ಎಲೆ ಪರೀಕ್ಷೆ ಇತಿಹಾಸ' : 'Saved Scan History'}
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">{scans.length}</span>
              </div>

              <div className="divide-y divide-slate-100">
                {scans.map((scan) => {
                  const selected = activeScan?.id === scan.id;
                  return (
                    <div
                      key={scan.id}
                      className={`py-3 flex items-center justify-between gap-3 ${
                        selected ? 'bg-emerald-50/50 -mx-3 px-3 rounded-xl' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedScanId(scan.id)}
                        className="flex items-center gap-3 text-left min-w-0 flex-1"
                      >
                        <img
                          src={scan.image_data_url}
                          alt={lang === 'kn' ? scan.condition_name_kn : scan.condition_name_en}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {lang === 'kn' ? scan.condition_name_kn : scan.condition_name_en}
                          </p>
                          <p className="text-xs text-slate-500 truncate tabular-nums">
                            {lang === 'kn' ? scan.crop_name_kn : scan.crop_name_en} · {scan.confidence_pct}% ·{' '}
                            {new Date(scan.created_at.replace(' ', 'T') + (scan.created_at.includes('T') ? '' : 'Z')).toLocaleDateString()}
                            {scan.added_task_id
                              ? lang === 'kn'
                                ? ' · ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿದೆ'
                                : ' · In Calendar'
                              : ''}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteScan(scan.id)}
                        disabled={!isOnline}
                        title={lang === 'kn' ? 'ಅಳಿಸಿ' : 'Delete scan'}
                        className="p-2 text-slate-400 hover:text-red-700 disabled:opacity-40 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
