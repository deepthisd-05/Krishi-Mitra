import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Sprout,
  Trash2,
  XCircle,
} from 'lucide-react';
import { UpcomingRemindersCard } from '../components/UpcomingRemindersCard';
import { VoiceSummaryCard } from '../components/VoiceSummaryCard';
import { useT, type Lang } from '../i18n/translations';
import type {
  CalendarTask,
  CropCalendar,
  CropInfo,
  KarnatakaLocation,
  UserProfile,
  WeatherData,
} from '../types';

interface CropCalendarPageProps {
  lang: Lang;
  user: UserProfile;
  crops: CropInfo[];
  locations: KarnatakaLocation[];
  calendars: CropCalendar[];
  weather: WeatherData | null;
  onCreateCalendar: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteCalendar: (id: number) => Promise<void>;
  onUpdateTaskStatus: (task: CalendarTask, status: 'pending' | 'completed' | 'missed') => Promise<void>;
  onRescheduleTask: (task: CalendarTask, newDueDate: string) => Promise<void>;
  onAddCustomTask: (payload: { calendarId: number; title: string; description: string; dueDate: string }) => Promise<void>;
}

export const CropCalendarPage: React.FC<CropCalendarPageProps> = ({
  lang,
  user,
  crops,
  locations,
  calendars,
  weather,
  onCreateCalendar,
  onDeleteCalendar,
  onUpdateTaskStatus,
  onRescheduleTask,
  onAddCustomTask,
}) => {
  const t = useT(lang);
  const [selectedCalId, setSelectedCalId] = useState<number | null>(calendars[0]?.id ?? null);
  const [showBuilder, setShowBuilder] = useState(calendars.length === 0);
  const [showCropGuide, setShowCropGuide] = useState(false);

  // Builder form state
  const [cropCode, setCropCode] = useState(crops[0]?.code || 'ragi');
  const currentCrop = crops.find((c) => c.code === cropCode) || crops[0];
  const [variety, setVariety] = useState('');
  const [season, setSeason] = useState('Kharif (Mungaru)');
  const [soilType, setSoilType] = useState(user.soil_type || 'Red Sandy Loam');
  const [irrigationType, setIrrigationType] = useState(user.irrigation_type || 'Rainfed');
  const [district, setDistrict] = useState(user.district || 'Tumakuru');
  const [taluk, setTaluk] = useState(user.taluk || 'Sira');
  const [sowingDate, setSowingDate] = useState(new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  // Calendar view filters
  const [viewMode, setViewMode] = useState<'list' | 'weekly' | 'monthly'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'missed'>('all');

  // Custom reminder modal
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10));
  const [showCustomForm, setShowCustomForm] = useState(false);

  const activeCalendar = useMemo(() => {
    if (calendars.length === 0) return null;
    return calendars.find((c) => c.id === selectedCalId) || calendars[0];
  }, [calendars, selectedCalId]);

  const districts = Array.from(new Set(locations.map((l) => l.district)));
  const taluks = Array.from(new Set(locations.filter((l) => l.district === district).map((l) => l.taluk)));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await onCreateCalendar({
        crop_code: cropCode,
        variety: variety || currentCrop?.varieties[0] || '',
        season,
        soil_type: soilType,
        irrigation_type: irrigationType,
        sowing_date: sowingDate,
        district,
        taluk,
        hobli: user.hobli,
        village: user.village,
      });
      setShowBuilder(false);
    } finally {
      setCreating(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCalendar || !customTitle.trim()) return;
    await onAddCustomTask({
      calendarId: activeCalendar.id,
      title: customTitle.trim(),
      description: customDesc.trim(),
      dueDate: customDate,
    });
    setCustomTitle('');
    setCustomDesc('');
    setShowCustomForm(false);
  };

  const filteredTasks = useMemo(() => {
    if (!activeCalendar) return [];
    const today = new Date().toISOString().slice(0, 10);
    return activeCalendar.tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (viewMode === 'weekly') {
        const diff = (new Date(task.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24);
        return diff >= -7 && diff <= 14;
      }
      return true;
    });
  }, [activeCalendar, statusFilter, viewMode]);

  // Group tasks by month for Monthly view
  const tasksByMonth = useMemo(() => {
    const groups: Record<string, CalendarTask[]> = {};
    for (const task of filteredTasks) {
      const monthKey = task.due_date.slice(0, 7);
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(task);
    }
    return Object.entries(groups);
  }, [filteredTasks]);

  const weatherIrrigationSkip = weather?.alerts.some((a) => a.type === 'rain' || a.type === 'heavy_rain');

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.navCalendar}</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {lang === 'kn'
              ? 'ಸ್ಥಳ, ಮಣ್ಣು, ನೀರಾವರಿ ಮತ್ತು ಹವಾಮಾನ ಆಧಾರಿತ 12 ಹಂತದ ಕೃಷಿ ವೇಳಾಪಟ್ಟಿ'
              : 'Location-, soil-, irrigation-, and weather-contextualized 12-stage schedules'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowCropGuide(!showCropGuide)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[42px]"
          >
            <BookOpen className="w-4 h-4 text-[#155E34]" />
            <span>{lang === 'kn' ? '12 ಬೆಳೆ ಮಾಹಿತಿ ಕೋಶ' : '12 Crop Knowledge Base'}</span>
          </button>
          <button
            onClick={() => setShowBuilder(!showBuilder)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>{t.createCalendarCta}</span>
          </button>
        </div>
      </div>

      {/* Upcoming Reminders & Snooze / Reschedule across User Calendars */}
      {calendars.length > 0 && (
        <UpcomingRemindersCard
          lang={lang}
          calendars={calendars}
          maxItems={6}
          onUpdateTaskStatus={onUpdateTaskStatus}
          onRescheduleTask={onRescheduleTask}
        />
      )}

      {/* Crop Knowledge Base Drawer */}
      {showCropGuide && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {lang === 'kn' ? 'ಕರ್ನಾಟಕ ದೃಢೀಕೃತ ಬೆಳೆ ಮಾಹಿತಿ' : 'Verified Karnataka Crop Directory'}
            </h2>
            <button onClick={() => setShowCropGuide(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
              {lang === 'kn' ? 'ಮುಚ್ಚಿ' : 'Close'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {crops.map((c) => (
              <div key={c.code} className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{lang === 'kn' ? c.category_kn : c.category}</span>
                    <span className="tabular-nums">{c.duration_days} {lang === 'kn' ? 'ದಿನ' : 'days'}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {lang === 'kn' ? c.name_kn : c.name_en}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {lang === 'kn' ? c.notes_kn : c.notes_en}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium text-slate-700">{lang === 'kn' ? 'ತಳಿಗಳು:' : 'Varieties:'}</span>{' '}
                    {c.varieties.join(', ')}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate pr-2">{c.source_institution}</span>
                  <button
                    onClick={() => {
                      setCropCode(c.code);
                      setVariety(c.varieties[0] || '');
                      setShowBuilder(true);
                      setShowCropGuide(false);
                    }}
                    className="font-semibold text-[#155E34] hover:underline shrink-0"
                  >
                    {lang === 'kn' ? 'ಆಯ್ಕೆ ಮಾಡಿ' : 'Use'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New Calendar Generator Form */}
      {showBuilder && (
        <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{t.createCalendarCta}</h2>
            {calendars.length > 0 && (
              <button type="button" onClick={() => setShowBuilder(false)} className="text-xs text-slate-500 hover:text-slate-900">
                {lang === 'kn' ? 'ರದ್ದು' : 'Cancel'}
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.selectCrop}</label>
              <select
                value={cropCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setCropCode(next);
                  const found = crops.find((c) => c.code === next);
                  if (found) setVariety(found.varieties[0] || '');
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {crops.map((c) => (
                  <option key={c.code} value={c.code}>
                    {lang === 'kn' ? `${c.name_kn} (${c.name_en})` : c.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.selectVariety}</label>
              <select
                value={variety || currentCrop?.varieties[0] || ''}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {(currentCrop?.varieties || []).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.selectSeason}</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="Kharif (Mungaru)">Kharif / Mungaru (ಮುಂಗಾರು)</option>
                <option value="Rabi (Hingaru)">Rabi / Hingaru (ಹಿಂಗಾರು)</option>
                <option value="Summer (Besige)">Summer / Besige (ಬೇಸಿಗೆ)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.sowingDate}</label>
              <input
                type="date"
                required
                value={sowingDate}
                onChange={(e) => setSowingDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.districtLabel}</label>
              <select
                value={district}
                onChange={(e) => {
                  const d = e.target.value;
                  setDistrict(d);
                  const first = locations.find((l) => l.district === d);
                  if (first) setTaluk(first.taluk);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.talukLabel}</label>
              <select
                value={taluk}
                onChange={(e) => setTaluk(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {taluks.map((tk) => (
                  <option key={tk} value={tk}>{tk}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.soilTypeLabel}</label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="Red Sandy Loam">Red Sandy Loam</option>
                <option value="Red Clay Loam">Red Clay Loam</option>
                <option value="Black Cotton Soil">Black Cotton Soil</option>
                <option value="Alluvial Loam">Alluvial Loam</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.irrigationLabel}</label>
              <select
                value={irrigationType}
                onChange={(e) => setIrrigationType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="Rainfed">Rainfed (ಮಳೆಯಾಶ್ರಿತ)</option>
                <option value="Borewell + Rainfed">Borewell + Rainfed</option>
                <option value="Drip / Borewell">Drip Irrigation</option>
                <option value="Canal / Tank">Canal / Tank</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500">
              {currentCrop ? `${t.sourceVerification}: ${currentCrop.source_institution} (${currentCrop.verified_date})` : ''}
            </p>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-[#155E34] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#114B29] disabled:opacity-60 min-h-[44px]"
            >
              {creating ? '...' : t.generateSchedule}
            </button>
          </div>
        </form>
      )}

      {/* Active Calendar Switcher */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {calendars.map((cal) => {
            const selected = activeCalendar?.id === cal.id;
            return (
              <button
                key={cal.id}
                onClick={() => setSelectedCalId(cal.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition-colors min-h-[42px] ${
                  selected
                    ? 'bg-[#155E34] text-white border-[#155E34]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Sprout className="w-4 h-4" />
                <span>
                  {lang === 'kn' ? cal.crop_name_kn : cal.crop_name_en} ({cal.variety})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Calendar Details & Schedule */}
      {activeCalendar ? (
        <div className="space-y-5">
          {(() => {
            const nextPending = activeCalendar.tasks
              .filter((tk) => tk.status === 'pending')
              .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
            const doneCount = activeCalendar.tasks.filter((tk) => tk.status === 'completed').length;
            const bullets =
              lang === 'kn'
                ? [
                    `${activeCalendar.crop_name_kn} (${activeCalendar.variety}): ${doneCount}/${activeCalendar.tasks.length} ಹಂತಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ.`,
                    nextPending
                      ? `ಮುಂದಿನ ಜ್ಞಾಪನೆ (${nextPending.due_date}): ${nextPending.title_kn}`
                      : 'ಈ ವೇಳಾಪಟ್ಟಿಯ ಎಲ್ಲಾ ಹಂತಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ.',
                    weather
                      ? weather.spraying_suitable
                        ? 'ಇಂದಿನ ಹವಾಮಾನ ಬೆಳಿಗ್ಗೆ/ಸಂಜೆ ಸಿಂಪಡಣೆಗೆ ಸೂಕ್ತವಾಗಿದೆ.'
                        : weather.spraying_reason_kn
                      : 'ಸ್ಥಳೀಯ ಹವಾಮಾನದ ಆಧಾರದಲ್ಲಿ ನೀರಾವರಿ/ಸಿಂಪಡಣೆ ನಿರ್ಧರಿಸಿ.',
                  ]
                : [
                    `${activeCalendar.crop_name_en} (${activeCalendar.variety}): ${doneCount}/${activeCalendar.tasks.length} stages completed.`,
                    nextPending
                      ? `Next scheduled task (${nextPending.due_date}): ${nextPending.title_en}`
                      : 'All scheduled stages in this calendar are completed.',
                    weather
                      ? weather.spraying_suitable
                        ? 'Current weather is suitable for calm morning/evening spraying.'
                        : weather.spraying_reason_en
                      : 'Verify local moisture before irrigating or spraying.',
                  ];
            return (
              <VoiceSummaryCard
                lang={lang}
                title={
                  lang === 'kn'
                    ? `${activeCalendar.crop_name_kn} ವೇಳಾಪಟ್ಟಿ ಸಾರಾಂಶ`
                    : `${activeCalendar.crop_name_en} Calendar Summary`
                }
                bullets={bullets}
                speechText={bullets.join(' ')}
              />
            );
          })()}

          {/* Attribution & Coverage Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{activeCalendar.taluk}, {activeCalendar.district}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeCalendar.agro_zone}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{t.sowingDate}: {activeCalendar.sowing_date}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {lang === 'kn' ? activeCalendar.crop_name_kn : activeCalendar.crop_name_en} — {activeCalendar.variety}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  {activeCalendar.season} · {activeCalendar.soil_type} · {activeCalendar.irrigation_type}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCustomForm(!showCustomForm)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.addCustomReminder}</span>
                </button>
                <button
                  onClick={() => onDeleteCalendar(activeCalendar.id)}
                  title="Delete calendar"
                  className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 min-h-[38px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Source Attribution */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {t.sourceVerification}: <strong className="text-slate-700">{activeCalendar.source_institution}</strong> ({t.lastVerified}: {activeCalendar.verified_date})
              </span>
              {activeCalendar.source_url && (
                <a
                  href={activeCalendar.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#155E34] font-semibold hover:underline"
                >
                  <span>{lang === 'kn' ? 'ಮೂಲ ಸಂಸ್ಥೆ' : 'Source'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Explicit Limitation Disclosure if any */}
            {(activeCalendar.limitation_note_en || activeCalendar.limitation_note_kn) && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 text-xs text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>{lang === 'kn' ? activeCalendar.limitation_note_kn : activeCalendar.limitation_note_en}</p>
              </div>
            )}

            {/* Custom Reminder Form */}
            {showCustomForm && (
              <form onSubmit={handleCustomSubmit} className="mt-4 pt-4 border-t border-slate-200 grid sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.addCustomReminder}</label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={lang === 'kn' ? 'ಉದಾ: ಕಳೆ ಕೀಳಲು ಕಾರ್ಮಿಕರ ವ್ಯವಸ್ಥೆ' : 'e.g. Check borewell pump & drip laterals'}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.reportedDate}</label>
                  <input
                    type="date"
                    required
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#114B29] min-h-[38px]"
                >
                  {lang === 'kn' ? 'ಸೇರಿಸಿ' : 'Add'}
                </button>
              </form>
            )}
          </div>

          {/* View & Status Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl max-w-full">
              {(['list', 'weekly', 'monthly'] as const).map((vm) => (
                <button
                  key={vm}
                  onClick={() => setViewMode(vm)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] ${
                    viewMode === vm ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {vm === 'list' ? t.viewList : vm === 'weekly' ? t.viewWeekly : t.viewMonthly}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl max-w-full">
              {(['all', 'pending', 'completed', 'missed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'all'
                    ? lang === 'kn' ? 'ಎಲ್ಲಾ' : 'All'
                    : st === 'pending'
                    ? t.statusPending
                    : st === 'completed'
                    ? t.statusCompleted
                    : t.statusMissed}
                </button>
              ))}
            </div>
          </div>

          {/* Tasks Timeline */}
          {viewMode === 'monthly' ? (
            <div className="space-y-4">
              {tasksByMonth.map(([month, tasks]) => (
                <div key={month} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-[#155E34] tabular-nums mb-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    <span>{month}</span>
                  </h3>
                  <div className="divide-y divide-slate-100">
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        lang={lang}
                        weatherIrrigationSkip={!!weatherIrrigationSkip}
                        weatherSprayingUnsuitable={weather ? !weather.spraying_suitable : false}
                        onUpdate={onUpdateTaskStatus}
                        onReschedule={onRescheduleTask}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 px-5">
              {filteredTasks.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {lang === 'kn' ? 'ಈ ಫಿಲ್ಟರ್‌ನಲ್ಲಿ ಯಾವುದೇ ಕಾರ್ಯಗಳಿಲ್ಲ.' : 'No tasks match this filter.'}
                </p>
              ) : (
                filteredTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    lang={lang}
                    weatherIrrigationSkip={!!weatherIrrigationSkip}
                    weatherSprayingUnsuitable={weather ? !weather.spraying_suitable : false}
                    onUpdate={onUpdateTaskStatus}
                    onReschedule={onRescheduleTask}
                  />
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-600">{t.noActiveCalendars}</p>
        </div>
      )}
    </div>
  );
};

const TaskRow: React.FC<{
  task: CalendarTask;
  lang: Lang;
  weatherIrrigationSkip: boolean;
  weatherSprayingUnsuitable: boolean;
  onUpdate: (task: CalendarTask, status: 'pending' | 'completed' | 'missed') => void;
  onReschedule: (task: CalendarTask, newDueDate: string) => void;
}> = ({ task, lang, weatherIrrigationSkip, weatherSprayingUnsuitable, onUpdate, onReschedule }) => {
  const t = useT(lang);
  const showRainNote = task.stage_key === 'irrigation' && weatherIrrigationSkip && task.status === 'pending';
  const showSprayNote = (task.stage_key === 'pest_disease' || task.stage_key === 'weed_management') && weatherSprayingUnsuitable && task.status === 'pending';

  const shiftDueDate = (days: number) => {
    const baseMs = Date.parse(`${task.due_date}T00:00:00Z`);
    const shifted = Number.isNaN(baseMs) ? new Date() : new Date(baseMs + days * 86400000);
    onReschedule(task, shifted.toISOString().slice(0, 10));
  };

  return (
    <div className="py-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
      <div className="space-y-1.5 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-700 tabular-nums">
            {task.stage_number === 99
              ? lang === 'kn' ? 'ಸ್ವಂತ' : 'Custom'
              : task.stage_number === 98
              ? lang === 'kn' ? 'ಎಲೆ ಆರೈಕೆ' : 'Leaf Care'
              : task.stage_number === 97
              ? lang === 'kn' ? 'ಮಣ್ಣು ಯೋಜನೆ' : 'Soil Plan'
              : `${lang === 'kn' ? 'ಹಂತ' : 'Stage'} ${task.stage_number}`}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {task.due_date} {task.end_date !== task.due_date ? `→ ${task.end_date}` : ''}
          </span>
          <span aria-hidden="true">·</span>
          <span
            className={`font-semibold ${
              task.status === 'completed'
                ? 'text-emerald-700'
                : task.status === 'missed'
                ? 'text-red-700'
                : 'text-amber-700'
            }`}
          >
            {task.status === 'completed' ? t.statusCompleted : task.status === 'missed' ? t.statusMissed : t.statusPending}
          </span>
        </div>

        <h4 className={`text-base font-bold ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
          {lang === 'kn' ? task.title_kn : task.title_en}
        </h4>
        <p className="text-sm text-slate-600 leading-relaxed">
          {lang === 'kn' ? task.description_kn : task.description_en}
        </p>

        {(task.inputs_en || task.inputs_kn) && (
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{lang === 'kn' ? 'ಅಗತ್ಯ ಪರಿಕರ/ಪ್ರಮಾಣ:' : 'Inputs:'}</span>{' '}
            {lang === 'kn' ? task.inputs_kn : task.inputs_en}
          </p>
        )}

        {showRainNote && (
          <p className="text-xs font-medium text-blue-800 bg-blue-50 rounded-lg px-2.5 py-1.5 inline-block">
            {lang === 'kn'
              ? 'ಹವಾಮಾನ ಸಲಹೆ: ಮಳೆ ಮುನ್ಸೂಚನೆ ಇರುವುದರಿಂದ ನೀರಾವರಿ ಮುಂದೂಡಬಹುದು.'
              : 'Weather Context: Rain forecast in your taluk — check moisture and skip unnecessary irrigation.'}
          </p>
        )}

        {showSprayNote && (
          <p className="text-xs font-medium text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5 inline-block">
            {lang === 'kn'
              ? 'ಹವಾಮಾನ ಸಲಹೆ: ಗಾಳಿ/ಮಳೆ ಸಂಭವವಿರುವುದರಿಂದ ಸಿಂಪಡಣೆಗೆ ಈಗ ಸೂಕ್ತವಲ್ಲ.'
              : 'Weather Context: Current wind or rain risk makes chemical/foliar spraying unsuitable right now.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {task.status !== 'completed' ? (
          <button
            onClick={() => onUpdate(task, 'completed')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 min-h-[38px] whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t.markComplete}</span>
          </button>
        ) : (
          <button
            onClick={() => onUpdate(task, 'pending')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[38px] whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{t.reopenTask}</span>
          </button>
        )}
        {task.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => shiftDueDate(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 min-h-[38px] whitespace-nowrap"
            >
              <span>{t.snooze1d}</span>
            </button>
            <button
              onClick={() => onUpdate(task, 'missed')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 min-h-[38px] whitespace-nowrap"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{t.markMissed}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
