import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FlaskConical,
  MapPin,
  Phone,
  Plus,
  ShieldAlert,
  Sparkles,
  Store,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DataStatusStrip } from '../components/DataStatusStrip';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';
import {
  buildSoilAdvisoryNotes,
  getSoilPlanningTemplate,
  getStageFertilizerSuggestions,
} from '../server/soilGuidance';
import type {
  AgroShop,
  CropCalendar,
  CropInfo,
  NutrientStatus,
  SoilInputItem,
  SoilPlan,
  SoilPlansResponse,
  UserProfile,
} from '../types';

interface SoilHealthPageProps {
  lang: Lang;
  user: UserProfile;
  crops: CropInfo[];
  calendars: CropCalendar[];
  shops?: AgroShop[];
  plans: SoilPlan[];
  plansMeta: Pick<SoilPlansResponse, 'fetched_at' | '_fromOfflineCache' | '_cachedAt'> | null;
  loading: boolean;
  isOnline: boolean;
  onRefresh: () => void;
  onCreateSoilPlan: (payload: {
    plot_name: string;
    crop_code: string;
    crop_name_en: string;
    crop_name_kn: string;
    crop_stage: string;
    soil_type: string;
    ph_level: number | null;
    n_status: NutrientStatus;
    p_status: NutrientStatus;
    k_status: NutrientStatus;
    area_acres: number;
    planned_inputs: SoilInputItem[];
    notes: string;
  }) => Promise<{ queuedOffline: boolean }>;
  onDeleteSoilPlan: (planId: number) => Promise<void>;
  onAddPlanToCalendar: (planId: number, calendarId: number | null, dueDate: string) => Promise<void>;
  onNavigateToCalendar: () => void;
  onNavigateToShops?: () => void;
}

const CROP_STAGES = [
  { value: 'Basal / Land Preparation', en: 'Basal / Land Preparation', kn: 'ಬೇಸಲ್ / ಭೂಮಿ ಸಿದ್ಧತೆ' },
  { value: 'Vegetative / Top-Dressing', en: 'Vegetative / Top-Dressing', kn: 'ಸಸ್ಯ ಬೆಳವಣಿಗೆ / ಮೇಲುಗೊಬ್ಬರ' },
  { value: 'Flowering / Pod Filling', en: 'Flowering / Pod Filling', kn: 'ಹೂವು / ಕಾಯಿ ತುಂಬುವ ಹಂತ' },
];

export const SoilHealthPage: React.FC<SoilHealthPageProps> = ({
  lang,
  user,
  crops,
  calendars,
  shops = [],
  plans,
  plansMeta,
  loading,
  isOnline,
  onRefresh,
  onCreateSoilPlan,
  onDeleteSoilPlan,
  onAddPlanToCalendar,
  onNavigateToCalendar,
  onNavigateToShops,
}) => {
  const t = useT(lang);

  const cropOptions = useMemo(() => {
    if (crops.length > 0) return crops;
    return [
      { code: 'ragi', name_en: 'Ragi (Finger Millet)', name_kn: 'ರಾಗಿ' },
      { code: 'groundnut', name_en: 'Groundnut (Peanut)', name_kn: 'ಶೇಂಗಾ' },
      { code: 'tomato', name_en: 'Tomato', name_kn: 'ಟೊಮೆಟೊ' },
      { code: 'maize', name_en: 'Maize', name_kn: 'ಮೆಕ್ಕೆಜೋಳ' },
      { code: 'red_gram', name_en: 'Red Gram (Tur)', name_kn: 'ತೊಗರಿ' },
      { code: 'coconut', name_en: 'Coconut', name_kn: 'ತೆಂಗು' },
    ];
  }, [crops]);

  const initialCrop = cropOptions[0]?.code || 'ragi';
  const buildTemplateInputs = (code: string, acres: number, currentLang: Lang): SoilInputItem[] => {
    const tpl = getSoilPlanningTemplate(code);
    const scale = Math.max(0.25, acres || 1);
    return tpl.default_inputs.map((item) => ({
      name: currentLang === 'kn' ? item.name_kn : item.name_en,
      category: item.category,
      qty_label: item.qty_per_acre_label,
      estimated_cost_inr: Math.round(item.estimated_cost_per_acre_inr * scale),
    }));
  };

  const [plotName, setPlotName] = useState(
    lang === 'kn' ? `${user.village || 'ಮುಖ್ಯ'} ತಾಕು 1` : `${user.village || 'Main'} Plot 1`
  );
  const [cropCode, setCropCode] = useState(initialCrop);
  const [cropStage, setCropStage] = useState(CROP_STAGES[0].value);
  const [soilType, setSoilType] = useState(user.soil_type || 'Red Sandy Loam');
  const [phInput, setPhInput] = useState('6.6');
  const [nStatus, setNStatus] = useState<NutrientStatus>('low');
  const [pStatus, setPStatus] = useState<NutrientStatus>('medium');
  const [kStatus, setKStatus] = useState<NutrientStatus>('medium');
  const [areaAcres, setAreaAcres] = useState<number>(Math.max(0.5, Number(user.farm_size_acres) || 1));
  const [notes, setNotes] = useState('');
  const [inputsList, setInputsList] = useState<SoilInputItem[]>(() =>
    buildTemplateInputs(initialCrop, Math.max(0.5, Number(user.farm_size_acres) || 1), lang)
  );

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Calendar add modal/inline controls per plan
  const [calendarDateByPlan, setCalendarDateByPlan] = useState<Record<number, string>>({});
  const [calendarTargetByPlan, setCalendarTargetByPlan] = useState<Record<number, string>>({});
  const [addingPlanId, setAddingPlanId] = useState<number | null>(null);

  // Audio playback for saved plans
  const [speakingPlanId, setSpeakingPlanId] = useState<number | null>(null);
  const [missingTts, setMissingTts] = useState<MissingTtsVoiceInfo | null>(null);

  // Suggested fertilizer confirmation & nearby shops state
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [shopScope, setShopScope] = useState<'local' | 'all'>('local');
  const [copiedShopId, setCopiedShopId] = useState<number | null>(null);

  const parsedPh = phInput.trim() === '' ? null : Number(phInput);
  const validPh = parsedPh !== null && !Number.isNaN(parsedPh) && parsedPh >= 0 && parsedPh <= 14 ? parsedPh : null;

  const advisory = useMemo(
    () =>
      buildSoilAdvisoryNotes({
        soilType,
        phLevel: validPh,
        nStatus,
        pStatus,
        kStatus,
        cropCode,
      }),
    [soilType, validPh, nStatus, pStatus, kStatus, cropCode]
  );

  const stageRecommendations = useMemo(
    () =>
      getStageFertilizerSuggestions({
        cropCode,
        cropStage,
        phLevel: validPh,
        nStatus,
        pStatus,
        kStatus,
        areaAcres,
      }),
    [cropCode, cropStage, validPh, nStatus, pStatus, kStatus, areaAcres]
  );

  const localMatchingShops = useMemo(() => {
    const userDistrict = (user.district || '').trim().toLowerCase();
    const userTaluk = (user.taluk || '').trim().toLowerCase();
    const sorted = [...shops].sort((a, b) => {
      const aTaluk = a.taluk.trim().toLowerCase() === userTaluk ? 0 : 1;
      const bTaluk = b.taluk.trim().toLowerCase() === userTaluk ? 0 : 1;
      if (aTaluk !== bTaluk) return aTaluk - bTaluk;
      const aDist = a.district.trim().toLowerCase() === userDistrict ? 0 : 1;
      const bDist = b.district.trim().toLowerCase() === userDistrict ? 0 : 1;
      if (aDist !== bDist) return aDist - bDist;
      return (a.distance_km ?? 999) - (b.distance_km ?? 999);
    });
    if (shopScope === 'local') {
      const areaFiltered = sorted.filter(
        (s) =>
          s.taluk.trim().toLowerCase() === userTaluk ||
          s.district.trim().toLowerCase() === userDistrict
      );
      if (areaFiltered.length > 0) return areaFiltered;
    }
    return sorted;
  }, [shops, shopScope, user.district, user.taluk]);

  const templateInfo = useMemo(() => getSoilPlanningTemplate(cropCode), [cropCode]);
  const totalEstimatedCost = useMemo(
    () => inputsList.reduce((acc, item) => acc + Math.max(0, Number(item.estimated_cost_inr) || 0), 0),
    [inputsList]
  );
  const perAcreCost = areaAcres > 0 ? Math.round(totalEstimatedCost / areaAcres) : totalEstimatedCost;

  const selectedCropObj = cropOptions.find((c) => c.code === cropCode) || cropOptions[0];

  const handleApplySuggestedInputs = () => {
    const nextRows: SoilInputItem[] = stageRecommendations.suggestions.map((sug) => ({
      name: lang === 'kn' ? sug.name_kn : sug.name_en,
      category: sug.category,
      qty_label: sug.qty_per_acre_label,
      estimated_cost_inr: sug.estimated_cost_total_inr,
    }));
    setInputsList(nextRows);
    setAppliedFlash(true);
    setFeedback(t.appliedToInputsMsg);
    window.setTimeout(() => setAppliedFlash(false), 2500);
  };

  const handleCopyShopDetails = async (shop: AgroShop) => {
    const shopName = lang === 'kn' ? shop.name_kn : shop.name;
    const details = [
      shopName,
      `${shop.address} (${shop.taluk}, ${shop.district})`,
      shop.operating_hours ? `${lang === 'kn' ? 'ಸಮಯ:' : 'Hours:'} ${shop.operating_hours}` : '',
      shop.phone ? `${lang === 'kn' ? 'ದೂರವಾಣಿ:' : 'Phone:'} ${shop.phone}` : '',
      shop.products ? `${lang === 'kn' ? 'ಪರಿಕರಗಳು:' : 'Products:'} ${shop.products}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details);
      } else {
        const ta = document.createElement('textarea');
        ta.value = details;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedShopId(shop.id);
      window.setTimeout(() => {
        setCopiedShopId((cur) => (cur === shop.id ? null : cur));
      }, 2200);
    } catch {
      // ignore copy restrictions
    }
  };

  const handleCropChange = (nextCode: string) => {
    setCropCode(nextCode);
    setInputsList(buildTemplateInputs(nextCode, areaAcres, lang));
  };

  const handleAreaChange = (nextAcres: number) => {
    const safeAcres = Math.max(0.25, nextAcres || 0.25);
    const ratio = areaAcres > 0 ? safeAcres / areaAcres : 1;
    setAreaAcres(safeAcres);
    setInputsList((prev) =>
      prev.map((item) => ({
        ...item,
        estimated_cost_inr: Math.round(item.estimated_cost_inr * ratio),
      }))
    );
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedback('');
    if (!plotName.trim()) {
      setErrorMsg(lang === 'kn' ? 'ದಯವಿಟ್ಟು ಜಮೀನು ತಾಕಿನ ಹೆಸರು ನಮೂದಿಸಿ.' : 'Please enter a plot name.');
      return;
    }

    setSaving(true);
    try {
      const res = await onCreateSoilPlan({
        plot_name: plotName.trim(),
        crop_code: cropCode,
        crop_name_en: selectedCropObj?.name_en || cropCode,
        crop_name_kn: selectedCropObj?.name_kn || cropCode,
        crop_stage: cropStage,
        soil_type: soilType,
        ph_level: validPh,
        n_status: nStatus,
        p_status: pStatus,
        k_status: kStatus,
        area_acres: areaAcres,
        planned_inputs: inputsList.filter((it) => it.name.trim()),
        notes: notes.trim(),
      });
      setNotes('');
      setFeedback(
        res.queuedOffline
          ? t.queuedOfflineNote
          : lang === 'kn'
          ? 'ಮಣ್ಣು ಪರೀಕ್ಷೆ ಮತ್ತು ವೆಚ್ಚದ ಯೋಜನೆಯನ್ನು ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.'
          : 'Soil & fertilizer input plan saved to your account.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save soil plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSpeakPlan = (plan: SoilPlan) => {
    if (speakingPlanId === plan.id) {
      stopSpeaking();
      setSpeakingPlanId(null);
      return;
    }

    const speechText =
      lang === 'kn'
        ? `${plan.plot_name}, ${plan.crop_name_kn}, ವಿಸ್ತೀರ್ಣ ${plan.area_acres} ಎಕರೆ. ಮಣ್ಣು ${plan.soil_type}${
            plan.ph_level !== null ? `, ಪಿಹೆಚ್ ${plan.ph_level}` : ''
          }. ಅಂದಾಜು ಒಟ್ಟು ಇನ್‌ಪುಟ್ ವೆಚ್ಚ ${plan.total_estimated_cost_inr} ರೂಪಾಯಿ. ಇದು ಸಾಮಾನ್ಯ ಯೋಜನಾ ಮಾರ್ಗದರ್ಶಿ ಮಾತ್ರ — ನಿಖರ ಪ್ರಮಾಣಕ್ಕೆ ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರವನ್ನು ಸಂಪರ್ಕಿಸಿ.`
        : `${plan.plot_name}, ${plan.crop_name_en}, ${plan.area_acres} acres, ${plan.soil_type}${
            plan.ph_level !== null ? `, pH ${plan.ph_level}` : ''
          }. Total planned input budget is ${plan.total_estimated_cost_inr} rupees. General planning reference only; verify exact dosage with your local Raitha Samparka Kendra.`;

    const res = speakTextWithSpeechSynthesis({
      text: speechText,
      lang,
      rate: 0.95,
      onStart: () => setSpeakingPlanId(plan.id),
      onEnd: () => setSpeakingPlanId((cur) => (cur === plan.id ? null : cur)),
      onError: () => {
        setSpeakingPlanId((cur) => (cur === plan.id ? null : cur));
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

  const summaryBullets =
    lang === 'kn'
      ? [
          `${selectedCropObj?.name_kn || cropCode}: ಸಾಮಾನ್ಯ pH ಶ್ರೇಣಿ ${templateInfo.ph_range} (${areaAcres} ಎಕರೆ ಯೋಜನೆ).`,
          `ಪ್ರಸ್ತುತ ಯೋಜಿತ ಇನ್‌ಪುಟ್ ಅಂದಾಜು ವೆಚ್ಚ: ₹${totalEstimatedCost.toLocaleString()} (ಎಕರೆಗೆ ₹${perAcreCost.toLocaleString()}).`,
          `ಉಳಿಸಿದ ಮಣ್ಣು-ಗೊಬ್ಬರ ಯೋಜನೆಗಳು: ${plans.length}.`,
        ]
      : [
          `${selectedCropObj?.name_en || cropCode}: general pH comfort band ${templateInfo.ph_range} (${areaAcres} ac plan).`,
          `Estimated planned input total: ₹${totalEstimatedCost.toLocaleString()} (₹${perAcreCost.toLocaleString()}/acre).`,
          `Saved soil & input plans in your account: ${plans.length}.`,
        ];

  const summarySpeechText =
    lang === 'kn'
      ? `${summaryBullets.join(' ')} ನಿಖರ ಶಿಫಾರಸಿಗಾಗಿ ಅಧಿಕೃತ ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಕಾರ್ಡ್ ಮತ್ತು ರೈತ ಸಂಪರ್ಕ ಕೇಂದ್ರವನ್ನು ಸಂಪರ್ಕಿಸಿ.`
      : `${summaryBullets.join(' ')} Always verify final chemical dosages with your Soil Health Card and local Raitha Samparka Kendra.`;

  const statusLabels: Record<NutrientStatus, { en: string; kn: string }> = {
    low: { en: 'Low', kn: 'ಕಡಿಮೆ' },
    medium: { en: 'Medium', kn: 'ಮಧ್ಯಮ' },
    high: { en: 'High', kn: 'ಹೆಚ್ಚು' },
    unknown: { en: 'Not Tested', kn: 'ಪರೀಕ್ಷಿಸಿಲ್ಲ' },
  };

  const categoryLabels: Record<SoilInputItem['category'], { en: string; kn: string }> = {
    seed: { en: 'Seed', kn: 'ಬೀಜ' },
    fertilizer: { en: 'Fertilizer', kn: 'ಗೊಬ್ಬರ' },
    soil_amendment: { en: 'Soil Amendment', kn: 'ಮಣ್ಣು ಸುಧಾರಕ' },
    bio_input: { en: 'Bio-Input', kn: 'ಜೈವಿಕ ಇನ್‌ಪುಟ್' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.soilHelperTitle}</h1>
        <p className="text-sm text-slate-600 mt-0.5">{t.soilHelperSubtitle}</p>
      </div>

      <DataStatusStrip
        lang={lang}
        state={!isOnline || plansMeta?._fromOfflineCache ? 'offline_cached' : 'synced'}
        sourceLabel={lang === 'kn' ? `ಉಳಿಸಿದ ಯೋಜನೆಗಳು: ${plans.length}` : `Saved Plans: ${plans.length}`}
        timestamp={plansMeta?._cachedAt || plansMeta?.fetched_at}
        offlineHint={
          !isOnline
            ? lang === 'kn'
              ? 'ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಉಳಿಸುವ ಮಣ್ಣಿನ ಯೋಜನೆಗಳು ಇಂಟರ್ನೆಟ್ ಬಂದಾಗ ಸ್ವಯಂ ಸಿಂಕ್ ಆಗುತ್ತವೆ.'
              : 'Soil & fertilizer plans saved offline are queued for automatic sync when connectivity returns.'
            : undefined
        }
        loading={loading}
        onRefresh={onRefresh}
        refreshLabel={lang === 'kn' ? 'ತಾಜಾಗೊಳಿಸಿ' : 'Refresh'}
      />

      <VoiceSummaryCard
        lang={lang}
        title={lang === 'kn' ? 'ಮಣ್ಣು ಮತ್ತು ಇನ್‌ಪುಟ್ ಸಾರಾಂಶ' : 'Soil & Input Planning Summary'}
        bullets={summaryBullets}
        speechText={summarySpeechText}
      />

      {/* Explicit Planning Guidance vs Official Soil Health Card & RSK Boundary Notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-950">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm">{t.soilDisclaimerTitle}</p>
          <p className="leading-relaxed text-amber-900">{t.soilDisclaimerBody}</p>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Log Soil Test Notes + Input Cost Estimator */}
        <form onSubmit={handleSavePlan} className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#155E34]" />
              <span>{lang === 'kn' ? 'ಮಣ್ಣು ಪರೀಕ್ಷೆ ಮತ್ತು ವೆಚ್ಚ ಯೋಜನೆ ನಮೂದಿಸಿ' : 'Log Plot Soil Notes & Plan Inputs'}</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'kn' ? 'ತಾಕಿನ ಹೆಸರು' : 'Plot / Field Name'}
              </label>
              <input
                type="text"
                required
                value={plotName}
                onChange={(e) => setPlotName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.selectCrop}</label>
              <select
                value={cropCode}
                onChange={(e) => handleCropChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[44px]"
              >
                {cropOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {lang === 'kn' ? `${c.name_kn} (${c.name_en})` : c.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'kn' ? 'ಬೆಳೆಯ ಹಂತ' : 'Crop Stage'}
              </label>
              <select
                value={cropStage}
                onChange={(e) => setCropStage(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[44px]"
              >
                {CROP_STAGES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {lang === 'kn' ? st.kn : st.en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.soilTypeLabel}</label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm min-h-[44px]"
              >
                <option value="Red Sandy Loam">Red Sandy Loam</option>
                <option value="Red Clay Loam">Red Clay Loam</option>
                <option value="Black Cotton Soil">Black Cotton Soil</option>
                <option value="Alluvial Loam">Alluvial Loam</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'kn' ? 'ವಿಸ್ತೀರ್ಣ (ಎಕರೆ)' : 'Plot Area (Acres)'}
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={areaAcres}
                onChange={(e) => handleAreaChange(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm tabular-nums min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'kn' ? 'ಮಣ್ಣಿನ pH (ಐಚ್ಛಿಕ, 0–14)' : 'Soil pH (Optional, 0–14)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={phInput}
                onChange={(e) => setPhInput(e.target.value)}
                placeholder="e.g. 6.5"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm tabular-nums min-h-[44px]"
              />
            </div>
          </div>

          {/* N, P, K Status Selectors */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: lang === 'kn' ? 'ಸಾರಜನಕ (N)' : 'Nitrogen (N)', val: nStatus, set: setNStatus },
              { label: lang === 'kn' ? 'ರಂಜಕ (P)' : 'Phosphorus (P)', val: pStatus, set: setPStatus },
              { label: lang === 'kn' ? 'ಪೊಟ್ಯಾಶ್ (K)' : 'Potash (K)', val: kStatus, set: setKStatus },
            ].map((item) => (
              <div key={item.label}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{item.label}</label>
                <select
                  value={item.val}
                  onChange={(e) => item.set(e.target.value as NutrientStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium min-h-[42px]"
                >
                  {(['low', 'medium', 'high', 'unknown'] as NutrientStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {lang === 'kn' ? statusLabels[st].kn : statusLabels[st].en}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Suggested Fertilizers for Selected Crop & Stage (Live from Crop, Stage, N/P/K & pH) */}
          <div className="rounded-xl bg-[#F1F7F3] border border-emerald-800/15 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#155E34] shrink-0" />
                  <span>{t.suggestedFertilizersTitle}</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">{t.suggestedFertilizersSub}</p>
              </div>

              <button
                type="button"
                onClick={handleApplySuggestedInputs}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#155E34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114B29] min-h-[42px] whitespace-nowrap shrink-0"
              >
                {appliedFlash ? <Check className="w-4 h-4 shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
                <span>{t.applyToInputsBtn}</span>
              </button>
            </div>

            <p className="text-xs font-medium text-emerald-950 leading-relaxed">
              {lang === 'kn' ? stageRecommendations.summary_kn : stageRecommendations.summary_en}
            </p>

            <div className="divide-y divide-emerald-900/10">
              {stageRecommendations.suggestions.map((sug) => (
                <div key={sug.id} className="py-2.5 first:pt-1 last:pb-1 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#155E34]">
                        {lang === 'kn' ? categoryLabels[sug.category].kn : categoryLabels[sug.category].en}
                      </span>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        {lang === 'kn' ? sug.name_kn : sug.name_en}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                        ₹{sug.estimated_cost_total_inr.toLocaleString()}
                      </span>
                      <p className="text-[11px] text-slate-500 tabular-nums">{sug.qty_per_acre_label}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">
                    {lang === 'kn' ? sug.rationale_kn : sug.rationale_en}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-amber-900 bg-amber-50/90 rounded-lg px-3 py-2 border border-amber-200">
              {lang === 'kn'
                ? 'ಸೂಚನೆ: ಇವು ಬೆಳೆ/ಹಂತದ ಸಾಮಾನ್ಯ ಯೋಜನಾ ಅಂದಾಜುಗಳು ಮಾತ್ರ — ಖರೀದಿ ಅಥವಾ ಬಳಕೆಗೂ ಮುನ್ನ ನಿಮ್ಮ Soil Health Card (SHC) ಮತ್ತು ಸ್ಥಳೀಯ RSK ಕೃಷಿ ಅಧಿಕಾರಿಯ ಸಲಹೆ ಪಡೆಯಿರಿ.'
                : 'General planning suggestions only — always check your official Soil Health Card (SHC) values and confirm exact dosages with your local RSK Agriculture Officer.'}
            </p>
          </div>

          {/* Planned Seed, Fertilizer & Bio-Input Cost Table */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {lang === 'kn' ? 'ಬೀಜ, ಗೊಬ್ಬರ ಮತ್ತು ಇನ್‌ಪುಟ್ ವೆಚ್ಚ ಅಂದಾಜು' : 'Seed, Fertilizer & Input Cost Planner'}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setInputsList((prev) => [
                    ...prev,
                    { name: '', category: 'fertilizer', qty_label: '', estimated_cost_inr: 0 },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#155E34] hover:bg-slate-50 min-h-[40px] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'kn' ? 'ಸೇರಿಸಿ' : 'Add Item'}</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#F8FAF8] divide-y divide-slate-200/80 px-3">
              {inputsList.map((item, idx) => (
                <div key={idx} className="py-3 grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder={lang === 'kn' ? 'ಇನ್‌ಪುಟ್ ಹೆಸರು' : 'Input item name'}
                    value={item.name}
                    onChange={(e) =>
                      setInputsList((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                    }
                    className="col-span-12 sm:col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs min-h-[42px]"
                  />
                  <select
                    value={item.category}
                    aria-label={lang === 'kn' ? 'ಇನ್‌ಪುಟ್ ವರ್ಗ' : 'Input category'}
                    onChange={(e) =>
                      setInputsList((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, category: e.target.value as SoilInputItem['category'] } : r
                        )
                      )
                    }
                    className="col-span-6 sm:col-span-3 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs min-h-[42px]"
                  >
                    {(Object.keys(categoryLabels) as Array<SoilInputItem['category']>).map((cat) => (
                      <option key={cat} value={cat}>
                        {lang === 'kn' ? categoryLabels[cat].kn : categoryLabels[cat].en}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder={lang === 'kn' ? 'ಪ್ರಮಾಣ' : 'Qty / note'}
                    value={item.qty_label}
                    onChange={(e) =>
                      setInputsList((prev) => prev.map((r, i) => (i === idx ? { ...r, qty_label: e.target.value } : r)))
                    }
                    className="col-span-6 sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs min-h-[42px]"
                  />
                  <div className="col-span-10 sm:col-span-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={item.estimated_cost_inr}
                      onChange={(e) =>
                        setInputsList((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, estimated_cost_inr: Math.max(0, Number(e.target.value) || 0) } : r
                          )
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white pl-6 pr-2 py-2 text-xs tabular-nums min-h-[42px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setInputsList((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove input row"
                    className="col-span-2 sm:col-span-1 flex items-center justify-center p-2 text-slate-400 hover:text-red-700 min-h-[42px]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-emerald-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-emerald-950">
                {lang === 'kn' ? 'ಒಟ್ಟು ಅಂದಾಜು ವೆಚ್ಚ' : 'Estimated Input Budget'}
              </span>
              <div className="text-right font-mono font-bold text-[#155E34] tabular-nums">
                ₹{totalEstimatedCost.toLocaleString()}
                <span className="text-xs font-sans font-normal text-slate-600 ml-2">
                  (₹{perAcreCost.toLocaleString()} / {lang === 'kn' ? 'ಎಕರೆಗೆ' : 'acre'})
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'kn' ? 'ಹೆಚ್ಚುವರಿ ಟಿಪ್ಪಣಿ (SHC ಸಂಖ್ಯೆ / RSK ಸಲಹೆ)' : 'Additional Soil / RSK Notes'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                lang === 'kn'
                  ? 'ಉದಾ: ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಕಾರ್ಡ್ ಪ್ರಕಾರ ಸಾವಯವ ಗೊಬ್ಬರ ಹೆಚ್ಚು ಬಳಸಬೇಕು...'
                  : 'e.g. Verified compost source from dairy co-op, check Zinc dosage at Sira RSK...'
              }
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#155E34] px-4 py-3 text-sm font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[46px]"
          >
            {saving ? '...' : t.saveSoilPlanBtn}
          </button>
        </form>

        {/* Right: General Crop Soil Planning Reference + Saved Plans History */}
        <div className="lg:col-span-5 space-y-5">
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'kn' ? 'ಸಾಮಾನ್ಯ ಬೆಳೆ ಯೋಜನಾ ಉಲ್ಲೇಖ' : 'General Planning Reference'}
              </h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                pH {templateInfo.ph_range}
              </span>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
              {(lang === 'kn' ? advisory.kn : advisory.en).map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#155E34] font-bold">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
              {lang === 'kn'
                ? 'ಸೂಚನೆ: ಇದು ಸಾಮಾನ್ಯ ಯೋಜನಾ ಮಾಹಿತಿ ಮಾತ್ರ — ನಿಖರ ರಾಸಾಯನಿಕ/ಗೊಬ್ಬರ ಪ್ರಮಾಣಕ್ಕೆ ನಿಮ್ಮ ಅಧಿಕೃತ SHC ವರದಿ ಮತ್ತು RSK ಅಧಿಕಾರಿಗಳ ಸಲಹೆ ಅನುಸರಿಸಿ.'
                : 'Planning reference only — follow your official Soil Health Card (SHC) lab report and local RSK Agriculture Officer prescription before applying fertilizers.'}
            </p>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'kn' ? 'ಉಳಿಸಿದ ಮಣ್ಣು-ಗೊಬ್ಬರ ಯೋಜನೆಗಳು' : 'Saved Soil & Input Plans'}
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">{plans.length}</span>
            </div>

            {missingTts && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-bold">{missingTts.title}</p>
                <p className="mt-0.5">{missingTts.message}</p>
              </div>
            )}

            {plans.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                {lang === 'kn'
                  ? 'ಇನ್ನೂ ಯಾವುದೇ ಮಣ್ಣು-ಗೊಬ್ಬರ ಯೋಜನೆ ಉಳಿಸಿಲ್ಲ.'
                  : 'No saved soil & input plans yet.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {plans.map((plan) => {
                  const defaultDate = calendarDateByPlan[plan.id] || new Date().toISOString().slice(0, 10);
                  const matchingCal = calendars.find((c) => c.crop_code === plan.crop_code);
                  const targetCal = calendarTargetByPlan[plan.id] ?? (matchingCal ? String(matchingCal.id) : calendars[0] ? String(calendars[0].id) : 'auto');
                  const perPlanAcre = plan.area_acres > 0 ? Math.round(plan.total_estimated_cost_inr / plan.area_acres) : plan.total_estimated_cost_inr;

                  return (
                    <div key={plan.id} className="py-4 first:pt-1 last:pb-1 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#155E34]">
                            {lang === 'kn' ? plan.crop_name_kn : plan.crop_name_en} · {plan.area_acres}{' '}
                            {lang === 'kn' ? 'ಎಕರೆ' : 'ac'}
                          </p>
                          <h3 className="text-sm font-bold text-slate-900 mt-0.5">{plan.plot_name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {plan.soil_type}
                            {plan.ph_level !== null ? ` · pH ${plan.ph_level}` : ''} · N:{plan.n_status} P:{plan.p_status} K:{plan.k_status}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSpeakPlan(plan)}
                            title={`${t.speakResponse} (${getSpeechLocale(lang)})`}
                            className="p-2 rounded-lg border border-emerald-700/20 bg-emerald-50 text-emerald-950 min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            {speakingPlanId === plan.id ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            disabled={!isOnline || plan.id < 0}
                            onClick={() => onDeleteSoilPlan(plan.id)}
                            title={lang === 'kn' ? 'ಅಳಿಸಿ' : 'Delete plan'}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-700 disabled:opacity-40 min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#F8FAF8] rounded-lg px-3 py-2">
                        <span className="text-slate-600">{plan.crop_stage}</span>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          ₹{plan.total_estimated_cost_inr.toLocaleString()}
                          <span className="font-sans font-normal text-slate-500 ml-1">
                            (₹{perPlanAcre.toLocaleString()}/{lang === 'kn' ? 'ಎಕರೆ' : 'ac'})
                          </span>
                        </span>
                      </div>

                      {plan.notes && <p className="text-xs text-slate-600">{plan.notes}</p>}

                      {plan.id > 0 && (
                        <div className="pt-1 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <select
                              value={targetCal}
                              onChange={(e) =>
                                setCalendarTargetByPlan((prev) => ({ ...prev, [plan.id]: e.target.value }))
                              }
                              className="sm:col-span-6 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs min-h-[40px]"
                            >
                              {calendars.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {lang === 'kn' ? c.crop_name_kn : c.crop_name_en} ({c.taluk})
                                </option>
                              ))}
                              <option value="auto">
                                {lang === 'kn' ? 'ಹೊಸ ಬೆಳೆ ವೇಳಾಪಟ್ಟಿ ರಚಿಸಿ' : 'Auto-create Crop Calendar'}
                              </option>
                            </select>

                            <input
                              type="date"
                              value={defaultDate}
                              onChange={(e) =>
                                setCalendarDateByPlan((prev) => ({ ...prev, [plan.id]: e.target.value }))
                              }
                              className="sm:col-span-3 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs tabular-nums min-h-[40px]"
                            />

                            <button
                              type="button"
                              disabled={!isOnline || addingPlanId === plan.id}
                              onClick={async () => {
                                setAddingPlanId(plan.id);
                                try {
                                  await onAddPlanToCalendar(
                                    plan.id,
                                    targetCal === 'auto' ? null : Number(targetCal),
                                    defaultDate
                                  );
                                  setFeedback(
                                    lang === 'kn'
                                      ? 'ಗೊಬ್ಬರ/ಇನ್‌ಪುಟ್ ಕಾರ್ಯವನ್ನು ಬೆಳೆ ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ.'
                                      : 'Planned input step added to your Crop Calendar.'
                                  );
                                } finally {
                                  setAddingPlanId(null);
                                }
                              }}
                              className="sm:col-span-3 inline-flex items-center justify-center gap-1 rounded-lg bg-[#155E34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#114B29] disabled:opacity-50 min-h-[40px] whitespace-nowrap"
                            >
                              <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                              <span>{t.addToCalendarBtn}</span>
                            </button>
                          </div>

                          {plan.added_task_id && (
                            <button
                              type="button"
                              onClick={onNavigateToCalendar}
                              className="text-xs font-semibold text-[#155E34] hover:underline"
                            >
                              {lang === 'kn' ? 'ವೇಳಾಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ → ನೋಡಿ' : 'Added to Calendar → View'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Nearby Fertilizer & Agro Input Shops (District / Taluk Aware) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Store className="w-5 h-5 text-[#155E34] shrink-0" />
              <span>{t.nearbyInputShopsTitle}</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {t.nearbyInputShopsSub} ({user.taluk}, {user.district})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setShopScope('local')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                  shopScope === 'local' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {user.taluk || user.district}
              </button>
              <button
                type="button"
                onClick={() => setShopScope('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                  shopScope === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {lang === 'kn' ? 'ಎಲ್ಲಾ ಹತ್ತಿರದ ಕೇಂದ್ರಗಳು' : 'All Nearby'}
              </button>
            </div>

            {onNavigateToShops && (
              <button
                type="button"
                onClick={onNavigateToShops}
                className="text-xs font-semibold text-[#155E34] hover:underline px-2 py-2 min-h-[36px] whitespace-nowrap"
              >
                {t.viewAllShopsBtn}
              </button>
            )}
          </div>
        </div>

        {/* Availability & RSK Verification Reminder Before Buying */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-950">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{t.shopAvailabilityReminder}</p>
        </div>

        {localMatchingShops.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            {lang === 'kn'
              ? 'ಪ್ರಸ್ತುತ ಈ ಸ್ಥಳಕ್ಕೆ ಯಾವುದೇ ಅಂಗಡಿ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.'
              : 'No agro-input dealers found for this area yet.'}
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {localMatchingShops.map((shop) => {
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${shop.latitude},${shop.longitude}`
              )}`;
              const isCopied = copiedShopId === shop.id;

              return (
                <div
                  key={shop.id}
                  className="rounded-xl bg-[#F8FAF8] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-[#155E34]">{shop.category}</span>
                      <span className="tabular-nums font-mono">
                        {shop.taluk}, {shop.district}
                        {shop.distance_km !== undefined ? ` · ${shop.distance_km} km` : ''}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      {lang === 'kn' ? shop.name_kn : shop.name}
                    </h3>

                    <p className="text-xs text-slate-600 flex items-start gap-1.5 leading-relaxed">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{shop.address}</span>
                    </p>

                    {shop.operating_hours && (
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{shop.operating_hours}</span>
                      </p>
                    )}

                    {shop.products && (
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-semibold text-slate-800">
                          {lang === 'kn' ? 'ಲಭ್ಯ ಪರಿಕರಗಳು:' : 'Inputs:'}
                        </span>{' '}
                        {shop.products}
                      </p>
                    )}

                    {shop.phone && (
                      <p className="text-xs">
                        <a
                          href={`tel:${shop.phone}`}
                          className="inline-flex items-center gap-1 font-mono font-semibold text-[#155E34] hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{shop.phone}</span>
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#155E34] shrink-0" />
                      <span>{t.openInMapsBtn}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopyShopDetails(shop)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700">{t.copiedDetailsMsg}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#155E34] shrink-0" />
                          <span>{t.copyDetailsBtn}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
