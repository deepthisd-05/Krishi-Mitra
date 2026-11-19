import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { useT, type Lang } from '../i18n/translations';
import {
  describeMissingTtsVoice,
  getSpeechLocale,
  speakTextWithSpeechSynthesis,
  stopSpeaking,
  type MissingTtsVoiceInfo,
} from '../lib/speech';
import type { CalendarTask, CropCalendar } from '../types';

export interface EnrichedReminderTask extends CalendarTask {
  crop_name_en: string;
  crop_name_kn: string;
  variety: string;
}

interface UpcomingRemindersCardProps {
  lang: Lang;
  calendars: CropCalendar[];
  maxItems?: number;
  onUpdateTaskStatus: (task: CalendarTask, status: 'pending' | 'completed' | 'missed') => Promise<void> | void;
  onRescheduleTask: (task: CalendarTask, newDueDate: string) => Promise<void> | void;
  onNavigateToCalendar?: () => void;
}

function addDaysToIso(isoDate: string, days: number): string {
  const baseMs = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(baseMs)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const shifted = new Date(baseMs + days * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function formatStageTag(stageKey: string, lang: Lang): string {
  const map: Record<string, { en: string; kn: string }> = {
    sowing: { en: 'Sowing', kn: 'ಬಿತ್ತನೆ' },
    weed_management: { en: 'Weeding', kn: 'ಕಳೆ ನಿರ್ವಹಣೆ' },
    top_dressing: { en: 'Top-Dressing', kn: 'ಮೇಲುಗೊಬ್ಬರ' },
    fertilizer: { en: 'Fertilizer', kn: 'ಗೊಬ್ಬರ' },
    irrigation: { en: 'Irrigation', kn: 'ನೀರಾವರಿ' },
    pest_disease: { en: 'Crop Care', kn: 'ಬೆಳೆ ಆರೈಕೆ' },
    harvest: { en: 'Harvest', kn: 'ಕೊಯ್ಲು' },
    leaf_scan_care: { en: 'Leaf Care Step', kn: 'ಎಲೆ ಆರೈಕೆ' },
    soil_input_plan: { en: 'Soil Input Plan', kn: 'ಮಣ್ಣು-ಗೊಬ್ಬರ ಯೋಜನೆ' },
    custom_reminder: { en: 'Custom Reminder', kn: 'ಸ್ವಂತ ಜ್ಞಾಪನೆ' },
  };
  const hit = map[stageKey];
  if (!hit) return lang === 'kn' ? 'ಕೃಷಿ ಹಂತ' : 'Crop Stage';
  return lang === 'kn' ? hit.kn : hit.en;
}

export const UpcomingRemindersCard: React.FC<UpcomingRemindersCardProps> = ({
  lang,
  calendars,
  maxItems = 6,
  onUpdateTaskStatus,
  onRescheduleTask,
  onNavigateToCalendar,
}) => {
  const t = useT(lang);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [missingTts, setMissingTts] = useState<MissingTtsVoiceInfo | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const reminders = useMemo<EnrichedReminderTask[]>(() => {
    return calendars
      .flatMap((c) =>
        c.tasks.map((tk) => ({
          ...tk,
          crop_name_en: c.crop_name_en,
          crop_name_kn: c.crop_name_kn,
          variety: c.variety,
        }))
      )
      .filter((tk) => tk.status === 'pending' && tk.reminder_enabled !== 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, maxItems);
  }, [calendars, maxItems]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    setMissingTts(null);
  }, [lang]);

  const handleReadReminders = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (reminders.length === 0) return;

    const speechText =
      lang === 'kn'
        ? `ಮುಂಬರುವ ಬೆಳೆ ಜ್ಞಾಪನೆಗಳು: ${reminders
            .slice(0, 4)
            .map((r) => `${r.crop_name_kn}, ದಿನಾಂಕ ${r.due_date}: ${r.title_kn}.`)
            .join(' ')}`
        : `Upcoming crop reminders: ${reminders
            .slice(0, 4)
            .map((r) => `${r.crop_name_en} on ${r.due_date}: ${r.title_en}.`)
            .join(' ')}`;

    const res = speakTextWithSpeechSynthesis({
      text: speechText,
      lang,
      rate: 0.95,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
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

  const handleSnooze = async (task: EnrichedReminderTask, days: number) => {
    const anchor = task.due_date < todayStr ? todayStr : task.due_date;
    const nextDate = addDaysToIso(anchor, days);
    await onRescheduleTask(task, nextDate);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#155E34]" />
            <span>{t.upcomingReminders}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === 'kn'
              ? 'ಬಿತ್ತನೆ, ಕಳೆ, ಮೇಲುಗೊಬ್ಬರ, ನೀರಾವರಿ ಮತ್ತು ಎಲೆ ಆರೈಕೆ ಜ್ಞಾಪನೆಗಳು'
              : 'Sowing, weeding, top-dressing, irrigation, leaf-scan care & soil plan milestones'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {reminders.length > 0 && (
            <button
              type="button"
              onClick={handleReadReminders}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 min-h-[40px] whitespace-nowrap"
            >
              {speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>
                {speaking ? t.stopSpeaking : `${t.speakResponse} (${getSpeechLocale(lang)})`}
              </span>
            </button>
          )}
          {onNavigateToCalendar && (
            <button
              type="button"
              onClick={onNavigateToCalendar}
              className="text-xs font-semibold text-[#155E34] hover:underline px-2 py-2 min-h-[40px] whitespace-nowrap"
            >
              {lang === 'kn' ? 'ಪೂರ್ಣ ವೇಳಾಪಟ್ಟಿ →' : 'Full Calendar →'}
            </button>
          )}
        </div>
      </div>

      {missingTts && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-bold">{missingTts.title}</p>
          <p className="mt-0.5">{missingTts.message}</p>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-600">{t.noUpcomingReminders}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {reminders.map((task) => {
            const isOverdue = task.due_date < todayStr;
            const isToday = task.due_date === todayStr;
            const isEditing = editingTaskId === task.id;

            return (
              <div key={task.id} className="py-3.5 space-y-2.5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-semibold text-[#155E34]">
                        {lang === 'kn' ? task.crop_name_kn : task.crop_name_en}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatStageTag(task.stage_key, lang)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums font-medium text-slate-700">{task.due_date}</span>
                      {isOverdue && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-red-700">
                            {lang === 'kn' ? 'ಗಡುವು ಮೀರಿದೆ' : 'Overdue'}
                          </span>
                        </>
                      )}
                      {isToday && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-amber-700">
                            {lang === 'kn' ? 'ಇಂದು' : 'Due Today'}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {lang === 'kn' ? task.title_kn : task.title_en}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                      {lang === 'kn' ? task.description_kn : task.description_en}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateTaskStatus(task, 'completed')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 min-h-[44px] whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.markComplete}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSnooze(task, 1)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                    >
                      <span>{t.snooze1d}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSnooze(task, 3)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                    >
                      <span>{t.snooze3d}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingTaskId(null);
                        } else {
                          setEditingTaskId(task.id);
                          setCustomDate(task.due_date);
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                    >
                      <CalendarClock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{t.reschedule}</span>
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs tabular-nums min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!customDate) return;
                        await onRescheduleTask(task, customDate);
                        setEditingTaskId(null);
                      }}
                      className="rounded-xl bg-[#155E34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114B29] min-h-[44px]"
                    >
                      {lang === 'kn' ? 'ದಿನಾಂಕ ಉಳಿಸಿ' : 'Save Date'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(null)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 min-h-[44px]"
                    >
                      {lang === 'kn' ? 'ರದ್ದು' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
